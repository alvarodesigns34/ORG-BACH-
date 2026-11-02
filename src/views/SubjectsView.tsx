import { useState } from 'react'
import { BookOpen, ChevronRight, Plus } from 'lucide-react'

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
              .filter((e) => e.subjectId === subject.id && e.date >= today)
              .sort((a, b) => a.date.localeCompare(b.date))[0]
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

      <SubjectEditor open={creating} onClose={() => setCreating(false)} />
    </Page>
  )
}
