/**
 * Temporizador de estudio.
 *
 * El estado guarda MARCAS DE TIEMPO, no un contador que se va incrementando.
 * Un contador con `setInterval` se retrasa en cuanto la pestaña pasa a segundo
 * plano —los navegadores lo estrangulan— y una sesión de 50 minutos acabaría
 * registrando 35. Con marcas de tiempo, el reloj es la única fuente de verdad
 * y el intervalo solo sirve para repintar.
 */

import type { ID } from './types.ts'

export type TimerMode = 'pomodoro' | 'libre'
export type TimerPhase = 'trabajo' | 'descanso'

export interface TimerState {
  mode: TimerMode
  phase: TimerPhase
  /** Instante en que arrancó el tramo actual. null = en pausa. */
  runningSince: number | null
  /** Milisegundos acumulados de tramos anteriores de esta misma fase. */
  accumulatedMs: number
  /**
   * Instante en que empezó la sesión ENTERA, no la fase actual.
   *
   * Hace falta guardarlo aparte porque `accumulatedMs` se reinicia en cada
   * cambio de fase: reconstruir el inicio restando el tiempo transcurrido
   * daría la hora de comienzo del último pomodoro, no la de la sesión. En una
   * sesión de tres tramos que cruza la medianoche, eso la archivaría en el día
   * equivocado.
   */
  sessionStartedAt: number
  subjectId?: ID
  topic?: string
  /** Pomodoros de trabajo completados desde que empezó. */
  completed: number
  /**
   * Milisegundos REALES de trabajo ya cerrados, sumando los tramos
   * terminados.
   *
   * Sin esto, los minutos de la sesión salían de `completed × duración
   * configurada AHORA`, y eso reescribe el pasado: cambiar el pomodoro de 25
   * a 50 minutos a mitad de sesión duplicaba lo ya hecho. Además, `nextPhase`
   * reinicia el contador de la fase, así que los minutos de más de un tramo
   * que se alargaba se perdían al pulsar «empezar descanso».
   *
   * Opcional porque un temporizador guardado por una versión anterior no lo
   * trae; ahí se recurre a la fórmula vieja en vez de inventar minutos.
   */
  workedMs?: number
}

export interface PomodoroConfig {
  workMinutes: number
  breakMinutes: number
}

export const DEFAULT_POMODORO: PomodoroConfig = { workMinutes: 25, breakMinutes: 5 }

export function createTimer(
  mode: TimerMode,
  subjectId?: ID,
  topic?: string,
  now = Date.now(),
): TimerState {
  return {
    mode,
    phase: 'trabajo',
    runningSince: now,
    accumulatedMs: 0,
    sessionStartedAt: now,
    subjectId,
    topic,
    completed: 0,
    workedMs: 0,
  }
}

/** Milisegundos transcurridos en la fase actual. */
export function elapsedMs(state: TimerState, now = Date.now()): number {
  return state.accumulatedMs + (state.runningSince === null ? 0 : now - state.runningSince)
}

export function pause(state: TimerState, now = Date.now()): TimerState {
  if (state.runningSince === null) return state
  return { ...state, accumulatedMs: elapsedMs(state, now), runningSince: null }
}

export function resume(state: TimerState, now = Date.now()): TimerState {
  if (state.runningSince !== null) return state
  return { ...state, runningSince: now }
}

export function isRunning(state: TimerState): boolean {
  return state.runningSince !== null
}

/** Duración objetivo de la fase actual, en ms. `null` en modo libre. */
export function targetMs(state: TimerState, config: PomodoroConfig): number | null {
  if (state.mode !== 'pomodoro') return null
  const minutes = state.phase === 'trabajo' ? config.workMinutes : config.breakMinutes
  return minutes * 60_000
}

/** Fracción completada de la fase, de 0 a 1. En modo libre siempre 0. */
export function phaseProgress(
  state: TimerState,
  config: PomodoroConfig,
  now = Date.now(),
): number {
  const target = targetMs(state, config)
  if (target === null || target <= 0) return 0
  return Math.min(1, elapsedMs(state, now) / target)
}

/** ¿Ha terminado la fase de pomodoro en curso? */
export function isPhaseComplete(
  state: TimerState,
  config: PomodoroConfig,
  now = Date.now(),
): boolean {
  const target = targetMs(state, config)
  return target !== null && elapsedMs(state, now) >= target
}

/**
 * Trabajo ya cerrado, en milisegundos.
 *
 * Para un temporizador guardado por una versión anterior no hay dato real, así
 * que se recurre a la fórmula de entonces —pomodoros × duración configurada—.
 * Es una aproximación, pero perder los tramos ya hechos sería peor.
 */
function finishedWorkMs(state: TimerState, config: PomodoroConfig): number {
  if (state.workedMs !== undefined) return state.workedMs
  return state.mode === 'pomodoro' ? state.completed * config.workMinutes * 60_000 : 0
}

/**
 * Pasa a la siguiente fase del pomodoro.
 *
 * El contador de pomodoros solo sube al terminar un tramo de TRABAJO: los
 * descansos no cuentan como estudio. Y lo trabajado en el tramo que se cierra
 * se guarda TAL CUAL, con sus minutos de más si se ha alargado: antes se
 * perdían, porque el contador de la fase se reiniciaba aquí y los minutos
 * finales salían de multiplicar pomodoros por la duración configurada.
 */
export function nextPhase(
  state: TimerState,
  config: PomodoroConfig,
  now = Date.now(),
): TimerState {
  const wasWork = state.phase === 'trabajo'
  return {
    ...state,
    phase: wasWork ? 'descanso' : 'trabajo',
    runningSince: now,
    accumulatedMs: 0,
    completed: state.completed + (wasWork ? 1 : 0),
    workedMs: finishedWorkMs(state, config) + (wasWork ? elapsedMs(state, now) : 0),
  }
}

/** Minutos de estudio que registrar al cerrar. Los descansos no cuentan. */
export function minutesToLog(state: TimerState, config: PomodoroConfig, now = Date.now()): number {
  const currentMs = state.phase === 'trabajo' ? elapsedMs(state, now) : 0
  return Math.round((finishedWorkMs(state, config) + currentMs) / 60_000)
}

/** '25:00' — el formato que se lee de un vistazo en un temporizador. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** Cuenta atrás de la fase, o tiempo transcurrido en modo libre. */
export function displayMs(state: TimerState, config: PomodoroConfig, now = Date.now()): number {
  const target = targetMs(state, config)
  const elapsed = elapsedMs(state, now)
  return target === null ? elapsed : Math.max(0, target - elapsed)
}

// ---------------------------------------------------------------------------
// Lectura del estado guardado
// ---------------------------------------------------------------------------

/** Margen para relojes ligeramente desajustados al validar marcas futuras. */
const CLOCK_SKEW_MS = 60_000

const MODES: TimerMode[] = ['pomodoro', 'libre']
const PHASES: TimerPhase[] = ['trabajo', 'descanso']

function isPositiveTime(value: unknown, now: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= now + CLOCK_SKEW_MS
}

/**
 * Valida un temporizador recuperado del almacenamiento.
 *
 * Comprobar solo que exista `mode` no basta: el estado guardado puede venir de
 * una versión anterior, de una edición manual del almacenamiento o de un
 * guardado interrumpido. Restaurar un temporizador con un `runningSince` en el
 * futuro o un `accumulatedMs` absurdo produce relojes imposibles y, peor,
 * sesiones de estudio con duraciones inventadas.
 *
 * Devuelve null si no se puede usar; nunca lanza.
 */
export function parseTimerState(raw: unknown, now = Date.now()): TimerState | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>

  if (!MODES.includes(input.mode as TimerMode)) return null
  if (!PHASES.includes(input.phase as TimerPhase)) return null

  const runningSince =
    input.runningSince === null ? null : isPositiveTime(input.runningSince, now) ? input.runningSince : undefined
  if (runningSince === undefined) return null

  const accumulatedRaw = input.accumulatedMs
  if (typeof accumulatedRaw !== 'number' || !Number.isFinite(accumulatedRaw) || accumulatedRaw < 0) {
    return null
  }
  // Tope de 24 h: un temporizador que se ha dejado correr días enteros no
  // puede convertirse en una sesión de miles de minutos.
  const accumulatedMs = Math.min(accumulatedRaw, 24 * 60 * 60 * 1000)

  const completed = input.completed
  if (typeof completed !== 'number' || !Number.isInteger(completed) || completed < 0) {
    return null
  }

  // Los temporizadores guardados antes de que existiera `sessionStartedAt` no
  // lo traen. Se reconstruye lo mejor posible en vez de tirar la sesión: es
  // una aproximación, pero perder el temporizador en marcha es peor.
  const sessionStartedAt = isPositiveTime(input.sessionStartedAt, now)
    ? input.sessionStartedAt
    : now - (accumulatedMs + (runningSince === null ? 0 : now - runningSince))

  const subjectId = typeof input.subjectId === 'string' ? input.subjectId : undefined
  const topic = typeof input.topic === 'string' ? input.topic : undefined

  // Si falta o viene roto se deja sin definir, no a cero: `finishedWorkMs`
  // sabe recurrir entonces a la fórmula antigua, que es una aproximación pero
  // conserva los tramos ya hechos.
  const workedMs =
    typeof input.workedMs === 'number' && Number.isFinite(input.workedMs) && input.workedMs >= 0
      ? input.workedMs
      : undefined

  return {
    mode: input.mode as TimerMode,
    phase: input.phase as TimerPhase,
    runningSince,
    accumulatedMs,
    sessionStartedAt: Math.min(sessionStartedAt, now),
    completed,
    subjectId,
    topic,
    workedMs,
  }
}
