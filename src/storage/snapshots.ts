/**
 * Copias automáticas en el propio dispositivo.
 *
 * Una copia al día (se guardan las 7 últimas) y otra justo antes de cada
 * operación que sustituye el curso entero: importar, empezar de cero o
 * restaurar una copia (se guardan las 5 últimas). Van en IndexedDB, aparte del
 * `localStorage` donde vive el curso: si algo estropea uno, el otro sigue.
 *
 * Lo que NO cubre, y por eso sigue haciendo falta exportar o tener cuenta:
 * perder o restablecer el iPad, o borrar los datos de la web en Ajustes de
 * Safari, que se lleva las dos cosas a la vez.
 */

import type { AppData } from '../domain/types.ts'
import { today as todayISO } from '../domain/dates.ts'

const DB = 'orbita-copias'
const STORE = 'copias'
const KEEP_DAILY = 7
const KEEP_MANUAL = 5

export type SnapshotReason = 'diaria' | 'antes-importar' | 'antes-borrar' | 'antes-restaurar'

export interface SnapshotMeta {
  id: string
  /** ms */
  at: number
  reason: SnapshotReason
  /** Para la diaria: el día. */
  day?: string
  counts: { subjects: number; tasks: number; grades: number; exams: number; sessions: number }
}

interface Snapshot extends SnapshotMeta {
  data: AppData
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'))
      return
    }
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req ? req.result : undefined)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

const countsOf = (data: AppData): SnapshotMeta['counts'] => ({
  subjects: data.subjects.length,
  tasks: data.tasks.length,
  grades: data.grades.length,
  exams: data.exams.length,
  sessions: data.sessions.length,
})

/** Un curso vacío no merece copia: no hay nada que recuperar. */
const isEmpty = (data: AppData) =>
  data.subjects.length +
    data.tasks.length +
    data.grades.length +
    data.exams.length +
    data.events.length +
    data.goals.length +
    data.sessions.length ===
  0

export async function clearSnapshots(): Promise<void> {
  lastDaily = null
  checkingDaily = null
  try {
    await run('readwrite', (store) => {
      store.clear()
    })
  } catch {
    // Si IndexedDB no está disponible no hay copias que borrar.
  }
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  try {
    const all = ((await run<Snapshot[]>('readonly', (s) => s.getAll() as IDBRequest<Snapshot[]>)) ?? []) as Snapshot[]
    return all
      .map(({ data: _data, ...meta }) => meta)
      .sort((a, b) => b.at - a.at)
  } catch {
    return []
  }
}

export async function readSnapshot(id: string): Promise<AppData | null> {
  try {
    const snap = (await run<Snapshot>('readonly', (s) => s.get(id) as IDBRequest<Snapshot>)) as Snapshot | undefined
    return snap?.data ?? null
  } catch {
    return null
  }
}

async function prune(): Promise<void> {
  const all = await listSnapshots()
  const daily = all.filter((s) => s.reason === 'diaria')
  const manual = all.filter((s) => s.reason !== 'diaria')
  const drop = [...daily.slice(KEEP_DAILY), ...manual.slice(KEEP_MANUAL)]
  if (drop.length === 0) return
  await run('readwrite', (store) => {
    for (const s of drop) store.delete(s.id)
  })
}

/** Guarda una copia ahora. No lanza: una copia que falla no debe romper nada. */
export async function saveSnapshot(data: AppData, reason: SnapshotReason): Promise<boolean> {
  if (isEmpty(data)) return false
  try {
    const at = Date.now()
    const day = todayISO()
    const snap: Snapshot = {
      id: reason === 'diaria' ? `diaria-${day}` : `${reason}-${at}`,
      at,
      reason,
      day: reason === 'diaria' ? day : undefined,
      counts: countsOf(data),
      // Copia profunda: lo guardado no debe cambiar si el estado cambia.
      data: JSON.parse(JSON.stringify(data)) as AppData,
    }
    await run('readwrite', (store) => store.put(snap))
    await prune()
    return true
  } catch {
    return false
  }
}

let lastDaily: string | null = null
let checkingDaily: string | null = null

/** La copia del día, si aún no está hecha. Barata de llamar a menudo. */
export async function dailySnapshot(data: AppData): Promise<void> {
  const day = todayISO()
  if (lastDaily === day || checkingDaily === day || isEmpty(data)) return
  checkingDaily = day
  try {
    const all = await listSnapshots()
    if (all.some((s) => s.reason === 'diaria' && s.day === day) || await saveSnapshot(data, 'diaria')) {
      lastDaily = day
    }
  } finally {
    if (checkingDaily === day) checkingDaily = null
  }
}

/**
 * Pide al navegador que no borre el almacenamiento de la app cuando ande
 * justo de espacio. En la app instalada en iPad, Safari ya no lo borra por
 * inactividad; esto añade la protección frente a la limpieza por espacio
 * donde el navegador la admite.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
