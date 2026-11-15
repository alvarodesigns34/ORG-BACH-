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

import {
  arc,
  bearing,
  circle,
  interpolate,
  type Airport,
  type Destination,
  type LatLon,
} from '@/domain/flights'

export type MapLook = 'light' | 'dark'

const STYLE_URL: Record<MapLook, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
}

/** Colores de lo que se dibuja encima, por estilo de mapa. */
const INK: Record<MapLook, { accent: string; route: string; muted: string }> = {
  light: { accent: '#0071e3', route: '#0071e3', muted: 'rgba(0, 113, 227, 0.45)' },
  dark: { accent: '#5aa8ff', route: '#ffffff', muted: 'rgba(255, 255, 255, 0.38)' },
}

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
  private look: MapLook
  private ready = false
  private queue: (() => void)[] = []

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

  constructor(container: HTMLElement, look: MapLook, center: LatLon) {
    this.look = look
    this.map = new MapLibreMap({
      container,
      style: STYLE_URL[look],
      center: ll(center),
      zoom: 4.6,
      attributionControl: { compact: true },
      // Estudio, no navegación: sin girar ni inclinar con dos dedos.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      fadeDuration: 150,
    })
    this.map.touchZoomRotate.disableRotation()
    this.map.on('style.load', () => {
      this.addLayers()
      this.ready = true
      const pending = this.queue
      this.queue = []
      for (const run of pending) run()
    })
    for (const event of ['dragstart', 'wheel', 'touchstart'] as const) {
      this.map.on(event, (e: unknown) => {
        if ((e as { originalEvent?: Event }).originalEvent) this.onUserMove?.()
      })
    }
  }

  destroy(): void {
    this.map.remove()
  }

  resize(): void {
    this.map.resize()
  }

  setLook(look: MapLook): void {
    if (look === this.look) return
    this.look = look
    this.ready = false
    this.map.setStyle(STYLE_URL[look], { diff: false })
    this.map.getContainer().dataset.look = look
  }

  private whenReady(run: () => void) {
    if (this.ready) run()
    else this.queue.push(run)
  }

  private addLayers() {
    const map = this.map
    const ink = INK[this.look]
    map.getContainer().dataset.look = this.look

    // Rótulos en español donde OpenStreetMap lo tiene («España», «Londres»).
    for (const layer of map.getStyle().layers ?? []) {
      if (layer.type !== 'symbol') continue
      const field = map.getLayoutProperty(layer.id, 'text-field')
      if (!field) continue
      map.setLayoutProperty(layer.id, 'text-field', [
        'coalesce',
        ['get', 'name:es'],
        ['get', 'name:latin'],
        ['get', 'name'],
      ])
    }

    map.addSource('range', { type: 'geojson', data: this.rangeData() })
    map.addSource('route-done', { type: 'geojson', data: this.lineData(this.routeDone) })
    map.addSource('route-todo', { type: 'geojson', data: this.lineData(this.routeTodo) })

    map.addLayer({
      id: 'range-fill',
      type: 'fill',
      source: 'range',
      paint: { 'fill-color': ink.accent, 'fill-opacity': this.look === 'dark' ? 0.1 : 0.07 },
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
    this.range = origin && km > 0 ? circle(origin, km) : null
    this.whenReady(() => this.source('range')?.setData(this.rangeData()))
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
      el.querySelector('.fm-pin')?.classList.toggle('is-selected', isSelected)
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
  setRoute(origin: LatLon | null, dest: Airport | null, progress = 0): void {
    if (!origin || !dest) {
      this.routeDone = []
      this.routeTodo = []
      this.destMarker?.remove()
      this.destMarker = null
    } else {
      const p = Math.min(1, Math.max(0, progress))
      this.routeDone = p > 0 ? arc(origin, dest, 0, p) : []
      this.routeTodo = p < 1 ? arc(origin, dest, p, 1) : []
      if (!this.destMarker) {
        const el = document.createElement('div')
        el.className = 'fm-dest'
        el.textContent = dest.iata
        this.destMarker = new Marker({ element: el }).setLngLat(ll(dest)).addTo(this.map)
      } else {
        this.destMarker.setLngLat(ll(dest))
        this.destMarker.getElement().textContent = dest.iata
      }
    }
    this.whenReady(() => {
      this.source('route-done')?.setData(this.lineData(this.routeDone))
      this.source('route-todo')?.setData(this.lineData(this.routeTodo))
    })
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
      this.planeMarker = new Marker({ element: el, rotationAlignment: 'map' })
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

  private move(options: EaseToOptions | FlyToOptions, fly = false) {
    if (reduced()) {
      this.map.jumpTo(options as Parameters<MapLibreMap['jumpTo']>[0])
      return
    }
    if (fly) this.map.flyTo({ ...options, essential: true })
    else this.map.easeTo({ ...options, essential: true })
  }

  /**
   * Centrar un punto dentro del hueco libre. Con `offset` y no con `padding`:
   * el padding se queda guardado en el mapa y luego se sumaba al de los
   * encuadres siguientes (la reserva salía el doble de alejada).
   */
  showPlace(place: LatLon, zoom = 5.4, padding?: Padding): void {
    const offset: [number, number] = padding
      ? [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2]
      : [0, 0]
    this.move({ center: ll(place), zoom, offset, duration: 1600 }, true)
  }

  fitRange(origin: LatLon, km: number, padding: Padding, duration = 700): void {
    const ring = circle(origin, Math.max(km, 120), 48)
    const camera = this.map.cameraForBounds(boundsOf(ring), { padding, maxZoom: 7.5 })
    if (!camera) return
    this.move({ ...camera, duration, easing: (t: number) => 1 - Math.pow(1 - t, 3) })
  }

  fitRoute(origin: LatLon, dest: LatLon, padding: Padding, duration = 1400): void {
    const camera = this.map.cameraForBounds(boundsOf(arc(origin, dest, 0, 1, 32)), {
      padding,
      maxZoom: 8,
    })
    if (!camera) return
    this.move({ ...camera, duration }, duration > 1000)
  }

  /** Seguir al avión (sin animar si ya está cerca: evita encadenar curvas). */
  follow(place: LatLon, zoom?: number, duration = 950): void {
    // Mientras dura la subida del despegue, seguir al avión la cortaría.
    if (Date.now() < this.climbUntil) return
    this.move({ center: ll(place), zoom: zoom ?? this.map.getZoom(), duration, easing: (t: number) => t })
  }

  /** Despegue: la cámara empieza pegada al avión y sube mientras se aleja. */
  takeoff(place: LatLon, finalZoom: number): void {
    if (reduced()) {
      this.map.jumpTo({ center: ll(place), zoom: finalZoom })
      return
    }
    this.climbUntil = Date.now() + 7200
    this.map.jumpTo({ center: ll(place), zoom: Math.min(11, finalZoom + 4.5) })
    this.map.easeTo({
      center: ll(place),
      zoom: finalZoom,
      duration: 7000,
      easing: (t: number) => 1 - Math.pow(1 - t, 2.4),
      essential: true,
    })
  }

  /** Zoom que deja ver la ruta entera, para «Ver ruta». */
  routeZoom(origin: LatLon, dest: LatLon, padding: Padding): number {
    const camera = this.map.cameraForBounds(boundsOf(arc(origin, dest, 0, 1, 32)), { padding })
    return camera?.zoom ?? 5
  }
}
