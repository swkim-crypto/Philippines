import React, { useState, useEffect } from 'react'
import Sidebar      from './components/Sidebar.jsx'
import DetailPanel  from './components/DetailPanel.jsx'
import CesiumViewer from './components/CesiumViewer.jsx'
import { CANDIDATES } from './data/candidates.js'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

export default function App() {
  const [candidates, setCandidates] = useState(CANDIDATES)
  const [selected,   setSelected]   = useState(null)
  const [heightM,    setHeightM]     = useState(80)
  const [showFlood,  setShowFlood]   = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/candidates`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.length) setCandidates(data) })
      .catch(() => {})
  }, [])

  const handleSelect = (c) => {
    setSelected(c)
    setHeightM(c.baseH ?? 50)
    setShowFlood(false)  // 댐 바꾸면 수몰 초기화
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar
        candidates={candidates}
        selected={selected}
        onSelect={handleSelect}
        showFlood={showFlood}
        onToggleFlood={() => setShowFlood(v => !v)}
      />
      <CesiumViewer
        candidates={candidates}
        selected={selected}
        heightM={heightM}
        showFlood={showFlood}
        onSelect={handleSelect}
      />
      <DetailPanel
        candidate={selected}
        heightM={heightM}
        onHeightChange={setHeightM}
      />
    </div>
  )
}
