/**
 * Pruebas de «Mi orden»: la ordenación manual de tareas.
 *
 * Lo delicado es reordenar una lista FILTRADA: las tareas que no se ven deben
 * quedarse exactamente donde estaban respecto a las demás.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createEmptyData } from '../src/data/defaults.ts'
import { applyManualOrder, sortTasks } from '../src/domain/tasks.ts'
import { reducer } from '../src/state/reducer.ts'
import { parseTask } from '../src/storage/validate.ts'
import type { AppData, Task } from '../src/domain/types.ts'

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Tarea ${id}`,
    priority: 'media',
    status: 'pendiente',
    tags: [],
    subtasks: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

const ids = (tasks: Task[]) => tasks.map((t) => t.id)

function stateWith(tasks: Task[]): AppData {
  return { ...createEmptyData(), tasks }
}

describe('sortTasks manual', () => {
  it('sin posiciones guardadas coincide con el orden por fecha', () => {
    const tasks = [
      task('c'),
      task('a', { dueDate: '2026-10-20' }),
      task('b', { dueDate: '2026-10-15' }),
    ]
    assert.deepEqual(ids(sortTasks(tasks, 'manual')), ids(sortTasks(tasks, 'fecha')))
  })

  it('las colocadas a mano van primero y las nuevas detrás, por fecha', () => {
    const tasks = [
      task('nueva-tarde', { dueDate: '2026-10-30' }),
      task('x', { order: 1 }),
      task('nueva-pronto', { dueDate: '2026-10-16' }),
      task('y', { order: 0, dueDate: '2026-12-01' }),
    ]
    assert.deepEqual(ids(sortTasks(tasks, 'manual')), ['y', 'x', 'nueva-pronto', 'nueva-tarde'])
  })
})

describe('applyManualOrder', () => {
  const all = [task('a', { order: 0 }), task('b', { order: 1 }), task('c', { order: 2 }), task('d', { order: 3 })]

  it('reordena la lista completa', () => {
    assert.deepEqual(ids(applyManualOrder(all, ['d', 'a', 'b', 'c'])), ['d', 'a', 'b', 'c'])
  })

  it('con un filtro, solo se intercambian las visibles y las ocultas no se mueven', () => {
    // Se ven b y d; se arrastra d por encima de b.
    assert.deepEqual(ids(applyManualOrder(all, ['d', 'b'])), ['a', 'd', 'c', 'b'])
  })

  it('ignora identificadores que ya no existen y duplicados', () => {
    assert.deepEqual(ids(applyManualOrder(all, ['zz', 'c', 'c', 'a'])), ['c', 'b', 'a', 'd'])
  })
})

describe('reducer task/reorder', () => {
  it('numera de nuevo todas las tareas según el orden elegido', () => {
    const state = stateWith([task('a'), task('b'), task('c')])
    const next = reducer(state, { type: 'task/reorder', ids: ['c', 'a', 'b'] })
    assert.deepEqual(ids(sortTasks(next.tasks, 'manual')), ['c', 'a', 'b'])
    assert.deepEqual(
      next.tasks.map((t) => [t.id, t.order]),
      [
        ['a', 1],
        ['b', 2],
        ['c', 0],
      ],
    )
  })

  it('solo crea objetos nuevos para las tareas que cambian de posición', () => {
    const state = stateWith([task('a', { order: 0 }), task('b', { order: 1 }), task('c', { order: 2 })])
    const next = reducer(state, { type: 'task/reorder', ids: ['b', 'a'] })
    assert.equal(next.tasks[2], state.tasks[2])
    assert.notEqual(next.tasks[0], state.tasks[0])
  })

  it('si nada cambia devuelve el mismo estado', () => {
    const state = stateWith([task('a', { order: 0 }), task('b', { order: 1 })])
    assert.equal(reducer(state, { type: 'task/reorder', ids: ['a', 'b'] }), state)
  })

  it('una tarea creada después queda al final de «Mi orden»', () => {
    let state = stateWith([task('a', { dueDate: '2026-10-20' }), task('b', { dueDate: '2026-10-25' })])
    state = reducer(state, { type: 'task/reorder', ids: ['b', 'a'] })
    state = reducer(state, {
      type: 'task/add',
      task: {
        title: 'Urgente',
        priority: 'urgente',
        status: 'pendiente',
        dueDate: '2026-10-15',
        tags: [],
        subtasks: [],
      },
    })
    const order = sortTasks(state.tasks, 'manual').map((t) => t.title)
    assert.deepEqual(order, ['Tarea b', 'Tarea a', 'Urgente'])
  })
})

describe('parseTask order', () => {
  it('conserva la posición y descarta valores rotos', () => {
    assert.equal(parseTask({ ...task('a'), order: 3 })?.order, 3)
    assert.equal(parseTask({ ...task('a'), order: 'tres' })?.order, undefined)
    assert.equal(parseTask({ ...task('a'), order: Number.NaN })?.order, undefined)
  })
})
