/**
 * Derivaciones sobre tareas: agrupación, orden, filtrado y progreso.
 * Nada de esto se guarda: se calcula a partir de las tareas y de la fecha.
 */

import { daysUntil, today as todayISO } from './dates'
import type { DateISO, Priority, Task, TaskStatus } from './types'
import { PRIORITIES } from './types'

export type TaskBucket = 'atrasada' | 'hoy' | 'manana' | 'proxima' | 'sin_fecha' | 'completada'

const PRIORITY_RANK: Record<Priority, number> = Object.fromEntries(
  PRIORITIES.map((p) => [p.id, p.rank]),
) as Record<Priority, number>

// ---------------------------------------------------------------------------
// Estado de una tarea
// ---------------------------------------------------------------------------

export function isDone(task: Task): boolean {
  return task.status === 'completada'
}

/** Atrasada = tiene fecha, ya pasó y sigue sin completarse. */
export function isOverdue(task: Task, today: DateISO = todayISO()): boolean {
  if (isDone(task) || !task.dueDate) return false
  return task.dueDate < today
}

export function isDueToday(task: Task, today: DateISO = todayISO()): boolean {
  return !isDone(task) && task.dueDate === today
}

export function bucketOf(task: Task, today: DateISO = todayISO()): TaskBucket {
  if (isDone(task)) return 'completada'
  if (!task.dueDate) return 'sin_fecha'
  const diff = daysUntil(task.dueDate, today)
  if (diff < 0) return 'atrasada'
  if (diff === 0) return 'hoy'
  if (diff === 1) return 'manana'
  return 'proxima'
}

// ---------------------------------------------------------------------------
// Subtareas
// ---------------------------------------------------------------------------

export interface SubtaskProgress {
  done: number
  total: number
  /** 0-100. Vale 0 cuando no hay subtareas. */
  percent: number
}

export function subtaskProgress(task: Task): SubtaskProgress {
  const total = task.subtasks.length
  if (total === 0) return { done: 0, total: 0, percent: 0 }
  const done = task.subtasks.filter((s) => s.done).length
  return { done, total, percent: Math.round((done / total) * 100) }
}

// ---------------------------------------------------------------------------
// Orden
// ---------------------------------------------------------------------------

export type TaskSort = 'fecha' | 'prioridad' | 'asignatura' | 'creacion' | 'alfabetico'

/**
 * Orden por defecto: primero lo que tiene fecha más cercana, y a igualdad de
 * fecha, lo más prioritario. Las tareas sin fecha van al final: no compiten
 * con lo que sí tiene plazo.
 */
function compareByDate(a: Task, b: Task): number {
  if (a.dueDate && b.dueDate) {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  }
  if (a.dueDate) return -1
  if (b.dueDate) return 1
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
}

export function sortTasks(tasks: Task[], sort: TaskSort = 'fecha'): Task[] {
  const copy = [...tasks]
  switch (sort) {
    case 'prioridad':
      return copy.sort(
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || compareByDate(a, b),
      )
    case 'asignatura':
      return copy.sort(
        (a, b) => (a.subjectId ?? 'zzz').localeCompare(b.subjectId ?? 'zzz') || compareByDate(a, b),
      )
    case 'creacion':
      return copy.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    case 'alfabetico':
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'es'))
    case 'fecha':
    default:
      return copy.sort(compareByDate)
  }
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

export type TaskView = 'todas' | 'hoy' | 'proximas' | 'atrasadas' | 'completadas'

export interface TaskFilters {
  view: TaskView
  query: string
  subjectId: string | null
  priority: Priority | null
  status: TaskStatus | null
}

export const EMPTY_FILTERS: TaskFilters = {
  view: 'todas',
  query: '',
  subjectId: null,
  priority: null,
  status: null,
}

/** Normaliza para buscar sin tildes ni mayúsculas: 'Matemáticas' ≈ 'matematicas'. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function matchesQuery(task: Task, query: string): boolean {
  if (!query.trim()) return true
  const needle = normalize(query)
  const haystack = [task.title, task.description ?? '', ...task.tags, ...task.subtasks.map((s) => s.title)]
    .map(normalize)
    .join(' ')
  return haystack.includes(needle)
}

function matchesView(task: Task, view: TaskView, today: DateISO): boolean {
  const bucket = bucketOf(task, today)
  switch (view) {
    case 'hoy':
      // "Hoy" incluye lo atrasado: si no, lo que se te pasó desaparece del radar.
      return bucket === 'hoy' || bucket === 'atrasada'
    case 'proximas':
      return bucket === 'manana' || bucket === 'proxima'
    case 'atrasadas':
      return bucket === 'atrasada'
    case 'completadas':
      return bucket === 'completada'
    case 'todas':
    default:
      return bucket !== 'completada'
  }
}

export function filterTasks(
  tasks: Task[],
  filters: TaskFilters,
  today: DateISO = todayISO(),
): Task[] {
  return tasks.filter((task) => {
    if (!matchesView(task, filters.view, today)) return false
    if (filters.subjectId && task.subjectId !== filters.subjectId) return false
    if (filters.priority && task.priority !== filters.priority) return false
    if (filters.status && task.status !== filters.status) return false
    if (!matchesQuery(task, filters.query)) return false
    return true
  })
}

export function countByView(tasks: Task[], today: DateISO = todayISO()): Record<TaskView, number> {
  return {
    todas: tasks.filter((t) => matchesView(t, 'todas', today)).length,
    hoy: tasks.filter((t) => matchesView(t, 'hoy', today)).length,
    proximas: tasks.filter((t) => matchesView(t, 'proximas', today)).length,
    atrasadas: tasks.filter((t) => matchesView(t, 'atrasadas', today)).length,
    completadas: tasks.filter((t) => matchesView(t, 'completadas', today)).length,
  }
}

/** Minutos estimados de un conjunto de tareas sin completar. */
export function estimatedMinutes(tasks: Task[]): number {
  return tasks.filter((t) => !isDone(t)).reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0)
}
