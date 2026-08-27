import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'

import {
  KIND_LABEL,
  SCOPES_BY_KIND,
  SCOPE_LABEL,
  suggestTitle,
} from '@/domain/goals'
import { parseDecimal, parseDecimalOr, toDecimalInput } from '@/domain/number'
import { TERMS, type Goal, type GoalKind, type GoalScope, type TermId } from '@/domain/types'
import { useDispatch, useSettings } from '@/state/StoreProvider'
import { useSubjects } from '@/state/selectors'
import { Field, Input, NumberInput, Select } from '@/ui/fields'
import { ConfirmDialog, Modal } from '@/ui/Modal'
import { Button } from '@/ui/primitives'

interface GoalEditorProps {
  open: boolean
  onClose: () => void
  goal?: Goal | null
}

/** Unidad y ayuda de cada tipo, para que el campo «meta» no sea ambiguo. */
const TARGET_HINT: Record<GoalKind, { suffix: string; hint: string; step: number }> = {
  media: { suffix: '', hint: 'La nota media que quieres alcanzar.', step: 0.5 },
  horas_estudio: { suffix: 'h', hint: 'Horas de estudio en el periodo elegido.', step: 1 },
  tareas: { suffix: '', hint: 'Número de tareas completadas en el periodo.', step: 1 },
  manual: { suffix: '', hint: 'La cifra a la que quieres llegar.', step: 1 },
}

export function GoalEditor({ open, onClose, goal }: GoalEditorProps) {
  const dispatch = useDispatch()
  const settings = useSettings()
  const subjects = useSubjects()

  const [kind, setKind] = useState<GoalKind>('media')
  const [scope, setScope] = useState<GoalScope>('trimestral')
  /** '' = la evaluación que esté activa en Ajustes. */
  const [term, setTerm] = useState<'' | TermId>('')
  const [target, setTarget] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [title, setTitle] = useState('')
  const [progress, setProgress] = useState('')
  const [touchedTitle, setTouchedTitle] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setKind(goal?.kind ?? 'media')
    setScope(goal?.scope ?? 'trimestral')
    setTerm(goal?.term ?? '')
    setTarget(goal ? toDecimalInput(goal.target) : '')
    setSubjectId(goal?.subjectId ?? '')
    setTitle(goal?.title ?? '')
    setProgress(toDecimalInput(goal?.manualProgress))
    setTouchedTitle(!!goal)
    setError(null)
  }, [open, goal])

  // Al cambiar de tipo, el alcance anterior puede dejar de tener sentido:
  // una media no se mide «hoy».
  const allowedScopes = SCOPES_BY_KIND[kind]
  useEffect(() => {
    if (!allowedScopes.includes(scope)) setScope(allowedScopes[0])
  }, [allowedScopes, scope])

  // El título se propone solo mientras el alumno no lo haya tocado.
  const parsedTarget = parseDecimal(target)
  useEffect(() => {
    if (touchedTitle || kind === 'manual' || !Number.isFinite(parsedTarget)) return
    const subject = subjects.find((s) => s.id === subjectId)
    setTitle(suggestTitle(kind, scope, parsedTarget, subject))
  }, [kind, scope, parsedTarget, subjectId, subjects, touchedTitle])

  const submit = () => {
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      setError('Escribe la cifra a la que quieres llegar.')
      return
    }
    if (!title.trim()) {
      setError('El objetivo necesita un nombre.')
      return
    }

    const payload = {
      title: title.trim(),
      kind,
      scope,
      target: parsedTarget,
      subjectId: subjectId || undefined,
      // Solo tiene sentido en un objetivo de media por evaluación.
      term: kind === 'media' && scope === 'trimestral' && term ? term : undefined,
      manualProgress: kind === 'manual' ? parseDecimalOr(progress, 0) : undefined,
    }

    if (goal) dispatch({ type: 'goal/update', id: goal.id, patch: payload })
    else dispatch({ type: 'goal/add', goal: payload })
    onClose()
  }

  const spec = TARGET_HINT[kind]

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={goal ? 'Editar objetivo' : 'Nuevo objetivo'}
        description={
          goal ? undefined : 'El progreso se calcula solo a partir de tus notas, tareas y sesiones.'
        }
        footer={
          <>
            {goal && (
              <Button variant="danger" onClick={() => setConfirmDelete(true)} className="mr-auto">
                <Trash2 className="size-4" />
                Eliminar
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submit}>
              {goal ? 'Guardar cambios' : 'Crear objetivo'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Qué quieres conseguir">
              {({ id }) => (
                <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as GoalKind)}>
                  {(Object.keys(KIND_LABEL) as GoalKind[]).map((option) => (
                    <option key={option} value={option}>
                      {KIND_LABEL[option]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Periodo">
              {({ id }) => (
                <Select
                  id={id}
                  value={scope}
                  onChange={(e) => setScope(e.target.value as GoalScope)}
                >
                  {allowedScopes.map((option) => (
                    <option key={option} value={option}>
                      {SCOPE_LABEL[option]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          {/* Fijar la evaluación es opcional, pero cambia mucho: sin fijarla,
              el objetivo mide la que esté activa en Ajustes y se mueve con
              ella. Con ella fijada, sigue midiendo la misma en marzo. */}
          {kind === 'media' && scope === 'trimestral' && (
            <Field
              label="Evaluación que mide"
              hint={
                term
                  ? 'Seguirá midiendo esta evaluación aunque cambies la activa.'
                  : 'Se moverá contigo: mide siempre la evaluación activa en Ajustes.'
              }
            >
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  className="max-w-[20rem]"
                  value={term}
                  onChange={(e) => setTerm(e.target.value as '' | TermId)}
                >
                  <option value="">La evaluación activa</option>
                  {TERMS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Meta" required hint={spec.hint}>
              {({ id, describedBy }) => (
                <NumberInput
                  id={id}
                  aria-describedby={describedBy}
                  min={0}
                  suffix={spec.suffix || undefined}
                  placeholder={kind === 'media' ? '9' : '8'}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              )}
            </Field>

            {kind !== 'manual' && (
              <Field
                label="Asignatura"
                hint={subjectId ? undefined : 'Vacío = todas las asignaturas.'}
              >
                {({ id, describedBy }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                  >
                    <option value="">Todas</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}

            {kind === 'manual' && (
              <Field label="Progreso actual" hint="Este tipo lo actualizas tú a mano.">
                {({ id, describedBy }) => (
                  <NumberInput
                    id={id}
                    aria-describedby={describedBy}
                    min={0}
                    value={progress}
                    onChange={(e) => setProgress(e.target.value)}
                  />
                )}
              </Field>
            )}
          </div>

          <Field label="Nombre" required error={error}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={title}
                placeholder="Ej.: Subir la media de Matemáticas a 9"
                onChange={(e) => {
                  setTitle(e.target.value)
                  setTouchedTitle(true)
                  if (error) setError(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())}
              />
            )}
          </Field>

          {kind === 'media' && (
            <p className="text-[0.75rem] text-ink-3 bg-sunken rounded-sm px-3 py-2 text-balance">
              Se compara con tu media {subjectId ? 'en esa asignatura' : 'global'} de{' '}
              {scope === 'anual' ? 'todo el curso' : 'la evaluación activa'}, calculada con la
              escala sobre {settings.gradeScale.max}.
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (goal) dispatch({ type: 'goal/remove', id: goal.id })
          setConfirmDelete(false)
          onClose()
        }}
        title="Eliminar objetivo"
        message={`«${goal?.title}» se borrará. No afecta a tus notas ni a tus sesiones.`}
        confirmLabel="Eliminar"
        destructive
      />
    </>
  )
}
