import React, { useEffect, useRef, useCallback } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { calcFsl } from '../data/candidates.js'

Cesium.Ion.defaultAccessToken =
  import.meta.env.VITE_CESIUM_TOKEN ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYWE1OWUxNy1mMWZiLTQzYjYtYTQ5YS1lOTViYjlkZjdjNDkiLCJpZCI6MjU2NTQ1LCJpYXQiOjE3MzI2MDE0OTN9.l9OVl0-GEjkl7GxvGKD0bDjJSy3Ps1Ml9BhWQmVaABs'

const CAM = {
  CBC_lower:   { lon:120.560422, lat:16.689502, alt:1200, heading:0   },
  CBBC_lower:  { lon:120.574715, lat:16.670846, alt:1200, heading:0   },
  CPC_lower:   { lon:120.597031, lat:16.649049, alt:1500, heading:0   },
  CBC_upper1:  { lon:120.569439, lat:16.695180, alt:2500, heading:180 },
  CBBC_upper1: { lon:120.580453, lat:16.679076, alt:2800, heading:180 },
  CBBC_upper2: { lon:120.557391, lat:16.659115, alt:2800, heading:180 },
  CPC_upper:   { lon:120.596876, lat:16.632673, alt:3000, heading:180 },
}

export function getDamLabel(id) {
  const MAP = {
    CBC_lower:'CBC-하부', CBBC_lower:'CBBC-하부', CPC_lower:'CPC-하부',
    CBC_upper1:'CBC-상부1', CBBC_upper1:'CBBC-상부1',
    CBBC_upper2:'CBBC-상부2', CPC_upper:'CPC-상부',
  }
  return MAP[id] ?? id
}

// 색상
const C_LOWER_WALL  = Cesium.Color.fromCssColorString('#f0a500').withAlpha(0.90)
const C_LOWER_OUTL  = Cesium.Color.fromCssColorString('#ffd700')
const C_LOWER_FLOOD = Cesium.Color.fromCssColorString('#1a6fff').withAlpha(0.45)
const C_LOWER_STR   = Cesium.Color.fromCssColorString('#55aaff').withAlpha(0.80)
const C_UPPER_WALL  = Cesium.Color.fromCssColorString('#00e5ff').withAlpha(0.88)
const C_UPPER_OUTL  = Cesium.Color.fromCssColorString('#80ffff')
const C_UPPER_FLOOD = Cesium.Color.fromCssColorString('#0d47a1').withAlpha(0.50)
const C_UPPER_STR   = Cesium.Color.fromCssColorString('#40c4ff').withAlpha(0.80)

export default function CesiumViewer({ candidates, selected, heightM, showFlood, simResult, onSelect }) {
  const containerRef = useRef(null)
  const viewerRef    = useRef(null)
  const damEntRef    = useRef([])
  const floodEntRef  = useRef([])
  const markerEntRef = useRef([])

  useEffect(() => {
    let viewer
    ;(async () => {
      try {
        viewer = new Cesium.Viewer(containerRef.current, {
          terrain: await Cesium.Terrain.fromWorldTerrain(),
          baseLayerPicker:false, navigationHelpButton:false, sceneModePicker:false,
          geocoder:false, homeButton:false, fullscreenButton:false,
          animation:false, timeline:false, infoBox:false, selectionIndicator:false,
          creditContainer: document.createElement('div'),
        })
        viewer.scene.skyAtmosphere.show = true
        viewer.scene.globe.enableLighting = false
        viewer.scene.globe.depthTestAgainstTerrain = false
        viewerRef.current = viewer

        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(120.58, 16.66, 40000),
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
    const v = viewerRef.current; if (!v) return
    ref.current.forEach(e => { try { v.entities.remove(e) } catch(_){} })
    ref.current = []
  }

  // ── 마커 ─────────────────────────────────────────
  const drawMarkers = useCallback(() => {
    const v = viewerRef.current; if (!v) return
    clearEnts(markerEntRef)
    candidates.forEach(c => {
      const isSel  = selected?.id === c.id
      const isUpper = c.damType === 'upper'
      const color  = isSel ? '#00c4b4' : isUpper ? '#00aaff' : '#f0a500'
      const size   = isSel ? 52 : 38
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="20" r="16" fill="${color}" fill-opacity="0.92" stroke="#fff" stroke-width="1.5"/>
        <text x="26" y="25" text-anchor="middle" font-size="8" font-weight="700"
          font-family="monospace" fill="#050c14">${c.id}</text>
        <polygon points="26,44 19,32 33,32" fill="${color}" fill-opacity="0.92"/>
      </svg>`
      markerEntRef.current.push(v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat),
        billboard: {
          image: `data:image/svg+xml;base64,${btoa(svg)}`,
          width:size, height:size,
          verticalOrigin:  Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { damId: c.id },
      }))
    })
  }, [candidates, selected])

  // ── 지형 밀착 벽체 ───────────────────────────────
  const _drawTerrainWall = (v, wallPts, fsl, isUpper, ref) => {
    const wc = isUpper ? C_UPPER_WALL : C_LOWER_WALL
    const oc = isUpper ? C_UPPER_OUTL : C_LOWER_OUTL
    ref.current.push(v.entities.add({
      wall: {
        positions:      Cesium.Cartesian3.fromDegreesArray(wallPts.flatMap(p=>[p[0],p[1]])),
        minimumHeights: wallPts.map(p=>p[2]),
        maximumHeights: wallPts.map(()=>fsl),
        material:wc, outline:true, outlineColor:oc, outlineWidth:2,
      },
    }))
    // 마루선
    ref.current.push(v.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(wallPts.flatMap(p=>[p[0],p[1],fsl])),
        width:4,
        material: new Cesium.PolylineOutlineMaterialProperty({ color:oc, outlineWidth:1, outlineColor:Cesium.Color.BLACK }),
      },
    }))
  }

  // ── 수몰 폴리곤 ──────────────────────────────────
  // heightRatio: 현재 height / baseH → reservoirCoords 스케일 조정 없이 FSL 고도만 변경
  const _drawFloodPolygon = (v, rings, fsl, isUpper, ref) => {
    const fillColor = isUpper ? C_UPPER_FLOOD : C_LOWER_FLOOD
    const strColor  = isUpper ? C_UPPER_STR   : C_LOWER_STR
    rings.forEach(ring => {
      if (!ring?.length) return
      ref.current.push(v.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(
            ring.map(([lo,la]) => Cesium.Cartesian3.fromDegrees(lo, la, fsl))
          ),
          height: fsl,
          material: fillColor,
          outline: true, outlineColor: strColor, outlineWidth: 2,
          perPositionHeight: false,
        },
      }))
    })
  }

  // ── 댐 그리기 ────────────────────────────────────
  const drawDam = useCallback(() => {
    const v = viewerRef.current; if (!v || !selected) return
    clearEnts(damEntRef)

    const fsl     = calcFsl(selected, heightM)
    const isUpper = selected.damType === 'upper'
    const label   = getDamLabel(selected.id)

    // 지형 밀착 벽체
    if (selected.wallPts?.length >= 2) {
      _drawTerrainWall(v, selected.wallPts, fsl, isUpper, damEntRef)
    }

    // FSL 레이블
    const oc = isUpper ? C_UPPER_OUTL : C_LOWER_OUTL
    damEntRef.current.push(v.entities.add({
      position: Cesium.Cartesian3.fromDegrees(selected.lon, selected.lat, fsl + 80),
      label: {
        text: `${label}  FSL ${fsl.toFixed(0)}m`,
        font:'13px monospace', fillColor:oc,
        outlineColor:Cesium.Color.BLACK, outlineWidth:2,
        style:Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin:Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance:Number.POSITIVE_INFINITY,
      },
    }))
  }, [selected, heightM])

  // ── 수몰면 ───────────────────────────────────────
  // showFlood ON: 선택 댐 수몰면 표시
  // 상부댐: reservoirCoords (H=50 기준 폴리곤) + FSL 고도
  // 하부댐: simResult API GeoJSON 우선, 없으면 reservoirCoords
  // 높이 변화 → FSL 고도만 바뀌고 폴리곤 형상은 유지
  //   (정확한 형상은 백엔드 /simulate 호출 결과로 교체)
  const drawFlood = useCallback(() => {
    const v = viewerRef.current; if (!v) return
    clearEnts(floodEntRef)
    if (!showFlood || !selected) return

    const fsl     = calcFsl(selected, heightM)
    const isUpper = selected.damType === 'upper'

    // API 결과 우선
    const geojson = simResult?.flood_geojson
    if (geojson?.features?.length) {
      for (const feat of geojson.features) {
        const geom = feat.geometry; if (!geom) continue
        const rings = geom.type==='Polygon' ? geom.coordinates
          : geom.type==='MultiPolygon' ? geom.coordinates.flat() : []
        _drawFloodPolygon(v, rings, fsl, isUpper, floodEntRef)
      }
      return
    }

    // reservoirCoords fallback (상부댐 H=50 기준 형상, FSL만 현재값)
    if (selected.reservoirCoords?.length) {
      _drawFloodPolygon(v, selected.reservoirCoords, fsl, isUpper, floodEntRef)
    }
  }, [selected, showFlood, simResult, heightM])

  // ── 카메라 ───────────────────────────────────────
  const flyToSelected = useCallback(() => {
    const v=viewerRef.current, cam=CAM[selected?.id]
    if (!v||!cam) return
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, cam.alt),
      orientation: { heading:Cesium.Math.toRadians(cam.heading), pitch:Cesium.Math.toRadians(-25), roll:0 },
      duration:1.5,
    })
  }, [selected])

  useEffect(()=>{ drawMarkers() }, [drawMarkers])
  useEffect(()=>{ drawMarkers(); drawDam(); drawFlood(); if(selected) flyToSelected() }, [selected?.id]) // eslint-disable-line
  useEffect(()=>{ drawDam(); drawFlood() }, [heightM])                                   // eslint-disable-line
  useEffect(()=>{ drawFlood() }, [showFlood, simResult?.flood_geojson])                  // eslint-disable-line

  return (
    <div ref={containerRef} style={{flex:1, position:'relative', background:'#000'}}>
      <div style={{
        position:'absolute', bottom:12, left:'50%', transform:'translateX(-50%)',
        background:'rgba(5,12,20,0.80)', border:'1px solid rgba(0,160,200,0.2)',
        borderRadius:4, padding:'5px 14px', fontSize:10,
        color:'rgba(160,200,220,0.7)', fontFamily:'monospace',
        pointerEvents:'none', zIndex:10, whiteSpace:'nowrap',
      }}>
        좌클릭 마커 선택 · 우클릭 드래그 회전 · 스크롤 줌
      </div>
    </div>
  )
}
