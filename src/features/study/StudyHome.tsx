import { m as motion } from 'motion/react'
import { BookOpen, ChartNoAxesColumn, ChevronLeft, Plane, Stamp } from 'lucide-react'

import { countryName, type Airport } from '@/domain/flights'
import { greeting } from '@/domain/dates'
import type { Subject } from '@/domain/types'
import { useSettings } from '@/state/StoreProvider'
import { haptic, spring } from '@/ui/motion'
import { cx } from '@/ui/primitives'
import { RoundButton } from './FlightHud'
import { StudyNext, type HomeTab } from './Panels'

/** Duraciones de «Despegar ahora». */
const QUICK = [25, 45, 60, 90]

function quickLabel(m: number): { value: string; unit: string } {
  if (m < 60) return { value: String(m), unit: 'min' }
  return m % 60
    ? { value: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, unit: 'horas' }
    : { value: String(m / 60), unit: m === 60 ? 'hora' : 'horas' }
}

const ACTIVITY: { tab: HomeTab; label: string; icon: typeof Plane }[] = [
  { tab: 'resumen', label: 'Resumen de lo estudiado', icon: ChartNoAxesColumn },
  { tab: 'diario', label: 'Diario de vuelos', icon: BookOpen },
  { tab: 'pasaporte', label: 'Pasaporte', icon: Stamp },
]

/**
 * Entrada de Estudio. Lo mínimo sobre el mapa, como una app de vuelo: dónde
 * estás y un botón grande. «Despegar ya» y «Con qué estudiar ahora» van
 * dentro de «Planear vuelo» (ver `QuickStart`); el resumen, el diario y el
 * pasaporte, a un toque en la barra de la derecha.
 */
export function StudyHome({
  origin,
  hidden,
  onExit,
  onActivity,
  onStart,
}: {
  origin: Airport
  /** La hoja de actividad está abierta: se apartan los controles de la izquierda. */
  hidden: boolean
  onExit: () => void
  onActivity: (tab: HomeTab) => void
  onStart: () => void
}) {
  const settings = useSettings()
  const name = settings.userName.trim().split(/\s+/)[0]
  const enter = (delay: number) => ({
    initial: { opacity: 0, y: 12 },
    animate: { opacity: hidden ? 0 : 1, y: 0, transition: { ...spring.smooth, delay: hidden ? 0 : delay } },
    exit: { opacity: 0, y: 8, transition: { duration: 0.16 } },
  })

  return (
    <>
      {/* Legibilidad del título sobre cualquier mapa, sin una caja. */}
      <div aria-hidden className="study-home-scrim absolute inset-0 z-[1] pointer-events-none" />

      <motion.div
        {...enter(0.05)}
        inert={hidden}
        className="absolute z-10 left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))] flex items-center gap-2"
      >
        <div className="liquid rounded-full flex p-0.5">
          <RoundButton label="Salir del modo estudio" onClick={onExit}>
            <ChevronLeft className="size-5" strokeWidth={2.4} />
          </RoundButton>
          {/* En iPhone no cabe la barra de la derecha: la actividad va aquí. */}
          <span className="min-[720px]:hidden contents">
            <RoundButton label="Tu actividad" onClick={() => onActivity('resumen')}>
              <ChartNoAxesColumn className="size-[19px]" strokeWidth={2.2} />
            </RoundButton>
          </span>
        </div>
      </motion.div>

      <motion.header
        {...enter(0.1)}
        inert={hidden}
        className="study-home-title absolute z-10 pointer-events-none"
      >
        <p className="text-[1.375rem] min-[720px]:text-[1.75rem] font-medium tracking-[-0.02em] text-ink-3 leading-tight">
          {greeting()}
          {name ? `, ${name}` : ''}
        </p>
        <h1 className="display text-[2.75rem] min-[720px]:text-[3.5rem] leading-[1.02] tracking-[-0.035em] mt-0.5">
          {origin.city}
        </h1>
        <p className="mt-1.5 text-[0.875rem] font-medium text-ink-2 flex items-center gap-2">
          <span className="font-mono font-bold tracking-wide text-[0.8125rem]">{origin.iata}</span>
          <span aria-hidden className="size-1 rounded-full bg-current opacity-40" />
          {countryName(origin.country)}
        </p>
      </motion.header>

      <motion.div
        {...enter(0.16)}
        inert={hidden}
        className="study-home-dock absolute z-10 flex flex-col gap-3"
      >
        <button
          type="button"
          onClick={() => {
            haptic()
            onStart()
          }}
          className="glass-tinted pressable h-[3.75rem] rounded-full flex items-center justify-center gap-2.5 text-[1.0625rem] font-semibold text-white"
        >
          <Plane className="size-[19px]" strokeWidth={2.3} />
          Planear vuelo
        </button>
      </motion.div>

      {/* Actividad: resumen, diario y pasaporte, a un toque. */}
      <motion.nav
        aria-label="Tu actividad"
        {...enter(0.22)}
        inert={hidden}
        className="max-[719px]:hidden absolute z-10 right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+1.25rem)]"
      >
        <div className="liquid rounded-full flex flex-col p-0.5">
          {ACTIVITY.map(({ tab, label, icon: Icon }) => (
            <RoundButton key={tab} label={label} onClick={() => onActivity(tab)}>
              <Icon className={cx('size-[19px]')} strokeWidth={2.2} />
            </RoundButton>
          ))}
        </div>
      </motion.nav>
    </>
  )
}

/**
 * Arriba de «Planear vuelo»: despegar ya con una duración o con lo que toca
 * estudiar, sin elegir destino ni asiento.
 */
export function QuickStart({
  subjects,
  today,
  onQuick,
}: {
  subjects: Map<string, Subject>
  today: string
  onQuick: (minutes: number) => void
}) {
  return (
    <div className="pb-3 border-b border-[var(--glass-edge)]">
      <p className="eyebrow px-6 pt-3 mb-1.5">Despegar ya</p>
      <div className="grid grid-cols-4 gap-1.5 px-4">
        {QUICK.map((m) => {
          const { value, unit } = quickLabel(m)
          return (
            <button
              key={m}
              type="button"
              onClick={() => {
                haptic()
                onQuick(m)
              }}
              aria-label={`Despegar ya ${m < 60 ? `${m} minutos` : `${value} ${unit}`}`}
              className="glass-btn pressable h-12 rounded-[16px] flex flex-col items-center justify-center"
            >
              <span className="numeral text-[1rem] leading-none">{value}</span>
              <span className="text-[0.6875rem] font-medium text-ink-3 mt-1">{unit}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-2">
        <StudyNext subjects={subjects} today={today} flat />
      </div>
    </div>
  )
}
