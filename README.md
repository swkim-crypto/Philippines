# Nam Ngiep 댐 후보지 분석 시스템 v2.1

3패널 구조 — Cesium 3D 지구 + 좌측 후보지 목록 + 우측 상세 분석

```
[Sidebar]  [Cesium 3D Globe]  [DetailPanel]
 후보지      댐 벽체 + 수몰면    높이 슬라이더
 목록        실시간 렌더링       DEM 프로파일
                               저수량 계산
```

---

## 기술 스택

| Layer    | 기술 |
|----------|------|
| Frontend | React 18 + Vite + Cesium 1.117 |
| Backend  | Python 3.11 · FastAPI |
| 지오처리  | geopandas · rasterio · shapely |
| 배포     | Render (Static + Web Service) |
| 데이터   | SHP (저수면) + TIF (SRTM DEM) |

---

## 데이터 준비

```
backend/data/
├── shp/
│   ├── candidates.shp       # 댐 후보지 포인트 (속성: id, region, priority, bed, baseH, baseV, ...)
│   ├── reservoir_S47.shp    # S47 저수면 폴리곤 (선택)
│   └── ...
└── tif/
    └── nam_ngiep_dem.tif    # SRTM 30m DEM (GeoTIFF, EPSG:4326)
```

### candidates.shp 속성 컬럼

| 컬럼 | 설명 |
|------|------|
| id | 댐 ID (S47, S05, ...) |
| region | 지역 (Middle Basin, ...) |
| priority | 우선순위 (최우선, 우선, 검토필요, 보류) |
| bed | 하상 고도 (m EL) |
| baseH | 기준 높이 (m) |
| baseFsl | 기준 FSL (m EL) |
| baseV | 기준 저수량 (Mm³) |
| baseArea | 기준 수몰 면적 (km²) |
| hMin5 | 5Mm³ 달성 최소 높이 (m) |
| note | 비고 |

---

## 전처리 (SHP/TIF → JSON 캐시)

```bash
cd nam-ngiep
pip install geopandas rasterio numpy shapely

python backend/preprocess.py
```

생성 파일 (`backend/data/cache/`):
- `candidates.json` — 후보지 목록
- `profile_S47.json` — DEM 단면 데이터
- `damLengths.json` — 댐 마루 길이

---

## 로컬 개발

```bash
# 백엔드
cd nam-ngiep
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000

# 프론트엔드 (별도 터미널)
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

`.env` (frontend/):
```
VITE_API_URL=http://localhost:8000
VITE_CESIUM_TOKEN=your_cesium_ion_token
```

---

## Render 배포

### 1. GitHub 푸시

```bash
git add .
git commit -m "v2.1 initial"
git push origin main
```

### 2. Render 환경변수 (Frontend)

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://nam-ngiep-backend.onrender.com` |
| `VITE_CESIUM_TOKEN` | Cesium Ion 토큰 |

### 3. 데이터 업로드 (Backend Disk)

Render 대시보드 → `nam-ngiep-backend` → Disk → `/opt/render/project/src/backend/data` 에 SHP/TIF 업로드 후:

```bash
# Render Shell에서 전처리 실행
python backend/preprocess.py
```

---

## API 엔드포인트

| 엔드포인트 | 방식 | 기능 |
|-----------|------|------|
| `/` | GET | 서버 상태 |
| `/candidates` | GET | 후보지 목록 (JSON) |
| `/profile/{dam_id}` | GET | DEM 횡단면 + 종단면 |
| `/flood-surface/{dam_id}?water_level=1156` | GET | 수몰면 GeoJSON |

---

## 주요 수정 이력

- **v2.1**: SHP/TIF 백엔드 처리, 3패널 레이아웃, Cesium 벽체+수몰면 렌더링
- **v2.0**: Cesium Terrain.fromWorldTerrain() 비동기 수정, 폴백 수몰면
