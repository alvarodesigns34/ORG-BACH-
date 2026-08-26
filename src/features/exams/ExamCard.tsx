import { daysUntil, formatDayMonth } from '@/domain/dates'
import { colorVar } from '@/domain/palette'
import { formatPercent } from '@/domain/grades'
import type { Exam, Subject } from '@/domain/types'
import { cx } from '@/ui/primitives'

interface ExamCardProps {
  exam: Exam
  subject?: Subject
  today: string
  onOpen?: (exam: Exam) => void
  /** Dentro de la ficha de una asignatura, repetir su nombre sobra. */
  hideSubject?: boolean
}

/**
 * Un examen próximo.
 *
 * La cuenta atrás manda: es el dato que decide si hay que ponerse hoy. El
 * franjeado lateral toma el color de la asignatura para poder recorrer la
 * lista sin leer, y la urgencia se marca también con peso tipográfico, no
 * solo con color.
 */
export function ExamCard({ exam, subject, today, onOpen, hideSubject }: ExamCardProps) {
  const days = daysUntil(exam.date, today)
  const urgent = days <= 2
  const soon = days <= 6

  const countdown =
    days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : days < 0 ? `Hace ${Math.abs(days)} d` : `${days}`

  const Wrapper = onOpen ? 'button' : 'div'

  return (
    <Wrapper
      {...(onOpen ? { type: 'button' as const, onClick: () => onOpen(exam) } : {})}
      className={cx(
        'relative w-full text-left flex items-center gap-4 pl-4 pr-4 py-3.5 rounded-md',
        'transition-colors duration-150',
        onOpen && 'hover:bg-sunken/50',
      )}
    >
      <span
        aria-hidden
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
        style={{ background: subject ? colorVar(subject.color) : 'var(--c-ink-3)' }}
      />

      <div className="flex-1 min-w-0">
        {!hideSubject && (
          <p
            className="eyebrow truncate"
            style={subject ? { color: colorVar(subject.color) } : undefined}
          >
            {subject?.name ?? 'Sin asignatura'}
          </p>
        )}
        <p className={cx('text-[0.9375rem] text-ink font-medium leading-snug truncate', !hideSubject && 'mt-1')}>
          {exam.title}
        </p>
        <p className="text-[0.75rem] text-ink-3 mt-1 tabular-nums">
          {formatDayMonth(exam.date, true)}
          {exam.time && ` · ${exam.time}`}
          {exam.weight ? ` · Peso ${formatPercent(exam.weight)}` : ''}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <span
          className={cx(
            'numeral block leading-none',
            days > 1 ? 'text-[1.5rem]' : 'text-[1rem] font-sans font-semibold tracking-normal',
            urgent ? 'text-danger' : soon ? 'text-warn' : 'text-ink-2',
          )}
        >
          {countdown}
        </span>
        {days > 1 && (
          <span className={cx('block text-[0.6875rem] mt-0.5', soon ? 'text-warn' : 'text-ink-3')}>
            días
          </span>
        )}
      </div>
    </Wrapper>
  )
}
