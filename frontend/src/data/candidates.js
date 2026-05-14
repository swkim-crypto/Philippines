// ══════════════════════════════════════════════════════
//  Nam Ngiep Basin — 댐 후보지 데이터 & 계산 함수
//  SHP/TIF 로딩 후 backend API가 이 데이터를 보강합니다.
// ══════════════════════════════════════════════════════

export const ANALYSIS_INFO = {
  basin: { id: 'NAM_NGIEP', name: 'Nam Ngiep Basin' },
  analysisDate: new Date().toISOString().slice(0, 10),
  demSource: 'SRTM 30m',
  method: 'DEM 기반 자동 분석',
  criterion: '최소 저수량 5Mm³',
}

export const HEIGHT_STEPS = [40, 50, 60, 70, 80, 90, 100, 110, 120]

export const PRIORITY_CONFIG = {
  '최우선': { color: '#00c4b4', rank: 1 },
  '우선':   { color: '#1D9E75', rank: 2 },
  '검토필요': { color: '#f0a500', rank: 3 },
  '보류':   { color: '#E05C5C', rank: 4 },
}

// ── 후보지 목록 ──────────────────────────────────────
// 실제 운영 시: backend /api/candidates 에서 로드
// 여기에 기재된 값은 SHP 속성 + 전처리 결과값
export const CANDIDATES = [
  // ── Middle Basin ─────────────────────────────────
  {
    id: 'S47',    region: 'Middle Basin',
    priority: '검토필요',
    lat: 19.3491, lon: 103.3398,
    bed: 1076,    baseH: 50,  baseFsl: 1126, baseV: 1155.7, baseArea: 0,
    hMin5: 50,
    upland_skm: 3200, dis_av_cms: 148,
    note: 'Auto-generated candidate site',
    // 댐 벽체 좌표 [lon, lat, alt] × 5점 (역사다리꼴)
    wallCoords: [
      [103.3375, 19.3470, 1126], [103.3421, 19.3470, 1126],
      [103.3398, 19.3491, 1076],
      [103.3421, 19.3512, 1126], [103.3375, 19.3512, 1126],
    ],
  },
  {
    id: 'S12',    region: 'Middle Basin',
    priority: '최우선',
    lat: 19.2850, lon: 103.4100,
    bed: 980,     baseH: 60,  baseFsl: 1040, baseV: 2340.0, baseArea: 12.5,
    hMin5: 40,
    upland_skm: 2800, dis_av_cms: 130,
    note: '주요 지류 합류점 상류, 지형 협착부',
    wallCoords: [
      [103.4075, 19.2828, 1040], [103.4125, 19.2828, 1040],
      [103.4100, 19.2850, 980],
      [103.4125, 19.2872, 1040], [103.4075, 19.2872, 1040],
    ],
  },
  {
    id: 'S23',    region: 'Middle Basin',
    priority: '우선',
    lat: 19.3120, lon: 103.3780,
    bed: 1020,    baseH: 70,  baseFsl: 1090, baseV: 1876.0, baseArea: 9.2,
    hMin5: 55,
    upland_skm: 1950, dis_av_cms: 95,
    note: '협곡 지형, 댐 길이 단축 유리',
    wallCoords: [
      [103.3755, 19.3098, 1090], [103.3805, 19.3098, 1090],
      [103.3780, 19.3120, 1020],
      [103.3805, 19.3142, 1090], [103.3755, 19.3142, 1090],
    ],
  },

  // ── Upper Basin ───────────────────────────────────
  {
    id: 'S31',    region: 'Upper Basin',
    priority: '우선',
    lat: 19.4800, lon: 103.2500,
    bed: 1180,    baseH: 80,  baseFsl: 1260, baseV: 3120.0, baseArea: 22.0,
    hMin5: 45,
    upland_skm: 1200, dis_av_cms: 58,
    note: '상류 저류, 홍수 조절 효과 우수',
    wallCoords: [
      [103.2475, 19.4778, 1260], [103.2525, 19.4778, 1260],
      [103.2500, 19.4800, 1180],
      [103.2525, 19.4822, 1260], [103.2475, 19.4822, 1260],
    ],
  },
  {
    id: 'S38',    region: 'Upper Basin',
    priority: '검토필요',
    lat: 19.5200, lon: 103.2100,
    bed: 1240,    baseH: 60,  baseFsl: 1300, baseV: 890.0,  baseArea: 5.8,
    hMin5: 75,
    upland_skm: 650, dis_av_cms: 31,
    note: '소유역, 저수량 제한적',
    wallCoords: [
      [103.2075, 19.5178, 1300], [103.2125, 19.5178, 1300],
      [103.2100, 19.5200, 1240],
      [103.2125, 19.5222, 1300], [103.2075, 19.5222, 1300],
    ],
  },

  // ── Lower Valley ──────────────────────────────────
  {
    id: 'S05',    region: 'Lower Valley',
    priority: '최우선',
    lat: 18.9800, lon: 103.5500,
    bed: 820,     baseH: 90,  baseFsl: 910,  baseV: 4520.0, baseArea: 38.0,
    hMin5: 35,
    upland_skm: 5500, dis_av_cms: 260,
    note: '본류 최적 지점, 대규모 저수 가능',
    wallCoords: [
      [103.5470, 18.9778, 910],  [103.5530, 18.9778, 910],
      [103.5500, 18.9800, 820],
      [103.5530, 18.9822, 910],  [103.5470, 18.9822, 910],
    ],
  },
  {
    id: 'S08',    region: 'Lower Valley',
    priority: '우선',
    lat: 19.0500, lon: 103.5100,
    bed: 860,     baseH: 80,  baseFsl: 940,  baseV: 2980.0, baseArea: 25.0,
    hMin5: 50,
    upland_skm: 4800, dis_av_cms: 228,
    note: '지류 합류 전, 독립 저류 가능',
    wallCoords: [
      [103.5075, 19.0478, 940],  [103.5125, 19.0478, 940],
      [103.5100, 19.0500, 860],
      [103.5125, 19.0522, 940],  [103.5075, 19.0522, 940],
    ],
  },

  // ── Xieng Khouang Highland ────────────────────────
  {
    id: 'S55',    region: 'Xieng Khouang Highland',
    priority: '검토필요',
    lat: 19.6100, lon: 103.1500,
    bed: 1320,    baseH: 50,  baseFsl: 1370, baseV: 620.0,  baseArea: 3.2,
    hMin5: 90,
    upland_skm: 380, dis_av_cms: 18,
    note: '고원 소유역, 관개 목적 소규모 적합',
    wallCoords: [
      [103.1475, 19.6078, 1370], [103.1525, 19.6078, 1370],
      [103.1500, 19.6100, 1320],
      [103.1525, 19.6122, 1370], [103.1475, 19.6122, 1370],
    ],
  },
]

// ── 계산 함수 ────────────────────────────────────────

/**
 * 저수량 추정 (Mm³)
 * baseArea가 있으면 사다리꼴 근사, 없으면 power law
 */
export function estimateVolume(c, heightM) {
  if (c.baseArea != null && c.baseArea > 0) {
    // 면적-고도 관계: A ∝ h^1.4 (일반 하천 계곡 경험식)
    const ratio = (heightM / c.baseH) ** 1.4
    return Math.round(c.baseV * ratio)
  }
  // 근사치: V ∝ h^2.2
  return Math.round(c.baseV * (heightM / c.baseH) ** 2.2)
}

/**
 * 수몰 면적 추정 (km²)
 */
export function estimateArea(c, heightM) {
  if (c.baseArea == null) return null
  const ratio = (heightM / c.baseH) ** 1.1
  return Math.round(c.baseArea * ratio * 10) / 10
}

/**
 * 만수위 FSL 계산
 */
export function calcFsl(c, heightM) {
  return c.bed != null ? c.bed + heightM : (c.baseFsl ?? 0) + (heightM - c.baseH)
}

/**
 * E-ratio (저수량 / 수몰면적) — 효율 지수
 */
export function calcEfficiency(vol, area) {
  if (!area || area <= 0) return null
  return Math.round((vol / area) * 10) / 10
}

/**
 * 증발 손실 (Mm³/yr) — 연간 증발량 1,500mm/yr 가정
 */
export function estimateEvap(area) {
  if (area == null) return null
  return Math.round(area * 1.5 * 10) / 10
}
