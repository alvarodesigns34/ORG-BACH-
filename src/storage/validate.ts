/**
 * Validación de datos importados.
 *
 * Comprobar solo que existan las colecciones no basta: un JSON puede ser
 * sintácticamente correcto y traer registros incompletos que revientan la
 * interfaz mucho después, cuando ya se han sustituido los datos buenos. Aquí
 * cada entidad se revisa campo a campo antes de entrar.
 *
 * El criterio es descartar el registro roto, no el archivo entero: si de
 * ciento veinte notas hay dos corruptas, es mejor recuperar ciento dieciocho
 * y decir cuántas se han quedado fuera que perderlo todo.
 */

import { today as todayISO } from '../domain/dates.ts'
import { deriveShortName } from '../domain/palette.ts'
import { DEFAULT_POMODORO } from '../domain/study.ts'
import type {
  ActivityEntry,
  CalendarEvent,
  Exam,
  Goal,
  GradeCategory,
  GradeEntry,
  ScheduleSlot,
  Settings,
  StudySession,
  Subject,
  Subtask,
  Task,
  TermId,
} from '../domain/types.ts'

// ---------------------------------------------------------------------------
// Comprobaciones básicas
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

const isRow = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isText = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** 'YYYY-MM-DD' con valores de calendario reales, no solo la forma. */
const isDay = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1) return false
  return d <= new Date(y, m, 0).getDate()
}

const isTime = (v: unknown): v is string =>
  typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)

const isStamp = (v: unknown): v is string =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v))

const oneOf =
  <T extends string>(...allowed: T[]) =>
  (v: unknown): v is T =>
    typeof v === 'string' && (allowed as string[]).includes(v)

const isTerm = oneOf<TermId>('T1', 'T2', 'T3')

/** Texto opcional: puede faltar, pero si viene tiene que ser texto. */
const optText = (v: unknown) => (isText(v) ? v : undefined)
const optDay = (v: unknown) => (isDay(v) ? v : undefined)
const optTime = (v: unknown) => (isTime(v) ? v : undefined)
const optNum = (v: unknown) => (isNum(v) ? v : undefined)
const optId = (v: unknown) => (isId(v) ? v : undefined)

/** Número dentro de un rango, con valor de respaldo si viene fuera o roto. */
const clampNum = (v: unknown, min: number, max: number, fallback: number): number => {
  if (!isNum(v)) return fallback
  return Math.min(max, Math.max(min, v))
}

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

const SUBJECT_COLORS = [
  'sky', 'sage', 'amber', 'terracotta', 'plum',
  'teal', 'indigo', 'moss', 'clay', 'slate',
] as const

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function parseCategory(raw: unknown): GradeCategory | null {
  if (!isRow(raw) || !isId(raw.id) || !isText(raw.name)) return null
  return { id: raw.id, name: raw.name, weight: clampNum(raw.weight, 0, 100, 0) }
}

function parseSlot(raw: unknown): ScheduleSlot | null {
  if (!isRow(raw) || !isId(raw.id) || !isTime(raw.start) || !isTime(raw.end)) return null
  const day = raw.day
  if (!isNum(day) || day < 0 || day > 6) return null
  // Una franja que termina antes de empezar dibuja una duración negativa.
  if (raw.end < raw.start) return null
  return {
    id: raw.id,
    day: day as ScheduleSlot['day'],
    start: raw.start,
    end: raw.end,
    room: optText(raw.room),
  }
}

export function parseSubject(raw: unknown): Subject | null {
  if (!isRow(raw) || !isId(raw.id) || !isText(raw.name) || !raw.name.trim()) return null
  return {
    id: raw.id,
    name: raw.name,
    // Sin abreviatura, o con una vacía, se deriva del nombre: igual que al
    // crear una asignatura desde la interfaz, para que ninguna insignia se
    // quede en blanco. `optText('')` es `''`, y `'' ?? derive` se queda en `''`.
    shortName: optText(raw.shortName)?.trim() || deriveShortName(raw.name),
    color: (SUBJECT_COLORS as readonly string[]).includes(raw.color as string)
      ? (raw.color as Subject['color'])
      : 'slate',
    teacher: optText(raw.teacher),
    room: optText(raw.room),
    weight: clampNum(raw.weight, 0, 100, 1),
    targetGrade: isNum(raw.targetGrade) && raw.targetGrade >= 0 ? raw.targetGrade : undefined,
    schedule: uniqueById(
      Array.isArray(raw.schedule)
        ? raw.schedule.map(parseSlot).filter((s): s is ScheduleSlot => s !== null)
        : [],
    ),
    categories: uniqueById(
      Array.isArray(raw.categories)
        ? raw.categories.map(parseCategory).filter((c): c is GradeCategory => c !== null)
        : [],
    ),
    createdAt: isStamp(raw.createdAt) ? raw.createdAt : new Date().toISOString(),
    archived: raw.archived === true,
    demo: raw.demo === true,
  }
}

function parseSubtask(raw: unknown): Subtask | null {
  if (!isRow(raw) || !isId(raw.id) || !isText(raw.title)) return null
  return { id: raw.id, title: raw.title, done: raw.done === true }
}

export function parseTask(raw: unknown): Task | null {
  if (!isRow(raw) || !isId(raw.id) || !isText(raw.title) || !raw.title.trim()) return null
  const dueDate = optDay(raw.dueDate)
  const status = oneOf('pendiente', 'en_progreso', 'completada')(raw.status) ? raw.status : 'pendiente'
  const stamp = isStamp(raw.completedAt) ? raw.completedAt : undefined
  return {
    id: raw.id,
    title: raw.title,
    description: optText(raw.description),
    subjectId: optId(raw.subjectId),
    dueDate,
    // Una hora sin fecha no significa nada: se descarta con ella.
    dueTime: dueDate ? optTime(raw.dueTime) : undefined,
    priority: oneOf('baja', 'media', 'alta', 'urgente')(raw.priority) ? raw.priority : 'media',
    status,
    estimatedMinutes: optNum(raw.estimatedMinutes),
    tags: Array.isArray(raw.tags) ? raw.tags.filter(isText) : [],
    subtasks: uniqueById(
      Array.isArray(raw.subtasks)
        ? raw.subtasks.map(parseSubtask).filter((s): s is Subtask => s !== null)
        : [],
    ),
    createdAt: isStamp(raw.createdAt) ? raw.createdAt : new Date().toISOString(),
    // `completedAt` es consecuencia del estado. Una tarea marcada completada
    // sin sello no entra en los objetivos de tareas; un sello en una pendiente
    // cuenta trabajo que no está hecho.
    completedAt: status === 'completada' ? (stamp ?? new Date().toISOString()) : undefined,
    demo: raw.demo === true,
  }
}

export function parseGrade(raw: unknown): GradeEntry | null {
  // Sin asignatura, escala o puntuación no hay nota que calcular: se descarta
  // en lugar de dejar entrar un registro que falsearía la media.
  if (!isRow(raw) || !isId(raw.id) || !isId(raw.subjectId)) return null
  if (!isNum(raw.score) || !isNum(raw.maxScore) || raw.maxScore <= 0) return null
  // Una nota fuera de su propia escala —un 17/10, o un −3— es imposible. No se
  // recorta, porque recortarla inventaría una nota que nadie sacó. Antes el
  // negativo sí se recortaba a 0, lo que era incoherente con rechazar el 17.
  if (raw.score > raw.maxScore || raw.score < 0) return null

  return {
    id: raw.id,
    subjectId: raw.subjectId,
    categoryId: isId(raw.categoryId) ? raw.categoryId : null,
    term: isTerm(raw.term) ? raw.term : 'T1',
    name: isText(raw.name) && raw.name.trim() ? raw.name : 'Nota sin nombre',
    kind: oneOf('examen', 'trabajo', 'practica', 'oral', 'participacion', 'otro')(raw.kind)
      ? raw.kind
      : 'otro',
    score: raw.score,
    maxScore: raw.maxScore,
    weight: clampNum(raw.weight, 0, 1000, 0),
    // Una fecha imposible (el 31 de febrero) no tira la nota entera: la nota
    // sigue teniendo asignatura y puntuación, que es lo que entra en la media.
    // Se sustituye por hoy en día LOCAL, no por el `slice` del ISO en UTC:
    // importar de madrugada estampaba el día anterior.
    date: isDay(raw.date) ? raw.date : todayISO(),
    comment: optText(raw.comment),
    createdAt: isStamp(raw.createdAt) ? raw.createdAt : new Date().toISOString(),
    demo: raw.demo === true,
  }
}

export function parseExam(raw: unknown): Exam | null {
  if (!isRow(raw) || !isId(raw.id) || !isId(raw.subjectId) || !isDay(raw.date)) return null
  return {
    id: raw.id,
    subjectId: raw.subjectId,
    title: isText(raw.title) && raw.title.trim() ? raw.title : 'Examen',
    date: raw.date,
    time: optTime(raw.time),
    topics: optText(raw.topics),
    weight: optNum(raw.weight),
    term: isTerm(raw.term) ? raw.term : 'T1',
    gradeEntryId: optId(raw.gradeEntryId),
    createdAt: isStamp(raw.createdAt) ? raw.createdAt : new Date().toISOString(),
    demo: raw.demo === true,
  }
}

export function parseEvent(raw: unknown): CalendarEvent | null {
  if (!isRow(raw) || !isId(raw.id) || !isDay(raw.date)) return null
  const startTime = optTime(raw.startTime)
  const endTime = optTime(raw.endTime)
  return {
    id: raw.id,
    title: isText(raw.title) && raw.title.trim() ? raw.title : 'Evento',
    date: raw.date,
    startTime,
    // Un fin anterior al inicio es imposible: se deja el evento sin hora de
    // fin en vez de dibujar una duración negativa.
    endTime: startTime && endTime && endTime < startTime ? undefined : endTime,
    subjectId: optId(raw.subjectId),
    kind: oneOf('entrega', 'personal', 'clase', 'otro')(raw.kind) ? raw.kind : 'otro',
    notes: optText(raw.notes),
    createdAt: isStamp(raw.createdAt) ? raw.createdAt : new Date().toISOString(),
    demo: raw.demo === true,
  }
}

export function parseSession(raw: unknown): StudySession | null {
  if (!isRow(raw) || !isId(raw.id) || !isStamp(raw.startedAt)) return null
  if (!isNum(raw.minutes) || raw.minutes <= 0) return null
  return {
    id: raw.id,
    subjectId: optId(raw.subjectId),
    topic: optText(raw.topic),
    startedAt: raw.startedAt,
    // Tope de 24 h: una sesión más larga es un dato corrupto, y colarla
    // dispararía todas las estadísticas de estudio.
    minutes: Math.min(raw.minutes, 24 * 60),
    mode: raw.mode === 'pomodoro' ? 'pomodoro' : 'libre',
    notes: optText(raw.notes),
    demo: raw.demo === true,
  }
}

export function parseGoal(raw: unknown): Goal | null {
  if (!isRow(raw) || !isId(raw.id)) return null
  if (!isNum(raw.target) || raw.target <= 0) return null
  return {
    id: raw.id,
    title: isText(raw.title) && raw.title.trim() ? raw.title : 'Objetivo',
    kind: oneOf('media', 'horas_estudio', 'tareas', 'manual')(raw.kind) ? raw.kind : 'manual',
    scope: oneOf('diario', 'semanal', 'trimestral', 'anual')(raw.scope) ? raw.scope : 'semanal',
    target: raw.target,
    manualProgress: optNum(raw.manualProgress),
    subjectId: optId(raw.subjectId),
    term: isTerm(raw.term) ? raw.term : undefined,
    createdAt: isStamp(raw.createdAt) ? raw.createdAt : new Date().toISOString(),
    archived: raw.archived === true,
    demo: raw.demo === true,
  }
}

export function parseActivity(raw: unknown): ActivityEntry | null {
  if (!isRow(raw) || !isId(raw.id) || !isText(raw.text) || !isStamp(raw.at)) return null
  return {
    id: raw.id,
    kind: oneOf(
      'tarea_creada',
      'tarea_completada',
      'nota_anadida',
      'examen_creado',
      'estudio_registrado',
      'asignatura_creada',
      'objetivo_creado',
    )(raw.kind)
      ? raw.kind
      : 'tarea_creada',
    at: raw.at,
    text: raw.text,
    subjectId: optId(raw.subjectId),
  }
}

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

/** Recorta los ajustes a valores utilizables sin descartar los válidos. */
export function sanitizeSettings(raw: unknown, defaults: Settings): Settings {
  if (!isRow(raw)) return { ...defaults, gradeScale: { ...defaults.gradeScale } }
  const scale = isRow(raw.gradeScale) ? raw.gradeScale : {}

  const max = clampNum(scale.max, 1, 1000, defaults.gradeScale.max)
  return {
    ...defaults,
    userName: optText(raw.userName) ?? defaults.userName,
    course: optText(raw.course) ?? defaults.course,
    academicYear: optText(raw.academicYear) ?? defaults.academicYear,
    theme: oneOf('light', 'dark', 'system')(raw.theme) ? raw.theme : defaults.theme,
    weekStartsOn: raw.weekStartsOn === 0 ? (0 as const) : (1 as const),
    gradeScale: {
      max,
      // El aprobado no puede quedar por encima del máximo de la escala.
      pass: clampNum(scale.pass, 0, max, Math.min(defaults.gradeScale.pass, max)),
      decimals: Math.round(clampNum(scale.decimals, 0, 4, defaults.gradeScale.decimals)),
    },
    averageMode: raw.averageMode === 'ponderada' ? 'ponderada' : 'aritmetica',
    activeTerm: isTerm(raw.activeTerm) ? raw.activeTerm : defaults.activeTerm,
    alertsEnabled: raw.alertsEnabled !== false,
    examAlertDays: Math.round(clampNum(raw.examAlertDays, 1, 365, defaults.examAlertDays)),
    pomodoroMinutes: Math.round(
      clampNum(raw.pomodoroMinutes, 1, 240, DEFAULT_POMODORO.workMinutes),
    ),
    pomodoroBreakMinutes: Math.round(
      clampNum(raw.pomodoroBreakMinutes, 1, 120, DEFAULT_POMODORO.breakMinutes),
    ),
    pomodoroSound: raw.pomodoroSound !== false,
    onboarded: raw.onboarded === true,
  }
}

// ---------------------------------------------------------------------------
// Colecciones
// ---------------------------------------------------------------------------

export interface CollectionResult<T> {
  items: T[]
  /** Registros que venían rotos y no han entrado. */
  dropped: number
}

/** Aplica un validador a una colección y cuenta lo que se ha descartado. */
export function parseCollection<T extends { id: string }>(
  raw: unknown,
  parse: (item: unknown) => T | null,
): CollectionResult<T> {
  // Ausente o null: no había colección. No es un descarte, es un vacío.
  if (raw == null) return { items: [], dropped: 0 }
  // Presente pero no es una lista: el archivo está mal. Contarlo como
  // descarte hace que load/import avisen, en vez de abrir un curso vacío
  // y cementarlo en el siguiente guardado.
  if (!Array.isArray(raw)) return { items: [], dropped: 1 }
  const items: T[] = []
  let dropped = 0
  const seen = new Set<string>()

  for (const entry of raw) {
    const parsed = parse(entry)
    if (!parsed) {
      dropped += 1
      continue
    }
    // Los identificadores repetidos rompen las claves de React y hacen que
    // editar un registro cambie otro.
    const { id } = parsed
    if (seen.has(id)) {
      dropped += 1
      continue
    }
    seen.add(id)
    items.push(parsed)
  }

  return { items, dropped }
}
