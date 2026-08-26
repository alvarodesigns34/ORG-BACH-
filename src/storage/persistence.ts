/**
 * Persistencia local.
 *
 * Toda la aplicación habla con este módulo, nunca con `localStorage`
 * directamente. Cuando llegue una base de datos con cuenta de usuario, basta
 * con reimplementar `load` y `save` aquí: el resto del código no se entera.
 *
 * `localStorage` es suficiente para un curso entero (los datos de un año
 * ocupan unas decenas de kilobytes, muy por debajo del límite de ~5 MB) y es
 * síncrono, lo que evita estados de carga en el arranque. IndexedDB solo
 * haría falta si se guardaran adjuntos.
 */

import { createEmptyData, SCHEMA_VERSION, STORAGE_KEY } from '../data/defaults.ts'
import { DEFAULT_SETTINGS } from '../data/defaults.ts'
import { parseTimerState, type TimerState } from '../domain/study.ts'
import type { AppData } from '../domain/types.ts'
import {
  parseActivity,
  parseCollection,
  parseEvent,
  parseExam,
  parseGoal,
  parseGrade,
  parseSession,
  parseSubject,
  parseTask,
  sanitizeSettings,
} from './validate.ts'

export type LoadOutcome =
  | { status: 'nuevo'; data: AppData }
  | { status: 'cargado'; data: AppData }
  | { status: 'recuperado'; data: AppData; error: string }

const COLLECTIONS = [
  'subjects',
  'tasks',
  'grades',
  'exams',
  'events',
  'sessions',
  'goals',
  'activity',
] as const

/** Validadores de cada colección, en el orden en que se aplican. */
const PARSERS = {
  subjects: parseSubject,
  tasks: parseTask,
  grades: parseGrade,
  exams: parseExam,
  events: parseEvent,
  sessions: parseSession,
  goals: parseGoal,
  activity: parseActivity,
} as const

export interface MigrateReport {
  data: AppData
  /** Registros descartados por venir rotos, por colección. */
  dropped: Partial<Record<keyof typeof PARSERS, number>>
  totalDropped: number
}

/**
 * Normaliza unos datos guardados y descarta lo que no se pueda usar.
 *
 * Hace dos trabajos a la vez. El primero es migrar: los campos añadidos en
 * versiones nuevas aparecen con su valor por defecto en lugar de llegar como
 * `undefined` y romper la interfaz a mitad de render. El segundo es validar
 * cada registro campo a campo, porque un archivo importado puede ser JSON
 * correcto y aun así traer notas sin escala o sesiones de duración imposible.
 *
 * Un registro roto se descarta solo él, no el archivo entero: perder dos
 * notas de ciento veinte es mejor que perder el curso completo.
 */
export function migrateWithReport(raw: unknown): MigrateReport {
  const base = createEmptyData()
  if (!raw || typeof raw !== 'object') return { data: base, dropped: {}, totalDropped: 0 }

  const input = raw as Record<string, unknown>
  const data: AppData = {
    ...base,
    settings: sanitizeSettings(input.settings, DEFAULT_SETTINGS),
    version: SCHEMA_VERSION,
  }

  const dropped: MigrateReport['dropped'] = {}
  let totalDropped = 0

  const addDropped = (key: keyof typeof PARSERS, count: number) => {
    if (count <= 0) return
    dropped[key] = (dropped[key] ?? 0) + count
    totalDropped += count
  }

  // El bucle recorre pares (colección, validador) ya emparejados en PARSERS.
  // El casteo es necesario porque TypeScript no puede correlacionar la clave
  // con el tipo concreto de cada validador al iterar.
  for (const key of COLLECTIONS) {
    const parse = PARSERS[key] as (item: unknown) => { id: string } | null
    const result = parseCollection(input[key], parse)
    ;(data[key] as unknown[]) = result.items
    addDropped(key, result.dropped)
  }

  // --- Integridad referencial ---
  // Cada registro ya es válido por sí solo, pero un JSON importado puede
  // apuntar a una asignatura o a una nota que no existe (o que se descartó
  // arriba). Una nota o un examen sin asignatura real no significan nada: se
  // descartan. Un vínculo opcional roto, en cambio, se limpia sin tirar el
  // registro entero — perder la tarea por una asignatura borrada sería
  // desproporcionado.
  const subjectIds = new Set(data.subjects.map((s) => s.id))

  const validGrades = data.grades.filter((g) => subjectIds.has(g.subjectId))
  addDropped('grades', data.grades.length - validGrades.length)
  data.grades = validGrades

  const validExams = data.exams.filter((e) => subjectIds.has(e.subjectId))
  addDropped('exams', data.exams.length - validExams.length)
  data.exams = validExams

  const gradeIds = new Set(data.grades.map((g) => g.id))
  data.exams = data.exams.map((e) =>
    e.gradeEntryId && !gradeIds.has(e.gradeEntryId) ? { ...e, gradeEntryId: undefined } : e,
  )

  data.tasks = data.tasks.map((t) =>
    t.subjectId && !subjectIds.has(t.subjectId) ? { ...t, subjectId: undefined } : t,
  )
  data.events = data.events.map((e) =>
    e.subjectId && !subjectIds.has(e.subjectId) ? { ...e, subjectId: undefined } : e,
  )
  data.sessions = data.sessions.map((s) =>
    s.subjectId && !subjectIds.has(s.subjectId) ? { ...s, subjectId: undefined } : s,
  )
  data.goals = data.goals.map((g) =>
    g.subjectId && !subjectIds.has(g.subjectId) ? { ...g, subjectId: undefined } : g,
  )

  return { data, dropped, totalDropped }
}

function migrate(raw: unknown): AppData {
  return migrateWithReport(raw).data
}

export function load(): LoadOutcome {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch (error) {
    // Modo privado o almacenamiento bloqueado: la app sigue funcionando en
    // memoria durante la sesión, pero hay que decirlo.
    return {
      status: 'recuperado',
      data: createEmptyData(),
      error: `No se puede acceder al almacenamiento del navegador (${describe(error)}). Los datos no se guardarán.`,
    }
  }

  if (!raw) return { status: 'nuevo', data: createEmptyData() }

  try {
    return { status: 'cargado', data: migrate(JSON.parse(raw)) }
  } catch (error) {
    return {
      status: 'recuperado',
      data: createEmptyData(),
      error: `Los datos guardados no se pudieron leer (${describe(error)}).`,
    }
  }
}

export function save(data: AppData): { ok: true } | { ok: false; error: string } {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return { ok: true }
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    return {
      ok: false,
      error: quota
        ? 'No queda espacio en el almacenamiento del navegador. Exporta tus datos y borra lo que ya no necesites.'
        : `No se pudieron guardar los cambios (${describe(error)}).`,
    }
  }
}

export function clear(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Si no se puede borrar, el siguiente guardado sobrescribirá igualmente.
  }
}

/**
 * Borra los datos académicos Y el temporizador en marcha.
 *
 * `clear()` a secas deja el temporizador vivo a propósito: importar una copia
 * no debería interrumpir una sesión de estudio que está corriendo, porque el
 * temporizador es estado de la sesión del navegador, no parte de la copia.
 * Pero "Empezar de cero" es justo lo contrario — significa CERO — así que
 * también se lleva el temporizador. Si no, un pomodoro en marcha sobrevive al
 * borrado y reaparece al volver a la pantalla de Estudio.
 */
export function resetAll(): void {
  clear()
  saveTimer(null)
}

// ---------------------------------------------------------------------------
// Temporizador en marcha
// ---------------------------------------------------------------------------

/**
 * El temporizador vive aparte de los datos académicos.
 *
 * Es estado efímero de una sesión concreta, no algo que tenga sentido exportar
 * ni migrar. Guardarlo, en cambio, sí importa: recargar la página sin querer a
 * los cuarenta minutos no debería perder la sesión.
 */
const TIMER_KEY = 'bachillerato-os:timer'

export function loadTimer(): TimerState | null {
  try {
    const raw = localStorage.getItem(TIMER_KEY)
    if (!raw) return null
    // La validación vive en el dominio, donde se puede probar sin navegador.
    return parseTimerState(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveTimer(state: TimerState | null): void {
  try {
    if (state) localStorage.setItem(TIMER_KEY, JSON.stringify(state))
    else localStorage.removeItem(TIMER_KEY)
  } catch {
    // Sin almacenamiento el temporizador sigue funcionando en memoria.
  }
}

// ---------------------------------------------------------------------------
// Exportación e importación
// ---------------------------------------------------------------------------

/** Copia completa en JSON, legible y con fecha, para no quedar encerrado. */
export function exportJSON(data: AppData): string {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2)
}

export type ImportResult =
  | {
      ok: true
      data: AppData
      /** Registros descartados por venir rotos. 0 en una copia sana. */
      dropped: number
      /** Resumen legible de lo descartado, o null si no se descartó nada. */
      warning: string | null
    }
  | { ok: false; error: string }

const COLLECTION_NAMES: Record<string, string> = {
  subjects: 'asignaturas',
  tasks: 'tareas',
  grades: 'notas',
  exams: 'exámenes',
  events: 'eventos',
  sessions: 'sesiones de estudio',
  goals: 'objetivos',
  activity: 'entradas de actividad',
}

export function importJSON(text: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'El archivo no contiene JSON válido.' }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'El archivo no tiene el formato esperado.' }
  }

  // Un JSON cualquiera pasaría la comprobación anterior: exigimos al menos una
  // colección conocida para no vaciar los datos del alumno por un archivo suelto.
  const hasKnownShape = COLLECTIONS.some((key) => Array.isArray((parsed as Record<string, unknown>)[key]))
  if (!hasKnownShape) {
    return { ok: false, error: 'El archivo no parece una copia de Bachillerato OS.' }
  }

  const report = migrateWithReport(parsed)

  // Importar sustituye TODO lo que había. Si el archivo traía registros
  // corruptos, el alumno tiene que enterarse en ese momento: descubrir tres
  // meses después que faltan notas, sin saber por qué, es mucho peor.
  const detail = Object.entries(report.dropped)
    .map(([key, count]) => `${count} ${COLLECTION_NAMES[key] ?? key}`)
    .join(', ')

  return {
    ok: true,
    data: report.data,
    dropped: report.totalDropped,
    warning:
      report.totalDropped === 0
        ? null
        : `Se descartaron ${report.totalDropped} registros con datos incompletos (${detail}). El resto se importó correctamente.`,
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
