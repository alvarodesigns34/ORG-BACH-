/**
 * Modo estudio: cada sesión es un vuelo.
 *
 * Todo lo de aquí es puro (sin red, sin reloj implícito, sin DOM): geografía
 * de la esfera, cuánto dura un vuelo, qué destinos caben en un tiempo y
 * cuánto lleva volado una sesión con pausas.
 */

import type { FocusSession, ID } from './types.ts'

// ---------------------------------------------------------------------------
// Aeropuertos
// ---------------------------------------------------------------------------

export interface Airport {
  iata: string
  city: string
  country: string
  lat: number
  lon: number
  /** Aeropuerto grande: gana a los pequeños de la misma ciudad. */
  major: boolean
}

/** Fila compacta del JSON: [IATA, ciudad, país, lat, lon, grande]. */
export type AirportRow = [string, string, string, number, number, number]

export function airportFromRow(row: AirportRow): Airport {
  return {
    iata: row[0],
    city: row[1],
    country: row[2],
    lat: row[3],
    lon: row[4],
    major: row[5] === 1,
  }
}

/** Primer vuelo de todos: desde Madrid. Los siguientes, desde donde aterrizaste. */
export const HOME_IATA = 'MAD'

/**
 * Aeropuerto en el que «estás»: el destino del último vuelo que aterrizó.
 * Un vuelo abandonado no te lleva a ningún sitio.
 */
export function currentAirport(sessions: FocusSession[]): string {
  let latest: FocusSession | undefined
  for (const s of sessions) {
    if (s.status !== 'aterrizado' || !s.endedAt) continue
    if (!latest || s.endedAt > latest.endedAt!) latest = s
  }
  return latest?.to ?? HOME_IATA
}

// ---------------------------------------------------------------------------
// Geografía de la esfera
// ---------------------------------------------------------------------------

const EARTH_KM = 6371.0088
const rad = (deg: number) => (deg * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

export interface LatLon {
  lat: number
  lon: number
}

/** Distancia por la ruta más corta sobre la Tierra (círculo máximo), en km. */
export function distanceKm(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Punto a una fracción `t` (0…1) del camino entre `a` y `b` por el círculo
 * máximo: la curva que siguen los aviones de verdad y que en el mapa se ve
 * como un arco, no una recta.
 */
export function interpolate(a: LatLon, b: LatLon, t: number): LatLon {
  const φ1 = rad(a.lat)
  const λ1 = rad(a.lon)
  const φ2 = rad(b.lat)
  const λ2 = rad(b.lon)
  const d = distanceKm(a, b) / EARTH_KM
  if (d === 0) return { ...a }
  const A = Math.sin((1 - t) * d) / Math.sin(d)
  const B = Math.sin(t * d) / Math.sin(d)
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2)
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2)
  const z = A * Math.sin(φ1) + B * Math.sin(φ2)
  return { lat: deg(Math.atan2(z, Math.hypot(x, y))), lon: deg(Math.atan2(y, x)) }
}

/** Rumbo inicial de `a` hacia `b`, en grados desde el norte (0…360). */
export function bearing(a: LatLon, b: LatLon): number {
  const φ1 = rad(a.lat)
  const φ2 = rad(b.lat)
  const Δλ = rad(b.lon - a.lon)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (deg(Math.atan2(y, x)) + 360) % 360
}

/** El arco completo como lista de [lon, lat] (formato GeoJSON). */
export function arc(a: LatLon, b: LatLon, from = 0, to = 1, steps = 96): [number, number][] {
  const points: [number, number][] = []
  const n = Math.max(2, Math.ceil(steps * (to - from)))
  let previousLon: number | null = null
  for (let i = 0; i <= n; i++) {
    const p = interpolate(a, b, from + ((to - from) * i) / n)
    // Sin saltos al cruzar el antimeridiano: la línea sigue más allá de 180.
    let lon = p.lon
    if (previousLon !== null) {
      while (lon - previousLon > 180) lon -= 360
      while (lon - previousLon < -180) lon += 360
    }
    previousLon = lon
    points.push([lon, p.lat])
  }
  return points
}

/** Círculo de radio `km` alrededor de `center`, como anillo GeoJSON. */
export function circle(center: LatLon, km: number, steps = 128): [number, number][] {
  const δ = km / EARTH_KM
  const φ1 = rad(center.lat)
  const λ1 = rad(center.lon)
  const ring: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const θ = (2 * Math.PI * i) / steps
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
    const λ2 =
      λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
    ring.push([deg(λ2), deg(φ2)])
  }
  return ring
}

// ---------------------------------------------------------------------------
// Duración
// ---------------------------------------------------------------------------

/**
 * Velocidad del avión: 10 km por minuto de estudio (600 km/h). Algo por debajo
 * de un reactor en crucero, como la velocidad media real de un vuelo corto
 * contando subida y bajada: Madrid–Barcelona (483 km) sale en 48 minutos.
 */
export const KM_PER_MINUTE = 10

export const MIN_MINUTES = 15
export const MAX_MINUTES = 240

export function minutesFor(km: number): number {
  return Math.max(1, Math.round(km / KM_PER_MINUTE))
}

export function kmFor(minutes: number): number {
  return minutes * KM_PER_MINUTE
}

export interface Destination {
  airport: Airport
  km: number
  minutes: number
}

/**
 * Destinos a los que se llega en unos `minutes` desde `origin`, del más
 * ajustado al tiempo pedido al menos. Una ciudad con varios aeropuertos sale
 * una vez (el grande): cinco «Londres» seguidos no son cinco opciones.
 *
 * Si con la tolerancia normal no sale nada (alrededor de una isla, o en un
 * tiempo muy corto), se va ensanchando hasta encontrar algo.
 */
function score(d: Destination, minutes: number): number {
  return Math.abs(d.minutes - minutes) - (d.airport.major ? 5 : 0)
}

export function destinationsFor(
  origin: Airport,
  airports: Airport[],
  minutes: number,
  limit = 40,
): Destination[] {
  const all: Destination[] = []
  for (const airport of airports) {
    if (airport.iata === origin.iata) continue
    const km = distanceKm(origin, airport)
    if (km < 60) continue
    all.push({ airport, km, minutes: minutesFor(km) })
  }

  // Al final, sin límite: lo más cercano al tiempo pedido, aunque quede lejos
  // (cuatro horas desde una isla). La lista nunca se queda vacía.
  for (const tolerance of [6, 12, 25, 50, 100, Infinity]) {
    const near = all.filter((d) => Math.abs(d.minutes - minutes) <= tolerance)
    if (near.length >= 4 || tolerance === Infinity) {
      const byCity = new Map<string, Destination>()
      for (const d of near) {
        const key = `${d.airport.country}:${d.airport.city}`
        const held = byCity.get(key)
        if (!held || (d.airport.major && !held.airport.major)) byCity.set(key, d)
      }
      return [...byCity.values()]
        // Un aeropuerto grande «cuenta» como 5 minutos más cerca del tiempo
        // pedido: Oporto antes que un aeródromo regional igual de lejos.
        .sort(
          (a, b) =>
            score(a, minutes) - score(b, minutes) ||
            a.airport.city.localeCompare(b.airport.city, 'es'),
        )
        .slice(0, limit)
    }
  }
  return []
}

// ---------------------------------------------------------------------------
// Tiempo de una sesión
// ---------------------------------------------------------------------------

/** Milisegundos de vuelo efectivo: lo transcurrido menos las pausas. */
export function elapsedMs(session: FocusSession, now: number): number {
  const start = Date.parse(session.startedAt)
  const end = session.endedAt
    ? Date.parse(session.endedAt)
    : session.pausedAt
      ? Date.parse(session.pausedAt)
      : now
  return Math.max(0, end - start - session.pausedMs)
}

/** Fracción del vuelo completada, de 0 a 1. */
export function progress(session: FocusSession, now: number): number {
  const total = session.plannedMinutes * 60_000
  return total <= 0 ? 1 : Math.min(1, elapsedMs(session, now) / total)
}

export function remainingMs(session: FocusSession, now: number): number {
  return Math.max(0, session.plannedMinutes * 60_000 - elapsedMs(session, now))
}

/** El vuelo en el aire ahora mismo, si lo hay (uno como mucho). */
export function activeSession(sessions: FocusSession[]): FocusSession | undefined {
  return sessions.find((s) => s.status === 'en_vuelo')
}

/** Minutos realmente estudiados en una sesión cerrada. */
export function focusedMinutes(session: FocusSession, now: number = Date.now()): number {
  return session.focusedMinutes ?? Math.floor(elapsedMs(session, now) / 60_000)
}

// ---------------------------------------------------------------------------
// Tarjeta de embarque
// ---------------------------------------------------------------------------

export const SEAT_LETTERS = ['A', 'C', 'D', 'F'] as const
export const SEAT_ROWS = 6

export function seatLabel(row: number, letter: string): string {
  return `${String(row).padStart(2, '0')}${letter}`
}

/**
 * Barras del código de embarque: deterministas a partir del id, así la misma
 * tarjeta siempre muestra el mismo código. Anchos de 1 a 3 unidades.
 */
export function barcode(id: ID, bars = 64): number[] {
  let seed = 0
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0
  const out: number[] = []
  for (let i = 0; i < bars; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    out.push(1 + (seed >>> 29) % 3)
  }
  return out
}

/** «1 h 05 min», «48 min». */
export function formatFlightTime(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `${h} h` : `${h} h ${String(rest).padStart(2, '0')} min`
}

const REGION_NAMES = (() => {
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' })
  } catch {
    return null
  }
})()

/** Nombre del país en español a partir de su código ISO («Francia»). */
export function countryName(code: string): string {
  try {
    return REGION_NAMES?.of(code) ?? code
  } catch {
    return code
  }
}

// ---------------------------------------------------------------------------
// Escalas
// ---------------------------------------------------------------------------

/** Con menos de estos minutos por delante no se hace escala: se aterriza. */
export const LAYOVER_MIN_TAIL = 5

/**
 * Minutos de vuelo (de estudio efectivo) en los que toca una escala
 * programada: cada `layoverEvery` si es un vuelo tipo Pomodoro, o una sola a
 * mitad de camino.
 */
export function layoverPoints(
  session: Pick<FocusSession, 'plannedMinutes' | 'layoverMinutes' | 'layoverEvery'>,
): number[] {
  if (!session.layoverMinutes) return []
  const total = session.plannedMinutes
  if (!session.layoverEvery) return [total / 2]
  const points: number[] = []
  for (let at = session.layoverEvery; at <= total - LAYOVER_MIN_TAIL; at += session.layoverEvery) {
    points.push(at)
  }
  return points
}

/** Escalas programadas ya hechas. Los vuelos antiguos solo tenían una. */
export function layoversTaken(session: FocusSession): number {
  return session.layoversDone ?? (session.layoverAt ? 1 : 0)
}

/** Escalas programadas que aún quedan por delante. */
export function layoversLeft(session: FocusSession): number {
  return Math.max(0, layoverPoints(session).length - layoversTaken(session))
}

/** En la escala ahora mismo: la pausa abierta es la de la escala. */
export function inLayover(session: FocusSession): boolean {
  return !!session.layoverAt && session.pausedAt === session.layoverAt
}

/** Instante (ms) en que termina sola la escala abierta. */
export function layoverEndMs(session: FocusSession): number | null {
  if (!inLayover(session)) return null
  if (session.layoverEndsAt) return Date.parse(session.layoverEndsAt)
  if (!session.layoverMinutes) return null
  return Date.parse(session.layoverAt!) + session.layoverMinutes * 60_000
}

/** Minuto de vuelo de la próxima escala programada, si queda alguna. */
function nextLayoverPoint(session: FocusSession): number | null {
  return layoverPoints(session)[layoversTaken(session)] ?? null
}

/** Toca empezar una escala programada: se llegó a su minuto, sin pausa abierta. */
export function layoverDue(session: FocusSession, now: number): boolean {
  if (session.status !== 'en_vuelo' || session.pausedAt) return false
  const point = nextLayoverPoint(session)
  return point !== null && elapsedMs(session, now) >= point * 60_000
}

/** Milisegundos que quedan de escala (0 si ya terminó o no se está en ella). */
export function layoverRemainingMs(session: FocusSession, now: number): number {
  const end = layoverEndMs(session)
  return end === null ? 0 : Math.max(0, end - now)
}

// ---------------------------------------------------------------------------
// Línea de tiempo: lo que pasa solo
// ---------------------------------------------------------------------------

export type FlightEventKind = 'escala' | 'fin_escala' | 'aterrizaje'

export interface FlightEvent {
  kind: FlightEventKind
  /** Instante (ms) en que ocurre. */
  at: number
}

/**
 * Lo próximo que le pasa al vuelo sin que nadie toque nada: empezar una
 * escala, terminarla o aterrizar. En una pausa manual no hay nada previsto:
 * el reloj del vuelo está parado hasta que se reanude.
 */
export function nextEvent(session: FocusSession): FlightEvent | null {
  if (session.status !== 'en_vuelo') return null
  const end = layoverEndMs(session)
  if (end !== null) return { kind: 'fin_escala', at: end }
  if (session.pausedAt) return null
  const origin = Date.parse(session.startedAt) + session.pausedMs
  const landing = origin + session.plannedMinutes * 60_000
  const point = nextLayoverPoint(session)
  if (point !== null) {
    const at = origin + point * 60_000
    if (at < landing) return { kind: 'escala', at }
  }
  return { kind: 'aterrizaje', at: landing }
}

function applyEvent(session: FocusSession, event: FlightEvent): FocusSession {
  const stamp = new Date(event.at).toISOString()
  switch (event.kind) {
    case 'escala':
      return {
        ...session,
        pausedAt: stamp,
        layoverAt: stamp,
        layoverEndsAt: new Date(event.at + (session.layoverMinutes ?? 0) * 60_000).toISOString(),
        layoversDone: layoversTaken(session) + 1,
      }
    case 'fin_escala':
      return {
        ...session,
        pausedAt: undefined,
        layoverEndsAt: undefined,
        pausedMs: session.pausedMs + Math.max(0, event.at - Date.parse(session.pausedAt!)),
      }
    case 'aterrizaje':
      return {
        ...session,
        status: 'aterrizado',
        pausedAt: undefined,
        layoverEndsAt: undefined,
        endedAt: stamp,
        focusedMinutes: session.plannedMinutes,
      }
  }
}

/**
 * El vuelo tal y como debe estar en `now`: aplica, cada una en su instante
 * exacto, las escalas y el aterrizaje que hayan ocurrido mientras tanto.
 *
 * Es lo que hace que el vuelo no dependa de que la app esté abierta: si el
 * iPad estuvo bloqueado media hora, al volver la escala empezó y terminó
 * cuando tocaba, y el aterrizaje lleva su hora real. Devuelve el mismo objeto
 * si no ha cambiado nada.
 */
export function advance(session: FocusSession, now: number): FocusSession {
  let current = session
  // Tope de seguridad: un vuelo de 24 h con escalas cada 5 min no llega a 600.
  for (let i = 0; i < 1000; i++) {
    const event = nextEvent(current)
    if (!event || event.at > now) break
    current = applyEvent(current, event)
  }
  return current
}

/**
 * Todo lo que queda por pasar, en orden, si no se toca nada. Sirve para
 * programar los avisos y para decir a qué hora se aterriza.
 */
export function timeline(session: FocusSession, now: number): FlightEvent[] {
  const events: FlightEvent[] = []
  let current = advance(session, now)
  for (let i = 0; i < 1000; i++) {
    const event = nextEvent(current)
    if (!event) break
    events.push(event)
    current = applyEvent(current, event)
  }
  return events
}

/** Hora prevista de aterrizaje (ms), o null si el vuelo está en pausa manual. */
export function landingAt(session: FocusSession, now: number): number | null {
  const events = timeline(session, now)
  const last = events[events.length - 1]
  return last?.kind === 'aterrizaje' ? last.at : null
}

/** Aeropuerto más cercano a un punto, sin contar los de `exclude`. */
export function nearestAirport(
  point: LatLon,
  airports: Airport[],
  exclude: string[] = [],
): Airport | undefined {
  let best: Airport | undefined
  let bestKm = Infinity
  for (const a of airports) {
    if (!a.major || exclude.includes(a.iata)) continue
    const km = distanceKm(point, a)
    if (km < bestKm) {
      bestKm = km
      best = a
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Diario y pasaporte
// ---------------------------------------------------------------------------

export interface Passport {
  flights: number
  minutes: number
  km: number
  /** Ciudades visitadas (aterrizadas), la primera vez que se llegó a cada una. */
  stamps: { iata: string; firstAt: string; visits: number; subjectId?: ID }[]
  countries: string[]
}

export function passport(sessions: FocusSession[], countryOf: (iata: string) => string | undefined): Passport {
  const landed = sessions
    .filter((s) => s.status === 'aterrizado' && s.endedAt)
    .sort((a, b) => (a.endedAt! < b.endedAt! ? -1 : 1))
  const stamps = new Map<string, Passport['stamps'][number]>()
  const countries = new Set<string>()
  let minutes = 0
  let km = 0
  for (const s of landed) {
    minutes += s.focusedMinutes ?? s.plannedMinutes
    km += s.distanceKm
    const held = stamps.get(s.to)
    if (held) held.visits++
    else stamps.set(s.to, { iata: s.to, firstAt: s.endedAt!, visits: 1, subjectId: s.subjectId })
    const country = countryOf(s.to)
    if (country) countries.add(country)
  }
  // También cuenta el país de salida del primer vuelo: ya «estabas» allí.
  if (landed[0]) {
    const home = countryOf(landed[0].from)
    if (home) countries.add(home)
  }
  return { flights: landed.length, minutes, km, stamps: [...stamps.values()].reverse(), countries: [...countries] }
}

/** Minutos estudiados (vuelos cerrados) por asignatura desde `since`. */
export function minutesBySubject(
  sessions: FocusSession[],
  since: number,
): Map<string | undefined, number> {
  const out = new Map<string | undefined, number>()
  for (const s of sessions) {
    if (s.status === 'en_vuelo' || !s.endedAt || Date.parse(s.endedAt) < since) continue
    const m = s.focusedMinutes ?? 0
    if (m <= 0) continue
    out.set(s.subjectId, (out.get(s.subjectId) ?? 0) + m)
  }
  return out
}
