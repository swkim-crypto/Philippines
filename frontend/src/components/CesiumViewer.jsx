import React, { useEffect, useRef, useCallback } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { calcFsl } from '../data/candidates.js'

Cesium.Ion.defaultAccessToken =
  import.meta.env.VITE_CESIUM_TOKEN ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYWE1OWUxNy1mMWZiLTQzYjYtYTQ5YS1lOTViYjlkZjdjNDkiLCJpZCI6MjU2NTQ1LCJpYXQiOjE3MzI2MDE0OTN9.l9OVl0-GEjkl7GxvGKD0bDjJSy3Ps1Ml9BhWQmVaABs'

// ── 댐별 카메라 위치 (하류→댐 바라보기, Python 계산) ─
const CAM = {
  CBC1:      { lon:120.58111, lat:16.66650, alt:2238, heading:-30.0 },
  CBC2:      { lon:120.57754, lat:16.65511, alt:2234, heading:-10.0 },
  CBBC:      { lon:120.53857, lat:16.66403, alt:2316, heading:90.0  },
  CPC:       { lon:120.61083, lat:16.61432, alt:2422, heading:-20.0 },
  SA1_lower: { lon:120.60067, lat:16.67504, alt:2479, heading:180.0 },
  SA1_upper: { lon:120.61476, lat:16.68327, alt:3124, heading:180.0 },
  SA2_lower: { lon:120.57886, lat:16.69173, alt:2506, heading:180.0 },
  SA2_upper: { lon:120.56064, lat:16.68284, alt:3225, heading:180.0 },
}

const DAM_COLOR  = Cesium.Color.fromCssColorString('#f0a500').withAlpha(0.92)
const DAM_OUTL   = Cesium.Color.fromCssColorString('#ffd700')
const FLOOD_FILL = Cesium.Color.fromCssColorString('#1a6fff').withAlpha(0.52)
const FLOOD_STR  = Cesium.Color.fromCssColorString('#55aaff').withAlpha(0.80)

export default function CesiumViewer({ candidates, selected, heightM, showFlood, simResult, onSelect }) {
  const containerRef = useRef(null)
  const viewerRef    = useRef(null)
  const damEntRef    = useRef([])
  const floodEntRef  = useRef([])
  const markerEntRef = useRef([])

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

        // 초기 뷰: Abra 유역 전체
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(120.58, 16.60, 50000),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch:   Cesium.Math.toRadians(-30),
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

  // ── entity 목록 제거 헬퍼 ───────────────────────
  const clearEnts = (ref) => {
    const v = viewerRef.current
    if (!v) return
    ref.current.forEach(e => { try { v.entities.remove(e) } catch (_) {} })
    ref.current = []
  }

  // ── 마커 ─────────────────────────────────────────
  const drawMarkers = useCallback(() => {
    const v = viewerRef.current
    if (!v) return
    clearEnts(markerEntRef)
    candidates.forEach(c => {
      const isSel = selected?.id === c.id
      const color = isSel ? '#00c4b4' : '#f0a500'
      const size  = isSel ? 52 : 38
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="20" r="16" fill="${color}" fill-opacity="0.92" stroke="#fff" stroke-width="1.5"/>
        <text x="26" y="25" text-anchor="middle" font-size="8.5" font-weight="700"
          font-family="monospace" fill="#050c14">${c.id}</text>
        <polygon points="26,44 19,32 33,32" fill="${color}" fill-opacity="0.92"/>
      </svg>`
      markerEntRef.current.push(v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat),
        billboard: {
          image: `data:image/svg+xml;base64,${btoa(svg)}`,
          width: size, height: size,
          verticalOrigin:  Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { damId: c.id },
      }))
    })
  }, [candidates, selected])

  // ── 댐 벽체 (wallPts 지형 맞춤 Wall) ────────────
  const drawDam = useCallback(() => {
    const v = viewerRef.current
    if (!v) return
    clearEnts(damEntRef)
    if (!selected?.wallPts?.length) return

    const fsl  = calcFsl(selected, heightM)
    const pts  = selected.wallPts
    const lons = pts.map(p => p[0])
    const lats = pts.map(p => p[1])
    const terr = pts.map(p => p[2])

    // Wall entity: 상단=FSL, 하단=지형고도
    damEntRef.current.push(v.entities.add({
      wall: {
        positions:      Cesium.Cartesian3.fromDegreesArray(lons.flatMap((lo, i) => [lo, lats[i]])),
        maximumHeights: pts.map(() => fsl),
        minimumHeights: terr,
        material:       DAM_COLOR,
        outline:        true,
        outlineColor:   DAM_OUTL,
        outlineWidth:   2,
      },
    }))

    // 마루 강조선
    damEntRef.current.push(v.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(
          lons.flatMap((lo, i) => [lo, lats[i], fsl])
        ),
        width: 4,
        material: new Cesium.PolylineOutlineMaterialProperty({
          color: DAM_OUTL, outlineWidth: 1, outlineColor: Cesium.Color.BLACK,
        }),
      },
    }))

    // FSL 레이블
    damEntRef.current.push(v.entities.add({
      position: Cesium.Cartesian3.fromDegrees(selected.lon, selected.lat, fsl + 80),
      label: {
        text:         `${selected.id}  FSL ${fsl.toFixed(0)}m`,
        font:         '12px monospace',
        fillColor:    Cesium.Color.fromCssColorString('#ffd700'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style:        Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }))
  }, [selected, heightM])

  // ── 저수면 (API GeoJSON 우선, fallback: 내장 좌표) ─
  const drawFlood = useCallback(async () => {
    const v = viewerRef.current
    if (!v) return
    clearEnts(floodEntRef)
    if (!showFlood || !selected) return

    const addPolygon = (positions) => {
      floodEntRef.current.push(v.entities.add({
        polygon: {
          hierarchy:          Cesium.Cartesian3.fromDegreesArray(positions),
          material:           FLOOD_FILL,
          outline:            true,
          outlineColor:       FLOOD_STR,
          outlineWidth:       2,
          classificationType: Cesium.ClassificationType.TERRAIN,
        },
      }))
    }

    // 1순위: simResult API GeoJSON
    const geojson = simResult?.flood_geojson
    if (geojson?.features?.length) {
      for (const feat of geojson.features) {
        const geom = feat.geometry
        if (!geom) continue
        const rings = geom.type === 'Polygon'
          ? geom.coordinates
          : geom.type === 'MultiPolygon'
            ? geom.coordinates.flat()
            : []
        rings.forEach(ring => {
          addPolygon(ring.flatMap(([lo, la]) => [lo, la]))
        })
      }
      return
    }

    // 2순위: 내장 reservoirCoords (기준 수위 폴리곤)
    if (selected.reservoirCoords?.length) {
      selected.reservoirCoords.forEach(ring => {
        addPolygon(ring.flatMap(([lo, la]) => [lo, la]))
      })
    }
  }, [selected, showFlood, simResult])

  // ── 카메라 이동 (댐 선택 시만) ──────────────────
  const flyToSelected = useCallback(() => {
    const v   = viewerRef.current
    const cam = CAM[selected?.id]
    if (!v || !cam) return
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, cam.alt),
      orientation: {
        heading: Cesium.Math.toRadians(cam.heading),
        pitch:   Cesium.Math.toRadians(-20),
        roll:    0,
      },
      duration: 1.5,
    })
  }, [selected])

  // ── 리액션: candidates/selected 변경 → 마커 갱신 ─
  useEffect(() => { drawMarkers() }, [drawMarkers])

  // ── 리액션: 댐 선택 변경 → 카메라 이동 + 댐/수몰 갱신
  useEffect(() => {
    drawMarkers()
    drawDam()
    drawFlood()
    if (selected) flyToSelected()
  }, [selected?.id]) // eslint-disable-line

  // ── 리액션: 높이 변경 → 댐/수몰만 갱신 (카메라 이동 없음)
  useEffect(() => {
    drawDam()
    drawFlood()
  }, [heightM]) // eslint-disable-line

  // ── 리액션: 수몰 토글 + simResult 갱신
  useEffect(() => {
    drawFlood()
  }, [showFlood, simResult?.flood_geojson]) // eslint-disable-line

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
