import { useMemo, useState } from 'react'
import { Check, Plus, Target } from 'lucide-react'

import { KIND_LABEL, SCOPE_LABEL, goalProgress, type GoalContext } from '@/domain/goals'
import { colorVar } from '@/domain/palette'
import type { Goal } from '@/domain/types'
import { useSettings, useStore, useToday } from '@/state/StoreProvider'
import { useGlobalAverage, useSubjectMap, useSubjectResults } from '@/state/selectors'
import { Page, PageHeader } from '@/layout/AppShell'
import { GoalEditor } from '@/features/goals/GoalEditor'
import { Button, Card, EmptyState, cx } from '@/ui/primitives'

export function GoalsView() {
  const settings = useSettings()
  const today = useToday()
  const { data } = useStore()
  const subjects = useSubjectMap()
  const results = useSubjectResults(settings.activeTerm)
  const globalAverage = useGlobalAverage(settings.activeTerm)

  const [editing, setEditing] = useState<Goal | null>(null)
  const [creating, setCreating] = useState(false)

  const context: GoalContext = useMemo(
    () => ({
      tasks: data.tasks,
      sessions: data.sessions,
      subjects: data.subjects,
      results,
      globalAverage,
      scale: settings.gradeScale,
      today,
      weekStartsOn: settings.weekStartsOn,
    }),
    [data.tasks, data.sessions, data.subjects, results, globalAverage, settings, today],
  )

  const goals = data.goals.filter((g) => !g.archived)
  const withProgress = goals.map((goal) => ({ goal, progress: goalProgress(goal, context) }))
  const achieved = withProgress.filter((g) => g.progress.done).length

  return (
    <Page className="max-w-[860px]">
      <PageHeader
        title="Objetivos"
        subtitle={
          goals.length === 0
            ? undefined
            : achieved > 0
              ? `${achieved} de ${goals.length} conseguidos`
              : `${goals.length} en marcha`
        }
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Nuevo objetivo</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
        }
      />

      {goals.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target className="size-5" />}
            title="Ningún objetivo todavía"
            description="Un objetivo convierte una intención vaga en una cifra que puedes mirar: subir la media a 9, estudiar 8 horas esta semana, no dejar tareas sin hacer."
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                Crear el primero
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {withProgress.map(({ goal, progress }, i) => {
            const subject = goal.subjectId ? subjects.get(goal.subjectId) : undefined

            return (
              <button
                key={goal.id}
                type="button"
                onClick={() => setEditing(goal)}
                style={{ '--i': i } as React.CSSProperties}
                className={cx(
                  'animate-rise stagger w-full text-left rounded-lg border p-5',
                  'transition-[border-color,background-color] duration-200',
                  progress.done
                    ? 'bg-ok-quiet border-ok/25 hover:border-ok/45'
                    : 'bg-surface border-hairline hover:border-hairline-strong',
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 min-w-0">
                      {subject && (
                        <span
                          aria-hidden
                          className="size-2 rounded-full shrink-0"
                          style={{ background: colorVar(subject.color) }}
                        />
                      )}
                      <span className="text-[0.9375rem] font-semibold text-ink truncate">
                        {goal.title}
                      </span>
                    </p>
                    <p className="text-[0.75rem] text-ink-3 mt-1">
                      {KIND_LABEL[goal.kind]} · {SCOPE_LABEL[goal.scope]}
                      {subject && ` · ${subject.name}`}
                    </p>
                  </div>

                  {progress.done ? (
                    <span className="inline-flex items-center gap-1 text-[0.75rem] font-semibold text-ok shrink-0">
                      <Check className="size-3.5" strokeWidth={3} />
                      Conseguido
                    </span>
                  ) : (
                    <span
                      className={cx(
                        'text-[0.8125rem] font-semibold tabular-nums shrink-0',
                        progress.measurable ? 'text-ink' : 'text-ink-3',
                      )}
                    >
                      {progress.headline}
                    </span>
                  )}
                </div>

                {/* Barra con marcas cada 25 %: da una referencia sin cargar de
                    números una barra que ya lleva su porcentaje al lado. */}
                <div className="relative h-2.5 rounded-full bg-sunken overflow-hidden mt-4">
                  <div
                    className={cx(
                      'h-full rounded-full transition-[width] duration-500 ease-out',
                      progress.done ? 'bg-ok' : 'bg-accent',
                    )}
                    style={{ width: `${progress.percent}%` }}
                  />
                  {[25, 50, 75].map((mark) => (
                    <span
                      key={mark}
                      aria-hidden
                      className="absolute top-0 bottom-0 w-px bg-surface/70"
                      style={{ left: `${mark}%` }}
                    />
                  ))}
                </div>

                <p
                  className={cx(
                    'text-[0.8125rem] mt-2 tabular-nums',
                    progress.measurable ? 'text-ink-2' : 'text-ink-3',
                  )}
                >
                  {progress.label}
                </p>
              </button>
            )
          })}
        </div>
      )}

      <GoalEditor open={creating} onClose={() => setCreating(false)} />
      <GoalEditor open={!!editing} goal={editing} onClose={() => setEditing(null)} />
    </Page>
  )
}
