/**
 * El mapa del modo estudio, sobre MapLibre.
 *
 * Es un controlador imperativo y no un componente declarativo: el mapa es un
 * objeto con estado propio (cámara, estilo cargado, marcadores) y la vista le
 * da órdenes por etapa — «enseña el alcance», «sigue al avión» —. Intentar
 * reconciliarlo con React en cada render solo añadiría trabajo y tirones.
 *
 * Mapas: OpenFreeMap (gratis, sin claves; datos © OpenStreetMap).
 */

import type { FeatureCollection } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  Map as MapLibreMap,
  Marker,
  type EaseToOptions,
  type FlyToOptions,
  type GeoJSONSource,
  type LngLatBoundsLike,
  setWorkerUrl,
} from 'maplibre-gl'
// MapLibre 6 trae el «worker» (el que decodifica las teselas) en un archivo
// aparte. Vite no lo localiza solo: se le da la URL del archivo publicado.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

setWorkerUrl(workerUrl)

import { buildStyle, MAP_LABEL_LAYERS, type MapLookOptions } from './mapStyle'
import {
  arc,
  bearing,
  circle,
  interpolate,
  type Airport,
  type Destination,
  type LatLon,
} from '@/domain/flights'

export type { MapLookOptions }
export type MapStatus = 'cargando' | 'listo' | 'sin_cartografia' | 'no_disponible'

/** Colores de lo que se dibuja encima, según el mapa de debajo. */
function inkFor(look: MapLookOptions) {
  if (look.kind === 'satelite' || look.tone === 'dark') {
    return { accent: '#4da3ff', route: '#ffffff', muted: 'rgba(255, 255, 255, 0.42)', history: 'rgba(255,255,255,0.28)' }
  }
  return { accent: '#0064d2', route: '#0064d2', muted: 'rgba(0, 100, 210, 0.5)', history: 'rgba(0, 70, 150, 0.32)' }
}

const sameLook = (a: MapLookOptions, b: MapLookOptions) =>
  a.kind === b.kind && a.tone === b.tone && a.labels === b.labels && a.globe === b.globe

/** Inclinación de la cámara en vuelo sobre la esfera: se ve el horizonte. */
const FLIGHT_PITCH = 42
/** Al despegar y aterrizar, más inclinada: como mirar por la ventanilla. */
const LOW_PITCH = 58

export interface Padding {
  top: number
  right: number
  bottom: number
  left: number
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

const PLANE_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 3c2.2 0 3.6 2.6 3.6 6.4V24l20.4 12.2c.8.5 1.3 1.3 1.3 2.2v3.1L35.6 34.8V49l6.2 4.6c.4.3.7.8.7 1.3V58l-10.5-3-10.5 3v-3.1c0-.5.3-1 .7-1.3l6.2-4.6V34.8L6.7 41.5v-3.1c0-.9.5-1.7 1.3-2.2L28.4 24V9.4C28.4 5.6 29.8 3 32 3z"/></svg>`

const ll = (p: LatLon): [number, number] => [p.lon, p.lat]

function boundsOf(points: [number, number][]): LngLatBoundsLike {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ]
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export class FlightMap {
  readonly map: MapLibreMap
  private look: MapLookOptions
  private ready = false
  private loadTimeout = 0
  private revealFrame = 0
  private hasTiles = false
  private routeKey = ''

  // Lo dibujado, para volver a ponerlo si cambia el estilo.
  private range: [number, number][] | null = null
  private routeDone: [number, number][] = []
  private routeTodo: [number, number][] = []

  private originMarker: Marker | null = null
  private destMarker: Marker | null = null
  private planeMarker: Marker | null = null
  private pins = new Map<string, Marker>()

  private climbUntil = 0

  /** El usuario ha movido el mapa a mano: deja de seguir al avión. */
  onUserMove: (() => void) | null = null

  constructor(
    container: HTMLElement,
    look: MapLookOptions,
    center: LatLon,
    zoom: number,
    private onStatus: (status: MapStatus) => void,
  ) {
    this.look = look
    container.classList.toggle('is-globe', look.globe)
    // El mapa aparece con un fundido cuando ya tiene teselas, no como un
    // lienzo gris que se va rellenando a trozos.
    container.style.opacity = '0'
    this.map = new MapLibreMap({
      container,
      style: buildStyle(look),
      center: ll(center),
      zoom,
      attributionControl: { compact: true },
      // Estudio, no navegación: sin girar ni inclinar con dos dedos.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      fadeDuration: 150,
      maxPitch: 65,
    })
    this.map.touchZoomRotate.disableRotation()
    // Para inspeccionar la cámara desde las pruebas del navegador.
    if (import.meta.env.DEV) (window as unknown as { __flightMap?: FlightMap }).__flightMap = this
    this.map.on('style.load', () => {
      this.addLayers()
      this.ready = true
    })
    this.map.on('sourcedata', (event) => {
      if (this.hasTiles || event.sourceDataType !== 'content' || !event.tile?.hasData?.()) return
      if (event.source.type !== 'vector' && event.source.type !== 'raster') return
      this.hasTiles = true
      window.clearTimeout(this.loadTimeout)
      this.revealFrame = window.requestAnimationFrame(() => {
        container.style.opacity = '1'
        this.onStatus('listo')
      })
    })
    this.map.on('error', () => {
      // Una tesela puede fallar sin invalidar las demás. El plazo permite
      // que llegue el resto antes de mostrar el estado de conexión.
      if (!navigator.onLine && !this.hasTiles) this.onStatus('sin_cartografia')
    })
    this.map.on('webglcontextlost', () => {
      this.hasTiles = false
      window.cancelAnimationFrame(this.revealFrame)
      container.style.opacity = '0'
      this.onStatus('no_disponible')
    })
    this.map.on('webglcontextrestored', () => this.waitForTiles())
    this.waitForTiles()
    for (const event of ['dragstart', 'wheel', 'touchstart'] as const) {
      this.map.on(event, (e: unknown) => {
        if ((e as { originalEvent?: Event }).originalEvent) this.onUserMove?.()
      })
    }
  }

  destroy(): void {
    window.clearTimeout(this.loadTimeout)
    window.cancelAnimationFrame(this.revealFrame)
    this.map.remove()
  }

  private waitForTiles(): void {
    window.clearTimeout(this.loadTimeout)
    this.onStatus(navigator.onLine ? 'cargando' : 'sin_cartografia')
    this.loadTimeout = window.setTimeout(() => {
      if (!this.hasTiles) this.onStatus('sin_cartografia')
    }, 5000)
  }

  resize(): void {
    this.map.resize()
  }

  setLook(look: MapLookOptions): void {
    if (sameLook(look, this.look)) return
    if (sameLook({ ...look, labels: this.look.labels }, this.look) && this.ready) {
      for (const id of MAP_LABEL_LAYERS) {
        this.map.setLayoutProperty(id, 'visibility', look.labels ? 'visible' : 'none')
      }
      this.look = look
      return
    }
    const flat = !look.globe && this.look.globe
    this.look = look
    this.ready = false
    this.hasTiles = false
    window.cancelAnimationFrame(this.revealFrame)
    this.waitForTiles()
    this.map.getContainer().classList.toggle('is-globe', look.globe)
    this.map.setStyle(buildStyle(look), { diff: false })
    // En plano no se inclina la cámara: se endereza si venía de la esfera.
    if (flat) this.map.jumpTo({ pitch: 0, bearing: 0 })
  }

  private addLayers() {
    const map = this.map
    const ink = inkFor(this.look)
    map.getContainer().dataset.look =
      this.look.kind === 'satelite' || this.look.tone === 'dark' ? 'dark' : 'light'

    map.addSource('history', { type: 'geojson', data: this.historyData() })
    map.addSource('range', { type: 'geojson', data: this.rangeData() })
    map.addSource('route-done', { type: 'geojson', data: this.lineData(this.routeDone) })
    map.addSource('route-todo', { type: 'geojson', data: this.lineData(this.routeTodo) })

    map.addLayer({
      id: 'history',
      type: 'line',
      source: 'history',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ink.history, 'line-width': 1.6 },
    })
    map.addLayer({
      id: 'range-fill',
      type: 'fill',
      source: 'range',
      paint: { 'fill-color': ink.accent, 'fill-opacity': 0.09 },
    })
    map.addLayer({
      id: 'range-line',
      type: 'line',
      source: 'range',
      paint: { 'line-color': ink.accent, 'line-opacity': 0.55, 'line-width': 1.25 },
    })
    map.addLayer({
      id: 'route-todo',
      type: 'line',
      source: 'route-todo',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ink.muted, 'line-width': 2, 'line-dasharray': [1.2, 2.2] },
    })
    // La estela: un halo ancho y difuso bajo una línea nítida.
    map.addLayer({
      id: 'route-glow',
      type: 'line',
      source: 'route-done',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ink.route, 'line-width': 8, 'line-opacity': 0.14, 'line-blur': 4 },
    })
    map.addLayer({
      id: 'route-done',
      type: 'line',
      source: 'route-done',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ink.route, 'line-width': 2.5, 'line-opacity': 0.95 },
    })
  }

  private history: [number, number][][] = []

  private historyData(): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: this.history.map((coordinates) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates },
      })),
    }
  }

  /** Todas las rutas voladas, finas, para el diario y el pasaporte. */
  setHistory(routes: { from: LatLon; to: LatLon }[]): void {
    if (routes.length === 0 && this.history.length === 0) return
    this.history = routes.map((r) => arc(r.from, r.to, 0, 1, 48))
    if (this.ready) this.source('history')?.setData(this.historyData())
  }

  /** Encuadra un conjunto de puntos (el pasaporte entero). */
  fitPoints(points: LatLon[], padding: Padding): void {
    if (points.length === 0) return
    if (points.length === 1) {
      this.showPlace(points[0], 5, padding)
      return
    }
    const camera = this.map.cameraForBounds(boundsOf(points.map(ll)), { padding, maxZoom: 6.5 })
    if (camera) this.move({ ...camera, pitch: 0, bearing: 0, duration: 1200 }, true)
  }

  private rangeData(): FeatureCollection {
    if (!this.range) return EMPTY
    return {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [this.range] } },
      ],
    }
  }

  private lineData(points: [number, number][]): FeatureCollection {
    if (points.length < 2) return EMPTY
    return {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points } },
      ],
    }
  }

  private source(id: string): GeoJSONSource | undefined {
    return this.map.getSource(id) as GeoJSONSource | undefined
  }

  // -------------------------------------------------------------------------
  // Contenido
  // -------------------------------------------------------------------------

  setOrigin(origin: Airport | null): void {
    if (!origin) {
      this.originMarker?.remove()
      this.originMarker = null
      return
    }
    if (!this.originMarker) {
      const el = document.createElement('div')
      el.className = 'fm-origin'
      el.innerHTML = '<span class="fm-origin-pulse"></span><span class="fm-origin-dot"></span>'
      this.originMarker = new Marker({ element: el }).setLngLat(ll(origin)).addTo(this.map)
    } else {
      this.originMarker.setLngLat(ll(origin))
    }
  }

  setRange(origin: LatLon | null, km: number): void {
    if (!origin && !this.range) return
    this.range = origin && km > 0 ? circle(origin, km) : null
    if (this.ready) this.source('range')?.setData(this.rangeData())
  }

  /** Destinos posibles como cápsulas con el código del aeropuerto. */
  setPins(all: Destination[], selected: string | null, onPick: (iata: string) => void): void {
    // Los 14 mejores (y el elegido): más cápsulas se pisan unas a otras.
    const list = all.filter((d, i) => i < 14 || d.airport.iata === selected)
    const keep = new Set(list.map((d) => d.airport.iata))
    for (const [iata, marker] of this.pins) {
      if (!keep.has(iata)) {
        marker.remove()
        this.pins.delete(iata)
      }
    }
    for (const d of list) {
      let marker = this.pins.get(d.airport.iata)
      if (!marker) {
        // MapLibre coloca el marcador con `transform` en este elemento: la
        // cápsula (que escala al elegirla) va dentro, en uno propio.
        const el = document.createElement('div')
        el.className = 'fm-pin-anchor'
        const pin = document.createElement('button')
        pin.type = 'button'
        pin.className = 'fm-pin'
        pin.setAttribute('aria-label', `${d.airport.city}, ${d.minutes} minutos`)
        pin.innerHTML = `<span class="fm-pin-code">${d.airport.iata}</span><span class="fm-pin-city"></span>`
        el.appendChild(pin)
        pin.addEventListener('click', (event) => {
          event.stopPropagation()
          onPick(d.airport.iata)
        })
        marker = new Marker({ element: el }).setLngLat(ll(d.airport)).addTo(this.map)
        this.pins.set(d.airport.iata, marker)
      }
      const el = marker.getElement()
      const isSelected = d.airport.iata === selected
      const pin = el.querySelector('.fm-pin')
      pin?.classList.toggle('is-selected', isSelected)
      pin?.setAttribute('aria-pressed', String(isSelected))
      el.style.zIndex = isSelected ? '3' : '1'
      const city = el.querySelector('.fm-pin-city')
      if (city) city.textContent = isSelected ? d.airport.city : ''
    }
  }

  clearPins(): void {
    for (const marker of this.pins.values()) marker.remove()
    this.pins.clear()
  }

  /**
   * La ruta: recorrida (línea continua) y por recorrer (discontinua). Con
   * `progress` = 0, toda discontinua.
   */
  setRoute(origin: LatLon | null, dest: Airport | null, progress = 0, label = true): void {
    const fraction = Math.floor(Math.min(1, Math.max(0, progress)) * 200) / 200
    const key = origin && dest ? `${origin.lon}:${origin.lat}:${dest.iata}:${fraction}:${label}` : ''
    if (key === this.routeKey) return
    this.routeKey = key
    if (!label) {
      this.destMarker?.remove()
      this.destMarker = null
    }
    if (!origin || !dest) {
      this.routeDone = []
      this.routeTodo = []
      this.destMarker?.remove()
      this.destMarker = null
    } else {
      const p = fraction
      this.routeDone = p > 0 ? arc(origin, dest, 0, p) : []
      this.routeTodo = p < 1 ? arc(origin, dest, p, 1) : []
      if (!label) {
        // Sin etiqueta: en la reserva ya la pone la cápsula del destino.
      } else if (!this.destMarker) {
        const el = document.createElement('div')
        el.className = 'fm-dest'
        el.textContent = dest.iata
        // Encima del punto, no sobre él: el avión aterriza justo ahí.
        this.destMarker = new Marker({ element: el, anchor: 'bottom', offset: [0, -10] })
          .setLngLat(ll(dest))
          .addTo(this.map)
      } else {
        this.destMarker.setLngLat(ll(dest))
        this.destMarker.getElement().textContent = dest.iata
      }
    }
    if (this.ready) {
      this.source('route-done')?.setData(this.lineData(this.routeDone))
      this.source('route-todo')?.setData(this.lineData(this.routeTodo))
    }
  }

  /** El avión en la fracción `progress` de la ruta, apuntando hacia donde va. */
  setPlane(origin: LatLon | null, dest: LatLon | null, progress: number): LatLon | null {
    if (!origin || !dest) {
      this.planeMarker?.remove()
      this.planeMarker = null
      return null
    }
    const p = Math.min(1, Math.max(0, progress))
    const here = interpolate(origin, dest, p)
    const ahead = p < 0.999 ? interpolate(origin, dest, Math.min(1, p + 0.002)) : dest
    const heading = p < 0.999 ? bearing(here, ahead) : bearing(interpolate(origin, dest, 0.99), dest)
    if (!this.planeMarker) {
      const el = document.createElement('div')
      el.className = 'fm-plane'
      el.innerHTML = PLANE_SVG
      this.planeMarker = new Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' })
        .setLngLat(ll(here))
        .addTo(this.map)
    } else {
      this.planeMarker.setLngLat(ll(here))
    }
    this.planeMarker.setRotation(heading)
    return here
  }

  // -------------------------------------------------------------------------
  // Cámara
  // -------------------------------------------------------------------------

  get globe(): boolean {
    return this.look.globe
  }

  /** La cámara está inclinada (en vuelo sobre la esfera). */
  get tilted(): boolean {
    return this.map.getPitch() > 5
  }

  private move(options: EaseToOptions | FlyToOptions, fly = false) {
    if (reduced()) {
      this.map.jumpTo(options as Parameters<MapLibreMap['jumpTo']>[0])
      return
    }
    if (fly) this.map.flyTo({ ...options, essential: true })
    else this.map.easeTo({ ...options, essential: true })
  }

  /** Fuera del vuelo, la cámara mira de frente y con el norte arriba. */
  private static readonly LEVEL = { pitch: 0, bearing: 0 }

  /**
   * Centrar un punto dentro del hueco libre. Con `offset` y no con `padding`:
   * el padding se queda guardado en el mapa y luego se sumaba al de los
   * encuadres siguientes (la reserva salía el doble de alejada).
   */
  showPlace(place: LatLon, zoom = 5.4, padding?: Padding): void {
    const offset: [number, number] = padding
      ? [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2]
      : [0, 0]
    this.move({ center: ll(place), zoom, offset, duration: 1600, ...FlightMap.LEVEL }, true)
  }

  fitRange(origin: LatLon, km: number, padding: Padding, duration = 700): void {
    const ring = circle(origin, Math.max(km, 120), 48)
    const camera = this.map.cameraForBounds(boundsOf(ring), { padding, maxZoom: 7.5 })
    if (!camera) return
    this.move({ ...camera, ...FlightMap.LEVEL, duration, easing: (t: number) => 1 - Math.pow(1 - t, 3) })
  }

  fitRoute(origin: LatLon, dest: LatLon, padding: Padding, duration = 1400): void {
    const camera = this.map.cameraForBounds(boundsOf(arc(origin, dest, 0, 1, 32)), {
      padding,
      maxZoom: 8,
    })
    if (!camera) return
    this.move({ ...camera, ...FlightMap.LEVEL, duration }, duration > 1000)
  }

  /**
   * Seguir al avión (sin animar si ya está cerca: evita encadenar curvas).
   * Sobre la esfera la cámara va inclinada y orientada con la ruta, como
   * siguiendo al avión desde detrás; en plano, cenital y con el norte arriba.
   */
  follow(place: LatLon, heading = 0, zoom?: number, duration = 950): void {
    // Mientras dura la subida del despegue, seguir al avión la cortaría.
    if (Date.now() < this.climbUntil) return
    const tilt = this.look.globe ? { pitch: FLIGHT_PITCH, bearing: heading } : FlightMap.LEVEL
    this.move({
      center: ll(place),
      zoom: zoom ?? this.map.getZoom(),
      ...tilt,
      duration,
      easing: (t: number) => t,
    })
  }

  /** «Seguir al avión» tras mirar otra cosa: vuelve con un vuelo de cámara. */
  rejoin(place: LatLon, heading: number, zoom: number, padding: Padding): void {
    if (!this.look.globe) {
      this.showPlace(place, zoom, padding)
      return
    }
    this.move(
      { center: ll(place), zoom, pitch: FLIGHT_PITCH, bearing: heading, duration: 1800 },
      true,
    )
  }

  /**
   * Despegue: la cámara empieza pegada al avión, baja y mirando hacia
   * delante, y sube mientras se aleja. Sobre la esfera, además, se va
   * levantando el horizonte hasta ver la curvatura.
   */
  takeoff(place: LatLon, finalZoom: number, heading = 0): void {
    const globe = this.look.globe
    const end = globe
      ? { center: ll(place), zoom: finalZoom, pitch: FLIGHT_PITCH, bearing: heading }
      : { center: ll(place), zoom: finalZoom, ...FlightMap.LEVEL }
    if (reduced()) {
      this.map.jumpTo(end)
      return
    }
    this.climbUntil = Date.now() + 7600
    this.map.jumpTo({
      center: ll(place),
      zoom: Math.min(globe ? 12 : 11, finalZoom + (globe ? 5.2 : 4.5)),
      ...(globe ? { pitch: LOW_PITCH + 4, bearing: heading - 18 } : FlightMap.LEVEL),
    })
    this.map.easeTo({
      ...end,
      duration: 7400,
      easing: (t: number) => 1 - Math.pow(1 - t, 2.4),
      essential: true,
    })
  }

  /**
   * Aterrizaje: la cámara baja sobre el destino. Sobre la esfera, inclinada
   * y girando un poco alrededor del aeropuerto mientras se acerca.
   */
  landing(dest: LatLon, heading: number, padding: Padding): void {
    if (!this.look.globe) {
      this.showPlace(dest, 7, padding)
      return
    }
    const offset: [number, number] = [
      (padding.left - padding.right) / 2,
      (padding.top - padding.bottom) / 2,
    ]
    this.climbUntil = 0
    this.move(
      { center: ll(dest), zoom: 9.2, pitch: LOW_PITCH, bearing: heading + 25, offset, duration: 3600 },
      true,
    )
  }

  /** Zoom que deja ver la ruta entera, para «Ver ruta». */
  routeZoom(origin: LatLon, dest: LatLon, padding: Padding): number {
    const camera = this.map.cameraForBounds(boundsOf(arc(origin, dest, 0, 1, 32)), { padding })
    return camera?.zoom ?? 5
  }
}
