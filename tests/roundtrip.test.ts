/**
 * Exportar e importar tiene que devolver EXACTAMENTE el mismo curso: es la
 * copia de seguridad de quien no tiene cuenta. Un campo que el validador no
 * conozca se perdería sin aviso al restaurar.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createEmptyData } from '../src/data/defaults.ts'
import { exportJSON, importJSON } from '../src/storage/persistence.ts'
import type { AppData } from '../src/domain/types.ts'

const T = '2026-11-10T10:00:00.000Z'

function fullCourse(): AppData {
  const base = createEmptyData()
  return {
    ...base,
    settings: { ...base.settings, userName: 'Álvaro', course: '2.º Bachillerato', onboarded: true, theme: 'dark', activeTerm: 'T2' },
    subjects: [
      {
        id: 'mat',
        name: 'Matemáticas II',
        shortName: 'MAT',
        color: 'indigo',
        teacher: 'Ana',
        room: 'A12',
        weight: 4,
        targetGrade: 8.5,
        schedule: [{ id: 's1', day: 1, start: '08:30', end: '09:25', room: 'A12' }],
        categories: [
          { id: 'c1', name: 'Exámenes', weight: 80 },
          { id: 'c2', name: 'Trabajos', weight: 20 },
        ],
        createdAt: T,
      },
    ],
    tasks: [
      {
        id: 't1',
        title: 'Ejercicios 4 y 5',
        description: 'Página 82',
        subjectId: 'mat',
        dueDate: '2026-11-12',
        dueTime: '17:00',
        priority: 'alta',
        status: 'completada',
        estimatedMinutes: 40,
        tags: ['deberes'],
        subtasks: [{ id: 'st1', title: 'Ej. 4', done: true }],
        createdAt: T,
        completedAt: '2026-11-11T18:00:00.000Z',
        order: 3,
      },
    ],
    grades: [
      { id: 'g1', subjectId: 'mat', categoryId: 'c1', term: 'T1', name: 'Tema 1', kind: 'examen', score: 16, maxScore: 20, weight: 40, date: '2026-10-20', comment: 'Bien', createdAt: T },
    ],
    exams: [
      { id: 'e1', subjectId: 'mat', title: 'Tema 1', date: '2026-10-20', time: '09:00', topics: 'Límites', weight: 40, term: 'T1', gradeEntryId: 'g1', createdAt: T },
    ],
    events: [
      { id: 'ev1', title: 'Excursión', date: '2026-11-20', startTime: '08:00', endTime: '14:00', subjectId: 'mat', kind: 'otro', notes: 'Llevar comida', createdAt: T },
    ],
    goals: [{ id: 'go1', title: 'Media de 8', kind: 'media', scope: 'trimestral', target: 8, subjectId: 'mat', term: 'T1', createdAt: T }],
    activity: [{ id: 'a1', kind: 'vuelo_aterrizado', at: T, text: 'Vuelo Madrid → Barcelona', subjectId: 'mat' }],
    sessions: [
      {
        id: 'v1', kind: 'vuelo', from: 'MAD', to: 'BCN', distanceKm: 483, plannedMinutes: 48, seat: '03C',
        subjectId: 'mat', taskId: 't1', status: 'aterrizado', startedAt: T, pausedMs: 600_000,
        endedAt: '2026-11-10T11:00:00.000Z', focusedMinutes: 48, layoverMinutes: 10, layoverEvery: 25,
        layoversDone: 1, layoverAt: '2026-11-10T10:25:00.000Z', createdAt: T,
      },
      {
        id: 'v2', kind: 'vuelo', from: 'BCN', to: 'GVA', distanceKm: 620, plannedMinutes: 62, seat: '07A',
        status: 'en_vuelo', startedAt: '2026-11-16T10:00:00.000Z', pausedMs: 0,
        pausedAt: '2026-11-16T10:50:00.000Z', layoverMinutes: 10, layoverEvery: 50, layoversDone: 1,
        layoverAt: '2026-11-16T10:50:00.000Z', layoverEndsAt: '2026-11-16T11:00:00.000Z',
        createdAt: '2026-11-16T10:00:00.000Z',
      },
    ],
  }
}

/**
 * Igualdad de contenido: el validador rellena valores por defecto que no
 * cambian nada (`demo: false`, `archived: false`, claves sin valor). JSON ya
 * descarta las claves `undefined`; aquí se quitan además esos `false`.
 */
function content(data: AppData): unknown {
  return JSON.parse(
    JSON.stringify(data, (key, value) => ((key === 'demo' || key === 'archived') && value === false ? undefined : value)),
  )
}

describe('exportar e importar', () => {
  it('devuelve el mismo curso, campo a campo', () => {
    const original = fullCourse()
    const result = importJSON(exportJSON(original))
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.dropped, 0)
    assert.deepEqual(content(result.data), content(original))
  })

  it('sobrevive a una segunda vuelta (exportar lo importado)', () => {
    const once = importJSON(exportJSON(fullCourse()))
    assert.ok(once.ok)
    const twice = importJSON(exportJSON(once.data))
    assert.ok(twice.ok)
    assert.deepEqual(twice.data, once.data)
  })

  it('una copia con el BOM de Windows o espacios alrededor también se lee', () => {
    const result = importJSON(`﻿  ${exportJSON(fullCourse())}\n`)
    assert.equal(result.ok, true)
  })
})
