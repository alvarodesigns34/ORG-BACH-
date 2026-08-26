/**
 * Pruebas del temporizador.
 *
 * El caso importante: el tiempo se calcula a partir de marcas de reloj, así
 * que se puede probar pasándole un `now` distinto sin esperar de verdad. Es
 * también la razón de que no se desvíe cuando el navegador estrangula la
 * pestaña en segundo plano.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DEFAULT_POMODORO,
  createTimer,
  displayMs,
  elapsedMs,
  formatClock,
  isPhaseComplete,
  isRunning,
  minutesToLog,
  nextPhase,
  pause,
  phaseProgress,
  resume,
} from '../src/domain/study.ts'

const MIN = 60_000
const T0 = 1_700_000_000_000

function startedAt(now: number) {
  const timer = createTimer('pomodoro')
  return { ...timer, runningSince: now }
}

describe('elapsedMs', () => {
  it('cuenta desde la marca de inicio', () => {
    const timer = startedAt(T0)
    assert.equal(elapsedMs(timer, T0 + 5 * MIN), 5 * MIN)
  })

  it('no avanza mientras está en pausa', () => {
    const timer = pause(startedAt(T0), T0 + 5 * MIN)
    assert.equal(isRunning(timer), false)
    // Diez minutos después sigue marcando cinco.
    assert.equal(elapsedMs(timer, T0 + 15 * MIN), 5 * MIN)
  })

  it('suma los tramos al reanudar', () => {
    let timer = pause(startedAt(T0), T0 + 5 * MIN)
    timer = resume(timer, T0 + 20 * MIN)
    // 5 acumulados + 3 desde que se reanudó.
    assert.equal(elapsedMs(timer, T0 + 23 * MIN), 8 * MIN)
  })

  it('pausar dos veces seguidas no duplica el tiempo', () => {
    const once = pause(startedAt(T0), T0 + 5 * MIN)
    const twice = pause(once, T0 + 9 * MIN)
    assert.equal(elapsedMs(twice, T0 + 9 * MIN), 5 * MIN)
  })
})

describe('fases del pomodoro', () => {
  it('detecta el final del tramo de trabajo', () => {
    const timer = startedAt(T0)
    assert.equal(isPhaseComplete(timer, DEFAULT_POMODORO, T0 + 24 * MIN), false)
    assert.equal(isPhaseComplete(timer, DEFAULT_POMODORO, T0 + 25 * MIN), true)
  })

  it('la cuenta atrás nunca baja de cero', () => {
    const timer = startedAt(T0)
    assert.equal(displayMs(timer, DEFAULT_POMODORO, T0 + 30 * MIN), 0)
  })

  it('en modo libre el reloj sube en vez de bajar', () => {
    const timer = { ...createTimer('libre'), runningSince: T0 }
    assert.equal(displayMs(timer, DEFAULT_POMODORO, T0 + 7 * MIN), 7 * MIN)
    assert.equal(phaseProgress(timer, DEFAULT_POMODORO, T0 + 7 * MIN), 0)
  })

  it('el progreso se queda en 1 aunque se pase', () => {
    const timer = startedAt(T0)
    assert.equal(phaseProgress(timer, DEFAULT_POMODORO, T0 + 50 * MIN), 1)
  })

  it('al pasar a descanso cuenta un pomodoro', () => {
    const timer = nextPhase(startedAt(T0), T0 + 25 * MIN)
    assert.equal(timer.phase, 'descanso')
    assert.equal(timer.completed, 1)
    assert.equal(timer.accumulatedMs, 0)
  })

  it('volver del descanso no cuenta otro pomodoro', () => {
    const afterWork = nextPhase(startedAt(T0), T0 + 25 * MIN)
    const afterBreak = nextPhase(afterWork, T0 + 30 * MIN)
    assert.equal(afterBreak.phase, 'trabajo')
    assert.equal(afterBreak.completed, 1)
  })
})

describe('minutesToLog', () => {
  it('registra el tramo de trabajo en curso', () => {
    const timer = startedAt(T0)
    assert.equal(minutesToLog(timer, DEFAULT_POMODORO, T0 + 18 * MIN), 18)
  })

  it('el descanso no cuenta como estudio', () => {
    // Un pomodoro terminado (25 min) y 4 minutos de descanso.
    const timer = nextPhase(startedAt(T0), T0 + 25 * MIN)
    assert.equal(minutesToLog(timer, DEFAULT_POMODORO, T0 + 29 * MIN), 25)
  })

  it('suma los pomodoros completados al tramo en curso', () => {
    let timer = nextPhase(startedAt(T0), T0 + 25 * MIN) // trabajo hecho
    timer = nextPhase(timer, T0 + 30 * MIN) // vuelta al trabajo
    // 25 del primero + 10 del que está corriendo.
    assert.equal(minutesToLog(timer, DEFAULT_POMODORO, T0 + 40 * MIN), 35)
  })

  it('respeta unas duraciones personalizadas', () => {
    const config = { workMinutes: 50, breakMinutes: 10 }
    const timer = nextPhase(startedAt(T0), T0 + 50 * MIN)
    assert.equal(minutesToLog(timer, config, T0 + 55 * MIN), 50)
  })
})

describe('formatClock', () => {
  it('siempre con dos cifras', () => {
    assert.equal(formatClock(0), '00:00')
    assert.equal(formatClock(65_000), '01:05')
    assert.equal(formatClock(25 * MIN), '25:00')
  })

  it('no muestra tiempos negativos', () => {
    assert.equal(formatClock(-5000), '00:00')
  })
})
