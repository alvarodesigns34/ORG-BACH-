/**
 * Pruebas del día y la noche del globo: la posición del sol y la sombra.
 * Referencias: efemérides del Observatorio Naval de EE. UU. (USNO).
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { darkness, paintNight, subsolarPoint, sunAltitude } from '../src/features/study/daylight.ts'

const near = (actual: number, expected: number, tolerance: number) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} no está a ±${tolerance} de ${expected}`)

describe('posición del sol', () => {
  it('solsticio de junio de 2026: sol sobre el trópico de Cáncer', () => {
    near(subsolarPoint(new Date('2026-06-21T08:24:00Z')).lat, 23.44, 0.05)
  })

  it('equinoccio de marzo de 2026: sol sobre el ecuador', () => {
    near(subsolarPoint(new Date('2026-03-20T14:46:00Z')).lat, 0, 0.05)
  })

  it('18 de noviembre a las 12:00 UTC: declinación −19,3° y mediodía ~3,7° al oeste', () => {
    const sun = subsolarPoint(new Date('2026-11-18T12:00:00Z'))
    near(sun.lat, -19.3, 0.2)
    // Ecuación del tiempo ≈ +14,9 min: el sol pasa por Greenwich a las 11:45.
    near(sun.lon, -3.7, 0.3)
  })

  it('de noche en las antípodas del sol y de día bajo él', () => {
    const sun = subsolarPoint(new Date('2026-11-18T12:00:00Z'))
    near(sunAltitude(sun, sun.lat, sun.lon), 90, 0.01)
    assert.ok(sunAltitude(sun, -sun.lat, sun.lon + 180) < -89)
    // Madrid a mediodía en noviembre: sol bajo pero de día; a medianoche, noche.
    assert.ok(sunAltitude(sun, 40.4, -3.7) > 25)
    assert.ok(sunAltitude(subsolarPoint(new Date('2026-11-18T00:00:00Z')), 40.4, -3.7) < -60)
  })
})

describe('sombra de la noche', () => {
  it('el crepúsculo es un degradado, sin saltos', () => {
    assert.equal(darkness(10), 0)
    assert.equal(darkness(-20), 1)
    let prev = darkness(1)
    for (let h = 1; h >= -12; h -= 0.5) {
      const d = darkness(h)
      assert.ok(d >= prev && d - prev < 0.1)
      prev = d
    }
  })

  it('pinta noche donde es de noche y deja el día transparente', () => {
    const size = 64
    const out = new Uint8ClampedArray(size * size * 4)
    // A las 12:00 UTC: mediodía en Greenwich (centro de la imagen) y medianoche
    // en el antimeridiano (los bordes).
    paintNight(out, size, size, new Date('2026-11-18T12:00:00Z'), { r: 0, g: 0, b: 0, alpha: 0.5 })
    const alphaAt = (x: number, y: number) => out[(y * size + x) * 4 + 3]
    const mid = size / 2
    assert.equal(alphaAt(mid, mid), 0)
    assert.equal(alphaAt(0, mid), 128)
    // Noviembre: el polo norte, de noche todo el día; el sur, de día.
    assert.equal(alphaAt(mid, 0), 128)
    assert.equal(alphaAt(mid, size - 1), 0)
  })
})
