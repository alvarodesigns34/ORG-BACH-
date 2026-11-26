import { useMemo } from 'react'
import { Check } from 'lucide-react'

import { examPlan, PREP_WINDOW_DAYS, type ExamPlan } from '@/domain/study'
import type { Exam } from '@/domain/types'
import { useStore, useToday } from '@/state/StoreProvider'
import { cx } from '@/ui/primitives'

/** «45 min», «1 h 15», «4 h»: corto, para que quepa en una fila de iPhone. */
function short(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `${h} h` : `${h} h ${String(rest).padStart(2, '0')}`
}

/** Plan de repaso de un examen próximo, o null si queda lejos o ya pasó. */
export function useExamPlan(exam: Exam): ExamPlan | null {
  const { data } = useStore()
  const today = useToday()
  return useMemo(() => {
    if (exam.gradeEntryId || exam.date < today) return null
    const plan = examPlan(exam, data.sessions, data.exams, today)
    return plan.daysLeft <= PREP_WINDOW_DAYS ? plan : null
  }, [exam, data.sessions, data.exams, today])
}

/**
 * Lo que toca hoy para llegar al examen con el repaso hecho: una barra con lo
 * que llevas del objetivo y una frase corta. Como los anillos de Actividad:
 * el número que importa es el de hoy, no el total.
 */
export function ExamPrepLine({ plan, color, className }: { plan: ExamPlan; color: string; className?: string }) {
  const pct = Math.min(100, (plan.studied / plan.target) * 100)
  const complete = plan.todayTarget === 0
  const todayDone = !complete && plan.todayLeft === 0
  return (
    <span className={cx('flex items-center gap-2 mt-1.5', className)}>
      <span
        aria-hidden
        className="relative h-[5px] w-10 sm:w-16 shrink-0 rounded-full bg-fill overflow-hidden"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-[var(--ease-std)]"
          style={{ width: `${Math.max(pct, plan.studied > 0 ? 6 : 0)}%`, background: color }}
        />
      </span>
      <span
        className="text-[0.75rem] text-ink-3 tabular-nums truncate"
        title={`Llevas ${short(plan.studied)} de ${short(plan.target)} de repaso`}
      >
        {complete ? (
          <span className="inline-flex items-center gap-1 text-ok font-semibold">
            <Check className="size-3" strokeWidth={3} />
            Repaso hecho · {short(plan.studied)}
          </span>
        ) : todayDone ? (
          <>
            <span className="text-ok font-semibold">Hoy, hecho</span>
            <span className="max-sm:hidden"> · {short(plan.studied)} de {short(plan.target)}</span>
          </>
        ) : (
          <>
            <span className="font-semibold text-ink-2">Hoy {plan.todayLeft} min</span>
            <span className="max-sm:hidden"> · {short(plan.studied)} de {short(plan.target)}</span>
          </>
        )}
      </span>
    </span>
  )
}

/** Atajo para filas: calcula el plan y pinta la línea si procede. */
export function ExamPrep({ exam, color, className }: { exam: Exam; color: string; className?: string }) {
  const plan = useExamPlan(exam)
  return plan ? <ExamPrepLine plan={plan} color={color} className={className} /> : null
}
