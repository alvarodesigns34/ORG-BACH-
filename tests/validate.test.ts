/**
 * Pruebas de la validación de datos importados.
 *
 * Importar sustituye TODO lo que había. Si un archivo trae registros rotos y
 * se aceptan sin mirar, el fallo no aparece al importar sino semanas después,
 * cuando una media sale mal y ya no hay copia buena. De ahí que cada entidad
 * se revise campo a campo.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_SETTINGS } from '../src/data/defaults.ts'
import { importJSON, migrateWithReport } from '../src/storage/persistence.ts'
import {
  parseCollection,
  parseEvent,
  parseGrade,
  parseSession,
  parseSubject,
  parseTask,
  sanitizeSettings,
} from '../src/storage/validate.ts'

describe('parseSubject', () => {
  const valid = {
    id: 'mat',
    name: 'Matemáticas I',
    color: 'indigo',
    weight: 4,
    schedule: [],
    categories: [],
    createdAt: '2026-09-01T00:00:00.000Z',
  }

  it('acepta una asignatura correcta', () => {
    assert.equal(parseSubject(valid)?.name, 'Matemáticas I')
  })

  it('rechaza las que no tienen nombre', () => {
    assert.equal(parseSubject({ ...valid, name: '' }), null)
    assert.equal(parseSubject({ ...valid, name: '   ' }), null)
    assert.equal(parseSubject({ ...valid, name: 42 }), null)
  })

  it('rechaza las que no tienen identificador', () => {
    assert.equal(parseSubject({ ...valid, id: '' }), null)
  })

  it('sustituye un color inventado en vez de descartar la asignatura', () => {
    // Perder una asignatura entera por un color desconocido sería desmedido.
    assert.equal(parseSubject({ ...valid, color: 'fucsia' })?.color, 'slate')
  })

  it('descarta las franjas de horario rotas', () => {
    const parsed = parseSubject({
      ...valid,
      schedule: [
        { id: 's1', day: 1, start: '08:30', end: '09:25' },
        { id: 's2', day: 9, start: '08:30', end: '09:25' }, // día imposible
        { id: 's3', day: 2, start: '25:00', end: '09:25' }, // hora imposible
      ],
    })
    assert.equal(parsed?.schedule.length, 1)
  })

  it('deriva la abreviatura cuando falta, igual que al crearla a mano', () => {
    // Sin esto, una asignatura importada de una versión antigua se queda con
    // la insignia vacía en la ficha, porque solo el reducer la rellenaba.
    assert.equal(parseSubject(valid)?.shortName, 'MI')
  })

  it('respeta la abreviatura si ya viene puesta', () => {
    assert.equal(parseSubject({ ...valid, shortName: 'MA1' })?.shortName, 'MA1')
  })

  it('rechaza una nota objetivo negativa', () => {
    assert.equal(parseSubject({ ...valid, targetGrade: -2 })?.targetGrade, undefined)
  })
})

describe('parseGrade', () => {
  const valid = {
    id: 'g1',
    subjectId: 'mat',
    categoryId: null,
    term: 'T1',
    name: 'Examen',
    kind: 'examen',
    score: 8,
    maxScore: 10,
    weight: 50,
    date: '2026-10-01',
    createdAt: '2026-10-01T00:00:00.000Z',
  }

  it('acepta una nota correcta', () => {
    assert.equal(parseGrade(valid)?.score, 8)
  })

  it('rechaza una nota por encima de su propia escala', () => {
    // Un 17/10 es imposible. Se descarta en vez de recortarlo: recortar
    // inventaría una nota que nadie sacó.
    assert.equal(parseGrade({ ...valid, score: 17, maxScore: 10 }), null)
  })

  it('acepta la nota máxima exacta', () => {
    assert.equal(parseGrade({ ...valid, score: 10, maxScore: 10 })?.score, 10)
  })

  it('rechaza notas sin escala', () => {
    // Sin maxScore no se puede normalizar: entraría en la media como basura.
    assert.equal(parseGrade({ ...valid, maxScore: 0 }), null)
    assert.equal(parseGrade({ ...valid, maxScore: undefined }), null)
    assert.equal(parseGrade({ ...valid, score: 'ocho' }), null)
  })

  it('rechaza notas sin asignatura', () => {
    assert.equal(parseGrade({ ...valid, subjectId: undefined }), null)
  })

  it('corrige una evaluación desconocida', () => {
    assert.equal(parseGrade({ ...valid, term: 'T9' })?.term, 'T1')
  })

  it('rechaza fechas que no existen', () => {
    // El 31 de febrero pasa una comprobación de forma pero no es un día real.
    assert.notEqual(parseGrade({ ...valid, date: '2026-02-31' })?.date, '2026-02-31')
  })
})

describe('parseSession', () => {
  const valid = {
    id: 's1',
    startedAt: '2026-10-01T17:00:00.000Z',
    minutes: 45,
    mode: 'libre',
  }

  it('rechaza duraciones imposibles', () => {
    assert.equal(parseSession({ ...valid, minutes: 0 }), null)
    assert.equal(parseSession({ ...valid, minutes: -30 }), null)
  })

  it('recorta una duración absurda en vez de dispararlo todo', () => {
    // 500 horas de estudio en una sesión falsearían cada estadística.
    assert.equal(parseSession({ ...valid, minutes: 30_000 })?.minutes, 24 * 60)
  })

  it('rechaza marcas de tiempo ilegibles', () => {
    assert.equal(parseSession({ ...valid, startedAt: 'ayer' }), null)
  })
})

describe('parseEvent', () => {
  it('descarta una hora de fin anterior al inicio', () => {
    const parsed = parseEvent({
      id: 'e1',
      title: 'Reunión',
      date: '2026-10-01',
      startTime: '18:00',
      endTime: '09:00',
      kind: 'personal',
    })
    assert.equal(parsed?.startTime, '18:00')
    assert.equal(parsed?.endTime, undefined)
  })

  it('conserva un rango coherente', () => {
    const parsed = parseEvent({
      id: 'e1',
      title: 'Clase',
      date: '2026-10-01',
      startTime: '09:00',
      endTime: '10:30',
      kind: 'clase',
    })
    assert.equal(parsed?.endTime, '10:30')
  })
})

describe('parseTask', () => {
  it('descarta una hora sin fecha', () => {
    // Una hora límite sin día no significa nada.
    const parsed = parseTask({
      id: 't1',
      title: 'Tarea',
      dueTime: '18:00',
      tags: [],
      subtasks: [],
    })
    assert.equal(parsed?.dueTime, undefined)
  })

  it('limpia las etiquetas que no son texto', () => {
    const parsed = parseTask({
      id: 't1',
      title: 'Tarea',
      tags: ['repaso', 42, null, 'entrega'],
      subtasks: [],
    })
    assert.deepEqual(parsed?.tags, ['repaso', 'entrega'])
  })
})

describe('parseCollection', () => {
  it('cuenta lo que descarta', () => {
    const result = parseCollection(
      [
        { id: 's1', name: 'Buena', color: 'sky', weight: 3, schedule: [], categories: [] },
        { id: 's2', name: '' },
        null,
      ],
      parseSubject,
    )
    assert.equal(result.items.length, 1)
    assert.equal(result.dropped, 2)
  })

  it('descarta identificadores repetidos', () => {
    // Dos registros con el mismo id rompen las claves de React: editar uno
    // cambiaría el otro.
    const row = { id: 'dup', name: 'Una', color: 'sky', weight: 3, schedule: [], categories: [] }
    const result = parseCollection([row, { ...row }], parseSubject)
    assert.equal(result.items.length, 1)
    assert.equal(result.dropped, 1)
  })

  it('con algo que no es una lista devuelve vacío', () => {
    assert.deepEqual(parseCollection('no soy una lista', parseSubject), { items: [], dropped: 0 })
  })
})

describe('sanitizeSettings', () => {
  it('no deja el aprobado por encima del máximo', () => {
    const settings = sanitizeSettings({ gradeScale: { max: 10, pass: 50 } }, DEFAULT_SETTINGS)
    assert.ok(settings.gradeScale.pass <= settings.gradeScale.max)
  })

  it('recorta valores fuera de rango', () => {
    const settings = sanitizeSettings(
      { examAlertDays: 5000, pomodoroMinutes: 0 },
      DEFAULT_SETTINGS,
    )
    assert.ok(settings.examAlertDays <= 365)
    assert.ok(settings.pomodoroMinutes >= 1)
  })

  it('con ajustes ilegibles devuelve los de por defecto', () => {
    assert.deepEqual(sanitizeSettings('roto', DEFAULT_SETTINGS), {
      ...DEFAULT_SETTINGS,
      gradeScale: { ...DEFAULT_SETTINGS.gradeScale },
    })
  })
})

describe('importJSON', () => {
  it('rechaza lo que no es JSON', () => {
    const result = importJSON('{ esto no es json')
    assert.equal(result.ok, false)
  })

  it('rechaza un JSON que no es una copia de la aplicación', () => {
    const result = importJSON('{"cualquier":"cosa"}')
    assert.equal(result.ok, false)
  })

  it('acepta una copia sana sin descartar nada', () => {
    const backup = JSON.stringify({
      version: 1,
      settings: DEFAULT_SETTINGS,
      subjects: [
        {
          id: 'mat',
          name: 'Matemáticas I',
          color: 'indigo',
          weight: 4,
          schedule: [],
          categories: [],
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      tasks: [],
      grades: [],
      exams: [],
      events: [],
      sessions: [],
      goals: [],
      activity: [],
    })
    const result = importJSON(backup)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.dropped, 0)
    assert.equal(result.warning, null)
    assert.equal(result.data.subjects.length, 1)
  })

  it('salva lo bueno y avisa de lo que ha descartado', () => {
    const backup = JSON.stringify({
      subjects: [
        {
          id: 'mat',
          name: 'Matemáticas I',
          color: 'indigo',
          weight: 4,
          schedule: [],
          categories: [],
        },
        { id: 'roto' }, // sin nombre
      ],
      grades: [{ id: 'g1', subjectId: 'mat', score: 8 }], // sin maxScore
    })
    const result = importJSON(backup)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.data.subjects.length, 1)
    assert.equal(result.data.grades.length, 0)
    assert.equal(result.dropped, 2)
    assert.match(result.warning ?? '', /asignaturas/)
    assert.match(result.warning ?? '', /notas/)
  })
})

describe('migrateWithReport', () => {
  it('rellena lo que falta sin inventarse datos', () => {
    const report = migrateWithReport({ subjects: [] })
    assert.deepEqual(report.data.tasks, [])
    assert.equal(report.data.settings.gradeScale.max, DEFAULT_SETTINGS.gradeScale.max)
    assert.equal(report.totalDropped, 0)
  })

  it('con datos ilegibles devuelve el estado vacío', () => {
    const report = migrateWithReport(null)
    assert.equal(report.data.subjects.length, 0)
    assert.equal(report.totalDropped, 0)
  })

  describe('integridad referencial', () => {
    // Cada registro puede ser válido por sí solo y aun así apuntar a una
    // asignatura que no existe: eso también hay que detectarlo, o la app
    // sobrevive con `.find()` devolviendo `undefined` y datos huérfanos.
    const subjects = [
      { id: 'mat', name: 'Matemáticas', color: 'indigo', weight: 4, schedule: [], categories: [] },
    ]

    it('descarta notas y exámenes de una asignatura que no existe', () => {
      const report = migrateWithReport({
        subjects,
        grades: [
          { id: 'g1', subjectId: 'mat', score: 8, maxScore: 10 },
          { id: 'g2', subjectId: 'fantasma', score: 8, maxScore: 10 },
        ],
        exams: [
          { id: 'e1', subjectId: 'mat', date: '2026-10-01' },
          { id: 'e2', subjectId: 'fantasma', date: '2026-10-01' },
        ],
      })
      assert.equal(report.data.grades.length, 1)
      assert.equal(report.data.exams.length, 1)
      assert.equal(report.totalDropped, 2)
    })

    it('limpia el vínculo, pero conserva la tarea, el evento y el objetivo', () => {
      // Una asignatura borrada no debería llevarse por delante una tarea
      // entera: el vínculo es opcional, se limpia y el registro se queda.
      const report = migrateWithReport({
        subjects,
        tasks: [{ id: 't1', title: 'Repasar', subjectId: 'fantasma', tags: [], subtasks: [] }],
        events: [{ id: 'e1', title: 'Clase', date: '2026-10-01', subjectId: 'fantasma' }],
        goals: [{ id: 'go1', kind: 'manual', scope: 'semanal', target: 5, subjectId: 'fantasma' }],
      })
      assert.equal(report.data.tasks.length, 1)
      assert.equal(report.data.tasks[0].subjectId, undefined)
      assert.equal(report.data.events.length, 1)
      assert.equal(report.data.events[0].subjectId, undefined)
      assert.equal(report.data.goals.length, 1)
      assert.equal(report.data.goals[0].subjectId, undefined)
      assert.equal(report.totalDropped, 0)
    })

    it('limpia el enlace de un examen a una nota que ya no existe', () => {
      const report = migrateWithReport({
        subjects,
        exams: [{ id: 'e1', subjectId: 'mat', date: '2026-10-01', gradeEntryId: 'g-fantasma' }],
      })
      assert.equal(report.data.exams[0].gradeEntryId, undefined)
    })
  })
})
