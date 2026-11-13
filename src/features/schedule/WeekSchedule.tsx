import { useMemo } from 'react'
import { CalendarClock, Download } from 'lucide-react'

import { colorVar, quietVar } from '@/domain/palette'
import { classesOn } from '@/domain/schedule'
import { planTimetable } from '@/domain/timetable'
import { useDispatch, useStore } from '@/state/StoreProvider'
import { useSubjects } from '@/state/selectors'
import { Button, Card, EmptyState, GroupTitle, cx } from '@/ui/primitives'
import { useToast } from '@/ui/Toast'

const DAYS: { day: number; label: string }[] = [
  { day: 1, label: 'Lunes' },
  { day: 2, label: 'Martes' },
  { day: 3, label: 'Miércoles' },
  { day: 4, label: 'Jueves' },
  { day: 5, label: 'Viernes' },
  { day: 6, label: 'Sábado' },
  { day: 0, label: 'Domingo' },
]

/**
 * Horario semanal: cada día con sus clases, tal y como las dice el centro.
 * Sin ninguna franja guardada ofrece cargar el horario del centro; con ellas
 * solo lo muestra (se edita desde la ficha de cada asignatura).
 */
export function WeekSchedule() {
  const { data } = useStore()
  const dispatch = useDispatch()
  const toast = useToast()
  const subjects = useSubjects()

  const week = useMemo(
    () =>
      DAYS.map(({ day, label }) => ({ label, classes: classesOn(subjects, day) })).filter(
        // Sábado y domingo solo si alguien tiene clase.
        (d, i) => i < 5 || d.classes.length > 0,
      ),
    [subjects],
  )
  const hasSchedule = week.some((d) => d.classes.length > 0)

  const load = () => {
    const before = data
    const plan = planTimetable(data.subjects)
    if (plan.add.length > 0) dispatch({ type: 'subject/addMany', subjects: plan.add })
    for (const item of plan.update) {
      dispatch({ type: 'subject/update', id: item.id, patch: item.patch })
    }
    toast({
      text: `Horario cargado: ${plan.add.length} asignaturas nuevas, ${plan.update.length} actualizadas`,
      action: { label: 'Deshacer', run: () => dispatch({ type: 'data/replace', data: before }) },
    })
  }

  if (!hasSchedule) {
    return (
      <Card className="max-w-[760px]">
        <EmptyState
          compact
          icon={<CalendarClock className="size-5" />}
          title="Tu horario semanal"
          description="Carga el horario del centro: se crean las asignaturas que falten y se rellenan sus clases y profesorado. Después podrás retocar cualquier franja desde la ficha de cada asignatura."
          action={
            <Button variant="primary" onClick={load}>
              <Download className="size-4" />
              Cargar mi horario
            </Button>
          }
        />
      </Card>
    )
  }

  return (
    <section aria-label="Horario semanal">
      <GroupTitle title="Horario semanal" hint="Lo que toca cada día." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 max-w-[1180px]">
        {week.map(({ label, classes }) => (
          <Card key={label} flush className="overflow-hidden">
            <h3 className="px-4 pt-3.5 pb-2 text-[0.8125rem] font-semibold uppercase tracking-[0.06em] text-ink-3">
              {label}
            </h3>
            {classes.length === 0 ? (
              <p className="px-4 pb-4 text-[0.875rem] text-ink-3">Sin clase</p>
            ) : (
              <ul>
                {classes.map(({ subject, slot }, i) => (
                  <li
                    key={slot.id}
                    className={cx('flex items-center gap-3 px-4 py-2.5', i > 0 && 'inset-separator-wide')}
                  >
                    <span className="w-[5.75rem] shrink-0 text-[0.8125rem] tabular-nums text-ink-3">
                      {slot.start} – {slot.end}
                    </span>
                    <span
                      className="grid place-items-center h-7 min-w-[2.75rem] px-2 rounded-full text-[0.75rem] font-bold shrink-0"
                      style={{ background: quietVar(subject.color), color: colorVar(subject.color) }}
                    >
                      {subject.shortName}
                    </span>
                    <span className="min-w-0 flex-1 text-[0.875rem] text-ink truncate">
                      {slot.room ? `${subject.name} · ${slot.room}` : subject.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </section>
  )
}
