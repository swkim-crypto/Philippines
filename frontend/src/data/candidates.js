// ══════════════════════════════════════════════════════
//  Philippines — Abra Basin 댐 후보지 데이터 & 계산 함수
//  IfSAR DTM 5m 기반 전처리 결과
// ══════════════════════════════════════════════════════

export const ANALYSIS_INFO = {
  basin: { id: 'PHILIPPINES', name: 'Abra Basin' },
  analysisDate: new Date().toISOString().slice(0, 10),
  demSource: 'IfSAR 5m',
  method: 'DEM 기반 자동 분석',
  criterion: '최소 저수량 5Mm³',
}

export const HEIGHT_STEPS = [20, 30, 40, 50, 60, 70, 80, 90, 100, 120]

export const PRIORITY_CONFIG = {
  '최우선': { color: '#00c4b4', rank: 1 },
  '우선':   { color: '#1D9E75', rank: 2 },
  '검토필요': { color: '#f0a500', rank: 3 },
  '보류':   { color: '#E05C5C', rank: 4 },
}

export const CANDIDATES = [
  // ── Abra Basin ───────────────────────────────────
  {
    id: 'CBC1', region: 'Abra Basin', priority: '최우선',
    lat: 16.6857, lon: 120.5640,
    bed: 238.7, baseH: 50, baseFsl: 288.7, baseV: 5.8, baseArea: 0.29,
    hMin5: 50, upland_skm: null, dis_av_cms: null,
    note: 'IfSAR DTM 5m 기반 자동 분석. 하상고도 238.7m EL.',
    wallCoords: [
      [120.5620, 16.6842, 288.7], [120.5660, 16.6842, 288.7],
      [120.5640, 16.6857, 238.7],
      [120.5660, 16.6872, 288.7], [120.5620, 16.6872, 288.7],
    ],
  },
  {
    id: 'CBC2', region: 'Abra Basin', priority: '우선',
    lat: 16.6832, lon: 120.5646,
    bed: 234.1, baseH: 50, baseFsl: 284.1, baseV: 8.6, baseArea: 0.43,
    hMin5: 30, upland_skm: null, dis_av_cms: null,
    note: 'IfSAR DTM 5m 기반 자동 분석. 하상고도 234.1m EL.',
    wallCoords: [
      [120.5626, 16.6817, 284.1], [120.5666, 16.6817, 284.1],
      [120.5646, 16.6832, 234.1],
      [120.5666, 16.6847, 284.1], [120.5626, 16.6847, 284.1],
    ],
  },
  {
    id: 'CBBC', region: 'Abra Basin', priority: '우선',
    lat: 16.6694, lon: 120.5752,
    bed: 316.8, baseH: 50, baseFsl: 366.8, baseV: 7.6, baseArea: 0.38,
    hMin5: 40, upland_skm: null, dis_av_cms: null,
    note: 'IfSAR DTM 5m 기반 자동 분석. 하상고도 316.8m EL.',
    wallCoords: [
      [120.5732, 16.6679, 366.8], [120.5772, 16.6679, 366.8],
      [120.5752, 16.6694, 316.8],
      [120.5772, 16.6709, 366.8], [120.5732, 16.6709, 366.8],
    ],
  },
  {
    id: 'CPC', region: 'Abra Basin', priority: '검토필요',
    lat: 16.6458, lon: 120.6046,
    bed: 422.3, baseH: 50, baseFsl: 472.3, baseV: 2.8, baseArea: 0.14,
    hMin5: 90, upland_skm: null, dis_av_cms: null,
    note: 'IfSAR DTM 5m 기반 자동 분석. 하상고도 422.3m EL.',
    wallCoords: [
      [120.6026, 16.6443, 472.3], [120.6066, 16.6443, 472.3],
      [120.6046, 16.6458, 422.3],
      [120.6066, 16.6473, 472.3], [120.6026, 16.6473, 472.3],
    ],
  },
  {
    id: 'SA1_lower', region: 'Abra Basin', priority: '최우선',
    lat: 16.6474, lon: 120.6007,
    bed: 479.3, baseH: 50, baseFsl: 529.3, baseV: 0, baseArea: null,
    hMin5: 999, upland_skm: null, dis_av_cms: null,
    note: 'IfSAR DTM 5m 기반 자동 분석. 하상고도 479.3m EL.',
    wallCoords: [
      [120.5987, 16.6459, 529.3], [120.6027, 16.6459, 529.3],
      [120.6007, 16.6474, 479.3],
      [120.6027, 16.6489, 529.3], [120.5987, 16.6489, 529.3],
    ],
  },
  {
    id: 'SA1_upper', region: 'Abra Basin', priority: '우선',
    lat: 16.6530, lon: 120.6136,
    bed: 1124.6, baseH: 50, baseFsl: 1174.6, baseV: 0, baseArea: null,
    hMin5: 999, upland_skm: null, dis_av_cms: null,
    note: 'IfSAR DTM 5m 기반 자동 분석. 하상고도 1124.6m EL.',
    wallCoords: [
      [120.6116, 16.6515, 1174.6], [120.6156, 16.6515, 1174.6],
      [120.6136, 16.6530, 1124.6],
      [120.6156, 16.6545, 1174.6], [120.6116, 16.6545, 1174.6],
    ],
  },
  {
    id: 'SA2_lower', region: 'Abra Basin', priority: '우선',
    lat: 16.6651, lon: 120.5803,
    bed: 506.0, baseH: 50, baseFsl: 556.0, baseV: 0, baseArea: null,
    hMin5: 999, upland_skm: null, dis_av_cms: null,
    note: 'IfSAR DTM 5m 기반 자동 분석. 하상고도 506.0m EL.',
    wallCoords: [
      [120.5783, 16.6636, 556.0], [120.5823, 16.6636, 556.0],
      [120.5803, 16.6651, 506.0],
      [120.5823, 16.6666, 556.0], [120.5783, 16.6666, 556.0],
    ],
  },
  {
    id: 'SA2_upper', region: 'Abra Basin', priority: '검토필요',
    lat: 16.6537, lon: 120.5581,
    bed: 1225.6, baseH: 50, baseFsl: 1275.6, baseV: 0, baseArea: null,
    hMin5: 999, upland_skm: null, dis_av_cms: null,
    note: 'IfSAR DTM 5m 기반 자동 분석. 하상고도 1225.6m EL.',
    wallCoords: [
      [120.5561, 16.6522, 1275.6], [120.5601, 16.6522, 1275.6],
      [120.5581, 16.6537, 1225.6],
      [120.5601, 16.6552, 1275.6], [120.5561, 16.6552, 1275.6],
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
