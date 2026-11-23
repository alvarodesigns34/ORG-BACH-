/**
 * Reloj lógico híbrido (HLC).
 *
 * Cada campo de cada registro lleva la marca del momento en que se editó. Al
 * fusionar dos versiones gana, campo a campo, la marca mayor. Un reloj de pared
 * a secas no sirve: dos dispositivos pueden tener la hora desajustada, y el que
 * va adelantado ganaría siempre. El HLC avanza con el reloj de pared pero
 * nunca retrocede, y al recibir una marca remota salta por delante de ella, así
 * que una edición hecha DESPUÉS de ver otra siempre la supera.
 *
 * Formato textual de ancho fijo: `000001793629719536:00003:k3x9q2` —
 * milisegundos (15 cifras), contador (5 cifras) y nodo. Al tener ancho fijo,
 * comparar las cadenas byte a byte equivale a comparar los relojes, tanto aquí
 * como en Postgres (`collate "C"`).
 */

export interface HlcState {
  wall: number
  counter: number
  node: string
}

const MAX_COUNTER = 99_999
/** Límite del formato de 15 cifras: impide corromper el formato del reloj. */
const MAX_WALL = 999_999_999_999_999
/** Desfase futuro máximo aceptable de un reloj remoto (1 año). */
const MAX_FUTURE_DRIFT_MS = 365 * 24 * 60 * 60 * 1000

/** Marca mínima: pierde frente a cualquier edición real. */
export const ZERO_CLOCK = '000000000000000:00000:0'

export function formatClock(state: HlcState): string {
  const safeWall = Math.min(Math.max(0, Math.floor(state.wall)), MAX_WALL)
  const safeCounter = Math.min(Math.max(0, Math.floor(state.counter)), MAX_COUNTER)
  return `${String(safeWall).padStart(15, '0')}:${String(safeCounter).padStart(5, '0')}:${state.node}`
}

export function parseClock(clock: string): HlcState | null {
  const match = /^(\d{15}):(\d{5}):([0-9a-z]{1,16})$/.exec(clock)
  if (!match) return null
  return { wall: Number(match[1]), counter: Number(match[2]), node: match[3] }
}

export function isClock(value: unknown): value is string {
  return typeof value === 'string' && parseClock(value) !== null
}

/** Identificador corto y aleatorio del dispositivo. */
export function newNodeId(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return [...bytes]
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 12)
}

/** Siguiente marca para un cambio local. */
export function tick(state: HlcState, now: number = Date.now()): HlcState {
  const wall = Math.min(MAX_WALL, Math.max(state.wall, now))
  const counter = wall === state.wall ? state.counter + 1 : 0
  if (counter > MAX_COUNTER) {
    // Más de cien mil cambios en el mismo milisegundo: se avanza el reloj.
    return { wall: Math.min(MAX_WALL, wall + 1), counter: 0, node: state.node }
  }
  return { wall, counter, node: state.node }
}

/** Ajusta el reloj local tras ver una marca remota. */
export function receive(state: HlcState, remote: string, now: number = Date.now()): HlcState {
  const other = parseClock(remote)
  if (!other) return state
  // Ignorar marcas con reloj de pared disparatado (>1 año en el futuro) para
  // evitar envenenar el HLC de todos los dispositivos de la cuenta.
  if (other.wall > now + MAX_FUTURE_DRIFT_MS) return state
  const wall = Math.min(MAX_WALL, Math.max(state.wall, other.wall, now))
  let counter: number
  if (wall === state.wall && wall === other.wall)
    counter = Math.max(state.counter, other.counter) + 1
  else if (wall === state.wall) counter = state.counter + 1
  else if (wall === other.wall) counter = other.counter + 1
  else counter = 0
  if (counter > MAX_COUNTER) return { wall: Math.min(MAX_WALL, wall + 1), counter: 0, node: state.node }
  return { wall, counter, node: state.node }
}
