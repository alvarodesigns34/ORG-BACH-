import { useMemo, useState } from 'react'
import { CircleCheck, CircleSlash, TrendingUp } from 'lucide-react'

import { formatDuration, formatShort } from '@/domain/dates'
import { formatGrade, numeralTone } from '@/domain/grades'
import { colorVar } from '@/domain/palette'
import {
  gradeTimeline,
  rankGrades,
  studyByDay,
  studyBySubject,
  subjectRanking,
  taskStats,
} from '@/domain/stats'
import { TERMS, type TermId } from '@/domain/types'
import { useSettings, useStore, useToday } from '@/state/StoreProvider'
import { useGlobalAverage, useSubjectResults, useSubjects } from '@/state/selectors'
import { Page, PageHeader } from '@/layout/AppShell'
import { ColumnChart, LineChart, RankedBars, type Column, type RankedBar } from '@/ui/charts'
import { Button, Card, EmptyState, Numeral, SectionHeader, Segmented, cx } from '@/ui/primitives'

type Scope = TermId | 'todas'

export function StatsView() {
  const settings = useSettings()
  const today = useToday()
  const { data } = useStore()
  const subjects = useSubjects()

  const [scope, setScope] = useState<Scope>('todas')
  const results = useSubjectResults(scope)
  const average = useGlobalAverage(scope)
  const scale = settings.gradeScale

  const timeline = useMemo(
    () => gradeTimeline(subjects, data.grades, scale, settings.averageMode, scope),
    [subjects, data.grades, scale, settings.averageMode, scope],
  )
  const ranking = useMemo(() => subjectRanking(subjects, results), [subjects, results])
  const tasks = useMemo(() => taskStats(data.tasks, today), [data.tasks, today])
  const ranked = useMemo(
    () => rankGrades(data.grades, subjects, scale, scope),
    [data.grades, subjects, scale, scope],
  )
  const byDay = useMemo(() => studyByDay(data.sessions, today, 30), [data.sessions, today])
  const bySubject = useMemo(
    () => studyBySubject(data.sessions, subjects),
    [data.sessions, subjects],
  )

  const totalStudy = data.sessions.reduce((sum, s) => sum + s.minutes, 0)

  /**
   * Ventana vertical del gráfico de evolución.
   *
   * Se recorta al tramo donde ocurre algo, pero nunca deja fuera el aprobado:
   * así se ve el movimiento real de la media sin perder la referencia de si se
   * está por encima o por debajo. El eje va rotulado, así que el recorte no
   * engaña a nadie.
   */
  const timelineRange = useMemo(() => {
    if (timeline.length === 0) return { min: 0, max: scale.max }
    const values = timeline.map((p) => p.average)
    return {
      min: Math.max(0, Math.min(Math.floor(Math.min(...values)) - 1, scale.pass)),
      max: Math.min(scale.max, Math.max(Math.ceil(Math.max(...values)) + 1, scale.pass + 1)),
    }
  }, [timeline, scale])
  const hasAnything = data.grades.length > 0 || data.tasks.length > 0 || data.sessions.length > 0

  if (!hasAnything) {
    return (
      <Page className="max-w-[760px]">
        <PageHeader title="Estadísticas" />
        <Card>
          <EmptyState
            icon={<TrendingUp className="size-5" />}
            title="Todavía no hay nada que analizar"
            description="En cuanto registres notas, completes tareas o apuntes sesiones de estudio, esta sección mostrará cómo evoluciona el curso."
            action={
              <Button variant="primary" onClick={() => (window.location.hash = '/notas')}>
                Empezar por las notas
              </Button>
            }
          />
        </Card>
      </Page>
    )
  }

  const subjectBars: RankedBar[] = ranking.map((stat) => ({
    id: stat.subject.id,
    label: stat.subject.name,
    value: stat.average,
    formatted: formatGrade(stat.average, scale),
    dotColor: colorVar(stat.subject.color),
    tone: numeralTone(stat.average, scale) ?? 'accent',
    marker:
      stat.subject.targetGrade !== undefined
        ? {
            value: stat.subject.targetGrade,
            label: `Objetivo ${formatGrade(stat.subject.targetGrade, scale)}`,
          }
        : undefined,
  }))

  const studyBars: RankedBar[] = bySubject.map((entry, i) => ({
    id: entry.subject?.id ?? `sin-asignatura-${i}`,
    label: entry.subject?.name ?? 'Sin asignatura',
    value: entry.minutes,
    formatted: `${formatDuration(entry.minutes)} · ${Math.round(entry.share)} %`,
    dotColor: entry.subject ? colorVar(entry.subject.color) : 'var(--c-ink-3)',
  }))

  const studyColumns: Column[] = byDay.map((day) => {
    const date = new Date(`${day.day}T00:00:00`)
    return {
      label: date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }),
      shortLabel: date.getDate() === 1 || date.getDate() === 15 ? String(date.getDate()) : '',
      value: day.minutes,
      formatted: day.minutes === 0 ? 'Sin estudiar' : formatDuration(day.minutes),
      highlight: day.day === today,
    }
  })

  return (
    <Page>
      <PageHeader
        title="Estadísticas"
        subtitle="Todo lo que ves sale de lo que has ido registrando."
        toolbar={
          data.grades.length > 0 ? (
            <Segmented
              label="Evaluación"
              value={scope}
              onChange={setScope}
              options={[
                ...TERMS.map((t) => ({ value: t.id as Scope, label: t.short })),
                { value: 'todas' as Scope, label: 'Curso' },
              ]}
            />
          ) : undefined
        }
      />

      {/* --- Cifras principales --- */}
      <div className="card overflow-hidden">
        <dl className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-hairline">
          <Stat
            label="Media global"
            value={formatGrade(average, scale)}
            tone={numeralTone(average, scale)}
          />
          <Stat
            label="Mejor asignatura"
            value={ranking.length > 0 ? formatGrade(ranking[0].average, scale) : '—'}
            hint={ranking.length > 0 ? ranking[0].subject.shortName : undefined}
          />
          <Stat label="Tareas completadas" value={String(tasks.completed)} />
          <Stat
            label="Horas de estudio"
            value={totalStudy === 0 ? '—' : formatDuration(totalStudy)}
          />
        </dl>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 mt-5 items-start">
        {/* --- Evolución --- */}
        <div className="lg:col-span-7">
          <Card>
            <SectionHeader
              title="Evolución de la media"
              hint={
                timeline.length < 2
                  ? 'Hará falta más de una nota para dibujar una evolución.'
                  : 'Cómo ha ido cambiando tu media a medida que entraban notas.'
              }
              className="mb-5"
            />
            {timeline.length < 2 ? (
              <EmptyState
                compact
                title="Aún no hay recorrido"
                description="Con la segunda nota empezará a verse la curva."
              />
            ) : (
              <LineChart
                title="Evolución de la media global"
                points={timeline.map((point) => ({
                  label: formatShort(point.date),
                  value: point.average,
                  detail: `${point.count} ${point.count === 1 ? 'nota' : 'notas'}`,
                }))}
                yMin={timelineRange.min}
                yMax={timelineRange.max}
                formatValue={(value) => formatGrade(value, { ...scale, decimals: 1 })}
                reference={{
                  value: scale.pass,
                  label: `Aprobado ${formatGrade(scale.pass, { ...scale, decimals: 0 })}`,
                }}
              />
            )}
          </Card>
        </div>

        {/* --- Tareas --- */}
        <div className="lg:col-span-5">
          <Card>
            <SectionHeader title="Tareas" className="mb-5" />
            {tasks.total === 0 ? (
              <EmptyState compact title="Sin tareas" description="Todavía no has creado ninguna." />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <TaskTile
                    icon={<CircleCheck className="size-4" />}
                    label="Completadas"
                    value={tasks.completed}
                    tone="ok"
                  />
                  <TaskTile
                    icon={<CircleSlash className="size-4" />}
                    label="Atrasadas"
                    value={tasks.overdue}
                    tone={tasks.overdue > 0 ? 'danger' : 'neutral'}
                  />
                </div>

                {tasks.onTimeRate !== null && (
                  <div className="pt-4 border-t border-hairline">
                    <p className="eyebrow">Entregadas a tiempo</p>
                    <div className="flex items-baseline gap-2 mt-2">
                      <Numeral
                        value={`${tasks.onTimeRate}`}
                        suffix="%"
                        size="md"
                        tone={
                          tasks.onTimeRate >= 80 ? 'ok' : tasks.onTimeRate >= 50 ? 'warn' : 'danger'
                        }
                      />
                    </div>
                    <p className="text-[0.75rem] text-ink-3 mt-1.5 text-balance">
                      De las tareas con fecha que ya has completado.
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* --- Comparativa entre asignaturas --- */}
        <div className="lg:col-span-7">
          <Card>
            <SectionHeader
              title="Media por asignatura"
              hint={
                subjectBars.length > 0 ? 'La marca vertical es tu objetivo en cada una.' : undefined
              }
              className="mb-5"
            />
            <RankedBars
              bars={subjectBars}
              max={scale.max}
              title="Media por asignatura"
              emptyLabel="Ninguna asignatura tiene notas todavía."
            />
          </Card>
        </div>

        {/* --- Reparto del estudio --- */}
        <div className="lg:col-span-5">
          <Card>
            <SectionHeader
              title="En qué se va el tiempo"
              hint={totalStudy > 0 ? formatDuration(totalStudy) : undefined}
              className="mb-5"
            />
            <RankedBars
              bars={studyBars}
              max={Math.max(...bySubject.map((s) => s.minutes), 1)}
              title="Minutos de estudio por asignatura"
              emptyLabel="Aún no has registrado sesiones de estudio."
            />
          </Card>
        </div>

        {/* --- Estudio en el tiempo --- */}
        {totalStudy > 0 && (
          <div className="lg:col-span-12">
            <Card>
              <SectionHeader title="Estudio de los últimos 30 días" className="mb-5" />
              <ColumnChart columns={studyColumns} title="Minutos estudiados por día" height={150} />
            </Card>
          </div>
        )}

        {/* --- Mejores y peores --- */}
        {ranked.length >= 2 && (
          <>
            <div className="lg:col-span-6">
              <Card flush>
                <SectionHeader
                  title="Tus mejores notas"
                  className="px-5 sm:px-6 pt-5 pb-4 border-b border-hairline"
                />
                <GradeList entries={ranked.slice(0, 4)} scale={scale} />
              </Card>
            </div>
            <div className="lg:col-span-6">
              <Card flush>
                <SectionHeader
                  title="Donde hay más margen"
                  className="px-5 sm:px-6 pt-5 pb-4 border-b border-hairline"
                />
                <GradeList entries={[...ranked].reverse().slice(0, 4)} scale={scale} />
              </Card>
            </div>
          </>
        )}
      </div>
    </Page>
  )
}

// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'ok' | 'warn' | 'danger'
}) {
  return (
    <div className="px-4 sm:px-5 py-4 sm:py-5 min-w-0">
      <dt className="eyebrow truncate">{label}</dt>
      <dd className="mt-2 flex items-baseline gap-2 min-w-0">
        <Numeral value={value} size="sm" tone={tone} />
        {hint && <span className="text-[0.6875rem] text-ink-3 truncate">{hint}</span>}
      </dd>
    </div>
  )
}

function TaskTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'ok' | 'danger' | 'neutral'
}) {
  return (
    <div
      className={cx(
        'rounded-md px-4 py-3.5 border',
        tone === 'ok' && 'bg-ok-quiet border-ok/20',
        tone === 'danger' && 'bg-danger-quiet border-danger/20',
        tone === 'neutral' && 'bg-sunken border-hairline',
      )}
    >
      <span
        className={cx(
          'flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-[0.06em] uppercase',
          tone === 'ok' && 'text-ok',
          tone === 'danger' && 'text-danger',
          tone === 'neutral' && 'text-ink-3',
        )}
      >
        {icon}
        {label}
      </span>
      <span className="block numeral text-[1.5rem] mt-2 text-ink">{value}</span>
    </div>
  )
}

function GradeList({
  entries,
  scale,
}: {
  entries: ReturnType<typeof rankGrades>
  scale: { max: number; pass: number; decimals: number }
}) {
  return (
    <ul className="divide-y divide-hairline">
      {entries.map(({ grade, subject, normalized }) => (
        <li key={grade.id} className="flex items-center gap-3 px-5 sm:px-6 py-3">
          <span
            aria-hidden
            className="size-2 rounded-full shrink-0"
            style={{ background: subject ? colorVar(subject.color) : 'var(--c-ink-3)' }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[0.875rem] text-ink truncate">{grade.name}</p>
            <p className="text-[0.6875rem] text-ink-3 mt-0.5 truncate">
              {subject?.name ?? 'Sin asignatura'} · {formatShort(grade.date)}
            </p>
          </div>
          <span
            className={cx(
              'text-[0.9375rem] font-semibold tabular-nums shrink-0',
              numeralTone(normalized, scale) === 'danger' && 'text-danger',
              numeralTone(normalized, scale) === 'warn' && 'text-warn',
              numeralTone(normalized, scale) === 'ok' && 'text-ok',
            )}
          >
            {formatGrade(normalized, scale)}
          </span>
        </li>
      ))}
    </ul>
  )
}
