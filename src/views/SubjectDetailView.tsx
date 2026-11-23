import { useMemo, useState } from 'react'
import { Archive, CalendarPlus, Clock, ListChecks, Pencil, PlaneTakeoff, Plus } from 'lucide-react'

import { WEEKDAYS_LONG } from '@/domain/dates'
import { formatFlightTime } from '@/domain/flights'
import { formatGrade, formatPercent, numeralTone } from '@/domain/grades'
import { colorVar } from '@/domain/palette'
import { isDone, sortTasks } from '@/domain/tasks'
import { TERMS, termName, type Exam, type GradeEntry, type Task, type TermId } from '@/domain/types'
import { hrefFor, studyHref } from '@/router'
import { useDispatch, useSettings, useStore, useToday } from '@/state/StoreProvider'
import { useSubjectResults } from '@/state/selectors'
import { Page, PageHeader } from '@/layout/AppShell'
import { useAmbient } from '@/layout/chrome'
import { ExamCard } from '@/features/exams/ExamCard'
import { ExamEditor } from '@/features/exams/ExamEditor'
import { GradeCalculator } from '@/features/grades/GradeCalculator'
import { GradeEditor } from '@/features/grades/GradeEditor'
import { SubjectGrades } from '@/features/grades/SubjectGrades'
import { SubjectEditor } from '@/features/subjects/SubjectEditor'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import { TaskList } from '@/features/tasks/TaskRow'
import { Button, Card, EmptyState, Numeral, SectionHeader, Segmented } from '@/ui/primitives'

type Scope = TermId | 'todas'

export function SubjectDetailView({ subjectId }: { subjectId: string }) {
  const settings = useSettings()
  const today = useToday()
  const { data } = useStore()
  const dispatch = useDispatch()
  const [scope, setScope] = useState<Scope>(settings.activeTerm)
  const results = useSubjectResults(scope)

  const subject = data.subjects.find((s) => s.id === subjectId)
  const result = results.get(subjectId)
  // La pantalla se tiñe del color de la asignatura.
  useAmbient(subject ? colorVar(subject.color) : null)

  const [editingSubject, setEditingSubject] = useState(false)
  const [editingGrade, setEditingGrade] = useState<GradeEntry | null>(null)
  const [creatingGrade, setCreatingGrade] = useState<{ categoryId?: string | null } | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [creatingTask, setCreatingTask] = useState(false)
  const [creatingExam, setCreatingExam] = useState(false)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)
  const [calculatorOpen, setCalculatorOpen] = useState(false)

  const tasks = useMemo(
    () => sortTasks(data.tasks.filter((t) => t.subjectId === subjectId && !isDone(t))),
    [data.tasks, subjectId],
  )

  const exams = useMemo(
    () =>
      data.exams
        .filter((e) => e.subjectId === subjectId && (e.date >= today || !e.gradeEntryId))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [data.exams, subjectId, today],
  )

  const studyMinutes = useMemo(
    () =>
      data.sessions.reduce(
        (sum, s) =>
          s.subjectId === subjectId && s.status !== 'en_vuelo'
            ? sum + (s.focusedMinutes ?? 0)
            : sum,
        0,
      ),
    [data.sessions, subjectId],
  )

  const sortedSchedule = useMemo(() => {
    if (!subject) return []
    const order = (d: number) => (d === 0 ? 7 : d)
    return [...subject.schedule].sort(
      (a, b) => order(a.day) - order(b.day) || a.start.localeCompare(b.start),
    )
  }, [subject])

  if (!subject || !result) {
    return (
      <Page className="max-w-[720px]">
        <Card>
          <EmptyState
            title="Esta asignatura ya no existe"
            description="Puede que la hayas eliminado. Vuelve al listado para ver las que tienes."
            action={
              <Button variant="primary" onClick={() => (window.location.hash = '/asignaturas')}>
                Ver asignaturas
              </Button>
            }
          />
        </Card>
      </Page>
    )
  }

  const accent = colorVar(subject.color)

  const metrics = [
    {
      label: scope === 'todas' ? 'Media curso' : `Media · ${TERMS.find((t) => t.id === scope)?.short}`,
      value: formatGrade(result.average, settings.gradeScale),
      tone: numeralTone(result.average, settings.gradeScale),
    },
    {
      label: 'Objetivo',
      value:
        subject.targetGrade !== undefined
          ? formatGrade(subject.targetGrade, settings.gradeScale)
          : '—',
    },
    {
      label: 'Evaluado',
      value: result.weightsDeclared ? formatPercent(result.evaluatedPercent) : '—',
    },
    {
      label: 'Estudiado',
      value: studyMinutes > 0 ? formatFlightTime(studyMinutes) : '—',
    },
  ]

  return (
    <Page>
      <PageHeader
        title={subject.name}
        back={{ href: hrefFor('asignaturas'), label: 'Asignaturas' }}
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: accent }} />
            {subject.shortName}
          </span>
        }
        subtitle={[
          subject.teacher,
          subject.room && `Aula ${subject.room}`,
          `${subject.weight} h/semana`,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <a
              href={studyHref({ subjectId, taskId: tasks[0]?.id, minutes: tasks[0]?.estimatedMinutes })}
              className="study-action-link min-h-[44px]"
            >
              <PlaneTakeoff className="size-4" aria-hidden="true" />
              Estudiar
            </a>
            <Button onClick={() => setEditingSubject(true)}>
              <Pencil className="size-4" />
              Editar
            </Button>
          </>
        }
        toolbar={
          <Segmented
            label="Evaluación de la asignatura"
            className="self-start"
            value={scope}
            onChange={setScope}
            options={[
              ...TERMS.map((t) => ({ value: t.id as Scope, label: t.short })),
              { value: 'todas' as Scope, label: 'Curso' },
            ]}
          />
        }
      />

      {subject.archived && (
        <div className="liquid rounded-[22px] mb-4 px-4 py-3 flex items-center gap-3 flex-wrap">
          <Archive className="relative z-[2] size-5 text-ink-3 shrink-0" aria-hidden="true" />
          <p className="relative z-[2] flex-1 min-w-[200px] text-[0.875rem] text-ink-2 leading-snug">
            Archivada: no sale en el horario, las medias ni las sugerencias. Sus notas y exámenes se conservan.
          </p>
          <Button
            size="sm"
            variant="primary"
            className="relative z-[2]"
            onClick={() => dispatch({ type: 'subject/update', id: subject.id, patch: { archived: false } })}
          >
            Recuperar
          </Button>
        </div>
      )}

      {/* --- Cifras --- */}
      <div className="card overflow-hidden">
        <dl className="grid grid-cols-2 sm:grid-cols-4">
          {metrics.map((metric, idx) => (
            <div
              key={metric.label}
              className={[
                'px-4 sm:px-5 py-4 border-hairline',
                idx % 2 === 1 && 'border-l',
                idx >= 2 && 'border-t sm:border-t-0',
                idx > 0 && 'sm:border-l',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <dt className="eyebrow whitespace-nowrap">{metric.label}</dt>
              <dd className="mt-2">
                <Numeral value={metric.value} size="sm" tone={metric.tone} />
              </dd>
            </div>
          ))}
        </dl>
        {sortedSchedule.length > 0 && (
          <div className="border-t border-hairline px-4 sm:px-5 py-2.5 flex flex-wrap items-center gap-2 text-[0.75rem] text-ink-2">
            <Clock className="size-3.5 text-ink-3 shrink-0" aria-hidden />
            {sortedSchedule.map((slot, i) => (
              <span
                key={`${slot.day}-${slot.start}-${i}`}
                className="rounded-full bg-fill px-2.5 py-0.5 tabular-nums"
              >
                <span className="capitalize font-medium text-ink">
                  {WEEKDAYS_LONG[slot.day].slice(0, 3)}
                </span>{' '}
                {slot.start}–{slot.end}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 mt-5">
        {/* --- Notas --- */}
        <div className="lg:col-span-7">
          <Card flush className="overflow-hidden">
            <SectionHeader
              title="Notas"
              hint={
                result.entryCount === 0
                  ? 'Sin notas todavía'
                  : `${result.entryCount} ${result.entryCount === 1 ? 'nota' : 'notas'} en ${termName(scope).toLowerCase()}`
              }
              className="px-5 sm:px-6 pt-5 pb-4"
            />
            <SubjectGrades
              hideHeader
              subject={subject}
              result={result}
              scale={settings.gradeScale}
              onAddGrade={(categoryId) => setCreatingGrade({ categoryId })}
              onEditGrade={setEditingGrade}
              onCalculate={() => setCalculatorOpen(true)}
            />
          </Card>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-5 lg:gap-6">
          {/* --- Exámenes --- */}
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
                title="Ninguno apuntado"
                description="Apunta el próximo y verás la cuenta atrás."
              />
            ) : (
              <ul className="pb-1">
                {exams.map((exam, i) => (
                  <li key={exam.id} className={i > 0 ? 'inset-separator-wide' : undefined}>
                    <ExamCard
                      exam={exam}
                      subject={subject}
                      today={today}
                      onOpen={setEditingExam}
                      hideSubject
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* --- Tareas --- */}
          <Card flush className="overflow-hidden">
            <SectionHeader
              title="Tareas pendientes"
              className="px-5 sm:px-6 pt-5 pb-4 border-b border-hairline"
              action={
                <Button size="sm" variant="ghost" onClick={() => setCreatingTask(true)}>
                  <Plus className="size-4" />
                  Añadir
                </Button>
              }
            />
            {tasks.length === 0 ? (
              <EmptyState
                compact
                icon={<ListChecks className="size-4" />}
                title="Nada pendiente"
                description={`No tienes tareas sin hacer de ${subject.name}.`}
              />
            ) : (
              <TaskList
                tasks={tasks}
                subjects={new Map([[subject.id, subject]])}
                onOpen={setEditingTask}
                hideSubject
              />
            )}
          </Card>
        </div>
      </div>

      <SubjectEditor
        open={editingSubject}
        subject={subject}
        onClose={() => setEditingSubject(false)}
      />
      <GradeEditor
        open={!!creatingGrade}
        onClose={() => setCreatingGrade(null)}
        defaults={{
          subjectId: subject.id,
          categoryId: creatingGrade?.categoryId ?? undefined,
          term: scope === 'todas' ? settings.activeTerm : scope,
        }}
      />
      <GradeEditor
        open={!!editingGrade}
        grade={editingGrade}
        onClose={() => setEditingGrade(null)}
      />
      <TaskEditor
        open={creatingTask}
        onClose={() => setCreatingTask(false)}
        defaults={{ subjectId: subject.id }}
      />
      <TaskEditor open={!!editingTask} task={editingTask} onClose={() => setEditingTask(null)} />
      <ExamEditor
        open={creatingExam}
        onClose={() => setCreatingExam(false)}
        defaults={{ subjectId: subject.id }}
      />
      <ExamEditor open={!!editingExam} exam={editingExam} onClose={() => setEditingExam(null)} />
      <GradeCalculator
        open={calculatorOpen}
        subjectId={subject.id}
        term={scope}
        onClose={() => setCalculatorOpen(false)}
      />
    </Page>
  )
}
