import { useMemo, useState } from 'react'
import { ArrowLeft, CalendarPlus, ListChecks, Pencil, Plus } from 'lucide-react'

import { formatGrade, formatPercent, numeralTone } from '@/domain/grades'
import { colorVar, quietVar } from '@/domain/palette'
import { isDone, sortTasks } from '@/domain/tasks'
import { TERMS, type GradeEntry, type Task } from '@/domain/types'
import { hrefFor } from '@/router'
import { useSettings, useStore, useToday } from '@/state/StoreProvider'
import { useSubjectResults } from '@/state/selectors'
import { Page } from '@/layout/AppShell'
import { ExamCard } from '@/features/exams/ExamCard'
import { ExamEditor } from '@/features/exams/ExamEditor'
import { GradeCalculator } from '@/features/grades/GradeCalculator'
import { GradeEditor } from '@/features/grades/GradeEditor'
import { SubjectGrades } from '@/features/grades/SubjectGrades'
import { SubjectEditor } from '@/features/subjects/SubjectEditor'
import { TaskEditor } from '@/features/tasks/TaskEditor'
import { TaskRow } from '@/features/tasks/TaskRow'
import { Button, Card, EmptyState, Numeral, SectionHeader } from '@/ui/primitives'

export function SubjectDetailView({ subjectId }: { subjectId: string }) {
  const settings = useSettings()
  const today = useToday()
  const { data } = useStore()
  const results = useSubjectResults(settings.activeTerm)

  const subject = data.subjects.find((s) => s.id === subjectId)
  const result = results.get(subjectId)

  const [editingSubject, setEditingSubject] = useState(false)
  const [editingGrade, setEditingGrade] = useState<GradeEntry | null>(null)
  const [creatingGrade, setCreatingGrade] = useState<{ categoryId?: string | null } | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [creatingTask, setCreatingTask] = useState(false)
  const [creatingExam, setCreatingExam] = useState(false)
  const [calculatorOpen, setCalculatorOpen] = useState(false)

  const tasks = useMemo(
    () => sortTasks(data.tasks.filter((t) => t.subjectId === subjectId && !isDone(t))),
    [data.tasks, subjectId],
  )

  const exams = useMemo(
    () =>
      data.exams
        .filter((e) => e.subjectId === subjectId && e.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [data.exams, subjectId, today],
  )

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
      label: 'Media actual',
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
    { label: 'Tareas pendientes', value: String(tasks.length) },
  ]

  return (
    <Page>
      <a
        href={hrefFor('asignaturas')}
        className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-3 hover:text-ink transition-colors duration-150 mb-5"
      >
        <ArrowLeft className="size-3.5" />
        Asignaturas
      </a>

      {/* --- Cabecera --- */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 mb-7">
        <div className="min-w-0">
          <span
            className="inline-flex items-center rounded-xs px-1.5 py-0.5 text-[0.6875rem] font-bold tracking-[0.04em]"
            style={{ background: quietVar(subject.color), color: accent }}
          >
            {subject.shortName}
          </span>
          <h1 className="display text-[1.75rem] sm:text-[2.125rem] leading-[1.1] tracking-[-0.025em] mt-2">
            {subject.name}
          </h1>
          {(subject.teacher || subject.room) && (
            <p className="text-[0.875rem] text-ink-3 mt-1.5">
              {[subject.teacher, subject.room && `Aula ${subject.room}`, `${subject.weight} h/semana`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>

        <Button variant="secondary" onClick={() => setEditingSubject(true)}>
          <Pencil className="size-4" />
          Editar
        </Button>
      </header>

      {/* --- Cifras --- */}
      <div className="relative bg-surface border border-hairline rounded-lg overflow-hidden">
        <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
        <dl className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-hairline pt-1">
          {metrics.map((metric) => (
            <div key={metric.label} className="px-4 sm:px-5 py-4">
              <dt className="eyebrow whitespace-nowrap">{metric.label}</dt>
              <dd className="mt-2">
                <Numeral value={metric.value} size="sm" tone={metric.tone} />
              </dd>
            </div>
          ))}
        </dl>
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
                  : `${result.entryCount} ${result.entryCount === 1 ? 'nota' : 'notas'} en ${TERMS.find((t) => t.id === settings.activeTerm)!.name.toLowerCase()}`
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
                title="Ninguno apuntado"
                description="Apunta el próximo y verás aquí la cuenta atrás."
              />
            ) : (
              <div className="px-2 pb-3">
                {exams.map((exam) => (
                  <ExamCard key={exam.id} exam={exam} subject={subject} today={today} hideSubject />
                ))}
              </div>
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
              <ul>
                {tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    subject={subject}
                    onOpen={setEditingTask}
                    hideSubject
                  />
                ))}
              </ul>
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
          term: settings.activeTerm,
        }}
      />
      <GradeEditor open={!!editingGrade} grade={editingGrade} onClose={() => setEditingGrade(null)} />
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
      <GradeCalculator
        open={calculatorOpen}
        subjectId={subject.id}
        onClose={() => setCalculatorOpen(false)}
      />
    </Page>
  )
}
