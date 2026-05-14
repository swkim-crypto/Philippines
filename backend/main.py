"""
Philippines Dam Analysis — FastAPI Backend
/simulate: DEM 기반 수몰 시뮬레이션 (rasterio + shapely)
"""

import json
import logging
import numpy as np
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ── 경로 설정 ────────────────────────────────────
# /data/tif/dem.tif (Render Disk) 우선, 없으면 로컬 경로
TIF_PATHS = [
    Path("/data/tif/dem.tif"),
    Path(__file__).parent / "data/tif/dem.tif",
    Path(__file__).parent / "data/tif/AbraCatchment_IfSAR-DTM_UTM51N.tif",
]
CACHE_DIR = Path(__file__).parent / "data/cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

def find_tif():
    for p in TIF_PATHS:
        if p.exists():
            logger.info(f"TIF 발견: {p}")
            return p
    return None

# ── 의존성 ───────────────────────────────────────
try:
    import rasterio
    from rasterio.warp import transform
    from rasterio.windows import Window
    from rasterio.features import shapes
    from rasterio.transform import from_bounds
    import scipy.ndimage
    RASTER_OK = True
    logger.info("✅ rasterio 로드 성공")
except ImportError:
    RASTER_OK = False
    logger.warning("⚠️ rasterio 없음")

try:
    from shapely.geometry import shape, mapping
    from shapely.ops import unary_union
    SHAPELY_OK = True
except ImportError:
    SHAPELY_OK = False

# ── 댐 후보지 데이터 ──────────────────────────────
DAM_DATA = {
    "CBC1":      {"lat":16.6857, "lon":120.5640, "bed":238.7},
    "CBC2":      {"lat":16.6832, "lon":120.5646, "bed":234.1},
    "CBBC":      {"lat":16.6694, "lon":120.5752, "bed":316.8},
    "CPC":       {"lat":16.6458, "lon":120.6046, "bed":422.3},
    "SA1_lower": {"lat":16.6474, "lon":120.6007, "bed":479.3},
    "SA1_upper": {"lat":16.6530, "lon":120.6136, "bed":1124.6},
    "SA2_lower": {"lat":16.6651, "lon":120.5803, "bed":506.0},
    "SA2_upper": {"lat":16.6537, "lon":120.5581, "bed":1225.6},
}

# ── FastAPI ──────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    tif = find_tif()
    if tif:
        logger.info(f"✅ TIF 준비: {tif}")
    else:
        logger.warning("⚠️ TIF 파일 없음 — /data/tif/dem.tif 필요")
    yield

app = FastAPI(title="Philippines Dam Analysis API", version="3.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ════════════════════════════════════════════════
# 핵심 API: /simulate
# ════════════════════════════════════════════════
@app.get("/simulate/{dam_id}")
def simulate(
    dam_id: str,
    height: float = Query(..., description="댐 높이 (m)"),
):
    """
    DEM 기반 수몰 시뮬레이션
    반환: { fsl, flood_geojson, area_km2, volume_mm3 }
    """
    dam_id = dam_id.upper()
    dam = DAM_DATA.get(dam_id)
    if not dam:
        raise HTTPException(404, f"댐 ID '{dam_id}' 없음")

    if not RASTER_OK:
        raise HTTPException(503, "rasterio 미설치")

    tif_path = find_tif()
    if not tif_path:
        raise HTTPException(503, "DEM TIF 없음 — /data/tif/dem.tif 업로드 필요")

    fsl = round(dam["bed"] + height, 1)
    lat, lon = dam["lat"], dam["lon"]

    # 캐시 확인
    cache_key = f"sim_{dam_id}_{int(height)}"
    cache_file = CACHE_DIR / f"{cache_key}.json"
    if cache_file.exists():
        logger.info(f"캐시 반환: {cache_key}")
        return JSONResponse(json.loads(cache_file.read_text()))

    try:
        result = _run_simulation(tif_path, lat, lon, fsl, dam_id)
        cache_file.write_text(json.dumps(result, ensure_ascii=False))
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"시뮬레이션 오류: {e}")
        raise HTTPException(500, str(e))


def _run_simulation(tif_path, lat, lon, fsl, dam_id):
    """DEM에서 FSL 이하 픽셀 추출 → 폴리곤 변환 → 면적/저수량 계산"""

    with rasterio.open(tif_path) as src:
        # 댐 중심 UTM 좌표
        xs, ys = transform("EPSG:4326", src.crs, [lon], [lat])
        cx, cy = xs[0], ys[0]

        # 분석 범위: 댐 중심 ±5km
        radius_m = 5000
        left   = cx - radius_m
        right  = cx + radius_m
        bottom = cy - radius_m
        top    = cy + radius_m

        # 픽셀 윈도우
        row_min, col_min = src.index(left,  top)
        row_max, col_max = src.index(right, bottom)
        row_min = max(0, row_min); col_min = max(0, col_min)
        row_max = min(src.height, row_max); col_max = min(src.width, col_max)

        window = Window(col_min, row_min, col_max-col_min, row_max-row_min)
        dem    = src.read(1, window=window).astype(float)
        nodata = src.nodata or -9999
        win_transform = src.window_transform(window)

        # nodata 마스킹
        dem[dem == nodata] = np.nan
        dem[np.abs(dem) > 9000] = np.nan

        # 수몰 마스크: DEM ≤ FSL
        flood_mask = (dem <= fsl) & (~np.isnan(dem))

        # 연결 성분 — 댐 위치와 연결된 영역만
        from scipy import ndimage
        labeled, _ = ndimage.label(flood_mask)
        dam_row = int(cy - win_transform.f) // int(-win_transform.e) if win_transform.e < 0 else 0
        dam_col = int(cx - win_transform.c) // int(win_transform.a)
        dam_row = max(0, min(dam_row, dem.shape[0]-1))
        dam_col = max(0, min(dam_col, dem.shape[1]-1))
        dam_label = labeled[dam_row, dam_col]

        if dam_label > 0:
            connected_mask = (labeled == dam_label).astype(np.uint8)
        else:
            connected_mask = flood_mask.astype(np.uint8)

        # 면적 계산 (m²)
        pixel_area_m2 = abs(win_transform.a * win_transform.e)
        flooded_pixels = int(connected_mask.sum())
        area_m2  = flooded_pixels * pixel_area_m2
        area_km2 = round(area_m2 / 1e6, 3)

        # 저수량 계산 (Mm³): Σ(FSL - DEM) × pixel_area
        depth = np.where(connected_mask, fsl - dem, 0)
        depth = np.clip(depth, 0, None)
        volume_m3  = float(np.nansum(depth) * pixel_area_m2)
        volume_mm3 = round(volume_m3 / 1e6, 2)

        # 폴리곤 변환 (shapely + rasterio.features)
        geojson_features = []
        if SHAPELY_OK and flooded_pixels > 0:
            geoms = list(shapes(connected_mask, transform=win_transform))
            polys = [shape(g) for g, v in geoms if v == 1]
            if polys:
                merged = unary_union(polys).simplify(15)  # 15m 단순화
                # UTM → WGS84
                from rasterio.warp import transform_geom
                wgs_geom = transform_geom(src.crs, "EPSG:4326", mapping(merged))
                geojson_features = [{
                    "type": "Feature",
                    "geometry": wgs_geom,
                    "properties": {"dam_id": dam_id, "fsl": fsl, "area_km2": area_km2}
                }]

        logger.info(f"{dam_id} FSL={fsl}m area={area_km2}km² vol={volume_mm3}Mm³")

        return {
            "dam_id":   dam_id,
            "fsl":      fsl,
            "area_km2": area_km2,
            "volume_mm3": volume_mm3,
            "flood_geojson": {
                "type": "FeatureCollection",
                "features": geojson_features,
            }
        }


# ── 기타 엔드포인트 ──────────────────────────────
@app.get("/")
def root():
    tif = find_tif()
    return {
        "service": "Philippines Dam Analysis API v3",
        "tif_ready": tif is not None,
        "tif_path": str(tif) if tif else None,
        "raster_ok": RASTER_OK,
        "dams": list(DAM_DATA.keys()),
    }

@app.get("/candidates")
def get_candidates():
    cache = CACHE_DIR / "candidates.json"
    if cache.exists():
        return JSONResponse(json.loads(cache.read_text()))
    raise HTTPException(404, "candidates.json 없음")

@app.get("/profile/{dam_id}")
def get_profile(dam_id: str):
    cache = CACHE_DIR / f"profile_{dam_id.upper()}.json"
    if cache.exists():
        return JSONResponse(json.loads(cache.read_text()))
    raise HTTPException(404, f"profile_{dam_id}.json 없음")

@app.delete("/cache/{dam_id}")
def clear_cache(dam_id: str):
    """높이별 캐시 초기화 (데이터 변경 시)"""
    deleted = []
    for f in CACHE_DIR.glob(f"sim_{dam_id.upper()}_*.json"):
        f.unlink()
        deleted.append(f.name)
    return {"deleted": deleted}
