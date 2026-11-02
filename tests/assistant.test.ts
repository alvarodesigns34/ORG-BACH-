/**
 * Pruebas del asistente: lo que la IA propone y la app ejecuta.
 *
 * El modelo no se prueba aquí (es externo); se prueba lo que de verdad
 * importa: que cada acción propuesta se valide y se aplique igual que si la
 * hubieras hecho a mano, y que lo dudoso se descarte en vez de inventarse.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createEmptyData } from '../src/data/defaults.ts'
import type { AppData } from '../src/domain/types.ts'
import {
  applyAssistantActions,
  applyUndo,
  buildContext,
  planUndo,
  resolveSubject,
} from '../src/assistant/actions.ts'

const TODAY = '2026-11-02'

function course(): AppData {
  const data = createEmptyData()
  data.settings = { ...data.settings, onboarded: true, activeTerm: 'T1' }
  data.subjects = [
    {
      id: 'bio',
      name: 'Biología, Geología y CC. Ambientales',
      shortName: 'BGC',
      color: 'sage',
      weight: 4,
      schedule: [],
      categories: [],
      createdAt: '2026-09-01T00:00:00.000Z',
    },
    {
      id: 'mat',
      name: 'Matemáticas I',
      shortName: 'MI',
      color: 'indigo',
      weight: 4,
      schedule: [],
      categories: [],
      createdAt: '2026-09-01T00:00:00.000Z',
    },
  ]
  data.exams = [
    {
      id: 'ex_bio',
      subjectId: 'bio',
      title: 'Examen tema 3',
      date: '2026-10-30',
      term: 'T1',
      createdAt: '2026-10-01T00:00:00.000Z',
    },
  ]
  return data
}

describe('resolver la asignatura', () => {
  it('encuentra «biología» aunque el nombre completo sea más largo', () => {
    assert.equal(resolveSubject(course().subjects, undefined, 'biología')?.id, 'bio')
  })
  it('acepta la abreviatura y el id', () => {
    assert.equal(resolveSubject(course().subjects, undefined, 'MI')?.id, 'mat')
    assert.equal(resolveSubject(course().subjects, 'mat')?.id, 'mat')
  })
  it('no se inventa una asignatura que no existe', () => {
    assert.equal(resolveSubject(course().subjects, undefined, 'Latín'), undefined)
  })
})

describe('aplicar acciones', () => {
  it('«añade esta tarea para hoy»', () => {
    const { data, applied } = applyAssistantActions(
      course(),
      [
        {
          type: 'add_task',
          title: 'Hacer ejercicios 4 y 5',
          subject_name: 'mates',
          date: TODAY,
        },
      ],
      TODAY,
    )
    // «mates» no coincide con «Matemáticas I»: la tarea no se guarda con una
    // asignatura equivocada, se descarta con motivo.
    assert.equal(applied.length, 0)
    assert.equal(data.tasks.length, 0)

    const ok = applyAssistantActions(
      course(),
      [
        {
          type: 'add_task',
          title: 'Hacer ejercicios 4 y 5',
          subject_id: 'mat',
          date: TODAY,
          time: '18:00',
        },
      ],
      TODAY,
    )
    assert.equal(ok.data.tasks.length, 1)
    assert.equal(ok.data.tasks[0].subjectId, 'mat')
    assert.equal(ok.data.tasks[0].dueDate, TODAY)
    assert.equal(ok.data.tasks[0].dueTime, '18:00')
    assert.match(ok.applied[0].text, /hoy/)
  })

  it('«he sacado un 8 en el examen de biología que vale un 40 % de la 1.ª evaluación»', () => {
    const { data, applied } = applyAssistantActions(
      course(),
      [
        {
          type: 'add_grade',
          subject_name: 'biología',
          score: 8,
          weight: 40,
          term: 'T1',
          grade_kind: 'examen',
          exam_id: 'ex_bio',
        },
      ],
      TODAY,
    )
    assert.equal(applied.length, 1)
    const grade = data.grades[0]
    assert.equal(grade.subjectId, 'bio')
    assert.equal(grade.score, 8)
    assert.equal(grade.maxScore, 10)
    assert.equal(grade.weight, 40)
    assert.equal(grade.term, 'T1')
    // Queda enlazada con el examen, que deja de estar «pendiente de nota».
    assert.equal(data.exams[0].gradeEntryId, grade.id)
    assert.equal(grade.name, 'Examen tema 3')
  })

  it('una nota por encima del máximo se rechaza', () => {
    const { data, skipped } = applyAssistantActions(
      course(),
      [{ type: 'add_grade', subject_id: 'mat', score: 12 }],
      TODAY,
    )
    assert.equal(data.grades.length, 0)
    assert.equal(skipped.length, 1)
  })

  it('un examen sin fecha válida no se guarda', () => {
    const { data, skipped } = applyAssistantActions(
      course(),
      [{ type: 'add_exam', subject_id: 'mat', date: 'el jueves' }],
      TODAY,
    )
    assert.equal(data.exams.length, 1)
    assert.equal(skipped.length, 1)
  })

  it('crear una asignatura y usarla en la misma petición', () => {
    const { data, applied } = applyAssistantActions(
      course(),
      [
        { type: 'add_subject', subject_name: 'Latín I' },
        {
          type: 'add_exam',
          subject_name: 'Latín I',
          date: '2026-11-10',
          title: 'Declinaciones',
        },
      ],
      TODAY,
    )
    assert.equal(applied.length, 2)
    const latin = data.subjects.find((s) => s.name === 'Latín I')!
    assert.ok(latin)
    assert.equal(data.exams.find((e) => e.title === 'Declinaciones')?.subjectId, latin.id)
  })

  it('no duplica una asignatura que ya existe', () => {
    const { data } = applyAssistantActions(
      course(),
      [{ type: 'add_subject', subject_name: 'Matemáticas I' }],
      TODAY,
    )
    assert.equal(data.subjects.length, 2)
  })

  it('completa una tarea por su título', () => {
    const base = applyAssistantActions(
      course(),
      [{ type: 'add_task', title: 'Comentario de texto' }],
      TODAY,
    ).data
    const { data, applied } = applyAssistantActions(
      base,
      [{ type: 'complete_task', title: 'comentario' }],
      TODAY,
    )
    assert.equal(applied[0].kind, 'completada')
    assert.equal(data.tasks[0].status, 'completada')
  })
})

describe('deshacer lo que hizo la IA', () => {
  it('quita lo creado y reabre lo completado, sin tocar lo demás', () => {
    const start = applyAssistantActions(
      course(),
      [{ type: 'add_task', title: 'Ya existía' }],
      TODAY,
    ).data
    const { data: after } = applyAssistantActions(
      start,
      [
        { type: 'add_task', title: 'Nueva' },
        { type: 'add_grade', subject_id: 'bio', score: 7, exam_id: 'ex_bio' },
        { type: 'complete_task', title: 'Ya existía' },
        { type: 'add_subject', subject_name: 'Economía' },
      ],
      TODAY,
    )
    const reverted = applyUndo(after, planUndo(start, after))
    assert.deepEqual(
      reverted.tasks.map((t) => [t.title, t.status]),
      [['Ya existía', 'pendiente']],
    )
    assert.equal(reverted.grades.length, 0)
    assert.equal(reverted.exams[0].gradeEntryId, undefined)
    assert.equal(reverted.subjects.length, 2)
  })
})

describe('editar, borrar y seguir la conversación', () => {
  const withTask = () =>
    applyAssistantActions(
      course(),
      [
        {
          type: 'add_task',
          title: 'Resumen tema 2',
          subject_id: 'bio',
          date: TODAY,
        },
      ],
      TODAY,
    )

  it('el memo lleva el id, para que «muévelo al viernes» sepa de qué hablas', () => {
    const { data, applied } = withTask()
    assert.ok(applied[0].memo.includes(data.tasks[0].id))
  })

  it('«muévelo al viernes»: cambia la fecha sin tocar el título', () => {
    const base = withTask().data
    const id = base.tasks[0].id
    const { data, applied } = applyAssistantActions(
      base,
      [
        {
          type: 'update_task',
          task_id: id,
          date: '2026-11-06',
          priority: 'alta',
        },
      ],
      TODAY,
    )
    assert.equal(applied[0].kind, 'editada')
    assert.equal(data.tasks[0].dueDate, '2026-11-06')
    assert.equal(data.tasks[0].priority, 'alta')
    assert.equal(data.tasks[0].title, 'Resumen tema 2')
  })

  it('quitar la fecha con date: null', () => {
    const base = withTask().data
    const { data } = applyAssistantActions(
      base,
      [{ type: 'update_task', task_id: base.tasks[0].id, date: null }],
      TODAY,
    )
    assert.equal(data.tasks[0].dueDate, undefined)
  })

  it('una edición sin cambios no se aplica', () => {
    const base = withTask().data
    const { applied, skipped } = applyAssistantActions(
      base,
      [{ type: 'update_task', task_id: base.tasks[0].id }],
      TODAY,
    )
    assert.equal(applied.length, 0)
    assert.equal(skipped.length, 1)
  })

  it('subtareas, mover un examen y corregir una nota', () => {
    const base = withTask().data
    const step = applyAssistantActions(
      base,
      [
        {
          type: 'add_subtasks',
          task_id: base.tasks[0].id,
          items: ['Leer', 'Esquema', ' '],
        },
        {
          type: 'update_exam',
          exam_id: 'ex_bio',
          date: '2026-11-12',
          time: '09:30',
        },
        {
          type: 'add_grade',
          subject_id: 'bio',
          score: 6,
          weight: 40,
          exam_id: 'ex_bio',
        },
      ],
      TODAY,
    )
    assert.equal(step.applied.length, 3)
    assert.deepEqual(
      step.data.tasks[0].subtasks.map((s) => s.title),
      ['Leer', 'Esquema'],
    )
    assert.equal(step.data.exams[0].date, '2026-11-12')
    const gradeId = step.data.grades[0].id
    const fixed = applyAssistantActions(
      step.data,
      [{ type: 'update_grade', grade_id: gradeId, score: 7 }],
      TODAY,
    )
    assert.equal(fixed.data.grades[0].score, 7)
    assert.equal(fixed.data.grades[0].weight, 40)
  })

  it('reabrir y fijar objetivo', () => {
    const base = withTask().data
    const id = base.tasks[0].id
    const done = applyAssistantActions(base, [{ type: 'complete_task', task_id: id }], TODAY).data
    assert.equal(done.tasks[0].status, 'completada')
    const { data } = applyAssistantActions(
      done,
      [
        { type: 'reopen_task', task_id: id },
        { type: 'set_target', subject_name: 'mates', target: 8 },
        { type: 'set_target', subject_id: 'mat', target: 8 },
      ],
      TODAY,
    )
    assert.equal(data.tasks[0].status, 'pendiente')
    assert.equal(data.subjects.find((s) => s.id === 'mat')?.targetGrade, 8)
  })
})

describe('deshacer ediciones y borrados', () => {
  it('devuelve lo borrado y lo editado, incluido el enlace nota–examen', () => {
    const start = applyAssistantActions(
      course(),
      [
        { type: 'add_task', title: 'Comentario', date: TODAY },
        { type: 'add_grade', subject_id: 'bio', score: 8, exam_id: 'ex_bio' },
      ],
      TODAY,
    ).data
    const taskId = start.tasks[0].id
    const gradeId = start.grades[0].id
    const { data: after } = applyAssistantActions(
      start,
      [
        { type: 'update_task', task_id: taskId, date: '2026-11-09' },
        { type: 'delete_grade', grade_id: gradeId },
        { type: 'delete_exam', exam_id: 'ex_bio' },
      ],
      TODAY,
    )
    assert.equal(after.grades.length, 0)
    assert.equal(after.exams.length, 0)

    // El plan viaja por JSON (se guarda con la conversación).
    const plan = JSON.parse(JSON.stringify(planUndo(start, after)))
    const reverted = applyUndo(after, plan)
    assert.equal(reverted.tasks[0].dueDate, TODAY)
    assert.equal(reverted.grades[0].id, gradeId)
    assert.equal(reverted.exams[0].gradeEntryId, gradeId)
  })

  it('no pisa lo que cambiaste a mano después', () => {
    const start = applyAssistantActions(course(), [{ type: 'add_task', title: 'X' }], TODAY).data
    const id = start.tasks[0].id
    const { data: after } = applyAssistantActions(
      start,
      [
        {
          type: 'update_task',
          task_id: id,
          date: '2026-11-09',
          priority: 'alta',
        },
      ],
      TODAY,
    )
    const plan = planUndo(start, after)
    const edited = {
      ...after,
      tasks: after.tasks.map((t) => ({ ...t, dueDate: '2026-11-20' })),
    }
    const reverted = applyUndo(edited, plan)
    assert.equal(reverted.tasks[0].dueDate, '2026-11-20')
    assert.equal(reverted.tasks[0].priority, 'media')
  })
})

describe('contexto que viaja al modelo', () => {
  it('lleva el calendario, las cuentas hechas y los ids', () => {
    const data = course()
    data.subjects[0].targetGrade = 7
    data.grades = [
      {
        id: 'g1',
        subjectId: 'bio',
        categoryId: null,
        term: 'T1',
        name: 'Parcial',
        kind: 'examen',
        score: 6,
        maxScore: 10,
        weight: 40,
        date: '2026-10-20',
        createdAt: '2026-10-20T00:00:00.000Z',
      },
    ]
    const ctx = buildContext(data, TODAY)
    assert.equal(ctx.weekday, 'lunes')
    // El jueves de esta semana, para que el modelo no tenga que calcularlo.
    assert.deepEqual(ctx.next_days[3], {
      date: '2026-11-05',
      weekday: 'jueves',
    })
    assert.deepEqual(ctx.past_days[0], {
      date: '2026-11-01',
      weekday: 'domingo',
    })
    const bio = ctx.subjects.find((s) => s.id === 'bio')!
    assert.deepEqual(bio.terms.T1, { avg: 6, evaluated_pct: 40 })
    // (7·100 − 6·40) / 60 = 7,67 en el 60 % restante.
    assert.equal(bio.needed_for_target?.needed, 7.67)
    assert.equal(bio.needed_for_target?.status, 'alcanzable')
    assert.equal(ctx.recent_grades[0].id, 'g1')
    assert.equal(ctx.exams[0].id, 'ex_bio')
  })
})
