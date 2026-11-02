import { Clock, Ellipsis, ListTree, Pencil, Trash2 } from 'lucide-react'

import { formatDuration, relativeDay } from '@/domain/dates'
import { bucketOf, subtaskProgress } from '@/domain/tasks'
import { PRIORITIES, type Priority, type Subject, type Task } from '@/domain/types'
import { useDispatch, useToday } from '@/state/StoreProvider'
import { Checkbox } from '@/ui/fields'
import { Menu } from '@/ui/Menu'
import { PriorityMark, PRIORITY_LABEL, SubjectTag, cx } from '@/ui/primitives'
import { useToast } from '@/ui/Toast'

interface TaskRowProps {
  task: Task
  subject?: Subject
  onOpen: (task: Task) => void
  /** Oculta la etiqueta de asignatura cuando la lista ya está agrupada por ella. */
  hideSubject?: boolean
  className?: string
}

/** Tono del plazo. El texto ya dice «Ayer» o «En 3 días»: el color solo refuerza. */
function dueTone(task: Task, today: string): string {
  switch (bucketOf(task, today)) {
    case 'atrasada':
      return 'text-danger font-semibold'
    case 'hoy':
      return 'text-warn font-semibold'
    case 'manana':
      return 'text-ink-2 font-medium'
    default:
      return 'text-ink-3'
  }
}

export function TaskRow({ task, subject, onOpen, hideSubject, className }: TaskRowProps) {
  const dispatch = useDispatch()
  const today = useToday()
  const done = task.status === 'completada'
  const progress = subtaskProgress(task)
  const toast = useToast()

  // Borrar y completar ocurren al instante y se pueden deshacer unos segundos.
  const remove = () => {
    dispatch({ type: 'task/remove', id: task.id })
    toast({
      text: 'Tarea eliminada',
      action: { label: 'Deshacer', run: () => dispatch({ type: 'task/restore', task }) },
    })
  }
  const toggle = () => {
    dispatch({ type: 'task/toggle', id: task.id })
    if (!done) {
      toast({
        text: 'Tarea completada',
        action: { label: 'Deshacer', run: () => dispatch({ type: 'task/toggle', id: task.id }) },
      })
    }
  }

  return (
    <li
      className={cx(
        // Separador interior entre filas (ver .task-row en index.css).
        'task-row group flex items-start gap-3 pl-4 pr-2 py-3',
        'transition-colors duration-150 hover:bg-fill/50',
        className,
      )}
    >
      <div className="pt-0.5 shrink-0">
        <Checkbox
          checked={done}
          onChange={toggle}
          label={done ? `Marcar «${task.title}» como pendiente` : `Completar «${task.title}»`}
          hideLabel
        />
      </div>

      {/* Solo el bloque de texto abre el detalle: la casilla y el menú quedan
          fuera para no anidar controles dentro de un botón. */}
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="flex-1 min-w-0 text-left rounded-xs"
      >
        <span
          className={cx(
            'block text-[0.9375rem] leading-snug transition-colors duration-150',
            done ? 'text-ink-3 line-through decoration-ink-3/50' : 'text-ink',
          )}
        >
          {task.title}
        </span>

        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-[0.75rem]">
          {!hideSubject && <SubjectTag subject={subject} />}

          {task.dueDate && (
            <span className={cx('tabular-nums', done ? 'text-ink-3' : dueTone(task, today))}>
              {relativeDay(task.dueDate, today)}
              {task.dueTime && ` · ${task.dueTime}`}
            </span>
          )}

          {progress.total > 0 && (
            <span className="inline-flex items-center gap-1 text-ink-3 tabular-nums">
              <ListTree className="size-3" strokeWidth={2} />
              {progress.done}/{progress.total}
            </span>
          )}

          {task.estimatedMinutes ? (
            <span className="inline-flex items-center gap-1 text-ink-3 tabular-nums">
              <Clock className="size-3" strokeWidth={2} />
              {formatDuration(task.estimatedMinutes)}
            </span>
          ) : null}

          {task.status === 'en_progreso' && (
            <span className="text-accent font-semibold">En progreso</span>
          )}
        </span>

        {/* Barra de subtareas: el porcentaje se ve sin abrir la tarea. */}
        {progress.total > 0 && !done && (
          <span className="block mt-2 h-[3px] w-full max-w-56 rounded-full bg-sunken overflow-hidden">
            <span
              className="block h-full rounded-full bg-accent/70 transition-[width] duration-300 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </span>
        )}
      </button>

      <div className="flex items-center gap-1 shrink-0 pt-0.5">
        {!done && <PriorityMark priority={task.priority} />}

        <Menu
          label={`Acciones de ${task.title}`}
          items={[
            {
              id: 'abrir',
              label: 'Abrir detalles',
              icon: <Pencil className="size-3.5" />,
              onSelect: () => onOpen(task),
            },
            ...PRIORITIES.map((p, index) => ({
              id: `pri-${p.id}`,
              label: `Prioridad: ${PRIORITY_LABEL[p.id as Priority]}`,
              selected: task.priority === p.id,
              separated: index === 0,
              onSelect: () =>
                dispatch({ type: 'task/update', id: task.id, patch: { priority: p.id } }),
            })),
            {
              id: 'progreso',
              label: task.status === 'en_progreso' ? 'Marcar como pendiente' : 'Marcar en progreso',
              separated: true,
              onSelect: () =>
                dispatch({
                  type: 'task/update',
                  id: task.id,
                  patch: { status: task.status === 'en_progreso' ? 'pendiente' : 'en_progreso' },
                }),
            },
            {
              id: 'borrar',
              label: 'Eliminar tarea',
              icon: <Trash2 className="size-3.5" />,
              destructive: true,
              separated: true,
              onSelect: remove,
            },
          ]}
          trigger={({ onClick, ref, ...aria }) => (
            <button
              ref={ref}
              type="button"
              onClick={onClick}
              aria-label={`Acciones de ${task.title}`}
              aria-haspopup="menu"
              {...aria}
              className={cx(
                'size-8 grid place-items-center rounded-sm text-ink-3 shrink-0',
                'transition-[background-color,color,opacity] duration-150',
                'hover:bg-sunken hover:text-ink',
                // Visible siempre en táctil; en escritorio aparece al acercarse.
                'opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100',
                'aria-expanded:opacity-100 aria-expanded:bg-sunken',
              )}
            >
              <Ellipsis className="size-4" />
            </button>
          )}
        />
      </div>
    </li>
  )
}
