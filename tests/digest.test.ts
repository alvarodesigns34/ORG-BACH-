/**
 * Pruebas del resumen diario que envía la Edge Function `daily-digest`.
 *
 * `digest.ts` es puro (sin Deno ni red), así que se prueba aquí igual que el
 * resto. Cubre el texto del aviso y, sobre todo, que las 17:00 de Madrid
 * caigan en su sitio a ambos lados del cambio de hora.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildDigest, localParts, type SyncRow } from '../supabase/functions/daily-digest/digest.ts'

const C = (n: number) => `000000000000${String(n).padStart(3, '0')}:00000:a`

function row(
  collection: string,
  id: string,
  data: Record<string, unknown>,
  clocks?: Record<string, string>,
): SyncRow {
  return { collection, id, data, clocks: clocks ?? { _deleted: C(1) } }
}

const TODAY = '2026-11-02'

describe('hora local en Europe/Madrid', () => {
  it('17:00 de Madrid en verano (CEST) son las 15:00 UTC', () => {
    const local = localParts(new Date('2026-10-24T15:00:00Z'), 'Europe/Madrid')
    assert.equal(local.hour, 17)
    assert.equal(local.day, '2026-10-24')
  })

  it('17:00 de Madrid en invierno (CET) son las 16:00 UTC', () => {
    // El cambio de hora de 2026 es el domingo 25 de octubre.
    assert.equal(localParts(new Date('2026-10-26T16:00:00Z'), 'Europe/Madrid').hour, 17)
    assert.equal(localParts(new Date('2026-10-26T15:00:00Z'), 'Europe/Madrid').hour, 16)
  })

  it('el día del cambio de hora también da las 17:00 una sola vez', () => {
    const hours = Array.from({ length: 24 }, (_, h) =>
      localParts(new Date(Date.UTC(2026, 9, 25, h)), 'Europe/Madrid'),
    ).filter((p) => p.day === '2026-10-25' && p.hour === 17)
    assert.equal(hours.length, 1)
  })

  it('cerca de medianoche el día local no es el día UTC', () => {
    assert.equal(localParts(new Date('2026-11-02T23:30:00Z'), 'Europe/Madrid').day, '2026-11-03')
  })
})

describe('texto del resumen', () => {
  const subject = row('subjects', 'mat', { name: 'Matemáticas I' })

  it('sin nada pendiente se marca como vacío (no se envía)', () => {
    assert.equal(buildDigest([subject], TODAY).empty, true)
  })

  it('cuenta las tareas de hoy y las atrasadas, no las futuras ni las hechas', () => {
    const digest = buildDigest(
      [
        subject,
        row('tasks', 'a', {
          title: 'Derivadas',
          status: 'pendiente',
          dueDate: TODAY,
          subjectId: 'mat',
        }),
        row('tasks', 'b', { title: 'Informe', status: 'pendiente', dueDate: '2026-10-30' }),
        row('tasks', 'c', { title: 'Futura', status: 'pendiente', dueDate: '2026-11-09' }),
        row('tasks', 'd', { title: 'Hecha', status: 'completada', dueDate: TODAY }),
      ],
      TODAY,
    )
    assert.equal(digest.empty, false)
    assert.equal(digest.title, '2 tareas pendientes · 1 atrasada')
    assert.match(digest.body, /Derivadas \(Matemáticas I\)/)
    assert.doesNotMatch(digest.body, /Futura|Hecha/)
  })

  it('incluye los exámenes de la ventana de aviso con su asignatura', () => {
    const digest = buildDigest(
      [subject, row('exams', 'e', { title: 'Tema 2', subjectId: 'mat', date: '2026-11-03' })],
      TODAY,
    )
    assert.equal(digest.title, 'Tienes un examen pronto')
    assert.equal(digest.body, 'Examen de Matemáticas I mañana')
  })

  it('respeta la antelación configurada en los ajustes', () => {
    const rows = [
      subject,
      row('settings', 'settings', { examAlertDays: 3 }),
      row('exams', 'e', { title: 'Tema 2', subjectId: 'mat', date: '2026-11-08' }),
    ]
    assert.equal(buildDigest(rows, TODAY).empty, true)
  })

  it('ignora lo borrado, pero no lo editado después de borrar', () => {
    const borrada = row(
      'tasks',
      'x',
      { title: 'Borrada', status: 'pendiente', dueDate: TODAY, _deleted: true },
      { title: C(1), _deleted: C(2) },
    )
    const resucitada = row(
      'tasks',
      'y',
      { title: 'Resucitada', status: 'pendiente', dueDate: TODAY, _deleted: true },
      { title: C(3), _deleted: C(2) },
    )
    const digest = buildDigest([borrada, resucitada], TODAY)
    assert.equal(digest.title, '1 tarea pendiente')
    assert.match(digest.body, /Resucitada/)
  })

  it('resume en lugar de listar cuando hay muchas', () => {
    const tasks = Array.from({ length: 6 }, (_, i) =>
      row('tasks', `t${i}`, { title: `Tarea ${i}`, status: 'pendiente', dueDate: TODAY }),
    )
    const digest = buildDigest(tasks, TODAY)
    assert.equal(digest.body.split('\n').length, 4)
    assert.match(digest.body, /y 3 tareas más/)
  })
})
