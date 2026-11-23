import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { detectAlerts } from '../src/domain/alerts.ts'
import type { SubjectResult } from '../src/domain/grades.ts'
import type { Exam, GradeScale, Subject } from '../src/domain/types.ts'

const SCALE: GradeScale = { max: 10, pass: 5, decimals: 2 }

const subj = (id: string, name: string, extra: Partial<Subject> = {}): Subject => ({
  id,
  name,
  shortName: name.slice(0, 3).toUpperCase(),
  color: 'sky',
  weight: 4,
  schedule: [],
  categories: [],
  createdAt: '2026-09-01T00:00:00Z',
  ...extra,
})

const exam = (id: string, subjectId: string, date: string, extra: Partial<Exam> = {}): Exam => ({
  id,
  subjectId,
  title: `Examen ${id}`,
  date,
  term: 'T1',
  createdAt: '2026-09-01T00:00:00Z',
  ...extra,
})

const resultWith = (avg: number): SubjectResult => ({
  subjectId: 'mat',
  average: avg,
  evaluatedPercent: 100,
  weightsDeclared: true,
  entryCount: 1,
  categories: [],
  warnings: [],
})

describe('detectAlerts', () => {
  it('no dispara falsa alerta por debajo de objetivo cuando la media redondea igual al objetivo', () => {
    const subjects = [subj('mat', 'Matemáticas', { targetGrade: 8 })]
    const results = new Map<string, SubjectResult>([['mat', resultWith(7.996)]])
    const alerts = detectAlerts({
      tasks: [],
      exams: [],
      subjects,
      results,
      scale: SCALE,
      today: '2026-11-18',
      examAlertDays: 5,
    })
    assert.equal(alerts.some((a) => a.id === 'objetivo-asignatura'), false)
  })

  it('detecta acumulación de 3 o más exámenes en 7 días y enlaza a #/examenes', () => {
    const subjects = [subj('mat', 'Matemáticas'), subj('fis', 'Física'), subj('his', 'Historia')]
    const alerts = detectAlerts({
      tasks: [],
      exams: [
        exam('e1', 'mat', '2026-11-20'),
        exam('e2', 'fis', '2026-11-22'),
        exam('e3', 'his', '2026-11-24'),
      ],
      subjects,
      results: new Map(),
      scale: SCALE,
      today: '2026-11-18',
      examAlertDays: 5,
    })
    const cluster = alerts.find((a) => a.id === 'acumulacion-examenes')
    assert.ok(cluster)
    assert.equal(cluster.href, '#/examenes')
    assert.match(cluster.title, /3 exámenes en 7 días/)
  })

  it('detecta 2 exámenes seguidos dentro de 48 horas aunque no lleguen a 3', () => {
    const subjects = [subj('mat', 'Matemáticas'), subj('fis', 'Física')]
    const alerts = detectAlerts({
      tasks: [],
      exams: [exam('e1', 'mat', '2026-11-20'), exam('e2', 'fis', '2026-11-21')],
      subjects,
      results: new Map(),
      scale: SCALE,
      today: '2026-11-18',
      examAlertDays: 5,
    })
    const cluster = alerts.find((a) => a.id === 'acumulacion-examenes')
    assert.ok(cluster)
    assert.match(cluster.title, /seguidos/)
  })

  it('ignora exámenes de asignaturas archivadas en el aviso de acumulación', () => {
    const subjects = [
      subj('mat', 'Matemáticas'),
      subj('arch', 'Latín', { archived: true }),
    ]
    const alerts = detectAlerts({
      tasks: [],
      exams: [exam('e1', 'mat', '2026-11-20'), exam('e2', 'arch', '2026-11-20')],
      subjects,
      results: new Map(),
      scale: SCALE,
      today: '2026-11-18',
      examAlertDays: 5,
    })
    assert.equal(alerts.some((a) => a.id === 'acumulacion-examenes'), false)
  })
})
