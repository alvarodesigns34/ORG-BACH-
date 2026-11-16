/**
 * Cuándo recordar que se exporte una copia: ni el primer día, ni con sesión
 * iniciada, ni mientras está pospuesto; sí cuando la copia es antigua y hay
 * cosas nuevas, o cuando se han apuntado muchas desde la última.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createEmptyData } from '../src/data/defaults.ts'
import { NUDGE_RULES, backupNudge } from '../src/storage/backup.ts'
import type { AppData, Task } from '../src/domain/types.ts'

const DAY = 86_400_000
const NOW = Date.parse('2026-11-16T12:00:00.000Z')

function withTasks(n: number, createdAt: number): AppData {
  const tasks: Task[] = Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    title: `Tarea ${i}`,
    priority: 'media',
    status: 'pendiente',
    tags: [],
    subtasks: [],
    createdAt: new Date(createdAt).toISOString(),
  }))
  return { ...createEmptyData(), tasks }
}

const none = { lastExportAt: null, snoozedUntil: null }

describe('recordatorio de copia', () => {
  it('no molesta con poco que perder ni el primer día', () => {
    assert.equal(backupNudge(withTasks(3, NOW - 30 * DAY), none, { signedIn: false, now: NOW }), null)
    assert.equal(backupNudge(withTasks(20, NOW - DAY), none, { signedIn: false, now: NOW }), null)
  })

  it('avisa si nunca se ha hecho copia y ya hay un curso', () => {
    const nudge = backupNudge(withTasks(10, NOW - 5 * DAY), none, { signedIn: false, now: NOW })
    assert.equal(nudge?.reason, 'nunca')
  })

  it('con sesión iniciada no hace falta', () => {
    assert.equal(backupNudge(withTasks(10, NOW - 5 * DAY), none, { signedIn: true, now: NOW }), null)
  })

  it('«Más tarde» lo calla hasta la fecha', () => {
    const state = { lastExportAt: null, snoozedUntil: NOW + DAY }
    assert.equal(backupNudge(withTasks(10, NOW - 5 * DAY), state, { signedIn: false, now: NOW }), null)
    assert.ok(backupNudge(withTasks(10, NOW - 5 * DAY), state, { signedIn: false, now: NOW + 2 * DAY }))
  })

  it('copia antigua: solo si hay algo nuevo desde entonces', () => {
    const old = { lastExportAt: NOW - 20 * DAY, snoozedUntil: null }
    // Todo es anterior a la copia: nada que perder.
    assert.equal(backupNudge(withTasks(10, NOW - 30 * DAY), old, { signedIn: false, now: NOW }), null)
    const data = withTasks(10, NOW - 30 * DAY)
    data.tasks[0] = { ...data.tasks[0], createdAt: new Date(NOW - 2 * DAY).toISOString() }
    const nudge = backupNudge(data, old, { signedIn: false, now: NOW })
    assert.equal(nudge?.reason, 'antigua')
    assert.equal(nudge?.since, 1)
    assert.equal(nudge?.days, 20)
  })

  it('muchos cambios desde una copia reciente también avisan', () => {
    const recent = { lastExportAt: NOW - 3 * DAY, snoozedUntil: null }
    assert.equal(backupNudge(withTasks(NUDGE_RULES.manyChanges - 1, NOW - DAY), recent, { signedIn: false, now: NOW }), null)
    assert.equal(
      backupNudge(withTasks(NUDGE_RULES.manyChanges, NOW - DAY), recent, { signedIn: false, now: NOW })?.reason,
      'muchos-cambios',
    )
  })
})
