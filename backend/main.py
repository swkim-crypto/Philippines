"""
Philippines Dam Analysis — FastAPI Backend v4
핵심: 댐 축선 기반 상류 판별 → 정확한 수몰 시뮬레이션
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
# 댐 설정 — 축선 좌표 + 상류 방향
# upstream_sign: +1 = 법선벡터 방향이 상류
#                -1 = 법선벡터 반대방향이 상류
# ════════════════════════════════════════════════
DAM_CONFIG = {
    "CBC1": {
        "lat":16.688357, "lon":120.561701, "bed":238.7,
        "p1":[120.562099,16.693558], "p2":[120.561303,16.683156],
        "upstream_sign": 1,
    },
    "CBC2": {
        "lat":16.685894, "lon":120.563513, "bed":234.1,
        "p1":[120.559751,16.682262], "p2":[120.567274,16.689527],
        "upstream_sign": -1,
    },
    "CBBC": {
        "lat":16.672048, "lon":120.572825, "bed":316.8,
        "p1":[120.56651,16.669431], "p2":[120.579141,16.674665],
        "upstream_sign": -1,
    },
    "CPC": {
        "lat":16.647905, "lon":120.601756, "bed":422.3,
        "p1":[120.593028,16.646491], "p2":[120.610485,16.649319],
        "upstream_sign": -1,
    },
    "SA1_lower": {
        "lat":16.648413, "lon":120.598798, "bed":479.3,
        "p1":[120.607474,16.653048], "p2":[120.590123,16.643777],
        "upstream_sign": 1,
    },
    "SA1_upper": {
        "lat":16.656707, "lon":120.613079, "bed":1124.6,
        "p1":[120.622102,16.667096], "p2":[120.604057,16.646318],
        "upstream_sign": 1,
    },
    "SA2_lower": {
        "lat":16.665908, "lon":120.576886, "bed":506.0,
        "p1":[120.568215,16.660338], "p2":[120.585557,16.671477],
        "upstream_sign": -1,
    },
    "SA2_upper": {
        "lat":16.660367, "lon":120.562758, "bed":1225.6,
        "p1":[120.54889,16.658168], "p2":[120.576628,16.662565],
        "upstream_sign": -1,
    },
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    tif = find_tif()
    logger.info(f"TIF: {tif or '없음'} | raster_ok={RASTER_OK}")
    yield


app = FastAPI(title="Philippines Dam Analysis API", version="4.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ════════════════════════════════════════════════
# /simulate/{dam_id}?height=50
# ════════════════════════════════════════════════
@app.get("/simulate/{dam_id}")
def simulate(dam_id: str, height: float = Query(..., gt=0, le=300)):
    dam_id = dam_id.upper()
    dam = DAM_CONFIG.get(dam_id)
    if not dam:
        raise HTTPException(404, f"댐 '{dam_id}' 없음. 가능: {list(DAM_CONFIG.keys())}")
    if not RASTER_OK:
        raise HTTPException(503, "rasterio/scipy 미설치")
    tif = find_tif()
    if not tif:
        raise HTTPException(503, "DEM TIF 없음")

    fsl = round(dam["bed"] + height, 1)

    # 캐시 확인
    cache_file = CACHE_DIR / f"sim_{dam_id}_{int(height)}.json"
    if cache_file.exists():
        logger.info(f"캐시: {cache_file.name}")
        return JSONResponse(json.loads(cache_file.read_text()))

    try:
        result = _simulate(tif, dam, dam_id, fsl)
        cache_file.write_text(json.dumps(result, ensure_ascii=False))
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"시뮬레이션 오류 [{dam_id}]: {e}", exc_info=True)
        raise HTTPException(500, str(e))


def _simulate(tif_path, dam, dam_id, fsl):
    """
    댐 축선 기반 상류 수몰 시뮬레이션
    1. 분석 범위 추출 (댐 중심 ±radius)
    2. 수몰 마스크 (DEM ≤ FSL)
    3. 상류 마스크 (댐 축선 법선 기준)
    4. 상류 수몰 = 수몰 ∩ 상류
    5. 연결 성분 (댐 바로 상류 픽셀에서 시작)
    6. 폴리곤 변환 + 면적/저수량
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

        # 분석 반경: 최대 4km (메모리 최적화 — 5m픽셀 기준 ~10MB)
        dam_len = np.linalg.norm(ax2 - ax1)
        radius  = min(max(dam_len * 4, 2000), 4000)

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

        # broadcasting 으로 meshgrid 없이 계산 (메모리 절약)
        # sign_map[r,c] = (px[c]-ax1[0])*nv[0] + (py[r]-ax1[1])*nv[1]
        sign_map = ((px - ax1[0]) * nv[0]).reshape(1, w) + \
                   ((py - ax1[1]) * nv[1]).reshape(h, 1)

        # 상류 마스크
        upstream_sign = dam["upstream_sign"]
        upstream_mask = sign_map * upstream_sign > 0

        # ── 수몰 마스크 ───────────────────────────
        flood_mask = (~np.isnan(dem)) & (dem <= fsl) & upstream_mask

        # ── 연결 성분 — 댐 바로 상류 시드 ────────
        # 시드: 축선 중점에서 상류 방향으로 1픽셀~50픽셀 탐색
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
            logger.warning(f"{dam_id}: 시드 픽셀 없음 (FSL={fsl}m, 수위가 너무 낮을 수 있음)")
            return _empty_result(dam_id, fsl)

        # 연결 성분 레이블링
        labeled, _ = ndimage.label(flood_mask)
        target_label = labeled[seed_ent[0], seed_ent[1]]
        if target_label == 0:
            return _empty_result(dam_id, fsl)

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
                # 작은 파편 제거 (전체 면적의 1% 미만)
                min_area = area_m2 * 0.01
                if merged.geom_type == 'MultiPolygon':
                    merged = MultiPolygon([p for p in merged.geoms if p.area >= min_area])
                # 단순화 (픽셀 크기의 2배)
                simplified = merged.simplify(pixel_size * 2, preserve_topology=True)
                # UTM → WGS84
                wgs_geom = transform_geom(crs, "EPSG:4326", mapping(simplified))
                geojson_features = [{
                    "type": "Feature",
                    "geometry": wgs_geom,
                    "properties": {
                        "dam_id": dam_id, "fsl": fsl,
                        "area_km2": area_km2, "volume_mm3": volume_mm3,
                    }
                }]

        logger.info(f"✅ {dam_id} FSL={fsl}m | {n_pixels}px | {area_km2}km² | {volume_mm3}Mm³")

        return {
            "dam_id":      dam_id,
            "fsl":         fsl,
            "area_km2":    area_km2,
            "volume_mm3":  volume_mm3,
            "n_pixels":    n_pixels,
            "flood_geojson": {
                "type":     "FeatureCollection",
                "features": geojson_features,
            }
        }


def _empty_result(dam_id, fsl):
    return {
        "dam_id": dam_id, "fsl": fsl,
        "area_km2": 0, "volume_mm3": 0, "n_pixels": 0,
        "flood_geojson": {"type":"FeatureCollection","features":[]},
    }


# ── 기타 ─────────────────────────────────────────
@app.get("/")
def root():
    tif = find_tif()
    return {
        "service":   "Philippines Dam Analysis API",
        "version":   "4.0.0",
        "tif_ready": tif is not None,
        "tif_path":  str(tif) if tif else None,
        "raster_ok": RASTER_OK,
        "dams":      list(DAM_CONFIG.keys()),
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
    deleted = []
    for f in CACHE_DIR.glob(f"sim_{dam_id.upper()}_*.json"):
        f.unlink(); deleted.append(f.name)
    return {"deleted": deleted}

@app.delete("/cache")
def clear_all_cache():
    """전체 캐시 삭제"""
    deleted = []
    for f in CACHE_DIR.glob("sim_*.json"):
        f.unlink(); deleted.append(f.name)
    return {"deleted": deleted}
