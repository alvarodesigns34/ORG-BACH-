/**
 * Pruebas de la carga del horario del centro.
 *
 * Lo importante: el horario sale exactamente como lo dice el centro, y cargar
 * sobre asignaturas que ya existen las reutiliza en vez de duplicarlas.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { TIMETABLE_SUBJECTS } from '../src/data/horario.ts'
import { classesOn } from '../src/domain/schedule.ts'
import { planTimetable, slotsFor, type NewSubject } from '../src/domain/timetable.ts'
import type { Subject } from '../src/domain/types.ts'

function asSubject(s: NewSubject, id: string): Subject {
  return { ...s, id, createdAt: '2026-09-01T00:00:00.000Z' }
}

/** Resumen legible de un día: «08:45 FQ». */
function day(subjects: Subject[], weekday: number): string[] {
  return classesOn(subjects, weekday).map((c) => `${c.slot.start} ${c.subject.shortName}`)
}

describe('horario del centro', () => {
  it('crea todas las asignaturas desde cero', () => {
    const plan = planTimetable([])
    assert.equal(plan.update.length, 0)
    assert.equal(plan.add.length, TIMETABLE_SUBJECTS.length)
  })

  it('deja cada día como en el horario original', () => {
    const subjects = planTimetable([]).add.map((s, i) => asSubject(s, `s${i}`))

    assert.deepEqual(day(subjects, 1), [
      '08:45 FQ',
      '09:40 FQ',
      '10:50 LCLI',
      '11:45 FIL',
      '12:55 LEI',
      '13:50 BGCA',
    ])
    assert.deepEqual(day(subjects, 2), [
      '08:45 TICs',
      '09:40 BGCA',
      '10:50 EF',
      '11:45 EF',
      '12:55 TU',
      '13:50 MAI',
    ])
    assert.deepEqual(day(subjects, 3), [
      '08:45 FQ',
      '09:40 MAI',
      '10:50 LCLI',
      '11:45 LCLI',
      '12:55 FIL',
      '13:50 LEI',
    ])
    // Jueves a las 12:55 hay desdoble: BGCA y FQ a la vez.
    assert.deepEqual(day(subjects, 4).sort(), [
      '08:45 TICs',
      '09:40 MAI',
      '10:50 LCLI',
      '11:45 FIL',
      '12:55 BGCA',
      '12:55 FQ',
      '13:50 LEI',
    ].sort())
    assert.deepEqual(day(subjects, 5), [
      '08:45 BGCA',
      '09:40 FQ',
      '10:50 FIL',
      '11:45 TICs',
      '12:55 LEI',
      '13:50 MAI',
    ])
    assert.deepEqual(day(subjects, 6), [])
    assert.deepEqual(day(subjects, 0), [])
  })

  it('no repite franjas ni deja horas mal formadas', () => {
    for (const def of TIMETABLE_SUBJECTS) {
      const slots = slotsFor(def.code)
      const keys = slots.map((s) => `${s.day}|${s.start}`)
      assert.equal(new Set(keys).size, keys.length, def.code)
      for (const slot of slots) {
        assert.match(slot.start, /^\d{2}:\d{2}$/)
        assert.match(slot.end, /^\d{2}:\d{2}$/)
        assert.ok(slot.end > slot.start)
      }
    }
  })

  it('reutiliza una asignatura que ya existe y conserva sus datos', () => {
    const existing: Subject = {
      id: 'mat',
      name: 'Matemáticas I',
      shortName: 'MAT',
      color: 'amber',
      teacher: 'Otro profesor',
      weight: 5,
      schedule: [
        { id: 'old', day: 2, start: '13:50', end: '14:40', room: 'Aula 12' },
        { id: 'gone', day: 5, start: '08:00', end: '09:00' },
      ],
      categories: [],
      createdAt: '2026-09-01T00:00:00.000Z',
    }

    const plan = planTimetable([existing])
    assert.equal(plan.add.length, TIMETABLE_SUBJECTS.length - 1)
    assert.ok(!plan.add.some((s) => s.name === 'Matemáticas I'))

    const update = plan.update.find((u) => u.id === 'mat')
    assert.ok(update)
    // Ni profesor ni color ni peso se tocan; el horario se sustituye.
    assert.equal(update.patch.teacher, undefined)
    assert.equal(update.patch.schedule.length, 4)
    assert.ok(!update.patch.schedule.some((s) => s.id === 'old' || s.id === 'gone'))
    // El aula de una franja que sigue existiendo se conserva.
    const tuesday = update.patch.schedule.find((s) => s.day === 2 && s.start === '13:50')
    assert.equal(tuesday?.room, 'Aula 12')
  })

  it('rellena el profesor solo si estaba vacío', () => {
    const existing: Subject = {
      id: 'fil',
      name: 'Filosofía',
      color: 'plum',
      weight: 3,
      schedule: [],
      categories: [],
      createdAt: '2026-09-01T00:00:00.000Z',
    }
    const update = planTimetable([existing]).update[0]
    assert.equal(update.patch.teacher, 'Antonio Usero Vílchez')
  })

  it('reconoce la asignatura por la abreviatura y sin importar tildes', () => {
    const byCode: Subject = {
      id: 'x',
      name: 'Ingles',
      shortName: 'lei',
      color: 'sky',
      weight: 3,
      schedule: [],
      categories: [],
      createdAt: '2026-09-01T00:00:00.000Z',
    }
    const plan = planTimetable([byCode])
    assert.equal(plan.update[0].id, 'x')
    assert.ok(!plan.add.some((s) => s.shortName === 'LEI'))
  })

  it('ignora las asignaturas archivadas', () => {
    const archived: Subject = {
      id: 'old',
      name: 'Matemáticas I',
      color: 'indigo',
      weight: 4,
      schedule: [],
      categories: [],
      createdAt: '2026-09-01T00:00:00.000Z',
      archived: true,
    }
    const plan = planTimetable([archived])
    assert.equal(plan.update.length, 0)
    assert.equal(plan.add.length, TIMETABLE_SUBJECTS.length)
  })
})
