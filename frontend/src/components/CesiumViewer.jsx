import React, { useEffect, useRef, useCallback } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { calcFsl } from '../data/candidates.js'

// Cesium Ion 토큰 (환경변수 우선, fallback은 공개 토큰)
Cesium.Ion.defaultAccessToken =
  import.meta.env.VITE_CESIUM_TOKEN ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYWE1OWUxNy1mMWZiLTQzYjYtYTQ5YS1lOTViYjlkZjdjNDkiLCJpZCI6MjU2NTQ1LCJpYXQiOjE3MzI2MDE0OTN9.l9OVl0-GEjkl7GxvGKD0bDjJSy3Ps1Ml9BhWQmVaABs'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

// ── 댐 벽체 색상 ─────────────────────────────────
const DAM_COLOR   = Cesium.Color.fromCssColorString('#f0a500').withAlpha(0.85)
const FLOOD_COLOR = Cesium.Color.fromCssColorString('#1a6fff').withAlpha(0.50)
const SEL_COLOR   = Cesium.Color.fromCssColorString('#00c4b4').withAlpha(0.90)

export default function CesiumViewer({ candidates, selected, heightM, onSelect }) {
  const containerRef  = useRef(null)
  const viewerRef     = useRef(null)
  const wallLayerRef  = useRef([])   // 댐 벽체 entity 목록
  const floodLayerRef = useRef(null) // 수몰면 DataSource
  const markerLayerRef = useRef([])  // 후보지 마커

  // ── Cesium 초기화 (마운트 시 1회) ──────────────
  useEffect(() => {
    let viewer
    ;(async () => {
      try {
        viewer = new Cesium.Viewer(containerRef.current, {
          terrain:              await Cesium.Terrain.fromWorldTerrain(),
          baseLayerPicker:      false,
          navigationHelpButton: false,
          sceneModePicker:      false,
          geocoder:             false,
          homeButton:           false,
          fullscreenButton:     false,
          animation:            false,
          timeline:             false,
          infoBox:              false,
          selectionIndicator:   false,
          creditContainer:      document.createElement('div'), // 저작권 숨김
        })

        viewer.scene.skyAtmosphere.show = true
        viewer.scene.globe.enableLighting = false
        viewer.scene.globe.depthTestAgainstTerrain = true

        viewerRef.current = viewer

        // Philippines Abra 유역 초기 카메라
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(120.58, 16.67, 80000),
          orientation: { pitch: Cesium.Math.toRadians(-40) },
          duration: 2,
        })

        // 클릭 → 후보지 선택
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
        handler.setInputAction(click => {
          const picked = viewer.scene.pick(click.position)
          if (Cesium.defined(picked) && picked.id?.properties?.damId) {
            const damId = picked.id.properties.damId.getValue()
            const c = candidates.find(x => x.id === damId)
            if (c) onSelect(c)
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

      } catch (err) {
        console.error('Cesium 초기화 오류:', err)
      }
    })()

    return () => {
      if (viewer && !viewer.isDestroyed()) viewer.destroy()
      viewerRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 모든 후보지 마커 그리기 ────────────────────
  const drawMarkers = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    markerLayerRef.current.forEach(e => viewer.entities.remove(e))
    markerLayerRef.current = []

    candidates.forEach(c => {
      const isSel = selected?.id === c.id
      const e = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, (c.bed ?? 900) + (c.baseH ?? 60) + 500),
        billboard: {
          image: makePinSvg(c.id, isSel),
          width:  isSel ? 52 : 38,
          height: isSel ? 52 : 38,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { damId: c.id },
      })
      markerLayerRef.current.push(e)
    })
  }, [candidates, selected])

  // ── 선택 댐 벽체 그리기 ────────────────────────
  const drawWall = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    wallLayerRef.current.forEach(e => viewer.entities.remove(e))
    wallLayerRef.current = []

    if (!selected) return

    const fsl = calcFsl(selected, heightM)
    const coords = selected.wallCoords

    if (!coords?.length) return

    // 역사다리꼴 벽체 Wall entity
    // wallCoords: [[lon, lat, alt], ...] 5점
    const positions = coords.flatMap(([lon, lat, alt]) => [lon, lat, alt])

    const wallEnt = viewer.entities.add({
      wall: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(positions),
        material:  DAM_COLOR,
        outline:   true,
        outlineColor: Cesium.Color.fromCssColorString('#ffd700'),
        outlineWidth: 2,
      },
      properties: { damId: selected.id },
    })
    wallLayerRef.current.push(wallEnt)

    // 댐 레이블
    const label = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(selected.lon, selected.lat, fsl + 800),
      label: {
        text:         `${selected.id}\nFSL ${fsl}m EL`,
        font:         '13px Space Mono',
        fillColor:    Cesium.Color.fromCssColorString('#ffd700'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style:        Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -8),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    wallLayerRef.current.push(label)

  }, [selected, heightM])

  // ── 수몰면 로드 & 그리기 ────────────────────────
  const drawFlood = useCallback(async () => {
    const viewer = viewerRef.current
    if (!viewer) return

    // 기존 수몰면 제거
    if (floodLayerRef.current) {
      viewer.dataSources.remove(floodLayerRef.current)
      floodLayerRef.current = null
    }

    if (!selected) return

    try {
      // backend에서 수몰 SHP → GeoJSON 로드
      const fsl = calcFsl(selected, heightM)
      const url = `${API_BASE}/flood-surface/${selected.id}?water_level=${fsl}`
      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) })

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const geojson = await resp.json()

      const ds = await Cesium.GeoJsonDataSource.load(geojson, {
        fill:        FLOOD_COLOR,
        stroke:      Cesium.Color.fromCssColorString('#4499ff').withAlpha(0.7),
        strokeWidth: 1,
        clampToGround: true,
      })
      viewer.dataSources.add(ds)
      floodLayerRef.current = ds

    } catch (err) {
      // Fallback: 로컬 근사 원형 수몰면
      console.warn('flood-surface API 없음, fallback 렌더링:', err.message)
      drawFallbackFlood()
    }
  }, [selected, heightM])

  // 폴백: 타원형 근사 수몰면
  const drawFallbackFlood = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer || !selected) return

    const fsl    = calcFsl(selected, heightM)
    const ratio  = Math.max(0.1, (fsl - (selected.bed ?? 900)) / (selected.baseH ?? 60))
    const rKm    = Math.min(15, 4 * ratio)
    const positions = []

    for (let a = 0; a <= 360; a += 4) {
      const rad = Cesium.Math.toRadians(a)
      positions.push(
        selected.lon + rKm / 111 * Math.cos(rad),
        selected.lat + rKm / 111 * Math.sin(rad) * 0.65,
      )
    }

    const ent = viewer.entities.add({
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(positions),
        material:  FLOOD_COLOR,
        outline:   true,
        outlineColor: Cesium.Color.fromCssColorString('#3399ff').withAlpha(0.6),
        classificationType: Cesium.ClassificationType.TERRAIN,
      },
    })
    // 임시로 wallLayer에 등록해서 다음 갱신 시 제거
    wallLayerRef.current.push(ent)
  }, [selected, heightM])

  // ── 카메라 이동 ────────────────────────────────
  const flyToSelected = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer || !selected) return
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(selected.lon, selected.lat - 0.04, 28000),
      orientation: { pitch: Cesium.Math.toRadians(-32) },
      duration: 1.8,
    })
  }, [selected])

  // ── 리액션: candidates 변경 → 마커 갱신 ─────────
  useEffect(() => { drawMarkers() }, [drawMarkers])

  // ── 리액션: selected / heightM 변경 → 벽체 + 수몰면 ──
  useEffect(() => {
    drawMarkers()
    drawWall()
    drawFlood()
    if (selected) flyToSelected()
  }, [selected?.id, heightM]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative', background: '#000' }}>
      {/* 조작 안내 */}
      <div style={{
        position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(5,12,20,0.80)', border: '1px solid rgba(0,160,200,0.2)',
        borderRadius: 4, padding: '5px 14px',
        fontSize: 10, color: 'rgba(160,200,220,0.7)', fontFamily: 'Space Mono',
        pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
      }}>
        좌클릭 마커 선택 · 우클릭 드래그 회전 · 스크롤 줌
      </div>
    </div>
  )
}

// SVG 핀 이미지 생성 (canvas → dataURL)
function makePinSvg(label, selected) {
  const color = selected ? '#00c4b4' : '#f0a500'
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="20" r="16" fill="${color}" fill-opacity="0.9" stroke="#fff" stroke-width="1.5"/>
      <text x="24" y="25" text-anchor="middle" font-size="11" font-weight="700"
        font-family="Space Mono,monospace" fill="#050c14">${label}</text>
      <polygon points="24,40 18,28 30,28" fill="${color}" fill-opacity="0.9"/>
    </svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}
