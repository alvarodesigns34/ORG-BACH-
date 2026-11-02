/**
 * Pruebas de las derivaciones sobre tareas.
 *
 * Nada de esto se guarda: se calcula a partir de la tarea y de la fecha de
 * hoy. Por eso todas las funciones aceptan el «hoy» como parámetro y se
 * pueden probar sin tocar el reloj del sistema.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  bucketOf,
  countByView,
  dueMoment,
  filterTasks,
  isOverdue,
  normalize,
  sortTasks,
  subtaskProgress,
  wasOnTime,
  EMPTY_FILTERS,
} from '../src/domain/tasks.ts'
import { parseDay } from '../src/domain/dates.ts'
import { taskStats } from '../src/domain/stats.ts'
import type { Task } from '../src/domain/types.ts'

const TODAY = '2026-10-14'

/** Timestamp de hoy a una hora concreta, para fijar el «ahora» en las pruebas. */
function todayAt(hours: number, minutes = 0): number {
  const date = parseDay(TODAY)
  date.setHours(hours, minutes, 0, 0)
  return date.getTime()
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `t${Math.random()}`,
    title: 'Tarea',
    priority: 'media',
    status: 'pendiente',
    tags: [],
    subtasks: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('bucketOf', () => {
  it('clasifica por cercanía del plazo', () => {
    assert.equal(bucketOf(makeTask({ dueDate: '2026-10-13' }), TODAY), 'atrasada')
    assert.equal(bucketOf(makeTask({ dueDate: TODAY }), TODAY, todayAt(12)), 'hoy')
    assert.equal(bucketOf(makeTask({ dueDate: '2026-10-15' }), TODAY), 'manana')
    assert.equal(bucketOf(makeTask({ dueDate: '2026-10-20' }), TODAY), 'proxima')
    assert.equal(bucketOf(makeTask(), TODAY), 'sin_fecha')
  })

  it('una tarea hecha nunca está atrasada', () => {
    const task = makeTask({ dueDate: '2026-01-01', status: 'completada' })
    assert.equal(bucketOf(task, TODAY), 'completada')
    assert.equal(isOverdue(task, TODAY), false)
  })

  it('con hora límite, hoy pasa a atrasada en cuanto vence', () => {
    // Antes esto se quedaba en "hoy" hasta que cambiaba el día natural,
    // aunque hubieran pasado horas del plazo: la ficha decía "Hoy" y la
    // pestaña "Atrasadas" no la listaba.
    const task = makeTask({ dueDate: TODAY, dueTime: '10:00' })
    assert.equal(bucketOf(task, TODAY, todayAt(9, 0)), 'hoy')
    assert.equal(bucketOf(task, TODAY, todayAt(11, 0)), 'atrasada')
  })
})

describe('isOverdue', () => {
  it('pendiente hoy a las 09:00 con plazo a las 10:00 no está atrasada', () => {
    const task = makeTask({ dueDate: TODAY, dueTime: '10:00' })
    assert.equal(isOverdue(task, TODAY, todayAt(9, 0)), false)
  })

  it('pendiente hoy a las 11:00 con plazo a las 10:00 sí está atrasada', () => {
    const task = makeTask({ dueDate: TODAY, dueTime: '10:00' })
    assert.equal(isOverdue(task, TODAY, todayAt(11, 0)), true)
  })

  it('pendiente hoy sin hora no está atrasada hasta acabar el día', () => {
    const task = makeTask({ dueDate: TODAY })
    assert.equal(isOverdue(task, TODAY, todayAt(23, 0)), false)
  })

  it('un día ya pasado está atrasado sin mirar la hora', () => {
    const task = makeTask({ dueDate: '2026-10-13' })
    assert.equal(isOverdue(task, TODAY, todayAt(0, 1)), true)
  })
})

describe('dueMoment', () => {
  it('sin hora, vence al acabar el día', () => {
    // Una tarea «para el viernes» sigue a tiempo a las once de la noche.
    const due = dueMoment(makeTask({ dueDate: TODAY }))
    assert.ok(due)
    assert.equal(due.getHours(), 23)
    assert.equal(due.getMinutes(), 59)
  })

  it('con hora, vence a esa hora', () => {
    const due = dueMoment(makeTask({ dueDate: TODAY, dueTime: '10:00' }))
    assert.ok(due)
    assert.equal(due.getHours(), 10)
    assert.equal(due.getMinutes(), 0)
  })

  it('sin fecha no hay vencimiento', () => {
    assert.equal(dueMoment(makeTask()), null)
  })

  it('una hora ilegible no rompe el cálculo', () => {
    const due = dueMoment(makeTask({ dueDate: TODAY, dueTime: 'a las tantas' }))
    assert.ok(due)
    assert.equal(due.getHours(), 23)
  })
})

describe('wasOnTime', () => {
  it('respeta la hora límite, no solo el día', () => {
    // Este es el caso que fallaba antes: entregada el mismo día pero ocho
    // horas después de la hora límite, y contaba como puntual.
    const late = makeTask({
      dueDate: TODAY,
      dueTime: '10:00',
      status: 'completada',
      completedAt: new Date(2026, 9, 14, 18, 0).toISOString(),
    })
    assert.equal(wasOnTime(late), false)
  })

  it('acepta la entrega dentro de la hora', () => {
    const punctual = makeTask({
      dueDate: TODAY,
      dueTime: '10:00',
      status: 'completada',
      completedAt: new Date(2026, 9, 14, 9, 30).toISOString(),
    })
    assert.equal(wasOnTime(punctual), true)
  })

  it('sin hora, cualquier momento del día es puntual', () => {
    const punctual = makeTask({
      dueDate: TODAY,
      status: 'completada',
      completedAt: new Date(2026, 9, 14, 23, 30).toISOString(),
    })
    assert.equal(wasOnTime(punctual), true)
  })

  it('no juzga lo que no se puede juzgar', () => {
    assert.equal(wasOnTime(makeTask({ status: 'completada' })), null) // sin fecha
    assert.equal(wasOnTime(makeTask({ dueDate: TODAY })), null) // sin completar
  })
})

describe('taskStats', () => {
  it('mide la puntualidad al instante, no al día', () => {
    const tasks = [
      makeTask({
        dueDate: TODAY,
        dueTime: '10:00',
        status: 'completada',
        completedAt: new Date(2026, 9, 14, 18, 0).toISOString(),
      }),
      makeTask({
        dueDate: TODAY,
        dueTime: '10:00',
        status: 'completada',
        completedAt: new Date(2026, 9, 14, 9, 0).toISOString(),
      }),
    ]
    assert.equal(taskStats(tasks, TODAY).onTimeRate, 50)
  })

  it('sin nada que juzgar devuelve null en vez de 0 %', () => {
    // Un 0 % daría a entender que siempre se entrega tarde.
    assert.equal(taskStats([makeTask()], TODAY).onTimeRate, null)
  })

  it('cuenta pendientes y atrasadas', () => {
    const stats = taskStats(
      [
        makeTask({ dueDate: '2026-10-01' }),
        makeTask({ dueDate: '2026-10-20' }),
        makeTask({ status: 'completada', completedAt: '2026-10-10T10:00:00.000Z' }),
      ],
      TODAY,
    )
    assert.equal(stats.total, 3)
    assert.equal(stats.completed, 1)
    assert.equal(stats.pending, 2)
    assert.equal(stats.overdue, 1)
  })
})

describe('subtaskProgress', () => {
  it('cuenta el porcentaje hecho', () => {
    const task = makeTask({
      subtasks: [
        { id: 'a', title: 'Uno', done: true },
        { id: 'b', title: 'Dos', done: true },
        { id: 'c', title: 'Tres', done: false },
      ],
    })
    assert.deepEqual(subtaskProgress(task), { done: 2, total: 3, percent: 67 })
  })

  it('sin subtareas no hay progreso que mostrar', () => {
    assert.deepEqual(subtaskProgress(makeTask()), { done: 0, total: 0, percent: 0 })
  })
})

describe('orden', () => {
  it('lo que tiene fecha va antes que lo que no', () => {
    const sinFecha = makeTask({ title: 'Sin fecha' })
    const conFecha = makeTask({ title: 'Con fecha', dueDate: '2026-12-01' })
    const orden = sortTasks([sinFecha, conFecha])
    assert.equal(orden[0].title, 'Con fecha')
  })

  it('a igualdad de fecha manda la prioridad', () => {
    const baja = makeTask({ title: 'Baja', dueDate: TODAY, priority: 'baja' })
    const urgente = makeTask({ title: 'Urgente', dueDate: TODAY, priority: 'urgente' })
    const orden = sortTasks([baja, urgente])
    assert.equal(orden[0].title, 'Urgente')
  })
})

describe('filtros', () => {
  const tasks = [
    makeTask({ title: 'Atrasada', dueDate: '2026-10-01' }),
    makeTask({ title: 'De hoy', dueDate: TODAY }),
    makeTask({ title: 'Próxima', dueDate: '2026-10-18' }),
    makeTask({ title: 'Hecha', status: 'completada' }),
  ]

  it('la vista de hoy incluye lo atrasado', () => {
    // Si no, lo que se pasó desaparece del radar justo cuando más urge.
    const hoy = filterTasks(tasks, { ...EMPTY_FILTERS, view: 'hoy' }, TODAY, todayAt(12))
    assert.equal(hoy.length, 2)
  })

  it('«todas» no muestra las completadas', () => {
    const todas = filterTasks(tasks, EMPTY_FILTERS, TODAY)
    assert.equal(todas.some((t) => t.title === 'Hecha'), false)
  })

  it('los recuentos cuadran con los filtros', () => {
    // «Ahora» fijado a mediodía de TODAY: con el reloj real, la tarea de hoy
    // pasaba a atrasada en cuanto la fecha de la prueba quedaba en el pasado.
    const counts = countByView(tasks, TODAY, todayAt(12))
    assert.equal(counts.atrasadas, 1)
    assert.equal(counts.completadas, 1)
    assert.equal(counts.hoy, 2)
  })

  it('busca sin tildes ni mayúsculas', () => {
    const conTilde = [makeTask({ title: 'Repasar Matemáticas' })]
    const found = filterTasks(conTilde, { ...EMPTY_FILTERS, query: 'matematicas' }, TODAY)
    assert.equal(found.length, 1)
  })

  it('busca también dentro de las subtareas', () => {
    const task = [
      makeTask({ title: 'Estudiar', subtasks: [{ id: 'a', title: 'Leer tema 4', done: false }] }),
    ]
    assert.equal(filterTasks(task, { ...EMPTY_FILTERS, query: 'tema 4' }, TODAY).length, 1)
  })
})

describe('normalize', () => {
  it('quita tildes y mayúsculas', () => {
    assert.equal(normalize('Matemáticas I'), 'matematicas i')
    assert.equal(normalize('FILOSOFÍA'), 'filosofia')
  })
})
