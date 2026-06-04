// ══════════════════════════════════════════════════════
//  Philippines — Abra Basin 댐 후보지 (현장답사 최종 7개)
//  하부 3개: CBC1-하부, CBC3-하부, CBC4-하부
//  상부 4개: CBC1-상부, CBC2-상부, CBC3-상부, CBC4-상부
//  매칭(계통): CBC1=하부1 + 상부 2개(CBC1_UP·CBC2_UP) / CBC3 / CBC4
//  bed·baseV·baseArea: Colab IfSAR DTM 5m 산출(50m 근처 행)
//  wallPts: Colab 셀 ⑧ 출력으로 아래 WALLPTS 교체
//  reservoirCoords: null → 수몰면은 백엔드 /simulate(실시간)에서 옴
// ══════════════════════════════════════════════════════

const WALLPTS = {
  CBC1_DOWN: [[np.float64(120.562682), np.float64(16.68492), 347.6], [np.float64(120.562767), np.float64(16.684974), 343.6], [np.float64(120.562853), np.float64(16.685027), 334.4], [np.float64(120.562938), np.float64(16.685081), 326.3], [np.float64(120.563024), np.float64(16.685134), 319.8], [np.float64(120.56311), np.float64(16.685188), 312.1], [np.float64(120.563195), np.float64(16.685241), 300.4], [np.float64(120.56328), np.float64(16.685295), 291.1], [np.float64(120.563366), np.float64(16.685348), 273.5], [np.float64(120.563452), np.float64(16.685402), 253.4], [np.float64(120.563537), np.float64(16.685455), 240.5], [np.float64(120.563622), np.float64(16.685509), 230.1], [np.float64(120.563708), np.float64(16.685562), 221.9], [np.float64(120.563794), np.float64(16.685616), 219.0], [np.float64(120.563879), np.float64(16.685669), 223.3], [np.float64(120.563964), np.float64(16.685722), 237.9], [np.float64(120.56405), np.float64(16.685776), 249.8], [np.float64(120.564135), np.float64(16.68583), 261.8], [np.float64(120.564221), np.float64(16.685883), 273.6], [np.float64(120.564306), np.float64(16.685936), 280.7], [np.float64(120.564392), np.float64(16.68599), 291.8], [np.float64(120.564478), np.float64(16.686044), 304.9], [np.float64(120.564563), np.float64(16.686097), 313.8], [np.float64(120.564648), np.float64(16.68615), 321.2], [np.float64(120.564734), np.float64(16.686204), 328.2], [np.float64(120.56482), np.float64(16.686258), 332.7], [np.float64(120.564905), np.float64(16.686311), 339.7], [np.float64(120.56499), np.float64(16.686364), 348.5], [np.float64(120.565076), np.float64(16.686418), 355.6], [np.float64(120.565162), np.float64(16.686472), 363.4], [np.float64(120.565247), np.float64(16.686525), 371.8]],
  CBC3_DOWN: [[np.float64(120.573546), np.float64(16.669989), 483.6], [np.float64(120.57364), np.float64(16.670058), 477.2], [np.float64(120.573735), np.float64(16.670126), 468.1], [np.float64(120.573829), np.float64(16.670195), 460.2], [np.float64(120.573924), np.float64(16.670264), 449.6], [np.float64(120.574018), np.float64(16.670333), 440.4], [np.float64(120.574113), np.float64(16.670401), 422.0], [np.float64(120.574207), np.float64(16.67047), 405.2], [np.float64(120.574301), np.float64(16.670539), 368.0], [np.float64(120.574396), np.float64(16.670608), 332.1], [np.float64(120.57449), np.float64(16.670676), 304.0], [np.float64(120.574585), np.float64(16.670745), 305.9], [np.float64(120.574679), np.float64(16.670814), 322.4], [np.float64(120.574774), np.float64(16.670883), 337.7], [np.float64(120.574868), np.float64(16.670951), 358.0], [np.float64(120.574962), np.float64(16.67102), 373.7], [np.float64(120.575057), np.float64(16.671089), 392.1], [np.float64(120.575151), np.float64(16.671157), 403.8], [np.float64(120.575246), np.float64(16.671226), 414.8], [np.float64(120.57534), np.float64(16.671295), 423.1], [np.float64(120.575435), np.float64(16.671364), 433.1], [np.float64(120.575529), np.float64(16.671432), 441.0], [np.float64(120.575624), np.float64(16.671501), 448.8], [np.float64(120.575718), np.float64(16.67157), 455.3], [np.float64(120.575812), np.float64(16.671639), 461.8], [np.float64(120.575907), np.float64(16.671707), 468.5], [np.float64(120.576001), np.float64(16.671776), 474.7], [np.float64(120.576096), np.float64(16.671845), 480.7], [np.float64(120.57619), np.float64(16.671914), 486.5], [np.float64(120.576285), np.float64(16.671982), 493.5], [np.float64(120.576379), np.float64(16.672051), 501.7]],
  CBC4_DOWN: [[np.float64(120.588858), np.float64(16.646902), 676.6], [np.float64(120.58899), np.float64(16.647158), 666.2], [np.float64(120.589122), np.float64(16.647414), 658.8], [np.float64(120.589253), np.float64(16.64767), 642.9], [np.float64(120.589385), np.float64(16.647926), 624.8], [np.float64(120.589517), np.float64(16.648182), 595.2], [np.float64(120.589649), np.float64(16.648438), 564.6], [np.float64(120.58978), np.float64(16.648694), 532.7], [np.float64(120.589912), np.float64(16.64895), 502.7], [np.float64(120.590044), np.float64(16.649206), 479.2], [np.float64(120.590176), np.float64(16.649462), 449.7], [np.float64(120.590307), np.float64(16.649718), 410.4], [np.float64(120.590439), np.float64(16.649974), 383.1], [np.float64(120.590571), np.float64(16.65023), 394.6], [np.float64(120.590703), np.float64(16.650486), 441.1], [np.float64(120.590834), np.float64(16.650742), 473.9], [np.float64(120.590966), np.float64(16.650999), 500.3], [np.float64(120.591098), np.float64(16.651255), 517.2], [np.float64(120.59123), np.float64(16.651511), 529.1], [np.float64(120.591362), np.float64(16.651767), 551.3], [np.float64(120.591493), np.float64(16.652023), 566.7], [np.float64(120.591625), np.float64(16.652279), 584.0], [np.float64(120.591757), np.float64(16.652535), 594.7], [np.float64(120.591889), np.float64(16.652791), 597.7], [np.float64(120.59202), np.float64(16.653047), 593.5], [np.float64(120.592152), np.float64(16.653303), 590.7], [np.float64(120.592284), np.float64(16.653559), 591.2], [np.float64(120.592416), np.float64(16.653815), 597.7], [np.float64(120.592547), np.float64(16.654071), 605.6], [np.float64(120.592679), np.float64(16.654327), 613.9], [np.float64(120.592811), np.float64(16.654583), 622.8]],
  CBC1_UP: [[np.float64(120.570595), np.float64(16.696267), 938.9], [np.float64(120.570535), np.float64(16.696178), 932.9], [np.float64(120.570474), np.float64(16.696089), 925.7], [np.float64(120.570414), np.float64(16.696001), 914.2], [np.float64(120.570353), np.float64(16.695912), 908.6], [np.float64(120.570293), np.float64(16.695823), 901.8], [np.float64(120.570232), np.float64(16.695734), 895.6], [np.float64(120.570172), np.float64(16.695646), 886.2], [np.float64(120.570112), np.float64(16.695557), 880.5], [np.float64(120.570051), np.float64(16.695468), 874.9], [np.float64(120.569991), np.float64(16.695379), 865.8], [np.float64(120.56993), np.float64(16.695291), 860.9], [np.float64(120.56987), np.float64(16.695202), 855.4], [np.float64(120.569809), np.float64(16.695113), 844.5], [np.float64(120.569749), np.float64(16.695024), 834.0], [np.float64(120.569688), np.float64(16.694936), 822.3], [np.float64(120.569628), np.float64(16.694847), 808.7], [np.float64(120.569568), np.float64(16.694758), 806.9], [np.float64(120.569507), np.float64(16.694669), 815.7], [np.float64(120.569447), np.float64(16.69458), 829.7], [np.float64(120.569386), np.float64(16.694492), 840.7], [np.float64(120.569326), np.float64(16.694403), 849.7], [np.float64(120.569265), np.float64(16.694314), 857.8], [np.float64(120.569205), np.float64(16.694225), 866.5], [np.float64(120.569145), np.float64(16.694137), 870.6], [np.float64(120.569084), np.float64(16.694048), 878.0], [np.float64(120.569024), np.float64(16.693959), 885.7], [np.float64(120.568963), np.float64(16.69387), 893.6], [np.float64(120.568903), np.float64(16.693782), 902.5], [np.float64(120.568842), np.float64(16.693693), 913.0], [np.float64(120.568782), np.float64(16.693604), 924.1]],
  CBC2_UP: [[np.float64(120.576168), np.float64(16.687908), 1039.8], [np.float64(120.576223), np.float64(16.687817), 1035.1], [np.float64(120.576279), np.float64(16.687727), 1030.6], [np.float64(120.576334), np.float64(16.687636), 1021.6], [np.float64(120.576389), np.float64(16.687545), 1016.8], [np.float64(120.576444), np.float64(16.687455), 1015.3], [np.float64(120.5765), np.float64(16.687364), 1008.6], [np.float64(120.576555), np.float64(16.687273), 1001.1], [np.float64(120.57661), np.float64(16.687182), 992.2], [np.float64(120.576665), np.float64(16.687092), 978.3], [np.float64(120.576721), np.float64(16.687001), 957.5], [np.float64(120.576776), np.float64(16.68691), 921.0], [np.float64(120.576831), np.float64(16.68682), 898.3], [np.float64(120.576886), np.float64(16.686729), 880.4], [np.float64(120.576942), np.float64(16.686638), 875.6], [np.float64(120.576997), np.float64(16.686548), 889.3], [np.float64(120.577052), np.float64(16.686457), 907.5], [np.float64(120.577108), np.float64(16.686366), 917.8], [np.float64(120.577163), np.float64(16.686275), 925.7], [np.float64(120.577218), np.float64(16.686185), 933.3], [np.float64(120.577273), np.float64(16.686094), 941.9], [np.float64(120.577329), np.float64(16.686003), 951.5], [np.float64(120.577384), np.float64(16.685913), 965.6], [np.float64(120.577439), np.float64(16.685822), 975.8], [np.float64(120.577494), np.float64(16.685731), 985.6], [np.float64(120.57755), np.float64(16.68564), 995.9], [np.float64(120.577605), np.float64(16.68555), 1007.6], [np.float64(120.57766), np.float64(16.685459), 1020.7], [np.float64(120.577715), np.float64(16.685368), 1033.9], [np.float64(120.577771), np.float64(16.685278), 1040.8], [np.float64(120.577826), np.float64(16.685187), 1048.9]],
  CBC3_UP: [[np.float64(120.581667), np.float64(16.677277), 1051.9], [np.float64(120.581584), np.float64(16.677384), 1048.2], [np.float64(120.5815), np.float64(16.677492), 1043.2], [np.float64(120.581417), np.float64(16.6776), 1039.3], [np.float64(120.581333), np.float64(16.677707), 1034.0], [np.float64(120.58125), np.float64(16.677814), 1029.3], [np.float64(120.581166), np.float64(16.677922), 1023.4], [np.float64(120.581083), np.float64(16.67803), 1008.4], [np.float64(120.581), np.float64(16.678137), 999.1], [np.float64(120.580916), np.float64(16.678245), 980.5], [np.float64(120.580833), np.float64(16.678352), 968.1], [np.float64(120.580749), np.float64(16.678459), 959.7], [np.float64(120.580666), np.float64(16.678567), 952.2], [np.float64(120.580582), np.float64(16.678674), 949.0], [np.float64(120.580499), np.float64(16.678782), 947.0], [np.float64(120.580416), np.float64(16.67889), 944.5], [np.float64(120.580332), np.float64(16.678997), 943.3], [np.float64(120.580249), np.float64(16.679105), 940.8], [np.float64(120.580165), np.float64(16.679212), 944.2], [np.float64(120.580082), np.float64(16.67932), 959.8], [np.float64(120.579998), np.float64(16.679427), 970.2], [np.float64(120.579915), np.float64(16.679534), 983.0], [np.float64(120.579831), np.float64(16.679642), 996.4], [np.float64(120.579748), np.float64(16.67975), 1004.3], [np.float64(120.579665), np.float64(16.679857), 1011.6], [np.float64(120.579581), np.float64(16.679964), 1019.1], [np.float64(120.579498), np.float64(16.680072), 1026.2], [np.float64(120.579414), np.float64(16.68018), 1036.3], [np.float64(120.579331), np.float64(16.680287), 1042.7], [np.float64(120.579247), np.float64(16.680395), 1050.3], [np.float64(120.579164), np.float64(16.680502), 1053.3]],
  CBC4_UP: [[np.float64(120.606886), np.float64(16.665612), 1011.0], [np.float64(120.607046), np.float64(16.665492), 1000.7], [np.float64(120.607205), np.float64(16.665372), 988.1], [np.float64(120.607365), np.float64(16.665252), 982.5], [np.float64(120.607524), np.float64(16.665132), 985.2], [np.float64(120.607684), np.float64(16.665012), 993.9], [np.float64(120.607844), np.float64(16.664892), 997.2], [np.float64(120.608003), np.float64(16.664772), 990.9], [np.float64(120.608163), np.float64(16.664653), 981.0], [np.float64(120.608322), np.float64(16.664533), 968.3], [np.float64(120.608482), np.float64(16.664413), 952.1], [np.float64(120.608642), np.float64(16.664293), 931.3], [np.float64(120.608801), np.float64(16.664173), 902.9], [np.float64(120.608961), np.float64(16.664053), 878.7], [np.float64(120.60912), np.float64(16.663933), 864.1], [np.float64(120.60928), np.float64(16.663813), 849.4], [np.float64(120.60944), np.float64(16.663693), 833.3], [np.float64(120.609599), np.float64(16.663573), 847.9], [np.float64(120.609759), np.float64(16.663453), 871.0], [np.float64(120.609918), np.float64(16.663333), 893.7], [np.float64(120.610078), np.float64(16.663213), 903.6], [np.float64(120.610238), np.float64(16.663093), 914.9], [np.float64(120.610397), np.float64(16.662973), 928.3], [np.float64(120.610557), np.float64(16.662854), 941.2], [np.float64(120.610716), np.float64(16.662734), 955.1], [np.float64(120.610876), np.float64(16.662614), 968.4], [np.float64(120.611036), np.float64(16.662494), 979.2], [np.float64(120.611195), np.float64(16.662374), 990.9], [np.float64(120.611355), np.float64(16.662254), 999.8], [np.float64(120.611514), np.float64(16.662134), 1012.0], [np.float64(120.611674), np.float64(16.662014), 1022.0]],
}

export const ANALYSIS_INFO = {
  basin: { id: 'PHILIPPINES', name: 'Abra Basin' },
  analysisDate: new Date().toISOString().slice(0, 10),
  demSource: 'IfSAR 5m',
  method: 'DEM 기반 자동 분석',
  criterion: '최소 저수량 5Mm³',
}

export const HEIGHT_STEPS = [20, 30, 40, 50, 60, 70, 80, 90, 100, 120]

export const PRIORITY_CONFIG = {
  '최우선':  { color: '#00c4b4', rank: 1 },
  '우선':    { color: '#1D9E75', rank: 2 },
  '검토필요': { color: '#f0a500', rank: 3 },
  '보류':    { color: '#E05C5C', rank: 4 },
}

export const CANDIDATES = [
  // ── 하부댐 3개 (저수) ─────────────────────────────────
  {
    id: 'CBC1_DOWN', region: 'Abra Basin', priority: '우선',
    label: 'CBC1-하부',
    lat: 16.685723, lon: 120.563964,
    bed: 219.0, baseH: 51, baseFsl: 270.0, baseV: 3.563, baseArea: 0.1902,
    hMin5: 57, damType: 'lower', cat: 'CBC1',
    note: 'IfSAR DTM 5m. 하상고도 219.0m EL.',
    wallPts: WALLPTS.CBC1_DOWN,
    reservoirCoords: null,
  },
  {
    id: 'CBC3_DOWN', region: 'Abra Basin', priority: '우선',
    label: 'CBC3-하부',
    lat: 16.671020, lon: 120.574962,
    bed: 303.8, baseH: 51.2, baseFsl: 355.0, baseV: 2.07, baseArea: 0.1224,
    hMin5: 71, damType: 'lower', cat: 'CBC3',
    note: 'IfSAR DTM 5m. 하상고도 303.8m EL.',
    wallPts: WALLPTS.CBC3_DOWN,
    reservoirCoords: null,
  },
  {
    id: 'CBC4_DOWN', region: 'Abra Basin', priority: '우선',
    label: 'CBC4-하부',
    lat: 16.650742, lon: 120.590834,
    bed: 380.7, baseH: 49.3, baseFsl: 430.0, baseV: 3.881, baseArea: 0.1982,
    hMin5: 55, damType: 'lower', cat: 'CBC4',
    note: 'IfSAR DTM 5m. 하상고도 380.7m EL.',
    wallPts: WALLPTS.CBC4_DOWN,
    reservoirCoords: null,
  },

  // ── 상부댐 4개 (양수) ─────────────────────────────────
  {
    id: 'CBC1_UP', region: 'Abra Basin', priority: '우선',
    label: 'CBC1-상부',
    lat: 16.694935, lon: 120.569688,
    bed: 805.5, baseH: 49.5, baseFsl: 855.0, baseV: 0.161, baseArea: 0.01,
    hMin5: null, damType: 'upper', cat: 'CBC1', drop: 586,
    note: 'IfSAR DTM 5m. 하상고도 805.5m EL. 낙차 586m. (CBC1 하부와 짝)',
    wallPts: WALLPTS.CBC1_UP,
    reservoirCoords: null,
  },
  {
    id: 'CBC2_UP', region: 'Abra Basin', priority: '우선',
    label: 'CBC2-상부',
    lat: 16.686547, lon: 120.576997,
    bed: 873.8, baseH: 51.2, baseFsl: 925.0, baseV: 0.09, baseArea: 0.0042,
    hMin5: null, damType: 'upper', cat: 'CBC1', drop: 655,
    note: 'IfSAR DTM 5m. 하상고도 873.8m EL. 낙차 655m. (CBC1 하부와 짝)',
    wallPts: WALLPTS.CBC2_UP,
    reservoirCoords: null,
  },
  {
    id: 'CBC3_UP', region: 'Abra Basin', priority: '우선',
    label: 'CBC3-상부',
    lat: 16.678889, lon: 120.580416,
    bed: 940.2, baseH: 49.8, baseFsl: 990.0, baseV: 0.525, baseArea: 0.028,
    hMin5: null, damType: 'upper', cat: 'CBC3', drop: 636,
    note: 'IfSAR DTM 5m. 하상고도 940.2m EL. 낙차 636m.',
    wallPts: WALLPTS.CBC3_UP,
    reservoirCoords: null,
  },
  {
    id: 'CBC4_UP', region: 'Abra Basin', priority: '우선',
    label: 'CBC4-상부',
    lat: 16.663813, lon: 120.609280,
    bed: 833.3, baseH: 51.7, baseFsl: 885.0, baseV: 0.356, baseArea: 0.0213,
    hMin5: null, damType: 'upper', cat: 'CBC4', drop: 453,
    note: 'IfSAR DTM 5m. 하상고도 833.3m EL. 낙차 453m.',
    wallPts: WALLPTS.CBC4_UP,
    reservoirCoords: null,
  },
]

// ── 계산 함수 (변경 없음) ─────────────────────────────────

export function estimateVolume(c, heightM) {
  if (c.baseArea != null && c.baseArea > 0) {
    const ratio = (heightM / c.baseH) ** 1.4
    return Math.round(c.baseV * ratio * 10) / 10
  }
  return Math.round(c.baseV * (heightM / c.baseH) ** 2.2 * 10) / 10
}

export function estimateArea(c, heightM) {
  if (c.baseArea == null) return null
  const ratio = (heightM / c.baseH) ** 1.1
  return Math.round(c.baseArea * ratio * 10) / 10
}

export function calcFsl(c, heightM) {
  return c.bed != null ? c.bed + heightM : (c.baseFsl ?? 0) + (heightM - c.baseH)
}

export function calcEfficiency(vol, area) {
  if (!area || area <= 0) return null
  return Math.round((vol / area) * 10) / 10
}

export function estimateEvap(area) {
  if (area == null) return null
  return Math.round(area * 1.5 * 10) / 10
}
