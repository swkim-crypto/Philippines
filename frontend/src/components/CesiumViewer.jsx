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

// ── 댐 축선 + IfSAR DEM 실측 bed 고도 ───────────
// bed: AbraCatchment_IfSAR-DTM_UTM51N.tif 축선 10등분 샘플 최솟값
// drop: 하부댐 bed 대비 유효낙차(m) — 양수발전 설계 기초값
const DAM_AXES = {
  // ── 하부댐 (저수댐) ───────────────────────────
  CBC1:      { p1:[120.562099,16.693558], p2:[120.561303,16.683156], type:'lower', cat:'CBC',  bed:211.3 },
  CBC2:      { p1:[120.559751,16.682262], p2:[120.567274,16.689527], type:'lower', cat:'CBC',  bed:211.3 },
  CBBC:      { p1:[120.566510,16.669431], p2:[120.579141,16.674665], type:'lower', cat:'CBBC', bed:303.8 },
  CPC:       { p1:[120.593028,16.646491], p2:[120.610485,16.649319], type:'lower', cat:'CPC',  bed:395.0 },
  SA1_lower: { p1:[120.607474,16.653048], p2:[120.590123,16.643777], type:'lower', cat:'SA1',  bed:479.3 },
  SA1_upper: { p1:[120.622102,16.667096], p2:[120.604057,16.646318], type:'lower', cat:'SA1',  bed:479.3 },
  SA2_lower: { p1:[120.568215,16.660338], p2:[120.585557,16.671477], type:'lower', cat:'SA2',  bed:506.0 },
  SA2_upper: { p1:[120.548890,16.658168], p2:[120.576628,16.662565], type:'lower', cat:'SA2',  bed:506.0 },

  // ── 상부댐 (양수댐) ───────────────────────────
  CBC_upper1:  { p1:[120.568558,16.693905], p2:[120.570319,16.696455], type:'upper', cat:'CBC',  bed:799.1, drop:588, label:'CBC 상부1'  },
  CBC_upper2:  { p1:[120.579602,16.680462], p2:[120.581304,16.677690], type:'upper', cat:'CBC',  bed:946.8, drop:736, label:'CBC 상부2'  },
  CBBC_upper1: { p1:[120.579602,16.680462], p2:[120.581304,16.677690], type:'upper', cat:'CBBC', bed:946.8, drop:643, label:'CBBC 상부1' },
  CBBC_upper2: { p1:[120.556440,16.658544], p2:[120.558342,16.659686], type:'upper', cat:'CBBC', bed:910.6, drop:607, label:'CBBC 상부2' },
  CPC_upper:   { p1:[120.595274,16.632655], p2:[120.598478,16.632690], type:'upper', cat:'CPC',  bed:926.7, drop:532, label:'CPC 상부'   },
}

// ── 색상 ─────────────────────────────────────────
const COLOR_LOWER_WALL  = Cesium.Color.fromCssColorString('#f0a500').withAlpha(0.92)
const COLOR_LOWER_OUTL  = Cesium.Color.fromCssColorString('#ffd700')
const COLOR_UPPER_WALL  = Cesium.Color.fromCssColorString('#00e5ff').withAlpha(0.88)
const COLOR_UPPER_OUTL  = Cesium.Color.fromCssColorString('#80ffff')
const COLOR_UPPER_WATER = Cesium.Color.fromCssColorString('#1565c0').withAlpha(0.35)
const FLOOD_FILL        = Cesium.Color.fromCssColorString('#1a6fff').withAlpha(0.45)
const FLOOD_STR         = Cesium.Color.fromCssColorString('#55aaff').withAlpha(0.90)

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

  // ── 벽체 그리기 헬퍼 ─────────────────────────────
  const _drawWall = (v, ax, bed, fsl, ref) => {
    const isUpper   = ax.type === 'upper'
    const wallColor = isUpper ? COLOR_UPPER_WALL : COLOR_LOWER_WALL
    const outlColor = isUpper ? COLOR_UPPER_OUTL : COLOR_LOWER_OUTL
    const [x1,y1]   = ax.p1
    const [x2,y2]   = ax.p2

    // 댐 벽체
    ref.current.push(v.entities.add({
      wall: {
        positions:      Cesium.Cartesian3.fromDegreesArray([x1,y1, x2,y2]),
        maximumHeights: [fsl, fsl],
        minimumHeights: [bed, bed],
        material:       wallColor,
        outline:        true,
        outlineColor:   outlColor,
        outlineWidth:   2,
      },
    }))

    // 마루 강조선
    ref.current.push(v.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([x1,y1,fsl, x2,y2,fsl]),
        width: 4,
        material: new Cesium.PolylineOutlineMaterialProperty({
          color: outlColor, outlineWidth:1, outlineColor: Cesium.Color.BLACK,
        }),
      },
    }))

    // 상부댐: 수위면 반투명 폴리곤
    if (isUpper) {
      const dx = x2-x1, dy = y2-y1
      const len = Math.sqrt(dx*dx + dy*dy)
      const nx = (-dy/len) * 0.003
      const ny = ( dx/len) * 0.003
      ref.current.push(v.entities.add({
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray([
            x1+nx,y1+ny, x2+nx,y2+ny, x2-nx,y2-ny, x1-nx,y1-ny,
          ]),
          height:   fsl,
          material: COLOR_UPPER_WATER,
          outline:  false,
        },
      }))
    }
  }

  // ── 댐 벽체 ──────────────────────────────────────
  const drawDam = useCallback(() => {
    const v = viewerRef.current
    if (!v || !selected) return
    clearEnts(damEntRef)

    const fsl  = calcFsl(selected, heightM)
    const axis = DAM_AXES[selected.id]

    // 하부댐 벽체
    if (selected.wallPts?.length >= 2) {
      // wallPts 있으면 지형 맞춤 Wall (기존 로직 유지)
      const pts  = selected.wallPts
      const lons = pts.map(p => p[0])
      const lats = pts.map(p => p[1])
      const terr = pts.map(p => p[2])
      damEntRef.current.push(v.entities.add({
        wall: {
          positions:      Cesium.Cartesian3.fromDegreesArray(lons.flatMap((lo,i)=>[lo,lats[i]])),
          maximumHeights: pts.map(() => fsl),
          minimumHeights: terr,
          material:       COLOR_LOWER_WALL,
          outline:        true,
          outlineColor:   COLOR_LOWER_OUTL,
          outlineWidth:   2,
        },
      }))
      damEntRef.current.push(v.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(
            lons.flatMap((lo,i) => [lo, lats[i], fsl])
          ),
          width: 4,
          material: new Cesium.PolylineOutlineMaterialProperty({
            color: COLOR_LOWER_OUTL, outlineWidth:1, outlineColor: Cesium.Color.BLACK,
          }),
        },
      }))
    } else if (axis) {
      const bed = axis.bed ?? (selected.bed ?? (fsl - heightM))
      _drawWall(v, axis, bed, fsl, damEntRef)
    }

    // 하부댐 FSL 레이블
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

    // 같은 cat의 상부댐 축선 일괄 표시
    const cat = axis?.cat ?? ''
    const upperAxes = Object.entries(DAM_AXES).filter(
      ([, ax]) => ax.type === 'upper' && ax.cat === cat
    )
    upperAxes.forEach(([, ax]) => {
      const upperFsl = ax.bed + heightM
      _drawWall(v, ax, ax.bed, upperFsl, damEntRef)

      // 상부댐 레이블 (낙차 포함)
      const cx = (ax.p1[0]+ax.p2[0])/2
      const cy = (ax.p1[1]+ax.p2[1])/2
      damEntRef.current.push(v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(cx, cy, upperFsl + 60),
        label: {
          text:         `${ax.label}  FSL ${upperFsl.toFixed(0)}m\n낙차 ${ax.drop}m`,
          font:         '11px monospace',
          fillColor:    COLOR_UPPER_OUTL,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style:        Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }))
    })
  }, [selected, heightM])

  // ── 수몰면 ───────────────────────────────────────
  const drawFlood = useCallback(() => {
    const v = viewerRef.current
    if (!v) return
    clearEnts(floodEntRef)
    if (!showFlood || !selected) return

    const fsl = calcFsl(selected, heightM)

    const addFloodPolygon = (ring) => {
      const positions = ring.map(([lo, la]) => Cesium.Cartesian3.fromDegrees(lo, la, fsl))
      floodEntRef.current.push(v.entities.add({
        polygon: {
          hierarchy:         new Cesium.PolygonHierarchy(positions),
          material:          FLOOD_FILL,
          outline:           true,
          outlineColor:      FLOOD_STR,
          outlineWidth:      2,
          height:            fsl,
          perPositionHeight: false,
        },
      }))
    }

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
