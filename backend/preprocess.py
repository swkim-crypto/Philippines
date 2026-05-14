"""
preprocess.py — SHP / TIF 전처리 스크립트
==========================================
배포 전 또는 데이터 업데이트 시 한 번 실행:

    python backend/preprocess.py

생성 결과 (backend/data/cache/):
    candidates.json          후보지 목록
    profile_DAMID.json       각 댐 DEM 단면 (cross + long)
    damLengths.json          댐 마루 길이

실행 환경:
    pip install geopandas rasterio numpy shapely
"""

import json
import sys
import logging
from pathlib import Path

import numpy as np

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

BASE   = Path(__file__).parent
DATA   = BASE / "data"
SHP    = DATA / "shp"
TIF    = DATA / "tif"
CACHE  = DATA / "cache"
CACHE.mkdir(parents=True, exist_ok=True)

# ── 의존성 확인 ─────────────────────────────────
try:
    import geopandas as gpd
    from shapely.geometry import LineString, Point
    GEO_OK = True
except ImportError:
    GEO_OK = False
    log.warning("geopandas 미설치 — SHP 처리 건너뜀")

try:
    import rasterio
    from rasterio.windows import Window
    RASTER_OK = True
except ImportError:
    RASTER_OK = False
    log.warning("rasterio 미설치 — TIF 처리 건너뜀")


# ══════════════════════════════════════════════════
# 1. 후보지 SHP → candidates.json
# ══════════════════════════════════════════════════
def build_candidates():
    if not GEO_OK:
        log.warning("geopandas 없음, 건너뜀")
        return

    shp_files = list(SHP.glob("candidates*.shp")) + list(SHP.glob("dam_site*.shp"))
    if not shp_files:
        log.warning("candidates SHP 파일 없음 — data/shp/ 에 넣어주세요")
        return

    gdf = gpd.read_file(shp_files[0]).to_crs("EPSG:4326")
    candidates = []

    for _, row in gdf.iterrows():
        geom = row.geometry
        if geom is None:
            continue
        lon = float(geom.x if geom.geom_type == "Point" else geom.centroid.x)
        lat = float(geom.y if geom.geom_type == "Point" else geom.centroid.y)

        # 벽체 좌표 계산 (간단한 역사다리꼴, 필요 시 별도 SHP로 교체)
        wall = _make_wall_coords(lon, lat, _sf(row.get("baseFsl") or row.get("base_fsl"), 900), _sf(row.get("bed"), 900))

        c = {
            "id":         str(row.get("id", row.get("DAM_ID", "?"))),
            "region":     str(row.get("region", "Unknown")),
            "priority":   str(row.get("priority", "검토필요")),
            "lat":        round(lat, 6),
            "lon":        round(lon, 6),
            "bed":        _sf(row.get("bed")),
            "baseH":      _sf(row.get("baseH", row.get("base_h", 60))) or 60,
            "baseFsl":    _sf(row.get("baseFsl", row.get("base_fsl"))),
            "baseV":      _sf(row.get("baseV",   row.get("base_v", 0))) or 0,
            "baseArea":   _sf(row.get("baseArea", row.get("base_area"))),
            "hMin5":      _sf(row.get("hMin5",   row.get("h_min5", 60))) or 60,
            "upland_skm": _sf(row.get("upland_skm")),
            "dis_av_cms": _sf(row.get("dis_av_cms")),
            "note":       str(row.get("note", "Auto-generated candidate site")),
            "wallCoords": wall,
        }
        candidates.append(c)

    out = CACHE / "candidates.json"
    out.write_text(json.dumps(candidates, ensure_ascii=False, indent=2))
    log.info(f"✅ candidates.json 생성 ({len(candidates)}개)")


def _make_wall_coords(lon, lat, fsl, bed):
    """역사다리꼴 댐 벽체 5점 좌표 (간이 생성)"""
    dx = 0.0025  # ~250m
    dy = 0.0020
    return [
        [lon - dx, lat - dy, fsl],
        [lon + dx, lat - dy, fsl],
        [lon,      lat,      bed],
        [lon + dx, lat + dy, fsl],
        [lon - dx, lat + dy, fsl],
    ]


# ══════════════════════════════════════════════════
# 2. DEM TIF → profile_DAMID.json
# ══════════════════════════════════════════════════
def build_profiles():
    if not RASTER_OK:
        log.warning("rasterio 없음, 건너뜀")
        return

    cand_path = CACHE / "candidates.json"
    if not cand_path.exists():
        log.warning("candidates.json 없음 — 먼저 build_candidates() 실행")
        return

    candidates = json.loads(cand_path.read_text())
    tif_files  = list(TIF.glob("*.tif"))
    if not tif_files:
        log.warning("TIF 파일 없음 — data/tif/ 에 넣어주세요")
        return

    tif_path = max(tif_files, key=lambda p: p.stat().st_size)
    log.info(f"DEM: {tif_path.name}")

    with rasterio.open(tif_path) as src:
        for c in candidates:
            lat, lon = c["lat"], c["lon"]
            bed = c.get("bed") or 900
            dam_id = c["id"]

            cross = extract_cross(src, lat, lon, range_m=5000,  step_m=50)
            long_ = extract_long( src, lat, lon, range_m=60000, step_m=100, bed=bed)

            result = {"cross": cross, "long": long_}
            out = CACHE / f"profile_{dam_id.upper()}.json"
            out.write_text(json.dumps(result, ensure_ascii=False))
            log.info(f"  → profile_{dam_id}.json (cross={len(cross)}, long={len(long_)})")


def extract_cross(src, lat, lon, range_m=5000, step_m=50):
    deg_lon = 1 / (111320 * max(np.cos(np.radians(lat)), 0.001))
    step_d  = step_m * deg_lon
    pts = []
    for lo in np.arange(lon - range_m * deg_lon, lon + range_m * deg_lon + step_d, step_d):
        elev = _sample(src, lo, lat)
        if elev is not None:
            d_m = (lo - lon) / deg_lon
            pts.append({"d": round(d_m), "elev": round(elev, 1)})
    return pts


def extract_long(src, lat, lon, range_m=60000, step_m=100, bed=900):
    deg_lat = 1 / 110540
    step_d  = step_m * deg_lat
    pts = []
    for la in np.arange(lat, lat + range_m * deg_lat, step_d):
        elev = _sample(src, lon, la)
        if elev is not None:
            d_m = (la - lat) / deg_lat
            pts.append({"d": round(d_m), "elev": round(elev, 1)})
    return pts


def _sample(src, lon, lat):
    try:
        row, col = src.index(lon, lat)
        if 0 <= row < src.height and 0 <= col < src.width:
            val = src.read(1, window=Window(col, row, 1, 1))[0][0]
            if val != src.nodata and not np.isnan(float(val)):
                return float(val)
    except Exception:
        pass
    return None


# ══════════════════════════════════════════════════
# 3. 댐 마루 길이 → damLengths.json
# ══════════════════════════════════════════════════
def build_dam_lengths():
    """
    횡단면 프로파일에서 각 높이별 댐 마루 길이 계산.
    캐시 profile_DAMID.json이 있어야 동작.
    """
    result = {}
    height_steps = [40, 50, 60, 70, 80, 90, 100, 110, 120]

    cand_path = CACHE / "candidates.json"
    if not cand_path.exists():
        return

    candidates = json.loads(cand_path.read_text())

    for c in candidates:
        dam_id = c["id"]
        profile_path = CACHE / f"profile_{dam_id.upper()}.json"
        if not profile_path.exists():
            continue

        profile = json.loads(profile_path.read_text())
        cross   = profile.get("cross", [])
        bed     = c.get("bed") or 0
        if not cross:
            continue

        dam_lengths = {}
        for h in height_steps:
            fsl   = bed + h
            left  = [p for p in cross if p["d"] <= 0][::-1]
            right = [p for p in cross if p["d"] >= 0]

            lEdge = _find_edge(left, fsl)
            rEdge = _find_edge(right, fsl)

            if lEdge is not None and rEdge is not None:
                dam_lengths[str(h)] = int(abs(rEdge - lEdge))

        if dam_lengths:
            result[dam_id] = dam_lengths
            log.info(f"  댐 마루 길이: {dam_id} → {dam_lengths}")

    out = CACHE / "damLengths.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    log.info(f"✅ damLengths.json 생성")


def _find_edge(pts, fsl):
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        if a["elev"] <= fsl < b["elev"] and b["elev"] != a["elev"]:
            return a["d"] + (fsl - a["elev"]) / (b["elev"] - a["elev"]) * (b["d"] - a["d"])
    return None


# ══════════════════════════════════════════════════
def _sf(v, default=None):
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


# ══════════════════════════════════════════════════
if __name__ == "__main__":
    log.info("=== Nam Ngiep 전처리 시작 ===")
    log.info(f"SHP 디렉터리: {SHP}")
    log.info(f"TIF 디렉터리: {TIF}")
    log.info(f"캐시 출력:    {CACHE}")

    build_candidates()
    build_profiles()
    build_dam_lengths()

    log.info("=== 완료 ===")
    log.info("생성 파일:")
    for f in sorted(CACHE.glob("*.json")):
        log.info(f"  {f.name}  ({f.stat().st_size:,} bytes)")
