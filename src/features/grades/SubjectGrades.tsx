import { useState } from 'react'
import { Calculator, ChevronRight, Ellipsis, Pencil, Plus, TriangleAlert } from 'lucide-react'

import { formatShort } from '@/domain/dates'
import { formatGrade, formatPercent, numeralTone, type SubjectResult } from '@/domain/grades'
import { colorVar } from '@/domain/palette'
import { GRADE_KINDS, type GradeEntry, type GradeScale, type Subject } from '@/domain/types'
import { useDispatch } from '@/state/StoreProvider'
import { Menu } from '@/ui/Menu'
import { ConfirmDialog } from '@/ui/Modal'
import { Button, EmptyState, Numeral, Progress, cx } from '@/ui/primitives'

const KIND_LABEL = Object.fromEntries(GRADE_KINDS.map((k) => [k.id, k.label])) as Record<
  string,
  string
>

interface SubjectGradesProps {
  subject: Subject
  result: SubjectResult
  scale: GradeScale
  onAddGrade: (categoryId: string | null) => void
  onEditGrade: (grade: GradeEntry) => void
  onCalculate: () => void
  /**
   * Permite plegar el desglose. En el listado de Notas conviene, porque cinco
   * asignaturas desplegadas hacen una página que no se puede recorrer de un
   * vistazo; en la ficha de una sola asignatura, no: ahí el detalle es el tema.
   */
  collapsible?: boolean
  /**
   * Oculta el nombre y la media. Se usa en la ficha de la asignatura, donde el
   * título de la página y la tira de cifras ya dicen exactamente lo mismo:
   * repetirlo tres veces no informa más, solo alarga la pantalla.
   */
  hideHeader?: boolean
}

/**
 * Desglose de las notas de una asignatura.
 *
 * Muestra el camino completo desde cada nota suelta hasta la media, para que
 * el número de arriba no sea una caja negra: se ve qué categoría aporta qué y
 * cuánto queda por evaluar.
 */
export function SubjectGrades({
  subject,
  result,
  scale,
  onAddGrade,
  onEditGrade,
  onCalculate,
  collapsible,
  hideHeader,
}: SubjectGradesProps) {
  const dispatch = useDispatch()
  const accent = colorVar(subject.color)
  const hasGrades = result.entryCount > 0

  // Plegadas por defecto: la cabecera ya lleva media, progreso y objetivo, que
  // es lo que se consulta el 90 % de las veces.
  const [pendingDelete, setPendingDelete] = useState<GradeEntry | null>(null)
  const [open, setOpen] = useState(!collapsible)
  const expanded = !collapsible || open

  const HeaderTag = collapsible ? 'button' : 'div'

  return (
    <div>
      {/* --- Cabecera con la media --- */}
      {!hideHeader && (
      <HeaderTag
        {...(collapsible
          ? {
              type: 'button' as const,
              onClick: () => setOpen((v) => !v),
              'aria-expanded': open,
              className:
                'w-full text-left flex items-start justify-between gap-4 px-5 sm:px-6 py-5 hover:bg-sunken/35 transition-colors duration-150',
            }
          : {
              className:
                'flex items-start justify-between gap-4 px-5 sm:px-6 py-5',
            })}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {collapsible && (
              <ChevronRight
                aria-hidden
                className={cx(
                  'size-4 text-ink-3 shrink-0 transition-transform duration-200',
                  open && 'rotate-90',
                )}
              />
            )}
            <span aria-hidden className="size-2.5 rounded-full shrink-0" style={{ background: accent }} />
            <h3 className="text-[1rem] font-semibold tracking-[-0.01em] truncate">{subject.name}</h3>
          </div>

          <p className="text-[0.75rem] text-ink-3 mt-1.5 tabular-nums">
            {hasGrades ? (
              <>
                {result.entryCount} {result.entryCount === 1 ? 'nota' : 'notas'}
                {result.weightsDeclared && ` · ${formatPercent(result.evaluatedPercent)} evaluado`}
                {subject.targetGrade !== undefined &&
                  ` · objetivo ${formatGrade(subject.targetGrade, scale)}`}
              </>
            ) : (
              'Sin notas todavía'
            )}
          </p>
        </div>

        <div className="shrink-0">
          <div className="text-right">
            <Numeral
              value={formatGrade(result.average, scale)}
              size="md"
              tone={numeralTone(result.average, scale)}
            />
            {subject.targetGrade !== undefined && result.average !== null && (
              <p
                className={cx(
                  'text-[0.6875rem] mt-1 tabular-nums',
                  result.average >= subject.targetGrade ? 'text-ok' : 'text-warn',
                )}
              >
                {result.average >= subject.targetGrade
                  ? 'objetivo cumplido'
                  : `${formatGrade(subject.targetGrade - result.average, scale)} por debajo`}
              </p>
            )}
          </div>
        </div>
      </HeaderTag>
      )}

      {/* --- Cuánto se ha evaluado --- */}
      {hasGrades && result.weightsDeclared && !hideHeader && (
        <div className="px-5 sm:px-6 pb-5">
          <Progress
            value={result.evaluatedPercent}
            label={`${formatPercent(result.evaluatedPercent)} de la asignatura evaluado`}
            tone="accent"
          />
          <p className="text-[0.6875rem] text-ink-3 mt-1.5 tabular-nums">
            Queda un {formatPercent(100 - result.evaluatedPercent)} por evaluar.
          </p>
        </div>
      )}

      {/* --- Avisos de pesos: se ven siempre, aunque esté plegado --- */}
      {result.warnings.length > 0 && (
        <div className="px-5 sm:px-6 pb-4 flex flex-col gap-2">
          {result.warnings.map((warning, i) => (
            <p
              key={i}
              className="flex items-start gap-2 text-[0.75rem] text-warn bg-warn-quiet rounded-sm px-3 py-2"
            >
              <TriangleAlert className="size-3.5 shrink-0 mt-px" />
              <span>{warning.message}</span>
            </p>
          ))}
        </div>
      )}

      {/* --- Categorías --- */}
      {!expanded ? null : !hasGrades ? (
        <EmptyState
          compact
          title="Aún no hay notas"
          description="En cuanto apuntes la primera verás aquí la media y cuánto llevas evaluado."
          action={
            <Button size="sm" variant="secondary" onClick={() => onAddGrade(null)}>
              <Plus className="size-3.5" />
              Añadir nota
            </Button>
          }
        />
      ) : (
        <div className="border-t border-hairline">
          {result.categories.map((category) => {
            const empty = category.entries.length === 0
            return (
              <section
                key={category.categoryId ?? 'sin-categoria'}
                className="border-b border-hairline last:border-b-0"
              >
                <header className="flex items-center justify-between gap-3 px-5 sm:px-6 py-2.5 bg-sunken/40">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="eyebrow truncate">{category.name}</span>
                    {subject.categories.length > 0 && (
                      <span className="text-[0.6875rem] text-ink-3 tabular-nums shrink-0">
                        {formatPercent(category.weight)} de la nota
                      </span>
                    )}
                  </div>

                  <span className="flex items-center gap-2 shrink-0">
                    {empty ? (
                      <span className="text-[0.6875rem] text-ink-3">no cuenta todavía</span>
                    ) : (
                      <span
                        className={cx(
                          'text-[0.8125rem] font-semibold tabular-nums',
                          numeralTone(category.average, scale) === 'danger' && 'text-danger',
                          numeralTone(category.average, scale) === 'warn' && 'text-warn',
                          numeralTone(category.average, scale) === 'ok' && 'text-ok',
                        )}
                      >
                        {formatGrade(category.average, scale)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onAddGrade(category.categoryId)}
                      aria-label={`Añadir nota a ${category.name}`}
                      className="size-6 grid place-items-center rounded-xs text-ink-3 hover:bg-surface hover:text-ink transition-colors duration-150"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </span>
                </header>

                {!empty && (
                  <ul>
                    {[...category.entries]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((entry) => (
                        <li
                          key={entry.id}
                          className="group flex items-center gap-3 pl-5 sm:pl-6 pr-2 py-2.5 border-t border-hairline first:border-t-0 hover:bg-sunken/35 transition-colors duration-150"
                        >
                          <button
                            type="button"
                            onClick={() => onEditGrade(entry)}
                            className="flex-1 min-w-0 text-left rounded-xs"
                          >
                            <span className="block text-[0.875rem] text-ink truncate">
                              {entry.name}
                            </span>
                            <span className="block text-[0.6875rem] text-ink-3 mt-0.5 tabular-nums">
                              {KIND_LABEL[entry.kind] ?? 'Otro'} · {formatShort(entry.date)}
                              {entry.weight > 0 && ` · peso ${formatPercent(entry.weight)}`}
                            </span>
                          </button>

                          <span className="shrink-0 text-right tabular-nums">
                            <span
                              className={cx(
                                'text-[0.9375rem] font-semibold',
                                numeralTone((entry.score / entry.maxScore) * scale.max, scale) ===
                                  'danger' && 'text-danger',
                                numeralTone((entry.score / entry.maxScore) * scale.max, scale) ===
                                  'ok' && 'text-ok',
                              )}
                            >
                              {entry.score.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[0.75rem] text-ink-3">
                              /{entry.maxScore.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
                            </span>
                          </span>

                          <Menu
                            label={`Acciones de ${entry.name}`}
                            items={[
                              {
                                id: 'editar',
                                label: 'Editar nota',
                                icon: <Pencil className="size-3.5" />,
                                onSelect: () => onEditGrade(entry),
                              },
                              {
                                id: 'borrar',
                                label: 'Eliminar nota',
                                destructive: true,
                                separated: true,
                                onSelect: () => setPendingDelete(entry),
                              },
                            ]}
                            trigger={({ onClick, ref, ...aria }) => (
                              <button
                                ref={ref}
                                type="button"
                                onClick={onClick}
                                aria-haspopup="menu"
                                aria-label={`Acciones de ${entry.name}`}
                                {...aria}
                                className={cx(
                                  'size-7 grid place-items-center rounded-sm text-ink-3 shrink-0',
                                  'hover:bg-sunken hover:text-ink transition-colors duration-150',
                                  'opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100',
                                  'aria-expanded:opacity-100 aria-expanded:bg-sunken',
                                )}
                              >
                                <Ellipsis className="size-3.5" />
                              </button>
                            )}
                          />

                          {entry.comment && (
                            <span className="sr-only">Comentario: {entry.comment}</span>
                          )}
                        </li>
                      ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* --- Acciones --- */}
      {expanded && (
      <footer className="flex flex-wrap gap-2 px-5 sm:px-6 py-4 border-t border-hairline">
        <Button size="sm" onClick={() => onAddGrade(null)}>
          <Plus className="size-3.5" />
          Añadir nota
        </Button>
        <Button size="sm" variant="ghost" onClick={onCalculate}>
          <Calculator className="size-3.5" />
          ¿Qué nota necesito?
        </Button>
      </footer>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) dispatch({ type: 'grade/remove', id: pendingDelete.id })
          setPendingDelete(null)
        }}
        title="Eliminar nota"
        message={`«${pendingDelete?.name}» se borrará y la media se recalculará sin ella. No se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
      />
    </div>
  )
}
