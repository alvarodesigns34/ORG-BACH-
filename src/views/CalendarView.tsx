import { useMemo, useState } from 'react'
import { CalendarPlus, Check, ChevronLeft, ChevronRight, GripVertical, ListPlus, Plus } from 'lucide-react'

import {
  MONTHS_LONG,
  WEEKDAYS_LONG,
  WEEKDAYS_SHORT,
  addDays,
  addMonths,
  formatDayMonth,
  formatMonthYear,
  isSameMonth,
  monthGrid,
  parseDay,
  startOfWeek,
  today as todayFn,
} from '@/domain/dates'
import { colorVar } from '@/domain/palette'
import type { CalendarEvent, Exam, Subject, Task } from '@/domain/types'
import { useDispatch, useStore, useSettings, useToday } from '@/state/StoreProvider'
import { DragGhost, useDragToDay, type DragState } from '@/features/tasks/dragToDay'
import { useToast } from '@/ui/Toast'
import { bucketOf } from '@/domain/tasks'
import { useCalendarIndex, useSubjectMap, type DayItem } from '@/state/selectors'
import { Page, PageHeader } from '@/layout/AppShell'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import { ExamEditor } from '@/features/exams/ExamEditor'
import { EventEditor } from '@/features/events/EventEditor'
import { Button, EmptyState, IconButton, Segmented, cx } from '@/ui/primitives'

type CalendarMode = 'mes' | 'semana' | 'dia'

/** Marca de tipo: forma distinta por tipo, no solo color. */
const KIND_STYLE: Record<DayItem['kind'], { label: string; shape: string }> = {
  tarea: { label: 'Tarea', shape: 'rounded-full' },
  examen: { label: 'Examen', shape: 'rounded-[1px] rotate-45' },
  evento: { label: 'Evento', shape: 'rounded-[2px]' },
}

export function CalendarView() {
  const settings = useSettings()
  const today = useToday()
  const { data } = useStore()
  const index = useCalendarIndex()
  const subjects = useSubjectMap()

  const [mode, setMode] = useState<CalendarMode>('mes')
  const [cursor, setCursor] = useState(today)
  const [selected, setSelected] = useState(today)
  const [creating, setCreating] = useState<'tarea' | 'examen' | 'evento' | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const dispatch = useDispatch()
  const toast = useToast()

  // Arrastrar una tarea (de «Por planificar» o del día) a otro día le pone
  // esa fecha. Se puede deshacer.
  const dnd = useDragToDay((taskId, day) => {
    const task = data.tasks.find((t) => t.id === taskId)
    if (!task || task.dueDate === day) return
    dispatch({ type: 'task/update', id: taskId, patch: { dueDate: day } })
    setSelected(day)
    toast({
      text: `«${task.title}» para el ${formatDayMonth(day)}`,
      action: {
        label: 'Deshacer',
        run: () =>
          dispatch({
            type: 'task/update',
            id: taskId,
            patch: { dueDate: task.dueDate, dueTime: task.dueTime },
          }),
      },
    })
  })
  const colorOf = (subjectId?: string) => {
    const subject = subjectId ? subjects.get(subjectId) : undefined
    return subject ? colorVar(subject.color) : 'var(--c-ink-3)'
  }
  /** Lo que aún no tiene día, y lo atrasado, para colocarlo arrastrando. */
  const unplanned = useMemo(
    () =>
      data.tasks
        .filter((t) => t.status !== 'completada' && (!t.dueDate || bucketOf(t, today) === 'atrasada'))
        .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
        .slice(0, 12),
    [data.tasks, today],
  )

  /**
   * Abre lo que se ha pulsado en el panel del día.
   *
   * El índice del calendario guarda solo lo justo para pintar (`DayItem`), así
   * que hay que recuperar la entidad real antes de editarla.
   */
  const openItem = (item: DayItem) => {
    if (dnd.suppressClick.current) return
    if (item.kind === 'tarea') {
      const task = data.tasks.find((t) => t.id === item.id)
      if (task) setEditingTask(task)
    } else if (item.kind === 'examen') {
      const exam = data.exams.find((e) => e.id === item.id)
      if (exam) setEditingExam(exam)
    } else if (item.kind === 'evento') {
      const event = data.events.find((e) => e.id === item.id)
      if (event) setEditingEvent(event)
    }
  }

  const goToday = () => {
    setCursor(todayFn())
    setSelected(todayFn())
  }

  const step = (direction: 1 | -1) => {
    if (mode === 'mes') setCursor((c) => addMonths(c, direction))
    else if (mode === 'semana') setCursor((c) => addDays(c, direction * 7))
    else {
      const next = addDays(cursor, direction)
      setCursor(next)
      setSelected(next)
    }
  }

  const heading = useMemo(() => {
    if (mode === 'mes') return formatMonthYear(cursor)
    if (mode === 'dia') return formatDayMonth(cursor, true)
    const start = startOfWeek(cursor, settings.weekStartsOn)
    const end = addDays(start, 6)
    const a = parseDay(start)
    const b = parseDay(end)
    const sameMonth = a.getMonth() === b.getMonth()
    return sameMonth
      ? `${a.getDate()} – ${b.getDate()} de ${MONTHS_LONG[b.getMonth()]}`
      : `${a.getDate()} ${MONTHS_LONG[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MONTHS_LONG[b.getMonth()].slice(0, 3)}`
  }, [mode, cursor, settings.weekStartsOn])

  return (
    <Page>
      <PageHeader
        title="Calendario"
        actions={
          // En el móvil se crea desde el día seleccionado (abajo) o con «+».
          <div className="max-lg:hidden flex gap-2">
            <Button variant="secondary" onClick={() => setCreating('evento')}>
              <Plus className="size-4" />
              Evento
            </Button>
            <Button variant="primary" onClick={() => setCreating('examen')}>
              <CalendarPlus className="size-4" />
              Examen
            </Button>
          </div>
        }
        toolbar={
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center justify-between gap-3 md:justify-start md:gap-4 min-w-0">
              <h2 className="text-[1.5rem] font-bold tracking-[-0.015em] first-letter:uppercase truncate">
                {heading}
              </h2>
              <div className="glass-btn flex items-center gap-0.5 shrink-0 rounded-full p-[3px]">
                <IconButton label="Anterior" size="sm" className="!size-9 hover:!bg-[var(--glass-tint)]" onClick={() => step(-1)}>
                  <ChevronLeft className="size-[18px] text-ink-2" strokeWidth={2.4} />
                </IconButton>
                <button
                  type="button"
                  onClick={goToday}
                  className="pressable h-9 px-3.5 rounded-full text-[0.9375rem] font-semibold text-accent hover:bg-[var(--glass-tint)] transition-colors"
                >
                  Hoy
                </button>
                <IconButton label="Siguiente" size="sm" className="!size-9 hover:!bg-[var(--glass-tint)]" onClick={() => step(1)}>
                  <ChevronRight className="size-[18px] text-ink-2" strokeWidth={2.4} />
                </IconButton>
              </div>
            </div>
            <Segmented
              label="Vista del calendario"
              value={mode}
              onChange={(next) => {
                setMode(next)
                if (next === 'dia') setCursor(selected)
              }}
              options={[
                { value: 'mes', label: 'Mes' },
                { value: 'semana', label: 'Semana' },
                { value: 'dia', label: 'Día' },
              ]}
              className="self-start md:self-auto shrink-0"
            />
          </div>
        }
      />

      {/* En iPad el mes ocupa todo el ancho (con la barra lateral, a dos
          columnas cada día quedaba en ~80 px y los títulos se cortaban en
          «Exam…»); el día y lo pendiente van debajo, lado a lado. A partir
          de pantallas anchas, a la derecha como en Calendario de macOS. */}
      <div className={cx('grid grid-cols-1 gap-5 md:gap-6', mode !== 'dia' && 'xl:grid-cols-[minmax(0,1fr)_20rem]')}>
        <div className="min-w-0">
          {mode === 'mes' && (
            <MonthGrid
              cursor={cursor}
              selected={selected}
              today={today}
              index={index}
              subjects={subjects}
              weekStartsOn={settings.weekStartsOn}
              onSelect={setSelected}
              drag={dnd.drag}
            />
          )}
          {mode === 'semana' && (
            <WeekColumns
              cursor={cursor}
              selected={selected}
              today={today}
              index={index}
              subjects={subjects}
              weekStartsOn={settings.weekStartsOn}
              onSelect={setSelected}
              drag={dnd.drag}
            />
          )}
          {mode === 'dia' && (
            <DayPanel
              day={cursor}
              today={today}
              items={index.get(cursor) ?? []}
              subjects={subjects}
              onCreate={setCreating}
              onOpen={openItem}
              onDragStart={dnd.start}
              colorOf={colorOf}
              drag={dnd.drag}
              expanded
            />
          )}
        </div>

        <div
          className={cx(
            'min-w-0 grid gap-6 items-start content-start',
            mode !== 'dia' && unplanned.length > 0 && 'md:grid-cols-2 xl:grid-cols-1',
          )}
        >
          {mode !== 'dia' && (
            <DayPanel
              day={selected}
              today={today}
              items={index.get(selected) ?? []}
              subjects={subjects}
              onCreate={setCreating}
              onOpen={openItem}
              onDragStart={dnd.start}
              colorOf={colorOf}
              drag={dnd.drag}
            />
          )}
          {unplanned.length > 0 && (
            <section aria-label="Por planificar">
              <div className="flex items-baseline justify-between px-1 mb-2.5">
                <h2 className="text-[1.125rem] font-bold tracking-[-0.012em]">Por planificar</h2>
                <span className="text-[0.75rem] text-ink-3">Arrastra a un día</span>
              </div>
              <ul className="card overflow-hidden">
                {unplanned.map((task, i) => {
                  const overdue = !!task.dueDate
                  return (
                    <li key={task.id} className={cx(i > 0 && 'inset-separator')}>
                      <div
                        onPointerDown={dnd.start(task, colorOf(task.subjectId))}
                        className={cx(
                          'flex items-center gap-2 pl-1.5 pr-4 py-2 select-none transition-opacity',
                          dnd.drag?.taskId === task.id && 'opacity-40',
                        )}
                      >
                        <span
                          data-drag-handle
                          aria-hidden
                          className="grid place-items-center size-9 shrink-0 text-ink-3 touch-none cursor-grab active:cursor-grabbing"
                        >
                          <GripVertical className="size-4" strokeWidth={2.2} />
                        </span>
                        <span className="size-2 rounded-full shrink-0" style={{ background: colorOf(task.subjectId) }} />
                        <button
                          type="button"
                          onClick={() => !dnd.suppressClick.current && setEditingTask(task)}
                          className="min-w-0 flex-1 text-left text-[0.9375rem] truncate"
                        >
                          {task.title}
                        </button>
                        {overdue && (
                          <span className="text-[0.75rem] font-semibold text-danger shrink-0">Atrasada</span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      </div>

      <DragGhost drag={dnd.drag} />

      <TaskEditor
        open={creating === 'tarea'}
        onClose={() => setCreating(null)}
        defaults={{ dueDate: mode === 'dia' ? cursor : selected }}
      />
      <ExamEditor
        open={creating === 'examen'}
        onClose={() => setCreating(null)}
        defaults={{ date: mode === 'dia' ? cursor : selected }}
      />
      <EventEditor
        open={creating === 'evento'}
        onClose={() => setCreating(null)}
        defaults={{ date: mode === 'dia' ? cursor : selected }}
      />

      {/* Edición de lo que ya existe. Van aparte de los de alta para no
          mezclar «crear con esta fecha» con «abrir esto concreto». */}
      <TaskEditor open={!!editingTask} task={editingTask} onClose={() => setEditingTask(null)} />
      <ExamEditor open={!!editingExam} exam={editingExam} onClose={() => setEditingExam(null)} />
      <EventEditor
        open={!!editingEvent}
        event={editingEvent}
        onClose={() => setEditingEvent(null)}
      />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Vista de mes
// ---------------------------------------------------------------------------

interface GridProps {
  cursor: string
  selected: string
  today: string
  index: Map<string, DayItem[]>
  subjects: Map<string, Subject>
  weekStartsOn: 0 | 1
  onSelect: (day: string) => void
  /** Arrastre en curso: el día bajo el dedo se resalta. */
  drag: DragState | null
}

function MonthGrid({
  cursor,
  selected,
  today,
  index,
  subjects,
  weekStartsOn,
  onSelect,
  drag,
}: GridProps) {
  const days = useMemo(() => monthGrid(cursor, weekStartsOn), [cursor, weekStartsOn])
  const headers = useMemo(
    () => Array.from({ length: 7 }, (_, i) => WEEKDAYS_SHORT[(i + weekStartsOn) % 7]),
    [weekStartsOn],
  )
  const headerNames = useMemo(
    () => Array.from({ length: 7 }, (_, i) => WEEKDAYS_LONG[(i + weekStartsOn) % 7]),
    [weekStartsOn],
  )

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 px-1.5 lg:px-0 pt-3 pb-2 lg:pb-2.5">
        {headers.map((label, i) => (
          <abbr
            key={i}
            title={headerNames[i]}
            className="text-center lg:text-right lg:pr-3 text-[0.6875rem] lg:text-[0.8125rem] font-semibold max-lg:uppercase max-lg:tracking-[0.06em] text-ink-3"
            style={{ textDecoration: 'none' }}
          >
            <span className="lg:hidden">{label}</span>
            {/* En el iPad, «lun», «mar»…, como Calendario. */}
            <span className="max-lg:hidden">{headerNames[i].slice(0, 3).toLowerCase()}</span>
          </abbr>
        ))}
      </div>

      <div className="grid grid-cols-7 px-1.5 pb-1.5 lg:p-0">
        {days.map((day, i) => {
          const items = index.get(day) ?? []
          const inMonth = isSameMonth(day, cursor)
          const isToday = day === today
          const isSelected = day === selected
          const date = parseDay(day)
          const weekend = date.getDay() === 0 || date.getDay() === 6
          const { shown, hidden, done } = cellItems(items, 3)

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              aria-label={`${formatDayMonth(day)}${items.length ? `, ${items.length} elementos` : ', sin nada'}`}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              data-drop-day={day}
              className={cx(
                'group relative flex flex-col items-center gap-1 pt-1.5 pb-1 rounded-[12px] text-left',
                'min-h-[3.375rem] lg:min-h-[7.25rem] lg:items-stretch lg:rounded-none lg:px-1.5 lg:pt-1.5 lg:pb-2',
                // Líneas finas entre semanas y días, como el mes de Calendario.
                'lg:border-t lg:border-hairline',
                i % 7 !== 6 && 'lg:border-r',
                'transition-colors duration-200 lg:hover:bg-fill/50',
                // Como Calendario: el fin de semana, apenas sombreado; el
                // día elegido se marca solo con el círculo.
                weekend && 'lg:bg-fill/35',
                drag?.over === day && 'bg-accent-quiet ring-2 ring-accent ring-inset',
              )}
            >
              <span
                className={cx(
                  'grid place-items-center size-[2.125rem] rounded-full text-[1.0625rem] tabular-nums shrink-0',
                  'lg:self-end lg:size-[1.875rem] lg:text-[1rem] lg:mr-0.5',
                  'transition-[background-color,color,transform] duration-300 ease-[var(--spring)] group-active:scale-90',
                  isToday
                    ? 'bg-accent-fill text-white font-semibold'
                    : isSelected
                      ? 'bg-ink text-canvas font-semibold'
                      : inMonth
                        ? 'text-ink font-semibold'
                        : 'text-ink-3/50 font-medium',
                )}
              >
                {date.getDate()}
              </span>

              {/* Móvil: puntos, como Calendario de iOS. La forma distingue el
                  tipo (examen = rombo) además del color. */}
              <span className="lg:hidden flex items-center justify-center gap-[3px] h-1.5">
                {items.slice(0, 3).map((item) => (
                  <span
                    key={`${item.kind}-${item.id}`}
                    aria-hidden
                    className={cx(
                      'size-[5px] shrink-0',
                      KIND_STYLE[item.kind].shape,
                      item.done && 'opacity-40',
                    )}
                    style={{ background: dotColor(item, subjects) }}
                  />
                ))}
              </span>

              {/* iPad y ordenador: lo pendiente se lee; lo ya hecho se resume
                  en un contador discreto en vez de llenar el día de tachados. */}
              <span className={cx('max-lg:hidden flex flex-col gap-[3px] w-full min-w-0 mt-1', !inMonth && 'opacity-55')}>
                {shown.map((item) => (
                  <ItemChip
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    subject={subjects.get(item.subjectId ?? '')}
                  />
                ))}
                {(hidden > 0 || done > 0) && (
                  <span className="flex items-center gap-2 px-1.5 pt-px text-[0.6875rem] font-medium text-ink-3 tabular-nums">
                    {hidden > 0 && <span>{hidden} más</span>}
                    {done > 0 && (
                      <span className="inline-flex items-center gap-0.5" title={`${done} hecha${done === 1 ? '' : 's'}`}>
                        <Check className="size-3" strokeWidth={2.6} />
                        {done}
                      </span>
                    )}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Qué cabe en una celda: primero los exámenes, luego lo pendiente por hora.
 * Lo completado no ocupa sitio, solo se cuenta.
 */
function cellItems(items: DayItem[], max: number) {
  const open = items.filter((item) => !item.done)
  const ordered = [
    ...open.filter((item) => item.kind === 'examen'),
    ...open.filter((item) => item.kind !== 'examen'),
  ]
  const room = ordered.length > max ? max - 1 : max
  return {
    shown: ordered.slice(0, room),
    hidden: ordered.length - Math.min(room, ordered.length),
    done: items.length - open.length,
  }
}

function dotColor(item: DayItem, subjects: Map<string, Subject>): string {
  const subject = subjects.get(item.subjectId ?? '')
  return subject ? colorVar(subject.color) : 'var(--c-ink-3)'
}

/**
 * Una línea por elemento, como los eventos del mes de Calendario: fondo
 * tenue del color de la asignatura, barra a la izquierda y el título entero
 * hasta donde quepa. El examen va más marcado; el evento, sin fondo.
 */
function ItemChip({ item, subject }: { item: DayItem; subject?: Subject }) {
  const color = subject ? colorVar(subject.color) : 'var(--c-ink-3)'
  const exam = item.kind === 'examen'
  const event = item.kind === 'evento'

  return (
    <span
      className={cx(
        'relative flex items-center gap-1.5 min-w-0 h-[1.375rem] pl-2 pr-1.5 rounded-[6px] overflow-hidden',
        'text-[0.75rem] leading-none',
        exam ? 'font-semibold' : 'font-medium',
        item.done && 'opacity-50',
      )}
      style={{
        background: event
          ? undefined
          : `color-mix(in oklab, ${color} ${exam ? 22 : 12}%, transparent)`,
        color: exam ? `color-mix(in oklab, ${color} 70%, var(--c-ink))` : 'var(--c-ink)',
      }}
    >
      <span
        aria-hidden
        className={cx(
          'shrink-0',
          event ? 'size-1.5 rounded-[2px]' : 'absolute left-0 inset-y-0 w-[3px]',
        )}
        style={{ background: color }}
      />
      <span className="truncate">
        {item.title}
      </span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Vista de semana
// ---------------------------------------------------------------------------

function WeekColumns({
  cursor,
  selected,
  today,
  index,
  subjects,
  weekStartsOn,
  onSelect,
  drag,
}: GridProps) {
  const start = startOfWeek(cursor, weekStartsOn)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => {
          const items = index.get(day) ?? []
          const date = parseDay(day)
          const isToday = day === today

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              aria-label={`${formatDayMonth(day)}${items.length ? `, ${items.length} elementos` : ', sin nada'}`}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={day === selected}
              data-drop-day={day}
              className={cx(
                'flex flex-col text-left p-2.5 min-h-[9rem]',
                'border-b border-r border-hairline last:border-r-0',
                'transition-colors duration-150',
                day === selected ? 'bg-accent-quiet' : 'hover:bg-fill/60',
                drag?.over === day && 'ring-2 ring-accent ring-inset',
              )}
            >
              <span className="flex items-baseline gap-1.5 mb-2">
                <span className="eyebrow">{WEEKDAYS_SHORT[date.getDay()]}</span>
                <span
                  className={cx(
                    'text-[0.9375rem] tabular-nums',
                    isToday ? 'text-accent font-bold' : 'text-ink font-medium',
                  )}
                >
                  {date.getDate()}
                </span>
              </span>

              <span className="flex flex-col gap-1 min-w-0">
                {items.length === 0 ? (
                  <span className="text-[0.6875rem] text-ink-3">—</span>
                ) : (
                  [...items.filter((x) => !x.done), ...items.filter((x) => x.done)].map((item) => (
                    <ItemChip
                      key={`${item.kind}-${item.id}`}
                      item={item}
                      subject={subjects.get(item.subjectId ?? '')}
                    />
                  ))
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel del día seleccionado
// ---------------------------------------------------------------------------

function DayPanel({
  day,
  today,
  items,
  subjects,
  onCreate,
  onOpen,
  onDragStart,
  colorOf,
  drag,
  expanded,
}: {
  day: string
  today: string
  items: DayItem[]
  subjects: Map<string, Subject>
  onCreate: (kind: 'tarea' | 'examen' | 'evento') => void
  onOpen: (item: DayItem) => void
  onDragStart: ReturnType<typeof useDragToDay>['start']
  colorOf: (subjectId?: string) => string
  drag: DragState | null
  expanded?: boolean
}) {
  const { data } = useStore()
  const isToday = day === today

  const date = parseDay(day)

  return (
    <section className={cx('xl:sticky xl:top-6', expanded && 'xl:static')}>
      <div className="flex items-end justify-between gap-3 px-1 mb-2.5">
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.04em] text-ink-3">
            {isToday ? 'Hoy' : WEEKDAYS_LONG[date.getDay()]}
          </p>
          <h2 className="text-[1.375rem] font-bold tracking-[-0.014em] leading-tight">
            {date.getDate()} de {MONTHS_LONG[date.getMonth()]}
          </h2>
        </div>
      </div>

      <div className="card overflow-hidden">
        {items.length === 0 ? (
          <EmptyState
            compact
            icon={<ListPlus className="size-5" />}
            title="Nada este día"
            description="Crea una tarea, un examen o un evento con esta fecha ya puesta."
          />
        ) : (
          <ul>
            {items.map((item, i) => {
              const subject = subjects.get(item.subjectId ?? '')
              const color = subject ? colorVar(subject.color) : 'var(--c-ink-3)'
              const exam = item.kind === 'examen' ? data.exams.find((e) => e.id === item.id) : null
              const editable = true

              const body = (
                <>
                  {/* Hora a la izquierda y barra de color, como la agenda de iOS. */}
                  <span className="w-[4.5rem] shrink-0 pt-px text-right whitespace-nowrap">
                    {item.time ? (
                      <span className="text-[0.8125rem] font-semibold tabular-nums text-ink-2">
                        {item.time}
                      </span>
                    ) : (
                      <span className="text-[0.75rem] font-medium text-ink-3">
                        todo el día
                      </span>
                    )}
                  </span>
                  <span
                    aria-hidden
                    className={cx('w-[3px] self-stretch rounded-full shrink-0', item.done && 'opacity-40')}
                    style={{ background: color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cx(
                        'text-[0.9375rem] leading-snug',
                        item.done ? 'text-ink-3' : 'text-ink',
                        item.kind === 'examen' && 'font-semibold',
                      )}
                    >
                      {item.title}
                    </p>
                    <p className="text-[0.75rem] text-ink-3 mt-0.5 truncate">
                      {item.done ? 'Hecha' : KIND_STYLE[item.kind].label}
                      {subject && ` · ${subject.name}`}
                    </p>
                    {exam?.topics && (
                      <p className="text-[0.75rem] text-ink-2 mt-1 leading-relaxed">
                        {exam.topics}
                      </p>
                    )}
                  </div>
                  {item.done && <Check className="size-4 text-ok shrink-0 mt-0.5" strokeWidth={2.6} />}
                </>
              )

              return (
                <li
                  key={item.id}
                  className={cx(
                    i > 0 && 'inset-separator',
                    'relative',
                    drag?.taskId === item.id && 'opacity-40',
                  )}
                  // Las tareas se pueden llevar a otro día arrastrando.
                  onPointerDown={
                    item.kind === 'tarea' && !item.done
                      ? onDragStart({ id: item.id, title: item.title }, colorOf(item.subjectId))
                      : undefined
                  }
                >
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => onOpen(item)}
                      aria-label={`Editar ${KIND_STYLE[item.kind].label.toLowerCase()}: ${item.title}`}
                      className="w-full text-left flex items-start gap-2.5 pl-2 pr-4 py-3 active:bg-fill hover:bg-fill/50 transition-colors duration-150"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-start gap-3 px-4 py-3">{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-3 px-1">
        <Button size="sm" onClick={() => onCreate('tarea')}>
          <Plus className="size-3.5" strokeWidth={2.6} />
          Tarea
        </Button>
        <Button size="sm" onClick={() => onCreate('examen')}>
          <Plus className="size-3.5" strokeWidth={2.6} />
          Examen
        </Button>
        <Button size="sm" onClick={() => onCreate('evento')}>
          <Plus className="size-3.5" strokeWidth={2.6} />
          Evento
        </Button>
      </div>
    </section>
  )
}
