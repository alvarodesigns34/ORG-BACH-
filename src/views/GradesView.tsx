import { useState } from 'react'
import { Calculator, GraduationCap, Plus } from 'lucide-react'

import { formatGrade, numeralTone, type SubjectResult } from '@/domain/grades'
import { colorVar } from '@/domain/palette'
import { TERMS, termName, type GradeEntry, type GradeScale, type Subject, type TermId } from '@/domain/types'
import { useSettings, useStore } from '@/state/StoreProvider'
import {
  useGlobalAverage,
  useSubjectResults,
  useSubjects,
  useTermAverages,
} from '@/state/selectors'
import { Page, PageHeader } from '@/layout/AppShell'
import { GradeCalculator } from '@/features/grades/GradeCalculator'
import { GradeEditor } from '@/features/grades/GradeEditor'
import { SubjectGrades } from '@/features/grades/SubjectGrades'
import { Button, Card, EmptyState, Numeral, cx } from '@/ui/primitives'

type Scope = TermId | 'todas'

export function GradesView() {
  const settings = useSettings()
  const { data } = useStore()
  const subjects = useSubjects()

  const [scope, setScope] = useState<Scope>(settings.activeTerm)
  const results = useSubjectResults(scope)
  const average = useGlobalAverage(scope)
  const termAverages = useTermAverages()

  const [editing, setEditing] = useState<GradeEntry | null>(null)
  const [creating, setCreating] = useState<{
    subjectId?: string
    categoryId?: string | null
  } | null>(null)
  const [calculatorFor, setCalculatorFor] = useState<string | undefined>(undefined)
  const [calculatorOpen, setCalculatorOpen] = useState(false)

  const openCalculator = (subjectId?: string) => {
    setCalculatorFor(subjectId)
    setCalculatorOpen(true)
  }

  const scopeLabel = termName(scope)

  if (subjects.length === 0) {
    return (
      <Page className="max-w-[900px]">
        <PageHeader title="Notas" />
        <Card>
          <EmptyState
            icon={<GraduationCap className="size-5" />}
            title="Primero necesitas asignaturas"
            description="Las notas cuelgan de una asignatura, y es la asignatura la que decide cómo se reparte el peso entre exámenes, trabajos y actitud."
            action={
              <Button variant="primary" onClick={() => (window.location.hash = '/asignaturas')}>
                Crear asignaturas
              </Button>
            }
          />
        </Card>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        title="Notas"
        subtitle={
          data.grades.length === 0
            ? 'Todavía no has registrado ninguna nota.'
            : `${data.grades.length} ${data.grades.length === 1 ? 'nota registrada' : 'notas registradas'} en el curso.`
        }
        actions={
          <>
            <Button variant="secondary" aria-label="Calculadora de notas" onClick={() => openCalculator(undefined)}>
              <Calculator className="size-4" />
              <span className="hidden sm:inline">Calculadora</span>
            </Button>
            <Button onClick={() => setCreating({})}>
              <Plus className="size-4" strokeWidth={2.5} />
              <span className="hidden sm:inline">Añadir nota</span>
              <span className="sm:hidden">Nota</span>
            </Button>
          </>
        }
      />

      {/* --- Medias por evaluación --- */}
      <GradeHero
        average={average}
        scopeLabel={scopeLabel}
        averages={termAverages}
        scale={settings.gradeScale}
        active={scope}
        onSelect={setScope}
        mode={settings.averageMode}
        subjects={subjects}
        results={results}
      />

      {/* --- Media del ámbito elegido --- */}
      {data.grades.length === 0 ? (
        <Card className="mt-5">
          <EmptyState
            icon={<GraduationCap className="size-5" />}
            title="Aún no hay notas"
            description="Apunta la primera y verás al momento la media de la asignatura, cuánto llevas evaluado y qué necesitas para llegar a tu objetivo."
            action={
              <Button variant="primary" onClick={() => setCreating({})}>
                <Plus className="size-4" />
                Añadir la primera nota
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4 mt-5">
          {subjects.map((subject) => {
            const result = results.get(subject.id)
            if (!result) return null
            return (
              <Card key={subject.id} id={`nota-${subject.id}`} flush className="overflow-hidden">
                <SubjectGrades
                  subject={subject}
                  result={result}
                  scale={settings.gradeScale}
                  onAddGrade={(categoryId) => setCreating({ subjectId: subject.id, categoryId })}
                  onEditGrade={setEditing}
                  onCalculate={() => openCalculator(subject.id)}
                  collapsible
                />
              </Card>
            )
          })}

          <p className="text-[0.75rem] text-ink-3 px-1 text-balance">
            Las medias que ves corresponden a {scopeLabel}. Una categoría sin notas no cuenta
            todavía: no baja la media, simplemente no participa hasta que la evalúen.
            {average !== null && <> Media global: {formatGrade(average, settings.gradeScale)}.</>}
          </p>
        </div>
      )}

      <GradeEditor
        open={!!creating}
        onClose={() => setCreating(null)}
        defaults={{
          subjectId: creating?.subjectId,
          categoryId: creating?.categoryId ?? undefined,
          term: scope === 'todas' ? settings.activeTerm : scope,
        }}
      />
      <GradeEditor open={!!editing} grade={editing} onClose={() => setEditing(null)} />
      <GradeCalculator
        open={calculatorOpen}
        subjectId={calculatorFor}
        term={scope}
        onClose={() => setCalculatorOpen(false)}
      />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Cabecera de notas: la cifra y la regla
// ---------------------------------------------------------------------------

interface GradeHeroProps {
  average: number | null
  scopeLabel: string
  averages: { term: TermId | 'final'; average: number | null }[]
  scale: GradeScale
  active: Scope
  onSelect: (scope: Scope) => void
  mode: 'aritmetica' | 'ponderada'
  subjects: Subject[]
  results: Map<string, SubjectResult>
}

/**
 * El gesto propio de Notas: UNA cifra grande (la media de lo que estás
 * mirando) y, al lado, una regla de 0 a la nota máxima con cada asignatura
 * colocada donde está. De un vistazo se ve quién tira de la media y quién se
 * acerca al aprobado, sin leer una tabla. Tocar un punto lleva a su ficha.
 */
function GradeHero({ average, scopeLabel, averages, scale, active, onSelect, mode, subjects, results }: GradeHeroProps) {
  const withGrades = averages.some((a) => a.average !== null)
  if (!withGrades) return null

  const points = subjects
    .map((subject) => ({ subject, value: results.get(subject.id)?.average ?? null }))
    .filter((p): p is { subject: Subject; value: number } => p.value !== null)
    .sort((a, b) => a.value - b.value)

  // La regla se acerca a donde están las notas (pero siempre enseña el
  // aprobado): con todo entre 7 y 9, una regla de 0 a 10 los amontona.
  const lowest = Math.min(scale.pass, ...points.map((p) => p.value))
  const lo = Math.max(0, Math.floor(lowest) - 1)
  const hi = scale.max
  const at = (value: number) => ((value - lo) / (hi - lo)) * 100

  // Etiquetas que no se pisan: cada una va a la fila más baja libre.
  const GAP = 10
  const rowEnds: number[] = []
  const rows = points.map((p) => {
    const pct = at(p.value)
    let row = rowEnds.findIndex((end) => pct - end >= GAP)
    if (row === -1) row = rowEnds.length
    rowEnds[row] = pct
    return Math.min(row, 3)
  })
  const pass = at(scale.pass)
  const fmt = (n: number) => String(n).replace('.', ',')

  return (
    <section className="card grade-hero p-5 sm:p-7 grid gap-6 lg:grid-cols-[minmax(13rem,auto)_1fr] lg:items-end">
      <div>
        <p className="text-[0.8125rem] font-semibold text-ink-3">Media · {scopeLabel}</p>
        <p className="mt-1">
          <Numeral value={formatGrade(average, scale)} size="xl" tone={numeralTone(average, scale)} className="grade-hero-figure" />
        </p>
        <div className="flex flex-wrap gap-1.5 mt-4" role="group" aria-label="Media por evaluación">
          {averages.map((entry) => {
            const isFinal = entry.term === 'final'
            const selected = isFinal ? active === 'todas' : active === entry.term
            return (
              <button
                key={entry.term}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(isFinal ? 'todas' : (entry.term as Scope))}
                title={isFinal ? `Nota final: media ${mode === 'ponderada' ? 'ponderada por horas' : 'de las asignaturas'}` : termName(entry.term as TermId)}
                className={cx(
                  'glass-btn inline-flex items-baseline gap-1.5 h-8 px-3 rounded-full text-[0.75rem] font-semibold',
                  selected ? 'text-ink' : 'text-ink-3',
                )}
              >
                {isFinal ? 'Curso' : TERMS.find((t) => t.id === entry.term)?.short}
                <span className={cx('tabular-nums', selected ? 'text-ink' : 'text-ink-2')}>
                  {formatGrade(entry.average, scale)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grade-ruler" aria-label={`Asignaturas en la escala de ${lo} a ${hi}`}>
        <div className="relative h-[5.5rem]">
          {points.map((p, i) => {
            const pct = at(p.value)
            return (
              <a
                key={p.subject.id}
                href={`#nota-${p.subject.id}`}
                onClick={(event) => {
                  event.preventDefault()
                  document.getElementById(`nota-${p.subject.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className="grade-ruler-label absolute bottom-0 -translate-x-1/2 text-[0.6875rem] font-bold whitespace-nowrap"
                style={{ left: `${pct}%`, color: colorVar(p.subject.color), ['--row' as string]: rows[i], animationDelay: `${120 + i * 50}ms` }}
                aria-label={`${p.subject.name}: ${formatGrade(p.value, scale)}`}
              >
                <span className="grade-ruler-stem" aria-hidden />
                {p.subject.shortName || p.subject.name}
              </a>
            )
          })}
        </div>
        <div className="relative h-3">
          <div className="grade-ruler-track absolute inset-x-0 top-1/2 -translate-y-1/2" style={{ ['--pass' as string]: `${pass}%` }} />
          {points.map((p, i) => (
            <span
              key={p.subject.id}
              aria-hidden
              className="grade-ruler-dot absolute top-1/2"
              style={{ left: `${at(p.value)}%`, background: colorVar(p.subject.color), animationDelay: `${80 + i * 50}ms` }}
            />
          ))}
        </div>
        <div className="relative h-5 mt-1.5 text-[0.6875rem] font-medium text-ink-3 tabular-nums">
          <span className="absolute left-0">{fmt(lo)}</span>
          <span className="absolute -translate-x-1/2 font-semibold text-ink-2" style={{ left: `${pass}%` }}>
            {fmt(scale.pass)}
          </span>
          <span className="absolute right-0">{fmt(hi)}</span>
        </div>
      </div>
    </section>
  )
}
