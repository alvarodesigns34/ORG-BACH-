import { AnimatePresence, m as motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpDown,
  CalendarClock,
  CornerDownLeft,
  ListChecks,
  Menu as GripLines,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react'

import {
  EMPTY_FILTERS,
  bucketOf,
  countByView,
  filterTasks,
  sortTasks,
  type TaskFilters,
  type TaskSort,
  type TaskView,
} from '@/domain/tasks'
import { parseQuickTask } from '@/domain/quickCapture'
import { daysUntil, formatDuration, relativeDay } from '@/domain/dates'
import { colorVar } from '@/domain/palette'
import { PRIORITIES, type Priority, type Task } from '@/domain/types'
import { useRoute } from '@/router'
import { useDispatch, useStore, useToday } from '@/state/StoreProvider'
import { useSubjectMap, useSubjects } from '@/state/selectors'
import { Page, PageHeader } from '@/layout/AppShell'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import { TaskList } from '@/features/tasks/TaskRow'
import { ReorderableTaskList } from '@/features/tasks/ReorderableTaskList'
import { spring, useMediaQuery } from '@/ui/motion'
import { Menu } from '@/ui/Menu'
import { Input, Select } from '@/ui/fields'
import { useToast } from '@/ui/Toast'
import { Button, Card, EmptyState, PRIORITY_LABEL, Segmented, cx } from '@/ui/primitives'

const VIEW_LABELS: { value: TaskView; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'hoy', label: 'Hoy' },
  { value: 'proximas', label: 'Próximas' },
  { value: 'atrasadas', label: 'Atrasadas' },
  { value: 'completadas', label: 'Completadas' },
]

const SORT_LABELS: Record<TaskSort, string> = {
  manual: 'Mi orden',
  fecha: 'Fecha límite',
  prioridad: 'Prioridad',
  asignatura: 'Asignatura',
  creacion: 'Más recientes',
  alfabetico: 'Alfabético',
}

const EMPTY_COPY: Record<TaskView, { title: string; description: string }> = {
  todas: {
    title: 'No tienes tareas todavía',
    description: 'Crea tu primera tarea para empezar a organizarte. Con el título basta.',
  },
  hoy: {
    title: 'Nada para hoy',
    description: 'No vence nada hoy y no arrastras tareas atrasadas. Buen momento para adelantar.',
  },
  proximas: {
    title: 'Sin tareas próximas',
    description: 'No hay nada con fecha en los próximos días.',
  },
  atrasadas: {
    title: 'Ninguna tarea atrasada',
    description: 'Vas al día con todo lo que tenía fecha.',
  },
  completadas: {
    title: 'Aún no has completado ninguna',
    description: 'Las tareas que marques como hechas se irán guardando aquí.',
  },
}

/** El orden elegido es una preferencia de este dispositivo, como el tema. */
const SORT_STORAGE_KEY = 'org-bach:tareas-orden'

function readSort(): TaskSort {
  try {
    const saved = window.localStorage.getItem(SORT_STORAGE_KEY)
    if (saved && saved in SORT_LABELS) return saved as TaskSort
  } catch {
    // Almacenamiento bloqueado: se usa el orden por defecto.
  }
  return 'manual'
}

function saveSort(sort: TaskSort) {
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, sort)
  } catch {
    // Sin almacenamiento, el orden dura lo que la sesión.
  }
}

export function TasksView() {
  const dispatch = useDispatch()
  const toast = useToast()
  const { route } = useRoute()
  const { data } = useStore()
  const today = useToday()
  const subjects = useSubjects()
  const subjectMap = useSubjectMap()

  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS)
  const [sort, setSortState] = useState<TaskSort>(readSort)
  const setSort = (next: TaskSort) => {
    setSortState(next)
    saveSort(next)
  }
  const [editing, setEditing] = useState<Task | null>(null)
  const [creating, setCreating] = useState(false)
  const coarse = useMediaQuery('(max-width: 639px)')
  const [quickText, setQuickText] = useState('')

  // Las alertas enlazan a '#/tareas?vista=atrasadas': la vista se sincroniza
  // con la URL para que ese enlace lleve exactamente a donde dice.
  const viewParam = route.params.get('vista') as TaskView | null
  useEffect(() => {
    if (viewParam && VIEW_LABELS.some((v) => v.value === viewParam)) {
      setFilters((prev) => (prev.view === viewParam ? prev : { ...prev, view: viewParam }))
    }
  }, [viewParam])

  const subjectNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of data.subjects) map.set(s.id, s.name)
    return map
  }, [data.subjects])

  const counts = useMemo(() => countByView(data.tasks, today), [data.tasks, today])
  const visible = useMemo(
    () => sortTasks(filterTasks(data.tasks, filters, today), sort, subjectNames),
    [data.tasks, filters, sort, today, subjectNames],
  )

  const parsedQuick = useMemo(
    () => (quickText.trim() ? parseQuickTask(quickText, data.subjects, today) : null),
    [quickText, data.subjects, today],
  )
  const quickSubject = parsedQuick?.subjectId ? subjectMap.get(parsedQuick.subjectId) : undefined

  const submitQuick = () => {
    if (!parsedQuick || !parsedQuick.title.trim()) return
    const fallbackSubject = parsedQuick.subjectId ?? filters.subjectId ?? undefined
    const fallbackDue =
      parsedQuick.dueDate ?? (filters.view === 'hoy' ? today : undefined)
    dispatch({
      type: 'task/add',
      task: {
        title: parsedQuick.title,
        subjectId: fallbackSubject,
        dueDate: fallbackDue,
        dueTime: parsedQuick.dueTime,
        priority: parsedQuick.priority,
        status: 'pendiente',
        estimatedMinutes: parsedQuick.estimatedMinutes,
        tags: parsedQuick.tags,
        subtasks: [],
      },
    })
    setQuickText('')
    toast({ text: `Tarea añadida: ${parsedQuick.title}` })
  }

  const rescheduleOverdueToToday = () => {
    const overdue = data.tasks.filter((t) => bucketOf(t, today) === 'atrasada')
    if (overdue.length === 0) return
    const snapshot = overdue.map((t) => ({ id: t.id, dueDate: t.dueDate, dueTime: t.dueTime }))
    for (const task of overdue) {
      dispatch({
        type: 'task/update',
        id: task.id,
        patch: { dueDate: today, dueTime: undefined },
      })
    }
    toast({
      text:
        overdue.length === 1
          ? '1 tarea atrasada movida a hoy'
          : `${overdue.length} tareas atrasadas movidas a hoy`,
      action: {
        label: 'Deshacer',
        run: () => {
          for (const prev of snapshot) {
            dispatch({
              type: 'task/update',
              id: prev.id,
              patch: { dueDate: prev.dueDate, dueTime: prev.dueTime },
            })
          }
        },
      },
    })
  }

  const grouped = useMemo(
    () => (sort === 'manual' ? groupForManual(visible) : groupByDay(visible, today)),
    [visible, today, sort],
  )
  const filtersActive = !!(filters.query || filters.subjectId || filters.priority)
  const totalMinutes = visible.reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0)

  return (
    // Una lista de tareas no gana nada con 1200 px de ancho: el titulo
    // quedaria a un lado y la prioridad al otro, con un vacio enorme en medio.
    <Page className="max-w-[900px]">
      <PageHeader
        title="Tareas"
        subtitle={
          visible.length === 0
            ? undefined
            : `${visible.length} ${visible.length === 1 ? 'tarea' : 'tareas'}${
                totalMinutes > 0 ? ` · ${formatDuration(totalMinutes)} estimados` : ''
              }`
        }
        actions={
          <div className="flex items-center gap-2">
            {counts.atrasadas > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={rescheduleOverdueToToday}
                title="Reprogramar todas las atrasadas para hoy"
              >
                <CalendarClock className="size-4" />
                <span className="hidden sm:inline">Mover atrasadas a hoy</span>
                <span className="sm:hidden">A hoy ({counts.atrasadas})</span>
              </Button>
            )}
            {/* En el móvil ya está el «+» de la barra inferior. */}
            <Button variant="primary" onClick={() => setCreating(true)} className="max-lg:hidden">
              <Plus className="size-4" strokeWidth={2.5} />
              Nueva tarea
            </Button>
          </div>
        }
        toolbar={
          <div className="flex flex-col gap-3">
            {/* Captura rápida en lenguaje natural: apunta una tarea en una línea */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                submitQuick()
              }}
              className="flex flex-col gap-1.5"
            >
              <div className="relative flex items-center gap-2">
                <Sparkles
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 z-[1] size-4 text-accent pointer-events-none"
                  aria-hidden
                />
                <Input
                  value={quickText}
                  aria-label="Captura rápida de tarea"
                  placeholder={coarse ? 'Apunta una tarea…' : 'Añadir rápido… ej.: Derivadas #MAT mañana 18:00 45m !alta'}
                  className="glass-input pl-10 pr-12 sm:pr-24 h-11 rounded-full border-transparent"
                  onChange={(e) => setQuickText(e.target.value)}
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!parsedQuick?.title.trim()}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 px-3 rounded-full"
                >
                  <CornerDownLeft className="size-3.5" />
                  <span className="hidden sm:inline">Añadir</span>
                </Button>
              </div>
              {parsedQuick && parsedQuick.title && (
                <div
                  className="animate-pop flex flex-wrap items-center gap-1.5 px-2 text-[0.75rem] text-ink-2"
                  aria-live="polite"
                >
                  <span className="font-medium text-ink truncate max-w-[260px]">
                    {parsedQuick.title}
                  </span>
                  {quickSubject && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 font-medium text-ink">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ background: colorVar(quickSubject.color) }}
                      />
                      {quickSubject.shortName || quickSubject.name}
                    </span>
                  )}
                  {parsedQuick.dueDate && (
                    <span className="rounded-full bg-accent-soft text-accent px-2 py-0.5 font-medium">
                      {relativeDay(parsedQuick.dueDate, today)}
                      {parsedQuick.dueTime ? ` · ${parsedQuick.dueTime}` : ''}
                    </span>
                  )}
                  {parsedQuick.estimatedMinutes && (
                    <span className="rounded-full bg-fill px-2 py-0.5 tabular-nums">
                      {formatDuration(parsedQuick.estimatedMinutes)}
                    </span>
                  )}
                  {parsedQuick.priority !== 'media' && (
                    <span
                      className={cx(
                        'rounded-full px-2 py-0.5 font-medium',
                        parsedQuick.priority === 'urgente'
                          ? 'bg-danger-soft text-danger'
                          : parsedQuick.priority === 'alta'
                            ? 'bg-warn-soft text-warn'
                            : 'bg-fill text-ink-2',
                      )}
                    >
                      {PRIORITY_LABEL[parsedQuick.priority]}
                    </span>
                  )}
                  {parsedQuick.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-fill px-2 py-0.5 text-ink-3">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </form>

            <Segmented
              label="Vista de tareas"
              className="self-start max-w-full"
              value={filters.view}
              onChange={(view) => setFilters((prev) => ({ ...prev, view }))}
              options={VIEW_LABELS.map((v) => ({ ...v, count: counts[v.value] }))}
            />

            {/* En el iPhone, buscar y filtrar van en UNA fila: la lupa ocupa
                poco y se abre al tocarla; antes eran dos filas enteras antes
                de la primera tarea. */}
            <div className="flex max-sm:flex-nowrap flex-wrap items-center gap-2">
            <div
              className={cx(
                'relative shrink-0 sm:w-72 transition-[width] duration-300 ease-[var(--ease-std)]',
                filters.query ? 'max-sm:w-full' : 'max-sm:w-[7rem] max-sm:focus-within:w-full',
              )}
            >
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none"
                aria-hidden
              />
              <Input
                value={filters.query}
                aria-label="Buscar tareas"
                placeholder="Buscar"
                className={cx('search-field pl-10 h-10 rounded-full', filters.query ? 'pr-10' : 'pr-3')}
                onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
              />
              {filters.query && (
                <button
                  type="button"
                  aria-label="Borrar búsqueda"
                  onClick={() => setFilters((prev) => ({ ...prev, query: '' }))}
                  className="absolute right-1 top-1/2 -translate-y-1/2 size-8 grid place-items-center rounded-full text-ink-2 hover:text-ink"
                >
                  <span className="size-5 grid place-items-center rounded-full bg-ink-3/25 text-surface">
                    <X className="size-3" strokeWidth={3} />
                  </span>
                </button>
              )}
            </div>

            {/* Filtros como píldoras en una fila que se desliza: apilados,
                ocupaban media pantalla del móvil antes de la primera tarea. */}
            <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto no-scrollbar max-sm:-mr-5 max-sm:pr-5 py-1">
              <Select
                aria-label="Filtrar por asignatura"
                value={filters.subjectId ?? ''}
                pill
                active={!!filters.subjectId}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, subjectId: e.target.value || null }))
                }
              >
                <option value="">Todas las asignaturas</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>

              <Select
                aria-label="Filtrar por prioridad"
                value={filters.priority ?? ''}
                pill
                active={!!filters.priority}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    priority: (e.target.value as Priority) || null,
                  }))
                }
              >
                <option value="">Toda prioridad</option>
                {PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {PRIORITY_LABEL[p.id]}
                  </option>
                ))}
              </Select>

              <Menu
                label="Ordenar tareas"
                items={(Object.keys(SORT_LABELS) as TaskSort[]).map((key) => ({
                  id: key,
                  label: SORT_LABELS[key],
                  selected: sort === key,
                  onSelect: () => setSort(key),
                }))}
                trigger={({ onClick, ref, ...aria }) => (
                  <button
                    ref={ref}
                    type="button"
                    onClick={onClick}
                    aria-haspopup="menu"
                    {...aria}
                    className={cx(
                      'glass-btn pressable shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-full',
                      'text-[0.875rem] font-medium text-ink whitespace-nowrap',
                    )}
                  >
                    <ArrowUpDown className="size-3.5" strokeWidth={2.4} />
                    {SORT_LABELS[sort]}
                  </button>
                )}
              />

              {filtersActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() =>
                    setFilters((prev) => ({ ...prev, query: '', subjectId: null, priority: null }))
                  }
                >
                  Limpiar
                </Button>
              )}
            </div>
            </div>
          </div>
        }
      />

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListChecks className="size-5" />}
            title={filtersActive ? 'Ningún resultado' : EMPTY_COPY[filters.view].title}
            description={
              filtersActive
                ? 'Ninguna tarea coincide con lo que has buscado. Prueba a quitar algún filtro.'
                : EMPTY_COPY[filters.view].description
            }
            action={
              filtersActive ? (
                <Button
                  onClick={() =>
                    setFilters((prev) => ({ ...prev, query: '', subjectId: null, priority: null }))
                  }
                >
                  Quitar filtros
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus className="size-4" />
                  Crear tarea
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <AnimatePresence initial={false}>
          {grouped.map((group) => (
            <motion.section
              key={group.key}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ ...spring.smooth, bounce: 0 }}
              // Sin esto, la sombra de la tarjeta se recorta mientras se pliega.
              // La lista reordenable no recorta: la fila levantada flota fuera.
              className={cx(
                '-mx-2 px-2 -my-1 py-1',
                group.reorderable ? 'overflow-visible' : 'overflow-hidden',
              )}
            >
              <h2
                className={cx(
                  'flex items-baseline gap-2 mb-2 px-1 text-[1.125rem] font-bold tracking-[-0.012em]',
                  group.tone === 'danger'
                    ? 'text-danger'
                    : group.tone === 'warn'
                      ? 'text-warn'
                      : 'text-ink',
                )}
              >
                {group.label}
                <span className="text-[0.875rem] text-ink-3 font-semibold tabular-nums">
                  {group.tasks.length}
                </span>
                {group.reorderable && group.tasks.length > 1 && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[0.75rem] font-medium tracking-normal text-ink-3">
                    Arrastra
                    <GripLines className="size-3.5" strokeWidth={2.2} aria-hidden />
                    para ordenar
                  </span>
                )}
              </h2>
              {group.reorderable ? (
                <Card flush>
                  <ReorderableTaskList
                    tasks={group.tasks}
                    subjects={subjectMap}
                    onOpen={setEditing}
                    onReorder={(ids) => dispatch({ type: 'task/reorder', ids })}
                  />
                </Card>
              ) : (
                <Card flush className="overflow-hidden">
                  <TaskList tasks={group.tasks} subjects={subjectMap} onOpen={setEditing} />
                </Card>
              )}
            </motion.section>
          ))}
          </AnimatePresence>
        </div>
      )}

      <TaskEditor open={creating} onClose={() => setCreating(false)} />
      <TaskEditor open={!!editing} task={editing} onClose={() => setEditing(null)} />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Agrupación
// ---------------------------------------------------------------------------

interface TaskGroup {
  key: string
  label: string
  tasks: Task[]
  tone?: 'danger' | 'warn'
  /** Se ordena arrastrando («Mi orden»). */
  reorderable?: boolean
}

/**
 * «Mi orden»: lo pendiente en una sola lista, en el orden en que se piensa
 * hacer, y lo hecho aparte, lo último completado primero. Partir lo pendiente
 * por fechas aquí no tendría sentido: el orden lo decide el alumno.
 */
function groupForManual(tasks: Task[]): TaskGroup[] {
  const pending = tasks.filter((t) => t.status !== 'completada')
  const done = tasks
    .filter((t) => t.status === 'completada')
    .sort((a, b) => ((a.completedAt ?? '') < (b.completedAt ?? '') ? 1 : -1))
  const groups: TaskGroup[] = []
  if (pending.length > 0) {
    groups.push({ key: 'porHacer', label: 'Por hacer', tasks: pending, reorderable: true })
  }
  if (done.length > 0) groups.push({ key: 'hechas', label: 'Completadas', tasks: done })
  return groups
}

/**
 * Agrupa por cercanía del plazo en lugar de por fecha exacta.
 *
 * «Atrasadas / Hoy / Mañana / Esta semana / Más adelante» responde a la
 * pregunta real —¿qué me aprieta?— mucho mejor que una lista de fechas.
 *
 * La clasificación sale de `bucketOf`, la misma que usan la fila de tarea, la
 * portada y los recuentos de las pestañas. Cuando esto comparaba fechas por su
 * cuenta, una tarea de hoy con la hora ya pasada salía bajo el epígrafe «Hoy»
 * DENTRO de la pestaña «Atrasadas»: la pestaña decía una cosa y el epígrafe la
 * contraria sobre la misma tarea.
 */
function groupByDay(tasks: Task[], today: string): TaskGroup[] {
  const groups: Record<string, TaskGroup> = {
    atrasadas: { key: 'atrasadas', label: 'Atrasadas', tasks: [], tone: 'danger' },
    hoy: { key: 'hoy', label: 'Hoy', tasks: [], tone: 'warn' },
    manana: { key: 'manana', label: 'Mañana', tasks: [] },
    semana: { key: 'semana', label: 'Esta semana', tasks: [] },
    despues: { key: 'despues', label: 'Más adelante', tasks: [] },
    sinFecha: { key: 'sinFecha', label: 'Sin fecha', tasks: [] },
    hechas: { key: 'hechas', label: 'Completadas', tasks: [] },
  }

  for (const task of tasks) {
    switch (bucketOf(task, today)) {
      case 'completada':
        groups.hechas.tasks.push(task)
        break
      case 'sin_fecha':
        groups.sinFecha.tasks.push(task)
        break
      case 'atrasada':
        groups.atrasadas.tasks.push(task)
        break
      case 'hoy':
        groups.hoy.tasks.push(task)
        break
      case 'manana':
        groups.manana.tasks.push(task)
        break
      default:
        // «Próxima» se parte en dos para leerla mejor. Nunca
        // `new Date(dayString)` directamente: interpretaría la cadena como
        // UTC. `daysUntil` construye las fechas componente a componente.
        if (daysUntil(task.dueDate!, today) <= 7) groups.semana.tasks.push(task)
        else groups.despues.tasks.push(task)
    }
  }

  return Object.values(groups).filter((g) => g.tasks.length > 0)
}
