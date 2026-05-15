import React, { useState, useCallback, useRef } from 'react'
import Sidebar      from './components/Sidebar.jsx'
import DetailPanel  from './components/DetailPanel.jsx'
import CesiumViewer from './components/CesiumViewer.jsx'
import { CANDIDATES, estimateVolume, estimateArea, calcFsl } from './data/candidates.js'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

export default function App() {
  // candidates는 로컬 고정 — 백엔드 /candidates fetch 제거
  // (구버전 캐시가 SA1/SA2 등을 덮어쓰는 문제 근본 해결)
  const [selected,   setSelected]   = useState(null)
  const [heightM,    setHeightM]    = useState(60)
  const [showFlood,  setShowFlood]  = useState(false)
  const [flyTo,      setFlyTo]      = useState(null)   // { id, ts } — 카메라 이동 트리거

  // 시뮬레이션 결과 상태
  const [simResult,  setSimResult]  = useState(null)
  const [simLoading, setSimLoading] = useState(false)

  const debounceRef = useRef(null)

  // ── 시뮬레이션 API 호출 ──────────────────────
  const runSimulate = useCallback((dam, height) => {
    if (!dam) return
    setSimLoading(true)

    // 즉시 로컬 추정값으로 패널 업데이트 (응답 오기 전)
    const fsl        = calcFsl(dam, height)
    const vol_local  = estimateVolume(dam, height)
    const area_local = estimateArea(dam, height)
    setSimResult({
      fsl, area_km2: area_local, volume_mm3: vol_local,
      flood_geojson: null, source: 'local',
    })

    // 디바운스 300ms — 슬라이더 드래그 중 API 과호출 방지
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(
          `${API_BASE}/simulate/${dam.id}?height=${height}`,
          { signal: AbortSignal.timeout(30000) }
        )
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const data = await resp.json()
        setSimResult({ ...data, source: 'api' })
      } catch (e) {
        console.warn('simulate API 실패, 로컬 추정값 사용:', e.message)
        // 로컬 추정값 유지
      } finally {
        setSimLoading(false)
      }
    }, 300)
  }, [])

  // ── 댐 선택 ──────────────────────────────────
  const handleSelect = (c) => {
    setSelected(c)
    const h = 60
    setHeightM(h)
    setShowFlood(false)
    setSimResult(null)
    runSimulate(c, h)
    // ts를 매번 갱신 → 같은 댐 재클릭 시에도 카메라 이동 보장
    setFlyTo({ id: c.id, ts: Date.now() })
  }

  // ── 높이 변경 ────────────────────────────────
  const handleHeightChange = (h) => {
    setHeightM(h)
    runSimulate(selected, h)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar
        candidates={CANDIDATES}
        selected={selected}
        onSelect={handleSelect}
        showFlood={showFlood}
        onToggleFlood={() => setShowFlood(v => !v)}
      />
      <CesiumViewer
        candidates={CANDIDATES}
        selected={selected}
        heightM={heightM}
        showFlood={showFlood}
        simResult={simResult}
        flyTo={flyTo}
        onSelect={handleSelect}
      />
      <DetailPanel
        candidate={selected}
        heightM={heightM}
        onHeightChange={handleHeightChange}
        simResult={simResult}
        simLoading={simLoading}
      />
    </div>
  )
}
