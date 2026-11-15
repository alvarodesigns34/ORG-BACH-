import { useMemo } from 'react'
import { Plane } from 'lucide-react'

import { formatFlightTime, minutesBySubject } from '@/domain/flights'
import { colorVar } from '@/domain/palette'
import { useStore } from '@/state/StoreProvider'
import { useSubjectMap } from '@/state/selectors'
import { hrefFor } from '@/router'
import { RankedBars, type RankedBar } from '@/ui/charts'
import { Card, EmptyState, SectionHeader } from '@/ui/primitives'

/** Tiempo estudiado en el modo estudio estos 7 días, por asignatura. */
export function StudyStatsCard() {
  const { data } = useStore()
  const subjects = useSubjectMap()

  const { bars, total, flights } = useMemo(() => {
    const since = Date.now() - 7 * 86_400_000
    const by = minutesBySubject(data.sessions, since)
    let total = 0
    const bars: RankedBar[] = []
    for (const [id, minutes] of by) {
      total += minutes
      const subject = id ? subjects.get(id) : undefined
      bars.push({
        id: id ?? 'libre',
        label: subject?.name ?? 'Estudio libre',
        value: minutes,
        formatted: formatFlightTime(minutes),
        dotColor: subject ? colorVar(subject.color) : 'var(--c-ink-3)',
      })
    }
    bars.sort((a, b) => b.value - a.value)
    const flights = data.sessions.filter(
      (s) => s.status === 'aterrizado' && s.endedAt && Date.parse(s.endedAt) >= since,
    ).length
    return { bars, total, flights }
  }, [data.sessions, subjects])

  return (
    <Card>
      <SectionHeader
        title="Tiempo de estudio"
        hint={
          total > 0
            ? `${formatFlightTime(total)} en los últimos 7 días · ${flights} ${flights === 1 ? 'vuelo' : 'vuelos'}`
            : 'Lo que estudias en el modo estudio, por asignatura.'
        }
        action={
          <a href={hrefFor('estudio')} className="group-link">
            Abrir
          </a>
        }
        className="mb-5"
      />
      {bars.length === 0 ? (
        <EmptyState
          compact
          icon={<Plane className="size-5 rotate-45" />}
          title="Sin vuelos esta semana"
          description="Cada sesión del modo estudio se suma aquí al aterrizar."
        />
      ) : (
        <RankedBars
          bars={bars}
          max={Math.max(...bars.map((b) => b.value))}
          title="Minutos de estudio por asignatura"
        />
      )}
    </Card>
  )
}
