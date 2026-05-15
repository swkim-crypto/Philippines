import React from 'react'
import { PRIORITY_CONFIG, ANALYSIS_INFO } from '../data/candidates.js'
import { getDamLabel } from './CesiumViewer.jsx'

const REGION_ORDER = ['Abra Basin']

function getDamType(c) {
  if (c.damType) return c.damType
  if (c.id?.includes('upper')) return 'upper'
  return 'lower'
}

export default function Sidebar({ candidates, selected, onSelect, mobile, showFlood, onToggleFlood }) {
  const items      = (candidates ?? []).filter(c => REGION_ORDER.some(r => c.region === r))
  const lowerItems = items.filter(c => getDamType(c) === 'lower')
  const upperItems = items.filter(c => getDamType(c) === 'upper')

  const renderItem = (c) => {
    const cfg   = PRIORITY_CONFIG[c.priority] ?? { color: '#888' }
    const isSel = selected?.id === c.id
    const label = getDamLabel(c.id)
    const isUp  = getDamType(c) === 'upper'
    return (
      <div key={c.id} onClick={() => onSelect(c)} style={{
        padding: mobile ? '13px 14px' : '10px 16px', cursor: 'pointer',
        background: isSel ? 'var(--bg-hover)' : 'transparent',
        borderLeft: isSel ? `3px solid ${cfg.color}` : '3px solid transparent',
        transition: 'background 0.15s', display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: mobile ? 17 : 15, fontWeight: 700,
            color: isSel ? cfg.color : isUp ? '#00aaff' : 'var(--text-pri)' }}>{label}</span>
          <span style={{ fontSize: 10, padding: '2px 8px', background: `${cfg.color}22`, color: cfg.color,
            border: `1px solid ${cfg.color}66`, borderRadius: 10, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            {c.priority}</span>
        </div>
        <div style={{ fontSize: mobile ? 12 : 11, color: 'var(--text-pri)', fontFamily: 'var(--font-mono)', opacity: 0.75 }}>
          {c.bed != null ? `Bed ${c.bed}m · ` : ''}V {c.baseV ?? 0} Mm³{isUp && c.drop ? ` · 낙차 ${c.drop}m` : ''}
        </div>
        {c.hMin5 != null && (
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)',
            color: c.hMin5 <= 60 ? '#1D9E75' : c.hMin5 <= 90 ? '#BA7517' : '#E05C5C' }}>
            5Mm³: H≥{c.hMin5}m {c.hMin5 <= 60 ? '✓' : c.hMin5 <= 90 ? '△' : '⚠'}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ width: mobile ? '100%' : 252, background: 'var(--bg-panel)',
      borderRight: mobile ? 'none' : '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, height: '100%' }}>

      {!mobile && (
        <div style={{ padding: '12px 18px 10px', borderBottom: '1px solid var(--border)',
          flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-sec)',
              letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>{ANALYSIS_INFO.basin.id}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-pri)', fontFamily: 'var(--font-mono)' }}>
              댐 후보지 분석 시스템</div>
          </div>
          <button onClick={onToggleFlood} style={{
            marginTop: 2, padding: '3px 8px', fontSize: 10, fontFamily: 'var(--font-mono)',
            background: showFlood ? 'rgba(26,111,255,0.25)' : 'transparent',
            color: showFlood ? '#55aaff' : 'var(--text-sec)',
            border: `1px solid ${showFlood ? '#55aaff' : 'rgba(255,255,255,0.15)'}`,
            borderRadius: 3, cursor: 'pointer', whiteSpace: 'nowrap' }}>💧 수몰</button>
        </div>
      )}

      <div style={{ padding: mobile ? '8px 12px' : '8px 14px 10px',
        borderBottom: '1px solid var(--border)', background: 'rgba(0,196,180,0.05)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-sec)', fontFamily: 'var(--font-mono)' }}>{ANALYSIS_INFO.analysisDate}</span>
          <span style={{ fontSize: 9, padding: '1px 6px', border: '1px solid var(--acc-teal)', borderRadius: 3,
            color: 'var(--acc-teal)', fontFamily: 'var(--font-mono)', background: 'rgba(0,196,180,0.15)' }}>{ANALYSIS_INFO.demSource}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-sec)', fontFamily: 'var(--font-mono)', marginBottom: 3, lineHeight: 1.4 }}>{ANALYSIS_INFO.method}</div>
        <div style={{ fontSize: 10, color: 'var(--acc-teal)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>기준: {ANALYSIS_INFO.criterion}</div>
      </div>

      <div style={{ padding: mobile ? '8px 14px 4px' : '8px 18px 6px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-sec)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>후보지 목록</div>
        <div style={{ fontSize: 11, color: 'var(--text-pri)', opacity: 0.6, marginTop: 2 }}>총 {items.length}개 · 탭하여 선택</div>
      </div>

      <div style={{ overflow: 'auto', flex: 1 }}>
        {lowerItems.length > 0 && (<>
          <div style={{ padding: '8px 16px 3px', fontSize: 9, color: '#f0a500', fontFamily: 'var(--font-mono)',
            background: 'rgba(240,165,0,0.06)', borderTop: '1px solid var(--border)' }}>▼ 하부댐 (저수) {lowerItems.length}개</div>
          {lowerItems.map(renderItem)}
        </>)}
        {upperItems.length > 0 && (<>
          <div style={{ padding: '8px 16px 3px', fontSize: 9, color: '#00aaff', fontFamily: 'var(--font-mono)',
            background: 'rgba(0,170,255,0.06)', borderTop: '1px solid var(--border)' }}>▼ 상부댐 (양수) {upperItems.length}개</div>
          {upperItems.map(renderItem)}
        </>)}
        {lowerItems.length === 0 && upperItems.length === 0 && items.length > 0 && (<>
          <div style={{ padding: '8px 16px 3px', fontSize: 9, color: 'var(--text-sec)',
            fontFamily: 'var(--font-mono)', borderTop: '1px solid var(--border)' }}>Abra 유역</div>
          {items.map(renderItem)}
        </>)}
        {items.length === 0 && (
          <div style={{ padding: '24px 18px', textAlign: 'center', fontSize: 12, color: 'var(--text-sec)', fontFamily: 'var(--font-mono)' }}>후보지 로딩 중...</div>
        )}
      </div>
    </div>
  )
}
