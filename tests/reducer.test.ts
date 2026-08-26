/**
 * Pruebas del reductor.
 *
 * Aquí interesan sobre todo los efectos en cadena: borrar algo tiene que
 * dejar el resto de los datos coherentes. Son los cambios que más pueden
 * estropear meses de trabajo del alumno de golpe.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createEmptyData } from '../src/data/defaults.ts'
import { reducer } from '../src/state/reducer.ts'
import type { AppData } from '../src/domain/types.ts'

function baseState(): AppData {
  const data = createEmptyData()
  data.subjects = [
    {
      id: 'mat',
      name: 'Matemáticas I',
      color: 'indigo',
      weight: 4,
      schedule: [],
      categories: [{ id: 'c1', name: 'Exámenes', weight: 100 }],
      createdAt: '2026-09-01T00:00:00.000Z',
    },
    {
      id: 'fis',
      name: 'Física y Química',
      color: 'teal',
      weight: 4,
      schedule: [],
      categories: [],
      createdAt: '2026-09-01T00:00:00.000Z',
    },
  ]
  data.grades = [
    {
      id: 'g1',
      subjectId: 'mat',
      categoryId: 'c1',
      term: 'T1',
      name: 'Examen 1',
      kind: 'examen',
      score: 8,
      maxScore: 10,
      weight: 100,
      date: '2026-10-01',
      createdAt: '2026-10-01T00:00:00.000Z',
    },
    {
      id: 'g2',
      subjectId: 'fis',
      categoryId: null,
      term: 'T1',
      name: 'Examen A',
      kind: 'examen',
      score: 7,
      maxScore: 10,
      weight: 100,
      date: '2026-10-02',
      createdAt: '2026-10-02T00:00:00.000Z',
    },
  ]
  data.exams = [
    {
      id: 'e1',
      subjectId: 'mat',
      title: 'Derivadas',
      date: '2026-11-01',
      term: 'T1',
      createdAt: '2026-10-01T00:00:00.000Z',
    },
  ]
  data.tasks = [
    {
      id: 't1',
      title: 'Ejercicios',
      subjectId: 'mat',
      priority: 'media',
      status: 'pendiente',
      tags: [],
      subtasks: [],
      createdAt: '2026-10-01T00:00:00.000Z',
    },
  ]
  data.goals = [
    {
      id: 'goal-mat',
      title: 'Subir Matemáticas a 9',
      kind: 'media',
      scope: 'trimestral',
      target: 9,
      subjectId: 'mat',
      createdAt: '2026-09-15T00:00:00.000Z',
    },
    {
      id: 'goal-global',
      title: 'Media de 8',
      kind: 'media',
      scope: 'anual',
      target: 8,
      createdAt: '2026-09-15T00:00:00.000Z',
    },
  ]
  return data
}

describe('borrar una asignatura', () => {
  const next = reducer(baseState(), { type: 'subject/remove', id: 'mat' })

  it('se lleva sus notas y sus exámenes', () => {
    assert.deepEqual(
      next.grades.map((g) => g.id),
      ['g2'],
    )
    assert.equal(next.exams.length, 0)
  })

  it('conserva las tareas pero las deja sin asignatura', () => {
    // Una tarea es trabajo real que el alumno puede reasignar; una nota sin
    // asignatura no significa nada.
    assert.equal(next.tasks.length, 1)
    assert.equal(next.tasks[0].subjectId, undefined)
  })

  it('archiva los objetivos de esa asignatura', () => {
    // Sin la asignatura no se pueden volver a medir, pero borrarlos perdería
    // lo que el alumno escribió.
    const goal = next.goals.find((g) => g.id === 'goal-mat')
    assert.ok(goal)
    assert.equal(goal.archived, true)
    assert.equal(goal.subjectId, undefined)
  })

  it('no toca los objetivos globales', () => {
    const goal = next.goals.find((g) => g.id === 'goal-global')
    assert.ok(goal)
    assert.notEqual(goal.archived, true)
  })

  it('no deja ningún objetivo apuntando a la asignatura borrada', () => {
    assert.equal(
      next.goals.some((g) => g.subjectId === 'mat'),
      false,
    )
  })
})

describe('completar tareas', () => {
  it('sella la fecha al completar', () => {
    const next = reducer(baseState(), { type: 'task/toggle', id: 't1' })
    assert.equal(next.tasks[0].status, 'completada')
    assert.ok(next.tasks[0].completedAt)
  })

  it('borra la fecha al desmarcar', () => {
    const done = reducer(baseState(), { type: 'task/toggle', id: 't1' })
    const undone = reducer(done, { type: 'task/toggle', id: 't1' })
    assert.equal(undone.tasks[0].status, 'pendiente')
    assert.equal(undone.tasks[0].completedAt, undefined)
  })

  it('deriva la fecha también al cambiar el estado desde el editor', () => {
    // `completedAt` es consecuencia del estado, no un campo que rellene la
    // interfaz: no pueden desincronizarse.
    const next = reducer(baseState(), {
      type: 'task/update',
      id: 't1',
      patch: { status: 'completada' },
    })
    assert.ok(next.tasks[0].completedAt)
  })

  it('deja registro en la actividad', () => {
    const next = reducer(baseState(), { type: 'task/toggle', id: 't1' })
    assert.equal(next.activity.length, 1)
    assert.match(next.activity[0].text, /Ejercicios/)
  })
})

describe('notas y exámenes', () => {
  it('enlaza el examen con la nota que se le añade', () => {
    const next = reducer(baseState(), {
      type: 'grade/add',
      grade: {
        subjectId: 'mat',
        categoryId: 'c1',
        term: 'T1',
        name: 'Derivadas',
        kind: 'examen',
        score: 9,
        maxScore: 10,
        weight: 50,
        date: '2026-11-01',
      },
      linkExamId: 'e1',
    })

    const exam = next.exams.find((e) => e.id === 'e1')
    const added = next.grades.find((g) => g.name === 'Derivadas')
    assert.ok(exam && added)
    assert.equal(exam.gradeEntryId, added.id)
  })

  it('al borrar la nota el examen vuelve a estar pendiente', () => {
    const withGrade = reducer(baseState(), {
      type: 'grade/add',
      grade: {
        subjectId: 'mat',
        categoryId: 'c1',
        term: 'T1',
        name: 'Derivadas',
        kind: 'examen',
        score: 9,
        maxScore: 10,
        weight: 50,
        date: '2026-11-01',
      },
      linkExamId: 'e1',
    })
    const added = withGrade.grades.find((g) => g.name === 'Derivadas')!
    const next = reducer(withGrade, { type: 'grade/remove', id: added.id })
    assert.equal(next.exams.find((e) => e.id === 'e1')?.gradeEntryId, undefined)
  })
})

describe('datos de ejemplo', () => {
  it('se van sin arrastrar nada real', () => {
    const state = baseState()
    state.subjects.push({
      id: 'demo1',
      name: 'Asignatura de ejemplo',
      color: 'plum',
      weight: 3,
      schedule: [],
      categories: [],
      createdAt: '2026-09-01T00:00:00.000Z',
      demo: true,
    })
    state.tasks.push({
      id: 'demo-task',
      title: 'Tarea de ejemplo',
      subjectId: 'demo1',
      priority: 'baja',
      status: 'pendiente',
      tags: [],
      subtasks: [],
      createdAt: '2026-09-01T00:00:00.000Z',
      demo: true,
    })

    const next = reducer(state, { type: 'data/removeDemo' })
    assert.equal(
      next.subjects.some((s) => s.demo),
      false,
    )
    assert.equal(
      next.tasks.some((t) => t.id === 'demo-task'),
      false,
    )
    // Lo real sigue intacto.
    assert.equal(next.tasks.some((t) => t.id === 't1'), true)
    assert.equal(next.grades.length, 2)
  })
})

describe('el reductor no muta el estado que recibe', () => {
  it('deja el original sin tocar', () => {
    const state = baseState()
    const snapshot = JSON.stringify(state)
    reducer(state, { type: 'subject/remove', id: 'mat' })
    reducer(state, { type: 'task/toggle', id: 't1' })
    assert.equal(JSON.stringify(state), snapshot)
  })
})
