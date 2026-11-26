import { useEffect, useMemo, useState } from 'react'
import { Trash2, TriangleAlert } from 'lucide-react'

import { today as todayISO } from '@/domain/dates'
import { formatPercent, round } from '@/domain/grades'
import { parseDecimal, toDecimalInput } from '@/domain/number'
import { GRADE_KINDS, TERMS, type GradeEntry, type GradeKind, type TermId } from '@/domain/types'
import { useDispatch, useSettings, useStore } from '@/state/StoreProvider'
import { useSubjects } from '@/state/selectors'
import { FormGroup, FormRow, Input, NumberInput, Select, Textarea } from '@/ui/fields'
import { ConfirmDialog, Modal } from '@/ui/Modal'
import { Button } from '@/ui/primitives'

interface GradeEditorProps {
  open: boolean
  onClose: () => void
  grade?: GradeEntry | null
  defaults?: {
    subjectId?: string
    categoryId?: string | null
    term?: TermId
    name?: string
    date?: string
    kind?: GradeKind
    /** Peso de partida, en %. Lo trae el examen del que sale la nota. */
    weight?: number
    /** Examen del que sale esta nota; al guardar queda enlazado. */
    examId?: string
  }
}

interface FormState {
  subjectId: string
  categoryId: string
  term: TermId
  name: string
  kind: GradeKind
  score: string
  maxScore: string
  weight: string
  date: string
  comment: string
}

export function GradeEditor({ open, onClose, grade, defaults }: GradeEditorProps) {
  const dispatch = useDispatch()
  const settings = useSettings()
  const { data } = useStore()
  const subjects = useSubjects()

  const [form, setForm] = useState<FormState>(() =>
    blank(settings.gradeScale.max, settings.activeTerm),
  )
  const [errors, setErrors] = useState<Partial<Record<'subjectId' | 'name' | 'score', string>>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)

  function blank(max: number, term: TermId): FormState {
    return {
      subjectId: '',
      categoryId: '',
      term,
      name: '',
      kind: 'examen',
      score: '',
      maxScore: toDecimalInput(max),
      weight: '',
      date: todayISO(),
      comment: '',
    }
  }

  // `defaults` llega casi siempre como objeto literal en la llamada
  // (`defaults={{ date: … }}`), así que cambia de identidad en CADA render del
  // proveedor. Si entrara en las dependencias tal cual, cualquier tic del
  // estado —o el cambio de día a medianoche— reiniciaría el formulario y
  // borraría lo que se estuviera escribiendo. Se compara su CONTENIDO.
  const defaultsKey = JSON.stringify(defaults ?? null)

  useEffect(() => {
    if (!open) return
    if (grade) {
      setForm({
        subjectId: grade.subjectId,
        categoryId: grade.categoryId ?? '',
        term: grade.term,
        name: grade.name,
        kind: grade.kind,
        score: toDecimalInput(grade.score),
        maxScore: toDecimalInput(grade.maxScore),
        weight: grade.weight ? toDecimalInput(grade.weight) : '',
        date: grade.date,
        comment: grade.comment ?? '',
      })
    } else {
      const base = blank(settings.gradeScale.max, defaults?.term ?? settings.activeTerm)
      setForm({
        ...base,
        subjectId: defaults?.subjectId ?? (subjects.length === 1 ? subjects[0].id : ''),
        categoryId: defaults?.categoryId ?? '',
        name: defaults?.name ?? '',
        kind: defaults?.kind ?? 'examen',
        date: defaults?.date ?? base.date,
        weight: defaults?.weight !== undefined ? toDecimalInput(defaults.weight) : base.weight,
      })
    }
    setErrors({})
    // `subjects` se recalcula en cada render del proveedor; incluirlo reiniciaría
    // el formulario mientras se escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, grade, defaultsKey, settings.gradeScale.max, settings.activeTerm])

  const subject = subjects.find((s) => s.id === form.subjectId)
  const categories = subject?.categories ?? []

  // Al cambiar de asignatura, la categoría elegida puede no existir en la nueva.
  useEffect(() => {
    if (form.categoryId && !categories.some((c) => c.id === form.categoryId)) {
      setForm((prev) => ({ ...prev, categoryId: '' }))
    }
  }, [form.categoryId, categories])

  /**
   * Cuánto peso queda libre en la categoría elegida. Es el dato que evita
   * pasarse del 100 % sin darse cuenta al ir apuntando notas una a una.
   */
  const remainingWeight = useMemo(() => {
    if (!form.subjectId) return null
    const siblings = data.grades.filter(
      (g) =>
        g.id !== grade?.id &&
        g.subjectId === form.subjectId &&
        g.term === form.term &&
        (g.categoryId ?? '') === form.categoryId,
    )
    const used = siblings.reduce((sum, g) => sum + (g.weight || 0), 0)
    const categoriesUsed =
      !form.categoryId && categories.length > 0
        ? categories.reduce((sum, c) => sum + c.weight, 0)
        : 0
    return round(Math.max(0, 100 - categoriesUsed) - used, 2)
  }, [data.grades, form.subjectId, form.term, form.categoryId, grade?.id, categories])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const parsed = {
    score: parseDecimal(form.score),
    maxScore: parseDecimal(form.maxScore),
    weight: parseDecimal(form.weight),
  }

  // Vista previa: qué nota es esto sobre la escala de la aplicación.
  const normalized =
    Number.isFinite(parsed.score) && Number.isFinite(parsed.maxScore) && parsed.maxScore > 0
      ? round((parsed.score / parsed.maxScore) * settings.gradeScale.max, 2)
      : null

  const overWeight =
    Number.isFinite(parsed.weight) && remainingWeight !== null && parsed.weight > remainingWeight

  const submit = () => {
    const next: typeof errors = {}
    if (!form.subjectId) next.subjectId = 'Elige la asignatura.'
    if (!form.name.trim()) next.name = 'Ponle un nombre para reconocerla.'
    if (!Number.isFinite(parsed.score)) next.score = 'Escribe la nota que has sacado.'
    else if (parsed.score < 0) next.score = 'La nota no puede ser negativa.'
    else if (Number.isFinite(parsed.maxScore) && parsed.score > parsed.maxScore)
      next.score = `No puede superar el máximo (${form.maxScore}).`

    if (Object.keys(next).length > 0) {
      setErrors(next)
      return
    }

    const payload = {
      subjectId: form.subjectId,
      categoryId: form.categoryId || null,
      term: form.term,
      name: form.name.trim(),
      kind: form.kind,
      score: parsed.score,
      maxScore:
        Number.isFinite(parsed.maxScore) && parsed.maxScore > 0
          ? parsed.maxScore
          : settings.gradeScale.max,
      weight: Number.isFinite(parsed.weight) && parsed.weight > 0 ? parsed.weight : 0,
      date: form.date || todayISO(),
      comment: form.comment.trim() || undefined,
    }

    if (grade) {
      dispatch({ type: 'grade/update', id: grade.id, patch: payload })
    } else {
      // `linkExamId` deja el examen marcado como ya calificado. El enlace lo
      // resuelve el reductor, que es quien genera el identificador de la nota.
      dispatch({ type: 'grade/add', grade: payload, linkExamId: defaults?.examId })
    }
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
          Una nota pertenece siempre a una asignatura. Crea al menos una para empezar a registrar
          calificaciones.
        </p>
      </Modal>
    )
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={grade ? 'Editar nota' : 'Añadir nota'}
        footer={
          <>
            {grade && (
              <Button variant="danger" onClick={() => setConfirmDelete(true)} className="mr-auto">
                <Trash2 className="size-4" />
                Eliminar
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submit}>
              {grade ? 'Guardar cambios' : 'Añadir nota'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <FormGroup>
            <FormRow label="Nombre" bare required error={errors.name}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  variant="title"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  value={form.name}
                  autoFocus
                  placeholder="Nombre, p. ej. Examen tema 4"
                  enterKeyHint="done"
                  onChange={(e) => set('name', e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())}
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
            <FormRow label="Tipo">
              {({ id }) => (
                <Select
                  id={id}
                  variant="row"
                  value={form.kind}
                  onChange={(e) => set('kind', e.target.value as GradeKind)}
                >
                  {GRADE_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              )}
            </FormRow>
          </FormGroup>

          {/* --- Nota --- */}
          <FormGroup
            footer={
              (normalized !== null && parsed.maxScore !== settings.gradeScale.max) || overWeight ? (
                <div className="flex flex-col gap-1.5">
                  {normalized !== null && parsed.maxScore !== settings.gradeScale.max && (
                    <p>
                      {form.score.replace('.', ',')} sobre {form.maxScore} equivale a{' '}
                      <strong className="text-ink tabular-nums">
                        {normalized.toLocaleString('es-ES', {
                          minimumFractionDigits: settings.gradeScale.decimals,
                          maximumFractionDigits: settings.gradeScale.decimals,
                        })}
                      </strong>{' '}
                      sobre {settings.gradeScale.max}.
                    </p>
                  )}
                  {overWeight && (
                    <p className="flex items-start gap-1.5 text-warn">
                      <TriangleAlert className="size-3.5 shrink-0 mt-px" />
                      <span>
                        Con este peso, las notas de esta categoría suman más del 100 %. Puedes
                        guardarlo igual: la media se repartirá proporcionalmente.
                      </span>
                    </p>
                  )}
                </div>
              ) : undefined
            }
          >
            <FormRow label="Nota" required error={errors.score}>
              {({ id, describedBy, invalid }) => (
                <NumberInput
                  id={id}
                  variant="row"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  className="text-ink! font-semibold"
                  placeholder="Obligatoria"
                  value={form.score}
                  onChange={(e) => set('score', e.target.value)}
                />
              )}
            </FormRow>
            <FormRow label="Sobre">
              {({ id }) => (
                <NumberInput
                  id={id}
                  variant="row"
                  aria-label="Puntuación máxima del examen (10, 20, 100…)"
                  value={form.maxScore}
                  onChange={(e) => set('maxScore', e.target.value)}
                />
              )}
            </FormRow>
            <FormRow
              label="Peso"
              // Dejarlo vacío no es «no cuenta»: la nota se reparte el hueco
              // libre. Decirlo aquí evita que el alumno crea que ha guardado
              // un peso y luego no entienda de dónde sale la media.
              hint={
                remainingWeight !== null && remainingWeight > 0
                  ? `Vacío = se lleva el ${formatPercent(remainingWeight)} libre.`
                  : remainingWeight !== null
                    ? 'Ya está todo repartido: si lo dejas vacío, esta nota no contará.'
                    : undefined
              }
            >
              {({ id, describedBy }) => (
                <NumberInput
                  id={id}
                  variant="row"
                  aria-describedby={describedBy}
                  suffix="%"
                  placeholder={remainingWeight ? toDecimalInput(remainingWeight) : 'Automático'}
                  value={form.weight}
                  onChange={(e) => set('weight', e.target.value)}
                />
              )}
            </FormRow>
          </FormGroup>

          <FormGroup>
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
            {categories.length > 0 && (
              <FormRow label="Categoría">
                {({ id }) => (
                  <Select
                    id={id}
                    variant="row"
                    value={form.categoryId}
                    onChange={(e) => set('categoryId', e.target.value)}
                  >
                    <option value="">Ninguna</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {formatPercent(c.weight)}
                      </option>
                    ))}
                  </Select>
                )}
              </FormRow>
            )}
            <FormRow label="Fecha">
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  variant="row"
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                />
              )}
            </FormRow>
          </FormGroup>

          <FormGroup>
            <FormRow label="Comentario" bare>
              {({ id }) => (
                <Textarea
                  id={id}
                  variant="row"
                  rows={2}
                  value={form.comment}
                  placeholder="Comentario: qué falló, qué repasar…"
                  onChange={(e) => set('comment', e.target.value)}
                />
              )}
            </FormRow>
          </FormGroup>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (grade) dispatch({ type: 'grade/remove', id: grade.id })
          setConfirmDelete(false)
          onClose()
        }}
        title="Eliminar nota"
        message={`«${grade?.name}» se borrará y la media se recalculará sin ella. No se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
      />
    </>
  )
}
