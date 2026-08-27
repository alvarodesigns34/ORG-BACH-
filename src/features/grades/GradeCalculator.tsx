import { useEffect, useMemo, useState } from 'react'
import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react'

import {
  formatGrade,
  formatPercent,
  numeralTone,
  projectAverage,
  requiredGrade,
  round,
} from '@/domain/grades'
import type { RequiredStatus } from '@/domain/grades'
import { parseDecimal, toDecimalInput } from '@/domain/number'
import { useSettings } from '@/state/StoreProvider'
import { useSubjectResults, useSubjects } from '@/state/selectors'
import { Field, NumberInput, Select } from '@/ui/fields'
import { Modal } from '@/ui/Modal'
import { Button, Numeral, Segmented, cx } from '@/ui/primitives'

type Mode = 'necesito' | 'simular'

interface GradeCalculatorProps {
  open: boolean
  onClose: () => void
  /** Asignatura de partida; si no se indica, se elige en el propio diálogo. */
  subjectId?: string
}

/**
 * Calculadora de notas.
 *
 * Se rellena sola con los datos reales de la asignatura, pero deja tocar todos
 * los campos a mano: sirve tanto para «cómo voy» como para probar escenarios
 * («¿y si el profesor cambia los pesos?»).
 */
export function GradeCalculator({ open, onClose, subjectId }: GradeCalculatorProps) {
  const settings = useSettings()
  const subjects = useSubjects()
  const results = useSubjectResults(settings.activeTerm)
  const scale = settings.gradeScale

  const [mode, setMode] = useState<Mode>('necesito')
  const [selected, setSelected] = useState('')
  const [current, setCurrent] = useState('')
  const [evaluated, setEvaluated] = useState('')
  const [target, setTarget] = useState('')
  const [assumed, setAssumed] = useState('')
  const [assumedOver, setAssumedOver] = useState('')

  /**
   * Carga los datos reales de una asignatura en el formulario.
   *
   * El «ya evaluado» solo se rellena si las notas declaran pesos. Si no los
   * declaran, `evaluatedPercent` vale 100 por convención —«lo que hay es todo
   * lo que hay»— y colarlo aquí hacía que la calculadora respondiera «ya está
   * todo evaluado» con una sola nota apuntada. `SubjectGrades` ya respeta esa
   * distinción escondiendo el porcentaje; esta pantalla no lo hacía.
   */
  const loadSubject = (id: string) => {
    setSelected(id)
    const result = results.get(id)
    const subject = subjects.find((s) => s.id === id)
    if (result?.average !== null && result?.average !== undefined) {
      setCurrent(toDecimalInput(round(result.average, 2)))
      setEvaluated(result.weightsDeclared ? toDecimalInput(round(result.evaluatedPercent, 1)) : '')
    } else {
      setCurrent('')
      setEvaluated('')
    }
    setTarget(toDecimalInput(subject?.targetGrade))
    setAssumedOver('')
  }

  /** La asignatura elegida no dice cuánto pesa cada nota. */
  const weightsUnknown = selected ? results.get(selected)?.weightsDeclared === false : false

  useEffect(() => {
    if (!open) return
    const id = subjectId ?? (subjects.length === 1 ? subjects[0].id : '')
    if (id) loadSubject(id)
    else {
      setSelected('')
      setCurrent('')
      setEvaluated('')
      setTarget('')
    }
    setAssumed('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subjectId])

  const inputs = {
    current: parseDecimal(current),
    evaluated: parseDecimal(evaluated),
    target: parseDecimal(target),
    assumed: parseDecimal(assumed),
    assumedOver: parseDecimal(assumedOver),
  }

  const ready =
    Number.isFinite(inputs.current) && Number.isFinite(inputs.evaluated) && inputs.evaluated >= 0

  const remaining = ready ? round(100 - Math.min(inputs.evaluated, 100), 2) : null

  // --- Modo «qué nota necesito» ---
  const required = useMemo(() => {
    if (!ready || !Number.isFinite(inputs.target)) return null
    return requiredGrade(inputs.current, inputs.evaluated, inputs.target, scale)
  }, [ready, inputs.current, inputs.evaluated, inputs.target, scale])

  // --- Modo «si saco X» ---
  const projection = useMemo(() => {
    if (!ready || !Number.isFinite(inputs.assumed)) return null
    const over =
      Number.isFinite(inputs.assumedOver) && inputs.assumedOver > 0
        ? inputs.assumedOver
        : (remaining ?? 0)
    if (over <= 0) return null
    return {
      over,
      result: projectAverage(inputs.current, inputs.evaluated, inputs.assumed, over),
      isPartial: over < (remaining ?? 0) - 0.01,
    }
  }, [ready, inputs.current, inputs.evaluated, inputs.assumed, inputs.assumedOver, remaining])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Calculadora de notas"
      size="md"
      footer={
        <Button variant="primary" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Segmented
          label="Tipo de cálculo"
          value={mode}
          onChange={setMode}
          className="w-full"
          options={[
            { value: 'necesito', label: '¿Qué nota necesito?' },
            { value: 'simular', label: 'Si saco un…' },
          ]}
        />

        {subjects.length > 0 && (
          <Field
            label="Partir de los datos de"
            hint="Rellena los campos con tus notas reales. Puedes cambiarlos a mano."
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={selected}
                onChange={(e) => (e.target.value ? loadSubject(e.target.value) : setSelected(''))}
              >
                <option value="">Introducir los datos a mano</option>
                {subjects.map((s) => {
                  const result = results.get(s.id)
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {result?.average !== null && result?.average !== undefined
                        ? ` — ${formatGrade(result.average, scale)}`
                        : ' — sin notas'}
                    </option>
                  )
                })}
              </Select>
            )}
          </Field>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Media actual">
            {({ id }) => (
              <NumberInput
                id={id}
                min={0}
                max={scale.max}
                step={0.1}
                placeholder="8,2"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            )}
          </Field>

          <Field
            label="Ya evaluado"
            hint={
              weightsUnknown
                ? 'Tus notas no llevan peso, así que esto no se puede deducir: escríbelo tú.'
                : remaining !== null
                  ? `Queda ${formatPercent(remaining)}.`
                  : undefined
            }
          >
            {({ id, describedBy }) => (
              <NumberInput
                id={id}
                aria-describedby={describedBy}
                min={0}
                max={100}
                step={5}
                suffix="%"
                placeholder="60"
                value={evaluated}
                onChange={(e) => setEvaluated(e.target.value)}
              />
            )}
          </Field>
        </div>

        {mode === 'necesito' ? (
          <Field label="Nota a la que aspiras">
            {({ id }) => (
              <NumberInput
                id={id}
                min={0}
                max={scale.max}
                step={0.5}
                className="max-w-[12rem]"
                placeholder="9"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            )}
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nota que sacarías">
              {({ id }) => (
                <NumberInput
                  id={id}
                  min={0}
                  max={scale.max}
                  step={0.25}
                  placeholder="8,5"
                  value={assumed}
                  onChange={(e) => setAssumed(e.target.value)}
                />
              )}
            </Field>
            <Field
              label="En una parte que vale"
              hint={
                remaining !== null
                  ? `Vacío = todo lo que queda (${formatPercent(remaining)}).`
                  : undefined
              }
            >
              {({ id, describedBy }) => (
                <NumberInput
                  id={id}
                  aria-describedby={describedBy}
                  min={0}
                  max={100}
                  step={5}
                  suffix="%"
                  placeholder={remaining !== null ? String(remaining) : '30'}
                  value={assumedOver}
                  onChange={(e) => setAssumedOver(e.target.value)}
                />
              )}
            </Field>
          </div>
        )}

        {/* --- Resultado --- */}
        {!ready ? (
          <p className="flex items-start gap-2 text-[0.8125rem] text-ink-3 bg-sunken rounded-md px-3.5 py-3">
            <Info className="size-4 shrink-0 mt-px" />
            Escribe tu media actual y qué porcentaje llevas evaluado para ver el resultado.
          </p>
        ) : mode === 'necesito' ? (
          required && <RequiredResult required={required} scale={scale} />
        ) : (
          projection && (
            <ResultBlock
              tone="neutral"
              headline={
                <Numeral
                  value={formatGrade(projection.result, scale)}
                  size="lg"
                  tone={numeralTone(projection.result, scale)}
                />
              }
              caption={
                projection.isPartial
                  ? `Media tras evaluar ese ${formatPercent(projection.over)}. Aún quedaría un ${formatPercent(round((remaining ?? 0) - projection.over, 2))} por delante.`
                  : `Nota final si sacas ${formatGrade(inputs.assumed, scale)} en todo el ${formatPercent(projection.over)} que queda.`
              }
            />
          )
        )}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------

const STATUS_STYLE: Record<
  RequiredStatus,
  { tone: 'ok' | 'warn' | 'danger' | 'neutral'; Icon: typeof CircleCheck }
> = {
  alcanzable: { tone: 'neutral', Icon: Info },
  ya_conseguido: { tone: 'ok', Icon: CircleCheck },
  imposible: { tone: 'danger', Icon: CircleX },
  sin_restante: { tone: 'warn', Icon: TriangleAlert },
}

function RequiredResult({
  required,
  scale,
}: {
  required: ReturnType<typeof requiredGrade>
  scale: { max: number; pass: number; decimals: number }
}) {
  const { tone, Icon } = STATUS_STYLE[required.status]

  return (
    <ResultBlock
      tone={tone}
      headline={
        required.status === 'alcanzable' ? (
          <Numeral
            value={formatGrade(required.needed, scale)}
            size="lg"
            // Una nota necesaria alta es una advertencia, aunque sea posible.
            tone={required.needed > scale.max * 0.9 ? 'warn' : undefined}
          />
        ) : (
          <span className="flex items-center gap-2 text-[1.0625rem] font-semibold">
            <Icon
              className={cx(
                'size-5 shrink-0',
                tone === 'ok' && 'text-ok',
                tone === 'danger' && 'text-danger',
                tone === 'warn' && 'text-warn',
              )}
            />
            {required.status === 'ya_conseguido'
              ? 'Objetivo asegurado'
              : required.status === 'imposible'
                ? 'No es alcanzable'
                : 'Ya está todo evaluado'}
          </span>
        )
      }
      caption={required.message}
    />
  )
}

function ResultBlock({
  tone,
  headline,
  caption,
}: {
  tone: 'ok' | 'warn' | 'danger' | 'neutral'
  headline: React.ReactNode
  caption: string
}) {
  return (
    <div
      className={cx(
        'rounded-lg border px-5 py-4 animate-pop',
        tone === 'ok' && 'bg-ok-quiet border-ok/25',
        tone === 'danger' && 'bg-danger-quiet border-danger/25',
        tone === 'warn' && 'bg-warn-quiet border-warn/25',
        tone === 'neutral' && 'bg-accent-quiet border-accent/20',
      )}
    >
      <div className="flex items-baseline gap-3">{headline}</div>
      <p className="text-[0.875rem] text-ink-2 mt-2 leading-relaxed text-balance">{caption}</p>
    </div>
  )
}
