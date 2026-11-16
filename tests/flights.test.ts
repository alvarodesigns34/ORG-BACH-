/**
 * Pruebas del modo estudio: geografía, duración de los vuelos, destinos y el
 * tiempo de una sesión con pausas. Y el ciclo de vida en el reductor.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createEmptyData } from '../src/data/defaults.ts'
import {
  HOME_IATA,
  advance,
  airportFromRow,
  arc,
  currentAirport,
  destinationsFor,
  distanceKm,
  elapsedMs,
  formatFlightTime,
  inLayover,
  interpolate,
  landingAt,
  layoverDue,
  layoverPoints,
  layoverRemainingMs,
  layoversLeft,
  nextEvent,
  timeline,
  minutesBySubject,
  passport,
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

describe('escalas', () => {
  it('toca a mitad de vuelo, una sola vez y solo si se pidió', () => {
    const half = at('2026-11-15T10:24:00.000Z')
    assert.equal(layoverDue(session({ layoverMinutes: 10 }), half), true)
    assert.equal(layoverDue(session(), half), false)
    assert.equal(layoverDue(session({ layoverMinutes: 10 }), at('2026-11-15T10:10:00.000Z')), false)
    assert.equal(
      layoverDue(session({ layoverMinutes: 10, layoverAt: '2026-11-15T10:24:00.000Z' }), half),
      false,
    )
  })

  it('cuenta atrás de la escala y estado', () => {
    const s = session({
      layoverMinutes: 10,
      layoverAt: '2026-11-15T10:24:00.000Z',
      pausedAt: '2026-11-15T10:24:00.000Z',
    })
    assert.equal(inLayover(s), true)
    assert.equal(layoverRemainingMs(s, at('2026-11-15T10:30:00.000Z')), 4 * 60_000)
    assert.equal(layoverRemainingMs(s, at('2026-11-15T10:40:00.000Z')), 0)
    // Una pausa normal posterior no es la escala.
    assert.equal(inLayover({ ...s, pausedAt: '2026-11-15T10:50:00.000Z' }), false)
  })

  it('el reductor inicia la escala y la reanudación descuenta el descanso', () => {
    let state = reducer(createEmptyData(), {
      type: 'session/start',
      session: {
        from: 'MAD',
        to: 'BCN',
        distanceKm: 483,
        plannedMinutes: 48,
        seat: '02C',
        layoverMinutes: 5,
      },
    })
    const id = state.sessions[0].id
    state = reducer(state, { type: 'session/layover', id })
    assert.ok(state.sessions[0].layoverAt)
    assert.equal(state.sessions[0].pausedAt, state.sessions[0].layoverAt)
    // Segunda vez, nada.
    assert.equal(reducer(state, { type: 'session/layover', id }), state)
    state = reducer(state, { type: 'session/resume', id })
    assert.equal(state.sessions[0].pausedAt, undefined)
    assert.ok(state.sessions[0].layoverAt)
  })
})

describe('escalas tipo Pomodoro y línea de tiempo', () => {
  const T0 = at('2026-11-15T10:00:00.000Z')
  const min = (m: number) => T0 + m * 60_000
  // 120 minutos de estudio, descanso de 10 cada 50.
  const pomodoro = (overrides: Partial<FocusSession> = {}) =>
    session({ plannedMinutes: 120, layoverMinutes: 10, layoverEvery: 50, layoversDone: 0, ...overrides })

  it('reparte las escalas cada N minutos y no pone una al final', () => {
    assert.deepEqual(layoverPoints(pomodoro()), [50, 100])
    // 100 minutos con 50/10: la segunda coincidiría con el aterrizaje.
    assert.deepEqual(layoverPoints(pomodoro({ plannedMinutes: 100 })), [50])
    // Quedarían 3 minutos tras la escala: no merece la pena parar.
    assert.deepEqual(layoverPoints(pomodoro({ plannedMinutes: 53 })), [])
    // Sin ritmo, una sola a mitad de vuelo; sin duración, ninguna.
    assert.deepEqual(layoverPoints(session({ layoverMinutes: 5 })), [24])
    assert.deepEqual(layoverPoints(session({ layoverEvery: 25 })), [])
  })

  it('la línea de tiempo encadena escalas y aterrizaje con sus horas reales', () => {
    const events = timeline(pomodoro(), T0)
    assert.deepEqual(
      events.map((e) => [e.kind, (e.at - T0) / 60_000]),
      [
        ['escala', 50],
        ['fin_escala', 60],
        ['escala', 110],
        ['fin_escala', 120],
        ['aterrizaje', 140],
      ],
    )
    assert.equal(landingAt(pomodoro(), T0), min(140))
    assert.equal(layoversLeft(pomodoro()), 2)
  })

  it('en pausa manual no hay nada previsto', () => {
    const paused = pomodoro({ pausedAt: '2026-11-15T10:20:00.000Z' })
    assert.equal(nextEvent(paused), null)
    assert.deepEqual(timeline(paused, min(30)), [])
    assert.equal(landingAt(paused, min(30)), null)
  })

  it('advance no toca el vuelo si aún no ha pasado nada', () => {
    const s = pomodoro()
    assert.equal(advance(s, min(49)), s)
  })

  it('advance empieza la escala en su minuto exacto aunque se mire tarde', () => {
    const s = advance(pomodoro(), min(53))
    assert.equal(inLayover(s), true)
    assert.equal(s.layoverAt, new Date(min(50)).toISOString())
    assert.equal(s.layoverEndsAt, new Date(min(60)).toISOString())
    assert.equal(s.layoversDone, 1)
    assert.equal(layoverRemainingMs(s, min(53)), 7 * 60_000)
    // En escala el reloj del vuelo está parado.
    assert.equal(remainingMs(s, min(53)), 70 * 60_000)
  })

  it('advance recupera de una vez todo lo ocurrido con la app cerrada', () => {
    // Se mira a los 115 min: una escala entera hecha y la segunda en curso.
    const mid = advance(pomodoro(), min(115))
    assert.equal(mid.pausedMs, 10 * 60_000)
    assert.equal(mid.layoversDone, 2)
    assert.equal(inLayover(mid), true)
    // Y a las tres horas: aterrizó a su hora, no «ahora».
    const done = advance(pomodoro(), min(180))
    assert.equal(done.status, 'aterrizado')
    assert.equal(done.endedAt, new Date(min(140)).toISOString())
    assert.equal(done.focusedMinutes, 120)
    assert.equal(done.pausedAt, undefined)
    assert.equal(done.layoverEndsAt, undefined)
    assert.equal(done.pausedMs, 20 * 60_000)
  })

  it('una pausa manual retrasa todo lo que viene detrás', () => {
    // 10 minutos de pausa ya cerrada: la primera escala pasa a los 60.
    const s = pomodoro({ pausedMs: 10 * 60_000 })
    assert.deepEqual(nextEvent(s), { kind: 'escala', at: min(60) })
    assert.equal(landingAt(s, T0), min(150))
  })

  it('los vuelos antiguos con una escala a mitad siguen funcionando', () => {
    const legacy = session({ layoverMinutes: 10 })
    assert.deepEqual(
      timeline(legacy, T0).map((e) => [e.kind, (e.at - T0) / 60_000]),
      [
        ['escala', 24],
        ['fin_escala', 34],
        ['aterrizaje', 58],
      ],
    )
    // Ya hecha (sin contador, como se guardaba antes): no se repite.
    const taken = session({ layoverMinutes: 10, layoverAt: '2026-11-15T10:24:00.000Z', pausedMs: 600_000 })
    assert.deepEqual(timeline(taken, min(40)).map((e) => e.kind), ['aterrizaje'])
  })

  it('el reductor pone el vuelo al día y apunta el aterrizaje una sola vez', () => {
    let state: AppData = {
      ...createEmptyData(),
      sessions: [pomodoro({ plannedMinutes: 60, layoverEvery: 25, layoverMinutes: 5 })],
    }
    const same = reducer(state, { type: 'session/tick', id: 'v1', now: min(10) })
    assert.equal(same, state)
    state = reducer(state, { type: 'session/tick', id: 'v1', now: min(26) })
    assert.equal(inLayover(state.sessions[0]), true)
    assert.equal(state.activity.length, 0)
    state = reducer(state, { type: 'session/tick', id: 'v1', now: min(500), route: 'Madrid → Barcelona' })
    assert.equal(state.sessions[0].status, 'aterrizado')
    // 60 de vuelo + dos escalas de 5 (a los 25 y a los 50).
    assert.equal(state.sessions[0].endedAt, new Date(min(70)).toISOString())
    assert.equal(state.activity.length, 1)
    assert.match(state.activity[0].text, /Madrid → Barcelona/)
    assert.equal(reducer(state, { type: 'session/tick', id: 'v1', now: min(600) }), state)
  })

  it('una escala pedida a mano no gasta las programadas', () => {
    let state = reducer(createEmptyData(), {
      type: 'session/start',
      session: { from: 'MAD', to: 'BCN', distanceKm: 483, plannedMinutes: 120, seat: '02C', layoverMinutes: 10, layoverEvery: 50 },
    })
    const id = state.sessions[0].id
    assert.equal(state.sessions[0].layoversDone, 0)
    state = reducer(state, { type: 'session/layover', id, minutes: 5 })
    assert.equal(inLayover(state.sessions[0]), true)
    assert.equal(state.sessions[0].layoversDone, 0)
    const ends = Date.parse(state.sessions[0].layoverEndsAt!) - Date.parse(state.sessions[0].layoverAt!)
    assert.equal(ends, 5 * 60_000)
    state = reducer(state, { type: 'session/resume', id })
    assert.equal(state.sessions[0].layoverEndsAt, undefined)
    assert.equal(layoversLeft(state.sessions[0]), 2)
  })

  it('sin duración de descanso, el ritmo no se guarda', () => {
    const state = reducer(createEmptyData(), {
      type: 'session/start',
      session: { from: 'MAD', to: 'BCN', distanceKm: 483, plannedMinutes: 120, seat: '02C', layoverEvery: 50 },
    })
    assert.equal(state.sessions[0].layoverEvery, undefined)
    assert.equal(state.sessions[0].layoversDone, undefined)
  })

  it('el validador conserva los campos nuevos y descarta los imposibles', () => {
    const ok = parseSession(
      pomodoro({
        layoversDone: 1,
        pausedAt: '2026-11-15T10:50:00.000Z',
        layoverAt: '2026-11-15T10:50:00.000Z',
        layoverEndsAt: '2026-11-15T11:00:00.000Z',
      }),
    )
    assert.equal(ok?.layoverEvery, 50)
    assert.equal(ok?.layoversDone, 1)
    assert.equal(ok?.layoverEndsAt, '2026-11-15T11:00:00.000Z')
    const bad = parseSession({ ...pomodoro(), layoverEvery: 1, layoversDone: -2, layoverEndsAt: 'ayer' })
    assert.equal(bad?.layoverEvery, undefined)
    assert.equal(bad?.layoversDone, undefined)
    assert.equal(bad?.layoverEndsAt, undefined)
    // Aterrizado: ya no hay fin de escala pendiente.
    const landed = parseSession(
      pomodoro({ status: 'aterrizado', endedAt: '2026-11-15T12:20:00.000Z', layoverEndsAt: '2026-11-15T11:00:00.000Z' }),
    )
    assert.equal(landed?.layoverEndsAt, undefined)
  })
})

describe('pasaporte y tiempo por asignatura', () => {
  const list = [
    session({ id: 'a', to: 'BCN', status: 'aterrizado', endedAt: '2026-11-10T10:00:00.000Z', focusedMinutes: 48, subjectId: 'fis' }),
    session({ id: 'b', from: 'BCN', to: 'MAD', status: 'aterrizado', endedAt: '2026-11-12T10:00:00.000Z', focusedMinutes: 48, subjectId: 'mat' }),
    session({ id: 'c', from: 'MAD', to: 'BCN', status: 'aterrizado', endedAt: '2026-11-14T10:00:00.000Z', focusedMinutes: 48, subjectId: 'fis' }),
    session({ id: 'd', from: 'BCN', to: 'MRS', status: 'cancelado', endedAt: '2026-11-15T10:00:00.000Z', focusedMinutes: 12, subjectId: 'fis' }),
  ]
  const country: Record<string, string> = { MAD: 'ES', BCN: 'ES', MRS: 'FR' }

  it('un sello por ciudad, con sus visitas; los abandonados no cuentan', () => {
    const p = passport(list, (iata) => country[iata])
    assert.equal(p.flights, 3)
    assert.equal(p.minutes, 144)
    assert.deepEqual(p.stamps.map((s) => [s.iata, s.visits]).sort(), [['BCN', 2], ['MAD', 1]])
    assert.deepEqual(p.countries, ['ES'])
  })

  it('suma minutos por asignatura desde una fecha, abandonados incluidos', () => {
    const by = minutesBySubject(list, at('2026-11-11T00:00:00.000Z'))
    assert.equal(by.get('fis'), 60)
    assert.equal(by.get('mat'), 48)
  })
})
