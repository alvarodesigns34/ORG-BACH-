/**
 * Pruebas del núcleo de sincronización.
 *
 * Simulan dos dispositivos y un servidor. El servidor de la prueba reproduce
 * la misma regla que `sync_push` en Postgres (gana, campo a campo, el reloj
 * mayor), así que estos escenarios cubren lo que de verdad ocurre en la red.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createEmptyData } from '../src/data/defaults.ts'
import type { AppData, Task } from '../src/domain/types.ts'
import { formatClock, parseClock, receive, tick, ZERO_CLOCK } from '../src/sync/hlc.ts'
import {
  acknowledge,
  buildPush,
  createMeta,
  isDeleted,
  keyOf,
  mergeRemote,
  stampAll,
  stampLocalChanges,
  type PushRecord,
  type RemoteRow,
  type SyncMeta,
} from '../src/sync/merge.ts'

// --- Utilidades ------------------------------------------------------------

const T0 = 1_793_600_000_000

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task_1',
    title: 'Comentario de texto',
    priority: 'media',
    status: 'pendiente',
    tags: [],
    subtasks: [],
    createdAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  }
}

function withTasks(base: AppData, tasks: Task[]): AppData {
  return { ...base, tasks }
}

/** Servidor en memoria con la misma regla de fusión que `sync_push`. */
class FakeServer {
  rows = new Map<string, RemoteRow>()
  seq = 0

  push(batch: PushRecord[]) {
    for (const rec of batch) {
      const key = keyOf(rec.collection, rec.id)
      const cur = this.rows.get(key)
      if (!cur) {
        this.rows.set(key, { ...structuredClone(rec), seq: ++this.seq })
        continue
      }
      let changed = false
      const data = { ...cur.data }
      const clocks = { ...cur.clocks }
      for (const [field, clock] of Object.entries(rec.clocks)) {
        if (clock > (clocks[field] ?? '')) {
          clocks[field] = clock
          if (field in rec.data) data[field] = structuredClone(rec.data[field])
          else delete data[field]
          changed = true
        }
      }
      if (changed) this.rows.set(key, { ...cur, data, clocks, seq: ++this.seq })
    }
  }

  since(cursor: number): RemoteRow[] {
    return [...this.rows.values()].filter((r) => r.seq > cursor).sort((a, b) => a.seq - b.seq)
  }
}

/** Un dispositivo: su curso, sus relojes y su forma de hablar con el servidor. */
class Device {
  data: AppData
  meta: SyncMeta
  now: number

  constructor(node: string, data: AppData, now = T0) {
    this.data = data
    this.meta = createMeta('user', node)
    this.now = now
  }

  edit(next: AppData) {
    this.now += 1000
    this.meta = stampLocalChanges(this.meta, this.data, next, this.now)
    this.data = next
  }

  push(server: FakeServer) {
    const batch = buildPush(this.data, this.meta, this.meta.dirty)
    server.push(batch)
    this.meta = acknowledge(this.meta, batch)
  }

  pull(server: FakeServer) {
    const result = mergeRemote(this.data, this.meta, server.since(this.meta.cursor), this.now)
    this.data = result.data
    this.meta = result.meta
    return result
  }

  sync(server: FakeServer) {
    this.pull(server)
    this.push(server)
  }
}

function onboarded(): AppData {
  const data = createEmptyData()
  return { ...data, settings: { ...data.settings, onboarded: true, userName: 'Álvaro' } }
}

/** Dos dispositivos con el mismo curso ya sincronizado. */
function pair(initial: Task[]) {
  const server = new FakeServer()
  const phone = new Device('phone', onboarded())
  phone.edit(withTasks(phone.data, initial))
  phone.push(server)
  const laptop = new Device('laptop', createEmptyData(), T0 + 500)
  laptop.pull(server)
  return { server, phone, laptop }
}

// --- HLC -------------------------------------------------------------------

describe('reloj HLC', () => {
  it('formatea con ancho fijo y vuelve a leerse igual', () => {
    const state = { wall: T0, counter: 7, node: 'abc' }
    const text = formatClock(state)
    assert.equal(text, `00${T0}:00007:abc`)
    assert.deepEqual(parseClock(text), state)
  })

  it('el orden de las cadenas coincide con el de los relojes', () => {
    const a = formatClock({ wall: 999, counter: 99, node: 'z' })
    const b = formatClock({ wall: 1000, counter: 0, node: 'a' })
    assert.ok(a < b)
    assert.ok(ZERO_CLOCK < a)
  })

  it('nunca retrocede aunque el reloj de pared lo haga', () => {
    const first = tick({ wall: 0, counter: 0, node: 'n' }, T0)
    const second = tick(first, T0 - 60_000)
    assert.ok(formatClock(second) > formatClock(first))
  })

  it('al recibir una marca remota se pone por delante de ella', () => {
    const remote = formatClock({ wall: T0 + 3_600_000, counter: 4, node: 'r' })
    const local = receive({ wall: T0, counter: 0, node: 'l' }, remote, T0)
    const next = formatClock(tick(local, T0))
    assert.ok(next > remote, 'una edición posterior a ver otra siempre la supera')
  })
})

// --- Cambios locales -------------------------------------------------------

describe('cambios locales', () => {
  it('una tarea nueva marca todos sus campos y queda pendiente de subir', () => {
    const device = new Device('d', onboarded())
    device.edit(withTasks(device.data, [task()]))
    const meta = device.meta.records[keyOf('tasks', 'task_1')]
    assert.ok(meta.c.title && meta.c.priority && meta.c._deleted)
    assert.equal(meta.d, false)
    assert.ok(device.meta.dirty.includes(keyOf('tasks', 'task_1')))
  })

  it('editar un campo solo cambia el reloj de ese campo', () => {
    const device = new Device('d', onboarded())
    device.edit(withTasks(device.data, [task()]))
    const before = { ...device.meta.records[keyOf('tasks', 'task_1')].c }
    device.edit(withTasks(device.data, [task({ title: 'Otro título' })]))
    const after = device.meta.records[keyOf('tasks', 'task_1')].c
    assert.notEqual(after.title, before.title)
    assert.equal(after.priority, before.priority)
  })

  it('borrar deja una lápida en lugar de olvidar el registro', () => {
    const device = new Device('d', onboarded())
    device.edit(withTasks(device.data, [task()]))
    device.edit(withTasks(device.data, []))
    const meta = device.meta.records[keyOf('tasks', 'task_1')]
    assert.equal(meta.d, true)
    const [record] = buildPush(device.data, device.meta, [keyOf('tasks', 'task_1')])
    assert.deepEqual(record.data, { _deleted: true })
  })

  it('el tema no viaja entre dispositivos', () => {
    const device = new Device('d', onboarded())
    device.meta = { ...device.meta, dirty: [] }
    device.edit({ ...device.data, settings: { ...device.data.settings, theme: 'dark' } })
    assert.equal(device.meta.dirty.length, 0)
  })
})

// --- Conflictos ------------------------------------------------------------

describe('conflictos entre dispositivos', () => {
  it('ediciones de campos distintos sin conexión: se conservan las dos', () => {
    const { server, phone, laptop } = pair([task()])
    assert.equal(laptop.data.tasks[0].title, 'Comentario de texto')

    phone.edit(withTasks(phone.data, [task({ title: 'Comentario de Machado' })]))
    laptop.edit(withTasks(laptop.data, [task({ dueDate: '2026-11-05' })]))

    phone.sync(server)
    laptop.sync(server)
    phone.sync(server)

    for (const device of [phone, laptop]) {
      assert.equal(device.data.tasks[0].title, 'Comentario de Machado')
      assert.equal(device.data.tasks[0].dueDate, '2026-11-05')
    }
  })

  it('el mismo campo editado en los dos: gana la edición posterior en ambos', () => {
    const { server, phone, laptop } = pair([task()])
    phone.edit(withTasks(phone.data, [task({ priority: 'alta' })]))
    laptop.now = phone.now + 5000
    laptop.edit(withTasks(laptop.data, [task({ priority: 'urgente' })]))

    laptop.sync(server)
    phone.sync(server)
    laptop.sync(server)

    assert.equal(phone.data.tasks[0].priority, 'urgente')
    assert.equal(laptop.data.tasks[0].priority, 'urgente')
  })

  it('borrar en uno y editar después en otro: la edición resucita la tarea', () => {
    const { server, phone, laptop } = pair([task()])
    phone.edit(withTasks(phone.data, []))
    phone.sync(server)

    laptop.now = phone.now + 5000
    laptop.edit(withTasks(laptop.data, [task({ title: 'Sigo trabajando en esto' })]))
    laptop.sync(server)
    phone.sync(server)

    assert.equal(phone.data.tasks.length, 1)
    assert.equal(phone.data.tasks[0].title, 'Sigo trabajando en esto')
    // Y sin perder los campos que el otro dispositivo no tocó.
    assert.equal(phone.data.tasks[0].priority, 'media')
  })

  it('borrar después de la última edición sí borra en todas partes', () => {
    const { server, phone, laptop } = pair([task()])
    laptop.edit(withTasks(laptop.data, [task({ title: 'Editada' })]))
    laptop.sync(server)
    phone.pull(server)
    phone.edit(withTasks(phone.data, []))
    phone.sync(server)
    laptop.sync(server)
    assert.equal(laptop.data.tasks.length, 0)
  })

  it('tareas creadas a la vez en cada dispositivo aparecen en los dos', () => {
    const { server, phone, laptop } = pair([])
    phone.edit(withTasks(phone.data, [task({ id: 'a', title: 'Del móvil' })]))
    laptop.edit(withTasks(laptop.data, [task({ id: 'b', title: 'Del portátil' })]))
    phone.sync(server)
    laptop.sync(server)
    phone.sync(server)
    const titles = (d: Device) => d.data.tasks.map((t) => t.title).sort()
    assert.deepEqual(titles(phone), ['Del móvil', 'Del portátil'])
    assert.deepEqual(titles(laptop), ['Del móvil', 'Del portátil'])
  })

  it('el servidor puede recibir los cambios en cualquier orden', () => {
    const { server, phone, laptop } = pair([task()])
    phone.edit(withTasks(phone.data, [task({ title: 'A' })]))
    laptop.now = phone.now + 1
    laptop.edit(withTasks(laptop.data, [task({ title: 'B' })]))
    // Llega primero la edición posterior.
    laptop.push(server)
    phone.push(server)
    phone.pull(server)
    laptop.pull(server)
    assert.equal(phone.data.tasks[0].title, 'B')
    assert.equal(laptop.data.tasks[0].title, 'B')
  })
  it('deshacer un borrado ya sincronizado devuelve la tarea en el otro dispositivo', () => {
    const { server, phone, laptop } = pair([task()])
    phone.edit(withTasks(phone.data, []))
    phone.sync(server)
    laptop.sync(server)
    assert.equal(laptop.data.tasks.length, 0)

    phone.edit(withTasks(phone.data, [task()])) // «Deshacer»: mismo id, mismos datos
    phone.sync(server)
    laptop.sync(server)
    assert.equal(laptop.data.tasks.length, 1)
    assert.equal(laptop.data.tasks[0].title, 'Comentario de texto')
  })
})

// --- Robustez --------------------------------------------------------------

describe('robustez de la fusión', () => {
  it('aplicar dos veces lo mismo no cambia nada', () => {
    const { server, laptop } = pair([task()])
    const again = mergeRemote(laptop.data, laptop.meta, server.since(0), laptop.now)
    assert.equal(again.changed, false)
    assert.equal(again.data, laptop.data)
  })

  it('una fila remota ilegible se ignora sin tocar lo local', () => {
    const device = new Device('d', onboarded())
    device.edit(withTasks(device.data, [task()]))
    const broken: RemoteRow = {
      collection: 'tasks',
      id: 'task_1',
      data: { title: 42 },
      clocks: { title: formatClock({ wall: T0 * 2, counter: 0, node: 'x' }) },
      seq: 1,
    }
    // Sin `priority`, `status`... la versión fusionada sí sería válida (tiene
    // los campos locales), así que se prueba con un registro nuevo e incompleto.
    const orphan: RemoteRow = { ...broken, id: 'nueva', seq: 2 }
    const result = mergeRemote(device.data, device.meta, [orphan], device.now)
    assert.equal(result.rejected, 1)
    assert.equal(result.data.tasks.length, 1)
  })

  it('una colección desconocida se rechaza', () => {
    const device = new Device('d', onboarded())
    const row: RemoteRow = { collection: 'hack', id: 'x', data: {}, clocks: {}, seq: 1 }
    assert.equal(mergeRemote(device.data, device.meta, [row]).rejected, 1)
  })

  it('una subida confirmada sale de pendientes salvo que se reeditara entretanto', () => {
    const device = new Device('d', onboarded())
    device.edit(withTasks(device.data, [task()]))
    const batch = buildPush(device.data, device.meta, device.meta.dirty)
    device.edit(withTasks(device.data, [task({ title: 'Reeditada en vuelo' })]))
    const meta = acknowledge(device.meta, batch)
    assert.ok(meta.dirty.includes(keyOf('tasks', 'task_1')), 'la reedición sigue pendiente')
    assert.ok(!meta.dirty.includes('settings/settings'), 'lo demás queda confirmado')
  })

  it('al vincular, los ajustes de la cuenta ganan a los del dispositivo nuevo', () => {
    const server = new FakeServer()
    const first = new Device('a', onboarded())
    first.meta = stampAll(first.meta, first.data, { now: T0 })
    first.push(server)

    const second = new Device('b', {
      ...onboarded(),
      settings: { ...onboarded().settings, userName: 'Otro nombre' },
    })
    second.meta = stampAll(second.meta, second.data, { settingsClock: ZERO_CLOCK, now: T0 + 10 })
    second.sync(server)
    assert.equal(second.data.settings.userName, 'Álvaro')
  })

  it('regla de borrado: solo cuenta si nada se editó después', () => {
    assert.equal(isDeleted(true, { _deleted: 'b', title: 'a' }), true)
    assert.equal(isDeleted(true, { _deleted: 'a', title: 'b' }), false)
    assert.equal(isDeleted(false, { _deleted: 'b' }), false)
  })
})
