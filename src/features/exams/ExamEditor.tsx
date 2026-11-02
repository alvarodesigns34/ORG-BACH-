import { useEffect, useState } from 'react'
import { CircleCheck, ClipboardPen, Trash2 } from 'lucide-react'

import { today as todayISO } from '@/domain/dates'
import { parseDecimal, toDecimalInput } from '@/domain/number'
import { TERMS, type Exam, type TermId } from '@/domain/types'
import { useDispatch, useSettings } from '@/state/StoreProvider'
import { useSubjects } from '@/state/selectors'
import { GradeEditor } from '@/features/grades/GradeEditor'
import { Field, Input, NumberInput, Select, Textarea } from '@/ui/fields'
import { ConfirmDialog, Modal } from '@/ui/Modal'
import { Button } from '@/ui/primitives'

interface ExamEditorProps {
  open: boolean
  onClose: () => void
  exam?: Exam | null
  defaults?: { date?: string; subjectId?: string }
}

interface FormState {
  subjectId: string
  title: string
  date: string
  time: string
  topics: string
  weight: string
  term: TermId
}

export function ExamEditor({ open, onClose, exam, defaults }: ExamEditorProps) {
  const dispatch = useDispatch()
  const subjects = useSubjects()
  const settings = useSettings()

  const [form, setForm] = useState<FormState>(() => toForm(exam, defaults, settings.activeTerm))
  const [errors, setErrors] = useState<{ subjectId?: string; title?: string; date?: string }>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  /**
   * Valores de partida de la nota que sale de este examen.
   *
   * Se guardan en estado en lugar de leerlos del examen al pintar porque al
   * abrir el editor de notas se cierra el del examen, y entonces `exam` ya es
   * null. Además, al ser un objeto estable, no reinicia el formulario de
   * notas en cada render.
   */
  const [gradeFrom, setGradeFrom] = useState<{
    subjectId: string
    examId: string
    name: string
    date: string
    term: TermId
    kind: 'examen'
    weight?: number
  } | null>(null)

  // `defaults` llega casi siempre como objeto literal en la llamada
  // (`defaults={{ date: … }}`), así que cambia de identidad en CADA render del
  // proveedor. Si entrara en las dependencias tal cual, cualquier tic del
  // estado —o el cambio de día a medianoche— reiniciaría el formulario y
  // borraría lo que se estuviera escribiendo. Se compara su CONTENIDO.
  const defaultsKey = JSON.stringify(defaults ?? null)

  useEffect(() => {
    if (open) {
      setForm(toForm(exam, defaults, settings.activeTerm))
      setErrors({})
    }
  }, [open, exam, defaultsKey, settings.activeTerm])

  function toForm(
    source: Exam | null | undefined,
    presets: ExamEditorProps['defaults'],
    activeTerm: TermId,
  ): FormState {
    return {
      subjectId: source?.subjectId ?? presets?.subjectId ?? '',
      title: source?.title ?? '',
      date: source?.date ?? presets?.date ?? todayISO(),
      time: source?.time ?? '',
      topics: source?.topics ?? '',
      weight: source?.weight ? toDecimalInput(source.weight) : '',
      term: source?.term ?? activeTerm,
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const submit = () => {
    const next: typeof errors = {}
    if (!form.subjectId) next.subjectId = 'Elige la asignatura del examen.'
    if (!form.title.trim()) next.title = 'Ponle un nombre para reconocerlo.'
    if (!form.date) next.date = 'Necesita una fecha.'
    if (Object.keys(next).length > 0) {
      setErrors(next)
      return
    }

    const weight = parseDecimal(form.weight)
    const payload = {
      subjectId: form.subjectId,
      title: form.title.trim(),
      date: form.date,
      time: form.time || undefined,
      topics: form.topics.trim() || undefined,
      weight: Number.isFinite(weight) && weight > 0 ? weight : undefined,
      term: form.term,
    }

    if (exam) dispatch({ type: 'exam/update', id: exam.id, patch: payload })
    else dispatch({ type: 'exam/add', exam: payload })
    onClose()
  }

  if (subjects.length === 0) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Primero, una asignatura"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onClose()
                window.location.hash = '/asignaturas'
              }}
            >
              Ir a Asignaturas
            </Button>
          </>
        }
      >
        <p className="text-[0.875rem] text-ink-2 leading-relaxed">
          Un examen pertenece siempre a una asignatura. Crea al menos una y podrás apuntar sus
          exámenes, sus notas y su horario.
        </p>
      </Modal>
    )
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={exam ? 'Editar examen' : 'Apuntar examen'}
        footer={
          <>
            {exam && (
              <Button variant="danger" onClick={() => setConfirmDelete(true)} className="mr-auto">
                <Trash2 className="size-4" />
                Eliminar
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submit}>
              {exam ? 'Guardar cambios' : 'Apuntar examen'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Asignatura" required error={errors.subjectId}>
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={form.subjectId}
                  onChange={(e) => set('subjectId', e.target.value)}
                >
                  <option value="">Elige una…</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Evaluación">
              {({ id }) => (
                <Select
                  id={id}
                  value={form.term}
                  onChange={(e) => set('term', e.target.value as TermId)}
                >
                  {TERMS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <Field label="Nombre del examen" required error={errors.title}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={form.title}
                autoFocus
                placeholder="Ej.: Derivadas"
                onChange={(e) => set('title', e.target.value)}
              />
            )}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Fecha" required error={errors.date}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="date"
                  aria-describedby={describedBy}
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                />
              )}
            </Field>

            <Field label="Hora">
              {({ id }) => (
                <Input
                  id={id}
                  type="time"
                  value={form.time}
                  onChange={(e) => set('time', e.target.value)}
                />
              )}
            </Field>

            <Field label="Peso en la evaluación" hint="Opcional.">
              {({ id, describedBy }) => (
                <NumberInput
                  id={id}
                  aria-describedby={describedBy}
                  min={0}
                  max={100}
                  step={5}
                  suffix="%"
                  placeholder="30"
                  value={form.weight}
                  onChange={(e) => set('weight', e.target.value)}
                />
              )}
            </Field>
          </div>

          <Field label="Temario que entra">
            {({ id }) => (
              <Textarea
                id={id}
                value={form.topics}
                placeholder="Temas 3 y 4: límites, continuidad y derivadas."
                onChange={(e) => set('topics', e.target.value)}
              />
            )}
          </Field>

          {/* Puente examen → nota. Sin esto, el «Peso 30 %» de un examen era
              un número con pinta de contar que no contaba en ninguna media:
              al pasar por aquí, ese peso viaja a la nota, que sí pondera. */}
          {exam && (
            <div className="pt-4 border-t border-hairline">
              {exam.gradeEntryId ? (
                <p className="flex items-start gap-2 text-[0.8125rem] text-ok bg-ok-quiet rounded-sm px-3 py-2">
                  <CircleCheck className="size-4 shrink-0 mt-px" />
                  <span>Este examen ya tiene su nota apuntada.</span>
                </p>
              ) : (
                <>
                  <Button
                    onClick={() => {
                      setGradeFrom({
                        subjectId: form.subjectId,
                        examId: exam.id,
                        name: form.title.trim() || exam.title,
                        date: form.date,
                        term: form.term,
                        kind: 'examen',
                        weight: (() => {
                          const w = parseDecimal(form.weight)
                          return Number.isFinite(w) && w > 0 ? w : undefined
                        })(),
                      })
                      onClose()
                    }}
                  >
                    <ClipboardPen className="size-4" />
                    Apuntar la nota de este examen
                  </Button>
                  <p className="text-[0.75rem] text-ink-3 mt-2 leading-relaxed">
                    Crea la nota con el nombre, la fecha, la evaluación y el peso de este examen ya
                    puestos, y los deja enlazados.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </Modal>

      <GradeEditor
        open={!!gradeFrom}
        defaults={gradeFrom ?? undefined}
        onClose={() => setGradeFrom(null)}
      />

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (exam) dispatch({ type: 'exam/remove', id: exam.id })
          setConfirmDelete(false)
          onClose()
        }}
        title="Eliminar examen"
        message={`«${exam?.title}» se borrará del calendario. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
      />
    </>
  )
}
