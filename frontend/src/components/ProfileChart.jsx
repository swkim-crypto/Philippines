import React, { useState, useMemo } from 'react'
import { calcFsl, estimateVolume, estimateArea } from '../data/candidates.js'

const W = 580, H = 260
const PAD = { top: 22, right: 24, bottom: 42, left: 58 }
const CW = W - PAD.left - PAD.right
const CH = H - PAD.top - PAD.bottom

// wallPts([lon,lat,elev] × 31) → [{d, elev}] (bed=0, 좌=음수)
function wallPtsToProfile(wallPts) {
  if (!wallPts?.length) return []
  const elevs = wallPts.map(p => p[2])
  const bedIdx = elevs.indexOf(Math.min(...elevs))

  let cum = 0
  const raw = wallPts.map((p, i) => {
    if (i > 0) {
      const prev = wallPts[i - 1]
      const lat = (p[1] + prev[1]) / 2
      const dx = (p[0] - prev[0]) * 111000 * Math.cos((lat * Math.PI) / 180)
      const dy = (p[1] - prev[1]) * 111000
      cum += Math.sqrt(dx * dx + dy * dy)
    }
    return { d: cum, elev: p[2] }
  })
  const bedD = raw[bedIdx].d
  return raw.map(p => ({ d: Math.round((p.d - bedD) * 10) / 10, elev: p.elev }))
}

// H-V-A 커브: heightM 5~120, 5단계
function buildHVA(candidate) {
  const steps = []
  for (let h = 5; h <= 120; h += 5) {
    const fsl = calcFsl(candidate, h)
    const v   = estimateVolume(candidate, h)
    const a   = estimateArea(candidate, h)
    if (v != null && a != null) steps.push({ h, fsl, v, a })
  }
  return steps
}

export default function ProfileChart({ candidate, heightM }) {
  const [mode, setMode] = useState('cross')
  const fsl = calcFsl(candidate, heightM)

  // 횡단면 데이터 — wallPts 직접 변환
  const crossData = useMemo(() => wallPtsToProfile(candidate?.wallPts), [candidate?.id])

  // 종단면 데이터 — H-V-A 추정
  const hvaData = useMemo(() => candidate ? buildHVA(candidate) : [], [candidate?.id])

  // ── 횡단면 렌더 계산 ──────────────────────────
  const C = useMemo(() => {
    if (mode === 'cross') {
      const data = crossData
      if (!data.length) return null

      const dMin = data[0].d, dMax = data[data.length - 1].d
      const elevs = data.map(p => p.elev)
      const eMin  = Math.min(...elevs) - (Math.max(...elevs) - Math.min(...elevs)) * 0.04
      const eMax  = Math.max(Math.max(...elevs), fsl) + (Math.max(...elevs) - Math.min(...elevs)) * 0.12

      const sx = d => PAD.left + ((d - dMin) / (dMax - dMin)) * CW
      const sy = e => PAD.top + CH - ((e - eMin) / (eMax - eMin)) * CH

      const pathTerrain = [
        `M${sx(dMin).toFixed(1)},${sy(eMin).toFixed(1)}`,
        ...data.map(p => `L${sx(p.d).toFixed(1)},${sy(p.elev).toFixed(1)}`),
        `L${sx(dMax).toFixed(1)},${sy(eMin).toFixed(1)}`, 'Z',
      ].join(' ')

      const wY = sy(fsl)
      let waterPath = ''
      let seg = []
      const flush = () => {
        if (seg.length >= 2) {
          const top = seg.map(([x]) => `${x.toFixed(1)},${wY.toFixed(1)}`).join(' L')
          const bot = [...seg].reverse().map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')
          waterPath += `M${top} L${bot} Z `
        }
        seg = []
      }
      data.forEach(p => {
        if (p.elev < fsl) seg.push([sx(p.d), sy(p.elev)])
        else flush()
      })
      flush()

      // 역삼각형 댐
      const left  = [...data].filter(p => p.d <= 0).reverse()
      const right = [...data].filter(p => p.d >= 0)
      let lEdge = null, rEdge = null
      for (let i = 0; i < left.length - 1; i++) {
        const a = left[i], b = left[i + 1]
        if (a.elev <= fsl && b.elev > fsl) { lEdge = a.d + (fsl - a.elev) / (b.elev - a.elev) * (b.d - a.d); break }
      }
      for (let i = 0; i < right.length - 1; i++) {
        const a = right[i], b = right[i + 1]
        if (a.elev <= fsl && b.elev > fsl) { rEdge = a.d + (fsl - a.elev) / (b.elev - a.elev) * (b.d - a.d); break }
      }
      let damTriPath = null, damLength = null
      if (lEdge !== null && rEdge !== null) {
        damLength = Math.round(Math.abs(rEdge - lEdge))
        const lx = sx(lEdge), rx = sx(rEdge), cx = sx(0), bedY = sy(candidate.bed)
        if ([lx, rx, cx, bedY].every(Number.isFinite))
          damTriPath = `M${lx.toFixed(1)},${wY.toFixed(1)} L${rx.toFixed(1)},${wY.toFixed(1)} L${cx.toFixed(1)},${bedY.toFixed(1)} Z`
      }

      const rawStep = (eMax - eMin) / 6
      const mag = Math.pow(10, Math.floor(Math.log10(rawStep || 1)))
      const yStep = Math.ceil(rawStep / mag) * mag
      const yTicks = []
      for (let v = Math.ceil(eMin / yStep) * yStep; v <= eMax; v += yStep) yTicks.push(v)
      const xSpan = dMax - dMin
      const xStep = xSpan > 400 ? 100 : 50
      const xTicks = []
      for (let v = Math.ceil(dMin / xStep) * xStep; v <= dMax; v += xStep) xTicks.push(v)

      return { sx, sy, wY, pathTerrain, waterPath, damTriPath, damLength, yTicks, xTicks, eMin, eMax, dMin, dMax }
    } else {
      // ── 종단면: H-V-A 커브 ───────────────────
      const data = hvaData
      if (!data.length) return null

      const vMax = Math.max(...data.map(d => d.v))
      const aMax = Math.max(...data.map(d => d.a))
      const hMax = Math.max(...data.map(d => d.h))

      const sx = h => PAD.left + ((h - 0) / hMax) * CW
      const syV = v => PAD.top + CH - (v / (vMax * 1.1)) * CH
      const syA = a => PAD.top + CH - (a / (aMax * 1.1)) * CH

      const pathV = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${sx(d.h).toFixed(1)},${syV(d.v).toFixed(1)}`).join(' ')
      const pathA = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${sx(d.h).toFixed(1)},${syA(d.a).toFixed(1)}`).join(' ')

      // 현재 heightM 위치
      const curX = sx(heightM)
      const curD = data.find(d => d.h === heightM) ?? data.reduce((a, b) => Math.abs(b.h - heightM) < Math.abs(a.h - heightM) ? b : a)

      const xTicks = data.filter(d => d.h % 20 === 0).map(d => d.h)
      const vTicks = [0, vMax * 0.25, vMax * 0.5, vMax * 0.75, vMax].map(v => Math.round(v * 10) / 10)

      return { sx, syV, syA, pathV, pathA, curX, curD, xTicks, vTicks, vMax, aMax }
    }
  }, [mode, crossData, hvaData, fsl, heightM, candidate?.bed])

  if (!C) return (
    <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10,
      padding:'20px 12px', marginBottom:12, textAlign:'center' }}>
      <div style={{ fontSize:12, color:'#5a7a90', fontFamily:'var(--font-mono)' }}>단면 프로파일 — 데이터 없음</div>
    </div>
  )

  const fmtX = d => d === 0 ? '0' : `${d > 0 ? '+' : ''}${d}m`

  return (
    <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10,
      padding:'10px 12px', marginBottom:12 }}>

      {/* 탭 */}
      <div style={{ display:'flex', gap:6, marginBottom:8, alignItems:'center', flexWrap:'wrap' }}>
        {[
          { key:'cross', label:'횡단면 (댐 축)' },
          { key:'hva',   label:'H-V-A 커브' },
        ].map(t => (
          <button key={t.key} onClick={() => setMode(t.key)} style={{
            padding:'4px 12px', fontSize:12, fontFamily:'var(--font-mono)',
            background: mode === t.key ? 'var(--acc-teal)' : 'transparent',
            color:      mode === t.key ? 'var(--bg-deep)' : '#a0bcd0',
            border:    `1px solid ${mode === t.key ? 'var(--acc-teal)' : 'rgba(255,255,255,0.15)'}`,
            borderRadius:4, fontWeight: mode === t.key ? 700 : 400,
          }}>{t.label}</button>
        ))}
        <span style={{ fontSize:12, fontFamily:'var(--font-mono)', color:'var(--acc-teal)', marginLeft:4 }}>
          FSL {fsl}m EL
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', display:'block' }}>
        <defs><clipPath id="chart-clip"><rect x={PAD.left} y={PAD.top} width={CW} height={CH} /></clipPath></defs>
        <rect x={PAD.left} y={PAD.top} width={CW} height={CH} fill="rgba(0,0,0,0.3)" rx="3" />

        {mode === 'cross' && (() => {
          const { sx, sy, wY, pathTerrain, waterPath, damTriPath, damLength, yTicks, xTicks, eMin, eMax } = C
          const fslInRange = fsl >= eMin && fsl <= eMax
          return <>
            {/* Y 그리드 */}
            {yTicks.map(v => <g key={v}>
              <line x1={PAD.left} y1={sy(v)} x2={PAD.left+CW} y2={sy(v)} stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
              <text x={PAD.left-4} y={sy(v)+4} textAnchor="end" fontSize="10" fill="#7a9bb5" fontFamily="Space Mono">{v}</text>
            </g>)}
            {/* X 그리드 */}
            {xTicks.map(d => <g key={d}>
              <line x1={sx(d)} y1={PAD.top} x2={sx(d)} y2={PAD.top+CH} stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
              <text x={sx(d)} y={PAD.top+CH+14} textAnchor="middle" fontSize="10" fill="#7a9bb5" fontFamily="Space Mono">{fmtX(d)}</text>
            </g>)}
            <g clipPath="url(#chart-clip)">
              {waterPath && <path d={waterPath} fill="rgba(30,120,255,0.48)"/>}
              {fslInRange && <line x1={PAD.left} y1={wY} x2={PAD.left+CW} y2={wY} stroke="rgba(120,190,255,0.55)" strokeWidth="1"/>}
              {pathTerrain && <path d={pathTerrain} fill="rgba(29,158,117,0.45)" stroke="#1d9e75" strokeWidth="1.5"/>}
              {fslInRange && <line x1={PAD.left} y1={wY} x2={PAD.left+CW} y2={wY} stroke="#1a7fbd" strokeWidth="1.5" strokeDasharray="6,3"/>}
              {damTriPath && <path d={damTriPath} fill="rgba(240,165,0,0.88)" stroke="#f0a500" strokeWidth="2"/>}
              <text x={PAD.left+8} y={PAD.top+15} fontSize="11" fill="#7a9bb5" fontFamily="Space Mono">← 상류</text>
              <text x={PAD.left+CW-8} y={PAD.top+15} textAnchor="end" fontSize="11" fill="#7a9bb5" fontFamily="Space Mono">하류 →</text>
            </g>
            {/* 댐 길이 배지 */}
            {damLength && Number.isFinite(damLength) && (
              <g>
                <rect x={PAD.left+CW-114} y={PAD.top+4} width={112} height={26} fill="rgba(0,196,180,0.18)" rx="4" stroke="var(--acc-teal)" strokeWidth="1"/>
                <text x={PAD.left+CW-58} y={PAD.top+13} textAnchor="middle" fontSize="9" fill="var(--acc-teal)" fontFamily="Space Mono">댐 길이</text>
                <text x={PAD.left+CW-58} y={PAD.top+25} textAnchor="middle" fontSize="12" fill="#fff" fontFamily="Space Mono" fontWeight="700">
                  {damLength >= 1000 ? `${(damLength/1000).toFixed(2)} km` : `${damLength} m`}
                </text>
              </g>
            )}
            <text x={PAD.left-44} y={PAD.top+CH/2} textAnchor="middle" fontSize="10" fill="#7a9bb5"
              fontFamily="Space Mono" transform={`rotate(-90,${PAD.left-44},${PAD.top+CH/2})`}>고도 (m EL)</text>
          </>
        })()}

        {mode === 'hva' && (() => {
          const { sx, syV, syA, pathV, pathA, curX, curD, xTicks, vTicks, vMax, aMax } = C
          return <>
            {/* Y 그리드 (저수량) */}
            {vTicks.map(v => <g key={v}>
              <line x1={PAD.left} y1={syV(v)} x2={PAD.left+CW} y2={syV(v)} stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
              <text x={PAD.left-4} y={syV(v)+4} textAnchor="end" fontSize="10" fill="#00c4b4" fontFamily="Space Mono">{v}</text>
            </g>)}
            {/* X 그리드 (높이) */}
            {xTicks.map(h => <g key={h}>
              <line x1={sx(h)} y1={PAD.top} x2={sx(h)} y2={PAD.top+CH} stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
              <text x={sx(h)} y={PAD.top+CH+14} textAnchor="middle" fontSize="10" fill="#7a9bb5" fontFamily="Space Mono">{h}m</text>
            </g>)}
            <g clipPath="url(#chart-clip)">
              {/* 저수량 커브 */}
              <path d={pathV} fill="none" stroke="var(--acc-teal)" strokeWidth="2.5"/>
              {/* 수몰면적 커브 (우축 스케일) */}
              <path d={pathA} fill="none" stroke="#f0a500" strokeWidth="1.5" strokeDasharray="5,3"/>
              {/* 현재 높이 마커 */}
              <line x1={curX} y1={PAD.top} x2={curX} y2={PAD.top+CH} stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeDasharray="4,3"/>
              <circle cx={curX} cy={syV(curD.v)} r="5" fill="var(--acc-teal)" stroke="#fff" strokeWidth="1.5"/>
              <circle cx={curX} cy={syA(curD.a)} r="4" fill="#f0a500" stroke="#fff" strokeWidth="1.5"/>
              {/* 현재값 레이블 */}
              <rect x={curX+6} y={PAD.top+4} width={90} height={36} fill="rgba(0,0,0,0.6)" rx="4"/>
              <text x={curX+11} y={PAD.top+16} fontSize="10" fill="var(--acc-teal)" fontFamily="Space Mono">V {curD.v} Mm³</text>
              <text x={curX+11} y={PAD.top+29} fontSize="10" fill="#f0a500" fontFamily="Space Mono">A {curD.a} km²</text>
              <text x={curX+11} y={PAD.top+40} fontSize="9" fill="#aaa" fontFamily="Space Mono">H={heightM}m</text>
            </g>
            {/* 축 레이블 */}
            <text x={PAD.left-44} y={PAD.top+CH/2} textAnchor="middle" fontSize="10" fill="#00c4b4"
              fontFamily="Space Mono" transform={`rotate(-90,${PAD.left-44},${PAD.top+CH/2})`}>저수량 (Mm³)</text>
            <text x={PAD.left+CW+16} y={PAD.top+CH/2} textAnchor="middle" fontSize="10" fill="#f0a500"
              fontFamily="Space Mono" transform={`rotate(90,${PAD.left+CW+16},${PAD.top+CH/2})`}>면적 (km²)</text>
          </>
        })()}
      </svg>

      {/* 범례 */}
      <div style={{ display:'flex', gap:14, marginTop:6, flexWrap:'wrap' }}>
        {(mode === 'cross' ? [
          { color:'#1d9e75',              label:'지형',        dash:false },
          { color:'rgba(30,120,255,0.7)', label:'저수',        dash:false },
          { color:'#1a7fbd',              label:`FSL ${fsl}m`, dash:true  },
          { color:'#f0a500',              label:'댐 (역삼각)', dash:false },
        ] : [
          { color:'var(--acc-teal)', label:'저수량 V (Mm³)',  dash:false },
          { color:'#f0a500',         label:'수몰면적 A (km²)', dash:true  },
        ]).map(item => (
          <div key={item.label} style={{ display:'flex', alignItems:'center', gap:5,
            fontSize:11, color:'#a0bcd0', fontFamily:'var(--font-mono)' }}>
            <div style={{ width:20, height:item.dash?0:3, background:item.color,
              borderTop:item.dash?`2px dashed ${item.color}`:'none', marginTop:item.dash?2:0 }}/>
            {item.label}
          </div>
        ))}
      </div>
    </div>
  )
}
