import { useMemo, useState } from 'react'
import { CalendarPlus, ClipboardList, PlaneTakeoff } from 'lucide-react'

import { MONTHS_LONG, daysUntil, parseDay, WEEKDAYS_LONG } from '@/domain/dates'
import { clockOf, isExamOver } from '@/domain/exams'
import { studyHref } from '@/router'
import { colorVar, quietVar } from '@/domain/palette'
import { TERMS, termName, type Exam, type GradeEntry, type Subject, type TermId } from '@/domain/types'
import { useSettings, useStore, useToday } from '@/state/StoreProvider'
import { useMinuteClock, useSubjectMap } from '@/state/selectors'
import { Page, PageHeader } from '@/layout/AppShell'
import { ExamEditor } from '@/features/exams/ExamEditor'
import { ExamPrep, useExamPlan } from '@/features/exams/ExamPrep'
import { Button, Card, EmptyState, GroupTitle, Segmented, cx } from '@/ui/primitives'

type Scope = TermId | 'todas'
type Order = 'fecha' | 'asignatura'

/** Más antiguo primero: el orden en que fueron ocurriendo. */
function byDate(a: Exam, b: Exam): number {
  return (
    a.date.localeCompare(b.date) ||
    (a.time ?? '').localeCompare(b.time ?? '') ||
    a.title.localeCompare(b.title, 'es')
  )
}

function scoreText(grade: GradeEntry, decimals: number): string {
  const fmt = (n: number) =>
    n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: decimals })
  return grade.maxScore === 10 ? fmt(grade.score) : `${fmt(grade.score)} / ${fmt(grade.maxScore)}`
}

/** «Hoy», «Mañana», «En 4 días». */
function countdown(days: number): string {
  if (days <= 0) return 'Hoy'
  if (days === 1) return 'Mañana'
  return `${days} días`
}

/**
 * Arriba, los próximos (con su cuenta atrás); debajo, los ya hechos, por
 * evaluación, y dentro de cada una por fecha o por asignatura. «Hecho» = su
 * hora ya pasó (según `isExamOver`) o ya tiene la nota apuntada.
 */
export function ExamsView() {
  const settings = useSettings()
  const { data } = useStore()
  const today = useToday()
  const minute = useMinuteClock()
  const subjects = useSubjectMap()

  const [scope, setScope] = useState<Scope>(settings.activeTerm)
  const [order, setOrder] = useState<Order>('fecha')
  const [editing, setEditing] = useState<Exam | null>(null)
  const [creating, setCreating] = useState(false)

  const grades = useMemo(() => new Map(data.grades.map((g) => [g.id, g])), [data.grades])

  const { upcoming, done } = useMemo(() => {
    const clock = clockOf(new Date(minute * 60_000))
    const up: Exam[] = []
    const finished: Exam[] = []
    for (const exam of data.exams) {
      if (subjects.get(exam.subjectId)?.archived) continue
      const hasGrade = !!(exam.gradeEntryId && grades.has(exam.gradeEntryId))
      const examForClock = hasGrade ? exam : { ...exam, gradeEntryId: undefined }
      if (hasGrade || isExamOver(examForClock, subjects, clock)) {
        finished.push(exam)
      } else {
        up.push(exam)
      }
    }
    up.sort(byDate)
    return { upcoming: up, done: finished }
    // `today` asegura recálculo al cruzar medianoche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.exams, subjects, grades, minute, today])

  const terms = scope === 'todas' ? TERMS.map((t) => t.id) : [scope]
  const blocks = terms
    .map((term) => ({ term, exams: done.filter((e) => e.term === term).sort(byDate) }))
    .filter((b) => b.exams.length > 0)

  const total = blocks.reduce((n, b) => n + b.exams.length, 0)

  const row = (exam: Exam, showSubject: boolean, index: number) => {
    const subject = subjects.get(exam.subjectId)
    const grade = exam.gradeEntryId ? grades.get(exam.gradeEntryId) : undefined
    return (
      <li key={exam.id} className={cx('flex', index > 0 && 'inset-separator-wide')}>
        <button
          type="button"
          onClick={() => setEditing(exam)}
          className="w-full min-w-0 text-left flex items-center gap-2.5 sm:gap-3.5 pl-3 sm:pl-4 pr-3 sm:pr-4 py-3 transition-colors duration-150 active:bg-fill hover:bg-fill/50"
        >
          <DateLeaf date={exam.date} subject={subject} />
          <span className="flex-1 min-w-0">
            {showSubject && (
              <span
                className="block text-[0.75rem] font-semibold truncate"
                style={{ color: subject ? colorVar(subject.color) : undefined }}
              >
                {subject?.name ?? 'Sin asignatura'}
              </span>
            )}
            <span className="block text-[0.9375rem] font-medium text-ink leading-snug truncate">
              {exam.title}
            </span>
            <span className="block text-[0.75rem] text-ink-3 mt-0.5 tabular-nums truncate">
              {parseDay(exam.date).getDate()} de {MONTHS_LONG[parseDay(exam.date).getMonth()]}
            </span>
          </span>
          <span
            className={cx(
              'shrink-0 rounded-full px-2.5 h-7 inline-flex items-center text-[0.8125rem] font-semibold tabular-nums',
              grade ? 'bg-accent-quiet text-accent' : 'bg-fill text-ink-3',
            )}
          >
            {grade ? scoreText(grade, settings.gradeScale.decimals) : 'Sin nota'}
          </span>
        </button>
      </li>
    )
  }

  return (
    <Page className="max-w-[900px]">
      <PageHeader
        title="Exámenes"
        actions={
          <Button variant="primary" onClick={() => setCreating(true)} className="max-lg:hidden">
            <CalendarPlus className="size-4" strokeWidth={2.3} />
            Nuevo examen
          </Button>
        }
        subtitle={
          total > 0
            ? `${total} ${total === 1 ? 'examen hecho' : 'exámenes hechos'} · ${termName(scope)}`
            : undefined
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2.5">
            <Segmented
              label="Evaluación"
              value={scope}
              onChange={setScope}
              options={[
                ...TERMS.map((t) => ({ value: t.id as Scope, label: t.short })),
                { value: 'todas' as Scope, label: 'Curso' },
              ]}
            />
            <Segmented
              label="Ordenar"
              value={order}
              onChange={setOrder}
              options={[
                { value: 'fecha' as Order, label: 'Por fecha' },
                { value: 'asignatura' as Order, label: 'Por asignatura' },
              ]}
            />
          </div>
        }
      />

      {upcoming.length > 0 && (
        <section aria-label="Próximos exámenes" className="mb-8">
          <GroupTitle title="Próximos" hint={`${upcoming.length} ${upcoming.length === 1 ? 'examen' : 'exámenes'}`} />
          <ul className="card overflow-hidden">
            {upcoming.map((exam, i) => {
              const subject = subjects.get(exam.subjectId)
              const days = daysUntil(exam.date, today)
              const near = days <= 3
              return (
                <li key={exam.id} className={cx('flex items-center pr-1.5 sm:pr-3', i > 0 && 'inset-separator-wide')}>
                  <button
                    type="button"
                    onClick={() => setEditing(exam)}
                    className="flex-1 min-w-0 text-left flex items-center gap-3 sm:gap-3.5 pl-3.5 sm:pl-4 pr-2 py-3 transition-colors duration-150 active:bg-fill hover:bg-fill/50"
                  >
                    <DateLeaf date={exam.date} subject={subject} />
                    <span className="flex-1 min-w-0">
                      <span
                        className="block text-[0.75rem] font-semibold truncate"
                        style={{ color: subject ? colorVar(subject.color) : undefined }}
                      >
                        {subject?.name ?? 'Sin asignatura'}
                        {exam.time ? ` · ${exam.time}` : ''}
                      </span>
                      <span className="block text-[0.9375rem] font-medium text-ink leading-snug line-clamp-2">
                        {exam.title}
                      </span>
                      {exam.topics && (
                        <span className="block text-[0.75rem] text-ink-3 mt-0.5 truncate">{exam.topics}</span>
                      )}
                      <ExamPrep exam={exam} color={subject ? colorVar(subject.color) : 'var(--c-accent)'} />
                    </span>
                    <span
                      className={cx(
                        'shrink-0 rounded-full px-2.5 h-7 inline-flex items-center text-[0.8125rem] font-semibold tabular-nums',
                        days <= 0
                          ? 'bg-danger-quiet text-danger'
                          : near
                            ? 'bg-warn-quiet text-warn'
                            : 'bg-fill text-ink-2',
                      )}
                    >
                      {countdown(days)}
                    </span>
                  </button>
                  <PrepareLink exam={exam} />
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {upcoming.length > 0 && <GroupTitle title="Hechos" />}

      {blocks.length === 0 ? (
        <Card>
          <EmptyState
            compact
            icon={<ClipboardList className="size-5" />}
            title="Aún no hay exámenes hechos"
            description={
              scope === 'todas'
                ? 'Aparecen aquí al pasar su fecha, con su nota.'
                : `Los de la ${termName(scope).toLowerCase()} aparecen aquí al pasar su fecha, con su nota.`
            }
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                Apuntar uno pasado
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-7">
          {blocks.map(({ term, exams }) => (
            <section key={term} aria-label={termName(term)}>
              {scope === 'todas' && (
                <GroupTitle title={termName(term)} hint={`${exams.length} ${exams.length === 1 ? 'examen' : 'exámenes'}`} />
              )}

              {order === 'fecha' ? (
                <ul className="card overflow-hidden">{exams.map((e, i) => row(e, true, i))}</ul>
              ) : (
                <div className="flex flex-col gap-4">
                  {groupBySubject(exams, subjects).map(({ key, subject, items }) => (
                    <div key={key}>
                      <h3
                        className="px-1 mb-1.5 text-[0.8125rem] font-semibold"
                        style={{ color: subject ? colorVar(subject.color) : undefined }}
                      >
                        {subject?.name ?? 'Sin asignatura'}
                        <span className="text-ink-3 font-normal"> · {items.length}</span>
                      </h3>
                      <ul className="card overflow-hidden">{items.map((e, i) => row(e, false, i))}</ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <ExamEditor open={editing !== null} onClose={() => setEditing(null)} exam={editing} />
      <ExamEditor open={creating} onClose={() => setCreating(false)} />
    </Page>
  )
}

function groupBySubject(exams: Exam[], subjects: Map<string, Subject>) {
  const groups = new Map<string, Exam[]>()
  for (const exam of exams) {
    const list = groups.get(exam.subjectId) ?? []
    list.push(exam)
    groups.set(exam.subjectId, list)
  }
  return [...groups.entries()]
    .map(([key, items]) => ({ key, subject: subjects.get(key), items }))
    .sort((a, b) => (a.subject?.name ?? '~').localeCompare(b.subject?.name ?? '~', 'es'))
}

function DateLeaf({ date, subject }: { date: string; subject?: Subject }) {
  const day = parseDay(date)
  return (
    <span
      aria-hidden
      className="grid w-11 shrink-0 overflow-hidden rounded-[10px] text-center bg-fill border border-hairline"
    >
      <span
        className="text-[0.625rem] font-bold uppercase tracking-[0.04em] leading-[1.6] text-ink"
        style={{
          background: subject ? quietVar(subject.color) : 'var(--c-fill-2)',
          color: subject ? colorVar(subject.color) : 'var(--c-ink-2)',
        }}
      >
        {WEEKDAYS_LONG[day.getDay()].slice(0, 3)}
      </span>
      <span className="numeral text-[1.25rem] leading-[1.6] text-ink bg-surface">
        {day.getDate()}
      </span>
    </span>
  )
}

/** Preparar el examen: un vuelo de Estudio con lo que toca hoy (en el iPad). */
function PrepareLink({ exam }: { exam: Exam }) {
  const plan = useExamPlan(exam)
  const minutes = plan && plan.todayLeft > 0 ? Math.max(15, plan.todayLeft) : 25
  return (
    <a
      href={studyHref({ examId: exam.id, subjectId: exam.subjectId, minutes })}
      aria-label={`Preparar ${exam.title}: ${minutes} minutos`}
      title={`Preparar examen · ${minutes} min`}
      // Preparar es un vuelo de Estudio, que se usa en el iPad: en
      // el iPhone el botón solo robaba ancho al nombre del examen.
      className="pressable max-sm:hidden grid place-items-center size-11 shrink-0 rounded-full text-accent hover:bg-accent-quiet"
    >
      <PlaneTakeoff className="size-4" aria-hidden="true" />
    </a>
  )
}
