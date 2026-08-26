/**
 * Modelo de datos de la aplicacion.
 *
 * Reglas que sostienen todo lo demas:
 * - Las fechas se guardan como 'YYYY-MM-DD' (dia natural, sin zona horaria) y
 *   las marcas de tiempo como ISO completo. Mezclarlas causa errores de un dia.
 * - Cada entidad creada por los datos de ejemplo lleva `demo: true`, para poder
 *   borrarlos con precision sin tocar nada real.
 * - Ninguna entidad guarda valores calculados (medias, progreso): se derivan.
 */

export type ID = string

/** Dia natural en formato 'YYYY-MM-DD'. */
export type DateISO = string

/** Marca de tiempo completa en formato ISO. */
export type TimestampISO = string

/** Hora local en formato 'HH:MM'. */
export type TimeHM = string

// ---------------------------------------------------------------------------
// Evaluaciones
// ---------------------------------------------------------------------------

export type TermId = 'T1' | 'T2' | 'T3'

export const TERMS: { id: TermId; name: string; short: string }[] = [
  { id: 'T1', name: '1.ª evaluación', short: '1.ª ev.' },
  { id: 'T2', name: '2.ª evaluación', short: '2.ª ev.' },
  { id: 'T3', name: '3.ª evaluación', short: '3.ª ev.' },
]

// ---------------------------------------------------------------------------
// Asignaturas
// ---------------------------------------------------------------------------

export type SubjectColor =
  | 'sky'
  | 'sage'
  | 'amber'
  | 'terracotta'
  | 'plum'
  | 'teal'
  | 'indigo'
  | 'moss'
  | 'clay'
  | 'slate'

/** Una franja del horario semanal. `day` sigue a Date#getDay(): 1 = lunes. */
export interface ScheduleSlot {
  id: ID
  day: 1 | 2 | 3 | 4 | 5 | 6 | 0
  start: TimeHM
  end: TimeHM
  room?: string
}

/**
 * Categoria de evaluacion dentro de una asignatura (Examenes 70 %,
 * Trabajos 20 %...). Cada asignatura define las suyas: no se asume que
 * todas evaluen igual.
 */
export interface GradeCategory {
  id: ID
  name: string
  /** Peso de la categoria dentro de la asignatura, en tanto por ciento. */
  weight: number
}

export interface Subject {
  id: ID
  name: string
  /** Abreviatura para espacios estrechos. Si falta se deriva del nombre. */
  shortName?: string
  color: SubjectColor
  teacher?: string
  room?: string
  /** Peso de la asignatura en la media global ponderada (horas/creditos). */
  weight: number
  /** Nota a la que aspira el alumno en esta asignatura. */
  targetGrade?: number
  schedule: ScheduleSlot[]
  /** Vacio = la asignatura pondera las notas directamente, sin categorias. */
  categories: GradeCategory[]
  createdAt: TimestampISO
  archived?: boolean
  demo?: boolean
}

// ---------------------------------------------------------------------------
// Notas
// ---------------------------------------------------------------------------

export type GradeKind = 'examen' | 'trabajo' | 'practica' | 'oral' | 'participacion' | 'otro'

export const GRADE_KINDS: { id: GradeKind; label: string }[] = [
  { id: 'examen', label: 'Examen' },
  { id: 'trabajo', label: 'Trabajo' },
  { id: 'practica', label: 'Práctica' },
  { id: 'oral', label: 'Oral' },
  { id: 'participacion', label: 'Participación' },
  { id: 'otro', label: 'Otro' },
]

export interface GradeEntry {
  id: ID
  subjectId: ID
  /** null = la nota pondera directamente sobre la asignatura. */
  categoryId: ID | null
  term: TermId
  name: string
  kind: GradeKind
  score: number
  /** Escala sobre la que se puntuo esta nota concreta (10, 100, 5...). */
  maxScore: number
  /** Peso dentro de su categoria (o de la asignatura), en tanto por ciento. */
  weight: number
  date: DateISO
  comment?: string
  createdAt: TimestampISO
  demo?: boolean
}

// ---------------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------------

export type Priority = 'baja' | 'media' | 'alta' | 'urgente'
export type TaskStatus = 'pendiente' | 'en_progreso' | 'completada'

export const PRIORITIES: { id: Priority; label: string; rank: number }[] = [
  { id: 'urgente', label: 'Urgente', rank: 0 },
  { id: 'alta', label: 'Alta', rank: 1 },
  { id: 'media', label: 'Media', rank: 2 },
  { id: 'baja', label: 'Baja', rank: 3 },
]

export const TASK_STATUSES: { id: TaskStatus; label: string }[] = [
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'en_progreso', label: 'En progreso' },
  { id: 'completada', label: 'Completada' },
]

export interface Subtask {
  id: ID
  title: string
  done: boolean
}

export interface Task {
  id: ID
  title: string
  description?: string
  subjectId?: ID
  dueDate?: DateISO
  dueTime?: TimeHM
  priority: Priority
  status: TaskStatus
  estimatedMinutes?: number
  tags: string[]
  subtasks: Subtask[]
  createdAt: TimestampISO
  completedAt?: TimestampISO
  demo?: boolean
}

// ---------------------------------------------------------------------------
// Examenes y eventos
// ---------------------------------------------------------------------------

export interface Exam {
  id: ID
  subjectId: ID
  title: string
  date: DateISO
  time?: TimeHM
  /** Temario que entra. */
  topics?: string
  /** Peso del examen dentro de la evaluacion, en tanto por ciento. */
  weight?: number
  term: TermId
  /** Se rellena cuando la nota de este examen ya esta registrada. */
  gradeEntryId?: ID
  createdAt: TimestampISO
  demo?: boolean
}

export type EventKind = 'entrega' | 'personal' | 'clase' | 'otro'

export const EVENT_KINDS: { id: EventKind; label: string }[] = [
  { id: 'entrega', label: 'Entrega' },
  { id: 'personal', label: 'Personal' },
  { id: 'clase', label: 'Clase' },
  { id: 'otro', label: 'Otro' },
]

export interface CalendarEvent {
  id: ID
  title: string
  date: DateISO
  startTime?: TimeHM
  endTime?: TimeHM
  subjectId?: ID
  kind: EventKind
  notes?: string
  createdAt: TimestampISO
  demo?: boolean
}

// ---------------------------------------------------------------------------
// Estudio y objetivos
// ---------------------------------------------------------------------------

export interface StudySession {
  id: ID
  subjectId?: ID
  topic?: string
  startedAt: TimestampISO
  /** Duracion real registrada, en minutos. */
  minutes: number
  mode: 'pomodoro' | 'libre'
  notes?: string
  demo?: boolean
}

export type GoalKind = 'media' | 'horas_estudio' | 'tareas' | 'manual'
export type GoalScope = 'diario' | 'semanal' | 'trimestral' | 'anual'

export interface Goal {
  id: ID
  title: string
  kind: GoalKind
  scope: GoalScope
  target: number
  /** Solo para objetivos manuales; el resto se calculan a partir de los datos. */
  manualProgress?: number
  subjectId?: ID
  term?: TermId
  createdAt: TimestampISO
  archived?: boolean
  demo?: boolean
}

// ---------------------------------------------------------------------------
// Actividad
// ---------------------------------------------------------------------------

export type ActivityKind =
  | 'tarea_creada'
  | 'tarea_completada'
  | 'nota_anadida'
  | 'examen_creado'
  | 'estudio_registrado'
  | 'asignatura_creada'
  | 'objetivo_creado'

export interface ActivityEntry {
  id: ID
  kind: ActivityKind
  at: TimestampISO
  text: string
  subjectId?: ID
}

// ---------------------------------------------------------------------------
// Ajustes y raiz de datos
// ---------------------------------------------------------------------------

/** Escala de calificacion. `max` 10 y `pass` 5 en el sistema espanol. */
export interface GradeScale {
  max: number
  pass: number
  decimals: number
}

export type ThemePreference = 'light' | 'dark' | 'system'

/** Como se combina la nota de cada asignatura en la media global. */
export type AverageMode = 'aritmetica' | 'ponderada'

export interface Settings {
  userName: string
  course: string
  academicYear: string
  theme: ThemePreference
  /** 1 = la semana empieza en lunes, 0 = en domingo. */
  weekStartsOn: 0 | 1
  gradeScale: GradeScale
  averageMode: AverageMode
  activeTerm: TermId
  alertsEnabled: boolean
  /** Dias de antelacion con los que avisar de un examen. */
  examAlertDays: number
  onboarded: boolean
}

export interface AppData {
  /** Version del esquema. La usa el migrador al cargar. */
  version: number
  settings: Settings
  subjects: Subject[]
  tasks: Task[]
  grades: GradeEntry[]
  exams: Exam[]
  events: CalendarEvent[]
  sessions: StudySession[]
  goals: Goal[]
  activity: ActivityEntry[]
}
