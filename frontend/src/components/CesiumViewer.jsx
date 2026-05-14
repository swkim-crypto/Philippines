import React, { useEffect, useRef, useCallback } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { calcFsl } from '../data/candidates.js'

Cesium.Ion.defaultAccessToken =
  import.meta.env.VITE_CESIUM_TOKEN ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYWE1OWUxNy1mMWZiLTQzYjYtYTQ5YS1lOTViYjlkZjdjNDkiLCJpZCI6MjU2NTQ1LCJpYXQiOjE3MzI2MDE0OTN9.l9OVl0-GEjkl7GxvGKD0bDjJSy3Ps1Ml9BhWQmVaABs'

// ── 댐별 계산된 카메라 위치 (하류→상류 방향) ────────
const CAM = {
  CBC1:      { lon:120.59047, lat:16.67496, alt:2738,  heading:-56.3 },
  CBC2:      { lon:120.56791, lat:16.65509, alt:2734,  heading:9.7   },
  CBBC:      { lon:120.58197, lat:16.64124, alt:2816,  heading:-32.9 },
  CPC:       { lon:120.62596, lat:16.62692, alt:2922,  heading:-61.6 },
  SA1_lower: { lon:120.57256, lat:16.64681, alt:2979,  heading:87.7  },
  SA1_upper: { lon:120.64139, lat:16.64740, alt:3624,  heading:-71.2 },
  SA2_lower: { lon:120.58846, lat:16.63908, alt:3006,  heading:-20.0 },
  SA2_upper: { lon:120.57830, lat:16.63456, alt:3725,  heading:-38.9 },
}

const DAM_COLOR  = Cesium.Color.fromCssColorString('#f0a500').withAlpha(0.92)
const DAM_OUTL   = Cesium.Color.fromCssColorString('#ffd700')
const FLOOD_FILL = Cesium.Color.fromCssColorString('#1a6fff').withAlpha(0.52)
const FLOOD_STR  = Cesium.Color.fromCssColorString('#55aaff').withAlpha(0.80)

export default function CesiumViewer({ candidates, selected, heightM, onSelect }) {
  const containerRef   = useRef(null)
  const viewerRef      = useRef(null)
  const damEntRef      = useRef([])
  const floodEntRef    = useRef([])
  const markerEntRef   = useRef([])

  // ── 초기화 (1회) ────────────────────────────────
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
          creditContainer:      document.createElement('div'),
        })
        viewer.scene.skyAtmosphere.show = true
        viewer.scene.globe.enableLighting = false
        viewer.scene.globe.depthTestAgainstTerrain = false
        viewerRef.current = viewer

        // 초기: Abra 유역 전체 — 남서쪽에서 내륙 바라보기
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(120.52, 16.60, 40000),
          orientation: {
            heading: Cesium.Math.toRadians(35),
            pitch:   Cesium.Math.toRadians(-25),
            roll:    0,
          },
        })

        // 클릭 선택
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
        handler.setInputAction(click => {
          const picked = viewer.scene.pick(click.position)
          if (Cesium.defined(picked) && picked.id?.properties?.damId) {
            const id = picked.id.properties.damId.getValue()
            const c  = candidates.find(x => x.id === id)
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
  }, []) // eslint-disable-line

  // ── 헬퍼: entity 목록 제거 ───────────────────────
  const clearEntities = (ref) => {
    const viewer = viewerRef.current
    if (!viewer) return
    ref.current.forEach(e => { try { viewer.entities.remove(e) } catch(_){} })
    ref.current = []
  }

  // ── 마커 그리기 ─────────────────────────────────
  const drawMarkers = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    clearEntities(markerEntRef)

    candidates.forEach(c => {
      const isSel = selected?.id === c.id
      const color = isSel ? '#00c4b4' : '#f0a500'
      const size  = isSel ? 56 : 40
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="22" r="18" fill="${color}" fill-opacity="0.92" stroke="#fff" stroke-width="1.5"/>
        <text x="28" y="27" text-anchor="middle" font-size="9" font-weight="700"
          font-family="monospace" fill="#050c14">${c.id}</text>
        <polygon points="28,46 21,34 35,34" fill="${color}" fill-opacity="0.92"/>
      </svg>`
      const img = `data:image/svg+xml;base64,${btoa(svg)}`

      markerEntRef.current.push(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat),
        billboard: {
          image: img, width: size, height: size,
          verticalOrigin:  Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { damId: c.id },
      }))
    })
  }, [candidates, selected])

  // ── 댐 벽체 그리기 (지형 맞춤 Wall) ────────────
  const drawDam = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    clearEntities(damEntRef)
    if (!selected) return

    const fsl     = calcFsl(selected, heightM)
    const wallPts = selected.wallPts  // [[lon, lat, terrainElev], ...]
    const lon     = selected.lon
    const lat     = selected.lat

    if (wallPts?.length >= 2) {
      // 지형 고도 맞춤 Wall
      const lons       = wallPts.map(p => p[0])
      const lats       = wallPts.map(p => p[1])
      const terrainEls = wallPts.map(p => p[2])

      // Wall: top=FSL, bottom=지형
      damEntRef.current.push(viewer.entities.add({
        wall: {
          positions:      Cesium.Cartesian3.fromDegreesArray(lons.flatMap((lo,i) => [lo, lats[i]])),
          maximumHeights: wallPts.map(() => fsl),
          minimumHeights: terrainEls,
          material:       DAM_COLOR,
          outline:        true,
          outlineColor:   DAM_OUTL,
          outlineWidth:   2,
        },
      }))

      // 마루 강조선
      const topPts = lons.flatMap((lo,i) => [lo, lats[i], fsl])
      damEntRef.current.push(viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(topPts),
          width: 4,
          material: new Cesium.PolylineOutlineMaterialProperty({
            color: DAM_OUTL, outlineWidth: 1, outlineColor: Cesium.Color.BLACK,
          }),
        },
      }))
    }

    // FSL 레이블
    damEntRef.current.push(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, fsl + 100),
      label: {
        text:         `${selected.id}  FSL ${fsl.toFixed(0)}m EL`,
        font:         '13px monospace',
        fillColor:    Cesium.Color.fromCssColorString('#ffd700'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style:        Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }))
  }, [selected, heightM])

  // ── 저수면 그리기 (내장 좌표) ───────────────────
  const drawFlood = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    clearEntities(floodEntRef)
    if (!selected?.reservoirCoords?.length) return

    selected.reservoirCoords.forEach(ring => {
      const positions = ring.flatMap(([lo, la]) => [lo, la])
      floodEntRef.current.push(viewer.entities.add({
        polygon: {
          hierarchy:          Cesium.Cartesian3.fromDegreesArray(positions),
          material:           FLOOD_FILL,
          outline:            true,
          outlineColor:       FLOOD_STR,
          outlineWidth:       2,
          classificationType: Cesium.ClassificationType.TERRAIN,
        },
      }))
    })
  }, [selected])

  // ── 카메라: 사전 계산된 위치로 이동 ─────────────
  const flyToSelected = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer || !selected) return
    const cam = CAM[selected.id]
    if (!cam) return

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, cam.alt),
      orientation: {
        heading: Cesium.Math.toRadians(cam.heading),
        pitch:   Cesium.Math.toRadians(-18),
        roll:    0,
      },
      duration: 1.5,
    })
  }, [selected])

  // ── 리액션 ──────────────────────────────────────
  useEffect(() => { drawMarkers() }, [drawMarkers])

  useEffect(() => {
    drawMarkers()
    drawDam()
    drawFlood()
    if (selected) flyToSelected()
  }, [selected?.id, heightM]) // eslint-disable-line

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative', background: '#000' }}>
      <div style={{
        position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(5,12,20,0.80)', border: '1px solid rgba(0,160,200,0.2)',
        borderRadius: 4, padding: '5px 14px',
        fontSize: 10, color: 'rgba(160,200,220,0.7)', fontFamily: 'monospace',
        pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
      }}>
        좌클릭 마커 선택 · 우클릭 드래그 회전 · 스크롤 줌
      </div>
    </div>
  )
}
