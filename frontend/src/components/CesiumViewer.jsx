import React, { useEffect, useRef, useCallback } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { calcFsl } from '../data/candidates.js'

Cesium.Ion.defaultAccessToken =
  import.meta.env.VITE_CESIUM_TOKEN ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYWE1OWUxNy1mMWZiLTQzYjYtYTQ5YS1lOTViYjlkZjdjNDkiLCJpZCI6MjU2NTQ1LCJpYXQiOjE3MzI2MDE0OTN9.l9OVl0-GEjkl7GxvGKD0bDjJSy3Ps1Ml9BhWQmVaABs'

const API_BASE   = import.meta.env.VITE_API_URL ?? '/api'
const DAM_COLOR  = Cesium.Color.fromCssColorString('#f0a500').withAlpha(0.92)
const DAM_OUTL   = Cesium.Color.fromCssColorString('#ffd700')
const FLOOD_FILL = Cesium.Color.fromCssColorString('#1a6fff').withAlpha(0.55)
const FLOOD_STR  = Cesium.Color.fromCssColorString('#55aaff').withAlpha(0.80)

export default function CesiumViewer({ candidates, selected, heightM, onSelect }) {
  const containerRef  = useRef(null)
  const viewerRef     = useRef(null)
  const damLayerRef   = useRef([])
  const floodLayerRef = useRef(null)
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

        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(120.58, 16.62, 55000),
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-35), roll: 0 },
          duration: 2,
        })

        const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
        handler.setInputAction(click => {
          const picked = viewer.scene.pick(click.position)
          if (Cesium.defined(picked) && picked.id?.properties?.damId) {
            const damId = picked.id.properties.damId.getValue()
            const c = candidates.find(x => x.id === damId)
            if (c) onSelect(c)
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

      } catch (err) { console.error('Cesium 초기화 오류:', err) }
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
          width: isSel ? 56 : 42, height: isSel ? 56 : 42,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { damId: c.id },
      }))
    })
  }, [candidates, selected])

  // ── 댐 심볼 (역사다리꼴 3D 솔리드) ──────────────
  const drawDam = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    damLayerRef.current.forEach(e => viewer.entities.remove(e))
    damLayerRef.current = []
    if (!selected) return

    const fsl = calcFsl(selected, heightM)
    const bed = selected.bed ?? (fsl - heightM)
    const lon = selected.lon, lat = selected.lat

    // 역사다리꼴: 상단 넓고 하단 좁음
    const tW = 0.004   // 상단 반폭 ~400m
    const bW = 0.0008  // 하단 반폭 ~80m
    const dY = 0.0010  // 두께 ~100m

    const faces = [
      // 앞면(하류)
      [lon-tW,lat-dY,fsl, lon+tW,lat-dY,fsl, lon+bW,lat-dY,bed, lon-bW,lat-dY,bed],
      // 뒷면(상류)
      [lon-tW,lat+dY,fsl, lon+tW,lat+dY,fsl, lon+bW,lat+dY,bed, lon-bW,lat+dY,bed],
      // 마루(상단)
      [lon-tW,lat-dY,fsl, lon+tW,lat-dY,fsl, lon+tW,lat+dY,fsl, lon-tW,lat+dY,fsl],
      // 우측면
      [lon+tW,lat-dY,fsl, lon+tW,lat+dY,fsl, lon+bW,lat+dY,bed, lon+bW,lat-dY,bed],
      // 좌측면
      [lon-tW,lat-dY,fsl, lon-tW,lat+dY,fsl, lon-bW,lat+dY,bed, lon-bW,lat-dY,bed],
    ]

    faces.forEach(pts => {
      damLayerRef.current.push(viewer.entities.add({
        polygon: {
          hierarchy: { positions: Cesium.Cartesian3.fromDegreesArrayHeights(pts) },
          material: DAM_COLOR, perPositionHeight: true,
          outline: true, outlineColor: DAM_OUTL, outlineWidth: 2,
        },
      }))
    })

    // 레이블
    damLayerRef.current.push(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, fsl + 150),
      label: {
        text: `${selected.id}  FSL ${fsl.toFixed(0)}m EL`,
        font: '12px Space Mono',
        fillColor: Cesium.Color.fromCssColorString('#ffd700'),
        outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }))
  }, [selected, heightM])

  // ── 저수면 (상류 폴리곤) ─────────────────────────
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

    // 1순위: 백엔드 API
    try {
      const fsl  = calcFsl(selected, heightM)
      const resp = await fetch(`${API_BASE}/flood-surface/${selected.id}?water_level=${fsl}`, { signal: AbortSignal.timeout(12000) })
      if (!resp.ok) throw new Error()
      await loadDs(await resp.json()); return
    } catch (_) {}

    // 2순위: public/reservoirs.geojson (댐 ID 필터)
    try {
      const resp = await fetch('/reservoirs.geojson')
      if (!resp.ok) throw new Error()
      const all = await resp.json()
      const damBase = selected.id.split('_')[0]
      const feats = all.features.filter(f =>
        (f.properties?.dam_id ?? '').startsWith(damBase) ||
        (f.properties?.layer  ?? '').startsWith(damBase)
      )
      await loadDs({ ...all, features: feats.length ? feats : all.features })
    } catch (_) {}
  }, [selected, heightM])

  // ── 카메라: 하류에서 댐(상류) 바라보기 ───────────
  const flyToSelected = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer || !selected) return
    const fsl = calcFsl(selected, heightM)
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        selected.lon,
        selected.lat - 0.022,          // 댐 남쪽(하류)에 카메라
        Math.max(fsl + 2500, 5000),    // 높이
      ),
      orientation: {
        heading: Cesium.Math.toRadians(0),   // 북쪽(상류) 바라봄
        pitch:   Cesium.Math.toRadians(-18), // 약간 내려다봄
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
