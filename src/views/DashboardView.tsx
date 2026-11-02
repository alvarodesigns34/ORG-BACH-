import { useState, type ReactNode } from 'react'
import {
  CalendarDays,
  ChevronRight,
  CircleAlert,
  GraduationCap,
  ListChecks,
  Mic,
  Sparkles,
  Timer,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'

import { daysUntil, formatDuration, formatLongDate, greeting } from '@/domain/dates'
import { formatGrade, numeralTone } from '@/domain/grades'
import { TERMS, type Exam, type Subject, type Task } from '@/domain/types'
import { hrefFor } from '@/router'
import { useSettings, useStore, useToday } from '@/state/StoreProvider'
import {
  useAlerts,
  useGlobalAverage,
  useStudyStats,
  useSubjectMap,
  useSubjectResults,
  useTaskSummary,
  useUpcomingExams,
} from '@/state/selectors'
import { Page, PageHeader } from '@/layout/AppShell'
import { useChrome } from '@/layout/chrome'
import { NAV_TINTS } from '@/layout/navigation'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import { TaskRow } from '@/features/tasks/TaskRow'
import { ExamEditor } from '@/features/exams/ExamEditor'
import { ExamCard } from '@/features/exams/ExamCard'
import { Button, EmptyState, GroupTitle, Numeral, cx } from '@/ui/primitives'

const ALERT_ORDER = { critico: 0, aviso: 1, info: 2 } as const

/**
 * Inicio: lo que hay que saber en diez segundos.
 *
 * Arriba, cuatro cifras que llevan cada una a su sección. Después, solo lo
 * accionable: avisos (como mucho tres), lo de hoy y los próximos exámenes. Lo
 * que no tiene datos no se pinta: un bloque vacío ocupa sitio y no informa.
 */
export function DashboardView({ hasSubjects }: { hasSubjects: boolean }) {
  const settings = useSettings()
  const today = useToday()
  const { openAssistant } = useChrome()
  const { data } = useStore()
  const summary = useTaskSummary()
  const exams = useUpcomingExams(4)
  const subjects = useSubjectMap()
  const study = useStudyStats()
  const average = useGlobalAverage(settings.activeTerm)
  // Lo atrasado y los exámenes ya tienen su widget y su lista: repetirlos
  // como aviso duplicaba la misma información en la primera pantalla.
  const alerts = useAlerts().filter(
    (a) =>
      a.id !== 'tareas-atrasadas' && a.id !== 'examenes-proximos' && !a.id.startsWith('examen-'),
  )

  const [editing, setEditing] = useState<Task | null>(null)
  const [creatingTask, setCreatingTask] = useState(false)
  const [creatingExam, setCreatingExam] = useState(false)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)

  const firstName = settings.userName.split(' ')[0]
  const nextExam = exams.find((e) => e.date >= today)
  const nextDays = nextExam ? daysUntil(nextExam.date, today) : null
  const termShort = TERMS.find((t) => t.id === settings.activeTerm)?.name ?? ''

  return (
    <Page>
      <PageHeader
        eyebrow={formatLongDate(today)}
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        compactTitle="Inicio"
      />

      {/* --- Asistente: lo primero a mano, como la barra de Siri/Spotlight --- */}
      <button
        type="button"
        onClick={openAssistant}
        className="pressable liquid w-full flex items-center gap-3 pl-4 pr-2 h-14 mb-4 text-left rounded-[22px]"
      >
        <span className="flex-1 text-[1rem] text-ink-3">Pregúntame o dime qué apuntar…</span>
        <span className="relative z-[2] grid place-items-center size-10 rounded-full bg-accent-fill text-white shrink-0 shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_4px_12px_rgb(0_113_227/0.35)]">
          <Mic className="size-5" strokeWidth={2.3} />
        </span>
      </button>

      {/* --- Widgets --- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Widget
          href={hrefFor('tareas', { vista: 'hoy' })}
          icon={ListChecks}
          tint={NAV_TINTS.tareas}
          label="Hoy"
          value={String(summary.today.length)}
          tone={summary.overdue.length > 0 ? 'danger' : undefined}
          caption={
            summary.overdue.length > 0
              ? `${summary.overdue.length} ${summary.overdue.length === 1 ? 'atrasada' : 'atrasadas'}`
              : summary.today.length === 0
                ? 'Nada pendiente'
                : summary.today.length === 1
                  ? 'tarea por hacer'
                  : 'tareas por hacer'
          }
        />
        <Widget
          href={hrefFor('calendario')}
          icon={CalendarDays}
          tint={NAV_TINTS.calendario}
          label="Próximo examen"
          value={
            nextDays === null
              ? '—'
              : nextDays === 0
                ? 'Hoy'
                : nextDays === 1
                  ? 'Mañana'
                  : `${nextDays} días`
          }
          tone={nextDays !== null && nextDays <= 2 ? 'danger' : undefined}
          caption={
            nextExam
              ? (subjects.get(nextExam.subjectId)?.name ?? nextExam.title)
              : 'Ninguno apuntado'
          }
        />
        {data.grades.length > 0 ? (
          <Widget
            href={hrefFor('notas')}
            icon={GraduationCap}
            tint={NAV_TINTS.notas}
            label="Media"
            value={formatGrade(average, settings.gradeScale)}
            tone={numeralTone(average, settings.gradeScale)}
            caption={termShort}
          />
        ) : (
          <Widget
            href={hrefFor('tareas')}
            icon={ListChecks}
            tint={NAV_TINTS.notas}
            label="Pendientes"
            value={String(summary.pending.length)}
            caption="en total"
          />
        )}
        <Widget
          href={hrefFor('estudio')}
          icon={Timer}
          tint={NAV_TINTS.estudio}
          label="Estudio"
          value={formatDuration(study.weekMinutes)}
          caption="esta semana"
        />
      </div>

      {/* --- Avisos: una lista, como mucho tres filas, por gravedad --- */}
      {alerts.length > 0 && (
        <ul className="card mt-4 overflow-hidden">
          {[...alerts]
            .sort((a, b) => ALERT_ORDER[a.level] - ALERT_ORDER[b.level])
            .slice(0, 3)
            .map((alert, i) => (
              <li key={alert.id} className={cx(i > 0 && 'inset-separator')}>
                <a
                  href={alert.href ?? hrefFor('inicio')}
                  className="flex items-center gap-3 pl-4 pr-3 py-3 transition-colors duration-150 active:bg-fill hover:bg-fill/60"
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
                    <span className="block text-[0.8125rem] text-ink-3 truncate">
                      {alert.detail}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-ink-3 shrink-0" strokeWidth={2.4} />
                </a>
              </li>
            ))}
        </ul>
      )}

      {/* --- Cuerpo: 7/5 en escritorio --- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-6 gap-y-7 mt-7">
        <section className="lg:col-span-7">
          <GroupTitle
            title="Hoy"
            hint={
              summary.today.length === 0
                ? undefined
                : summary.overdue.length > 0
                  ? `${summary.today.length} por hacer, ${summary.overdue.length} de días anteriores`
                  : undefined
            }
            action={
              summary.today.length > 0 ? (
                <a href={hrefFor('tareas')} className="group-link">
                  Ver todas
                </a>
              ) : undefined
            }
          />
          <div className="card overflow-hidden">
            {summary.today.length === 0 ? (
              <EmptyState
                compact
                icon={<ListChecks className="size-5" />}
                title="Día despejado"
                description="Nada vence hoy ni tienes tareas atrasadas. Buen momento para adelantar trabajo."
                action={
                  <Button size="sm" onClick={() => setCreatingTask(true)}>
                    Nueva tarea
                  </Button>
                }
              />
            ) : (
              <ul>
                {summary.today.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    subject={task.subjectId ? subjects.get(task.subjectId) : undefined}
                    onOpen={setEditing}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        <div className="lg:col-span-5 flex flex-col gap-7">
          <section>
            <GroupTitle
              title="Exámenes"
              action={
                hasSubjects ? (
                  <button
                    type="button"
                    className="group-link"
                    onClick={() => setCreatingExam(true)}
                  >
                    Añadir
                  </button>
                ) : undefined
              }
            />
            <div className="card overflow-hidden">
              {exams.length === 0 ? (
                <EmptyState
                  compact
                  icon={<CalendarDays className="size-5" />}
                  title="Sin exámenes apuntados"
                  description={
                    hasSubjects
                      ? 'Apunta el próximo en cuanto lo sepas y verás aquí la cuenta atrás.'
                      : 'Primero crea alguna asignatura y luego apunta sus exámenes.'
                  }
                  action={
                    hasSubjects ? (
                      <Button size="sm" onClick={() => setCreatingExam(true)}>
                        Apuntar examen
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => (window.location.hash = '/asignaturas')}>
                        Crear asignatura
                      </Button>
                    )
                  }
                />
              ) : (
                <ul>
                  {exams.map((exam, i) => (
                    <li key={exam.id} className={cx(i > 0 && 'inset-separator-wide')}>
                      <ExamCard
                        exam={exam}
                        subject={subjects.get(exam.subjectId)}
                        today={today}
                        onOpen={setEditingExam}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {data.grades.length > 0 && <AcademicBlock />}
          <ActivityBlock subjects={subjects} />
        </div>
      </div>

      <TaskEditor open={!!editing} task={editing} onClose={() => setEditing(null)} />
      <TaskEditor open={creatingTask} onClose={() => setCreatingTask(false)} />
      <ExamEditor open={creatingExam} onClose={() => setCreatingExam(false)} />
      <ExamEditor open={!!editingExam} exam={editingExam} onClose={() => setEditingExam(null)} />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

/**
 * Cifra con icono, al estilo de los resúmenes de Salud o Fitness. Toda la
 * tarjeta es un enlace a la sección de la que sale el dato.
 */
function Widget({
  href,
  icon: Icon,
  tint,
  label,
  value,
  caption,
  tone,
}: {
  href: string
  icon: LucideIcon
  tint: string
  label: string
  value: string
  caption?: ReactNode
  tone?: 'ok' | 'warn' | 'danger'
}) {
  return (
    <a
      href={href}
      className="card pressable relative overflow-hidden flex flex-col p-4 min-w-0 active:bg-fill/40"
    >
      {/* Un toque del color de la sección en la esquina, como los widgets de iOS. */}
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, ${tint} 13%, transparent), transparent 62%)`,
        }}
      />
      <span className="relative flex items-center gap-2">
        <span
          className="grid place-items-center size-7 rounded-full text-white shrink-0"
          style={{ background: tint }}
        >
          <Icon className="size-[15px]" strokeWidth={2.4} />
        </span>
        <span className="text-[0.8125rem] font-semibold text-ink-2 truncate">{label}</span>
      </span>
      <Numeral
        value={value}
        size={value.length > 6 ? 'sm' : 'md'}
        tone={tone}
        className="relative mt-3 truncate"
      />
      {caption && (
        <span className="relative text-[0.75rem] text-ink-3 mt-1.5 truncate">{caption}</span>
      )}
    </a>
  )
}

// ---------------------------------------------------------------------------
// Resumen académico
// ---------------------------------------------------------------------------

function AcademicBlock() {
  const settings = useSettings()
  const subjects = useSubjectMap()
  const results = useSubjectResults(settings.activeTerm)

  const scored = [...results.entries()]
    .map(([id, result]) => ({ subject: subjects.get(id), result }))
    .filter((x): x is { subject: Subject; result: typeof x.result } => !!x.subject)
    .filter((x) => x.result.average !== null)
    .sort((a, b) => (b.result.average ?? 0) - (a.result.average ?? 0))

  if (scored.length === 0) return null
  const rows = scored.length > 1 ? [scored[0], scored[scored.length - 1]] : [scored[0]]

  return (
    <section>
      <GroupTitle
        title="Cómo vas"
        action={
          <a href={hrefFor('notas')} className="group-link">
            Notas
          </a>
        }
      />
      <ul className="card overflow-hidden">
        {rows.map((entry, i) => (
          <li key={entry.subject.id} className={cx(i > 0 && 'inset-separator')}>
            <a
              href={hrefFor('asignaturas', { id: entry.subject.id })}
              className="flex items-center justify-between gap-4 px-4 py-3.5 active:bg-fill"
            >
              <span className="min-w-0">
                <span className="block text-[0.75rem] font-semibold text-ink-3">
                  {i === 0 ? 'Mejor rendimiento' : 'Necesita atención'}
                </span>
                <span className="block text-[0.9375rem] text-ink font-medium mt-0.5 truncate">
                  {entry.subject.name}
                </span>
              </span>
              <Numeral
                value={formatGrade(entry.result.average, settings.gradeScale)}
                size="sm"
                tone={numeralTone(entry.result.average, settings.gradeScale)}
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Actividad reciente
// ---------------------------------------------------------------------------

/** Solo aparece cuando hay algo que contar. */
function ActivityBlock({ subjects }: { subjects: Map<string, Subject> }) {
  const { data } = useStore()
  const entries = data.activity.slice(0, 5)
  if (entries.length === 0) return null

  return (
    <section>
      <GroupTitle title="Actividad reciente" />
      <ul className="card overflow-hidden">
        {entries.map((entry, i) => {
          const subject = entry.subjectId ? subjects.get(entry.subjectId) : undefined
          return (
            <li
              key={entry.id}
              className={cx('flex items-start gap-3 px-4 py-3', i > 0 && 'inset-separator')}
            >
              <span
                aria-hidden
                className="mt-[7px] size-2 rounded-full shrink-0"
                style={{
                  background: subject ? `var(--sub-${subject.color})` : 'var(--c-hairline-strong)',
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
    </section>
  )
}
