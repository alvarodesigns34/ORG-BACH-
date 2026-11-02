import { useRef, useState } from 'react'
import {
  ArrowRight,
  ChevronRight,
  BookOpen,
  CalendarPlus,
  CircleAlert,
  Inbox,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'

import { formatDuration, formatLongDate, greeting } from '@/domain/dates'
import { formatGrade, numeralTone } from '@/domain/grades'
import type { Exam, Task } from '@/domain/types'
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
import { CompactTitleBar, Page, useScrolledPast } from '@/layout/AppShell'
import { SyncBadge } from '@/features/account/SyncBadge'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import { TaskRow } from '@/features/tasks/TaskRow'
import { ExamEditor } from '@/features/exams/ExamEditor'
import { ExamCard } from '@/features/exams/ExamCard'
import { Button, Card, EmptyState, Numeral, SectionHeader, cx } from '@/ui/primitives'

const ALERT_ORDER = { critico: 0, aviso: 1, info: 2 } as const

export function DashboardView({ hasSubjects }: { hasSubjects: boolean }) {
  const settings = useSettings()
  const today = useToday()
  const { data } = useStore()
  const summary = useTaskSummary()
  const exams = useUpcomingExams(4)
  const subjects = useSubjectMap()
  const study = useStudyStats()
  const average = useGlobalAverage(settings.activeTerm)
  const alerts = useAlerts()

  const [editing, setEditing] = useState<Task | null>(null)
  const [creatingExam, setCreatingExam] = useState(false)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)

  const firstName = settings.userName.split(' ')[0]
  const heading = useRef<HTMLHeadingElement>(null)
  const collapsed = useScrolledPast(heading)

  return (
    <Page>
      <CompactTitleBar title="Inicio" visible={collapsed} />
      {/* --- Saludo --- */}
      <header className="mb-5 sm:mb-8">
        <h1 ref={heading} className="display text-[2.125rem] sm:text-[2.75rem] leading-[1.06]">
          {greeting()}
          {firstName && <>, {firstName}</>}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
          <p className="text-[0.9375rem] text-ink-3 first-letter:uppercase">
            {formatLongDate(today)}
          </p>
          <SyncBadge />
        </div>
      </header>

      {/* --- Métricas del día --- */}
      <MetricStrip
        pending={summary.pending.length}
        dueToday={summary.today.length}
        exams={data.exams.filter((e) => e.date >= today || !e.gradeEntryId).length}
        average={average}
        scale={settings.gradeScale}
        weekMinutes={study.weekMinutes}
        showAverage={data.grades.length > 0}
        showStudy={data.sessions.length > 0}
      />

      {/* --- Avisos ---
          Una sola lista agrupada y como mucho tres filas, por orden de
          gravedad. Antes eran tarjetas sueltas sin límite: con cuatro avisos,
          las tareas de hoy quedaban fuera de la pantalla del móvil, que es
          justo lo contrario de lo que tiene que hacer esta pantalla. */}
      {alerts.length > 0 && (
        <ul className="card mt-4 overflow-hidden">
          {[...alerts]
            .sort((a, b) => ALERT_ORDER[a.level] - ALERT_ORDER[b.level])
            .slice(0, 3)
            .map((alert, i) => (
              <li
                key={alert.id}
                style={{ '--i': i } as React.CSSProperties}
                className="animate-rise stagger"
              >
                <a
                  href={alert.href ?? hrefFor('inicio')}
                  className="group flex items-center gap-3 pl-4 pr-3 py-3 transition-colors duration-150 active:bg-fill hover:bg-fill/60"
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
                  <span
                    className={cx(
                      'min-w-0 flex-1 flex items-center gap-2',
                      i > 0 &&
                        'relative before:absolute before:-top-3 before:left-0 before:right-0 before:h-px before:bg-hairline',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.875rem] font-semibold text-ink truncate">
                        {alert.title}
                      </span>
                      <span className="block text-[0.8125rem] text-ink-3 truncate">
                        {alert.detail}
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-ink-3 shrink-0" strokeWidth={2.4} />
                  </span>
                </a>
              </li>
            ))}
        </ul>
      )}

      {/* --- Cuerpo: 7/5, no dos mitades iguales --- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 mt-6">
        <div className="lg:col-span-7 flex flex-col gap-5 lg:gap-6">
          <TodayBlock
            tasks={summary.today}
            overdueCount={summary.overdue.length}
            subjects={subjects}
            onOpen={setEditing}
          />
        </div>

        <div className="lg:col-span-5 flex flex-col gap-5 lg:gap-6">
          <Card flush>
            <SectionHeader
              title="Próximos exámenes"
              className="px-5 sm:px-6 pt-5 pb-3"
              action={
                <Button size="sm" variant="ghost" onClick={() => setCreatingExam(true)}>
                  <CalendarPlus className="size-4" />
                  Añadir
                </Button>
              }
            />
            {exams.length === 0 ? (
              <EmptyState
                compact
                icon={<CalendarPlus className="size-4" />}
                title="Sin exámenes apuntados"
                description={
                  hasSubjects
                    ? 'Apunta el próximo en cuanto lo sepas y verás la cuenta atrás aquí.'
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
              <div className="px-2 pb-3 flex flex-col">
                {exams.map((exam) => (
                  <ExamCard
                    key={exam.id}
                    exam={exam}
                    subject={subjects.get(exam.subjectId)}
                    today={today}
                    onOpen={setEditingExam}
                  />
                ))}
              </div>
            )}
          </Card>

          {data.grades.length > 0 && <AcademicBlock />}

          <ActivityBlock />
        </div>
      </div>

      <TaskEditor open={!!editing} task={editing} onClose={() => setEditing(null)} />
      <ExamEditor open={creatingExam} onClose={() => setCreatingExam(false)} />
      <ExamEditor open={!!editingExam} exam={editingExam} onClose={() => setEditingExam(null)} />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

interface MetricStripProps {
  pending: number
  dueToday: number
  exams: number
  average: number | null
  scale: { max: number; pass: number; decimals: number }
  weekMinutes: number
  showAverage: boolean
  showStudy: boolean
}

/**
 * Tira de cifras del día.
 *
 * Un panel único partido por líneas de 1px en lugar de tarjetas sueltas: son
 * el mismo dato visto por facetas, no cuatro bloques independientes. Solo
 * aparecen las métricas que ya tienen datos detrás; una cifra vacía ocupa
 * sitio y no informa de nada.
 */
function MetricStrip({
  pending,
  dueToday,
  exams,
  average,
  scale,
  weekMinutes,
  showAverage,
  showStudy,
}: MetricStripProps) {
  // Etiquetas cortas a propósito: en la columna estrecha de un móvil, una
  // etiqueta larga se corta con puntos suspensivos y deja de informar.
  const metrics: { label: string; value: string; tone?: 'ok' | 'warn' | 'danger' }[] = [
    { label: 'Pendientes', value: String(pending) },
    { label: 'Para hoy', value: String(dueToday), tone: dueToday > 0 ? 'warn' : undefined },
    { label: 'Exámenes', value: String(exams) },
  ]

  if (showAverage) {
    metrics.push({
      label: 'Media actual',
      value: formatGrade(average, scale),
      tone: numeralTone(average, scale),
    })
  }
  if (showStudy) {
    metrics.push({ label: 'Estudio semanal', value: formatDuration(weekMinutes) })
  }

  const columns = ['sm:grid-cols-3', 'sm:grid-cols-4', 'sm:grid-cols-5'][
    Math.min(metrics.length, 5) - 3
  ]

  return (
    <div className="relative card overflow-hidden">
      {/* En móvil es una franja que se desliza con el dedo; a partir de sm,
          una rejilla. Apilarlas en dos columnas ocupaba media pantalla y
          empujaba las tareas de hoy fuera de la vista. */}
      <dl
        className={cx(
          'flex overflow-x-auto no-scrollbar snap-x',
          'sm:grid sm:overflow-visible',
          'divide-x divide-hairline',
          columns,
        )}
      >
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="px-4 sm:px-5 py-4 sm:py-5 shrink-0 snap-start min-w-[7.25rem] sm:min-w-0"
          >
            <dt className="eyebrow whitespace-nowrap">{metric.label}</dt>
            <dd className="mt-2">
              <Numeral value={metric.value} size="md" tone={metric.tone} />
            </dd>
          </div>
        ))}
      </dl>

      {/* Difuminado en el borde derecho: sin él, la cifra cortada parece un
          fallo de maquetación en vez de una franja que continúa. */}
      <span
        aria-hidden
        className="sm:hidden pointer-events-none absolute inset-y-0 right-0 w-10"
        style={{
          background: 'linear-gradient(to right, transparent, var(--c-surface) 78%)',
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bloque de hoy
// ---------------------------------------------------------------------------

function TodayBlock({
  tasks,
  overdueCount,
  subjects,
  onOpen,
}: {
  tasks: Task[]
  overdueCount: number
  subjects: Map<string, import('@/domain/types').Subject>
  onOpen: (task: Task) => void
}) {
  const [creating, setCreating] = useState(false)

  return (
    <>
      <Card flush className="overflow-hidden">
        <SectionHeader
          title="Hoy"
          hint={
            tasks.length === 0
              ? 'Nada vence hoy.'
              : overdueCount > 0
                ? `${tasks.length} por hacer, ${overdueCount} de días anteriores.`
                : `${tasks.length} ${tasks.length === 1 ? 'tarea' : 'tareas'} por hacer.`
          }
          className="px-5 sm:px-6 pt-5 pb-4 border-b border-hairline"
          action={
            <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
              Añadir
            </Button>
          }
        />

        {tasks.length === 0 ? (
          <EmptyState
            compact
            icon={<Inbox className="size-4" />}
            title="Día despejado"
            description="No tienes nada con fecha de hoy ni tareas atrasadas. Buen momento para adelantar trabajo."
            action={
              <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
                Crear una tarea
              </Button>
            }
          />
        ) : (
          <ul>
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                subject={task.subjectId ? subjects.get(task.subjectId) : undefined}
                onOpen={onOpen}
              />
            ))}
          </ul>
        )}

        {tasks.length > 0 && (
          <div className="px-5 sm:px-6 py-3 border-t border-hairline">
            <a
              href={hrefFor('tareas')}
              className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-accent hover:underline underline-offset-4"
            >
              Ver todas las tareas
              <ArrowRight className="size-3.5" />
            </a>
          </div>
        )}
      </Card>

      <TaskEditor open={creating} onClose={() => setCreating(false)} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Resumen académico
// ---------------------------------------------------------------------------

function AcademicBlock() {
  const settings = useSettings()
  const subjects = useSubjectMap()
  const { data } = useStore()
  const results = useSubjectResults(settings.activeTerm)

  const scored = [...results.entries()]
    .map(([id, result]) => ({ subject: subjects.get(id), result }))
    .filter((x) => x.subject && x.result.average !== null)
    .sort((a, b) => (b.result.average ?? 0) - (a.result.average ?? 0))

  if (scored.length === 0) return null

  const best = scored[0]
  const worst = scored[scored.length - 1]

  return (
    <Card flush>
      <SectionHeader
        title="Cómo vas"
        hint={`${data.grades.length} ${data.grades.length === 1 ? 'nota registrada' : 'notas registradas'}`}
        className="px-5 sm:px-6 pt-5 pb-4 border-b border-hairline"
      />
      <div className="divide-y divide-hairline">
        <SubjectLine label="Mejor rendimiento" entry={best} scale={settings.gradeScale} />
        {scored.length > 1 && (
          <SubjectLine label="Necesita atención" entry={worst} scale={settings.gradeScale} />
        )}
      </div>
      <div className="px-5 sm:px-6 py-3 border-t border-hairline">
        <a
          href={hrefFor('notas')}
          className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-accent hover:underline underline-offset-4"
        >
          Ver todas las notas
          <ArrowRight className="size-3.5" />
        </a>
      </div>
    </Card>
  )
}

function SubjectLine({
  label,
  entry,
  scale,
}: {
  label: string
  entry: { subject?: import('@/domain/types').Subject; result: { average: number | null } }
  scale: { max: number; pass: number; decimals: number }
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4">
      <div className="min-w-0">
        <p className="eyebrow">{label}</p>
        <p className="text-[0.875rem] text-ink font-medium mt-1 truncate">{entry.subject?.name}</p>
      </div>
      <Numeral
        value={formatGrade(entry.result.average, scale)}
        size="sm"
        tone={numeralTone(entry.result.average, scale)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Actividad reciente
// ---------------------------------------------------------------------------

function ActivityBlock() {
  const { data } = useStore()
  const entries = data.activity.slice(0, 6)

  return (
    <Card flush>
      <SectionHeader
        title="Actividad reciente"
        className="px-5 sm:px-6 pt-5 pb-4 border-b border-hairline"
      />
      {entries.length === 0 ? (
        <EmptyState
          compact
          icon={<BookOpen className="size-4" />}
          title="Todavía nada que contar"
          description="Aquí irá apareciendo lo que vayas haciendo: tareas completadas, notas y exámenes."
        />
      ) : (
        <ul className="px-5 sm:px-6 py-4 flex flex-col gap-3.5">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-1.5 size-1.5 rounded-full bg-hairline-strong shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[0.8125rem] text-ink-2 leading-snug">{entry.text}</p>
                <p className="text-[0.6875rem] text-ink-3 mt-0.5 tabular-nums">
                  {new Date(entry.at).toLocaleString('es-ES', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
