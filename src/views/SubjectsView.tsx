import { useMemo, useState } from 'react'
import { Archive, BookOpen, ChevronRight, Plus } from 'lucide-react'

import { courseLine } from '@/data/defaults'
import { daysUntil, formatShort } from '@/domain/dates'
import { clockOf, isExamOver } from '@/domain/exams'
import { formatGrade, numeralTone } from '@/domain/grades'
import { colorVar, quietVar } from '@/domain/palette'
import { isDone } from '@/domain/tasks'
import { hrefFor } from '@/router'
import { useDispatch, useSettings, useStore, useToday } from '@/state/StoreProvider'
import { useMinuteClock, useSubjectMap, useSubjectResults, useSubjects } from '@/state/selectors'
import { Page, PageHeader } from '@/layout/AppShell'
import { WeekSchedule } from '@/features/schedule/WeekSchedule'
import { SubjectEditor } from '@/features/subjects/SubjectEditor'
import { Button, Card, EmptyState, Numeral, cx } from '@/ui/primitives'

export function SubjectsView() {
  const settings = useSettings()
  const today = useToday()
  const minute = useMinuteClock()
  const { data } = useStore()
  const subjects = useSubjects()
  const subjectMap = useSubjectMap()
  const dispatch = useDispatch()
  const archived = data.subjects
    .filter((s) => s.archived)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const [showArchived, setShowArchived] = useState(false)
  const results = useSubjectResults(settings.activeTerm)
  const gradeIds = useMemo(() => new Set(data.grades.map((g) => g.id)), [data.grades])
  const clock = useMemo(() => clockOf(new Date(minute * 60_000)), [minute])

  const [creating, setCreating] = useState(false)

  return (
    <Page>
      <PageHeader
        title="Asignaturas"
        subtitle={
          subjects.length > 0
            ? `${subjects.length} ${subjects.length === 1 ? 'asignatura' : 'asignaturas'} · ${courseLine(settings)}`
            : undefined
        }
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" strokeWidth={2.5} />
            Añadir
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
        // Lista agrupada, como Contactos o Ajustes: se recorre con la vista y
        // cada fila dice lo justo (pendientes y próximo examen) con la nota a
        // la derecha. El detalle completo está en la ficha.
        <ul className="card overflow-hidden max-w-[760px]">
          {subjects.map((subject, i) => {
            const result = results.get(subject.id)
            const average = result?.average ?? null
            const pendingTasks = data.tasks.filter(
              (t) => t.subjectId === subject.id && !isDone(t),
            ).length
            const nextExam = data.exams
              .filter(
                (e) =>
                  e.subjectId === subject.id &&
                  !(e.gradeEntryId && gradeIds.has(e.gradeEntryId)) &&
                  !isExamOver({ ...e, gradeEntryId: undefined }, subjectMap, clock),
              )
              .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))[0]
            const examSoon = nextExam && daysUntil(nextExam.date, today) <= 6
            const detail = [
              pendingTasks > 0
                ? `${pendingTasks} ${pendingTasks === 1 ? 'tarea' : 'tareas'}`
                : 'Sin tareas',
              nextExam ? `examen ${formatShort(nextExam.date)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')

            return (
              <li key={subject.id} className={cx(i > 0 && 'inset-separator-wide')}>
                <a
                  href={hrefFor('asignaturas', { id: subject.id })}
                  className="flex items-center gap-3.5 pl-4 pr-3 py-3 transition-colors duration-150 active:bg-fill hover:bg-fill/50"
                >
                  <span
                    aria-hidden
                    className="grid place-items-center size-10 rounded-full text-[0.8125rem] font-bold shrink-0"
                    style={{ background: quietVar(subject.color), color: colorVar(subject.color) }}
                  >
                    {subject.shortName}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[1rem] font-medium text-ink truncate">
                      {subject.name}
                    </span>
                    <span
                      className={cx(
                        'block text-[0.8125rem] truncate',
                        examSoon ? 'text-warn' : 'text-ink-3',
                      )}
                    >
                      {detail}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <Numeral
                      value={formatGrade(average, settings.gradeScale)}
                      size="sm"
                      tone={numeralTone(average, settings.gradeScale)}
                    />
                    {subject.targetGrade !== undefined && average !== null && (
                      <span className="block text-[0.6875rem] text-ink-3 mt-0.5 tabular-nums">
                        obj. {formatGrade(subject.targetGrade, settings.gradeScale)}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="size-4 text-ink-3 shrink-0" strokeWidth={2.4} />
                </a>
              </li>
            )
          })}
        </ul>
      )}

      {archived.length > 0 && (
        <section className="mt-6 max-w-[760px]" aria-label="Asignaturas archivadas">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
            className="pressable min-h-[44px] px-4 py-2 mb-1 inline-flex items-center gap-2 rounded-full text-[0.9375rem] font-semibold text-ink-2 hover:bg-fill/60"
          >
            <Archive className="size-4" aria-hidden="true" />
            Archivadas ({archived.length})
            <ChevronRight
              className={cx('size-4 transition-transform duration-200', showArchived && 'rotate-90')}
              strokeWidth={2.4}
              aria-hidden="true"
            />
          </button>
          {showArchived && (
            <>
              <ul className="card overflow-hidden">
                {archived.map((subject, i) => {
                  const grades = data.grades.filter((g) => g.subjectId === subject.id).length
                  const exams = data.exams.filter((e) => e.subjectId === subject.id).length
                  return (
                    <li key={subject.id} className={cx('flex items-center gap-3 pr-3', i > 0 && 'inset-separator-wide')}>
                      <a
                        href={hrefFor('asignaturas', { id: subject.id })}
                        className="flex min-w-0 flex-1 items-center gap-3.5 pl-4 py-3 transition-colors duration-150 active:bg-fill hover:bg-fill/50"
                      >
                        <span
                          aria-hidden
                          className="grid place-items-center size-10 rounded-full text-[0.8125rem] font-bold shrink-0 opacity-60"
                          style={{ background: quietVar(subject.color), color: colorVar(subject.color) }}
                        >
                          {subject.shortName}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[1rem] font-medium text-ink-2 truncate">{subject.name}</span>
                          <span className="block text-[0.8125rem] text-ink-3 truncate">
                            {grades} {grades === 1 ? 'nota' : 'notas'} · {exams} {exams === 1 ? 'examen' : 'exámenes'}
                          </span>
                        </span>
                      </a>
                      <Button
                        size="sm"
                        onClick={() => dispatch({ type: 'subject/update', id: subject.id, patch: { archived: false } })}
                      >
                        Recuperar
                      </Button>
                    </li>
                  )
                })}
              </ul>
              <p className="px-4 mt-1.5 text-[0.8125rem] leading-snug text-ink-3">
                No cuentan en las medias, el horario ni las sugerencias. Sus notas y exámenes siguen guardados.
              </p>
            </>
          )}
        </section>
      )}

      <div className="mt-8">
        <WeekSchedule />
      </div>

      <SubjectEditor open={creating} onClose={() => setCreating(false)} />
    </Page>
  )
}
