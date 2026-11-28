/** Resumen de tareas del widget de la pantalla de inicio (función `widget`). */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildSummary, type SyncRow } from '../supabase/functions/widget/summary.ts'

const row = (collection: string, id: string, data: Record<string, unknown>, clocks: Record<string, string> = {}): SyncRow => ({
  collection,
  id,
  data,
  clocks,
})

const rows: SyncRow[] = [
  row('subjects', 's1', { name: 'Matemáticas II', shortName: 'MI', color: 'indigo' }),
  row('subjects', 's2', { name: 'Física', color: 'teal' }),
  row('tasks', 't1', { title: 'Integrales', dueDate: '2026-11-28', priority: 'media', status: 'pendiente', subjectId: 's1' }),
  row('tasks', 't2', { title: 'Ensayo', dueDate: '2026-11-25', priority: 'baja', status: 'pendiente' }),
  row('tasks', 't3', { title: 'Lab', dueDate: '2026-11-28', dueTime: '09:00', priority: 'alta', status: 'en_progreso', subjectId: 's2' }),
  row('tasks', 't4', { title: 'Mañana', dueDate: '2026-11-29', priority: 'alta', status: 'pendiente' }),
  row('tasks', 't5', { title: 'Sin fecha', priority: 'alta', status: 'pendiente' }),
  row('tasks', 't6', { title: 'Hecha hoy', dueDate: '2026-11-28', status: 'completada', completedAt: '2026-11-27T23:30:00.000Z' }),
  row('tasks', 't7', { title: 'Hecha ayer', status: 'completada', completedAt: '2026-11-27T10:00:00.000Z' }),
  row('tasks', 't8', { title: 'Borrada', dueDate: '2026-11-28', status: 'pendiente', _deleted: true }, { title: 'a', _deleted: 'b' }),
  row('tasks', 't9', { title: 'Resucitada', dueDate: '2026-11-28', status: 'pendiente', _deleted: true }, { title: 'c', _deleted: 'b' }),
]

test('reúne lo de hoy y lo atrasado, en el orden de la app', () => {
  // Madrid en invierno: getTimezoneOffset() = -60.
  const s = buildSummary(rows, '2026-11-28', '10:15', -60)
  assert.deepEqual(
    s.tasks.map((t) => t.title),
    ['Ensayo', 'Lab', 'Integrales', 'Resucitada'],
  )
  assert.equal(s.pending, 4)
  assert.equal(s.done, 1, 'la completada a las 00:30 de Madrid cuenta como de hoy')
})

test('marca atrasado lo de hoy cuya hora ya pasó', () => {
  const s = buildSummary(rows, '2026-11-28', '08:00', -60)
  assert.equal(s.tasks.find((t) => t.title === 'Lab')?.late, false)
  const later = buildSummary(rows, '2026-11-28', '09:30', -60)
  assert.equal(later.tasks.find((t) => t.title === 'Lab')?.late, true)
  assert.equal(later.tasks.find((t) => t.title === 'Ensayo')?.late, true)
})

test('asignatura abreviada y color', () => {
  const s = buildSummary(rows, '2026-11-28', '10:00', -60)
  const lab = s.tasks.find((t) => t.title === 'Lab')
  assert.equal(lab?.subject, 'FÍS')
  assert.equal(lab?.color, 'teal')
  assert.equal(s.tasks.find((t) => t.title === 'Integrales')?.subject, 'MI')
})

test('limita la lista pero no el recuento', () => {
  const s = buildSummary(rows, '2026-11-28', '10:00', -60, 2)
  assert.equal(s.tasks.length, 2)
  assert.equal(s.pending, 4)
})

test('rechaza un día mal formado', () => {
  assert.throws(() => buildSummary(rows, '28/11', '10:00', -60))
})
