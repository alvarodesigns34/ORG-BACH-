import { useMemo, useState } from 'react'
import { CalendarPlus, ListChecks, Pencil, Plus } from 'lucide-react'

import { formatGrade, formatPercent, numeralTone } from '@/domain/grades'
import { colorVar } from '@/domain/palette'
import { isDone, sortTasks } from '@/domain/tasks'
import { termName, type Exam, type GradeEntry, type Task } from '@/domain/types'
import { hrefFor } from '@/router'
import { useSettings, useStore, useToday } from '@/state/StoreProvider'
import { useSubjectResults } from '@/state/selectors'
import { Page, PageHeader } from '@/layout/AppShell'
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
          <Button onClick={() => setEditingSubject(true)}>
            <Pencil className="size-4" />
            Editar
          </Button>
        }
      />

      {/* --- Cifras --- */}
      <div className="card overflow-hidden">
        <dl className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-hairline">
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
                  : `${result.entryCount} ${result.entryCount === 1 ? 'nota' : 'notas'} en ${termName(settings.activeTerm).toLowerCase()}`
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
        term={settings.activeTerm}
        onClose={() => setCalculatorOpen(false)}
      />
    </Page>
  )
}
