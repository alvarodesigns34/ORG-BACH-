import { useEffect, useState } from 'react'
import { Plus, Trash2, TriangleAlert, X } from 'lucide-react'

import { defaultCategories } from '@/data/defaults'
import { checkWeights } from '@/domain/grades'
import { newId } from '@/domain/id'
import { parseDecimal, toDecimalInput } from '@/domain/number'
import { SUBJECT_COLORS, colorVar, nextColor } from '@/domain/palette'
import type { GradeCategory, Subject, SubjectColor } from '@/domain/types'
import { useDispatch, useSettings } from '@/state/StoreProvider'
import { useSubjects } from '@/state/selectors'
import { Field, Input, NumberField, NumberInput } from '@/ui/fields'
import { ConfirmDialog, Modal } from '@/ui/Modal'
import { Button, IconButton, cx } from '@/ui/primitives'

interface SubjectEditorProps {
  open: boolean
  onClose: () => void
  subject?: Subject | null
}

export function SubjectEditor({ open, onClose, subject }: SubjectEditorProps) {
  const dispatch = useDispatch()
  const settings = useSettings()
  const existing = useSubjects()

  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [color, setColor] = useState<SubjectColor>('indigo')
  const [teacher, setTeacher] = useState('')
  const [room, setRoom] = useState('')
  const [weight, setWeight] = useState('4')
  const [target, setTarget] = useState('')
  const [categories, setCategories] = useState<GradeCategory[]>([])
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(subject?.name ?? '')
    setShortName(subject?.shortName ?? '')
    setColor(subject?.color ?? nextColor(existing.map((s) => s.color)))
    setTeacher(subject?.teacher ?? '')
    setRoom(subject?.room ?? '')
    setWeight(toDecimalInput(subject?.weight ?? 4))
    setTarget(toDecimalInput(subject?.targetGrade))
    setCategories(subject ? subject.categories.map((c) => ({ ...c })) : defaultCategories())
    setError(null)
    // `existing` cambia con cada guardado; incluirlo reiniciaría el formulario
    // en mitad de la edición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject])

  const weightCheck = checkWeights(
    categories.map((c) => c.weight),
    'Las categorías',
  )

  const submit = () => {
    if (!name.trim()) {
      setError('La asignatura necesita un nombre.')
      return
    }

    const parsedWeight = parseDecimal(weight)
    const parsedTarget = parseDecimal(target)

    const payload = {
      name: name.trim(),
      shortName: shortName.trim() || undefined,
      color,
      teacher: teacher.trim() || undefined,
      room: room.trim() || undefined,
      weight: Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : 1,
      targetGrade:
        Number.isFinite(parsedTarget) && parsedTarget > 0
          ? Math.min(parsedTarget, settings.gradeScale.max)
          : undefined,
      categories: categories.filter((c) => c.name.trim()),
    }

    if (subject) dispatch({ type: 'subject/update', id: subject.id, patch: payload })
    else dispatch({ type: 'subject/add', subject: { ...payload, schedule: [] } })
    onClose()
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={subject ? 'Editar asignatura' : 'Nueva asignatura'}
        footer={
          <>
            {subject && (
              <Button variant="danger" onClick={() => setConfirmDelete(true)} className="mr-auto">
                <Trash2 className="size-4" />
                Eliminar
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submit}>
              {subject ? 'Guardar cambios' : 'Crear asignatura'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Field label="Nombre" required error={error}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={name}
                autoFocus
                placeholder="Ej.: Matemáticas I"
                onChange={(e) => {
                  setName(e.target.value)
                  if (error) setError(null)
                }}
              />
            )}
          </Field>

          {/* --- Color --- */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.8125rem] font-medium text-ink-2">Color identificativo</span>
            <div role="radiogroup" aria-label="Color de la asignatura" className="flex flex-wrap gap-2">
              {SUBJECT_COLORS.map((option) => {
                const active = option.id === color
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={option.label}
                    title={option.label}
                    onClick={() => setColor(option.id)}
                    className={cx(
                      'size-8 rounded-full grid place-items-center transition-transform duration-150',
                      'border-2',
                      active ? 'border-ink scale-110' : 'border-transparent hover:scale-105',
                    )}
                  >
                    <span
                      className="size-5 rounded-full"
                      style={{ background: colorVar(option.id) }}
                    />
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Abreviatura" hint="Se genera sola si la dejas vacía.">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={shortName}
                  maxLength={5}
                  placeholder="MAT"
                  onChange={(e) => setShortName(e.target.value.toUpperCase())}
                />
              )}
            </Field>

            <Field label="Profesor/a">
              {({ id }) => (
                <Input id={id} value={teacher} onChange={(e) => setTeacher(e.target.value)} />
              )}
            </Field>

            <Field label="Aula">
              {({ id }) => <Input id={id} value={room} onChange={(e) => setRoom(e.target.value)} />}
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Horas semanales"
              hint="Se usa como peso si calculas la media global de forma ponderada."
            >
              {({ id, describedBy }) => (
                <NumberInput
                  id={id}
                  aria-describedby={describedBy}
                  min={1}
                  max={12}
                  step={1}
                  suffix="h"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              )}
            </Field>

            <Field label="Nota objetivo" hint="Opcional. Sirve para avisarte si te alejas de ella.">
              {({ id, describedBy }) => (
                <NumberInput
                  id={id}
                  aria-describedby={describedBy}
                  min={0}
                  max={settings.gradeScale.max}
                  step={0.5}
                  placeholder={String(settings.gradeScale.max)}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              )}
            </Field>
          </div>

          {/* --- Reparto de pesos --- */}
          <div className="flex flex-col gap-2.5">
            <div>
              <span className="text-[0.8125rem] font-medium text-ink-2">Cómo se evalúa</span>
              <p className="text-[0.75rem] text-ink-3 mt-0.5">
                Cada asignatura puede repartir la nota a su manera. Déjalo vacío si tus notas ya
                llevan su peso individual.
              </p>
            </div>

            {categories.length > 0 && (
              <ul className="flex flex-col rounded-sm border border-hairline overflow-hidden">
                {categories.map((category) => (
                  <li
                    key={category.id}
                    className="flex items-center gap-2 px-2.5 py-2 bg-raised border-b border-hairline last:border-b-0"
                  >
                    <input
                      value={category.name}
                      aria-label="Nombre de la categoría"
                      placeholder="Exámenes"
                      onChange={(e) =>
                        setCategories((prev) =>
                          prev.map((c) =>
                            c.id === category.id ? { ...c, name: e.target.value } : c,
                          ),
                        )
                      }
                      className="flex-1 min-w-0 bg-transparent text-[0.875rem] outline-none focus:underline decoration-accent underline-offset-4"
                    />
                    <NumberField
                      inputSize="sm"
                      containerClassName="w-24 shrink-0"
                      min={0}
                      max={100}
                      suffix="%"
                      value={category.weight}
                      fallback={0}
                      aria-label={`Peso de ${category.name || 'la categoría'}`}
                      onCommit={(weight) =>
                        setCategories((prev) =>
                          prev.map((c) => (c.id === category.id ? { ...c, weight } : c)),
                        )
                      }
                    />
                    <IconButton
                      label={`Quitar ${category.name || 'categoría'}`}
                      size="sm"
                      onClick={() =>
                        setCategories((prev) => prev.filter((c) => c.id !== category.id))
                      }
                    >
                      <X className="size-3.5" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Button
                size="sm"
                onClick={() =>
                  setCategories((prev) => [...prev, { id: newId('cat'), name: '', weight: 0 }])
                }
              >
                <Plus className="size-3.5" />
                Añadir categoría
              </Button>

              {categories.length > 0 && (
                <span
                  className={cx(
                    'inline-flex items-center gap-1.5 text-[0.75rem] font-medium tabular-nums',
                    weightCheck.status === 'ok' ? 'text-ok' : 'text-warn',
                  )}
                >
                  {weightCheck.status !== 'ok' && <TriangleAlert className="size-3.5" />}
                  Suman {weightCheck.sum} %
                </span>
              )}
            </div>

            {weightCheck.message && categories.length > 0 && (
              <p className="text-[0.75rem] text-warn bg-warn-quiet rounded-sm px-3 py-2">
                {weightCheck.message} Puedes guardarlo así, pero la media se calculará repartiendo
                proporcionalmente lo que haya.
              </p>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (subject) dispatch({ type: 'subject/remove', id: subject.id })
          setConfirmDelete(false)
          onClose()
        }}
        title="Eliminar asignatura"
        message={`Se borrarán «${subject?.name}», sus notas y sus exámenes. Las tareas se conservarán, pero se quedarán sin asignatura. No se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
      />
    </>
  )
}
