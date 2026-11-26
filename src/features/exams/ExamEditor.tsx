import { useEffect, useMemo, useState } from 'react'
import { CircleCheck, ClipboardPen, Link2Off, Trash2 } from 'lucide-react'

import { today as todayISO } from '@/domain/dates'
import { formatGrade } from '@/domain/grades'
import { parseDecimal, toDecimalInput } from '@/domain/number'
import { TERMS, type Exam, type TermId } from '@/domain/types'
import { useDispatch, useSettings, useStore } from '@/state/StoreProvider'
import { useSubjects } from '@/state/selectors'
import { GradeEditor } from '@/features/grades/GradeEditor'
import { Field, FormGroup, FormRow, Input, NumberInput, Select, Textarea } from '@/ui/fields'
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
  const { data } = useStore()
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

  const linkedGrade = useMemo(
    () => (exam?.gradeEntryId ? data.grades.find((g) => g.id === exam.gradeEntryId) : undefined),
    [data.grades, exam?.gradeEntryId],
  )

  const candidateGrades = useMemo(() => {
    if (!exam || linkedGrade) return []
    const claimed = new Set(
      data.exams.filter((e) => e.id !== exam.id && e.gradeEntryId).map((e) => e.gradeEntryId!),
    )
    return data.grades
      .filter((g) => g.subjectId === (form.subjectId || exam.subjectId) && !claimed.has(g.id))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [data.grades, data.exams, exam, linkedGrade, form.subjectId])

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

  const buildPayload = () => {
    const weight = parseDecimal(form.weight)
    return {
      subjectId: form.subjectId,
      title: form.title.trim(),
      date: form.date,
      time: form.time || undefined,
      topics: form.topics.trim() || undefined,
      weight: Number.isFinite(weight) && weight > 0 ? Math.min(100, weight) : undefined,
      term: form.term,
    }
  }

  const submit = () => {
    const next: typeof errors = {}
    if (!form.subjectId) next.subjectId = 'Elige la asignatura del examen.'
    if (!form.title.trim()) next.title = 'Ponle un nombre para reconocerlo.'
    if (!form.date) next.date = 'Necesita una fecha.'
    if (Object.keys(next).length > 0) {
      setErrors(next)
      return
    }

    const payload = buildPayload()
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
          <FormGroup>
            <FormRow label="Nombre del examen" bare required error={errors.title}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  variant="title"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  value={form.title}
                  autoFocus
                  enterKeyHint="done"
                  placeholder="Nombre, p. ej. Derivadas"
                  onChange={(e) => set('title', e.target.value)}
                />
              )}
            </FormRow>
            <FormRow label="Asignatura" required error={errors.subjectId}>
              {({ id, describedBy, invalid }) => (
                <Select
                  id={id}
                  variant="row"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  value={form.subjectId}
                  onChange={(e) => set('subjectId', e.target.value)}
                >
                  <option value="">Elegir</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormRow>
          </FormGroup>

          <FormGroup>
            <FormRow label="Fecha" required error={errors.date}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="date"
                  variant="row"
                  aria-describedby={describedBy}
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                />
              )}
            </FormRow>
            <FormRow label="Hora">
              {({ id }) => (
                <Input
                  id={id}
                  type="time"
                  variant="row"
                  value={form.time}
                  onChange={(e) => set('time', e.target.value)}
                />
              )}
            </FormRow>
            <FormRow label="Evaluación">
              {({ id }) => (
                <Select
                  id={id}
                  variant="row"
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
            </FormRow>
            <FormRow label="Peso">
              {({ id }) => (
                <NumberInput
                  id={id}
                  variant="row"
                  aria-label="Peso en la evaluación (opcional)"
                  suffix="%"
                  placeholder="Opcional"
                  value={form.weight}
                  onChange={(e) => set('weight', e.target.value)}
                />
              )}
            </FormRow>
          </FormGroup>

          <FormGroup header="Temario que entra">
            <FormRow label="Temario que entra" bare>
              {({ id }) => (
                <Textarea
                  id={id}
                  variant="row"
                  value={form.topics}
                  placeholder="Temas 3 y 4: límites, continuidad y derivadas."
                  onChange={(e) => set('topics', e.target.value)}
                />
              )}
            </FormRow>
          </FormGroup>

          {/* Puente examen → nota. Sin esto, el «Peso 30 %» de un examen era
              un número con pinta de contar que no contaba en ninguna media:
              al pasar por aquí, ese peso viaja a la nota, que sí pondera. */}
          {exam && (
            <div className="flex flex-col gap-3">
              {linkedGrade ? (
                <div className="flex items-center justify-between gap-3 text-[0.8125rem] text-ok bg-ok-quiet rounded-sm px-3 py-2.5">
                  <span className="flex items-center gap-2 min-w-0">
                    <CircleCheck className="size-4 shrink-0" />
                    <span className="truncate">
                      Enlazado con «{linkedGrade.name}» ({formatGrade(linkedGrade.score, settings.gradeScale)}).
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      dispatch({ type: 'exam/update', id: exam.id, patch: { gradeEntryId: undefined } })
                    }
                    className="shrink-0 text-ink-2"
                  >
                    <Link2Off className="size-3.5" />
                    Desenlazar
                  </Button>
                </div>
              ) : (
                <>
                  <div>
                    <Button
                      onClick={() => {
                        const payload = buildPayload()
                        if (payload.subjectId && payload.title && payload.date) {
                          dispatch({ type: 'exam/update', id: exam.id, patch: payload })
                        }
                        setGradeFrom({
                          subjectId: payload.subjectId || exam.subjectId,
                          examId: exam.id,
                          name: payload.title || exam.title,
                          date: payload.date || exam.date,
                          term: payload.term,
                          kind: 'examen',
                          weight: payload.weight,
                        })
                        onClose()
                      }}
                    >
                      <ClipboardPen className="size-4" />
                      Apuntar la nota de este examen
                    </Button>
                    <p className="text-[0.75rem] text-ink-3 mt-2 leading-relaxed">
                      Guarda los cambios del examen, crea la nota con su nombre, fecha, evaluación y
                      peso, y los deja enlazados.
                    </p>
                  </div>

                  {candidateGrades.length > 0 && (
                    <Field label="O enlazar con una nota ya apuntada">
                      {({ id }) => (
                        <Select
                          id={id}
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return
                            dispatch({
                              type: 'exam/update',
                              id: exam.id,
                              patch: { gradeEntryId: e.target.value },
                            })
                          }}
                        >
                          <option value="">Elegir nota existente…</option>
                          {candidateGrades.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name} — {formatGrade(g.score, settings.gradeScale)} ({g.date})
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  )}
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
