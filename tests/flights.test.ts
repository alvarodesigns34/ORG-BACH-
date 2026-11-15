/**
 * Pruebas del modo estudio: geografía, duración de los vuelos, destinos y el
 * tiempo de una sesión con pausas. Y el ciclo de vida en el reductor.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createEmptyData } from '../src/data/defaults.ts'
import {
  HOME_IATA,
  airportFromRow,
  arc,
  currentAirport,
  destinationsFor,
  distanceKm,
  elapsedMs,
  formatFlightTime,
  interpolate,
  minutesFor,
  progress,
  remainingMs,
  type AirportRow,
} from '../src/domain/flights.ts'
import { reducer } from '../src/state/reducer.ts'
import { parseSession } from '../src/storage/validate.ts'
import type { AppData, FocusSession } from '../src/domain/types.ts'

const MAD = { lat: 40.472, lon: -3.561 }
const BCN = { lat: 41.297, lon: 2.078 }

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: 'v1',
    kind: 'vuelo',
    from: 'MAD',
    to: 'BCN',
    distanceKm: 483,
    plannedMinutes: 48,
    seat: '01A',
    status: 'en_vuelo',
    startedAt: '2026-11-15T10:00:00.000Z',
    pausedMs: 0,
    createdAt: '2026-11-15T10:00:00.000Z',
    ...overrides,
  }
}

const at = (iso: string) => Date.parse(iso)

describe('geografía', () => {
  it('Madrid–Barcelona son unos 483 km y 48 minutos', () => {
    const km = distanceKm(MAD, BCN)
    assert.ok(Math.abs(km - 483) < 5, `distancia ${km}`)
    assert.equal(minutesFor(km), 48)
  })

  it('la interpolación empieza y acaba en los extremos', () => {
    const start = interpolate(MAD, BCN, 0)
    const end = interpolate(MAD, BCN, 1)
    assert.ok(Math.abs(start.lat - MAD.lat) < 1e-6 && Math.abs(start.lon - MAD.lon) < 1e-6)
    assert.ok(Math.abs(end.lat - BCN.lat) < 1e-6 && Math.abs(end.lon - BCN.lon) < 1e-6)
  })

  it('el arco no salta al cruzar el antimeridiano', () => {
    const points = arc({ lat: 35, lon: 170 }, { lat: 40, lon: -170 })
    for (let i = 1; i < points.length; i++) {
      assert.ok(Math.abs(points[i][0] - points[i - 1][0]) < 10)
    }
  })
})

describe('destinationsFor', () => {
  const row = (iata: string, city: string, lat: number, lon: number, major = 1): AirportRow => [
    iata, city, 'ES', lat, lon, major,
  ]
  const airports = [
    row('MAD', 'Madrid', 40.472, -3.561),
    row('BCN', 'Barcelona', 41.297, 2.078),
    row('VLC', 'Valencia', 39.489, -0.482),
    row('AGP', 'Málaga', 36.675, -4.499),
    row('SVQ', 'Sevilla', 37.418, -5.893),
    row('BIO', 'Bilbao', 43.301, -2.911),
    row('XXX', 'Barcelona', 41.3, 2.1, 0),
  ].map(airportFromRow)
  const origin = airports[0]

  it('ordena por cercanía al tiempo pedido y nunca incluye el origen', () => {
    const list = destinationsFor(origin, airports, 48)
    assert.equal(list[0].airport.iata, 'BCN')
    assert.ok(list.every((d) => d.airport.iata !== 'MAD'))
  })

  it('una ciudad con dos aeropuertos sale una vez, el grande', () => {
    const list = destinationsFor(origin, airports, 48)
    assert.equal(list.filter((d) => d.airport.city === 'Barcelona').length, 1)
    assert.equal(list.find((d) => d.airport.city === 'Barcelona')?.airport.iata, 'BCN')
  })

  it('si no hay nada cerca del tiempo pedido, ensancha la búsqueda', () => {
    assert.ok(destinationsFor(origin, airports, 200).length > 0)
  })
})

describe('tiempo de una sesión', () => {
  it('descuenta las pausas cerradas y la abierta', () => {
    const s = session({ pausedMs: 5 * 60_000 })
    assert.equal(elapsedMs(s, at('2026-11-15T10:20:00.000Z')), 15 * 60_000)
    const paused = session({ pausedAt: '2026-11-15T10:10:00.000Z' })
    assert.equal(elapsedMs(paused, at('2026-11-15T11:00:00.000Z')), 10 * 60_000)
  })

  it('progreso y tiempo restante', () => {
    const s = session({ plannedMinutes: 40 })
    const now = at('2026-11-15T10:10:00.000Z')
    assert.equal(progress(s, now), 0.25)
    assert.equal(remainingMs(s, now), 30 * 60_000)
    assert.equal(progress(s, at('2026-11-15T12:00:00.000Z')), 1)
  })

  it('formato de duración', () => {
    assert.equal(formatFlightTime(48), '48 min')
    assert.equal(formatFlightTime(65), '1 h 05 min')
    assert.equal(formatFlightTime(120), '2 h')
  })
})

describe('currentAirport', () => {
  it('sin vuelos, en Madrid; después, donde aterrizó el último', () => {
    assert.equal(currentAirport([]), HOME_IATA)
    const list = [
      session({ id: 'a', to: 'BCN', status: 'aterrizado', endedAt: '2026-11-14T10:00:00.000Z' }),
      session({ id: 'b', from: 'BCN', to: 'MRS', status: 'aterrizado', endedAt: '2026-11-15T10:00:00.000Z' }),
      session({ id: 'c', from: 'MRS', to: 'FCO', status: 'cancelado', endedAt: '2026-11-15T12:00:00.000Z' }),
    ]
    assert.equal(currentAirport(list), 'MRS')
  })
})

describe('reducer: sesiones', () => {
  const start = (state: AppData) =>
    reducer(state, {
      type: 'session/start',
      session: { from: 'MAD', to: 'BCN', distanceKm: 483, plannedMinutes: 48, seat: '02C' },
    })

  it('despega una sola sesión a la vez', () => {
    const one = start(createEmptyData())
    assert.equal(one.sessions.length, 1)
    assert.equal(one.sessions[0].status, 'en_vuelo')
    assert.equal(start(one), one)
  })

  it('pausa y reanuda acumulando el tiempo de pausa', () => {
    const flying = start(createEmptyData())
    const id = flying.sessions[0].id
    const paused = reducer(flying, { type: 'session/pause', id })
    assert.ok(paused.sessions[0].pausedAt)
    const resumed = reducer(paused, { type: 'session/resume', id })
    assert.equal(resumed.sessions[0].pausedAt, undefined)
    assert.ok(resumed.sessions[0].pausedMs >= 0)
  })

  it('al aterrizar cuenta el tiempo previsto y deja actividad', () => {
    const flying = start(createEmptyData())
    const id = flying.sessions[0].id
    const landed = reducer(flying, { type: 'session/land', id, route: 'Madrid → Barcelona' })
    assert.equal(landed.sessions[0].status, 'aterrizado')
    assert.equal(landed.sessions[0].focusedMinutes, 48)
    assert.ok(landed.sessions[0].endedAt)
    assert.equal(landed.activity[0].kind, 'vuelo_aterrizado')
    assert.equal(currentAirport(landed.sessions), 'BCN')
  })

  it('abandonar no te lleva al destino', () => {
    const flying = start(createEmptyData())
    const cancelled = reducer(flying, { type: 'session/cancel', id: flying.sessions[0].id })
    assert.equal(cancelled.sessions[0].status, 'cancelado')
    assert.equal(currentAirport(cancelled.sessions), HOME_IATA)
  })

  it('borrar una asignatura conserva sus vuelos, sueltos', () => {
    let state = createEmptyData()
    state = reducer(state, {
      type: 'subject/add',
      subject: { name: 'Física', color: 'teal', weight: 4, schedule: [], categories: [] },
    })
    const subjectId = state.subjects[0].id
    state = reducer(state, {
      type: 'session/start',
      session: { from: 'MAD', to: 'BCN', distanceKm: 483, plannedMinutes: 48, seat: '02C', subjectId },
    })
    state = reducer(state, { type: 'subject/remove', id: subjectId })
    assert.equal(state.sessions.length, 1)
    assert.equal(state.sessions[0].subjectId, undefined)
  })
})

describe('parseSession', () => {
  it('acepta un vuelo y rechaza las sesiones del antiguo temporizador', () => {
    assert.ok(parseSession(session()))
    assert.equal(parseSession({ id: 's1', subjectId: 'x', minutes: 25, startedAt: '2026-01-01T00:00:00.000Z' }), null)
  })

  it('un vuelo cerrado sin hora de cierre se cierra en su salida', () => {
    const parsed = parseSession(session({ status: 'aterrizado', endedAt: undefined }))
    assert.equal(parsed?.endedAt, '2026-11-15T10:00:00.000Z')
  })

  it('una pausa abierta en un vuelo cerrado se descarta', () => {
    const parsed = parseSession(
      session({ status: 'cancelado', pausedAt: '2026-11-15T10:05:00.000Z', endedAt: '2026-11-15T10:06:00.000Z' }),
    )
    assert.equal(parsed?.pausedAt, undefined)
  })
})
