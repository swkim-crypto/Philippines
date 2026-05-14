import React, { useState, useEffect } from 'react'
import Sidebar      from './components/Sidebar.jsx'
import DetailPanel  from './components/DetailPanel.jsx'
import CesiumViewer from './components/CesiumViewer.jsx'
import { CANDIDATES } from './data/candidates.js'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

export default function App() {
  const [candidates, setCandidates] = useState(CANDIDATES)  // 정적 초기값
  const [selected,   setSelected]   = useState(null)
  const [heightM,    setHeightM]     = useState(80)

  // backend에서 후보지 목록 로드 (SHP 전처리 결과)
  useEffect(() => {
    fetch(`${API_BASE}/candidates`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.length) setCandidates(data)
      })
      .catch(() => {}) // backend 없으면 정적 데이터 사용
  }, [])

  // 높이 변경 시 기준치 초기화 (댐 변경 시)
  const handleSelect = (c) => {
    setSelected(c)
    setHeightM(c.baseH ?? 80)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>

      {/* ── 좌측: 후보지 목록 ── */}
      <Sidebar
        candidates={candidates}
        selected={selected}
        onSelect={handleSelect}
      />

      {/* ── 중앙: Cesium 3D 지구 ── */}
      <CesiumViewer
        candidates={candidates}
        selected={selected}
        heightM={heightM}
        onSelect={handleSelect}
      />

      {/* ── 우측: 상세 분석 패널 ── */}
      <DetailPanel
        candidate={selected}
        heightM={heightM}
        onHeightChange={setHeightM}
      />

    </div>
  )
}
