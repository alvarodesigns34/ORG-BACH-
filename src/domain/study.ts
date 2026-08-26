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
  subjectId?: ID
  topic?: string
  /** Pomodoros de trabajo completados desde que empezó. */
  completed: number
}

export interface PomodoroConfig {
  workMinutes: number
  breakMinutes: number
}

export const DEFAULT_POMODORO: PomodoroConfig = { workMinutes: 25, breakMinutes: 5 }

export function createTimer(mode: TimerMode, subjectId?: ID, topic?: string): TimerState {
  return {
    mode,
    phase: 'trabajo',
    runningSince: Date.now(),
    accumulatedMs: 0,
    subjectId,
    topic,
    completed: 0,
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
 * Pasa a la siguiente fase del pomodoro.
 *
 * El contador de pomodoros solo sube al terminar un tramo de TRABAJO: los
 * descansos no cuentan como estudio.
 */
export function nextPhase(state: TimerState, now = Date.now()): TimerState {
  const wasWork = state.phase === 'trabajo'
  return {
    ...state,
    phase: wasWork ? 'descanso' : 'trabajo',
    runningSince: now,
    accumulatedMs: 0,
    completed: state.completed + (wasWork ? 1 : 0),
  }
}

/** Minutos de estudio que registrar al cerrar. Los descansos no cuentan. */
export function minutesToLog(state: TimerState, config: PomodoroConfig, now = Date.now()): number {
  const currentPhaseMinutes =
    state.phase === 'trabajo' ? Math.round(elapsedMs(state, now) / 60_000) : 0
  const finishedPomodoros = state.mode === 'pomodoro' ? state.completed * config.workMinutes : 0
  return currentPhaseMinutes + finishedPomodoros
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
