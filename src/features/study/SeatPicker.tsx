import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BookOpen, ChevronLeft, ListChecks } from 'lucide-react'

import { SEAT_LETTERS, SEAT_ROWS, seatLabel } from '@/domain/flights'
import { colorVar, quietVar } from '@/domain/palette'
import type { Subject, Task } from '@/domain/types'
import { haptic, spring } from '@/ui/motion'
import { IconButton, cx } from '@/ui/primitives'

export interface SeatChoice {
  seat: string
  subjectId?: string
  taskId?: string
}

/**
 * El morro del avión visto desde arriba, con sus filas de asientos. Al tocar
 * uno sale una burbuja: qué vas a estudiar (tus asignaturas) y, si quieres,
 * qué tarea. El asiento se queda pintado del color de la asignatura.
 */
export function SeatPicker({
  subjects,
  tasks,
  onBack,
  onDone,
}: {
  subjects: Subject[]
  tasks: Task[]
  onBack: () => void
  onDone: (choice: SeatChoice) => void
}) {
  const [seat, setSeat] = useState<string | null>(null)
  const [subjectId, setSubjectId] = useState<string | null | undefined>(undefined)
  const [done, setDone] = useState(false)

  const subject = subjectId ? subjects.find((s) => s.id === subjectId) : undefined
  const pending = subjectId
    ? tasks.filter((t) => t.subjectId === subjectId && t.status !== 'completada').slice(0, 5)
    : []
  const step: 'asiento' | 'materia' | 'tarea' =
    !seat ? 'asiento' : subjectId === undefined ? 'materia' : 'tarea'

  const finish = (taskId?: string, chosen: string | null | undefined = subjectId) => {
    if (!seat || done) return
    setDone(true)
    haptic('success')
    window.setTimeout(
      () => onDone({ seat, subjectId: chosen ?? undefined, taskId }),
      reducedMotion() ? 0 : 520,
    )
  }

  const pickSubject = (id: string | null) => {
    haptic()
    setSubjectId(id)
    const hasTasks = id && tasks.some((t) => t.subjectId === id && t.status !== 'completada')
    if (!hasTasks) {
      // Sin tareas que elegir, no hay segunda pregunta.
      finish(undefined, id)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      className="absolute inset-0 z-20 grid place-items-center bg-[color-mix(in_srgb,var(--c-canvas)_45%,transparent)] backdrop-blur-[2px]"
    >
      <div className="absolute left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))]">
        <IconButton label="Volver a la reserva" onClick={onBack} className="liquid">
          <ChevronLeft className="relative z-[2] size-5" strokeWidth={2.4} />
        </IconButton>
      </div>

      <motion.div
        initial={{ y: 80, opacity: 0 }}
        // Con la burbuja abierta, el avión se aparta para dejarle sitio.
        animate={{ y: 0, opacity: 1, x: seat && !done ? -180 : 0 }}
        transition={spring.smooth}
        className="relative w-[340px] max-h-[calc(100dvh-2rem)]"
      >
        {/* Fuselaje */}
        <div className="fuselage relative mx-auto w-[300px] pt-[150px] pb-8 rounded-t-[150px] rounded-b-[44px]">
          <div aria-hidden className="absolute left-1/2 top-[62px] -translate-x-1/2 flex gap-2">
            <span className="cockpit-window -skew-x-[14deg]" />
            <span className="cockpit-window skew-x-[14deg]" />
          </div>

          <div className="grid grid-cols-[1fr_1fr_2.25rem_1fr_1fr] gap-x-2 gap-y-2.5 px-7">
            {['A', 'C', '', 'D', 'F'].map((l, i) => (
              <span key={i} className="text-center text-[0.6875rem] font-semibold text-ink-3">
                {l}
              </span>
            ))}
            {Array.from({ length: SEAT_ROWS }, (_, r) => r + 1).map((row) => (
              <SeatRow
                key={row}
                row={row}
                selected={seat}
                color={subject ? colorVar(subject.color) : undefined}
                filled={done || (step === 'tarea' && !!subject)}
                onPick={(label) => {
                  if (done) return
                  haptic()
                  setSeat(label)
                  setSubjectId(undefined)
                }}
              />
            ))}
          </div>
        </div>

        {/* Burbuja: qué vas a estudiar */}
        <AnimatePresence>
          {seat && !done && (
            <motion.div
              key={step}
              initial={{ opacity: 0, scale: 0.92, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
              transition={spring.snappy}
              // Al lado del avión, a la altura de la fila: no tapa ningún asiento.
              style={{ transformOrigin: '0% 50%', top: seatTop(seat) }}
              className="absolute left-[calc(100%+20px)] -translate-y-1/2 w-[340px] liquid rounded-[24px] p-4"
            >
              <div className="relative z-[2]">
                <p className="text-[0.75rem] font-semibold text-ink-3">Asiento {seat}</p>
                {step === 'materia' ? (
                  <>
                    <p className="text-[1.0625rem] font-semibold mt-0.5">¿Qué vas a estudiar?</p>
                    <div className="flex flex-wrap gap-1.5 mt-3 max-h-[220px] overflow-y-auto no-scrollbar">
                      {subjects.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => pickSubject(s.id)}
                          className="pressable inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[0.8125rem] font-semibold"
                          style={{ background: quietVar(s.color), color: colorVar(s.color) }}
                        >
                          <BookOpen className="size-3.5" strokeWidth={2.4} />
                          {s.shortName || s.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => pickSubject(null)}
                        className="pressable inline-flex items-center h-9 px-3 rounded-full bg-fill text-[0.8125rem] font-semibold text-ink-2"
                      >
                        Otra cosa
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[1.0625rem] font-semibold mt-0.5">
                      ¿Alguna tarea de {subject?.shortName || subject?.name}?
                    </p>
                    <ul className="mt-2 flex flex-col">
                      {pending.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => finish(t.id)}
                            className="w-full flex items-center gap-2.5 rounded-[12px] px-2 py-2 text-left text-[0.875rem] hover:bg-[var(--glass-tint)] active:bg-[var(--glass-tint)]"
                          >
                            <ListChecks className="size-4 text-ink-3 shrink-0" strokeWidth={2.2} />
                            <span className="truncate">{t.title}</span>
                          </button>
                        </li>
                      ))}
                      <li>
                        <button
                          type="button"
                          onClick={() => finish()}
                          className="w-full rounded-[12px] px-2 py-2 text-left text-[0.875rem] font-semibold text-accent hover:bg-[var(--glass-tint)]"
                        >
                          No, estudio en general
                        </button>
                      </li>
                    </ul>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!seat && (
          <p className="absolute left-0 right-0 top-[92px] text-center text-[0.875rem] font-medium text-ink-3">
            Elige tu asiento
          </p>
        )}
      </motion.div>
    </motion.div>
  )
}

function SeatRow({
  row,
  selected,
  color,
  filled,
  onPick,
}: {
  row: number
  selected: string | null
  color?: string
  filled: boolean
  onPick: (label: string) => void
}) {
  const seat = (letter: (typeof SEAT_LETTERS)[number]) => {
    const label = seatLabel(row, letter)
    const isSelected = selected === label
    return (
      <motion.button
        key={letter}
        type="button"
        aria-label={`Asiento ${label}`}
        aria-pressed={isSelected}
        onClick={() => onPick(label)}
        animate={isSelected ? { scale: [1, 1.12, 1] } : { scale: 1 }}
        transition={spring.bouncy}
        className={cx(
          'seat h-11 rounded-[11px] transition-colors duration-200',
          isSelected ? 'is-selected' : '',
        )}
        style={isSelected && filled && color ? { background: color, boxShadow: 'none' } : undefined}
      />
    )
  }
  return (
    <>
      {seat('A')}
      {seat('C')}
      <span className="grid place-items-center text-[0.6875rem] font-semibold tabular-nums text-ink-3">
        {String(row).padStart(2, '0')}
      </span>
      {seat('D')}
      {seat('F')}
    </>
  )
}

/** Centro vertical de la fila del asiento dentro del fuselaje. */
function seatTop(seat: string): number {
  const row = Number(seat.slice(0, 2)) || 1
  // 150 px de morro + 16 de cabecera A/C/D/F + 10 de hueco; filas de 44 + 10.
  return 150 + 26 + (row - 1) * 54 + 22
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
