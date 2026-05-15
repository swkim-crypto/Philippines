import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
# ════════════════════════════════════════════════════════════
# main.py 추가 코드 ─ 댐 축선 + GEE/IfSAR 고도 API
# 기존 DAM_CONFIG 아래에 DAM_AXES 추가,
# 기존 @app.get("/") 라우터들과 함께 등록
# ════════════════════════════════════════════════════════════

# ── DAM_AXES: shapefile에서 추출한 모든 댐 축선 ──────────────
DAM_AXES = {
    "CBC_upper1": {
        "category": "CBC", "type": "upper", "label": "CBC 상부1",
        "p1": [120.568558, 16.693905], "p2": [120.570319, 16.696455],
        "center": [120.569439, 16.695180], "axis_length_m": 344,
    },
    "CBC_upper2": {
        "category": "CBC", "type": "upper", "label": "CBC 상부2",
        "p1": [120.579602, 16.680462], "p2": [120.581304, 16.677690],
        "center": [120.580453, 16.679076], "axis_length_m": 361,
    },
    "CBC_lower": {
        "category": "CBC", "type": "lower", "label": "CBC 하부",
        "p1": [120.559692, 16.688929], "p2": [120.561152, 16.690074],
        "center": [120.560422, 16.689502], "axis_length_m": 206,
    },
    "CBBC_upper1": {
        "category": "CBBC", "type": "upper", "label": "CBBC 상부1",
        "p1": [120.579602, 16.680462], "p2": [120.581304, 16.677690],
        "center": [120.580453, 16.679076], "axis_length_m": 361,
    },
    "CBBC_upper2": {
        "category": "CBBC", "type": "upper", "label": "CBBC 상부2",
        "p1": [120.556440, 16.658544], "p2": [120.558342, 16.659686],
        "center": [120.557391, 16.659115], "axis_length_m": 246,
    },
    "CBBC_lower": {
        "category": "CBBC", "type": "lower", "label": "CBBC 하부",
        "p1": [120.574269, 16.670602], "p2": [120.575161, 16.671090],
        "center": [120.574715, 16.670846], "axis_length_m": 113,
    },
    "CPC_upper": {
        "category": "CPC", "type": "upper", "label": "CPC 상부",
        "p1": [120.595274, 16.632655], "p2": [120.598478, 16.632690],
        "center": [120.596876, 16.632673], "axis_length_m": 356,
    },
    "CPC_lower": {
        "category": "CPC", "type": "lower", "label": "CPC 하부",
        "p1": [120.597568, 16.650130], "p2": [120.596494, 16.647967],
        "center": [120.597031, 16.649049], "axis_length_m": 268,
    },
}


def _sample_dem_point(lon: float, lat: float) -> float | None:
    """로컬 IfSAR DEM에서 단일 포인트 고도 추출 (GEE fallback용)"""
    tif = find_tif()
    if not tif or not RASTER_OK:
        return None
    try:
        with rasterio.open(tif) as src:
            row, col = rowcol(src.transform, lon, lat)
            val = float(src.read(1)[row, col])
            return val if val != src.nodata else None
    except Exception as e:
        logger.warning(f"DEM 샘플링 실패 ({lon},{lat}): {e}")
        return None


def _get_elevations_gee(points: list[tuple]) -> list[float | None]:
    """
    GEE SRTM에서 여러 포인트 고도 일괄 추출
    points: [(lon, lat), ...]
    """
    try:
        import ee
        srtm = ee.Image("USGS/SRTMGL1_003")
        results = []
        for lon, lat in points:
            pt = ee.Geometry.Point([lon, lat])
            val = srtm.sample(pt, 30).first().get("elevation").getInfo()
            results.append(float(val) if val is not None else None)
        return results
    except Exception as e:
        logger.warning(f"GEE 고도 추출 실패: {e}")
        return [None] * len(points)


@app.get("/dam-axes")
def get_all_dam_axes():
    """
    모든 댐 축선 목록 + 끝점 고도 반환
    Cesium DamWall 컴포넌트 초기화에 사용
    """
    axes_list = []
    for dam_id, info in DAM_AXES.items():
        p1_lon, p1_lat = info["p1"]
        p2_lon, p2_lat = info["p2"]

        # GEE 우선, 실패 시 IfSAR fallback
        elevs = _get_elevations_gee([(p1_lon, p1_lat), (p2_lon, p2_lat)])
        p1_elev, p2_elev = elevs

        if p1_elev is None:
            p1_elev = _sample_dem_point(p1_lon, p1_lat)
        if p2_elev is None:
            p2_elev = _sample_dem_point(p2_lon, p2_lat)

        elev_source = "GEE_SRTM" if elevs[0] is not None else "IfSAR_local"
        bed_elev = min(v for v in [p1_elev, p2_elev] if v is not None) if any(
            v is not None for v in [p1_elev, p2_elev]
        ) else None

        axes_list.append({
            "id": dam_id,
            **info,
            "p1_elev": round(p1_elev, 1) if p1_elev is not None else None,
            "p2_elev": round(p2_elev, 1) if p2_elev is not None else None,
            "bed_elev": round(bed_elev, 1) if bed_elev is not None else None,
            "elev_source": elev_source,
        })

    return {"axes": axes_list, "count": len(axes_list)}


@app.get("/dam-axes/{dam_id}")
def get_dam_axis(dam_id: str):
    """특정 댐 축선 상세 (높이 계산용)"""
    info = DAM_AXES.get(dam_id)
    if not info:
        raise HTTPException(404, f"'{dam_id}' 없음. 가능: {list(DAM_AXES.keys())}")

    p1_lon, p1_lat = info["p1"]
    p2_lon, p2_lat = info["p2"]

    elevs = _get_elevations_gee([(p1_lon, p1_lat), (p2_lon, p2_lat)])
    p1_elev = elevs[0] or _sample_dem_point(p1_lon, p1_lat)
    p2_elev = elevs[1] or _sample_dem_point(p2_lon, p2_lat)
    bed_elev = min(v for v in [p1_elev, p2_elev] if v is not None)

    return {
        "id": dam_id,
        **info,
        "p1_elev": round(p1_elev, 1) if p1_elev else None,
        "p2_elev": round(p2_elev, 1) if p2_elev else None,
        "bed_elev": round(bed_elev, 1) if bed_elev else None,
        "elev_source": "GEE_SRTM" if elevs[0] else "IfSAR_local",
    }
