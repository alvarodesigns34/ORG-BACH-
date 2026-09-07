/**
 * Pruebas de la carga desde el almacenamiento.
 *
 * Lo que se comprueba aquí es sobre todo qué pasa cuando lo guardado NO está
 * bien: es el único momento en que la aplicación puede destruir un curso
 * entero, y hasta ahora era también el único que no se probaba.
 *
 * `localStorage` no existe en Node, así que se sustituye por un doble en
 * memoria. Vale porque `persistence.ts` solo lo toca dentro de las funciones,
 * nunca al importar el módulo.
 */

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { STORAGE_KEY } from '../src/data/defaults.ts'
import { load, migrateWithReport, readBackup, resetAll, save } from '../src/storage/persistence.ts'
import { createEmptyData } from '../src/data/defaults.ts'

// --- Doble de localStorage -------------------------------------------------

function installStorage(): Map<string, string> {
  const store = new Map<string, string>()
  const fake: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: fake,
    configurable: true,
    writable: true,
  })
  return store
}

let store: Map<string, string>
beforeEach(() => {
  store = installStorage()
})

// --- Ayudantes -------------------------------------------------------------

const SUBJECT = {
  id: 'mat',
  name: 'Matemáticas I',
  color: 'indigo',
  weight: 4,
  schedule: [],
  categories: [],
  createdAt: '2026-09-01T00:00:00.000Z',
}

function put(value: unknown) {
  store.set(STORAGE_KEY, JSON.stringify(value))
}

// ---------------------------------------------------------------------------

describe('load', () => {
  it('sin nada guardado empieza de cero', () => {
    const outcome = load()
    assert.equal(outcome.status, 'nuevo')
    assert.equal(outcome.data.subjects.length, 0)
  })

  it('una copia sana se carga sin avisos', () => {
    put({ version: 1, subjects: [SUBJECT], tasks: [] })
    const outcome = load()
    assert.equal(outcome.status, 'cargado')
    if (outcome.status !== 'cargado') return
    assert.equal(outcome.warning, null)
    assert.equal(outcome.data.subjects.length, 1)
  })

  it('avisa de los registros que descarta al abrir', () => {
    // Antes esto pasaba en silencio: `load()` usaba `migrate()`, que tira el
    // informe, y el registro roto desaparecía en el siguiente guardado sin que
    // nadie se enterara. Importar sí avisaba; abrir la aplicación, no.
    put({
      subjects: [SUBJECT, { id: 'roto' }], // el segundo, sin nombre
      grades: [{ id: 'g1', subjectId: 'mat', score: 8 }], // sin maxScore
    })
    const outcome = load()
    assert.equal(outcome.status, 'cargado')
    if (outcome.status !== 'cargado') return
    assert.equal(outcome.data.subjects.length, 1)
    assert.match(outcome.warning ?? '', /asignaturas/)
    assert.match(outcome.warning ?? '', /notas/)
  })

  it('marca el alta hecha si hay asignaturas aunque onboarded no viniera', () => {
    put({ version: 1, subjects: [SUBJECT] })
    const outcome = load()
    assert.equal(outcome.status, 'cargado')
    if (outcome.status !== 'cargado') return
    assert.equal(outcome.data.settings.onboarded, true)
  })

  it('archiva los objetivos de una asignatura que no está', () => {
    put({
      version: 1,
      subjects: [SUBJECT],
      goals: [
        {
          id: 'g1',
          title: 'Subir Física a 9',
          kind: 'media',
          scope: 'trimestral',
          target: 9,
          subjectId: 'fis-desaparecida',
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    })
    const outcome = load()
    assert.equal(outcome.status, 'cargado')
    if (outcome.status !== 'cargado') return
    assert.equal(outcome.data.goals[0].archived, true)
    assert.equal(outcome.data.goals[0].subjectId, undefined)
  })
})

describe('load con datos ilegibles', () => {
  const CORRUPTO = '{"subjects": [ esto no es json'

  it('arranca en vacío y lo dice', () => {
    store.set(STORAGE_KEY, CORRUPTO)
    const outcome = load()
    assert.equal(outcome.status, 'recuperado')
    assert.equal(outcome.data.subjects.length, 0)
  })

  it('aparta el contenido original en vez de perderlo', () => {
    store.set(STORAGE_KEY, CORRUPTO)
    load()
    // Es lo único que queda del curso: ilegible, pero quizá recuperable a
    // mano. Arrancar en vacío no puede ser lo último que le pase.
    assert.equal(readBackup(), CORRUPTO)
  })

  it('no toca la clave original al leerla', () => {
    store.set(STORAGE_KEY, CORRUPTO)
    load()
    assert.equal(store.get(STORAGE_KEY), CORRUPTO)
  })
})

describe('save', () => {
  it('escribe y se puede volver a leer', () => {
    const data = createEmptyData()
    data.settings.userName = 'Álvaro'
    assert.deepEqual(save(data), { ok: true })

    const outcome = load()
    assert.equal(outcome.status, 'cargado')
    assert.equal(outcome.data.settings.userName, 'Álvaro')
  })

  it('informa del error en vez de lanzar cuando no se puede guardar', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        ...globalThis.localStorage,
        setItem: () => {
          throw new DOMException('lleno', 'QuotaExceededError')
        },
      },
      configurable: true,
      writable: true,
    })
    const result = save(createEmptyData())
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.match(result.error, /espacio/)
  })
})

describe('resetAll', () => {
  it('deja un curso vacío en disco, no borra la clave', () => {
    put({ version: 1, subjects: [SUBJECT] })
    resetAll()
    assert.ok(store.has(STORAGE_KEY))
    const outcome = load()
    assert.equal(outcome.status, 'cargado')
    if (outcome.status !== 'cargado') return
    assert.equal(outcome.data.subjects.length, 0)
  })
})

describe('migrateWithReport avisa si una colección no es una lista', () => {
  it('subjects como objeto cuenta como descarte', () => {
    const report = migrateWithReport({ version: 1, subjects: { no: 'lista' } })
    assert.ok((report.dropped.subjects ?? 0) >= 1)
  })
})
