/**
 * Pruebas de la telemetría del vuelo y de las ondas del modo estudio.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { flightAltitude, flightPhase } from '../src/features/study/telemetry.ts'
import { WAVES, waveSpec } from '../src/features/study/waves.ts'

describe('telemetría del vuelo', () => {
  it('recorre las fases en orden', () => {
    const phases = [0, 0.05, 0.5, 0.9, 0.99].map(flightPhase)
    assert.deepEqual(phases, ['Despegue', 'Ascenso', 'Crucero', 'Descenso', 'Aproximación'])
  })

  it('la altitud empieza y termina en el suelo y no baja durante el crucero', () => {
    assert.equal(flightAltitude(0, 800), 0)
    assert.equal(flightAltitude(1, 800), 0)
    const cruise = flightAltitude(0.5, 800)
    assert.equal(flightAltitude(0.3, 800), cruise)
    assert.ok(flightAltitude(0.06, 800) < cruise)
  })

  it('un vuelo corto vuela más bajo que uno largo, dentro de límites reales', () => {
    const short = flightAltitude(0.5, 150)
    const long = flightAltitude(0.5, 4000)
    assert.ok(short < long)
    assert.ok(short >= 6000 && long <= 11_600)
  })
})

describe('ondas', () => {
  it('las cuatro bandas tienen el pulso en su rango clásico', () => {
    const range: Record<string, [number, number]> = { theta: [4, 8], alfa: [8, 13], beta: [13, 30], gamma: [30, 100] }
    for (const w of WAVES) {
      const [lo, hi] = range[w.id]
      assert.ok(w.beat >= lo && w.beat < hi, `${w.id}: ${w.beat} Hz`)
      // El tono portador, audible y muy por encima del pulso.
      assert.ok(w.carrier >= 100 && w.carrier <= 500 && w.carrier > w.beat * 5)
    }
  })

  it('una banda desconocida cae en beta', () => {
    assert.equal(waveSpec('x' as never).id, 'beta')
  })
})
