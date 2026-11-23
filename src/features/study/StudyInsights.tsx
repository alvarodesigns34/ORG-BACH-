import { useMemo } from 'react'
import { Plane } from 'lucide-react'

import { formatShort } from '@/domain/dates'
import { formatFlightTime } from '@/domain/flights'
import { formatGrade, numeralTone } from '@/domain/grades'
import { colorVar } from '@/domain/palette'
import { comparePrep, studyBeforeExams, studyStreak } from '@/domain/study'
import { hrefFor } from '@/router'
import { useSettings, useStore, useToday } from '@/state/StoreProvider'
import { useSubjectMap } from '@/state/selectors'
import { Card, EmptyState, Numeral, SectionHeader, cx } from '@/ui/primitives'

const WEEKDAY_INITIAL = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

/**
 * Constancia: días seguidos estudiando en el modo estudio y los últimos 14
 * días. Sin trofeos ni avisos de «vas a perder la racha»: el dato, tal cual,
 * para verse a uno mismo, no para sentirse en deuda.
 */
export function StreakCard() {
  const { data } = useStore()
  const today = useToday()
  const streak = useMemo(() => studyStreak(data.sessions, today), [data.sessions, today])
  const studiedDays = streak.recent.filter((d) => d.minutes > 0).length
  const max = Math.max(1, ...streak.recent.map((d) => d.minutes))

  return (
    <Card>
      <SectionHeader
        title="Constancia"
        hint={
          streak.current === 0
            ? studiedDays > 0
              ? `${studiedDays} de los últimos 14 días con estudio`
              : 'Los días en que estudias con el modo estudio.'
            : streak.today
              ? 'Días seguidos estudiando, hoy incluido.'
              : 'Días seguidos estudiando. Hoy todavía cuenta.'
        }
        className="mb-4"
      />
      <div className="flex items-end gap-6">
        <div>
          <Numeral value={String(streak.current)} suffix={streak.current === 1 ? 'día' : 'días'} size="md" />
          <p className="text-[0.75rem] text-ink-3 mt-1">
            {streak.best > streak.current ? `Mejor racha: ${streak.best} días` : 'Racha actual'}
          </p>
        </div>
        {/* Últimos 14 días: la altura es el tiempo estudiado. */}
        <div
          className="flex-1 flex items-end gap-1 h-14"
          role="img"
          aria-label={`${studiedDays} de los últimos 14 días con estudio`}
        >
          {streak.recent.map(({ day, minutes }) => {
            const isToday = day === today
            const weekday = new Date(`${day}T12:00:00`).getDay()
            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <span
                  className={cx(
                    'w-full max-w-[14px] rounded-[4px] transition-[height]',
                    minutes > 0 ? 'bg-accent-fill' : 'bg-fill',
                  )}
                  style={{ height: minutes > 0 ? `${12 + (minutes / max) * 28}px` : '4px' }}
                  title={`${formatShort(day)}: ${minutes > 0 ? formatFlightTime(minutes) : 'sin estudio'}`}
                />
                <span className={cx('text-[0.625rem] tabular-nums', isToday ? 'text-accent font-bold' : 'text-ink-3')}>
                  {WEEKDAY_INITIAL[weekday]}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

/**
 * Cuánto estudiaste (en el modo estudio) antes de cada examen y qué sacaste.
 * Solo con exámenes que ya tienen nota enlazada.
 */
export function PrepCard() {
  const { data } = useStore()
  const settings = useSettings()
  const subjects = useSubjectMap()
  const scale = settings.gradeScale
  const rows = useMemo(
    () => studyBeforeExams(data.sessions, data.exams, data.grades, scale),
    [data.sessions, data.exams, data.grades, scale],
  )
  const comparison = useMemo(() => comparePrep(rows), [rows])
  const anyStudy = rows.some((r) => r.minutes > 0)

  return (
    <Card flush>
      <SectionHeader
        title="Estudio y notas"
        hint="Lo estudiado en el modo estudio antes de cada examen, frente a la nota."
        className="px-5 sm:px-6 pt-5 pb-4"
      />
      {rows.length === 0 ? (
        <EmptyState
          compact
          icon={<Plane className="size-5 rotate-45" />}
          title="Aún no hay exámenes con nota"
          description="Al apuntar la nota de un examen verás aquí cuánto lo preparaste."
        />
      ) : (
        <>
          {comparison && (
            <p className="mx-5 sm:mx-6 mb-3 rounded-[14px] bg-sunken px-4 py-3 text-[0.8125rem] text-ink-2 leading-relaxed">
              {comparison.threshold === 0 ? (
                <>
                  Cuando preparaste el examen en el modo estudio sacaste de media{' '}
                  <strong className="text-ink">{formatGrade(comparison.more.average, scale)}</strong> (
                  {comparison.more.count} {comparison.more.count === 1 ? 'examen' : 'exámenes'}); sin
                  vuelos registrados,{' '}
                  <strong className="text-ink">{formatGrade(comparison.less.average, scale)}</strong> (
                  {comparison.less.count}).
                </>
              ) : (
                <>
                  Con {formatFlightTime(comparison.threshold)} o más de estudio sacaste de media{' '}
                  <strong className="text-ink">{formatGrade(comparison.more.average, scale)}</strong> (
                  {comparison.more.count} {comparison.more.count === 1 ? 'examen' : 'exámenes'}); con
                  menos,{' '}
                  <strong className="text-ink">{formatGrade(comparison.less.average, scale)}</strong> (
                  {comparison.less.count}).
                </>
              )}
            </p>
          )}
          {!anyStudy && (
            <p className="mx-5 sm:mx-6 mb-3 text-[0.8125rem] text-ink-3">
              Ninguno tiene vuelos de su asignatura antes: al despegar, elige la asignatura que
              estudias.
            </p>
          )}
          <ul className="divide-y divide-hairline border-t border-hairline">
            {rows.slice(0, 8).map((row) => {
              const subject = subjects.get(row.exam.subjectId)
              const tone = numeralTone(row.score, scale)
              return (
                <li key={row.exam.id} className="flex items-center gap-3 px-5 sm:px-6 py-3">
                  <span
                    aria-hidden
                    className="size-2 rounded-full shrink-0"
                    style={{ background: subject ? colorVar(subject.color) : 'var(--c-ink-3)' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.875rem] text-ink truncate">{row.exam.title}</p>
                    <p className="text-[0.6875rem] text-ink-3 mt-0.5 truncate">
                      {subject?.name ?? 'Asignatura'} · {formatShort(row.exam.date)}
                    </p>
                  </div>
                  <span
                    className="text-[0.8125rem] tabular-nums text-ink-2 shrink-0"
                    title={`En los ${row.windowDays} días anteriores`}
                  >
                    {row.minutes > 0 ? formatFlightTime(row.minutes) : '—'}
                  </span>
                  <span
                    className={cx(
                      'w-12 text-right text-[0.9375rem] font-semibold tabular-nums shrink-0',
                      tone === 'danger' && 'text-danger',
                      tone === 'warn' && 'text-warn',
                      tone === 'ok' && 'text-ok',
                    )}
                  >
                    {formatGrade(row.score, scale)}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="px-5 sm:px-6 py-3 text-[0.6875rem] text-ink-3 border-t border-hairline">
            Se cuenta desde el examen anterior de la asignatura (como mucho, 3 semanas).{' '}
            <a href={hrefFor('estudio')} className="text-accent">
              Abrir el modo estudio
            </a>
          </p>
        </>
      )}
    </Card>
  )
}
