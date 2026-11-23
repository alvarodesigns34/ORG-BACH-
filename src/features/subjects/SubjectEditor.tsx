import { useEffect, useState } from 'react'
import { Archive, ArchiveRestore, Plus, Trash2, TriangleAlert, X } from 'lucide-react'

import { checkWeights } from '@/domain/grades'
import { newId } from '@/domain/id'
import { parseDecimal, toDecimalInput } from '@/domain/number'
import { SUBJECT_COLORS, colorVar, nextColor } from '@/domain/palette'
import type { GradeCategory, ScheduleSlot, Subject, SubjectColor } from '@/domain/types'
import { useDispatch, useSettings } from '@/state/StoreProvider'
import { useSubjects } from '@/state/selectors'
import { Field, Input, NumberField, NumberInput } from '@/ui/fields'
import { ConfirmDialog, Modal } from '@/ui/Modal'
import { Button, IconButton, cx } from '@/ui/primitives'
import { useToast } from '@/ui/Toast'

const SCHEDULE_DAYS: { value: ScheduleSlot['day']; label: string }[] = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
]

interface SubjectEditorProps {
  open: boolean
  onClose: () => void
  subject?: Subject | null
}

export function SubjectEditor({ open, onClose, subject }: SubjectEditorProps) {
  const dispatch = useDispatch()
  const settings = useSettings()
  const existing = useSubjects()
  const toast = useToast()

  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [color, setColor] = useState<SubjectColor>('indigo')
  const [teacher, setTeacher] = useState('')
  const [room, setRoom] = useState('')
  const [weight, setWeight] = useState('4')
  const [target, setTarget] = useState('')
  const [categories, setCategories] = useState<GradeCategory[]>([])
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([])
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
    // Una asignatura nueva empieza SIN categorías: cada nota pondera
    // directamente sobre el 100 % de la asignatura hasta que el alumno decida
    // repartirla él mismo en «Cómo se evalúa». Antes se rellenaba con un
    // reparto de ejemplo (Exámenes 70 / Trabajos 20 / Actitud 10) que nadie
    // había pedido, y una nota con peso propio (25 %, por ejemplo) se
    // calculaba sobre ese reparto ajeno en vez de sobre el total.
    setCategories(subject ? subject.categories.map((c) => ({ ...c })) : [])
    setSchedule(subject ? subject.schedule.map((slot) => ({ ...slot })) : [])
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
      // Una franja que acaba antes de empezar no se puede colocar en el día.
      schedule: schedule.filter((slot) => slot.start && slot.end && slot.end > slot.start),
    }

    if (subject) dispatch({ type: 'subject/update', id: subject.id, patch: payload })
    else dispatch({ type: 'subject/add', subject: payload })
    onClose()
  }

  /**
   * Archivar saca la asignatura de las vistas activas (horario, medias,
   * sugerencias) pero conserva sus notas, exámenes y tareas. Se recupera
   * desde Asignaturas › Archivadas o con «Deshacer».
   */
  const toggleArchived = () => {
    if (!subject) return
    const archived = !subject.archived
    dispatch({ type: 'subject/update', id: subject.id, patch: { archived } })
    onClose()
    toast({
      text: archived ? `«${subject.name}» archivada` : `«${subject.name}» recuperada`,
      action: {
        label: 'Deshacer',
        run: () => dispatch({ type: 'subject/update', id: subject.id, patch: { archived: !archived } }),
      },
    })
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={subject ? 'Editar asignatura' : 'Nueva asignatura'}
        footer={
          <>
            {/* Archivar es lo reversible y va a mano; borrar del todo queda
                al final del formulario, lejos del pulgar. */}
            {subject && (
              <Button variant="secondary" onClick={toggleArchived} className="mr-auto">
                {subject.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                {subject.archived ? 'Recuperar' : 'Archivar'}
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
            <div
              role="radiogroup"
              aria-label="Color de la asignatura"
              className="flex flex-wrap gap-2"
            >
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

          {/* --- Horario --- */}
          <div className="flex flex-col gap-2.5">
            <div>
              <span className="text-[0.8125rem] font-medium text-ink-2">Horario</span>
              <p className="text-[0.75rem] text-ink-3 mt-0.5">
                Cuándo tienes clase. Con esto, Inicio te dice qué toca ahora y qué viene después.
              </p>
            </div>

            {schedule.length > 0 && (
              <ul className="flex flex-col rounded-[14px] bg-fill overflow-hidden">
                {schedule.map((slot, index) => {
                  const patch = (change: Partial<ScheduleSlot>) =>
                    setSchedule((prev) =>
                      prev.map((item) => (item.id === slot.id ? { ...item, ...change } : item)),
                    )
                  return (
                    <li
                      key={slot.id}
                      className={cx(
                        'flex items-center gap-1.5 pl-3 pr-1.5 py-1.5',
                        index > 0 && 'border-t border-hairline',
                      )}
                    >
                      <select
                        aria-label="Día"
                        value={slot.day}
                        onChange={(e) => patch({ day: Number(e.target.value) as ScheduleSlot['day'] })}
                        className="flex-1 min-w-0 h-9 bg-transparent text-[1rem] text-ink font-sans rounded-[6px] focus-visible:outline-2 focus-visible:outline-accent cursor-pointer"
                      >
                        {SCHEDULE_DAYS.map((day) => (
                          <option key={day.value} value={day.value}>
                            {day.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="time"
                        aria-label="Empieza"
                        value={slot.start}
                        onChange={(e) => patch({ start: e.target.value })}
                        className="h-9 w-[5.25rem] shrink-0 rounded-[9px] bg-raised px-2 text-[0.9375rem] tabular-nums text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      />
                      <span aria-hidden className="text-ink-3">
                        –
                      </span>
                      <input
                        type="time"
                        aria-label="Termina"
                        value={slot.end}
                        aria-invalid={!!slot.end && !!slot.start && slot.end <= slot.start}
                        onChange={(e) => patch({ end: e.target.value })}
                        className="h-9 w-[5.25rem] shrink-0 rounded-[9px] bg-raised px-2 text-[0.9375rem] tabular-nums text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/40 aria-[invalid=true]:text-danger"
                      />
                      <IconButton
                        label="Quitar franja"
                        size="sm"
                        onClick={() => setSchedule((prev) => prev.filter((i) => i.id !== slot.id))}
                      >
                        <X className="size-3.5" />
                      </IconButton>
                    </li>
                  )
                })}
              </ul>
            )}

            <div>
              <Button
                size="sm"
                onClick={() =>
                  setSchedule((prev) => {
                    // La nueva franja propone el día siguiente a la última y
                    // su misma hora: lo normal es repetir hora otro día.
                    const last = prev[prev.length - 1]
                    const day = last ? (((last.day % 5) + 1) as ScheduleSlot['day']) : 1
                    return [
                      ...prev,
                      {
                        id: newId('slot'),
                        day,
                        start: last?.start ?? '08:30',
                        end: last?.end ?? '09:25',
                      },
                    ]
                  })
                }
              >
                <Plus className="size-3.5" />
                Añadir clase
              </Button>
            </div>
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
                      className="flex-1 min-w-0 bg-transparent text-[1rem] outline-none focus:underline decoration-accent underline-offset-4"
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

          {subject && (
            <div className="border-t border-hairline pt-4">
              <p className="text-[0.8125rem] text-ink-3 leading-snug mb-2">
                ¿Ya no la tienes? Mejor archívala: deja de aparecer, pero conservas sus notas y exámenes.
              </p>
              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-3.5" />
                Eliminar definitivamente
              </Button>
            </div>
          )}
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
        title="¿Eliminar para siempre?"
        message={`Se borrarán «${subject?.name}», todas sus notas y todos sus exámenes, también en tus otros dispositivos. Las tareas se conservarán sin asignatura. No se puede deshacer. Si solo quieres quitarla de en medio, usa «Archivar».`}
        confirmLabel="Eliminar para siempre"
        destructive
      />
    </>
  )
}
