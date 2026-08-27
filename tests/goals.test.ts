/**
 * Pruebas del progreso de objetivos.
 *
 * Lo que se comprueba sobre todo es que el progreso salga de los datos reales
 * y respete el periodo: un objetivo semanal no puede contar lo del mes pasado.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_SCALE } from '../src/domain/grades.ts'
import { goalProgress, type GoalContext } from '../src/domain/goals.ts'
import type { Goal, StudySession, Task } from '../src/domain/types.ts'

// Miércoles, para que la semana (lunes a domingo) tenga días antes y después.
const TODAY = '2026-10-14'

function makeGoal(overrides: Partial<Goal>): Goal {
  return {
    id: 'g1',
    title: 'Objetivo',
    kind: 'horas_estudio',
    scope: 'semanal',
    target: 8,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

function session(day: string, minutes: number, subjectId?: string): StudySession {
  return {
    id: `s-${day}-${minutes}`,
    startedAt: `${day}T17:00:00.000Z`,
    minutes,
    mode: 'libre',
    subjectId,
  }
}

function task(completedDay: string | null, subjectId?: string): Task {
  return {
    id: `t-${completedDay}-${subjectId ?? ''}`,
    title: 'Tarea',
    priority: 'media',
    status: completedDay ? 'completada' : 'pendiente',
    completedAt: completedDay ? `${completedDay}T18:00:00.000Z` : undefined,
    tags: [],
    subtasks: [],
    subjectId,
    createdAt: '2026-10-01T00:00:00.000Z',
  }
}

function makeContext(overrides: Partial<GoalContext> = {}): GoalContext {
  return {
    tasks: [],
    sessions: [],
    subjects: [],
    results: new Map(),
    globalAverage: null,
    courseResults: new Map(),
    courseAverage: null,
    scale: DEFAULT_SCALE,
    today: TODAY,
    weekStartsOn: 1,
    ...overrides,
  }
}

describe('objetivos de horas de estudio', () => {
  it('cuenta solo lo de esta semana', () => {
    const ctx = makeContext({
      sessions: [
        session('2026-10-12', 120), // lunes, dentro
        session('2026-10-14', 180), // hoy, dentro
        session('2026-10-11', 300), // domingo anterior, fuera
      ],
    })
    const progress = goalProgress(makeGoal({ target: 8 }), ctx)
    // 5 h de 8 h
    assert.equal(progress.current, 5)
    assert.equal(Math.round(progress.percent), 63)
    assert.equal(progress.label, '5 h de 8 h')
    assert.equal(progress.done, false)
  })

  it('un objetivo diario solo mira hoy', () => {
    const ctx = makeContext({
      sessions: [session('2026-10-14', 90), session('2026-10-13', 240)],
    })
    const progress = goalProgress(makeGoal({ scope: 'diario', target: 2 }), ctx)
    assert.equal(progress.current, 1.5)
    assert.equal(progress.done, false)
  })

  it('marca conseguido al llegar', () => {
    const ctx = makeContext({ sessions: [session('2026-10-13', 480)] })
    const progress = goalProgress(makeGoal({ target: 8 }), ctx)
    assert.equal(progress.done, true)
    assert.equal(progress.percent, 100)
  })

  it('pasarse del objetivo no supera el 100 %', () => {
    const ctx = makeContext({ sessions: [session('2026-10-13', 900)] })
    assert.equal(goalProgress(makeGoal({ target: 8 }), ctx).percent, 100)
  })

  it('filtra por asignatura cuando la lleva', () => {
    const ctx = makeContext({
      sessions: [session('2026-10-13', 120, 'mat'), session('2026-10-13', 300, 'fis')],
    })
    const progress = goalProgress(makeGoal({ target: 4, subjectId: 'mat' }), ctx)
    assert.equal(progress.current, 2)
  })

  it('el objetivo de curso cuenta todo lo acumulado', () => {
    const ctx = makeContext({
      sessions: [session('2026-09-05', 600), session('2026-10-13', 600)],
    })
    const progress = goalProgress(makeGoal({ scope: 'anual', target: 20 }), ctx)
    assert.equal(progress.current, 20)
    assert.equal(progress.done, true)
  })
})

describe('objetivos de tareas', () => {
  it('cuenta las completadas dentro del periodo', () => {
    const ctx = makeContext({
      tasks: [
        task('2026-10-13'),
        task('2026-10-14'),
        task('2026-10-05'), // semana anterior
        task(null), // sin completar
      ],
    })
    const progress = goalProgress(makeGoal({ kind: 'tareas', target: 5 }), ctx)
    assert.equal(progress.current, 2)
    assert.equal(progress.label, '2 de 5')
  })
})

describe('objetivos de media', () => {
  it('usa la media global cuando no hay asignatura', () => {
    const ctx = makeContext({ globalAverage: 8.4 })
    const progress = goalProgress(makeGoal({ kind: 'media', scope: 'trimestral', target: 9 }), ctx)
    assert.equal(progress.current, 8.4)
    assert.equal(progress.done, false)
    assert.match(progress.label, /8,40 de 9,00/)
  })

  it('usa la media de la asignatura cuando la lleva', () => {
    const ctx = makeContext({
      globalAverage: 5,
      results: new Map([
        [
          'mat',
          {
            subjectId: 'mat',
            average: 9.2,
            evaluatedPercent: 60,
            categories: [],
            entryCount: 3,
            warnings: [],
            weightsDeclared: true,
          },
        ],
      ]),
    })
    const progress = goalProgress(
      makeGoal({ kind: 'media', scope: 'trimestral', target: 9, subjectId: 'mat' }),
      ctx,
    )
    assert.equal(progress.current, 9.2)
    assert.equal(progress.done, true)
  })

  it('sin notas lo dice, en vez de enseñar un 0 %', () => {
    const progress = goalProgress(
      makeGoal({ kind: 'media', scope: 'trimestral', target: 9 }),
      makeContext(),
    )
    assert.equal(progress.measurable, false)
    assert.equal(progress.label, 'Sin notas todavía')
  })

  it('el titular es la distancia que falta, no un porcentaje', () => {
    // Un 8,09 hacia un 9 daría «90 %», que da a entender que se parte de cero
    // cuando en realidad el punto de partida es el aprobado. Se dice lo que
    // falta, que es la pregunta de verdad.
    const ctx = makeContext({ globalAverage: 8.09 })
    const progress = goalProgress(makeGoal({ kind: 'media', scope: 'trimestral', target: 9 }), ctx)
    assert.equal(progress.headline, 'faltan 0,91')
    assert.doesNotMatch(progress.headline, /%/)
  })

  it('al alcanzarlo el titular lo celebra', () => {
    const ctx = makeContext({ globalAverage: 9.4 })
    const progress = goalProgress(makeGoal({ kind: 'media', scope: 'trimestral', target: 9 }), ctx)
    assert.equal(progress.headline, 'Conseguido')
  })
})

describe('titulares del resto de tipos', () => {
  it('las horas sí se miden en porcentaje', () => {
    const ctx = makeContext({ sessions: [session('2026-10-13', 240)] })
    assert.equal(goalProgress(makeGoal({ target: 8 }), ctx).headline, '50 %')
  })

  it('las tareas también', () => {
    const ctx = makeContext({ tasks: [task('2026-10-13'), task('2026-10-14')] })
    assert.equal(goalProgress(makeGoal({ kind: 'tareas', target: 4 }), ctx).headline, '50 %')
  })
})

describe('objetivos manuales', () => {
  it('usa el progreso que introduce el alumno', () => {
    const goal = makeGoal({ kind: 'manual', target: 30, manualProgress: 12 })
    const progress = goalProgress(goal, makeContext())
    assert.equal(progress.current, 12)
    assert.equal(progress.percent, 40)
  })

  it('sin progreso empieza en cero', () => {
    const goal = makeGoal({ kind: 'manual', target: 30 })
    assert.equal(goalProgress(goal, makeContext()).current, 0)
  })
})

describe('casos límite', () => {
  it('una meta de cero no revienta el cálculo', () => {
    const goal = makeGoal({ kind: 'manual', target: 0, manualProgress: 5 })
    const progress = goalProgress(goal, makeContext())
    assert.ok(Number.isFinite(progress.percent))
    assert.equal(progress.percent, 100)
  })
})

describe('objetivo de media que fija su evaluación', () => {
  const resultFor = (average: number) =>
    new Map([
      [
        'mat',
        {
          subjectId: 'mat',
          average,
          evaluatedPercent: 100,
          categories: [],
          entryCount: 1,
          warnings: [],
          weightsDeclared: true,
        },
      ],
    ])

  const ctx = makeContext({
    // La activa es la segunda, y va peor que la primera.
    results: resultFor(4),
    globalAverage: 4,
    termResults: (term) =>
      term === 'T1'
        ? { results: resultFor(9), average: 9 }
        : { results: resultFor(4), average: 4 },
  })

  it('mide la suya, no la que esté activa en Ajustes', () => {
    // Sin esto, cambiar de evaluación reescribía en silencio lo que medían
    // TODOS los objetivos trimestrales ya creados.
    const goal = makeGoal({ kind: 'media', scope: 'trimestral', target: 8, term: 'T1' })
    assert.equal(goalProgress(goal, ctx).current, 9)
    assert.equal(goalProgress(goal, ctx).done, true)
  })

  it('sin evaluación fijada sigue a la activa', () => {
    const goal = makeGoal({ kind: 'media', scope: 'trimestral', target: 8 })
    assert.equal(goalProgress(goal, ctx).current, 4)
  })

  it('también con una asignatura concreta', () => {
    const goal = makeGoal({
      kind: 'media',
      scope: 'trimestral',
      target: 8,
      term: 'T1',
      subjectId: 'mat',
    })
    assert.equal(goalProgress(goal, ctx).current, 9)
  })

  it('un objetivo de curso ignora la evaluación fijada', () => {
    const anual = makeGoal({ kind: 'media', scope: 'anual', target: 8, term: 'T1' })
    const withCourse = makeContext({ ...ctx, courseAverage: 6.5 })
    assert.equal(goalProgress(anual, withCourse).current, 6.5)
  })
})
