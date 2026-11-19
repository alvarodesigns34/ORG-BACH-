/**
 * Pruebas de «¿ya se hizo este examen?»: lo que decide si se sugiere
 * estudiarlo en «Con qué estudiar ahora» y en el resumen de Inicio.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { EXAM_FALLBACK_END, clockOf, examEndMinute, examsAwaitingGrade, isExamOver, pendingExams } from '../src/domain/exams.ts'
import type { Exam, ScheduleSlot, Subject } from '../src/domain/types.ts'

// 2026-11-18 es miércoles (3).
const TODAY = '2026-11-18'
const at = (hm: string, day = TODAY) => {
  const [h, m] = hm.split(':').map(Number)
  return { day, minutes: h * 60 + m }
}

function subject(id: string, schedule: ScheduleSlot[], archived = false): Subject {
  return { id, name: id, color: 'indigo', weight: 4, schedule, categories: [], createdAt: '2026-09-01T00:00:00.000Z', archived }
}
const slot = (day: ScheduleSlot['day'], start: string, end: string): ScheduleSlot => ({ id: `${day}-${start}`, day, start, end })

function exam(id: string, subjectId: string, date: string, extra: Partial<Exam> = {}): Exam {
  return { id, subjectId, title: id, date, term: '1', createdAt: '2026-09-01T00:00:00.000Z', ...extra } as Exam
}

const historia = subject('historia', [slot(3, '09:00', '09:55'), slot(5, '12:00', '12:55')])
const mates = subject('mates', [slot(3, '10:00', '10:55'), slot(3, '10:55', '11:50'), slot(3, '13:00', '13:55')])
const ingles = subject('ingles', [slot(1, '08:00', '08:55')])
const subjects = [historia, mates, ingles]

describe('examEndMinute', () => {
  it('sin hora: termina al acabar su clase de ese día', () => {
    assert.equal(examEndMinute(exam('e', 'historia', TODAY), subjects), 9 * 60 + 55)
  })

  it('con hora: termina al acabar el bloque de clase en que cae (clase doble unida)', () => {
    assert.equal(examEndMinute(exam('e', 'mates', TODAY, { time: '10:00' }), subjects), 11 * 60 + 50)
  })

  it('sin hora y con varias clases ese día: la última', () => {
    assert.equal(examEndMinute(exam('e', 'mates', TODAY), subjects), 13 * 60 + 55)
  })

  it('con hora fuera de su horario: una hora después de empezar', () => {
    assert.equal(examEndMinute(exam('e', 'historia', TODAY, { time: '16:30' }), subjects), 17 * 60 + 30)
  })

  it('sin hora ni clase de su asignatura ese día: al acabar la jornada', () => {
    assert.equal(examEndMinute(exam('e', 'ingles', TODAY), subjects), 13 * 60 + 55)
  })

  it('sin hora ni horario alguno: a las 20:00', () => {
    assert.equal(examEndMinute(exam('e', 'x', TODAY), []), EXAM_FALLBACK_END)
  })

  it('ignora asignaturas archivadas al calcular la jornada', () => {
    const late = subject('tarde', [slot(3, '18:00', '19:00')], true)
    assert.equal(examEndMinute(exam('e', 'ingles', TODAY), [...subjects, late]), 13 * 60 + 55)
  })
})

describe('isExamOver', () => {
  const e = exam('h', 'historia', TODAY)

  it('el caso del aviso: examen de hoy a las 23:00 ya está hecho', () => {
    assert.equal(isExamOver(e, subjects, at('23:00')), true)
  })

  it('antes y durante la clase sigue pendiente; al acabar, hecho', () => {
    assert.equal(isExamOver(e, subjects, at('07:30')), false)
    assert.equal(isExamOver(e, subjects, at('09:54')), false)
    assert.equal(isExamOver(e, subjects, at('09:55')), true)
  })

  it('examen de mañana sigue pendiente aunque sea tarde', () => {
    assert.equal(isExamOver(exam('m', 'historia', '2026-11-19'), subjects, at('23:59')), false)
  })

  it('examen de ayer sin nota ya está hecho', () => {
    assert.equal(isExamOver(exam('a', 'historia', '2026-11-17'), subjects, at('00:01')), true)
  })

  it('con nota apuntada está hecho aunque aún no sea su hora', () => {
    assert.equal(isExamOver(exam('n', 'historia', TODAY, { gradeEntryId: 'g1' }), subjects, at('08:00')), true)
  })
})

describe('pendingExams', () => {
  const list = [
    exam('manana', 'historia', '2026-11-19'),
    exam('hoy-tarde', 'mates', TODAY),
    exam('hoy-pronto', 'historia', TODAY),
    exam('ayer', 'mates', '2026-11-17'),
  ]

  it('a las 23:00 solo quedan los de días siguientes', () => {
    assert.deepEqual(pendingExams(list, subjects, at('23:00')).map((x) => x.id), ['manana'])
  })

  it('a las 12:00 sigue el de mates de hoy (clase a las 13:00) delante del de mañana', () => {
    assert.deepEqual(pendingExams(list, subjects, at('12:00')).map((x) => x.id), ['hoy-tarde', 'manana'])
  })

  it('a primera hora, los dos de hoy y el de mañana', () => {
    assert.deepEqual(
      pendingExams(list, subjects, at('08:00')).map((x) => x.id).sort(),
      ['hoy-pronto', 'hoy-tarde', 'manana'],
    )
  })
})

describe('clockOf', () => {
  it('usa la hora local, no UTC (00:30 en España sigue siendo ese día)', () => {
    const local = new Date(2026, 10, 19, 0, 30)
    assert.deepEqual(clockOf(local), { day: '2026-11-19', minutes: 30 })
  })
})

describe('examsAwaitingGrade', () => {
  const grades = new Set(['g1'])
  const list = [
    exam('hoy-hecho', 'historia', TODAY),
    exam('hoy-pendiente', 'mates', TODAY),
    exam('ayer', 'mates', '2026-11-17'),
    exam('con-nota', 'historia', '2026-11-16', { gradeEntryId: 'g1' }),
    exam('nota-borrada', 'historia', '2026-11-15', { gradeEntryId: 'g-borrada' }),
    exam('viejo', 'historia', '2026-10-01'),
    exam('manana', 'historia', '2026-11-19'),
  ]

  it('a las 12:00: los hechos sin nota, del más reciente al más antiguo', () => {
    assert.deepEqual(
      examsAwaitingGrade(list, subjects, grades, at('12:00')).map((x) => x.id),
      ['hoy-hecho', 'ayer', 'nota-borrada'],
    )
  })

  it('a las 23:00 ya entra también el de mates de hoy', () => {
    assert.ok(examsAwaitingGrade(list, subjects, grades, at('23:00')).some((x) => x.id === 'hoy-pendiente'))
  })

  it('no pregunta por los de asignaturas archivadas', () => {
    const archivada = subject('historia', historia.schedule, true)
    const ids = examsAwaitingGrade(list, [archivada, mates], grades, at('23:00')).map((x) => x.id)
    assert.deepEqual(ids, ['hoy-pendiente', 'ayer'])
  })
})

describe('pendingExams y asignaturas archivadas', () => {
  it('no sugiere estudiar exámenes de una asignatura archivada', () => {
    const archivada = subject('historia', historia.schedule, true)
    assert.deepEqual(pendingExams([exam('m', 'historia', '2026-11-19')], [archivada], at('10:00')), [])
  })
})
