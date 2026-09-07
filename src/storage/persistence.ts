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
  /** `warning` != null cuando la carga descartó registros rotos. */
  | { status: 'cargado'; data: AppData; warning: string | null }
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
  const gradeById = new Map(data.grades.map((g) => [g.id, g]))
  data.exams = data.exams.map((e) => {
    if (!e.gradeEntryId) return e
    const grade = gradeById.get(e.gradeEntryId)
    // El enlace solo vale si la nota existe Y es de la misma asignatura.
    if (!grade || !gradeIds.has(e.gradeEntryId) || grade.subjectId !== e.subjectId) {
      return { ...e, gradeEntryId: undefined }
    }
    return e
  })

  // Notas cuya categoría ya no existe en esa asignatura: se sueltan, igual
  // que al editar la asignatura en el reductor.
  const categoriesBySubject = new Map(
    data.subjects.map((s) => [s.id, new Set(s.categories.map((c) => c.id))]),
  )
  data.grades = data.grades.map((g) => {
    if (!g.categoryId) return g
    const live = categoriesBySubject.get(g.subjectId)
    return live && live.has(g.categoryId) ? g : { ...g, categoryId: null }
  })

  data.tasks = data.tasks.map((t) =>
    t.subjectId && !subjectIds.has(t.subjectId) ? { ...t, subjectId: undefined } : t,
  )
  data.events = data.events.map((e) =>
    e.subjectId && !subjectIds.has(e.subjectId) ? { ...e, subjectId: undefined } : e,
  )
  data.sessions = data.sessions.map((s) =>
    s.subjectId && !subjectIds.has(s.subjectId) ? { ...s, subjectId: undefined } : s,
  )
  // Sin asignatura el objetivo deja de ser el mismo: se archiva, igual que
  // al borrar la asignatura desde la interfaz. Desvincularlo y dejarlo activo
  // lo convertía en un objetivo global falso.
  data.goals = data.goals.map((g) =>
    g.subjectId && !subjectIds.has(g.subjectId)
      ? { ...g, subjectId: undefined, archived: true }
      : g,
  )
  data.activity = data.activity.map((a) =>
    a.subjectId && !subjectIds.has(a.subjectId) ? { ...a, subjectId: undefined } : a,
  )

  // Un archivo (o un JSON a medias) con asignaturas no puede dejar la app en
  // el alta: terminarla añadiría otro juego de materias encima.
  if (!data.settings.onboarded && data.subjects.length > 0) {
    data.settings = { ...data.settings, onboarded: true }
  }

  return { data, dropped, totalDropped }
}

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

/** «2 asignaturas, 1 nota» — el detalle de lo descartado, en cristiano. */
function describeDropped(dropped: MigrateReport['dropped']): string {
  return Object.entries(dropped)
    .map(([key, count]) => `${count} ${COLLECTION_NAMES[key] ?? key}`)
    .join(', ')
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
    // Al arrancar se valida igual que al importar. Antes se usaba `migrate()`,
    // que tira el informe: un registro que el validador ya no acepta
    // desaparecía en el siguiente guardado sin que nadie se enterara. Importar
    // sí avisaba; abrir la aplicación, no.
    const report = migrateWithReport(JSON.parse(raw))
    return {
      status: 'cargado',
      data: report.data,
      warning:
        report.totalDropped === 0
          ? null
          : `Al abrir se descartaron ${report.totalDropped} registros con datos incompletos (${describeDropped(report.dropped)}). El resto se ha cargado con normalidad.`,
    }
  } catch (error) {
    // El contenido ilegible se aparta antes de seguir. No se puede leer, pero
    // tampoco se tira: es lo único que queda del curso y quizá se pueda
    // rescatar a mano. Ver `readBackup()`.
    backupRaw(raw)
    return {
      status: 'recuperado',
      data: createEmptyData(),
      error: `Los datos guardados no se pudieron leer (${describe(error)}). Se ha guardado una copia del contenido original por si se puede recuperar; no se sobrescribirá hasta que hagas algún cambio.`,
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

/** Escribe un curso vacío. Las otras pestañas reciben un `storage` con valor. */
export function saveEmpty(): { ok: true } | { ok: false; error: string } {
  return save(createEmptyData())
}

// ---------------------------------------------------------------------------
// Copia del contenido ilegible
// ---------------------------------------------------------------------------

/**
 * Dónde se aparta un contenido que no se pudo interpretar.
 *
 * No es una copia de seguridad periódica: solo se escribe cuando el JSON
 * guardado resulta ilegible al arrancar, y precisamente para que el arranque
 * en vacío no sea lo último que le pasa a esos datos.
 */
const BACKUP_KEY = `${STORAGE_KEY}.bak`

function backupRaw(raw: string): void {
  try {
    localStorage.setItem(BACKUP_KEY, raw)
  } catch {
    // Si no hay hueco para la copia, al menos el original sigue en su clave:
    // el guardado tampoco lo pisará mientras no haya cambios.
  }
}

/** Contenido apartado por ilegible, si lo hay. Para recuperarlo a mano. */
export function readBackup(): string | null {
  try {
    return localStorage.getItem(BACKUP_KEY)
  } catch {
    return null
  }
}

export function clearBackup(): void {
  try {
    localStorage.removeItem(BACKUP_KEY)
  } catch {
    // Sin almacenamiento no hay copia que borrar.
  }
}

/**
 * Borra los datos académicos Y el temporizador en marcha.
 *
 * Se escribe un curso vacío en vez de `removeItem`: un `storage` con
 * `newValue === null` lo ignoraba la otra pestaña, y el siguiente tecleo
 * restauraba el curso borrado.
 */
export function resetAll(): void {
  saveEmpty()
  clearTimer()
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

/** La pestaña actual también tiene que enterarse de un reset del temporizador. */
export const TIMER_CLEARED_EVENT = 'bachillerato-os:timer-cleared'

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

export function saveTimer(state: TimerState | null): { ok: true } | { ok: false; error: string } {
  try {
    if (state) localStorage.setItem(TIMER_KEY, JSON.stringify(state))
    else localStorage.removeItem(TIMER_KEY)
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: `No se pudo guardar el temporizador (${describe(error)}). Si recargas ahora, se pierde la sesión.`,
    }
  }
}

export function clearTimer(): void {
  saveTimer(null)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TIMER_CLEARED_EVENT))
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

  // Importar SUSTITUYE el curso entero, así que el listón para aceptar un
  // archivo tiene que ser alto. Antes bastaba con que trajera una colección
  // conocida, aunque estuviera vacía: un `{"tasks": []}` cualquiera vaciaba
  // los datos del alumno. Se acepta si es una copia de la aplicación (trae
  // versión y ajustes) o si al menos trae contenido real que importar.
  const input = parsed as Record<string, unknown>
  const looksLikeExport =
    typeof input.version === 'number' && !!input.settings && typeof input.settings === 'object'
  const hasContent = COLLECTIONS.some((key) => {
    const value = input[key]
    return Array.isArray(value) && value.length > 0
  })

  if (!looksLikeExport && !hasContent) {
    return {
      ok: false,
      error:
        'El archivo no parece una copia de Bachillerato OS, o no trae ningún dato que importar.',
    }
  }

  const report = migrateWithReport(parsed)

  // Importar sustituye TODO lo que había. Si el archivo traía registros
  // corruptos, el alumno tiene que enterarse en ese momento: descubrir tres
  // meses después que faltan notas, sin saber por qué, es mucho peor.
  const detail = describeDropped(report.dropped)

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
