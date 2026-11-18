/**
 * Día y noche sobre el globo, como en el globo de Apple Maps.
 *
 * La posición del sol sale de una fórmula astronómica corta (la aproximación
 * del Almanaque Náutico, error < 0,1° hasta 2050): no hace falta red ni datos.
 * Con ella se pinta una imagen pequeña del mundo en proyección Mercator —la
 * misma que usan las teselas— donde cada píxel es más oscuro cuanto más bajo
 * está el sol en ese punto. El crepúsculo (sol entre 0° y −12°) queda como un
 * degradado, sin línea dura.
 *
 * Es puro (sin DOM) para poder probarlo; `flightMap.ts` la pone en el mapa.
 */

const RAD = Math.PI / 180
/** Latitud máxima de Mercator: el borde de las teselas. */
export const MERCATOR_MAX_LAT = 85.051129

export interface SunPosition {
  /** Declinación: latitud donde el sol está en el cénit (°). */
  lat: number
  /** Longitud donde el sol está en el cénit (°, −180…180). */
  lon: number
}

/** Punto de la Tierra con el sol en el cénit en el instante `date`. */
export function subsolarPoint(date: Date): SunPosition {
  // Días desde J2000.0 (1 de enero de 2000, 12:00 UTC).
  const d = date.getTime() / 86400000 - 10957.5
  const g = (357.529 + 0.98560028 * d) * RAD
  const q = 280.459 + 0.98564736 * d
  const lambda = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD
  const e = (23.439 - 0.00000036 * d) * RAD
  const ra = Math.atan2(Math.cos(e) * Math.sin(lambda), Math.cos(lambda)) / RAD
  const dec = Math.asin(Math.sin(e) * Math.sin(lambda)) / RAD
  const gmst = 280.46061837 + 360.98564736629 * d
  return { lat: dec, lon: wrap(ra - gmst) }
}

function wrap(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}

/** Altura del sol (°) sobre el horizonte en (lat, lon). */
export function sunAltitude(sun: SunPosition, lat: number, lon: number): number {
  const s =
    Math.sin(lat * RAD) * Math.sin(sun.lat * RAD) +
    Math.cos(lat * RAD) * Math.cos(sun.lat * RAD) * Math.cos((lon - sun.lon) * RAD)
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD
}

/** Día pleno por encima de esta altura del sol (°)… */
const DAY_ALT = 1
/** …y noche cerrada por debajo de esta (fin del crepúsculo náutico). */
const NIGHT_ALT = -12

/** Cuánta noche hay (0 = día, 1 = noche cerrada) con el sol a `altitude`°. */
export function darkness(altitude: number): number {
  const t = Math.min(1, Math.max(0, (DAY_ALT - altitude) / (DAY_ALT - NIGHT_ALT)))
  return t * t * (3 - 2 * t)
}

export interface NightInk {
  r: number
  g: number
  b: number
  /** Opacidad de la noche cerrada (0…1). */
  alpha: number
}

/**
 * Rellena `out` (RGBA, `width`×`height`) con la sombra de la noche para el
 * mundo entero en Mercator: x de −180° a 180°, y de 85° N a 85° S.
 */
export function paintNight(
  out: Uint8ClampedArray,
  width: number,
  height: number,
  date: Date,
  ink: NightInk,
): void {
  const sun = subsolarPoint(date)
  const sinDec = Math.sin(sun.lat * RAD)
  const cosDec = Math.cos(sun.lat * RAD)
  // cos(Δlon) por columna: así cada píxel es solo una multiplicación y suma.
  const cosLon = new Float64Array(width)
  for (let x = 0; x < width; x++) {
    const lon = -180 + ((x + 0.5) / width) * 360
    cosLon[x] = Math.cos((lon - sun.lon) * RAD)
  }
  const yMax = Math.log(Math.tan(Math.PI / 4 + (MERCATOR_MAX_LAT * RAD) / 2))
  const alpha = ink.alpha * 255
  for (let y = 0; y < height; y++) {
    const merc = yMax - ((y + 0.5) / height) * 2 * yMax
    const lat = 2 * Math.atan(Math.exp(merc)) - Math.PI / 2
    const a = Math.sin(lat) * sinDec
    const b = Math.cos(lat) * cosDec
    let i = y * width * 4
    for (let x = 0; x < width; x++, i += 4) {
      const s = a + b * cosLon[x]
      const altitude = Math.asin(s > 1 ? 1 : s < -1 ? -1 : s) / RAD
      out[i] = ink.r
      out[i + 1] = ink.g
      out[i + 2] = ink.b
      out[i + 3] = Math.round(darkness(altitude) * alpha)
    }
  }
}
