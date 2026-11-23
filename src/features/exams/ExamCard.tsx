import { ChevronRight } from 'lucide-react'

import { daysUntil, MONTHS_LONG, parseDay, WEEKDAYS_LONG } from '@/domain/dates'
import { colorVar, quietVar } from '@/domain/palette'
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
 * Un examen, como fila de una lista agrupada.
 *
 * A la izquierda, la hoja de calendario (día de la semana y número), como el
 * widget de Calendario: se lee la fecha sin leer texto. A la derecha, la
 * cuenta atrás, que es lo que decide si hay que ponerse hoy; su urgencia se
 * marca con color Y con palabras («Mañana»), no solo con color.
 */
export function ExamCard({ exam, subject, today, onOpen, hideSubject }: ExamCardProps) {
  const days = daysUntil(exam.date, today)
  const date = parseDay(exam.date)
  const urgent = days >= 0 && days <= 2
  const soon = days > 2 && days <= 6

  const countdown =
    days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : days < 0 ? 'Sin nota' : `${days} días`

  const Wrapper = onOpen ? 'button' : 'div'
  const tint = subject ? colorVar(subject.color) : 'var(--c-ink-3)'

  return (
    <Wrapper
      {...(onOpen ? { type: 'button' as const, onClick: () => onOpen(exam) } : {})}
      className={cx(
        'w-full text-left flex items-center gap-3.5 pl-4 pr-3 py-3',
        'transition-colors duration-150',
        onOpen && 'group active:bg-fill hover:bg-fill/55',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'grid w-11 shrink-0 overflow-hidden rounded-[10px] bg-fill border border-hairline text-center shadow-[0_1px_3px_rgb(0_0_0/0.06)]',
          onOpen && 'transition-transform duration-300 ease-[var(--spring)] group-hover:scale-[1.06]',
        )}
      >
        <span
          className="text-[0.625rem] font-bold uppercase tracking-[0.04em] leading-[1.6]"
          style={{
            background: subject ? quietVar(subject.color) : 'var(--c-fill-2)',
            color: subject ? tint : 'var(--c-ink-2)',
          }}
        >
          {WEEKDAYS_LONG[date.getDay()].slice(0, 3)}
        </span>
        <span className="numeral text-[1.25rem] leading-[1.6] text-ink bg-surface">
          {date.getDate()}
        </span>
      </span>

      <span className="flex-1 min-w-0">
        {!hideSubject && (
          <span className="block text-[0.75rem] font-semibold truncate" style={{ color: tint }}>
            {subject?.name ?? 'Sin asignatura'}
          </span>
        )}
        <span className="block text-[0.9375rem] text-ink font-medium leading-snug truncate">
          {exam.title}
        </span>
        <span className="block text-[0.75rem] text-ink-3 mt-0.5 tabular-nums truncate">
          {date.getDate()} de {MONTHS_LONG[date.getMonth()]}
          {exam.time && ` · ${exam.time}`}
          {exam.weight ? ` · Peso ${formatPercent(exam.weight)}` : ''}
        </span>
      </span>

      <span
        className={cx(
          'tag-glass shrink-0 rounded-full px-2.5 h-7 inline-flex items-center text-[0.8125rem] font-semibold tabular-nums',
          urgent
            ? 'bg-danger-quiet text-danger'
            : soon
              ? 'bg-warn-quiet text-warn'
              : 'bg-fill text-ink-2',
        )}
      >
        {countdown}
      </span>
      {onOpen && (
        <ChevronRight
          className="size-4 text-ink-3 shrink-0 -ml-1 transition-[transform,color] duration-300 ease-[var(--spring)] group-hover:translate-x-0.5 group-hover:text-ink-2"
          strokeWidth={2.4}
        />
      )}
    </Wrapper>
  )
}
