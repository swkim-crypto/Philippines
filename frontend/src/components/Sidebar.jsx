import React from 'react'
import { PRIORITY_CONFIG, ANALYSIS_INFO } from '../data/candidates.js'

const REGION_ORDER = [
  'Middle Basin',
  'Upper Basin',
  'Lower Valley',
  'Xieng Khouang Highland',
]

const REGION_LABELS = {
  'Middle Basin':           '중부 유역',
  'Upper Basin':            '상류 유역',
  'Lower Valley':           '하류 계곡',
  'Xieng Khouang Highland': '시엥쿠앙 고원',
}

export default function Sidebar({ candidates, selected, onSelect, mobile }) {
  // ── region별 그룹핑 ─────────────────────────────
  const grouped = REGION_ORDER.reduce((acc, r) => {
    acc[r] = (candidates ?? []).filter(c => c.region === r)
    return acc
  }, {})

  return (
    <div style={{
      width:           mobile ? '100%' : 252,
      background:      'var(--bg-panel)',
      borderRight:     mobile ? 'none' : '1px solid var(--border)',
      display:         'flex',
      flexDirection:   'column',
      overflow:        'hidden',
      flexShrink:      0,
      height:          '100%',
    }}>

      {/* ── 프로젝트 타이틀 ── */}
      {!mobile && (
        <div style={{ padding: '12px 18px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-sec)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>
            {ANALYSIS_INFO.basin.id}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-pri)', fontFamily: 'var(--font-mono)' }}>
            댐 후보지 분석 시스템
          </div>
        </div>
      )}

      {/* ── 분석 정보 ── */}
      <div style={{ padding: mobile ? '8px 12px' : '8px 14px 10px', borderBottom: '1px solid var(--border)', background: 'rgba(0,196,180,0.05)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-sec)', fontFamily: 'var(--font-mono)' }}>
            {ANALYSIS_INFO.analysisDate}
          </span>
          <span style={{ fontSize: 9, padding: '1px 6px', border: '1px solid var(--acc-teal)', borderRadius: 3, color: 'var(--acc-teal)', fontFamily: 'var(--font-mono)', background: 'rgba(0,196,180,0.15)' }}>
            {ANALYSIS_INFO.demSource}
          </span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-sec)', fontFamily: 'var(--font-mono)', marginBottom: 3, lineHeight: 1.4 }}>
          {ANALYSIS_INFO.method}
        </div>
        <div style={{ fontSize: 10, color: 'var(--acc-teal)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
          기준: {ANALYSIS_INFO.criterion}
        </div>
      </div>

      {/* ── 후보지 목록 헤더 ── */}
      <div style={{ padding: mobile ? '8px 14px 4px' : '8px 18px 6px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-sec)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          후보지 목록
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-pri)', opacity: 0.6, marginTop: 2 }}>
          총 {(candidates ?? []).length}개 · 탭하여 선택
        </div>
      </div>

      {/* ── 후보지 리스트 ── */}
      <div style={{ overflow: 'auto', flex: 1 }}>
        {REGION_ORDER.map(region => {
          const items = grouped[region]
          if (!items?.length) return null

          return (
            <div key={region}>
              {/* 지역 헤더 */}
              <div style={{
                padding:         mobile ? '10px 14px 4px' : '10px 18px 5px',
                fontSize:        10,
                color:           'var(--text-sec)',
                fontFamily:      'var(--font-mono)',
                letterSpacing:   '0.1em',
                textTransform:   'uppercase',
                borderTop:       '1px solid var(--border)',
                background:      'rgba(0,0,0,0.15)',
              }}>
                {REGION_LABELS[region]}
                <span style={{ marginLeft: 8, opacity: 0.5 }}>({items.length})</span>
              </div>

              {/* 후보지 아이템 */}
              {items.map(c => {
                const cfg   = PRIORITY_CONFIG[c.priority] ?? { color: '#888' }
                const isSel = selected?.id === c.id

                return (
                  <div
                    key={c.id}
                    onClick={() => onSelect(c)}
                    style={{
                      padding:      mobile ? '13px 14px' : '10px 16px',
                      cursor:       'pointer',
                      background:   isSel ? 'var(--bg-hover)' : 'transparent',
                      borderLeft:   isSel ? `3px solid ${cfg.color}` : '3px solid transparent',
                      transition:   'background 0.15s',
                      display:      'flex',
                      flexDirection:'column',
                      gap:          4,
                    }}
                  >
                    {/* ID + 우선순위 배지 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize:   mobile ? 17 : 15,
                        fontWeight: 700,
                        color:      isSel ? cfg.color : 'var(--text-pri)',
                      }}>
                        {c.id}
                      </span>
                      <span style={{
                        fontSize:   10,
                        padding:    '2px 8px',
                        background: `${cfg.color}22`,
                        color:      cfg.color,
                        border:     `1px solid ${cfg.color}66`,
                        borderRadius: 10,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                      }}>
                        {c.priority}
                      </span>
                    </div>

                    {/* 기본 제원 */}
                    <div style={{ fontSize: mobile ? 12 : 11, color: 'var(--text-pri)', fontFamily: 'var(--font-mono)', opacity: 0.75 }}>
                      {c.bed != null ? `Bed ${c.bed}m · ` : ''}V {c.baseV.toLocaleString()} Mm³
                    </div>

                    {/* 5Mm³ 달성 높이 */}
                    <div style={{
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      color: c.hMin5 <= 60 ? '#1D9E75' : c.hMin5 <= 90 ? '#BA7517' : '#E05C5C',
                    }}>
                      5Mm³: H≥{c.hMin5}m {c.hMin5 <= 60 ? '✓' : c.hMin5 <= 90 ? '△' : '⚠'}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* 빈 상태 */}
        {(candidates ?? []).length === 0 && (
          <div style={{ padding: '24px 18px', textAlign: 'center', fontSize: 12, color: 'var(--text-sec)', fontFamily: 'var(--font-mono)' }}>
            후보지 로딩 중...
          </div>
        )}
      </div>
    </div>
  )
}
