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

describe('el reductor no muta el estado que recibe', () => {
  it('deja el original sin tocar', () => {
    const state = baseState()
    const snapshot = JSON.stringify(state)
    reducer(state, { type: 'subject/remove', id: 'mat' })
    reducer(state, { type: 'task/toggle', id: 't1' })
    assert.equal(JSON.stringify(state), snapshot)
  })
})

describe('editar una asignatura', () => {
  it('rellena la abreviatura cuando el campo se deja en blanco', () => {
    // El editor manda '' al vaciar el campo. Antes solo el alta derivaba la
    // abreviatura, así que la insignia de la ficha se quedaba vacía.
    const next = reducer(baseState(), {
      type: 'subject/update',
      id: 'mat',
      patch: { shortName: '' },
    })
    assert.equal(next.subjects.find((s) => s.id === 'mat')?.shortName, 'MI')
  })

  it('respeta la abreviatura que se escribe a mano', () => {
    const next = reducer(baseState(), {
      type: 'subject/update',
      id: 'mat',
      patch: { shortName: 'MAT1' },
    })
    assert.equal(next.subjects.find((s) => s.id === 'mat')?.shortName, 'MAT1')
  })

  it('suelta las notas cuya categoría desaparece en la edición', () => {
    // Quitar una categoría dejaba sus notas apuntando a un id inexistente.
    // «Sin categoría» es un estado que el cálculo sabe tratar; un id
    // fantasma, no.
    const next = reducer(baseState(), {
      type: 'subject/update',
      id: 'mat',
      patch: { categories: [{ id: 'c2', name: 'Trabajos', weight: 100 }] },
    })
    assert.equal(next.grades.find((g) => g.id === 'g1')?.categoryId, null)
  })

  it('no toca las notas de otras asignaturas', () => {
    const next = reducer(baseState(), {
      type: 'subject/update',
      id: 'mat',
      patch: { categories: [] },
    })
    assert.equal(next.grades.find((g) => g.id === 'g2')?.categoryId, null)
    assert.equal(next.grades.find((g) => g.id === 'g2')?.subjectId, 'fis')
  })

  it('conserva la categoría si sigue existiendo', () => {
    const next = reducer(baseState(), {
      type: 'subject/update',
      id: 'mat',
      patch: { name: 'Matemáticas II' },
    })
    assert.equal(next.grades.find((g) => g.id === 'g1')?.categoryId, 'c1')
  })
})

describe('session/add', () => {
  it('recorta a 24 horas', () => {
    const next = reducer(baseState(), {
      type: 'session/add',
      session: {
        startedAt: '2026-10-01T08:00:00.000Z',
        minutes: 10_000,
        mode: 'libre',
      },
    })
    assert.equal(next.sessions.at(-1)?.minutes, 24 * 60)
  })

  it('ignora una sesión de cero minutos', () => {
    const next = reducer(baseState(), {
      type: 'session/add',
      session: {
        startedAt: '2026-10-01T08:00:00.000Z',
        minutes: 0,
        mode: 'libre',
      },
    })
    assert.equal(next.sessions.length, baseState().sessions.length)
  })
})

describe('el enlace examen-nota es de la misma asignatura', () => {
  it('no enlaza un examen de otra asignatura', () => {
    const next = reducer(baseState(), {
      type: 'grade/add',
      grade: {
        subjectId: 'fis',
        categoryId: null,
        term: 'T1',
        name: 'Examen',
        kind: 'examen',
        score: 8,
        maxScore: 10,
        weight: 100,
        date: '2026-10-01',
      },
      linkExamId: 'e1',
    })
    assert.equal(next.exams.find((e) => e.id === 'e1')?.gradeEntryId, undefined)
  })
})
