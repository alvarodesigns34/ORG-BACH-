/**
 * El vuelo fuera de la app: la tarjeta «Ahora suena».
 *
 * Una web no puede crear una Actividad en directo (eso es ActivityKit, solo
 * para apps nativas). Lo más parecido que sí existe es la tarjeta multimedia
 * del sistema —pantalla de bloqueo, Centro de control, auriculares, reloj—,
 * que se rellena con la Media Session API mientras suena audio:
 *
 * - título y subtítulo: la ruta, la asignatura y lo que queda;
 * - carátula: un dibujo de la ruta generado aquí mismo;
 * - barra de progreso: la posición del vuelo (o de la escala);
 * - botón de pausa: pausa y reanuda el vuelo.
 *
 * La tarjeta solo existe mientras hay un elemento multimedia sonando: de eso
 * se encarga el audio portador de `soundscape.ts`.
 */

import { arc, distanceKm, interpolate, type Airport, type LatLon } from '@/domain/flights'

export interface FlightCard {
  /** Línea principal: la ruta. */
  title: string
  /** Línea secundaria: asignatura y estado. */
  subtitle: string
  artwork: string | null
  /** Barra de progreso, en segundos. */
  duration: number
  position: number
  /** Falso en una pausa manual: la barra se queda donde está. */
  moving: boolean
  paused: boolean
}

export function mediaSessionSupported(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator
}

let shown: string | null = null

export function showFlightCard(card: FlightCard): void {
  if (!mediaSessionSupported() || typeof MediaMetadata === 'undefined') return
  const session = navigator.mediaSession
  // Los metadatos solo se sustituyen si cambian: cada sustitución hace que el
  // sistema recargue la carátula, y en la pantalla de bloqueo se nota.
  const key = `${card.title}|${card.subtitle}|${card.artwork?.length ?? 0}`
  if (key !== shown) {
    shown = key
    const icon = new URL(`${import.meta.env.BASE_URL}pwa-512x512.png`, window.location.href).href
    session.metadata = new MediaMetadata({
      title: card.title,
      artist: card.subtitle,
      album: 'Órbita · Modo estudio',
      artwork: [
        ...(card.artwork ? [{ src: card.artwork, sizes: '512x512', type: 'image/png' }] : []),
        // Si la carátula generada no carga, el icono de la app.
        { src: icon, sizes: '512x512', type: 'image/png' },
      ],
    })
  }
  try {
    session.playbackState = card.paused ? 'paused' : 'playing'
  } catch {
    // Navegadores sin `playbackState`: deciden por el audio que suena.
  }
  try {
    const duration = Math.max(1, card.duration)
    session.setPositionState({
      duration,
      position: Math.min(duration, Math.max(0, card.position)),
      // No se admite 0. En pausa, un ritmo ínfimo deja la barra quieta aunque
      // el portador siga sonando para mantener viva la tarjeta.
      playbackRate: card.moving ? 1 : 0.0001,
    })
  } catch {
    // Sin barra de progreso: el resto de la tarjeta sigue valiendo.
  }
}

/**
 * El botón de reproducir/pausar de la tarjeta. iOS olvida los manejadores
 * registrados antes de que el audio pase a ser «lo que suena», así que esto
 * se vuelve a llamar cada vez que el portador arranca.
 */
export function setFlightActions(onToggle: (wanted: 'play' | 'pause') => void): void {
  if (!mediaSessionSupported()) return
  const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler)
    } catch {
      // Acción que este navegador no conoce.
    }
  }
  set('play', () => onToggle('play'))
  set('pause', () => onToggle('pause'))
  // Un vuelo no se adelanta ni se rebobina.
  for (const action of ['seekto', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack', 'stop'] as const) {
    set(action, null)
  }
}

export function clearFlightCard(): void {
  if (!mediaSessionSupported()) return
  shown = null
  const session = navigator.mediaSession
  session.metadata = null
  try {
    session.playbackState = 'none'
    session.setPositionState()
  } catch {
    // Nada que limpiar.
  }
  for (const action of ['play', 'pause'] as const) {
    try {
      session.setActionHandler(action, null)
    } catch {
      // Nada que limpiar.
    }
  }
}

// ---------------------------------------------------------------------------
// Carátula
// ---------------------------------------------------------------------------

const artCache = new Map<string, string>()

/**
 * Carátula del vuelo: la ruta dibujada sobre una ventanilla de globo, con los
 * códigos de los dos aeropuertos. Se dibuja una vez por vuelo.
 */
export function flightArtwork(from: Airport, to: Airport, accent = '#7cc0ff'): string | null {
  const key = `${from.iata}-${to.iata}-${accent}`
  const cached = artCache.get(key)
  if (cached) return cached
  try {
    const url = drawArtwork(from, to, accent)
    if (url) artCache.set(key, url)
    return url
  } catch {
    return null
  }
}

const SIZE = 512
const rad = (deg: number) => (deg * Math.PI) / 180

function drawArtwork(from: Airport, to: Airport, accent: string): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const g = canvas.getContext('2d')
  if (!g) return null

  // Cielo: el mismo degradado que el icono de la app.
  const sky = g.createRadialGradient(SIZE * 0.22, SIZE * 0.08, 0, SIZE * 0.22, SIZE * 0.08, SIZE * 1.15)
  sky.addColorStop(0, '#3f7df2')
  sky.addColorStop(0.5, '#1c3fae')
  sky.addColorStop(1, '#0b1454')
  g.fillStyle = sky
  g.fillRect(0, 0, SIZE, SIZE)

  // Estrellas: siempre las mismas para una ruta.
  let seed = 0
  for (const ch of from.iata + to.iata) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xffffffff
  }
  for (let i = 0; i < 46; i++) {
    g.globalAlpha = 0.25 + random() * 0.5
    g.fillStyle = '#fff'
    g.beginPath()
    g.arc(random() * SIZE, random() * SIZE, 0.6 + random() * 1.5, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1

  // Ventanilla: proyección ortográfica centrada en mitad de la ruta, con el
  // zoom justo para que la ruta ocupe el disco.
  const cx = SIZE / 2
  const cy = 206
  const R = 150
  const center: LatLon = interpolate(from, to, 0.5)
  // Media ruta, en radianes sobre la esfera. El vuelo más largo son cuatro
  // horas (2.400 km): nunca se acerca al borde del globo.
  const half = Math.max(distanceKm(from, to) / 2 / 6371, 0.004)
  // La ruta llega al 62 % del radio de la ventanilla.
  const scale = (R * 0.62) / Math.sin(Math.min(half, Math.PI / 2 - 0.01))
  const project = (p: LatLon): [number, number, boolean] => {
    const φ = rad(p.lat)
    const φ0 = rad(center.lat)
    const dλ = rad(p.lon - center.lon)
    const x = Math.cos(φ) * Math.sin(dλ)
    const y = Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(dλ)
    const front = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(dλ) > 0
    return [cx + x * scale, cy - y * scale, front]
  }

  g.save()
  g.beginPath()
  g.arc(cx, cy, R, 0, Math.PI * 2)
  g.clip()
  const globe = g.createRadialGradient(cx - R * 0.35, cy - R * 0.45, R * 0.1, cx, cy, R * 1.05)
  globe.addColorStop(0, '#2b5fd6')
  globe.addColorStop(1, '#0a1a66')
  g.fillStyle = globe
  g.fillRect(cx - R, cy - R, R * 2, R * 2)

  // Meridianos y paralelos, con un paso acorde al zoom.
  const visible = (R / scale) * (180 / Math.PI)
  const step = [0.5, 1, 2, 5, 10, 15, 30].find((s) => visible / s <= 3.2) ?? 30
  g.strokeStyle = 'rgba(255,255,255,0.16)'
  g.lineWidth = 1.2
  const line = (points: LatLon[]) => {
    let open = false
    g.beginPath()
    for (const p of points) {
      const [x, y, front] = project(p)
      if (!front) {
        open = false
        continue
      }
      if (open) g.lineTo(x, y)
      else g.moveTo(x, y)
      open = true
    }
    g.stroke()
  }
  const span = Math.min(90, visible * 1.6 + step)
  const lat0 = Math.round(center.lat / step) * step
  const lon0 = Math.round(center.lon / step) * step
  for (let lat = lat0 - span; lat <= lat0 + span; lat += step) {
    if (Math.abs(lat) > 89) continue
    line(Array.from({ length: 49 }, (_, i) => ({ lat, lon: center.lon - span * 1.5 + (i * span * 3) / 48 })))
  }
  for (let lon = lon0 - span * 1.5; lon <= lon0 + span * 1.5; lon += step) {
    line(
      Array.from({ length: 49 }, (_, i) => ({
        lat: Math.max(-89, Math.min(89, center.lat - span + (i * span * 2) / 48)),
        lon,
      })),
    )
  }

  // La ruta: el arco que sigue el avión.
  const route = arc(from, to, 0, 1, 64).map(([lon, lat]) => project({ lat, lon }))
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = 'rgba(255,255,255,0.22)'
  g.lineWidth = 12
  g.beginPath()
  route.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.stroke()
  g.strokeStyle = '#fff'
  g.lineWidth = 4
  g.stroke()
  g.restore()

  // Aro de la ventanilla.
  g.strokeStyle = 'rgba(255,255,255,0.35)'
  g.lineWidth = 2
  g.beginPath()
  g.arc(cx, cy, R, 0, Math.PI * 2)
  g.stroke()

  // Origen y destino.
  const [ax, ay] = route[0]
  const [bx, by] = route[route.length - 1]
  for (const [x, y, fill] of [
    [ax, ay, '#fff'],
    [bx, by, accent],
  ] as const) {
    g.fillStyle = '#0b1454'
    g.beginPath()
    g.arc(x, y, 11, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = fill
    g.beginPath()
    g.arc(x, y, 7, 0, Math.PI * 2)
    g.fill()
  }

  // El avión, a un tercio del camino y mirando hacia donde va.
  const at = Math.floor(route.length * 0.36)
  const [px, py] = route[at]
  const [qx, qy] = route[at + 1]
  g.save()
  g.translate(px, py)
  g.rotate(Math.atan2(qy - py, qx - px) + Math.PI / 2)
  g.scale(0.62, 0.62)
  g.translate(-32, -32)
  const plane = new Path2D(
    'M32 3c2.2 0 3.6 2.6 3.6 6.4V24l20.4 12.2c.8.5 1.3 1.3 1.3 2.2v3.1L35.6 34.8V49l6.2 4.6c.4.3.7.8.7 1.3V58l-10.5-3-10.5 3v-3.1c0-.5.3-1 .7-1.3l6.2-4.6V34.8L6.7 41.5v-3.1c0-.9.5-1.7 1.3-2.2L28.4 24V9.4C28.4 5.6 29.8 3 32 3z',
  )
  g.lineWidth = 7
  g.strokeStyle = '#12227e'
  g.stroke(plane)
  g.fillStyle = '#fff'
  g.fill(plane)
  g.restore()

  // Códigos y ciudades.
  const sans = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif'
  g.textBaseline = 'alphabetic'
  g.fillStyle = '#fff'
  g.font = `800 76px ${sans}`
  g.textAlign = 'left'
  g.fillText(from.iata, 44, 440)
  g.textAlign = 'right'
  g.fillText(to.iata, SIZE - 44, 440)
  g.textAlign = 'center'
  g.font = `600 40px ${sans}`
  g.fillStyle = 'rgba(255,255,255,0.6)'
  g.fillText('→', SIZE / 2, 432)
  g.font = `500 25px ${sans}`
  g.fillStyle = 'rgba(255,255,255,0.72)'
  const fit = (text: string) => {
    let out = text
    while (out.length > 3 && g.measureText(out).width > 200) out = `${out.slice(0, -2)}…`
    return out
  }
  g.textAlign = 'left'
  g.fillText(fit(from.city), 46, 478)
  g.textAlign = 'right'
  g.fillText(fit(to.city), SIZE - 46, 478)

  return canvas.toDataURL('image/png')
}
