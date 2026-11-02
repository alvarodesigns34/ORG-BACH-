/**
 * Núcleo de la sincronización: pura, sin red ni almacenamiento.
 *
 * Modelo
 * ------
 * Cada entidad del curso (una tarea, una nota...) es un REGISTRO identificado
 * por `colección/id`. Los ajustes son un registro más (`settings/settings`).
 * Cada campo de cada registro lleva un reloj HLC (ver `hlc.ts`): la marca de
 * su última edición.
 *
 * Reglas de fusión — las que garantizan que no se pierde nada:
 *
 * 1. Campo a campo, gana el reloj mayor. Si en el móvil cambias el título de
 *    una tarea y en el portátil su fecha, sin conexión, al sincronizar quedan
 *    los dos cambios. Solo dos ediciones del MISMO campo compiten, y gana la
 *    posterior.
 * 2. Borrar es un campo más (`_deleted`). Un registro está borrado solo si
 *    ningún otro campo se editó después del borrado: si un dispositivo borra
 *    una tarea mientras otro la sigue editando sin conexión, la edición
 *    resucita la tarea en lugar de perderse.
 * 3. El servidor aplica exactamente las mismas reglas (`sync_push`), así que
 *    el orden en que lleguen los cambios no altera el resultado.
 *
 * El tema (claro/oscuro) no se sincroniza: es una preferencia del dispositivo.
 */

import { DEFAULT_SETTINGS } from '../data/defaults.ts'
import type { AppData, Settings } from '../domain/types.ts'
import {
  parseActivity,
  parseEvent,
  parseExam,
  parseGoal,
  parseGrade,
  parseSession,
  parseSubject,
  parseTask,
  sanitizeSettings,
} from '../storage/validate.ts'
import { formatClock, receive, tick, type HlcState } from './hlc.ts'

export const ENTITY_COLLECTIONS = [
  'subjects',
  'tasks',
  'grades',
  'exams',
  'events',
  'sessions',
  'goals',
  'activity',
] as const

export type EntityCollection = (typeof ENTITY_COLLECTIONS)[number]
export type SyncCollection = EntityCollection | 'settings'

/** `colección/id`. */
export type RecordKey = string

export const SETTINGS_KEY: RecordKey = 'settings/settings'

/** Campos de ajustes que no viajan entre dispositivos. */
const LOCAL_ONLY_SETTINGS: (keyof Settings)[] = ['theme']

type Fields = Record<string, unknown>

export interface RecordMeta {
  /** Reloj de cada campo, incluido `_deleted`. */
  c: Record<string, string>
  /** Valor actual de `_deleted`. */
  d?: boolean
}

export interface SyncMeta {
  v: 1
  /** Cuenta a la que pertenecen estos relojes. */
  userId: string
  hlc: HlcState
  /** Último `seq` del servidor ya aplicado. */
  cursor: number
  records: Record<RecordKey, RecordMeta>
  /** Registros con cambios locales aún no confirmados por el servidor. */
  dirty: RecordKey[]
}

export interface RemoteRow {
  collection: string
  id: string
  data: Fields
  clocks: Record<string, string>
  seq: number
}

export interface PushRecord {
  collection: SyncCollection
  id: string
  data: Fields
  clocks: Record<string, string>
}

export function createMeta(userId: string, node: string): SyncMeta {
  return { v: 1, userId, hlc: { wall: 0, counter: 0, node }, cursor: 0, records: {}, dirty: [] }
}

// ---------------------------------------------------------------------------
// De AppData a registros
// ---------------------------------------------------------------------------

interface LocalRecord {
  collection: SyncCollection
  id: string
  value: Fields
}

export function keyOf(collection: string, id: string): RecordKey {
  return `${collection}/${id}`
}

function settingsFields(settings: Settings): Fields {
  const fields: Fields = { ...settings }
  for (const key of LOCAL_ONLY_SETTINGS) delete fields[key]
  return fields
}

export function recordsOf(data: AppData): Map<RecordKey, LocalRecord> {
  const map = new Map<RecordKey, LocalRecord>()
  map.set(SETTINGS_KEY, {
    collection: 'settings',
    id: 'settings',
    value: settingsFields(data.settings),
  })
  for (const collection of ENTITY_COLLECTIONS) {
    for (const item of data[collection] as unknown as Fields[]) {
      const id = item.id as string
      map.set(keyOf(collection, id), { collection, id, value: item })
    }
  }
  return map
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

function addDirty(dirty: RecordKey[], key: RecordKey) {
  if (!dirty.includes(key)) dirty.push(key)
}

/** Copia de trabajo: los registros que se tocan se clonan antes de cambiarlos. */
function cloneMeta(meta: SyncMeta): SyncMeta {
  return { ...meta, records: { ...meta.records }, dirty: [...meta.dirty] }
}

// ---------------------------------------------------------------------------
// Cambios locales
// ---------------------------------------------------------------------------

/**
 * Pone reloj a lo que ha cambiado entre dos estados y lo marca pendiente.
 *
 * Se llama cada vez que la aplicación guarda. El reductor conserva la
 * identidad de los objetos que no toca, así que comparar por referencia
 * descarta casi todo sin serializar nada.
 */
export function stampLocalChanges(
  meta: SyncMeta,
  prev: AppData,
  next: AppData,
  now: number = Date.now(),
): SyncMeta {
  if (prev === next) return meta
  const out = cloneMeta(meta)
  let hlc = out.hlc
  const stamp = () => {
    hlc = tick(hlc, now)
    return formatClock(hlc)
  }

  const before = recordsOf(prev)
  const after = recordsOf(next)

  for (const [key, record] of after) {
    const old = before.get(key)
    if (old && old.value === record.value) continue
    const current = out.records[key] ?? { c: {} }
    const clocks = { ...current.c }
    let touched = false

    const fields = new Set([...Object.keys(record.value), ...(old ? Object.keys(old.value) : [])])
    for (const field of fields) {
      if (old && same(old.value[field], record.value[field])) continue
      clocks[field] = stamp()
      touched = true
    }
    // Un registro nuevo (o que vuelve tras un borrado) se declara vivo.
    if (!old || current.d) {
      clocks._deleted = stamp()
      touched = true
    }
    if (!touched) continue
    out.records[key] = { c: clocks, d: false }
    addDirty(out.dirty, key)
  }

  for (const key of before.keys()) {
    if (after.has(key)) continue
    const current = out.records[key] ?? { c: {} }
    out.records[key] = { c: { ...current.c, _deleted: stamp() }, d: true }
    addDirty(out.dirty, key)
  }

  out.hlc = hlc
  return out
}

/**
 * Pone reloj a TODO el curso local. Se usa al vincular este dispositivo con
 * una cuenta por primera vez.
 *
 * `settingsClock` permite que los ajustes de la cuenta ganen a los de un
 * dispositivo recién llegado (`ZERO_CLOCK`) al combinar dos cursos.
 */
export function stampAll(
  meta: SyncMeta,
  data: AppData,
  options: { settingsClock?: string; now?: number } = {},
): SyncMeta {
  const out = cloneMeta(meta)
  let hlc = out.hlc
  const now = options.now ?? Date.now()
  for (const [key, record] of recordsOf(data)) {
    const clocks: Record<string, string> = {}
    for (const field of [...Object.keys(record.value), '_deleted']) {
      if (key === SETTINGS_KEY && options.settingsClock) {
        clocks[field] = options.settingsClock
      } else {
        hlc = tick(hlc, now)
        clocks[field] = formatClock(hlc)
      }
    }
    out.records[key] = { c: clocks, d: false }
    addDirty(out.dirty, key)
  }
  out.hlc = hlc
  return out
}

// ---------------------------------------------------------------------------
// Borrado
// ---------------------------------------------------------------------------

/** Regla 2: borrado solo si nada se editó después del borrado. */
export function isDeleted(deleted: unknown, clocks: Record<string, string>): boolean {
  if (deleted !== true) return false
  const at = clocks._deleted ?? ''
  return Object.entries(clocks).every(([field, clock]) => field === '_deleted' || clock <= at)
}

// ---------------------------------------------------------------------------
// Cambios remotos
// ---------------------------------------------------------------------------

const PARSERS: Record<EntityCollection, (raw: unknown) => { id: string } | null> = {
  subjects: parseSubject,
  tasks: parseTask,
  grades: parseGrade,
  exams: parseExam,
  events: parseEvent,
  sessions: parseSession,
  goals: parseGoal,
  activity: parseActivity,
}

function isEntityCollection(value: string): value is EntityCollection {
  return (ENTITY_COLLECTIONS as readonly string[]).includes(value)
}

export interface MergeResult {
  data: AppData
  meta: SyncMeta
  /** Algo visible ha cambiado en los datos. */
  changed: boolean
  /** Registros remotos que no se pudieron interpretar y se ignoraron. */
  rejected: number
}

/**
 * Aplica filas del servidor sobre el estado local.
 *
 * Determinista e idempotente: aplicar dos veces la misma fila no cambia nada,
 * y una fila que el servidor devuelve tras nuestra propia subida tampoco.
 */
export function mergeRemote(
  local: AppData,
  meta: SyncMeta,
  rows: RemoteRow[],
  now: number = Date.now(),
): MergeResult {
  const out = cloneMeta(meta)
  let hlc = out.hlc
  let changed = false
  let rejected = 0

  // Colecciones como mapas para sustituir en su sitio sin recorrer la lista
  // por cada fila.
  const collections = new Map<EntityCollection, Map<string, Fields>>()
  for (const name of ENTITY_COLLECTIONS) {
    collections.set(
      name,
      new Map((local[name] as unknown as Fields[]).map((item) => [item.id as string, item])),
    )
  }
  let settings: Settings = local.settings

  for (const row of rows) {
    if (out.cursor < row.seq) out.cursor = row.seq
    const isSettings = row.collection === 'settings' && row.id === 'settings'
    if (!isSettings && !isEntityCollection(row.collection)) {
      rejected++
      continue
    }
    const key = keyOf(row.collection, row.id)
    const localMeta = out.records[key] ?? { c: {} }
    const localValue: Fields | undefined = isSettings
      ? settingsFields(settings)
      : collections.get(row.collection as EntityCollection)!.get(row.id)

    const mergedClocks: Record<string, string> = {}
    const merged: Fields = {}
    let localNewer = false
    const fields = new Set([...Object.keys(row.clocks), ...Object.keys(localMeta.c)])
    for (const field of fields) {
      const remoteClock = row.clocks[field] ?? ''
      const localClock = localMeta.c[field] ?? ''
      if (remoteClock) hlc = receive(hlc, remoteClock, now)
      const takeLocal = localClock > remoteClock
      if (takeLocal) localNewer = true
      mergedClocks[field] = takeLocal ? localClock : remoteClock

      const source: Fields | undefined =
        field === '_deleted'
          ? takeLocal
            ? { _deleted: localMeta.d === true }
            : row.data
          : takeLocal && localValue
            ? localValue
            : row.data
      if (source && field in source && source[field] !== undefined) merged[field] = source[field]
    }

    const deleted = isDeleted(merged._deleted, mergedClocks)
    delete merged._deleted

    if (isSettings) {
      const next = sanitizeSettings({ ...merged, theme: settings.theme }, DEFAULT_SETTINGS)
      if (!same(settingsFields(next), settingsFields(settings))) {
        settings = { ...next, theme: settings.theme }
        changed = true
      }
    } else {
      const collection = collections.get(row.collection as EntityCollection)!
      if (deleted) {
        if (collection.delete(row.id)) changed = true
      } else {
        const parsed = PARSERS[row.collection as EntityCollection]({ ...merged, id: row.id })
        if (!parsed) {
          // Fila ilegible: se deja todo como estaba, relojes incluidos, para
          // que una versión correcta posterior pueda entrar.
          rejected++
          continue
        }
        const previous = collection.get(row.id)
        if (!previous || !same(previous, parsed)) {
          collection.set(row.id, parsed as unknown as Fields)
          changed = true
        }
      }
    }

    out.records[key] = { c: mergedClocks, d: deleted }
    if (localNewer) addDirty(out.dirty, key)
  }

  out.hlc = hlc
  if (!changed) return { data: local, meta: out, changed, rejected }

  const data: AppData = { ...local, settings }
  for (const name of ENTITY_COLLECTIONS) {
    const items = [...collections.get(name)!.values()]
    ;(data[name] as unknown as Fields[]) = items
  }
  // La actividad se muestra de la más reciente a la más antigua.
  data.activity = [...data.activity].sort((a, b) => b.at.localeCompare(a.at))
  return { data, meta: out, changed, rejected }
}

// ---------------------------------------------------------------------------
// Subida
// ---------------------------------------------------------------------------

/** Lo que hay que mandar al servidor para los registros pendientes. */
export function buildPush(data: AppData, meta: SyncMeta, keys: RecordKey[]): PushRecord[] {
  const records = recordsOf(data)
  const batch: PushRecord[] = []
  for (const key of keys) {
    const recordMeta = meta.records[key]
    if (!recordMeta) continue
    const slash = key.indexOf('/')
    const collection = key.slice(0, slash) as SyncCollection
    const id = key.slice(slash + 1)

    if (recordMeta.d) {
      batch.push({
        collection,
        id,
        data: { _deleted: true },
        clocks: { _deleted: recordMeta.c._deleted },
      })
      continue
    }
    const local = records.get(key)
    if (!local) continue
    const clocks: Record<string, string> = {}
    const payload: Fields = { _deleted: false }
    for (const [field, clock] of Object.entries(recordMeta.c)) {
      clocks[field] = clock
      if (field !== '_deleted' && local.value[field] !== undefined)
        payload[field] = local.value[field]
    }
    batch.push({ collection, id, data: payload, clocks })
  }
  return batch
}

/**
 * Quita de pendientes lo que el servidor ya confirmó, salvo que se haya vuelto
 * a editar mientras viajaba la subida.
 */
export function acknowledge(meta: SyncMeta, pushed: PushRecord[]): SyncMeta {
  const done = new Set<RecordKey>()
  for (const record of pushed) {
    const key = keyOf(record.collection, record.id)
    const current = meta.records[key]
    if (!current) continue
    const unchanged = Object.entries(record.clocks).every(([f, c]) => current.c[f] === c)
    if (unchanged) done.add(key)
  }
  if (done.size === 0) return meta
  return { ...meta, dirty: meta.dirty.filter((key) => !done.has(key)) }
}

/** ¿Tiene este curso algo que merezca conservarse? */
export function hasContent(data: AppData): boolean {
  return (
    data.settings.onboarded ||
    ENTITY_COLLECTIONS.some((name) => name !== 'activity' && data[name].length > 0)
  )
}
