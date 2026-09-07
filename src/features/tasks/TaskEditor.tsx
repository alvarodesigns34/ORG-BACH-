import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'

import { newId } from '@/domain/id'
import { parseDecimalOr } from '@/domain/number'
import { PRIORITIES, TASK_STATUSES, type Priority, type Subtask, type Task, type TaskStatus } from '@/domain/types'
import { useDispatch } from '@/state/StoreProvider'
import { useSubjects } from '@/state/selectors'
import { Checkbox, Field, Input, NumberInput, Select, Textarea } from '@/ui/fields'
import { ConfirmDialog, Modal } from '@/ui/Modal'
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
  const subjects = useSubjects()
  const [form, setForm] = useState<FormState>(() => toForm(task, defaults))
  const [error, setError] = useState<string | null>(null)
  const [newSubtask, setNewSubtask] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

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
      estimatedMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : undefined,
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
                onClick={() => setConfirmDelete(true)}
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
          <Field label="Título" required error={error}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={form.title}
                autoFocus
                placeholder="Ej.: Ejercicios de derivadas, tema 4"
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
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Asignatura">
              {({ id }) => (
                <Select
                  id={id}
                  value={form.subjectId}
                  onChange={(e) => set('subjectId', e.target.value)}
                >
                  <option value="">Sin asignatura</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Prioridad">
              {({ id }) => (
                <Select
                  id={id}
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
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Fecha límite" className="sm:col-span-1">
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => set('dueDate', e.target.value)}
                />
              )}
            </Field>

            <Field label="Hora" hint={form.dueDate ? undefined : 'Necesita una fecha.'}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="time"
                  aria-describedby={describedBy}
                  value={form.dueTime}
                  disabled={!form.dueDate}
                  onChange={(e) => set('dueTime', e.target.value)}
                />
              )}
            </Field>

            <Field label="Tiempo estimado">
              {({ id }) => (
                <NumberInput
                  id={id}
                  min={0}
                  step={5}
                  suffix="min"
                  placeholder="45"
                  value={form.estimatedMinutes}
                  onChange={(e) => set('estimatedMinutes', e.target.value)}
                />
              )}
            </Field>
          </div>

          {task && (
            <Field label="Estado">
              {({ id }) => (
                <Select
                  id={id}
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
            </Field>
          )}

          {/* --- Subtareas --- */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[0.8125rem] font-medium text-ink-2">Subtareas</span>
              {progress && (
                <span className="text-[0.75rem] text-ink-3 tabular-nums">
                  {progress.done}/{progress.total} completadas — {progress.percent} %
                </span>
              )}
            </div>

            {progress && <Progress value={progress.percent} label="Progreso de subtareas" />}

            {form.subtasks.length > 0 && (
              <ul className="flex flex-col rounded-sm border border-hairline overflow-hidden">
                {form.subtasks.map((subtask) => (
                  <li
                    key={subtask.id}
                    className="flex items-center gap-2.5 px-2.5 py-2 border-b border-hairline last:border-b-0 bg-raised"
                  >
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
                        'flex-1 min-w-0 bg-transparent text-[1rem] outline-none',
                        'focus:underline decoration-accent underline-offset-4',
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
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              <Input
                value={newSubtask}
                placeholder="Añadir subtarea y pulsar Intro"
                aria-label="Nueva subtarea"
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addSubtask()
                  }
                }}
              />
              <Button onClick={addSubtask} disabled={!newSubtask.trim()} aria-label="Añadir subtarea">
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          <Field label="Notas">
            {({ id }) => (
              <Textarea
                id={id}
                value={form.description}
                placeholder="Detalles, páginas, enunciados, lo que sea."
                onChange={(e) => set('description', e.target.value)}
              />
            )}
          </Field>

          <Field label="Etiquetas" hint="Separadas por comas.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={form.tags}
                placeholder="repaso, entrega, grupo"
                onChange={(e) => set('tags', e.target.value)}
              />
            )}
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (task) dispatch({ type: 'task/remove', id: task.id })
          setConfirmDelete(false)
          onClose()
        }}
        title="Eliminar tarea"
        message={`«${task?.title}» se borrará definitivamente. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
      />
    </>
  )
}
