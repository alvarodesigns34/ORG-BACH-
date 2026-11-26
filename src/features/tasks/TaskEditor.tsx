import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'

import { addDays, parseDay } from '@/domain/dates'
import { newId } from '@/domain/id'
import { parseDecimalOr } from '@/domain/number'
import {
  PRIORITIES,
  TASK_STATUSES,
  type Priority,
  type Subtask,
  type Task,
  type TaskStatus,
} from '@/domain/types'
import { useDispatch, useToday } from '@/state/StoreProvider'
import { useSubjects } from '@/state/selectors'
import { Checkbox, FormGroup, FormRow, Input, Select, Textarea } from '@/ui/fields'
import { Modal } from '@/ui/Modal'
import { useToast } from '@/ui/Toast'
import { Button, IconButton, PRIORITY_LABEL, Progress, cx } from '@/ui/primitives'

interface TaskEditorProps {
  open: boolean
  onClose: () => void
  /** Tarea a editar; ausente = creación. */
  task?: Task | null
  /** Valores de partida al crear desde una fecha o una asignatura concretas. */
  defaults?: { dueDate?: string; subjectId?: string }
}

interface FormState {
  title: string
  description: string
  subjectId: string
  dueDate: string
  dueTime: string
  priority: Priority
  status: TaskStatus
  estimatedMinutes: string
  tags: string
  subtasks: Subtask[]
}

function toForm(task: Task | null | undefined, defaults?: TaskEditorProps['defaults']): FormState {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    subjectId: task?.subjectId ?? defaults?.subjectId ?? '',
    dueDate: task?.dueDate ?? defaults?.dueDate ?? '',
    dueTime: task?.dueTime ?? '',
    priority: task?.priority ?? 'media',
    status: task?.status ?? 'pendiente',
    estimatedMinutes: task?.estimatedMinutes ? String(task.estimatedMinutes) : '',
    tags: task?.tags.join(', ') ?? '',
    subtasks: task?.subtasks ? task.subtasks.map((s) => ({ ...s })) : [],
  }
}

export function TaskEditor({ open, onClose, task, defaults }: TaskEditorProps) {
  const dispatch = useDispatch()
  const today = useToday()
  const subjects = useSubjects()
  const [form, setForm] = useState<FormState>(() => toForm(task, defaults))
  const [error, setError] = useState<string | null>(null)
  const [newSubtask, setNewSubtask] = useState('')
  const toast = useToast()

  // Al abrir con otra tarea (o al pasar de editar a crear) el formulario se
  // rehace: reutilizar el estado anterior mostraría datos de la tarea previa.
  // `defaults` llega casi siempre como objeto literal en la llamada
  // (`defaults={{ date: … }}`), así que cambia de identidad en CADA render del
  // proveedor. Si entrara en las dependencias tal cual, cualquier tic del
  // estado —o el cambio de día a medianoche— reiniciaría el formulario y
  // borraría lo que se estuviera escribiendo. Se compara su CONTENIDO.
  const defaultsKey = JSON.stringify(defaults ?? null)

  useEffect(() => {
    if (open) {
      setForm(toForm(task, defaults))
      setError(null)
      setNewSubtask('')
    }
  }, [open, task, defaultsKey])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const progress = useMemo(() => {
    const total = form.subtasks.length
    if (total === 0) return null
    const done = form.subtasks.filter((s) => s.done).length
    return { done, total, percent: Math.round((done / total) * 100) }
  }, [form.subtasks])

  const nextMonday = useMemo(() => {
    const dow = parseDay(today).getDay()
    const delta = (8 - dow) % 7 || 7
    return addDays(today, delta)
  }, [today])

  const addSubtask = () => {
    const title = newSubtask.trim()
    if (!title) return
    set('subtasks', [...form.subtasks, { id: newId('st'), title, done: false }])
    setNewSubtask('')
  }

  const submit = () => {
    const title = form.title.trim()
    if (!title) {
      setError('La tarea necesita un título.')
      return
    }

    const minutes = Math.round(parseDecimalOr(form.estimatedMinutes, 0))
    const payload = {
      title,
      description: form.description.trim() || undefined,
      subjectId: form.subjectId || undefined,
      dueDate: form.dueDate || undefined,
      dueTime: form.dueDate && form.dueTime ? form.dueTime : undefined,
      priority: form.priority,
      status: form.status,
      estimatedMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(1440, minutes) : undefined,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      subtasks: form.subtasks,
    }

    if (task) {
      dispatch({ type: 'task/update', id: task.id, patch: payload })
    } else {
      dispatch({ type: 'task/add', task: payload })
    }
    onClose()
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={task ? 'Editar tarea' : 'Nueva tarea'}
        description={task ? undefined : 'Con el título basta. El resto puedes rellenarlo luego.'}
        footer={
          <>
            {task && (
              <Button
                variant="danger"
                onClick={() => {
                  if (!task) return
                  dispatch({ type: 'task/remove', id: task.id })
                  onClose()
                  toast({
                    text: 'Tarea eliminada',
                    action: {
                      label: 'Deshacer',
                      run: () => dispatch({ type: 'task/restore', task }),
                    },
                  })
                }}
                className="mr-auto"
              >
                <Trash2 className="size-4" />
                Eliminar
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submit}>
              {task ? 'Guardar cambios' : 'Crear tarea'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <FormGroup>
            <FormRow label="Título" bare required error={error}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  variant="title"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  value={form.title}
                  autoFocus
                  enterKeyHint="done"
                  placeholder="Título, p. ej. Ejercicios tema 4"
                  onChange={(e) => {
                    set('title', e.target.value)
                    if (error) setError(null)
                  }}
                  // Enter guarda directamente: crear una tarea no debería
                  // obligar a mover la mano hasta el botón.
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      submit()
                    }
                  }}
                />
              )}
            </FormRow>
            <FormRow label="Notas" bare>
              {({ id }) => (
                <Textarea
                  id={id}
                  variant="row"
                  rows={2}
                  className="min-h-[3.5rem] pt-2.5"
                  value={form.description}
                  placeholder="Notas"
                  onChange={(e) => set('description', e.target.value)}
                />
              )}
            </FormRow>
          </FormGroup>

          <FormGroup>
            <FormRow label="Fecha">
              {({ id }) =>
                form.dueDate ? (
                  <Input
                    id={id}
                    type="date"
                    variant="row"
                    value={form.dueDate}
                    onChange={(e) => set('dueDate', e.target.value)}
                  />
                ) : (
                  <span id={id} className="text-[1rem] text-ink-3">Sin fecha</span>
                )
              }
            </FormRow>
            <div className="form-row flex flex-wrap items-center gap-1.5 px-4 py-2.5">
              {(
                [
                  { label: 'Hoy', value: today },
                  { label: 'Mañana', value: addDays(today, 1) },
                  { label: 'Próx. lunes', value: nextMonday },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={form.dueDate === preset.value}
                  onClick={() => set('dueDate', preset.value)}
                  className={cx(
                      'pressable px-3 h-8 rounded-full text-[0.8125rem] font-medium transition-colors',
                      form.dueDate === preset.value
                        ? 'bg-accent-fill text-white'
                        : 'bg-fill text-ink-2 hover:text-ink',
                    )}
                >
                  {preset.label}
                </button>
              ))}
              {form.dueDate && (
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, dueDate: '', dueTime: '' }))}
                  className="pressable px-3 h-8 rounded-full text-[0.8125rem] text-ink-3 hover:text-ink"
                >
                  Quitar fecha
                </button>
              )}
            </div>
            {form.dueDate && (
              <FormRow label="Hora">
                {({ id }) => (
                  <Input
                    id={id}
                    type="time"
                    variant="row"
                    value={form.dueTime}
                    onChange={(e) => set('dueTime', e.target.value)}
                  />
                )}
              </FormRow>
            )}
          </FormGroup>

          <FormGroup>
            <FormRow label="Asignatura">
              {({ id }) => (
                <Select
                  id={id}
                  variant="row"
                  value={form.subjectId}
                  onChange={(e) => set('subjectId', e.target.value)}
                >
                  <option value="">Ninguna</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormRow>
            <FormRow label="Prioridad">
              {({ id }) => (
                <Select
                  id={id}
                  variant="row"
                  value={form.priority}
                  onChange={(e) => set('priority', e.target.value as Priority)}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {PRIORITY_LABEL[p.id]}
                    </option>
                  ))}
                </Select>
              )}
            </FormRow>
            {task && (
              <FormRow label="Estado">
                {({ id }) => (
                  <Select
                    id={id}
                    variant="row"
                    value={form.status}
                    onChange={(e) => set('status', e.target.value as TaskStatus)}
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                )}
              </FormRow>
            )}
            <FormRow label="Duración">
              {({ id }) => (
                <div className="flex items-center gap-1 justify-end">
                  <input
                    id={id}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="—"
                    aria-label="Duración estimada en minutos"
                    value={form.estimatedMinutes}
                    onChange={(e) => set('estimatedMinutes', e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                    className="w-16 bg-transparent border-0 text-right text-[1rem] text-ink-2 h-11 tabular-nums placeholder:text-ink-3 focus:outline-none focus:text-ink"
                  />
                  <span className="text-[1rem] text-ink-3">min</span>
                </div>
              )}
            </FormRow>
            <div className="form-row flex flex-wrap items-center gap-1.5 px-4 py-2.5">
              {[15, 30, 45, 60, 120].map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={form.estimatedMinutes === String(m)}
                  onClick={() => set('estimatedMinutes', String(m))}
                  className={cx(
                      'pressable px-3 h-8 rounded-full text-[0.8125rem] font-medium transition-colors',
                      form.estimatedMinutes === String(m)
                        ? 'bg-accent-fill text-white'
                        : 'bg-fill text-ink-2 hover:text-ink',
                    )}
                >
                  {m === 60 ? '1 h' : m === 120 ? '2 h' : `${m}′`}
                </button>
              ))}
            </div>
          </FormGroup>

          {/* --- Subtareas --- */}
          <FormGroup
            header={
              <span className="flex items-baseline justify-between gap-3">
                <span>Subtareas</span>
                {progress && (
                  <span className="tabular-nums">
                    {progress.done} de {progress.total}
                  </span>
                )}
              </span>
            }
          >
            {progress && (
              <div className="form-row px-4 pt-3 pb-2.5">
                <Progress value={progress.percent} label="Progreso de subtareas" />
              </div>
            )}
            {form.subtasks.map((subtask) => (
              <div key={subtask.id} className="form-row flex items-center gap-3 pl-4 pr-2 min-h-11">
                <Checkbox
                  size="sm"
                  checked={subtask.done}
                  label={`Completar ${subtask.title}`}
                  hideLabel
                  onChange={(done) =>
                    set(
                      'subtasks',
                      form.subtasks.map((s) => (s.id === subtask.id ? { ...s, done } : s)),
                    )
                  }
                />
                <input
                  value={subtask.title}
                  aria-label="Título de la subtarea"
                  onChange={(e) =>
                    set(
                      'subtasks',
                      form.subtasks.map((s) =>
                        s.id === subtask.id ? { ...s, title: e.target.value } : s,
                      ),
                    )
                  }
                  className={cx(
                    'flex-1 min-w-0 h-11 bg-transparent text-[1rem] focus:outline-none',
                    subtask.done && 'line-through text-ink-3',
                  )}
                />
                <IconButton
                  label={`Quitar subtarea ${subtask.title}`}
                  size="sm"
                  onClick={() =>
                    set(
                      'subtasks',
                      form.subtasks.filter((s) => s.id !== subtask.id),
                    )
                  }
                >
                  <X className="size-3.5" />
                </IconButton>
              </div>
            ))}
            <div className="form-row flex items-center gap-3 pl-4 pr-2 min-h-11">
              <button
                type="button"
                onClick={addSubtask}
                disabled={!newSubtask.trim()}
                aria-label="Añadir subtarea"
                className="grid place-items-center size-[20px] rounded-full bg-accent-fill text-white disabled:bg-fill disabled:text-ink-3 transition-colors"
              >
                <Plus className="size-3.5" strokeWidth={2.6} />
              </button>
              <input
                value={newSubtask}
                placeholder="Añadir subtarea"
                aria-label="Nueva subtarea"
                enterKeyHint="enter"
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addSubtask()
                  }
                }}
                className="flex-1 min-w-0 h-11 bg-transparent text-[1rem] placeholder:text-ink-3 focus:outline-none"
              />
            </div>
          </FormGroup>

          <FormGroup footer="Separadas por comas.">
            <FormRow label="Etiquetas">
              {({ id }) => (
                <Input
                  id={id}
                  variant="row"
                  value={form.tags}
                  placeholder="repaso, entrega"
                  onChange={(e) => set('tags', e.target.value)}
                />
              )}
            </FormRow>
          </FormGroup>
        </div>
      </Modal>
    </>
  )
}
