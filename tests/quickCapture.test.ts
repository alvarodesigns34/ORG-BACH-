import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseQuickTask } from '../src/domain/quickCapture.ts'
import type { Subject } from '../src/domain/types.ts'

const SUBJECTS: Subject[] = [
  {
    id: 'mat',
    name: 'Matemáticas I',
    shortName: 'MAT',
    color: 'sky',
    weight: 4,
    schedule: [],
    categories: [],
    createdAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'fis',
    name: 'Física y Química',
    shortName: 'FYQ',
    color: 'indigo',
    weight: 4,
    schedule: [],
    categories: [],
    createdAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'arch',
    name: 'Latín',
    shortName: 'LAT',
    color: 'amber',
    weight: 4,
    schedule: [],
    categories: [],
    archived: true,
    createdAt: '2026-09-01T00:00:00Z',
  },
]

// 2026-11-18 es miércoles
const TODAY = '2026-11-18'

describe('parseQuickTask', () => {
  it('extrae asignatura, fecha relativa, hora, duración y prioridad en una sola línea', () => {
    const parsed = parseQuickTask(
      'Ejercicios derivadas pág. 142 #MAT mañana 18:00 !alta 45m',
      SUBJECTS,
      TODAY,
    )
    assert.equal(parsed.title, 'Ejercicios derivadas pág. 142')
    assert.equal(parsed.subjectId, 'mat')
    assert.equal(parsed.dueDate, '2026-11-19')
    assert.equal(parsed.dueTime, '18:00')
    assert.equal(parsed.priority, 'alta')
    assert.equal(parsed.estimatedMinutes, 45)
    assert.deepEqual(parsed.tags, [])
  })

  it('reconoce pasado mañana, en N días, día de la semana y fecha DD/MM', () => {
    assert.equal(parseQuickTask('Repasar pasado mañana', SUBJECTS, TODAY).dueDate, '2026-11-20')
    assert.equal(parseQuickTask('Entregar en 5 días', SUBJECTS, TODAY).dueDate, '2026-11-23')
    assert.equal(parseQuickTask('Resumen el viernes', SUBJECTS, TODAY).dueDate, '2026-11-20')
    // Miércoles pidiendo «miércoles» salta a la semana siguiente
    assert.equal(parseQuickTask('Práctica miércoles', SUBJECTS, TODAY).dueDate, '2026-11-25')
    assert.equal(parseQuickTask('Trabajo el 05/12', SUBJECTS, TODAY).dueDate, '2026-12-05')
    // Fecha ya pasada sin año salta al año siguiente
    assert.equal(parseQuickTask('Entrega 15/01', SUBJECTS, TODAY).dueDate, '2027-01-15')
  })

  it('ignora fechas imposibles como 31/02', () => {
    const parsed = parseQuickTask('Revisar 31/02', SUBJECTS, TODAY)
    assert.equal(parsed.dueDate, undefined)
  })

  it('soporta horas «a las 19» y asume hoy si solo se indica hora', () => {
    const parsed = parseQuickTask('Estudiar formulación @Física a las 19 1h 30m !!!', SUBJECTS, TODAY)
    assert.equal(parsed.subjectId, 'fis')
    assert.equal(parsed.dueDate, TODAY)
    assert.equal(parsed.dueTime, '19:00')
    assert.equal(parsed.estimatedMinutes, 90)
    assert.equal(parsed.priority, 'urgente')
  })

  it('convierte hashtags que no son asignatura en etiquetas y no enlaza asignaturas archivadas', () => {
    const parsed = parseQuickTask('Leer texto #LAT #entrega #repaso', SUBJECTS, TODAY)
    assert.equal(parsed.subjectId, undefined)
    assert.deepEqual(parsed.tags, ['lat', 'entrega', 'repaso'])
  })

  it('mantiene el texto original como título si todo fueron tokens', () => {
    const parsed = parseQuickTask('hoy', SUBJECTS, TODAY)
    assert.equal(parsed.title, 'hoy')
    assert.equal(parsed.dueDate, TODAY)
  })
})
