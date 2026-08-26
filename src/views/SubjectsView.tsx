import { useState } from 'react'
import { BookOpen, MapPin, Plus, User } from 'lucide-react'

import { daysUntil, formatShort } from '@/domain/dates'
import { formatGrade, numeralTone } from '@/domain/grades'
import { colorVar, quietVar } from '@/domain/palette'
import { isDone } from '@/domain/tasks'
import { hrefFor } from '@/router'
import { useSettings, useStore, useToday } from '@/state/StoreProvider'
import { useSubjectResults, useSubjects } from '@/state/selectors'
import { Page, PageHeader } from '@/layout/AppShell'
import { SubjectEditor } from '@/features/subjects/SubjectEditor'
import { Button, Card, EmptyState, Numeral, cx } from '@/ui/primitives'

export function SubjectsView() {
  const settings = useSettings()
  const today = useToday()
  const { data } = useStore()
  const subjects = useSubjects()
  const results = useSubjectResults(settings.activeTerm)

  const [creating, setCreating] = useState(false)

  return (
    <Page>
      <PageHeader
        title="Asignaturas"
        subtitle={
          subjects.length > 0
            ? `${subjects.length} en ${settings.course} · ${settings.academicYear}`
            : undefined
        }
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" strokeWidth={2.5} />
            Nueva asignatura
          </Button>
        }
      />

      {subjects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen className="size-5" />}
            title="Todavía no hay asignaturas"
            description="Las asignaturas son la base de todo lo demás: las tareas, los exámenes y las notas cuelgan de ellas."
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                Crear la primera
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {subjects.map((subject, i) => {
            const result = results.get(subject.id)
            const pendingTasks = data.tasks.filter(
              (t) => t.subjectId === subject.id && !isDone(t),
            ).length
            const nextExam = data.exams
              .filter((e) => e.subjectId === subject.id && e.date >= today)
              .sort((a, b) => a.date.localeCompare(b.date))[0]

            return (
              <a
                key={subject.id}
                href={hrefFor('asignaturas', { id: subject.id })}
                style={{ '--i': i } as React.CSSProperties}
                className={cx(
                  'animate-rise stagger group relative text-left',
                  'bg-surface border border-hairline rounded-lg overflow-hidden',
                  'transition-[border-color,box-shadow] duration-200',
                  'hover:border-hairline-strong hover:shadow-sm',
                )}
              >
                {/* Franja superior con el color de la asignatura. */}
                <span
                  aria-hidden
                  className="block h-1"
                  style={{ background: colorVar(subject.color) }}
                />

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span
                        className="inline-flex items-center rounded-xs px-1.5 py-0.5 text-[0.6875rem] font-bold tracking-[0.04em]"
                        style={{
                          background: quietVar(subject.color),
                          color: colorVar(subject.color),
                        }}
                      >
                        {subject.shortName}
                      </span>
                      <h2 className="text-[1rem] font-semibold text-ink leading-snug mt-2 tracking-[-0.01em]">
                        {subject.name}
                      </h2>
                    </div>

                    <div className="text-right shrink-0">
                      <Numeral
                        value={formatGrade(result?.average ?? null, settings.gradeScale)}
                        size="sm"
                        tone={numeralTone(result?.average ?? null, settings.gradeScale)}
                      />
                      <p className="text-[0.6875rem] text-ink-3 mt-0.5">
                        {result?.average === null || result?.average === undefined
                          ? 'sin notas'
                          : subject.targetGrade
                            ? `objetivo ${formatGrade(subject.targetGrade, settings.gradeScale)}`
                            : 'media'}
                      </p>
                    </div>
                  </div>

                  {(subject.teacher || subject.room) && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[0.75rem] text-ink-3">
                      {subject.teacher && (
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <User className="size-3 shrink-0" />
                          <span className="truncate">{subject.teacher}</span>
                        </span>
                      )}
                      {subject.room && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3 shrink-0" />
                          {subject.room}
                        </span>
                      )}
                    </div>
                  )}

                  <dl className="grid grid-cols-2 gap-px mt-4 pt-4 border-t border-hairline">
                    <div>
                      <dt className="eyebrow">Tareas pendientes</dt>
                      <dd className="text-[0.875rem] font-semibold text-ink mt-1 tabular-nums">
                        {pendingTasks}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="eyebrow">Próximo examen</dt>
                      <dd
                        className={cx(
                          'text-[0.875rem] font-semibold mt-1 truncate',
                          nextExam && daysUntil(nextExam.date, today) <= 6
                            ? 'text-warn'
                            : 'text-ink',
                        )}
                      >
                        {nextExam ? (
                          <span className="flex items-baseline gap-1.5 min-w-0">
                            <span className="truncate">{nextExam.title}</span>
                            <span className="text-ink-3 font-normal tabular-nums shrink-0">
                              {formatShort(nextExam.date)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-ink-3 font-normal">Ninguno</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              </a>
            )
          })}
        </div>
      )}

      <SubjectEditor open={creating} onClose={() => setCreating(false)} />
    </Page>
  )
}
