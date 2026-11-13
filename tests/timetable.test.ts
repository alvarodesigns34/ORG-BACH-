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
      '08:45 TIC',
      '09:40 BGCA',
      '10:50 EF',
      '11:45 EF',
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
    assert.deepEqual(day(subjects, 4), [
      '08:45 TIC',
      '09:40 MAI',
      '10:50 LCLI',
      '11:45 FIL',
      '12:55 BGCA',
      '13:50 LEI',
    ])
    assert.deepEqual(day(subjects, 5), [
      '08:45 BGCA',
      '09:40 FQ',
      '10:50 FIL',
      '11:45 TIC',
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
    assert.ok(!plan.add.some((s) => s.name === 'Matemáticas'))

    const update = plan.update.find((u) => u.id === 'mat')
    assert.ok(update)
    // Solo cambian el horario y el nombre (de largo a simple): ni profesor ni color ni peso.
    assert.deepEqual(Object.keys(update.patch).sort(), ['name', 'schedule'])
    assert.equal(update.patch.name, 'Matemáticas')
    assert.equal(update.patch.schedule.length, 4)
    assert.ok(!update.patch.schedule.some((s) => s.id === 'old' || s.id === 'gone'))
    // El aula de una franja que sigue existiendo se conserva.
    const tuesday = update.patch.schedule.find((s) => s.day === 2 && s.start === '13:50')
    assert.equal(tuesday?.room, 'Aula 12')
  })

  it('usa nombres simples al crear', () => {
    const names = planTimetable([]).add.map((s) => s.name)
    for (const n of ['Lengua', 'Inglés', 'Biología', 'Matemáticas', 'Filosofía', 'TIC']) {
      assert.ok(names.includes(n), n)
    }
  })

  it('deja TIC como estaba y no crea otra', () => {
    const tic: Subject = {
      id: 'tic',
      name: 'TIC',
      shortName: 'TIC',
      color: 'amber',
      weight: 3,
      schedule: [],
      categories: [],
      createdAt: '2026-09-01T00:00:00.000Z',
    }
    // Duplicado que pudo crearse con la versión anterior: gana el exacto.
    const dup: Subject = { ...tic, id: 'dup', name: 'TICs', shortName: 'TICs' }
    const plan = planTimetable([dup, tic])
    assert.ok(!plan.add.some((s) => /^tic/i.test(s.name)))
    const update = plan.update.find((u) => /^tic/i.test(u.name))
    assert.equal(update?.id, 'tic')
    assert.equal(update?.patch.name, undefined)
    assert.equal(update?.patch.schedule.length, 3)
  })

  it('renombra una asignatura de nombre largo, pero respeta un nombre propio', () => {
    const base = {
      color: 'sky' as const,
      weight: 3,
      schedule: [],
      categories: [],
      createdAt: '2026-09-01T00:00:00.000Z',
    }
    const long: Subject = { ...base, id: 'a', name: 'Lengua Extranjera I (Inglés)', shortName: 'LEI' }
    const own: Subject = { ...base, id: 'b', name: 'Mi lengua', shortName: 'LCLI' }
    const plan = planTimetable([long, own])
    assert.equal(plan.update.find((u) => u.id === 'a')?.patch.name, 'Inglés')
    assert.equal(plan.update.find((u) => u.id === 'b')?.patch.name, undefined)
  })

  it('no crea Tutoría ni pone profesores', () => {
    const { add } = planTimetable([])
    assert.ok(!add.some((s) => s.shortName === 'TU' || /tutor/i.test(s.name)))
    assert.ok(add.every((s) => s.teacher === undefined))
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
