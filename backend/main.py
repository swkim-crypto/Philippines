"""
Philippines Dam Analysis — FastAPI Backend v5
핵심: 댐 축선 기반 상류 판별 → 정확한 수몰 시뮬레이션
신버전: 7개 댐 (하부 3 + 상부 4), 상부댐 /simulate 지원
"""

import json
import logging
import numpy as np
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ── 경로 ────────────────────────────────────────
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
            return p
    return None

# ── 의존성 ───────────────────────────────────────
try:
    import rasterio
    from rasterio.warp import transform, transform_geom
    from rasterio.features import shapes
    from scipy import ndimage
    from shapely.geometry import shape, mapping, LineString, MultiPolygon
    from shapely.ops import unary_union
    RASTER_OK = True
    logger.info("✅ rasterio + scipy + shapely 로드 성공")
except ImportError as e:
    RASTER_OK = False
    logger.warning(f"⚠️ {e}")

# ════════════════════════════════════════════════
# 댐 설정 — 신버전 7개 (shp 기준 확정)
# 하부댐 3개: CBC_lower, CBBC_lower, CPC_lower
# 상부댐 4개: CBC_upper1, CBBC_upper1, CBBC_upper2, CPC_upper
#
# upstream_sign: +1 = 법선벡터 방향이 상류
#                -1 = 법선벡터 반대방향이 상류
# drop: 양수발전 낙차(m), 상부댐만 해당
# radius_upper: 상부댐 반경 (1.5km)
# ════════════════════════════════════════════════
DAM_CONFIG = {
    # ── 하부댐 (저수댐) ───────────────────────
    "CBC_LOWER": {
        "lat": 16.689502, "lon": 120.560422, "bed": 210.1,
        "p1": [120.561152, 16.690074], "p2": [120.559692, 16.688929],
        "upstream_sign": 1,
        "dam_type": "lower", "cat": "CBC",
    },
    "CBBC_LOWER": {
        "lat": 16.670846, "lon": 120.574715, "bed": 303.5,
        "p1": [120.574269, 16.670602], "p2": [120.575161, 16.671090],
        "upstream_sign": -1,
        "dam_type": "lower", "cat": "CBBC",
    },
    "CPC_LOWER": {
        "lat": 16.649049, "lon": 120.597031, "bed": 394.2,
        "p1": [120.597568, 16.650130], "p2": [120.596494, 16.647967],
        "upstream_sign": 1,
        "dam_type": "lower", "cat": "CPC",
    },
    # ── 상부댐 (양수댐) ───────────────────────
    "CBC_UPPER1": {
        "lat": 16.695180, "lon": 120.569439, "bed": 796.0,
        "p1": [120.568558, 16.693905], "p2": [120.570319, 16.696455],
        "upstream_sign": -1,
        "dam_type": "upper", "cat": "CBC", "drop": 585,
        "radius": 1500,
    },
    "CBBC_UPPER1": {
        "lat": 16.679076, "lon": 120.580453, "bed": 945.9,
        "p1": [120.579602, 16.680462], "p2": [120.581304, 16.677690],
        "upstream_sign": 1,
        "dam_type": "upper", "cat": "CBBC", "drop": 642,
        "radius": 1500,
    },
    "CBBC_UPPER2": {
        "lat": 16.659115, "lon": 120.557391, "bed": 910.6,
        "p1": [120.556440, 16.658544], "p2": [120.558342, 16.659686],
        "upstream_sign": -1,
        "dam_type": "upper", "cat": "CBBC", "drop": 607,
        "radius": 1500,
    },
    "CPC_UPPER": {
        "lat": 16.632673, "lon": 120.596876, "bed": 926.7,
        "p1": [120.595274, 16.632655], "p2": [120.598478, 16.632690],
        "upstream_sign": 1,
        "dam_type": "upper", "cat": "CPC", "drop": 532,
        "radius": 1500,
    },
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    tif = find_tif()
    logger.info(f"TIF: {tif or '없음'} | raster_ok={RASTER_OK}")
    yield


app = FastAPI(title="Philippines Dam Analysis API", version="5.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ════════════════════════════════════════════════
# /simulate/{dam_id}?height=50
# ════════════════════════════════════════════════
@app.get("/simulate/{dam_id}")
def simulate(dam_id: str, height: float = Query(..., gt=0, le=300)):
    # 프론트 id (CBC_lower) → 백엔드 키 (CBC_LOWER)
    key = dam_id.upper().replace("-", "_")
    dam = DAM_CONFIG.get(key)
    if not dam:
        raise HTTPException(404, f"댐 '{dam_id}' 없음. 가능: {list(DAM_CONFIG.keys())}")
    if not RASTER_OK:
        raise HTTPException(503, "rasterio/scipy 미설치")
    tif = find_tif()
    if not tif:
        raise HTTPException(503, "DEM TIF 없음")

    fsl = round(dam["bed"] + height, 1)
    sign = dam["upstream_sign"]

    # 캐시 확인 — 파일명에 sign 포함으로 upstream_sign 변경 시 자동 무효화
    cache_file = CACHE_DIR / f"sim_{key}_{int(height)}_s{sign}.json"
    if cache_file.exists():
        logger.info(f"캐시: {cache_file.name}")
        return JSONResponse(json.loads(cache_file.read_text()))

    try:
        result = _simulate(tif, dam, key, fsl)
        cache_file.write_text(json.dumps(result, ensure_ascii=False))
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"시뮬레이션 오류 [{key}]: {e}", exc_info=True)
        raise HTTPException(500, str(e))


def _simulate(tif_path, dam, dam_id, fsl):
    """
    댐 축선 기반 상류 수몰 시뮬레이션 (하부댐·상부댐 공통)
    1. 분석 범위 추출 (댐 중심 ±radius)
       - 하부댐: dam_len*4, 최대 4km
       - 상부댐: 1.5km 고정 (candidates.js reservoirCoords와 일치)
    2. 수몰 마스크 (DEM ≤ FSL)
    3. 상류 마스크 (댐 축선 법선 기준)
    4. 상류 수몰 = 수몰 ∩ 상류
    5. 연결 성분 (댐 바로 상류 픽셀에서 시작)
    6. 폴리곤 변환 + 면적/저수량
    7. 상부댐: 발전량 추정 (P = 9.8 × Q × H × η)
    """
    with rasterio.open(tif_path) as src:
        crs = src.crs

        # ── 댐 축선 UTM 변환 ──────────────────────
        p1_wgs = dam["p1"]  # [lon, lat]
        p2_wgs = dam["p2"]
        xs, ys = transform("EPSG:4326", crs,
                           [p1_wgs[0], p2_wgs[0]],
                           [p1_wgs[1], p2_wgs[1]])
        ax1 = np.array([xs[0], ys[0]])  # UTM
        ax2 = np.array([xs[1], ys[1]])

        # 댐 중심 UTM
        cx_utm = (ax1[0] + ax2[0]) / 2
        cy_utm = (ax1[1] + ax2[1]) / 2

        # 분석 반경
        dam_len = np.linalg.norm(ax2 - ax1)
        is_upper = dam.get("dam_type") == "upper"
        if is_upper:
            # 상부댐: 1.5km 고정 (reservoirCoords 샘플링 반경과 동일)
            radius = dam.get("radius", 1500)
        else:
            # 하부댐: 기존 로직 유지
            radius = min(max(dam_len * 4, 2000), 4000)

        # ── 윈도우 추출 ───────────────────────────
        left   = cx_utm - radius
        right  = cx_utm + radius
        bottom = cy_utm - radius
        top    = cy_utm + radius

        row_min, col_min = src.index(left,  top)
        row_max, col_max = src.index(right, bottom)
        row_min = max(0, row_min); col_min = max(0, col_min)
        row_max = min(src.height-1, row_max)
        col_max = min(src.width-1,  col_max)
        if row_max <= row_min or col_max <= col_min:
            raise ValueError("분석 범위가 TIF 밖")

        from rasterio.windows import Window
        window = Window(col_min, row_min,
                        col_max - col_min,
                        row_max - row_min)
        dem = src.read(1, window=window).astype(np.float32)
        t   = src.window_transform(window)  # affine
        nodata = src.nodata

        if nodata is not None:
            dem[dem == nodata] = np.nan
        dem[np.abs(dem) > 9000] = np.nan

        h, w = dem.shape

        # ── 픽셀 좌표 그리드 (UTM) — 메모리 최적화 ──
        cols = np.arange(w, dtype=np.float32)
        rows = np.arange(h, dtype=np.float32)
        px = (t.c + cols * t.a).astype(np.float32)
        py = (t.f + rows * t.e).astype(np.float32)

        # ── 댐 축선 법선으로 상류/하류 판별 ──────
        dv = ax2 - ax1
        nv = np.array([-dv[1], dv[0]], dtype=np.float64)
        nv = nv / np.linalg.norm(nv)

        sign_map = ((px - ax1[0]) * nv[0]).reshape(1, w) + \
                   ((py - ax1[1]) * nv[1]).reshape(h, 1)

        upstream_sign = dam["upstream_sign"]
        upstream_mask = sign_map * upstream_sign > 0

        # ── 수몰 마스크 ───────────────────────────
        flood_mask = (~np.isnan(dem)) & (dem <= fsl) & upstream_mask

        # ── 연결 성분 — 댐 바로 상류 시드 ────────
        pixel_size = abs(t.a)
        seed_ent   = None
        for dist_m in range(int(pixel_size), int(radius/2), int(pixel_size*2)):
            sx_utm = cx_utm + nv[0] * upstream_sign * dist_m
            sy_utm = cy_utm + nv[1] * upstream_sign * dist_m
            sr = int((sy_utm - t.f) / t.e)
            sc = int((sx_utm - t.c) / t.a)
            if 0 <= sr < h and 0 <= sc < w and flood_mask[sr, sc]:
                seed_ent = (sr, sc)
                break

        if seed_ent is None:
            logger.warning(f"{dam_id}: 시드 픽셀 없음 (FSL={fsl}m)")
            return _empty_result(dam_id, fsl, dam)

        # 연결 성분 레이블링
        labeled, _ = ndimage.label(flood_mask)
        target_label = labeled[seed_ent[0], seed_ent[1]]
        if target_label == 0:
            return _empty_result(dam_id, fsl, dam)

        connected = (labeled == target_label).astype(np.uint8)

        # ── 면적 계산 ─────────────────────────────
        pixel_area = pixel_size ** 2  # m²
        n_pixels   = int(connected.sum())
        area_m2    = n_pixels * pixel_area
        area_km2   = round(area_m2 / 1e6, 4)

        # ── 저수량 계산 ───────────────────────────
        depth      = np.where(connected, np.clip(fsl - dem, 0, None), 0)
        volume_m3  = float(np.nansum(depth) * pixel_area)
        volume_mm3 = round(volume_m3 / 1e6, 3)

        # ── 폴리곤 변환 ───────────────────────────
        geojson_features = []
        if n_pixels > 0:
            raw_shapes = list(shapes(connected, transform=t))
            polys = [shape(g) for g, v in raw_shapes if v == 1]
            if polys:
                merged = unary_union(polys)
                min_area = area_m2 * 0.01
                if merged.geom_type == 'MultiPolygon':
                    merged = MultiPolygon([p for p in merged.geoms if p.area >= min_area])
                simplified = merged.simplify(pixel_size * 2, preserve_topology=True)
                wgs_geom = transform_geom(crs, "EPSG:4326", mapping(simplified))
                geojson_features = [{
                    "type": "Feature",
                    "geometry": wgs_geom,
                    "properties": {
                        "dam_id": dam_id, "fsl": fsl,
                        "area_km2": area_km2, "volume_mm3": volume_mm3,
                    }
                }]

        # ── 발전량 추정 (상부댐만) ─────────────────
        # P = 9.8 × Q × H × η
        # Q: 저수량(Mm³)을 연간 유효 가동시간(2000h) 기준으로 환산
        # η = 0.85 (펌프-터빈 효율)
        power_mw = None
        energy_gwh = None
        if is_upper:
            drop = dam.get("drop", 0)
            if drop > 0 and volume_mm3 > 0:
                eta = 0.85
                op_hours = 2000  # 연간 유효 발전 시간(h)
                q_m3s = (volume_mm3 * 1e6) / (op_hours * 3600)  # m³/s
                power_mw  = round(9.8 * q_m3s * drop * eta / 1000, 1)   # MW
                energy_gwh = round(power_mw * op_hours / 1000, 1)        # GWh/yr

        logger.info(
            f"✅ {dam_id} FSL={fsl}m | {n_pixels}px | {area_km2}km² | "
            f"{volume_mm3}Mm³" + (f" | {power_mw}MW" if power_mw else "")
        )

        result = {
            "dam_id":      dam_id,
            "fsl":         fsl,
            "area_km2":    area_km2,
            "volume_mm3":  volume_mm3,
            "n_pixels":    n_pixels,
            "dam_type":    dam.get("dam_type", "lower"),
            "source":      "api",
            "flood_geojson": {
                "type":     "FeatureCollection",
                "features": geojson_features,
            },
        }
        if power_mw is not None:
            result["drop_m"]     = dam.get("drop")
            result["power_mw"]   = power_mw
            result["energy_gwh"] = energy_gwh

        return result


def _empty_result(dam_id, fsl, dam=None):
    result = {
        "dam_id": dam_id, "fsl": fsl,
        "area_km2": 0, "volume_mm3": 0, "n_pixels": 0,
        "dam_type": dam.get("dam_type", "lower") if dam else "lower",
        "source": "api",
        "flood_geojson": {"type":"FeatureCollection","features":[]},
    }
    if dam and dam.get("dam_type") == "upper":
        result["drop_m"]     = dam.get("drop")
        result["power_mw"]   = 0
        result["energy_gwh"] = 0
    return result


# ── 기타 ─────────────────────────────────────────
@app.get("/")
def root():
    tif = find_tif()
    lower = [k for k,v in DAM_CONFIG.items() if v.get("dam_type")=="lower"]
    upper = [k for k,v in DAM_CONFIG.items() if v.get("dam_type")=="upper"]
    return {
        "service":    "Philippines Dam Analysis API",
        "version":    "5.0.0",
        "tif_ready":  tif is not None,
        "tif_path":   str(tif) if tif else None,
        "raster_ok":  RASTER_OK,
        "lower_dams": lower,
        "upper_dams": upper,
    }

@app.get("/candidates")
def get_candidates():
    p = CACHE_DIR / "candidates.json"
    if p.exists():
        return JSONResponse(json.loads(p.read_text()))
    raise HTTPException(404, "candidates.json 없음")

@app.get("/profile/{dam_id}")
def get_profile(dam_id: str):
    p = CACHE_DIR / f"profile_{dam_id.upper()}.json"
    if p.exists():
        return JSONResponse(json.loads(p.read_text()))
    raise HTTPException(404, f"profile_{dam_id}.json 없음")

@app.delete("/cache/{dam_id}")
def clear_cache(dam_id: str):
    """특정 댐 시뮬레이션 캐시 삭제 (파라미터 변경 시)"""
    key = dam_id.upper().replace("-", "_")
    deleted = []
    for f in CACHE_DIR.glob(f"sim_{key}_*.json"):
        f.unlink(); deleted.append(f.name)
    return {"deleted": deleted}

@app.delete("/cache")
def clear_all_cache():
    """전체 캐시 삭제"""
    deleted = []
    for f in CACHE_DIR.glob("sim_*.json"):
        f.unlink(); deleted.append(f.name)
    return {"deleted": deleted}
