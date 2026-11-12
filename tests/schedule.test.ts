/**
 * Pruebas del horario: qué clases tiene un día y qué toca a una hora dada.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { classesOn, dayStatus, formatMinutes, toMinutes } from '../src/domain/schedule.ts'
import type { ScheduleSlot, Subject } from '../src/domain/types.ts'

function subject(id: string, schedule: ScheduleSlot[], archived = false): Subject {
  return {
    id,
    name: id,
    color: 'indigo',
    weight: 4,
    schedule,
    categories: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    archived,
  }
}

const slot = (id: string, day: ScheduleSlot['day'], start: string, end: string): ScheduleSlot => ({
  id,
  day,
  start,
  end,
})

describe('toMinutes', () => {
  it('convierte una hora a minutos desde medianoche', () => {
    assert.equal(toMinutes('08:30'), 510)
    assert.equal(toMinutes('00:00'), 0)
    assert.equal(toMinutes('23:59'), 1439)
  })

  it('rechaza lo que no es una hora', () => {
    assert.ok(Number.isNaN(toMinutes('25:00')))
    assert.ok(Number.isNaN(toMinutes('8')))
    assert.ok(Number.isNaN(toMinutes('')))
  })
})

describe('classesOn', () => {
  const subjects = [
    subject('fis', [slot('a', 1, '09:25', '10:20'), slot('b', 2, '08:30', '09:25')]),
    subject('mat', [slot('c', 1, '08:30', '09:25')]),
    subject('vieja', [slot('d', 1, '07:00', '08:00')], true),
    subject('rota', [slot('e', 1, '11:00', '10:00'), slot('f', 1, 'xx', '12:00')]),
  ]

  it('junta las de ese día, ordenadas por hora', () => {
    assert.deepEqual(
      classesOn(subjects, 1).map((c) => c.subject.id),
      ['mat', 'fis'],
    )
  })

  it('ignora asignaturas archivadas y franjas imposibles', () => {
    const ids = classesOn(subjects, 1).map((c) => c.slot.id)
    assert.equal(ids.includes('d'), false)
    assert.equal(ids.includes('e'), false)
    assert.equal(ids.includes('f'), false)
  })

  it('un día sin clases devuelve lista vacía', () => {
    assert.deepEqual(classesOn(subjects, 6), [])
  })
})

describe('dayStatus', () => {
  const classes = classesOn(
    [
      subject('mat', [slot('a', 1, '08:30', '09:30')]),
      subject('fis', [slot('b', 1, '09:30', '10:30')]),
      subject('len', [slot('c', 1, '11:00', '12:00')]),
    ],
    1,
  )

  it('antes de la primera: nada en curso y la primera como siguiente', () => {
    const status = dayStatus(classes, toMinutes('08:00'))
    assert.equal(status.current, null)
    assert.equal(status.next?.subject.id, 'mat')
    assert.equal(status.next?.startsIn, 30)
    assert.equal(status.done, 0)
  })

  it('en mitad de una clase: progreso y minutos que quedan', () => {
    const status = dayStatus(classes, toMinutes('08:45'))
    assert.equal(status.current?.subject.id, 'mat')
    assert.equal(status.current?.progress, 0.25)
    assert.equal(status.current?.minutesLeft, 45)
    assert.equal(status.next?.subject.id, 'fis')
  })

  it('en el minuto del cambio manda la que empieza', () => {
    const status = dayStatus(classes, toMinutes('09:30'))
    assert.equal(status.current?.subject.id, 'fis')
    assert.equal(status.done, 1)
  })

  it('en un recreo: nada en curso, pero sí siguiente', () => {
    const status = dayStatus(classes, toMinutes('10:40'))
    assert.equal(status.current, null)
    assert.equal(status.next?.subject.id, 'len')
    assert.equal(status.done, 2)
  })

  it('al acabar el día: todo hecho', () => {
    const status = dayStatus(classes, toMinutes('15:00'))
    assert.equal(status.current, null)
    assert.equal(status.next, null)
    assert.equal(status.done, 3)
  })
})

describe('formatMinutes', () => {
  it('minutos sueltos, horas justas y mezcla', () => {
    assert.equal(formatMinutes(25), '25 min')
    assert.equal(formatMinutes(60), '1 h')
    assert.equal(formatMinutes(70), '1 h 10 min')
  })
})
