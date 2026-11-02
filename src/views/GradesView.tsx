import { useState } from 'react'
import { Calculator, GraduationCap, Plus } from 'lucide-react'

import { formatGrade, numeralTone } from '@/domain/grades'
import { TERMS, termName, type GradeEntry, type TermId } from '@/domain/types'
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
import { Button, Card, EmptyState, Numeral, Segmented, cx } from '@/ui/primitives'

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
            <Button variant="secondary" onClick={() => openCalculator(undefined)}>
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
        toolbar={
          <Segmented
            label="Evaluación"
            value={scope}
            onChange={setScope}
            options={[
              ...TERMS.map((t) => ({ value: t.id as Scope, label: t.short })),
              { value: 'todas' as Scope, label: 'Curso' },
            ]}
          />
        }
      />

      {/* --- Medias por evaluación --- */}
      <TermSummary
        averages={termAverages}
        scale={settings.gradeScale}
        active={scope}
        onSelect={setScope}
        mode={settings.averageMode}
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
              <Card key={subject.id} flush className="overflow-hidden">
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
// Medias por evaluación
// ---------------------------------------------------------------------------

interface TermSummaryProps {
  averages: { term: TermId | 'final'; average: number | null }[]
  scale: { max: number; pass: number; decimals: number }
  active: Scope
  onSelect: (scope: Scope) => void
  mode: 'aritmetica' | 'ponderada'
}

/**
 * Las tres evaluaciones y la nota final, en una sola fila.
 *
 * La final se separa con una línea más marcada y una cifra mayor: no es una
 * cuarta evaluación, es el resultado de las otras tres.
 */
function TermSummary({ averages, scale, active, onSelect, mode }: TermSummaryProps) {
  const withGrades = averages.some((a) => a.average !== null)
  if (!withGrades) return null

  return (
    // Cuatro tarjetas pequeñas, como widgets: la evaluación elegida se marca
    // con un anillo, no con un fondo que se confunde con el estado «pulsado».
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {averages.map((entry) => {
        const isFinal = entry.term === 'final'
        const label = entry.term === 'final' ? 'Nota final' : termName(entry.term)
        const selected = !isFinal && active === entry.term

        const content = (
          <>
            <span
              className={cx(
                'block text-[0.8125rem] font-semibold',
                selected ? 'text-accent' : 'text-ink-2',
              )}
            >
              {label}
            </span>
            <span className="block mt-2">
              <Numeral
                value={formatGrade(entry.average, scale)}
                size="md"
                tone={numeralTone(entry.average, scale)}
              />
            </span>
          </>
        )

        // La final no es seleccionable: para verla hay que ir a «Curso», que
        // es lo que representa realmente.
        return isFinal ? (
          <div key="final" className="card px-4 py-3.5">
            {content}
            <span className="block text-[0.6875rem] text-ink-3 mt-1">
              media {mode === 'ponderada' ? 'ponderada por horas' : 'de las asignaturas'}
            </span>
          </div>
        ) : (
          <button
            key={entry.term}
            type="button"
            onClick={() => onSelect(entry.term as Scope)}
            aria-pressed={selected}
            className={cx('card pressable px-4 py-3.5 text-left', selected && 'ring-2 ring-accent')}
          >
            {content}
          </button>
        )
      })}
    </div>
  )
}
