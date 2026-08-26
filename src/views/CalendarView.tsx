import { useMemo, useState } from 'react'
import { CalendarPlus, ChevronLeft, ChevronRight, ListPlus, Plus } from 'lucide-react'

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
import type { Subject } from '@/domain/types'
import { useStore, useSettings, useToday } from '@/state/StoreProvider'
import { useCalendarIndex, useSubjectMap, type DayItem } from '@/state/selectors'
import { Page, PageHeader } from '@/layout/AppShell'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import { ExamEditor } from '@/features/exams/ExamEditor'
import { EventEditor } from '@/features/events/EventEditor'
import { Button, Card, EmptyState, IconButton, Segmented, cx } from '@/ui/primitives'

type CalendarMode = 'mes' | 'semana' | 'dia'

/** Marca de tipo: forma distinta por tipo, no solo color. */
const KIND_STYLE: Record<DayItem['kind'], { label: string; shape: string }> = {
  tarea: { label: 'Tarea', shape: 'rounded-full' },
  examen: { label: 'Examen', shape: 'rounded-[1px] rotate-45' },
  evento: { label: 'Evento', shape: 'rounded-[2px]' },
  estudio: { label: 'Estudio', shape: 'rounded-full opacity-55' },
}

export function CalendarView() {
  const settings = useSettings()
  const today = useToday()
  const index = useCalendarIndex()
  const subjects = useSubjectMap()

  const [mode, setMode] = useState<CalendarMode>('mes')
  const [cursor, setCursor] = useState(today)
  const [selected, setSelected] = useState(today)
  const [creating, setCreating] = useState<'tarea' | 'examen' | 'evento' | null>(null)

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
          <>
            <Button variant="secondary" onClick={() => setCreating('evento')}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">Evento</span>
            </Button>
            <Button variant="primary" onClick={() => setCreating('examen')}>
              <CalendarPlus className="size-4" />
              <span className="hidden sm:inline">Examen</span>
            </Button>
          </>
        }
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <IconButton label="Anterior" onClick={() => step(-1)} variant="secondary" size="sm">
                <ChevronLeft className="size-4" />
              </IconButton>
              <IconButton label="Siguiente" onClick={() => step(1)} variant="secondary" size="sm">
                <ChevronRight className="size-4" />
              </IconButton>
              <h2 className="display text-[1.25rem] tracking-[-0.02em] ml-1 first-letter:uppercase">
                {heading}
              </h2>
              <Button variant="ghost" size="sm" onClick={goToday} className="ml-1">
                Hoy
              </Button>
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
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
        <div className="lg:col-span-8">
          {mode === 'mes' && (
            <MonthGrid
              cursor={cursor}
              selected={selected}
              today={today}
              index={index}
              subjects={subjects}
              weekStartsOn={settings.weekStartsOn}
              onSelect={setSelected}
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
            />
          )}
          {mode === 'dia' && (
            <DayPanel
              day={cursor}
              today={today}
              items={index.get(cursor) ?? []}
              subjects={subjects}
              onCreate={setCreating}
              expanded
            />
          )}
        </div>

        {mode !== 'dia' && (
          <div className="lg:col-span-4">
            <DayPanel
              day={selected}
              today={today}
              items={index.get(selected) ?? []}
              subjects={subjects}
              onCreate={setCreating}
            />
          </div>
        )}
      </div>

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
}

function MonthGrid({ cursor, selected, today, index, subjects, weekStartsOn, onSelect }: GridProps) {
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
    <Card flush className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-hairline">
        {headers.map((label, i) => (
          <div key={i} className="py-2.5 text-center">
            <abbr
              title={headerNames[i]}
              className="eyebrow no-underline"
              style={{ textDecoration: 'none' }}
            >
              {label}
            </abbr>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const items = index.get(day) ?? []
          const inMonth = isSameMonth(day, cursor)
          const isToday = day === today
          const isSelected = day === selected
          const date = parseDay(day)

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              aria-label={`${formatDayMonth(day)}${items.length ? `, ${items.length} elementos` : ', sin nada'}`}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              className={cx(
                'relative flex flex-col items-start gap-1 p-1.5 sm:p-2',
                'min-h-[5.5rem] sm:min-h-[6.5rem] text-left',
                'border-b border-r border-hairline',
                '[&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0',
                'transition-colors duration-150',
                !inMonth && 'bg-sunken/35',
                isSelected ? 'bg-accent-quiet' : 'hover:bg-sunken/60',
              )}
            >
              <span
                className={cx(
                  'inline-grid place-items-center size-6 rounded-full text-[0.8125rem] tabular-nums shrink-0',
                  isToday
                    ? 'bg-accent text-accent-ink font-bold'
                    : inMonth
                      ? 'text-ink font-medium'
                      : 'text-ink-3',
                )}
              >
                {date.getDate()}
              </span>

              <span className="flex flex-col gap-0.5 w-full min-w-0">
                {items.slice(0, 2).map((item) => (
                  <ItemChip key={item.id} item={item} subject={subjects.get(item.subjectId ?? '')} />
                ))}
                {items.length > 2 && (
                  <span className="text-[0.6875rem] text-ink-3 pl-0.5 tabular-nums">
                    +{items.length - 2} más
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function ItemChip({ item, subject }: { item: DayItem; subject?: Subject }) {
  const color = subject ? colorVar(subject.color) : 'var(--c-ink-3)'
  const style = KIND_STYLE[item.kind]

  return (
    <span
      className={cx(
        'flex items-center gap-1 min-w-0 px-1 py-px rounded-[3px]',
        'text-[0.6875rem] leading-tight',
        item.kind === 'examen' ? 'font-semibold' : 'font-normal',
        item.done && 'opacity-45 line-through',
      )}
      style={item.kind === 'examen' ? { background: `color-mix(in oklab, ${color} 14%, transparent)` } : undefined}
    >
      <span
        aria-hidden
        className={cx('size-1.5 shrink-0', style.shape)}
        style={{ background: color }}
      />
      <span className="truncate" style={item.kind === 'examen' ? { color } : undefined}>
        {item.title}
      </span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Vista de semana
// ---------------------------------------------------------------------------

function WeekColumns({ cursor, selected, today, index, subjects, weekStartsOn, onSelect }: GridProps) {
  const start = startOfWeek(cursor, weekStartsOn)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))

  return (
    <Card flush className="overflow-hidden">
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
              className={cx(
                'flex flex-col text-left p-3 min-h-[9rem]',
                'border-b border-r border-hairline last:border-r-0',
                'transition-colors duration-150',
                day === selected ? 'bg-accent-quiet' : 'hover:bg-sunken/60',
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
                  items.map((item) => (
                    <ItemChip key={item.id} item={item} subject={subjects.get(item.subjectId ?? '')} />
                  ))
                )}
              </span>
            </button>
          )
        })}
      </div>
    </Card>
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
  expanded,
}: {
  day: string
  today: string
  items: DayItem[]
  subjects: Map<string, Subject>
  onCreate: (kind: 'tarea' | 'examen' | 'evento') => void
  expanded?: boolean
}) {
  const { data } = useStore()
  const isToday = day === today

  return (
    <Card flush className={cx('lg:sticky lg:top-6', expanded && 'lg:static')}>
      <header className="px-5 pt-5 pb-4 border-b border-hairline">
        <p className="eyebrow">{isToday ? 'Hoy' : 'Día seleccionado'}</p>
        <h2 className="display text-[1.25rem] tracking-[-0.02em] mt-1 first-letter:uppercase">
          {formatDayMonth(day)}
        </h2>
      </header>

      {items.length === 0 ? (
        <EmptyState
          compact
          icon={<ListPlus className="size-4" />}
          title="Nada este día"
          description="Puedes crear aquí una tarea, un examen o un evento con esta fecha ya puesta."
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {items.map((item) => {
            const subject = subjects.get(item.subjectId ?? '')
            const color = subject ? colorVar(subject.color) : 'var(--c-ink-3)'
            const exam = item.kind === 'examen' ? data.exams.find((e) => e.id === item.id) : null

            return (
              <li key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                <span
                  aria-hidden
                  className={cx('mt-1.5 size-2 shrink-0', KIND_STYLE[item.kind].shape)}
                  style={{ background: color }}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cx(
                      'text-[0.875rem] leading-snug',
                      item.done ? 'text-ink-3 line-through' : 'text-ink',
                      item.kind === 'examen' && 'font-semibold',
                    )}
                  >
                    {item.title}
                  </p>
                  <p className="text-[0.75rem] text-ink-3 mt-0.5">
                    {KIND_STYLE[item.kind].label}
                    {subject && ` · ${subject.name}`}
                    {item.time && ` · ${item.time}`}
                  </p>
                  {exam?.topics && (
                    <p className="text-[0.75rem] text-ink-2 mt-1.5 leading-relaxed">{exam.topics}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="px-5 py-4 border-t border-hairline flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => onCreate('tarea')}>
          <Plus className="size-3.5" />
          Tarea
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onCreate('examen')}>
          <Plus className="size-3.5" />
          Examen
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onCreate('evento')}>
          <Plus className="size-3.5" />
          Evento
        </Button>
      </div>
    </Card>
  )
}
