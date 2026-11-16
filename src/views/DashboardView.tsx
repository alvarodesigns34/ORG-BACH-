import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import {
  BellRing,
  CalendarRange,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  GraduationCap,
  GripHorizontal,
  History,
  ListChecks,
  Mic,
  Minus,
  NotebookPen,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Target,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'

import {
  WEEKDAYS_SHORT,
  addDays,
  daysUntil,
  formatLongDate,
  greeting,
  parseDay,
  toDay,
} from '@/domain/dates'
import { formatGrade, numeralTone } from '@/domain/grades'
import { colorVar, quietVar } from '@/domain/palette'
import { classesOn, dayStatus, formatMinutes } from '@/domain/schedule'
import { gradeTimeline } from '@/domain/stats'
import {
  HOME_WIDGETS,
  TERMS,
  type Exam,
  type HomeWidgetId,
  type Subject,
  type Task,
} from '@/domain/types'
import { hrefFor } from '@/router'
import { useDispatch, useSettings, useStore, useToday } from '@/state/StoreProvider'
import {
  useAlerts,
  useCalendarIndex,
  useGlobalAverage,
  useGoalsProgress,
  useSubjectMap,
  useSubjects,
  useTaskSummary,
  useUpcomingExams,
} from '@/state/selectors'
import { Page, PageHeader } from '@/layout/AppShell'
import { useAmbient, useChrome } from '@/layout/chrome'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import { TaskList } from '@/features/tasks/TaskRow'
import { ExamEditor } from '@/features/exams/ExamEditor'
import { ExamCard } from '@/features/exams/ExamCard'
import { Ring, Sparkline } from '@/ui/charts'
import { exitFast, haptic, spring } from '@/ui/motion'
import { Button, CountUp, cx } from '@/ui/primitives'
import { BackupNudge } from '@/features/backup/Backups'
import { FlightBanner } from '@/features/study/FlightBanner'

// ---------------------------------------------------------------------------
// Catálogo de tarjetas
// ---------------------------------------------------------------------------

const WIDGETS: Record<
  HomeWidgetId,
  { label: string; icon: LucideIcon; tint: string; size: 'sm' | 'lg' | 'xl'; href?: string }
> = {
  ahora: { label: 'Ahora', icon: Clock3, tint: '#0a84ff', size: 'xl' },
  hoy: { label: 'Para hoy', icon: ListChecks, tint: '#5e5ce6', size: 'lg', href: hrefFor('tareas') },
  examenes: {
    label: 'Exámenes',
    icon: NotebookPen,
    tint: '#ff453a',
    size: 'lg',
    href: hrefFor('calendario'),
  },
  media: {
    label: 'Media',
    icon: GraduationCap,
    tint: '#bf5af2',
    size: 'sm',
    href: hrefFor('notas'),
  },
  semana: {
    label: 'Próximos 7 días',
    icon: CalendarRange,
    tint: '#ff9f0a',
    size: 'lg',
    href: hrefFor('calendario'),
  },
  objetivos: {
    label: 'Objetivos',
    icon: Target,
    tint: '#ff375f',
    size: 'sm',
    href: hrefFor('objetivos'),
  },
  // Ancho completo: los avisos son frases largas y, a media fila, dejaban
  // un hueco vacío al lado.
  avisos: { label: 'Avisos', icon: BellRing, tint: '#ff9f0a', size: 'xl' },
  actividad: { label: 'Actividad reciente', icon: History, tint: '#8e8e93', size: 'lg' },
}

const SPAN = {
  sm: 'col-span-1',
  lg: 'col-span-2',
  xl: 'col-span-2 md:col-span-4',
} as const

/** Reloj que avanza solo: la tarjeta «Ahora» no puede quedarse parada. */
function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const id = window.setInterval(tick, 20_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return now
}

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

/**
 * Inicio: lo que hay que saber en diez segundos.
 *
 * Es un tablero de tarjetas que el alumno coloca a su gusto. «Personalizar»
 * las pone a temblar, como los iconos de iOS: se quitan con «−», se arrastran
 * por el tirador para cambiarlas de sitio y las ocultas esperan en la bandeja
 * de abajo. La disposición se guarda en los ajustes y viaja con la cuenta.
 */
export function DashboardView({ hasSubjects }: { hasSubjects: boolean }) {
  const settings = useSettings()
  const dispatch = useDispatch()
  const today = useToday()
  const { openAssistant } = useChrome()
  const summary = useTaskSummary()
  const exams = useUpcomingExams(3)
  const subjects = useSubjectMap()
  const alerts = useHomeAlerts()

  const [editing, setEditing] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [creatingTask, setCreatingTask] = useState(false)
  const [creatingExam, setCreatingExam] = useState(false)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)

  const { order, hidden } = settings.home
  const visible = order.filter((id) => !hidden.includes(id))
  // Sin avisos no hay tarjeta: un bloque vacío ocupa sitio y no informa.
  // Mientras se personaliza sí se ve, para poder colocarla.
  const shown = visible.filter((id) => editing || id !== 'avisos' || alerts.length > 0)

  const saveHome = (next: { order?: HomeWidgetId[]; hidden?: HomeWidgetId[] }) =>
    dispatch({
      type: 'settings/update',
      patch: { home: { order: next.order ?? order, hidden: next.hidden ?? hidden } },
    })

  // --- Reordenar arrastrando ---
  const frames = useRef(new Map<HomeWidgetId, HTMLElement>())
  const lastMove = useRef(0)
  const dragOver = (id: HomeWidgetId, point: { x: number; y: number }) => {
    // Tras cada cambio las tarjetas se recolocan animadas; sin esta pausa, la
    // que acaba de apartarse volvería a pasar bajo el dedo y se desharía.
    if (performance.now() - lastMove.current < 320) return
    const x = point.x - window.scrollX
    const y = point.y - window.scrollY
    for (const [other, node] of frames.current) {
      if (other === id) continue
      const rect = node.getBoundingClientRect()
      const padX = rect.width * 0.18
      const padY = rect.height * 0.18
      if (
        x > rect.left + padX &&
        x < rect.right - padX &&
        y > rect.top + padY &&
        y < rect.bottom - padY
      ) {
        const next = [...order]
        const from = next.indexOf(id)
        const to = next.indexOf(other)
        next.splice(from, 1)
        next.splice(to, 0, id)
        lastMove.current = performance.now()
        haptic()
        saveHome({ order: next })
        return
      }
    }
  }

  const firstName = settings.userName.split(' ')[0]
  const nextExam = exams.find((e) => e.date >= today)

  // Una frase que resume el día, bajo el saludo.
  const brief = useMemo(() => {
    const parts: string[] = []
    const n = summary.today.length
    parts.push(n === 0 ? 'Nada pendiente para hoy' : n === 1 ? '1 tarea para hoy' : `${n} tareas para hoy`)
    if (nextExam) {
      const days = daysUntil(nextExam.date, today)
      const name = subjects.get(nextExam.subjectId)?.shortName ?? 'examen'
      parts.push(
        days === 0
          ? `examen de ${name} hoy`
          : days === 1
            ? `examen de ${name} mañana`
            : `examen de ${name} en ${days} días`,
      )
    }
    return parts.join(' · ')
  }, [summary.today.length, nextExam, today, subjects])

  const renderWidget = (id: HomeWidgetId): ReactNode => {
    switch (id) {
      case 'ahora':
        return <NowWidget hasSubjects={hasSubjects} />
      case 'hoy':
        return (
          <TodayWidget
            onOpen={setEditingTask}
            onCreate={() => setCreatingTask(true)}
            subjects={subjects}
          />
        )
      case 'examenes':
        return (
          <ExamsWidget
            exams={exams}
            subjects={subjects}
            hasSubjects={hasSubjects}
            onOpen={setEditingExam}
            onCreate={() => setCreatingExam(true)}
          />
        )
      case 'media':
        return <AverageWidget />
      case 'semana':
        return <WeekWidget />
      case 'objetivos':
        return <GoalsWidget />
      case 'avisos':
        return <AlertsWidget alerts={alerts} />
      case 'actividad':
        return <ActivityWidget subjects={subjects} />
    }
  }

  return (
    <Page>
      <PageHeader
        eyebrow={formatLongDate(today)}
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        subtitle={brief}
        compactTitle="Inicio"
      />

      {/* --- Asistente: lo primero a mano, como la barra de Spotlight --- */}
      <button
        type="button"
        onClick={openAssistant}
        disabled={editing}
        className="pressable liquid w-full flex items-center gap-3 pl-5 pr-2 h-14 mb-4 text-left rounded-full disabled:opacity-50"
      >
        <span className="relative z-[2] flex-1 text-[1rem] text-ink-3 truncate">
          Pregúntame o dime qué apuntar…
        </span>
        <span className="relative z-[2] grid place-items-center size-10 rounded-full bg-accent-fill text-white shrink-0 shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_4px_12px_rgb(0_113_227/0.35)]">
          <Mic className="size-5" strokeWidth={2.3} />
        </span>
      </button>

      {/* --- Vuelo en curso del modo estudio --- */}
      <FlightBanner />

      {/* --- Recordatorio de copia, solo sin cuenta y de tarde en tarde --- */}
      <BackupNudge />

      {/* --- Tablero --- */}
      <div className="grid grid-cols-2 md:grid-cols-4 grid-flow-dense gap-3 sm:gap-4">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((id, index) => (
            <WidgetFrame
              key={id}
              id={id}
              index={index}
              editing={editing}
              register={(node) => {
                if (node) frames.current.set(id, node)
                else frames.current.delete(id)
              }}
              onDragOver={dragOver}
              onRemove={() => {
                haptic()
                saveHome({ hidden: [...hidden, id] })
              }}
            >
              {renderWidget(id)}
            </WidgetFrame>
          ))}
        </AnimatePresence>
      </div>

      {shown.length === 0 && !editing && (
        <p className="text-center text-[0.9375rem] text-ink-3 py-10">
          Has quitado todas las tarjetas. Toca «Personalizar» para volver a poner alguna.
        </p>
      )}

      <div className="flex justify-center mt-7">
        <Button
          size="sm"
          onClick={() => {
            haptic()
            setEditing((v) => !v)
          }}
        >
          <SlidersHorizontal className="size-3.5" strokeWidth={2.4} />
          {editing ? 'Terminar' : 'Personalizar Inicio'}
        </Button>
      </div>

      <EditTray
        open={editing}
        hidden={HOME_WIDGETS.filter((id) => hidden.includes(id))}
        onAdd={(id) => {
          haptic()
          saveHome({ hidden: hidden.filter((h) => h !== id) })
        }}
        onDone={() => setEditing(false)}
      />

      <TaskEditor open={!!editingTask} task={editingTask} onClose={() => setEditingTask(null)} />
      <TaskEditor open={creatingTask} onClose={() => setCreatingTask(false)} />
      <ExamEditor open={creatingExam} onClose={() => setCreatingExam(false)} />
      <ExamEditor open={!!editingExam} exam={editingExam} onClose={() => setEditingExam(null)} />
    </Page>
  )
}

/** Avisos de Inicio: sin los que ya cuentan otras tarjetas (tareas, exámenes). */
function useHomeAlerts() {
  const alerts = useAlerts()
  return useMemo(() => {
    const order = { critico: 0, aviso: 1, info: 2 } as const
    return alerts
      .filter(
        (a) =>
          a.id !== 'tareas-atrasadas' &&
          a.id !== 'examenes-proximos' &&
          !a.id.startsWith('examen-'),
      )
      .sort((a, b) => order[a.level] - order[b.level])
      .slice(0, 3)
  }, [alerts])
}

// ---------------------------------------------------------------------------
// Marco de tarjeta y modo edición
// ---------------------------------------------------------------------------

function WidgetFrame({
  id,
  index,
  editing,
  register,
  onDragOver,
  onRemove,
  children,
}: {
  id: HomeWidgetId
  index: number
  editing: boolean
  register: (node: HTMLElement | null) => void
  onDragOver: (id: HomeWidgetId, point: { x: number; y: number }) => void
  onRemove: () => void
  children: ReactNode
}) {
  const controls = useDragControls()
  const meta = WIDGETS[id]

  return (
    <motion.div
      ref={register}
      layout={editing ? 'position' : false}
      initial={{ opacity: 0, scale: 0.86 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, transition: exitFast }}
      transition={spring.smooth}
      drag={editing}
      dragControls={controls}
      dragListener={false}
      dragSnapToOrigin
      dragElastic={1}
      onDrag={(_, info) => onDragOver(id, info.point)}
      whileDrag={{ scale: 1.04, zIndex: 40 }}
      className={cx('relative min-w-0', SPAN[meta.size])}
    >
      <div
        className={cx('h-full', editing && 'animate-jiggle')}
        style={{ '--i': index } as React.CSSProperties}
      >
        {/* En edición el contenido no responde: se está colocando, no usando. */}
        <div
          className="h-full [&[inert]_.widget-action]:opacity-0 [&_.widget-action]:transition-opacity"
          inert={editing}
        >
          {children}
        </div>
      </div>

      <AnimatePresence>
        {editing && (
          <>
            <motion.button
              key="quitar"
              type="button"
              aria-label={`Quitar ${meta.label} de Inicio`}
              onClick={onRemove}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={spring.bouncy}
              className="absolute -top-2 -left-2 z-10 grid place-items-center size-7 rounded-full bg-[#636366] text-white shadow-md"
            >
              <Minus className="size-4" strokeWidth={3} />
            </motion.button>
            <motion.button
              key="mover"
              type="button"
              aria-label={`Mover ${meta.label}`}
              onPointerDown={(event) => controls.start(event)}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={spring.bouncy}
              className="liquid absolute top-2 right-2 z-10 grid place-items-center h-9 w-12 rounded-full text-ink-2 touch-none cursor-grab active:cursor-grabbing"
            >
              <GripHorizontal className="relative z-[2] size-5" strokeWidth={2.2} />
            </motion.button>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** Bandeja del modo edición: las tarjetas ocultas y «Listo». */
function EditTray({
  open,
  hidden,
  onAdd,
  onDone,
}: {
  open: boolean
  hidden: HomeWidgetId[]
  onAdd: (id: HomeWidgetId) => void
  onDone: () => void
}) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.96, transition: exitFast }}
          transition={spring.bouncy}
          className={cx(
            'liquid fixed z-40 rounded-[28px] p-2',
            'inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))]',
            'lg:left-[calc(272px+3rem)] lg:right-8 lg:bottom-6 lg:max-w-[640px] lg:mx-auto',
          )}
        >
          <div className="relative z-[2] flex items-center gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 pl-1">
              {hidden.length === 0 ? (
                <span className="text-[0.8125rem] text-ink-3 px-2 whitespace-nowrap">
                  Arrastra por el tirador para ordenar
                </span>
              ) : (
                <AnimatePresence initial={false} mode="popLayout">
                  {hidden.map((id) => {
                    const meta = WIDGETS[id]
                    return (
                      <motion.button
                        key={id}
                        layout
                        type="button"
                        onClick={() => onAdd(id)}
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        transition={spring.snappy}
                        className="shrink-0 inline-flex items-center gap-1.5 h-10 pl-1.5 pr-3.5 rounded-full bg-fill text-[0.875rem] font-semibold text-ink"
                      >
                        <span
                          className="grid place-items-center size-7 rounded-full text-white"
                          style={{ background: meta.tint }}
                        >
                          <Plus className="size-4" strokeWidth={2.8} />
                        </span>
                        {meta.label}
                      </motion.button>
                    )
                  })}
                </AnimatePresence>
              )}
            </div>
            <Button variant="primary" size="sm" className="h-10 px-5 shrink-0" onClick={onDone}>
              Listo
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** Tarjeta con cabecera (icono, nombre, enlace) y cuerpo. */
function WidgetCard({
  id,
  action,
  children,
  flush,
  className,
  style,
}: {
  id: HomeWidgetId
  action?: ReactNode
  children: ReactNode
  /** El cuerpo llega hasta los bordes (listas). */
  flush?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const meta = WIDGETS[id]
  const head = (
    <>
      <span
        aria-hidden
        className="grid place-items-center size-[26px] rounded-full text-white shrink-0"
        style={{ background: meta.tint }}
      >
        <meta.icon className="size-[14px]" strokeWidth={2.5} />
      </span>
      <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink truncate">
        {meta.label}
      </h2>
      {meta.href && <ChevronRight className="size-4 text-ink-3 -ml-1" strokeWidth={2.6} />}
    </>
  )
  return (
    <section
      className={cx('card h-full flex flex-col overflow-hidden', className)}
      style={style}
      aria-label={meta.label}
    >
      <header className="flex items-center justify-between gap-2 pl-4 pr-3 pt-3.5 pb-2 min-h-[3rem]">
        {meta.href ? (
          <a href={meta.href} className="pressable flex items-center gap-2 min-w-0 rounded-full">
            {head}
          </a>
        ) : (
          <div className="flex items-center gap-2 min-w-0">{head}</div>
        )}
        {action && <div className="widget-action shrink-0">{action}</div>}
      </header>
      <div className={cx('flex-1 min-h-0 flex flex-col', !flush && 'px-4 pb-4')}>{children}</div>
    </section>
  )
}

function Quiet({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.875rem] leading-snug text-ink-3 text-pretty px-4 pb-4 pt-1">{children}</p>
  )
}

// ---------------------------------------------------------------------------
// Ahora
// ---------------------------------------------------------------------------

/**
 * Qué toca ahora y qué viene después, con el día entero dibujado como una
 * línea de tiempo: cada clase es un tramo del color de su asignatura y una
 * marca señala la hora actual. La luz ambiente de la pantalla toma el color
 * de la clase en curso (o de la siguiente).
 */
function NowWidget({ hasSubjects }: { hasSubjects: boolean }) {
  const subjects = useSubjects()
  const now = useClock()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const classes = useMemo(() => classesOn(subjects, now.getDay()), [subjects, now.getDay()])
  const status = useMemo(() => dayStatus(classes, minutes), [classes, minutes])
  const anySchedule = subjects.some((s) => s.schedule.length > 0)

  const focus = status.current ?? status.next
  useAmbient(focus ? colorVar(focus.subject.color) : null)

  if (!anySchedule) {
    return (
      <WidgetCard id="ahora">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
          <p className="flex-1 text-[0.9375rem] leading-snug text-ink-2 text-pretty">
            Añade tu horario y aquí verás qué clase toca ahora, cuánto le queda y qué viene después.
          </p>
          <Button
            size="sm"
            variant="primary"
            className="self-start shrink-0"
            onClick={() => (window.location.hash = '/asignaturas')}
          >
            {hasSubjects ? 'Poner el horario' : 'Crear asignaturas'}
          </Button>
        </div>
      </WidgetCard>
    )
  }

  if (classes.length === 0) {
    // Sin clase hoy: se mira cuál es la primera del siguiente día con horario.
    let upcoming: { label: string; text: string } | null = null
    for (let offset = 1; offset <= 7 && !upcoming; offset++) {
      const day = new Date(now)
      day.setDate(day.getDate() + offset)
      const first = classesOn(subjects, day.getDay())[0]
      if (first) {
        const label =
          offset === 1
            ? 'Mañana'
            : `El ${day.toLocaleDateString('es-ES', { weekday: 'long' })}`
        upcoming = {
          label,
          text: `empiezas a las ${first.slot.start} con ${first.subject.name}`,
        }
      }
    }
    return (
      <WidgetCard id="ahora">
        <p className="display text-[1.5rem] leading-tight mt-1">Hoy no tienes clase</p>
        {upcoming && (
          <p className="text-[0.9375rem] text-ink-3 mt-1">
            {upcoming.label} {upcoming.text}.
          </p>
        )}
      </WidgetCard>
    )
  }

  const first = classes[0].start
  const last = classes[classes.length - 1].end
  const span = Math.max(1, last - first)
  const pct = (value: number) => `${((value - first) / span) * 100}%`
  const tint = focus ? colorVar(focus.subject.color) : 'var(--c-ink-3)'

  let eyebrow: string
  let title: string
  let detail: string
  if (status.current) {
    eyebrow = `En clase · ${status.current.slot.start} – ${status.current.slot.end}`
    title = status.current.subject.name
    detail = `Quedan ${formatMinutes(status.current.minutesLeft)}`
  } else if (status.next) {
    eyebrow = status.done === 0 ? 'Empiezas' : 'Descanso · después'
    title = status.next.subject.name
    detail = `A las ${status.next.slot.start} · en ${formatMinutes(status.next.startsIn)}`
  } else {
    eyebrow = 'Por hoy'
    title = 'Clases terminadas'
    detail = classes.length === 1 ? '1 clase' : `${classes.length} clases`
  }
  const room = focus ? (focus.slot.room ?? focus.subject.room) : undefined

  return (
    <WidgetCard
      id="ahora"
      style={{
        background: focus
          ? `linear-gradient(140deg, color-mix(in srgb, ${tint} 15%, var(--c-surface)), var(--c-surface) 62%)`
          : undefined,
      }}
      action={
        status.next && status.current ? (
          <span className="text-[0.8125rem] text-ink-3 pr-1 truncate">
            Después: <span className="font-semibold text-ink-2">{status.next.subject.shortName}</span>{' '}
            {status.next.slot.start}
          </span>
        ) : undefined
      }
    >
      <div className="flex items-end justify-between gap-4 mt-1">
        <div className="min-w-0">
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.04em]" style={{ color: tint }}>
            {eyebrow}
          </p>
          <p className="display text-[1.625rem] sm:text-[1.875rem] leading-[1.1] mt-1 text-balance">
            {title}
          </p>
          <p className="text-[0.9375rem] text-ink-2 mt-1 tabular-nums">
            {detail}
            {room && <span className="text-ink-3"> · {room}</span>}
          </p>
        </div>
        {status.current && (
          <Ring
            value={status.current.progress}
            size={54}
            stroke={6}
            color={tint}
            label={`${Math.round(status.current.progress * 100)} % de la clase`}
          />
        )}
      </div>

      {/* --- El día, de la primera clase a la última --- */}
      <div className="mt-5" aria-hidden>
        <div className="relative h-9">
          {classes.map((item, i) => {
            const state = minutes >= item.end ? 'done' : minutes >= item.start ? 'now' : 'next'
            const color = colorVar(item.subject.color)
            return (
              <motion.div
                key={item.slot.id}
                initial={{ opacity: 0, scaleX: 0.4 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ ...spring.smooth, delay: 0.04 * i }}
                className="absolute inset-y-0 rounded-[9px] grid place-items-center overflow-hidden origin-left"
                style={{
                  left: `calc(${pct(item.start)} + 1.5px)`,
                  width: `calc(${((item.end - item.start) / span) * 100}% - 3px)`,
                  background: state === 'now' ? color : quietVar(item.subject.color),
                  color: state === 'now' ? '#fff' : color,
                  opacity: state === 'done' ? 0.5 : 1,
                }}
              >
                <span className="text-[0.6875rem] font-bold truncate px-1">
                  {item.subject.shortName}
                </span>
              </motion.div>
            )
          })}
          {minutes > first && minutes < last && (
            <motion.div
              className="absolute -inset-y-1.5 w-[2.5px] -ml-[1.25px] rounded-full bg-ink shadow-[0_0_0_2px_var(--c-surface)]"
              initial={false}
              animate={{ left: pct(minutes) }}
              transition={spring.smooth}
            />
          )}
        </div>
        <div className="flex justify-between text-[0.6875rem] font-medium text-ink-3 tabular-nums mt-1.5">
          <span>{classes[0].slot.start}</span>
          <span>{classes[classes.length - 1].slot.end}</span>
        </div>
      </div>
      <ul className="sr-only">
        {classes.map((item) => (
          <li key={item.slot.id}>
            {item.slot.start} a {item.slot.end}: {item.subject.name}
          </li>
        ))}
      </ul>
    </WidgetCard>
  )
}

// ---------------------------------------------------------------------------
// Para hoy
// ---------------------------------------------------------------------------

const TODAY_LIMIT = 5

function TodayWidget({
  subjects,
  onOpen,
  onCreate,
}: {
  subjects: Map<string, Subject>
  onOpen: (task: Task) => void
  onCreate: () => void
}) {
  const { data } = useStore()
  const today = useToday()
  const summary = useTaskSummary()
  const doneToday = useMemo(
    () =>
      data.tasks.filter(
        (t) => t.status === 'completada' && t.completedAt && toDay(new Date(t.completedAt)) === today,
      ).length,
    [data.tasks, today],
  )
  const pending = summary.today.length
  const total = pending + doneToday
  const rest = pending - TODAY_LIMIT

  return (
    <WidgetCard
      id="hoy"
      flush
      action={
        total > 0 ? (
          <span className="flex items-center gap-2 pr-1">
            <span className="text-[0.8125rem] font-semibold text-ink-3 tabular-nums">
              {doneToday}/{total}
            </span>
            <Ring
              value={doneToday / total}
              size={26}
              stroke={4}
              color="var(--c-switch-on)"
              label={`${doneToday} de ${total} hechas hoy`}
            >
              {pending === 0 && <Check className="size-3 text-ok" strokeWidth={4} />}
            </Ring>
          </span>
        ) : (
          <button type="button" className="group-link px-1" onClick={onCreate}>
            Añadir
          </button>
        )
      }
    >
      {pending === 0 ? (
        <Quiet>
          {doneToday > 0
            ? 'Todo lo de hoy está hecho. Buen momento para adelantar algo de mañana.'
            : 'Nada vence hoy ni tienes tareas atrasadas.'}
        </Quiet>
      ) : (
        <>
          <TaskList tasks={summary.today.slice(0, TODAY_LIMIT)} subjects={subjects} onOpen={onOpen} />
          {rest > 0 && (
            <a
              href={hrefFor('tareas', { vista: 'hoy' })}
              className="block px-4 py-3 text-[0.9375rem] font-medium text-accent border-t border-hairline active:bg-fill"
            >
              {rest === 1 ? 'Y 1 más' : `Y ${rest} más`}
            </a>
          )}
        </>
      )}
    </WidgetCard>
  )
}

// ---------------------------------------------------------------------------
// Exámenes
// ---------------------------------------------------------------------------

function ExamsWidget({
  exams,
  subjects,
  hasSubjects,
  onOpen,
  onCreate,
}: {
  exams: Exam[]
  subjects: Map<string, Subject>
  hasSubjects: boolean
  onOpen: (exam: Exam) => void
  onCreate: () => void
}) {
  const today = useToday()
  return (
    <WidgetCard
      id="examenes"
      flush
      action={
        hasSubjects ? (
          <button type="button" className="group-link px-1" onClick={onCreate}>
            Añadir
          </button>
        ) : undefined
      }
    >
      {exams.length === 0 ? (
        <Quiet>
          {hasSubjects
            ? 'Sin exámenes apuntados. Apunta el próximo en cuanto lo sepas y verás aquí la cuenta atrás.'
            : 'Crea alguna asignatura y luego apunta sus exámenes.'}
        </Quiet>
      ) : (
        <ul>
          {exams.map((exam, i) => (
            <li key={exam.id} className={cx(i > 0 && 'inset-separator-wide')}>
              <ExamCard exam={exam} subject={subjects.get(exam.subjectId)} today={today} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

function AverageWidget() {
  const settings = useSettings()
  const { data } = useStore()
  const subjects = useSubjects()
  const average = useGlobalAverage(settings.activeTerm)
  const scale = settings.gradeScale
  const term = TERMS.find((t) => t.id === settings.activeTerm)?.name ?? ''
  const timeline = useMemo(
    () => gradeTimeline(subjects, data.grades, scale, settings.averageMode, settings.activeTerm),
    [subjects, data.grades, scale, settings.averageMode, settings.activeTerm],
  )
  const tone = numeralTone(average, scale)
  const color =
    tone === 'danger' ? 'var(--c-danger)' : tone === 'warn' ? 'var(--c-warn)' : 'var(--c-ok)'

  return (
    <WidgetCard id="media">
      <a href={hrefFor('notas')} className="flex-1 flex flex-col justify-between min-h-[5.5rem]">
        <span>
          <span
            className={cx(
              'numeral block text-[2.25rem]',
              tone === 'danger' && 'text-danger',
              tone === 'warn' && 'text-warn',
              tone === 'ok' && 'text-ok',
            )}
          >
            <CountUp value={average} format={(v) => formatGrade(v, scale)} />
          </span>
          <span className="block text-[0.75rem] text-ink-3 mt-1.5 truncate">
            {average === null ? 'Sin notas todavía' : term}
          </span>
        </span>
        {timeline.length >= 2 && (
          <Sparkline values={timeline.map((p) => p.average)} color={color} className="mt-3" />
        )}
      </a>
    </WidgetCard>
  )
}

// ---------------------------------------------------------------------------
// Objetivos
// ---------------------------------------------------------------------------

/** Hasta tres objetivos como anillos concéntricos, del más externo al centro. */
function GoalsWidget() {
  const goals = useGoalsProgress()
  const subjects = useSubjectMap()
  const top = goals.slice(0, 3)
  const achieved = goals.filter((g) => g.progress.done).length
  const size = 84
  const stroke = 9
  const gap = 2.5
  const fallback = ['#ff375f', '#30d158', '#0a84ff']

  return (
    <WidgetCard id="objetivos">
      <a href={hrefFor('objetivos')} className="flex-1 flex flex-col justify-between min-h-[5.5rem]">
        {goals.length === 0 ? (
          <span className="text-[0.875rem] leading-snug text-ink-3 text-pretty">
            Ponte una meta y síguela aquí.
          </span>
        ) : (
          <>
            <span
              className="relative block self-center my-1"
              style={{ width: size, height: size }}
              role="img"
              aria-label={top
                .map((g) => `${g.goal.title}: ${Math.round(g.progress.percent)} %`)
                .join('. ')}
            >
              {top.map(({ goal, progress }, i) => {
                const subject = goal.subjectId ? subjects.get(goal.subjectId) : undefined
                const ringSize = size - i * (stroke + gap) * 2
                return (
                  <span
                    key={goal.id}
                    className="absolute grid place-items-center"
                    style={{ inset: i * (stroke + gap) }}
                  >
                    <Ring
                      value={progress.percent / 100}
                      size={ringSize}
                      stroke={stroke}
                      color={subject ? colorVar(subject.color) : fallback[i]}
                    />
                  </span>
                )
              })}
            </span>
            <span className="block text-[0.75rem] text-ink-3 mt-2 text-center tabular-nums truncate">
              {achieved > 0
                ? `${achieved} de ${goals.length} conseguidos`
                : goals.length === 1
                  ? '1 en marcha'
                  : `${goals.length} en marcha`}
            </span>
          </>
        )}
      </a>
    </WidgetCard>
  )
}

// ---------------------------------------------------------------------------
// Próximos 7 días
// ---------------------------------------------------------------------------

function WeekWidget() {
  const today = useToday()
  const index = useCalendarIndex()
  const subjects = useSubjectMap()
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))

  return (
    <WidgetCard id="semana">
      <a href={hrefFor('calendario')} className="grid grid-cols-7 gap-1 pt-1">
        {days.map((day, i) => {
          const date = parseDay(day)
          const items = index.get(day) ?? []
          const exam = items.some((item) => item.kind === 'examen')
          return (
            <span key={day} className="flex flex-col items-center gap-1.5 min-w-0">
              <span className="text-[0.6875rem] font-semibold text-ink-3">
                {WEEKDAYS_SHORT[date.getDay()]}
              </span>
              <span
                className={cx(
                  'numeral grid place-items-center size-9 rounded-full text-[1.0625rem]',
                  i === 0
                    ? 'bg-accent-fill text-white'
                    : exam
                      ? 'bg-danger-quiet text-danger'
                      : 'text-ink',
                )}
              >
                {date.getDate()}
              </span>
              {/* Carga del día: un punto por cosa, del color de su asignatura. */}
              <span className="flex flex-wrap justify-center gap-[3px] min-h-[14px] max-w-[2.25rem]">
                {items.slice(0, 6).map((item) => {
                  const subject = item.subjectId ? subjects.get(item.subjectId) : undefined
                  return (
                    <span
                      key={`${item.kind}-${item.id}`}
                      className={cx(
                        'size-[5px]',
                        item.kind === 'examen' ? 'rotate-45 rounded-[1px]' : 'rounded-full',
                      )}
                      style={{ background: subject ? colorVar(subject.color) : 'var(--c-ink-3)' }}
                    />
                  )
                })}
              </span>
            </span>
          )
        })}
      </a>
      <p className="sr-only">
        {days
          .map((day) => `${formatLongDate(day)}: ${(index.get(day) ?? []).length} cosas`)
          .join('. ')}
      </p>
    </WidgetCard>
  )
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

function AlertsWidget({ alerts }: { alerts: ReturnType<typeof useHomeAlerts> }) {
  return (
    <WidgetCard id="avisos" flush>
      {alerts.length === 0 ? (
        <Quiet>Nada que avisar ahora mismo.</Quiet>
      ) : (
        <ul>
          {alerts.map((alert, i) => (
            <li key={alert.id} className={cx(i > 0 && 'inset-separator')}>
              <a
                href={alert.href ?? hrefFor('inicio')}
                className="flex items-center gap-3 pl-4 pr-3 py-3 transition-colors duration-150 active:bg-fill"
              >
                <span
                  className={cx(
                    'grid place-items-center size-8 rounded-full shrink-0',
                    alert.level === 'critico'
                      ? 'bg-danger-quiet text-danger'
                      : alert.level === 'aviso'
                        ? 'bg-warn-quiet text-warn'
                        : 'bg-accent-quiet text-accent',
                  )}
                >
                  {alert.level === 'critico' ? (
                    <TriangleAlert className="size-4" strokeWidth={2.3} />
                  ) : alert.level === 'aviso' ? (
                    <CircleAlert className="size-4" strokeWidth={2.3} />
                  ) : (
                    <Sparkles className="size-4" strokeWidth={2.3} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-semibold text-ink truncate">
                    {alert.title}
                  </span>
                  <span className="block text-[0.8125rem] text-ink-3 line-clamp-2">
                    {alert.detail}
                  </span>
                </span>
                <ChevronRight className="size-4 text-ink-3 shrink-0" strokeWidth={2.4} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

// ---------------------------------------------------------------------------
// Actividad reciente
// ---------------------------------------------------------------------------

function ActivityWidget({ subjects }: { subjects: Map<string, Subject> }) {
  const { data } = useStore()
  const entries = data.activity.slice(0, 4)

  return (
    <WidgetCard id="actividad" flush>
      {entries.length === 0 ? (
        <Quiet>Lo último que hagas en la app aparecerá aquí.</Quiet>
      ) : (
        <ul>
          {entries.map((entry, i) => {
            const subject = entry.subjectId ? subjects.get(entry.subjectId) : undefined
            return (
              <li
                key={entry.id}
                className={cx('flex items-start gap-3 px-4 py-2.5', i > 0 && 'inset-separator')}
              >
                <span
                  aria-hidden
                  className="mt-[7px] size-2 rounded-full shrink-0"
                  style={{
                    background: subject ? colorVar(subject.color) : 'var(--c-hairline-strong)',
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.875rem] text-ink-2 leading-snug">{entry.text}</span>
                  <span className="block text-[0.75rem] text-ink-3 mt-0.5 tabular-nums">
                    {new Date(entry.at).toLocaleString('es-ES', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </WidgetCard>
  )
}
