import { useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react'
import { Check, Ellipsis, ListTree, Pencil, Trash2, Undo2 } from 'lucide-react'

import { relativeDay } from '@/domain/dates'
import { bucketOf, subtaskProgress } from '@/domain/tasks'
import { PRIORITIES, type Priority, type Subject, type Task } from '@/domain/types'
import { useDispatch, useToday } from '@/state/StoreProvider'
import { Checkbox } from '@/ui/fields'
import { Menu } from '@/ui/Menu'
import { exitFast, haptic, spring, useCoarsePointer } from '@/ui/motion'
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

/** Recorrido a partir del cual soltar el dedo ejecuta la acción. */
const SWIPE_COMMIT = 92

/**
 * Una tarea en una lista.
 *
 * En pantalla táctil la fila se desliza: hacia la derecha se completa, hacia
 * la izquierda se borra (con «Deshacer»). Al completar, la casilla se marca y
 * el título se tacha ANTES de que la fila se pliegue: si desapareciera en el
 * mismo instante del toque, no se vería qué ha pasado.
 *
 * Tiene que ir dentro de un `<AnimatePresence initial={false}>` para que la
 * entrada y la salida se animen (ver `TaskList`).
 */
export function TaskRow({ task, subject, onOpen, hideSubject, className }: TaskRowProps) {
  const dispatch = useDispatch()
  const today = useToday()
  const toast = useToast()
  const coarse = useCoarsePointer()
  const progress = subtaskProgress(task)

  // Marcada en pantalla pero aún no en los datos: el tiempo de ver el gesto.
  const [checking, setChecking] = useState(false)
  const done = task.status === 'completada' || checking

  // Borrar y completar ocurren al instante y se pueden deshacer unos segundos.
  const remove = () => {
    dispatch({ type: 'task/remove', id: task.id })
    toast({
      text: 'Tarea eliminada',
      action: { label: 'Deshacer', run: () => dispatch({ type: 'task/restore', task }) },
    })
  }
  const toggle = () => {
    if (task.status === 'completada') {
      dispatch({ type: 'task/toggle', id: task.id })
      return
    }
    if (checking) return
    setChecking(true)
    window.setTimeout(() => {
      dispatch({ type: 'task/toggle', id: task.id })
      setChecking(false)
      toast({
        text: 'Tarea completada',
        action: { label: 'Deshacer', run: () => dispatch({ type: 'task/toggle', id: task.id }) },
      })
    }, 420)
  }

  // --- Deslizar ---
  const x = useMotionValue(0)
  const dragged = useRef(false)
  const armed = useRef<'left' | 'right' | null>(null)
  const completeOpacity = useTransform(x, [0, 24], [0, 1])
  const deleteOpacity = useTransform(x, [-24, 0], [1, 0])
  const completeScale = useTransform(x, [0, SWIPE_COMMIT - 12, SWIPE_COMMIT], [0.6, 0.85, 1.25])
  const deleteScale = useTransform(x, [-SWIPE_COMMIT, -SWIPE_COMMIT + 12, 0], [1.25, 0.85, 0.6])

  return (
    <motion.li
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0, transition: { ...spring.smooth, bounce: 0, opacity: exitFast } }}
      transition={{ ...spring.smooth, bounce: 0 }}
      className={cx('task-row group relative overflow-hidden', className)}
    >
      {coarse && (
        <>
          <motion.div
            aria-hidden
            style={{ opacity: completeOpacity, background: 'var(--c-switch-on)' }}
            className="absolute inset-0 flex items-center pl-6 text-white"
          >
            <motion.span style={{ scale: completeScale }}>
              {task.status === 'completada' ? (
                <Undo2 className="size-6" strokeWidth={2.6} />
              ) : (
                <Check className="size-6" strokeWidth={3} />
              )}
            </motion.span>
          </motion.div>
          <motion.div
            aria-hidden
            style={{ opacity: deleteOpacity }}
            className="absolute inset-0 flex items-center justify-end pr-6 text-white bg-[#ff3b30]"
          >
            <motion.span style={{ scale: deleteScale }}>
              <Trash2 className="size-6" strokeWidth={2.4} />
            </motion.span>
          </motion.div>
        </>
      )}

      <motion.div
        style={{ x }}
        drag={coarse ? 'x' : false}
        dragDirectionLock
        dragSnapToOrigin
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.62}
        onDragStart={() => {
          dragged.current = true
          armed.current = null
        }}
        onDrag={(_, info) => {
          // Un toque háptico al cruzar el punto de no retorno, en cada sentido.
          const side =
            info.offset.x > SWIPE_COMMIT ? 'right' : info.offset.x < -SWIPE_COMMIT ? 'left' : null
          if (side !== armed.current) {
            armed.current = side
            if (side) haptic()
          }
        }}
        onDragEnd={(_, info) => {
          window.setTimeout(() => (dragged.current = false), 60)
          if (info.offset.x > SWIPE_COMMIT) toggle()
          else if (info.offset.x < -SWIPE_COMMIT) remove()
        }}
        className={cx(
          'task-body relative flex items-start gap-3 pl-4 pr-2 py-3 bg-surface touch-pan-y',
          'transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--c-ink)_3%,var(--c-surface))]',
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
        onClick={() => {
          if (!dragged.current) onOpen(task)
        }}
        className="flex-1 min-w-0 text-left rounded-xs"
      >
        <span
          className={cx(
            'block text-[1rem] leading-snug transition-colors duration-300',
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
      </motion.div>
    </motion.li>
  )
}

/**
 * Lista de tareas con entrada y salida animadas: al completar o borrar, la
 * fila se pliega y las de debajo suben, en vez de saltar.
 */
export function TaskList({
  tasks,
  subjects,
  onOpen,
  hideSubject,
  className,
}: {
  tasks: Task[]
  subjects: Map<string, Subject>
  onOpen: (task: Task) => void
  hideSubject?: boolean
  className?: string
}) {
  return (
    <ul className={className}>
      <AnimatePresence initial={false}>
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            subject={task.subjectId ? subjects.get(task.subjectId) : undefined}
            onOpen={onOpen}
            hideSubject={hideSubject}
          />
        ))}
      </AnimatePresence>
    </ul>
  )
}
