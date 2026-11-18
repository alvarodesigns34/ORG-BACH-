/**
 * Pruebas de la exportación a calendario (.ics).
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildIcs, escapeText, foldLine, icsSelection } from '../src/domain/ics.ts'
import type { Exam, Subject, Task } from '../src/domain/types.ts'

const subject = (id: string, name: string, archived = false): Subject => ({
  id,
  name,
  color: 'indigo',
  weight: 4,
  // Miércoles de 9:00 a 9:55.
  schedule: [{ id: 's', day: 3, start: '09:00', end: '09:55' }],
  categories: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  archived,
})
const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: id,
  priority: 'media',
  status: 'pendiente',
  tags: [],
  subtasks: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  ...extra,
}) as Task
const exam = (id: string, extra: Partial<Exam> = {}): Exam =>
  ({ id, subjectId: 'his', title: 'Tema 3', date: '2026-11-18', term: '1', createdAt: '2026-09-01T00:00:00.000Z', ...extra }) as Exam

const subjects = [subject('his', 'Historia'), subject('old', 'Vieja', true)]
const now = new Date('2026-11-18T20:00:00Z')

describe('buildIcs', () => {
  const ics = buildIcs({
    tasks: [
      task('entrega', { dueDate: '2026-11-20', dueTime: '23:59', subjectId: 'his' }),
      task('sin-hora', { dueDate: '2026-11-21', description: 'Línea 1\nLínea 2; con, comas' }),
      task('hecha', { dueDate: '2026-11-20', status: 'completada' }),
      task('sin-fecha'),
    ],
    exams: [exam('ex1'), exam('ex2', { time: '09:00', date: '2026-11-25' }), exam('arch', { subjectId: 'old' })],
    subjects,
    today: '2026-11-18',
    now,
  })

  it('es un VCALENDAR con líneas CRLF y zona de Madrid', () => {
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'))
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'))
    assert.match(ics, /BEGIN:VTIMEZONE\r\nTZID:Europe\/Madrid/)
    assert.doesNotMatch(ics.replace(/\r\n/g, ''), /\n/)
  })

  it('examen sin hora: de día completo', () => {
    assert.match(ics, /UID:ex1@orbita[\s\S]*?DTSTART;VALUE=DATE:20261118\r\nDTEND;VALUE=DATE:20261119/)
    assert.match(ics, /SUMMARY:Examen de Historia: Tema 3/)
  })

  it('examen con hora: hasta el final de su clase', () => {
    assert.match(ics, /UID:ex2@orbita[\s\S]*?DTSTART;TZID=Europe\/Madrid:20261125T090000\r\nDTEND;TZID=Europe\/Madrid:20261125T095500/)
  })

  it('tarea con hora cerca de medianoche no se sale del día', () => {
    assert.match(ics, /UID:entrega@orbita[\s\S]*?DTSTART;TZID=Europe\/Madrid:20261120T235900\r\nDTEND;TZID=Europe\/Madrid:20261120T235900/)
  })

  it('escapa saltos, comas y punto y coma', () => {
    assert.match(ics, /DESCRIPTION:Línea 1\\nLínea 2\\; con\\, comas/)
  })

  it('deja fuera lo hecho, lo que no tiene fecha y lo archivado', () => {
    assert.doesNotMatch(ics, /UID:(hecha|sin-fecha|arch)@/)
  })
})

describe('icsSelection', () => {
  it('no incluye exámenes de hace más de un mes', () => {
    const sel = icsSelection({ tasks: [], exams: [exam('viejo', { date: '2026-09-01' })], subjects, today: '2026-11-18' })
    assert.equal(sel.exams.length, 0)
  })
})

describe('formato', () => {
  it('escapeText', () => {
    assert.equal(escapeText('a\\b;c,d\ne'), 'a\\\\b\\;c\\,d\\ne')
  })

  it('foldLine parte a 75 octetos sin romper caracteres', () => {
    const long = 'SUMMARY:' + 'á'.repeat(80)
    const folded = foldLine(long)
    const enc = new TextEncoder()
    for (const part of folded.split('\r\n')) assert.ok(enc.encode(part).length <= 75)
    assert.equal(folded.replace(/\r\n /g, ''), long)
  })
})
