import React, { useEffect, useRef, useCallback } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { calcFsl } from '../data/candidates.js'

Cesium.Ion.defaultAccessToken =
  import.meta.env.VITE_CESIUM_TOKEN ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYWE1OWUxNy1mMWZiLTQzYjYtYTQ5YS1lOTViYjlkZjdjNDkiLCJpZCI6MjU2NTQ1LCJpYXQiOjE3MzI2MDE0OTN9.l9OVl0-GEjkl7GxvGKD0bDjJSy3Ps1Ml9BhWQmVaABs'

// ── 댐별 카메라 위치 ─────────────────────────────
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

// ── 댐 실제 축선 좌표 (KMZ 기반) ────────────────
// wallPts가 없는 댐을 위한 fallback
const DAM_AXES = {
  CBC1: { p1:[120.562099,16.693558], p2:[120.561303,16.683156] },
  CBC2: { p1:[120.559751,16.682262], p2:[120.567274,16.689527] },
  CBBC: { p1:[120.56651,16.669431], p2:[120.579141,16.674665] },
  CPC: { p1:[120.593028,16.646491], p2:[120.610485,16.649319] },
  SA1_lower: { p1:[120.607474,16.653048], p2:[120.590123,16.643777] },
  SA1_upper: { p1:[120.622102,16.667096], p2:[120.604057,16.646318] },
  SA2_lower: { p1:[120.568215,16.660338], p2:[120.585557,16.671477] },
  SA2_upper: { p1:[120.54889,16.658168], p2:[120.576628,16.662565] },
}

const DAM_COLOR  = Cesium.Color.fromCssColorString('#f0a500').withAlpha(0.92)
const DAM_OUTL   = Cesium.Color.fromCssColorString('#ffd700')
const FLOOD_FILL = Cesium.Color.fromCssColorString('#1a6fff').withAlpha(0.45)
const FLOOD_STR  = Cesium.Color.fromCssColorString('#55aaff').withAlpha(0.90)

export default function CesiumViewer({ candidates, selected, heightM, showFlood, simResult, onSelect }) {
  const containerRef = useRef(null)
  const viewerRef    = useRef(null)
  const damEntRef    = useRef([])
  const floodEntRef  = useRef([])
  const markerEntRef = useRef([])

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

        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(120.58, 16.60, 50000),
          orientation: { heading:0, pitch:Cesium.Math.toRadians(-30), roll:0 },
        })

        const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
        handler.setInputAction(click => {
          const picked = viewer.scene.pick(click.position)
          if (Cesium.defined(picked) && picked.id?.properties?.damId) {
            const id = picked.id.properties.damId.getValue()
            const c  = candidates.find(x => x.id === id)
            if (c) onSelect(c)
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

      } catch (err) { console.error('Cesium 초기화 오류:', err) }
    })()
    return () => { if (viewer && !viewer.isDestroyed()) viewer.destroy(); viewerRef.current = null }
  }, []) // eslint-disable-line

  const clearEnts = (ref) => {
    const v = viewerRef.current
    if (!v) return
    ref.current.forEach(e => { try { v.entities.remove(e) } catch(_){} })
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

  // ── 댐 벽체 ──────────────────────────────────────
  // wallPts(DEM 샘플) 있으면 지형 맞춤 Wall
  // 없으면 DAM_AXES 축선으로 단순 Wall
  const drawDam = useCallback(() => {
    const v = viewerRef.current
    if (!v || !selected) return
    clearEnts(damEntRef)

    const fsl = calcFsl(selected, heightM)
    const bed = selected.bed ?? (fsl - heightM)
    const axis = DAM_AXES[selected.id]

    if (selected.wallPts?.length >= 2) {
      // wallPts: [[lon, lat, terrainElev], ...]
      const pts  = selected.wallPts
      const lons = pts.map(p => p[0])
      const lats = pts.map(p => p[1])
      const terr = pts.map(p => p[2])

      damEntRef.current.push(v.entities.add({
        wall: {
          positions:      Cesium.Cartesian3.fromDegreesArray(lons.flatMap((lo,i)=>[lo,lats[i]])),
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
            lons.flatMap((lo,i) => [lo, lats[i], fsl])
          ),
          width: 4,
          material: new Cesium.PolylineOutlineMaterialProperty({
            color: DAM_OUTL, outlineWidth:1, outlineColor: Cesium.Color.BLACK,
          }),
        },
      }))

    } else if (axis) {
      // DAM_AXES 축선으로 단순 수직 Wall
      const [x1,y1] = axis.p1
      const [x2,y2] = axis.p2
      damEntRef.current.push(v.entities.add({
        wall: {
          positions:      Cesium.Cartesian3.fromDegreesArray([x1,y1, x2,y2]),
          maximumHeights: [fsl, fsl],
          minimumHeights: [bed, bed],
          material:       DAM_COLOR,
          outline:        true,
          outlineColor:   DAM_OUTL,
          outlineWidth:   2,
        },
      }))
      damEntRef.current.push(v.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights([x1,y1,fsl, x2,y2,fsl]),
          width: 4,
          material: new Cesium.PolylineOutlineMaterialProperty({
            color: DAM_OUTL, outlineWidth:1, outlineColor: Cesium.Color.BLACK,
          }),
        },
      }))
    }

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

  // ── 수몰면 — FSL 고도의 수평 평면 ───────────────
  // classificationType 제거 → extrudedHeight 없이 height=FSL로 수평면 표시
  const drawFlood = useCallback(() => {
    const v = viewerRef.current
    if (!v) return
    clearEnts(floodEntRef)
    if (!showFlood || !selected) return

    const fsl = calcFsl(selected, heightM)

    const addFloodPolygon = (ring) => {
      // FSL 고도의 수평 평면 — height로 고도 지정, extrudedHeight 없음
      const positions = ring.map(([lo, la]) => Cesium.Cartesian3.fromDegrees(lo, la, fsl))
      floodEntRef.current.push(v.entities.add({
        polygon: {
          hierarchy:     new Cesium.PolygonHierarchy(positions),
          material:      FLOOD_FILL,
          outline:       true,
          outlineColor:  FLOOD_STR,
          outlineWidth:  2,
          height:        fsl,      // 수면 고도 고정
          perPositionHeight: false, // 모든 점 같은 고도
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
        rings.forEach(ring => addFloodPolygon(ring))
      }
      return
    }

    // 2순위: 내장 reservoirCoords
    if (selected.reservoirCoords?.length) {
      selected.reservoirCoords.forEach(ring => addFloodPolygon(ring))
    }
  }, [selected, showFlood, simResult, heightM])

  // ── 카메라 ───────────────────────────────────────
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

  // ── 리액션 ───────────────────────────────────────
  useEffect(() => { drawMarkers() }, [drawMarkers])

  useEffect(() => {
    drawMarkers(); drawDam(); drawFlood()
    if (selected) flyToSelected()
  }, [selected?.id]) // eslint-disable-line

  useEffect(() => {
    drawDam(); drawFlood()
  }, [heightM]) // eslint-disable-line

  useEffect(() => {
    drawFlood()
  }, [showFlood, simResult?.flood_geojson]) // eslint-disable-line

  return (
    <div ref={containerRef} style={{ flex:1, position:'relative', background:'#000' }}>
      <div style={{
        position:'absolute', bottom:12, left:'50%', transform:'translateX(-50%)',
        background:'rgba(5,12,20,0.80)', border:'1px solid rgba(0,160,200,0.2)',
        borderRadius:4, padding:'5px 14px',
        fontSize:10, color:'rgba(160,200,220,0.7)', fontFamily:'monospace',
        pointerEvents:'none', zIndex:10, whiteSpace:'nowrap',
      }}>
        좌클릭 마커 선택 · 우클릭 드래그 회전 · 스크롤 줌
      </div>
    </div>
  )
}
