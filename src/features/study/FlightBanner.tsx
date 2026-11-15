import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { ChevronRight, Plane } from 'lucide-react'

import { activeSession, inLayover, progress, remainingMs } from '@/domain/flights'
import { colorVar } from '@/domain/palette'
import { useStore } from '@/state/StoreProvider'
import { useSubjectMap } from '@/state/selectors'
import { hrefFor } from '@/router'
import { spring } from '@/ui/motion'

/**
 * En Inicio, mientras hay un vuelo en el aire: dónde vas, qué estudias y
 * cuánto queda. Un toque y vuelves a la cabina.
 *
 * No importa el mapa ni los aeropuertos (eso es del modo estudio, que se
 * carga aparte): con los códigos IATA basta.
 */
export function FlightBanner() {
  const { data } = useStore()
  const subjects = useSubjectMap()
  const session = activeSession(data.sessions)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!session) return
    const id = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(id)
  }, [session])

  if (!session) return null
  const subject = session.subjectId ? subjects.get(session.subjectId) : undefined
  const left = Math.ceil(remainingMs(session, now) / 60_000)
  const state = inLayover(session) ? 'En escala' : session.pausedAt ? 'En pausa' : `Quedan ${left} min`

  return (
    <motion.a
      href={hrefFor('estudio')}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.smooth}
      className="pressable liquid relative flex items-center gap-4 w-full pl-3 pr-4 py-3 mb-4 rounded-[24px] overflow-hidden"
    >
      <span
        className="tile relative z-[2] grid place-items-center size-11 rounded-[14px] text-white shrink-0"
        style={{ background: 'linear-gradient(180deg, #0a58c2, #003f8a)' }}
      >
        <Plane className="size-5 rotate-45" strokeWidth={2.3} />
      </span>
      <span className="relative z-[2] min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[0.9375rem] font-semibold">
          En vuelo
          <span className="font-mono text-ink-2">
            {session.from} → {session.to}
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-[0.8125rem] text-ink-3 truncate">
          <span
            className="size-2 rounded-full shrink-0"
            style={{ background: subject ? colorVar(subject.color) : 'var(--c-ink-3)' }}
          />
          {subject?.name ?? 'Estudio libre'} · {state}
        </span>
      </span>
      <ChevronRight className="relative z-[2] size-5 text-ink-3 shrink-0" strokeWidth={2.2} />
      <span
        aria-hidden
        className="absolute left-0 bottom-0 h-[3px] bg-[#0a84ff] z-[2]"
        style={{ width: `${progress(session, now) * 100}%` }}
      />
    </motion.a>
  )
}
