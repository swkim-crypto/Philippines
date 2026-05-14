import React, { useEffect, useRef, useCallback } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { calcFsl } from '../data/candidates.js'

Cesium.Ion.defaultAccessToken =
  import.meta.env.VITE_CESIUM_TOKEN ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYWE1OWUxNy1mMWZiLTQzYjYtYTQ5YS1lOTViYjlkZjdjNDkiLCJpZCI6MjU2NTQ1LCJpYXQiOjE3MzI2MDE0OTN9.l9OVl0-GEjkl7GxvGKD0bDjJSy3Ps1Ml9BhWQmVaABs'

const API_BASE   = import.meta.env.VITE_API_URL ?? '/api'
const DAM_COLOR  = Cesium.Color.fromCssColorString('#f0a500').withAlpha(0.95)
const DAM_OUTL   = Cesium.Color.fromCssColorString('#ffd700')
const FLOOD_FILL = Cesium.Color.fromCssColorString('#1a6fff').withAlpha(0.55)
const FLOOD_STR  = Cesium.Color.fromCssColorString('#55aaff').withAlpha(0.80)

// ── 댐별 실측 축선 좌표 & 저수면 방향 (KMZ 기반) ─────
const DAM_AXES = {
  CBC1:      { p1:[120.570046,16.694348], p2:[120.564047,16.685655], resDirOffset: 180 },
  CBC2:      { p1:[120.580753,16.680504], p2:[120.564551,16.683177], resDirOffset: 90  },
  CBBC:      { p1:[120.558171,16.658711], p2:[120.575232,16.669352], resDirOffset: -90 },
  CPC:       { p1:[120.597840,16.633804], p2:[120.604583,16.645846], resDirOffset: 0   },
  SA1_lower: { p1:[120.600647,16.648432], p2:[120.600691,16.647377], resDirOffset: 0   },
  SA1_upper: { p1:[120.615876,16.659307], p2:[120.613640,16.652956], resDirOffset: 0   },
  SA2_lower: { p1:[120.577391,16.664078], p2:[120.580328,16.665107], resDirOffset: 0   },
  SA2_upper: { p1:[120.563158,16.657650], p2:[120.558132,16.653742], resDirOffset: 0   },
}

export default function CesiumViewer({ candidates, selected, heightM, onSelect }) {
  const containerRef   = useRef(null)
  const viewerRef      = useRef(null)
  const damLayerRef    = useRef([])
  const floodLayerRef  = useRef(null)
  const markerLayerRef = useRef([])

  // ── 초기화 ──────────────────────────────────────
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

        // 초기 카메라 — Abra 유역 남쪽에서 북쪽 내륙 바라보기
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(120.58, 16.55, 45000),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch:   Cesium.Math.toRadians(-22),
            roll:    0,
          },
        })

        const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
        handler.setInputAction(click => {
          const picked = viewer.scene.pick(click.position)
          if (Cesium.defined(picked) && picked.id?.properties?.damId) {
            const id = picked.id.properties.damId.getValue()
            const c = candidates.find(x => x.id === id)
            if (c) onSelect(c)
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

      } catch (err) { console.error('Cesium 오류:', err) }
    })()
    return () => { if (viewer && !viewer.isDestroyed()) viewer.destroy(); viewerRef.current = null }
  }, []) // eslint-disable-line

  // ── 마커 (지형에 붙음) ───────────────────────────
  const drawMarkers = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    markerLayerRef.current.forEach(e => viewer.entities.remove(e))
    markerLayerRef.current = []
    candidates.forEach(c => {
      const isSel = selected?.id === c.id
      markerLayerRef.current.push(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat),
        billboard: {
          image: makePinSvg(c.id, isSel),
          width: isSel ? 56 : 40, height: isSel ? 56 : 40,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { damId: c.id },
      }))
    })
  }, [candidates, selected])

  // ── 댐 벽체 (실제 축선 기반 수직 Wall) ──────────
  const drawDam = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    damLayerRef.current.forEach(e => viewer.entities.remove(e))
    damLayerRef.current = []
    if (!selected) return

    const fsl  = calcFsl(selected, heightM)
    const bed  = selected.bed ?? (fsl - heightM)
    const axis = DAM_AXES[selected.id]
    const lon  = selected.lon, lat = selected.lat

    if (axis) {
      // 실제 축선 좌표로 Wall entity 생성 (수직 벽)
      const [x1, y1] = axis.p1
      const [x2, y2] = axis.p2

      // Wall: 상단=FSL, 하단=Bed 고도
      const wallEnt = viewer.entities.add({
        wall: {
          positions: Cesium.Cartesian3.fromDegreesArray([x1, y1, x2, y2]),
          maximumHeights: [fsl, fsl],
          minimumHeights: [bed, bed],
          material: DAM_COLOR,
          outline: true,
          outlineColor: DAM_OUTL,
          outlineWidth: 3,
        },
      })
      damLayerRef.current.push(wallEnt)

      // 마루 상단 라인 강조
      const topLine = viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights([x1,y1,fsl, x2,y2,fsl]),
          width: 4,
          material: new Cesium.PolylineOutlineMaterialProperty({
            color: DAM_OUTL,
            outlineWidth: 1,
            outlineColor: Cesium.Color.BLACK,
          }),
          clampToGround: false,
        },
      })
      damLayerRef.current.push(topLine)

    } else {
      // 축선 없는 경우 — E-W 방향 기본 Wall
      const dLon = 0.003
      const wallEnt = viewer.entities.add({
        wall: {
          positions: Cesium.Cartesian3.fromDegreesArray([lon-dLon,lat, lon+dLon,lat]),
          maximumHeights: [fsl, fsl],
          minimumHeights: [bed, bed],
          material: DAM_COLOR,
          outline: true, outlineColor: DAM_OUTL, outlineWidth: 3,
        },
      })
      damLayerRef.current.push(wallEnt)
    }

    // 레이블
    damLayerRef.current.push(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, fsl + 120),
      label: {
        text: `${selected.id}  FSL ${fsl.toFixed(0)}m EL`,
        font: '13px Space Mono',
        fillColor: Cesium.Color.fromCssColorString('#ffd700'),
        outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }))
  }, [selected, heightM])

  // ── 저수면 (reservoirs.geojson 댐별 필터) ────────
  const drawFlood = useCallback(async () => {
    const viewer = viewerRef.current
    if (!viewer) return
    if (floodLayerRef.current) { viewer.dataSources.remove(floodLayerRef.current); floodLayerRef.current = null }
    if (!selected) return

    const loadDs = async (geojson) => {
      const ds = await Cesium.GeoJsonDataSource.load(geojson, {
        fill: FLOOD_FILL, stroke: FLOOD_STR, strokeWidth: 2, clampToGround: true,
      })
      viewer.dataSources.add(ds)
      floodLayerRef.current = ds
    }

    // 1순위: 백엔드
    try {
      const fsl  = calcFsl(selected, heightM)
      const resp = await fetch(`${API_BASE}/flood-surface/${selected.id}?water_level=${fsl}`, { signal: AbortSignal.timeout(12000) })
      if (!resp.ok) throw new Error()
      await loadDs(await resp.json()); return
    } catch (_) {}

    // 2순위: public/reservoirs.geojson — 댐 ID 매칭
    try {
      const resp = await fetch('/reservoirs.geojson')
      if (!resp.ok) throw new Error()
      const all  = await resp.json()
      const base = selected.id.split('_')[0]   // CBC1, CBBC 등
      const feats = all.features.filter(f =>
        (f.properties?.dam_id ?? '').startsWith(base) ||
        (f.properties?.layer  ?? '').startsWith(base)
      )
      if (feats.length) await loadDs({ ...all, features: feats })
    } catch (_) {}
  }, [selected, heightM])

  // ── 카메라: 댐 축선 하류쪽에서 상류 바라보기 ─────
  const flyToSelected = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer || !selected) return

    const fsl  = calcFsl(selected, heightM)
    const axis = DAM_AXES[selected.id]
    const lon  = selected.lon, lat = selected.lat
    const alt  = Math.max(fsl + 2000, 4000)

    let heading = 0  // 기본: 북쪽 바라봄

    if (axis) {
      // 축선 방위각 계산 → 댐 하류 방향에서 바라보는 heading
      const dx = axis.p2[0] - axis.p1[0]
      const dy = axis.p2[1] - axis.p1[1]
      const axBearing = Math.atan2(dx, dy)  // 축선 방위 (rad)
      // 하류 방향 = 저수면 반대쪽 → heading은 상류를 향해야 함
      heading = axBearing + Math.PI / 2  // 축선에 수직
    }

    // 카메라를 하류에 위치 (댐 남쪽 0.03° = ~3km)
    const camLon = lon + Math.sin(heading) * 0.03
    const camLat = lat - Math.cos(heading) * 0.03

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(camLon, camLat, alt),
      orientation: {
        heading: heading,
        pitch:   Cesium.Math.toRadians(-15),
        roll:    0,
      },
      duration: 1.8,
    })
  }, [selected, heightM])

  useEffect(() => { drawMarkers() }, [drawMarkers])
  useEffect(() => {
    drawMarkers(); drawDam(); drawFlood()
    if (selected) flyToSelected()
  }, [selected?.id, heightM]) // eslint-disable-line

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative', background: '#000' }}>
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

function makePinSvg(label, sel) {
  const c = sel ? '#00c4b4' : '#f0a500'
  return `data:image/svg+xml;base64,${btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="22" r="18" fill="${c}" fill-opacity="0.92" stroke="#fff" stroke-width="1.5"/>
      <text x="28" y="27" text-anchor="middle" font-size="10" font-weight="700"
        font-family="Space Mono,monospace" fill="#050c14">${label}</text>
      <polygon points="28,46 21,34 35,34" fill="${c}" fill-opacity="0.92"/>
    </svg>`
  )}`
}
