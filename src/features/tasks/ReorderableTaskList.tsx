import { useRef, useState } from 'react'
import { AnimatePresence, Reorder, useDragControls } from 'motion/react'

import type { Subject, Task } from '@/domain/types'
import { haptic } from '@/ui/motion'
import { TaskRow } from './TaskRow'

/**
 * Lista que se ordena arrastrando el asa de cada fila.
 *
 * Mientras se arrastra, el orden vive en un borrador local y la lista se
 * recoloca en directo; al soltar se guarda UNA vez. Guardar en cada cruce
 * llenaría la sincronización de cambios intermedios que nadie quería.
 *
 * El menú de cada fila también permite subir o bajar sin arrastrar.
 */
export function ReorderableTaskList({
  tasks,
  subjects,
  onOpen,
  onReorder,
  className,
}: {
  tasks: Task[]
  subjects: Map<string, Subject>
  onOpen: (task: Task) => void
  onReorder: (ids: string[]) => void
  className?: string
}) {
  const [draft, setDraft] = useState<string[] | null>(null)
  const draftRef = useRef<string[] | null>(null)
  const [lifted, setLifted] = useState<string | null>(null)

  const byId = new Map(tasks.map((t) => [t.id, t]))
  const ids = draft ?? tasks.map((t) => t.id)
  const shown = ids.map((id) => byId.get(id)).filter((t): t is Task => !!t)
  // Una tarea que llega mientras se arrastra (otro dispositivo) va al final.
  for (const task of tasks) if (!ids.includes(task.id)) shown.push(task)

  const lift = (id: string) => {
    const start = tasks.map((t) => t.id)
    draftRef.current = start
    setDraft(start)
    setLifted(id)
    haptic()
  }
  const drop = () => {
    const final = draftRef.current
    draftRef.current = null
    setLifted(null)
    setDraft(null)
    if (final && final.join() !== tasks.map((t) => t.id).join()) onReorder(final)
  }
  const move = (from: number, to: number) => {
    const next = shown.map((task) => task.id)
    ;[next[from], next[to]] = [next[to], next[from]]
    onReorder(next)
  }

  return (
    <Reorder.Group
      as="ul"
      axis="y"
      values={shown.map((t) => t.id)}
      onReorder={(next: string[]) => {
        if (draftRef.current) {
          // Arrastrando con el dedo o el ratón: se recoloca, se guarda al soltar.
          draftRef.current = next
          setDraft(next)
          haptic()
        } else {
          // Si no hay borrador de arrastre, el movimiento es definitivo.
          onReorder(next)
        }
      }}
      className={className}
    >
      <AnimatePresence initial={false}>
        {shown.map((task, index) => (
          <ReorderableRow
            key={task.id}
            task={task}
            subject={task.subjectId ? subjects.get(task.subjectId) : undefined}
            onOpen={onOpen}
            lifted={lifted === task.id}
            onLift={() => lift(task.id)}
            onDrop={drop}
            onMoveUp={!draft && index > 0 ? () => move(index, index - 1) : undefined}
            onMoveDown={!draft && index < shown.length - 1 ? () => move(index, index + 1) : undefined}
          />
        ))}
      </AnimatePresence>
    </Reorder.Group>
  )
}

function ReorderableRow({
  task,
  subject,
  onOpen,
  lifted,
  onLift,
  onDrop,
  onMoveUp,
  onMoveDown,
}: {
  task: Task
  subject?: Subject
  onOpen: (task: Task) => void
  lifted: boolean
  onLift: () => void
  onDrop: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  const controls = useDragControls()
  return (
    <TaskRow
      task={task}
      subject={subject}
      onOpen={onOpen}
      reorder={{ controls, lifted, onLift, onDrop, onMoveUp, onMoveDown }}
    />
  )
}
