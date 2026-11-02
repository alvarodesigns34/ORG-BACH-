import { useEffect, useMemo, useState } from 'react'
import { ArrowUpDown, ListChecks, Plus, Search, X } from 'lucide-react'

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
import { daysUntil, formatDuration } from '@/domain/dates'
import { PRIORITIES, type Priority, type Task } from '@/domain/types'
import { useRoute } from '@/router'
import { useStore, useToday } from '@/state/StoreProvider'
import { useSubjectMap, useSubjects } from '@/state/selectors'
import { Page, PageHeader } from '@/layout/AppShell'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import { TaskRow } from '@/features/tasks/TaskRow'
import { Menu } from '@/ui/Menu'
import { Input, Select } from '@/ui/fields'
import { Button, Card, EmptyState, PRIORITY_LABEL, Segmented, cx } from '@/ui/primitives'

const VIEW_LABELS: { value: TaskView; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'hoy', label: 'Hoy' },
  { value: 'proximas', label: 'Próximas' },
  { value: 'atrasadas', label: 'Atrasadas' },
  { value: 'completadas', label: 'Completadas' },
]

const SORT_LABELS: Record<TaskSort, string> = {
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

export function TasksView() {
  const { route } = useRoute()
  const { data } = useStore()
  const today = useToday()
  const subjects = useSubjects()
  const subjectMap = useSubjectMap()

  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<TaskSort>('fecha')
  const [editing, setEditing] = useState<Task | null>(null)
  const [creating, setCreating] = useState(false)

  // Las alertas enlazan a '#/tareas?vista=atrasadas': la vista se sincroniza
  // con la URL para que ese enlace lleve exactamente a donde dice.
  const viewParam = route.params.get('vista') as TaskView | null
  useEffect(() => {
    if (viewParam && VIEW_LABELS.some((v) => v.value === viewParam)) {
      setFilters((prev) => (prev.view === viewParam ? prev : { ...prev, view: viewParam }))
    }
  }, [viewParam])

  const counts = useMemo(() => countByView(data.tasks, today), [data.tasks, today])
  const visible = useMemo(
    () => sortTasks(filterTasks(data.tasks, filters, today), sort),
    [data.tasks, filters, sort, today],
  )

  const grouped = useMemo(() => groupByDay(visible, today), [visible, today])
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
          // En el móvil ya está el «+» de la barra inferior.
          <Button variant="primary" onClick={() => setCreating(true)} className="max-lg:hidden">
            <Plus className="size-4" strokeWidth={2.5} />
            Nueva tarea
          </Button>
        }
        toolbar={
          <div className="flex flex-col gap-3">
            <Segmented
              label="Vista de tareas"
              value={filters.view}
              onChange={(view) => setFilters((prev) => ({ ...prev, view }))}
              options={VIEW_LABELS.map((v) => ({ ...v, count: counts[v.value] }))}
            />

            <div className="relative max-w-md">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3 pointer-events-none"
                aria-hidden
              />
              <Input
                value={filters.query}
                aria-label="Buscar tareas"
                placeholder="Buscar…"
                className="pl-9 pr-9"
                onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
              />
              {filters.query && (
                <button
                  type="button"
                  aria-label="Borrar búsqueda"
                  onClick={() => setFilters((prev) => ({ ...prev, query: '' }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 size-6 grid place-items-center rounded-full bg-ink-3/25 text-surface hover:bg-ink-3/40"
                >
                  <X className="size-3.5" strokeWidth={3} />
                </button>
              )}
            </div>

            {/* Filtros como píldoras en una fila que se desliza: apilados,
                ocupaban media pantalla del móvil antes de la primera tarea. */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-[1.125rem] px-[1.125rem] sm:mx-0 sm:px-0 pb-0.5">
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
                      'pressable shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full',
                      'bg-fill text-[0.8125rem] font-medium text-ink-2 hover:text-ink whitespace-nowrap',
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
          {grouped.map((group) => (
            <section key={group.key}>
              <h2
                className={cx(
                  'flex items-baseline gap-2 mb-2 px-1 text-[1.125rem] font-bold tracking-[-0.02em]',
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
              </h2>
              <Card flush className="overflow-hidden">
                <ul>
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      subject={task.subjectId ? subjectMap.get(task.subjectId) : undefined}
                      onOpen={setEditing}
                    />
                  ))}
                </ul>
              </Card>
            </section>
          ))}
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
