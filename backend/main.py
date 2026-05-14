"""
Nam Ngiep Dam Analysis — FastAPI Backend
SHP(저수면) → GeoJSON, TIF(DEM) → 단면 프로파일, 후보지 목록 API
"""

import os
import json
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── 데이터 경로 ──────────────────────────────────
DATA_DIR   = Path(__file__).parent / "data"
SHP_DIR    = DATA_DIR / "shp"          # SHP 파일 위치
TIF_DIR    = DATA_DIR / "tif"          # DEM TIF 파일 위치
CACHE_DIR  = DATA_DIR / "cache"        # 전처리 JSON 캐시

for d in [SHP_DIR, TIF_DIR, CACHE_DIR]:
    d.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ── 조건부 임포트 ────────────────────────────────
try:
    import fiona
    import geopandas as gpd
    from shapely.geometry import mapping
    GEO_OK = True
    logger.info("✅ geopandas / fiona 로드 성공")
except ImportError:
    GEO_OK = False
    logger.warning("⚠️  geopandas 없음 — SHP 처리 비활성화")

try:
    import rasterio
    from rasterio.windows import Window
    RASTER_OK = True
    logger.info("✅ rasterio 로드 성공")
except ImportError:
    RASTER_OK = False
    logger.warning("⚠️  rasterio 없음 — TIF 처리 비활성화")


# ── FastAPI ──────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("서버 시작")
    # 캐시 미리 빌드 (선택)
    _prebuild_cache()
    yield
    logger.info("서버 종료")


app = FastAPI(
    title="Nam Ngiep Dam Analysis API",
    version="2.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════
# 엔드포인트
# ══════════════════════════════════════════════════

@app.get("/")
def root():
    return {
        "service": "Nam Ngiep Dam Analysis API",
        "version": "2.1.0",
        "geo_ok": GEO_OK,
        "raster_ok": RASTER_OK,
        "data_dir": str(DATA_DIR),
        "shp_files":  [f.name for f in SHP_DIR.glob("*.shp")],
        "tif_files":  [f.name for f in TIF_DIR.glob("*.tif")],
    }


# ── 1. 후보지 목록 ───────────────────────────────
@app.get("/candidates")
def get_candidates():
    """
    SHP 속성 테이블에서 후보지 목록 반환.
    SHP 없으면 404 → 프론트엔드가 정적 데이터 사용.
    """
    cache_path = CACHE_DIR / "candidates.json"
    if cache_path.exists():
        return JSONResponse(json.loads(cache_path.read_text()))

    if not GEO_OK:
        raise HTTPException(503, "geopandas 미설치")

    # candidates.shp 검색
    shp_files = list(SHP_DIR.glob("candidates*.shp")) + list(SHP_DIR.glob("dam_site*.shp"))
    if not shp_files:
        raise HTTPException(404, "candidates SHP 파일 없음")

    gdf = gpd.read_file(shp_files[0]).to_crs("EPSG:4326")
    candidates = []
    for _, row in gdf.iterrows():
        geom = row.geometry
        if geom is None:
            continue
        lon = float(geom.x) if geom.geom_type == "Point" else float(geom.centroid.x)
        lat = float(geom.y) if geom.geom_type == "Point" else float(geom.centroid.y)

        c = {
            "id":       str(row.get("id", row.get("DAM_ID", "?"))),
            "region":   str(row.get("region", row.get("REGION", "Unknown"))),
            "priority": str(row.get("priority", row.get("PRIORITY", "검토필요"))),
            "lat":      round(lat, 6),
            "lon":      round(lon, 6),
            "bed":      _safe_float(row.get("bed")),
            "baseH":    _safe_float(row.get("baseH", row.get("base_h", 60))) or 60,
            "baseFsl":  _safe_float(row.get("baseFsl", row.get("base_fsl"))),
            "baseV":    _safe_float(row.get("baseV", row.get("base_v", 0))) or 0,
            "baseArea": _safe_float(row.get("baseArea", row.get("base_area"))),
            "hMin5":    _safe_float(row.get("hMin5", row.get("h_min5", 60))) or 60,
            "upland_skm": _safe_float(row.get("upland_skm")),
            "dis_av_cms": _safe_float(row.get("dis_av_cms")),
            "note":     str(row.get("note", row.get("NOTE", "Auto-generated"))),
        }
        candidates.append(c)

    # 캐시 저장
    cache_path.write_text(json.dumps(candidates, ensure_ascii=False, indent=2))
    return JSONResponse(candidates)


# ── 2. DEM 단면 프로파일 ─────────────────────────
@app.get("/profile/{dam_id}")
def get_profile(
    dam_id: str,
    cross_range_km: float = Query(5.0,  ge=1,  le=20),
    long_range_km:  float = Query(60.0, ge=10, le=120),
    sample_m:       int   = Query(50,   ge=10, le=200),
):
    """
    DEM TIF → 횡단면(cross) + 종단면(long) 반환.
    캐시 파일 있으면 즉시 반환.
    """
    cache_path = CACHE_DIR / f"profile_{dam_id.upper()}.json"
    if cache_path.exists():
        return JSONResponse(json.loads(cache_path.read_text()))

    if not RASTER_OK:
        raise HTTPException(503, "rasterio 미설치")

    # 후보지 좌표 조회
    info = _get_candidate_info(dam_id)
    if not info:
        raise HTTPException(404, f"댐 ID '{dam_id}' 없음")

    tif_files = list(TIF_DIR.glob("*.tif"))
    if not tif_files:
        raise HTTPException(404, "DEM TIF 파일 없음")

    # 가장 큰 TIF (커버리지가 넓을 가능성)
    tif_path = max(tif_files, key=lambda p: p.stat().st_size)

    lat, lon = info["lat"], info["lon"]
    bed = info.get("bed") or 900

    cross = _extract_cross_section(tif_path, lat, lon, cross_range_km * 1000, sample_m)
    long_ = _extract_long_section(tif_path, lat, lon, long_range_km * 1000, sample_m, bed)

    result = {"cross": cross, "long": long_}
    cache_path.write_text(json.dumps(result, ensure_ascii=False))
    return JSONResponse(result)


# ── 3. 수몰면 GeoJSON ────────────────────────────
@app.get("/flood-surface/{dam_id}")
def get_flood_surface(
    dam_id:      str,
    water_level: float = Query(..., description="FSL (m EL)"),
):
    """
    SHP 저수면 레이어에서 해당 댐·수위에 맞는 폴리곤 반환.
    SHP 없으면 단순 버퍼 근사값 반환.
    """
    dam_id = dam_id.upper()
    info   = _get_candidate_info(dam_id)

    # SHP 검색: reservoir_DAMID.shp 또는 flood_DAMID.shp
    patterns = [f"reservoir_{dam_id}.shp", f"flood_{dam_id}.shp",
                f"reservoir*.shp", "flood*.shp"]
    shp_path = None
    if GEO_OK:
        for pat in patterns:
            found = list(SHP_DIR.glob(pat))
            if found:
                shp_path = found[0]
                break

    if shp_path and shp_path.exists():
        return _load_flood_shp(shp_path, dam_id, water_level)

    # SHP 없음 → 근사 GeoJSON
    if not info:
        raise HTTPException(404, f"댐 ID '{dam_id}' 없음")

    return _make_approx_flood(info, water_level)


# ══════════════════════════════════════════════════
# 내부 함수
# ══════════════════════════════════════════════════

def _safe_float(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _get_candidate_info(dam_id: str) -> Optional[dict]:
    """캐시 → SHP → None 순으로 후보지 정보 조회"""
    cache_path = CACHE_DIR / "candidates.json"
    if cache_path.exists():
        candidates = json.loads(cache_path.read_text())
        for c in candidates:
            if c["id"].upper() == dam_id.upper():
                return c
    return None


def _prebuild_cache():
    """서버 시작 시 캐시 파일이 없으면 빌드 시도"""
    try:
        # candidates 캐시
        if not (CACHE_DIR / "candidates.json").exists():
            try:
                get_candidates()
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"캐시 사전 빌드 실패: {e}")


def _extract_cross_section(tif_path: Path, lat: float, lon: float,
                            range_m: float, sample_m: int) -> list:
    """TIF에서 E-W 횡단면 추출"""
    pts = []
    try:
        with rasterio.open(tif_path) as src:
            # 픽셀 크기 (도)
            res_x = abs(src.res[0])  # 경도 방향
            res_y = abs(src.res[1])  # 위도 방향
            deg_per_m_lon = 1 / (111320 * np.cos(np.radians(lat)))
            deg_per_m_lat = 1 / 110540

            # range_m를 도로 변환
            lon_range = range_m * deg_per_m_lon
            step_lon  = sample_m * deg_per_m_lon

            lons = np.arange(lon - lon_range, lon + lon_range + step_lon, step_lon)
            for lo in lons:
                row, col = src.index(lo, lat)
                if 0 <= row < src.height and 0 <= col < src.width:
                    val = src.read(1, window=Window(col, row, 1, 1))[0][0]
                    if val != src.nodata and not np.isnan(val):
                        d_m = (lo - lon) / deg_per_m_lon
                        pts.append({"d": round(d_m), "elev": round(float(val), 1)})
    except Exception as e:
        logger.error(f"횡단면 추출 오류: {e}")
    return pts


def _extract_long_section(tif_path: Path, lat: float, lon: float,
                           range_m: float, sample_m: int, bed_elev: float) -> list:
    """TIF에서 상류 방향 종단면 추출 (간단히 N 방향으로 근사)"""
    pts = []
    try:
        with rasterio.open(tif_path) as src:
            deg_per_m_lat = 1 / 110540
            step_lat = sample_m * deg_per_m_lat
            lat_range = range_m * deg_per_m_lat

            lats = np.arange(lat, lat + lat_range, step_lat)
            for i, la in enumerate(lats):
                row, col = src.index(lon, la)
                if 0 <= row < src.height and 0 <= col < src.width:
                    val = src.read(1, window=Window(col, row, 1, 1))[0][0]
                    if val != src.nodata and not np.isnan(val):
                        d_m = (la - lat) / deg_per_m_lat
                        pts.append({"d": round(d_m), "elev": round(float(val), 1)})
    except Exception as e:
        logger.error(f"종단면 추출 오류: {e}")
    return pts


def _load_flood_shp(shp_path: Path, dam_id: str, water_level: float) -> dict:
    """SHP에서 수몰면 폴리곤 필터링 → GeoJSON"""
    gdf = gpd.read_file(shp_path).to_crs("EPSG:4326")

    # water_level 컬럼 필터 (있으면)
    wl_cols = [c for c in gdf.columns if "wl" in c.lower() or "level" in c.lower() or "fsl" in c.lower()]
    if wl_cols:
        # 가장 가까운 수위 선택
        wl_col = wl_cols[0]
        unique_wls = gdf[wl_col].dropna().unique()
        if len(unique_wls):
            nearest_wl = min(unique_wls, key=lambda v: abs(v - water_level))
            gdf = gdf[gdf[wl_col] == nearest_wl]

    geojson = json.loads(gdf.to_json())
    # 속성 보강
    for feat in geojson.get("features", []):
        feat["properties"]["dam_id"]     = dam_id
        feat["properties"]["water_level"] = water_level
    return JSONResponse(geojson)


def _make_approx_flood(info: dict, water_level: float) -> dict:
    """SHP 없을 때 타원형 근사 GeoJSON 반환"""
    lat, lon = info["lat"], info["lon"]
    bed = info.get("bed") or water_level - 60
    base_h = info.get("baseH") or 60

    ratio  = max(0.1, (water_level - bed) / max(base_h, 1))
    r_km   = min(18, 3.5 * ratio)

    coords = []
    for a in range(0, 361, 4):
        rad = np.radians(a)
        coords.append([
            round(lon + r_km / 111 * np.cos(rad), 6),
            round(lat + r_km / 111 * np.sin(rad) * 0.65, 6),
        ])

    geojson = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": { "type": "Polygon", "coordinates": [coords] },
            "properties": {
                "dam_id":      info["id"],
                "water_level": water_level,
                "source":      "approx_ellipse",
            },
        }],
    }
    return JSONResponse(geojson)
