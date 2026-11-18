import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AnimatePresence, m as motion } from 'motion/react'
import {
  AudioWaveform,
  Check,
  ChevronLeft,
  CloudLightning,
  CloudRain,
  Flame,
  Waves,
  Wind,
  Coffee,
  Layers,
  MapPin,
  MapPinOff,
  LocateFixed,
  Pause,
  Plane,
  PlaneLanding,
  Play,
  Route,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'

import { formatFlightTime } from '@/domain/flights'
import { colorVar, quietVar } from '@/domain/palette'
import type { Exam, FocusSession, Subject, Task } from '@/domain/types'
import { ConfirmDialog } from '@/ui/Modal'
import { haptic, spring } from '@/ui/motion'
import { Button, CountUp, cx } from '@/ui/primitives'
import type { MapKind } from './mapStyle'
import type { StudyAppearance } from './prefs'
import {
  CHIME_CREDIT,
  SOUNDS,
  SOUND_CREDITS,
  loadingSound,
  subscribeSound,
  type SoundId,
} from './soundscape'

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

export function RoundButton({
  label,
  onClick,
  children,
  active,
  expanded,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  active?: boolean
  expanded?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      aria-expanded={expanded}
      onClick={onClick}
      className={cx(
        'pressable relative z-[2] grid place-items-center size-11 rounded-full transition-colors duration-150',
        active ? 'text-[#0a84ff]' : 'text-ink-2 hover:text-ink',
        expanded && 'bg-[var(--glass-tint)]',
      )}
    >
      {children}
    </button>
  )
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        haptic()
        onChange(!checked)
      }}
      className="study-switch"
    />
  )
}

const MAP_OPTIONS: { id: MapKind; label: string; swatch: string }[] = [
  {
    id: 'minimal',
    label: 'Minimalista',
    swatch: 'linear-gradient(135deg, #e6e3dc 0 52%, #aec6da 52% 100%)',
  },
  {
    id: 'relieve',
    label: 'Relieve',
    swatch:
      'radial-gradient(60% 70% at 30% 35%, #c9b88f, transparent 70%), radial-gradient(50% 60% at 75% 70%, #8fa36e, transparent 70%), linear-gradient(135deg, #b9c99b 0 50%, #8db3cc 50% 100%)',
  },
]

function Popover({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.14 } }}
      transition={spring.snappy}
      style={{ transformOrigin: '100% 0%' }}
      className={cx('liquid liquid-thick absolute right-0 top-0 rounded-[26px] p-4', className)}
    >
      <div className="relative z-[2]">{children}</div>
    </motion.div>
  )
}

/** Estilo del mapa: tres miniaturas y el interruptor de nombres. */
const APPEARANCE: { id: StudyAppearance; label: string; title: string }[] = [
  { id: 'auto', label: 'Auto', title: 'Como el resto de la app' },
  { id: 'claro', label: 'Claro', title: 'Siempre claro, también en vuelo' },
  { id: 'oscuro', label: 'Oscuro', title: 'Siempre oscuro, también en vuelo' },
]

function MapStylePanel({
  map,
  labels,
  globe,
  onMap,
  onLabels,
  onGlobe,
  appearance,
  onAppearance,
}: {
  map: MapKind
  labels: boolean
  globe: boolean
  onMap: (kind: MapKind) => void
  onLabels: (on: boolean) => void
  onGlobe: (on: boolean) => void
  appearance: StudyAppearance
  onAppearance: (value: StudyAppearance) => void
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[0.9375rem] font-semibold">Mapa</p>
        <div role="radiogroup" aria-label="Vista del mapa" className="flex p-0.5 rounded-full bg-[var(--glass-tint)]">
          {[
            { on: true, label: '3D' },
            { on: false, label: '2D' },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={globe === o.on}
              title={o.on ? 'Globo terráqueo' : 'Mapa plano (más ligero)'}
              onClick={() => {
                haptic()
                onGlobe(o.on)
              }}
              className={cx(
                'h-7 px-3 rounded-full text-[0.75rem] font-semibold transition-colors',
                globe === o.on ? 'bg-surface text-ink shadow-[0_1px_3px_rgb(0_0_0/0.15)]' : 'text-ink-3',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {MAP_OPTIONS.map((o) => {
          const active = map === o.id
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                haptic()
                onMap(o.id)
              }}
              aria-pressed={active}
              className="group flex flex-col items-center gap-1.5"
            >
              <span
                className={cx(
                  'block w-full aspect-[4/3] rounded-[14px] transition-shadow duration-200',
                  active
                    ? 'shadow-[0_0_0_2.5px_var(--c-surface),0_0_0_4.5px_#0a84ff]'
                    : 'shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.12)] group-hover:shadow-[0_0_0_2px_var(--c-hairline-strong)]',
                )}
                style={{ background: o.swatch }}
              />
              <span className={cx('text-[0.75rem]', active ? 'font-semibold text-ink' : 'font-medium text-ink-3')}>
                {o.label}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-between gap-3 mt-4 pt-3.5 border-t border-[var(--glass-edge)]">
        <span className="text-[0.875rem] font-medium">Apariencia</span>
        <div role="radiogroup" aria-label="Apariencia de Estudio" className="flex p-0.5 rounded-full bg-[var(--glass-tint)]">
          {APPEARANCE.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={appearance === o.id}
              title={o.title}
              onClick={() => {
                haptic()
                onAppearance(o.id)
              }}
              className={cx(
                'h-7 px-3 rounded-full text-[0.75rem] font-semibold transition-colors',
                appearance === o.id ? 'bg-surface text-ink shadow-[0_1px_3px_rgb(0_0_0/0.15)]' : 'text-ink-3',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3.5 border-t border-[var(--glass-edge)]">
        <span className="text-[0.875rem] font-medium">Nombres de lugares</span>
        <Switch checked={labels} onChange={onLabels} label="Nombres de lugares" />
      </div>
    </>
  )
}

/** Sonido: ambientes, volumen y pantalla encendida. */
function SoundPanel({
  sound,
  volume,
  keepAwake,
  lockCard,
  onSound,
  onVolume,
  onKeepAwake,
  onLockCard,
}: {
  sound: SoundId | 'ninguno'
  volume: number
  keepAwake: boolean
  lockCard: boolean
  onSound: (id: SoundId | 'ninguno') => void
  onVolume: (v: number) => void
  onKeepAwake: (on: boolean) => void
  onLockCard: (on: boolean) => void
}) {
  const loading = useSyncExternalStore(subscribeSound, loadingSound, () => null)
  return (
    <>
      <p className="text-[0.9375rem] font-semibold mb-3">Sonido de fondo</p>
      {/* Rejilla de iconos, como el Centro de control: icono arriba,
          nombre debajo. El activo, en azul y con barritas que se mueven. */}
      <div className="grid grid-cols-4 gap-x-2 gap-y-3">
        {[...SOUNDS, { id: 'ninguno' as const, label: 'Silencio' }].map((s) => {
          const active = sound === s.id
          const Icon = SOUND_ICONS[s.id]
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={active}
              aria-label={s.label}
              onClick={() => {
                haptic()
                onSound(active && s.id !== 'ninguno' ? 'ninguno' : s.id)
              }}
              className="group flex flex-col items-center gap-1.5"
            >
              <span
                className={cx(
                  'pressable relative grid place-items-center size-[3.75rem] rounded-[18px] transition-colors duration-200',
                  active
                    ? s.id === 'ninguno'
                      ? 'bg-ink text-canvas'
                      : 'bg-[#0a84ff] text-white shadow-[0_6px_16px_rgb(10_132_255/0.35)]'
                    : 'bg-[var(--glass-tint)] text-ink-2 group-hover:text-ink',
                )}
              >
                <Icon
                  className={cx('size-6', loading === s.id && 'animate-[pulse-soft_1.2s_ease-in-out_infinite]')}
                  strokeWidth={2}
                />
                {active && s.id !== 'ninguno' && loading !== s.id && (
                  <span className="absolute top-1.5 right-2">
                    <SoundBars />
                  </span>
                )}
              </span>
              <span
                className={cx(
                  'text-[0.6875rem] leading-tight text-center',
                  active ? 'font-semibold text-ink' : 'font-medium text-ink-3',
                )}
              >
                {s.label}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <Volume1 className="size-4 text-ink-3 shrink-0" strokeWidth={2.2} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          aria-label="Volumen"
          onChange={(e) => onVolume(Number(e.target.value))}
          className="study-range"
          style={{ '--fill': `${volume * 100}%` } as React.CSSProperties}
        />
        <Volume2 className="size-4 text-ink-3 shrink-0" strokeWidth={2.2} />
      </div>

      <div className="flex items-center justify-between mt-3 pt-3.5 border-t border-[var(--glass-edge)]">
        <span className="min-w-0">
          <span className="block text-[0.875rem] font-medium">Pantalla siempre encendida</span>
          <span className="block text-[0.75rem] text-ink-3">Durante el vuelo</span>
        </span>
        <Switch checked={keepAwake} onChange={onKeepAwake} label="Pantalla siempre encendida" />
      </div>

      {sound === 'ninguno' && (
        <div className="flex items-center justify-between gap-3 mt-3 pt-3.5 border-t border-[var(--glass-edge)]">
          <span className="min-w-0">
            <span className="block text-[0.875rem] font-medium">Vuelo en la pantalla de bloqueo</span>
            <span className="block text-[0.75rem] text-ink-3 leading-snug">
              Reproduce un audio mudo: pausa la música de otras apps
            </span>
          </span>
          <Switch checked={lockCard} onChange={onLockCard} label="Vuelo en la pantalla de bloqueo" />
        </div>
      )}

      <details className="group/cred mt-3 text-[0.6875rem] text-ink-3">
        <summary className="cursor-pointer list-none select-none hover:text-ink-2 transition-colors">
          Grabaciones reales de dominio público ·{' '}
          <span className="underline underline-offset-2">Créditos</span>
        </summary>
        <ul className="mt-2 space-y-0.5 leading-snug">
          {SOUND_CREDITS.map((c) => (
            <li key={c.id}>
              {c.what} — <span className="text-ink-2">{c.author}</span>
            </li>
          ))}
          <li>
            Megafonía: {CHIME_CREDIT.what} — <span className="text-ink-2">{CHIME_CREDIT.author}</span>
          </li>
          <li className="pt-1">Vía radio aporee y Internet Archive.</li>
        </ul>
      </details>
    </>
  )
}

const SOUND_ICONS: Record<SoundId | 'ninguno', typeof Plane> = {
  cabina: Plane,
  lluvia: CloudRain,
  tormenta: CloudLightning,
  olas: Waves,
  viento: Wind,
  chimenea: Flame,
  marron: AudioWaveform,
  ninguno: VolumeX,
}

/** Tres barritas que se mueven: suena. */
function SoundBars() {
  return (
    <span aria-hidden className="flex items-end gap-[1.5px] h-2.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="sound-bar w-[2px] rounded-full bg-current"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Barra derecha (en todas las etapas con mapa)
// ---------------------------------------------------------------------------

export function MapToolbar({
  map,
  mapVisible,
  onToggleMap,
  labels,
  globe,
  sound,
  volume,
  keepAwake,
  onMap,
  onLabels,
  onGlobe,
  onSound,
  onVolume,
  onKeepAwake,
  lockCard,
  onLockCard,
  appearance,
  onAppearance,
  flight,
}: {
  appearance: StudyAppearance
  onAppearance: (value: StudyAppearance) => void
  map: MapKind
  mapVisible: boolean
  onToggleMap: () => void
  labels: boolean
  globe: boolean
  sound: SoundId | 'ninguno'
  volume: number
  keepAwake: boolean
  onMap: (kind: MapKind) => void
  onLabels: (on: boolean) => void
  onGlobe: (on: boolean) => void
  onSound: (id: SoundId | 'ninguno') => void
  onVolume: (v: number) => void
  onKeepAwake: (on: boolean) => void
  lockCard: boolean
  onLockCard: (on: boolean) => void
  flight?: { following: boolean; onFollow: () => void; onOverview: () => void }
}) {
  const [open, setOpen] = useState<'mapa' | 'sonido' | null>(null)
  const root = useRef<HTMLDivElement>(null)

  // Tocar fuera cierra el panel abierto.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <motion.div
      ref={root}
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...spring.smooth, delay: 0.3 }}
      className="study-map-toolbar absolute z-20 right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] flex items-start gap-3"
    >
      <div className="relative">
        <AnimatePresence>
          {open === 'mapa' && (
            <Popover key="mapa" className="w-[300px]">
              <MapStylePanel
                map={map}
                labels={labels}
                globe={globe}
                onMap={onMap}
                onLabels={onLabels}
                onGlobe={onGlobe}
                appearance={appearance}
                onAppearance={onAppearance}
              />
            </Popover>
          )}
          {open === 'sonido' && (
            <Popover key="sonido" className="w-[320px]">
              <SoundPanel
                sound={sound}
                volume={volume}
                keepAwake={keepAwake}
                lockCard={lockCard}
                onSound={onSound}
                onVolume={onVolume}
                onKeepAwake={onKeepAwake}
                onLockCard={onLockCard}
              />
            </Popover>
          )}
        </AnimatePresence>
      </div>

      <div className="study-map-buttons liquid rounded-full flex p-0.5">
        {flight && (
          <>
            <RoundButton label="Seguir al avión" onClick={flight.onFollow} active={flight.following}>
              <LocateFixed className="size-[19px]" strokeWidth={2.2} />
            </RoundButton>
            <RoundButton label="Ver la ruta entera" onClick={flight.onOverview}>
              <Route className="size-[19px]" strokeWidth={2.2} />
            </RoundButton>
          </>
        )}
        <RoundButton
          label={mapVisible ? 'Ocultar mapa y concentrarse' : 'Mostrar mapa'}
          onClick={() => {
            setOpen(null)
            onToggleMap()
          }}
          active={!mapVisible}
        >
          {mapVisible ? <MapPin className="size-[19px]" /> : <MapPinOff className="size-[19px]" />}
        </RoundButton>
        {mapVisible && <RoundButton
          label="Estilo del mapa"
          expanded={open === 'mapa'}
          onClick={() => setOpen(open === 'mapa' ? null : 'mapa')}
        >
          <Layers className="size-[19px]" strokeWidth={2.2} />
        </RoundButton>}
        <RoundButton
          label="Sonido"
          expanded={open === 'sonido'}
          active={sound !== 'ninguno'}
          onClick={() => setOpen(open === 'sonido' ? null : 'sonido')}
        >
          {sound === 'ninguno' ? (
            <VolumeX className="size-[19px]" strokeWidth={2.2} />
          ) : (
            <Volume2 className="size-[19px]" strokeWidth={2.2} />
          )}
        </RoundButton>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Vuelo
// ---------------------------------------------------------------------------

function BigTime({ ms }: { ms: number }) {
  const total = Math.ceil(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = String(Math.floor(total / 60) % 60).padStart(2, '0')
  const seconds = String(total % 60).padStart(2, '0')
  return <span className="study-clock numeral" role="timer">{hours ? `${hours}:` : ''}{minutes}:{seconds}</span>
}

export function FlightHud({
  session,
  subject,
  task,
  exam,
  layoverCity,
  layoverMarks,
  breakMinutes,
  remainingMs,
  remainingKm,
  progress,
  onExit,
  onPause,
  onBreak,
  onAbandon,
  ready = true,
}: {
  /**
   * El globo ya está pintado (o no hay mapa). El HUD espera a esto para
   * entrar: así el reloj y la ruta aparecen sobre el mapa, no sobre el vacío.
   */
  ready?: boolean
  session: FocusSession
  subject?: Subject
  task?: Task
  exam?: Exam
  layoverCity?: string
  /** Escalas programadas que quedan, como fracción del vuelo. */
  layoverMarks: number[]
  /** Minutos del descanso que se pide a mano. */
  breakMinutes: number
  remainingMs: number
  remainingKm: number
  progress: number
  onExit: () => void
  onPause: () => void
  onBreak: () => void
  onAbandon: () => void
}) {
  const paused = !!session.pausedAt
  const layoverPending = layoverMarks.length > 0
  const [confirmAbandon, setConfirmAbandon] = useState(false)

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
        transition={{ ...spring.smooth, delay: ready ? 0.05 : 0 }}
        className="absolute z-10 left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))]"
      >
        <div className="liquid rounded-full">
          <RoundButton label="Salir (el vuelo sigue en el aire)" onClick={onExit}>
            <ChevronLeft className="size-5" strokeWidth={2.4} />
          </RoundButton>
        </div>
      </motion.div>

      {/* La ruta y lo que se estudia. */}
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.96 }}
        animate={ready ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -10, scale: 0.96 }}
        transition={{ ...spring.smooth, delay: ready ? 0.12 : 0 }}
        className="study-flight-route absolute z-10"
      >
        <div className="liquid rounded-full flex items-center gap-2 h-12 pl-4 pr-2">
          <span className="relative z-[2] flex items-center gap-2 font-mono text-[0.9375rem] font-bold shrink-0">
            {session.from}
            <Plane className="size-3.5 rotate-45 text-ink-3" strokeWidth={2.4} />
            {session.to}
          </span>
          <span
            className="relative z-[2] inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[0.8125rem] font-semibold min-w-0"
            style={
              subject
                ? { background: quietVar(subject.color), color: colorVar(subject.color) }
                : { background: 'var(--c-fill)', color: 'var(--c-ink-2)' }
            }
          >
            <span className="truncate">{subject ? subject.name : 'Estudio libre'}</span>
          </span>
        </div>
      </motion.div>

      {/* Abajo: el estado del vuelo. */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
        transition={{ ...spring.smooth, delay: ready ? 0.2 : 0 }}
        className="study-flight-hud absolute z-10"
      >
        <div className="study-flight-card liquid rounded-[30px] overflow-hidden">
          <div className="relative z-[2] h-[3px] bg-[var(--glass-tint)]">
            <motion.div
              className="h-full bg-[#0a84ff]"
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 1, ease: 'linear' }}
            />
            {layoverMarks.map((at) => (
              <span
                key={at}
                aria-hidden
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-2 rounded-full bg-[#ff9f0a] ring-2 ring-[var(--c-surface)]"
                style={{ left: `${at * 100}%` }}
              />
            ))}
          </div>
          <div className="study-flight-grid relative z-[2] grid items-center">
            <div className="study-flight-clock">
              <p className="text-sm font-medium text-ink-3 mb-1.5">
                {session.layoverAt && session.pausedAt === session.layoverAt
                  ? 'En escala'
                  : paused
                    ? 'En pausa'
                    : 'Tiempo restante'}
              </p>
              <BigTime ms={remainingMs} />
              {(task || exam) && <p className="mt-1 text-sm text-ink-2 break-words">{task?.title ?? exam?.title}</p>}
            </div>

            <div className="study-flight-actions flex items-center justify-center gap-3">
              <button
                type="button"
                aria-label={paused ? 'Reanudar' : 'Pausar'}
                onClick={onPause}
                className="pressable grid place-items-center size-14 rounded-full bg-ink text-canvas shadow-[0_6px_20px_rgb(0_0_0/0.25)]"
              >
                {/* El icono cambia con un pequeño giro de escala, como en Música. */}
                <motion.span
                  key={paused ? 'play' : 'pause'}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={spring.snappy}
                  className="grid place-items-center"
                >
                  {paused ? (
                    <Play className="size-6 translate-x-px" fill="currentColor" strokeWidth={0} />
                  ) : (
                    <Pause className="size-6" fill="currentColor" strokeWidth={0} />
                  )}
                </motion.span>
              </button>
              <button
                type="button"
                aria-label={`Descanso de ${breakMinutes} minutos ahora`}
                title={`Descanso de ${breakMinutes} min ahora`}
                onClick={onBreak}
                disabled={paused}
                className="pressable grid place-items-center size-12 rounded-full bg-[var(--glass-tint)] text-ink-2 disabled:opacity-35"
              >
                <Coffee className="size-5" strokeWidth={2.2} />
              </button>
              <button
                type="button"
                aria-label="Abandonar vuelo"
                onClick={() => setConfirmAbandon(true)}
                className="pressable grid place-items-center size-12 rounded-full bg-[var(--glass-tint)] text-ink-2"
              >
                <X className="size-5" strokeWidth={2.4} />
              </button>
            </div>

            <div className="study-flight-distance">
              <p className="text-[0.75rem] font-medium text-ink-3 mb-1.5">
                {layoverPending && layoverCity
                  ? `${layoverMarks.length > 1 ? `${layoverMarks.length} escalas · ` : ''}próxima en ${layoverCity}`
                  : 'Distancia restante'}
              </p>
              <span className="numeral text-[1.375rem]">
                {/* Los km bajan deslizándose cada segundo, no a saltos. */}
                <CountUp value={Math.round(remainingKm)} format={(v) => Math.round(v ?? 0).toLocaleString('es')} />
                <span className="text-[1rem] font-semibold text-ink-3 ml-1">km</span>
              </span>
            </div>
          </div>
        </div>
      </motion.div>
      <ConfirmDialog
        open={confirmAbandon}
        onCancel={() => setConfirmAbandon(false)}
        title="¿Terminar el vuelo antes de llegar?"
        message="Se guardarán los minutos que ya hayas estudiado."
        confirmLabel="Abandonar vuelo"
        destructive
        onConfirm={() => {
          setConfirmAbandon(false)
          onAbandon()
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Escala
// ---------------------------------------------------------------------------

export function LayoverCard({
  city,
  remainingMs,
  onResume,
}: {
  city?: string
  remainingMs: number
  onResume: () => void
}) {
  const s = Math.ceil(remainingMs / 1000)
  const mm = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.2 } }}
      transition={spring.smooth}
      className="absolute z-20 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(400px,calc(100vw-2rem))]"
    >
      <div className="liquid liquid-thick rounded-[32px] p-7 text-center">
        <div className="relative z-[2] flex flex-col items-center">
          <span
            className="tile grid place-items-center size-12 rounded-[15px] text-white"
            style={{ background: 'linear-gradient(180deg, #e58a00, #b85f00)' }}
          >
            <Coffee className="size-6" strokeWidth={2.2} />
          </span>
          <p className="text-[0.875rem] font-medium text-ink-3 mt-4">
            Escala{city ? ` en ${city}` : ''}
          </p>
          <p className="numeral text-[3.5rem] mt-1">
            {mm}:{ss}
          </p>
          <p className="text-[0.9375rem] text-ink-2 mt-2 leading-relaxed max-w-[18rem]">
            Levántate, estira las piernas y bebe agua. El vuelo sigue solo al terminar, y puedes reanudar cuando quieras.
          </p>
          <Button className="mt-6" onClick={onResume}>
            Seguir volando ya
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Aterrizaje
// ---------------------------------------------------------------------------

export function LandedCard({
  session,
  city,
  subject,
  task,
  isNewCity,
  onCompleteTask,
  onAgain,
  onDone,
}: {
  session: FocusSession
  city: string
  subject?: Subject
  task?: Task
  isNewCity: boolean
  onCompleteTask: () => void
  onAgain: () => void
  onDone: () => void
}) {
  const landedAt = session.endedAt
    ? new Date(session.endedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    : ''
  const taskDone = task?.status === 'completada'

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
      transition={{ ...spring.smooth, delay: 0.5 }}
      className="absolute z-20 left-1/2 -translate-x-1/2 bottom-[max(1.5rem,env(safe-area-inset-bottom))] w-[min(460px,calc(100vw-2rem))]"
    >
      <div className="liquid liquid-thick rounded-[32px] p-6">
        <div className="relative z-[2]">
          <div className="flex items-start justify-between">
            <span
              className="tile grid place-items-center size-12 rounded-[15px] text-white"
              style={{ background: 'linear-gradient(180deg, #0a58c2, #003f8a)' }}
            >
              <PlaneLanding className="size-6" strokeWidth={2.2} />
            </span>
            {isNewCity && (
              <motion.span
                initial={{ scale: 1.6, rotate: -18, opacity: 0 }}
                animate={{ scale: 1, rotate: -8, opacity: 1 }}
                transition={{ ...spring.bouncy, delay: 1.1 }}
                className="grid place-items-center size-16 rounded-full border-[2.5px] border-dashed text-center"
                style={{
                  borderColor: subject ? colorVar(subject.color) : 'var(--c-accent)',
                  color: subject ? colorVar(subject.color) : 'var(--c-accent)',
                }}
              >
                <span>
                  <span className="block font-mono text-[0.875rem] font-black leading-none">{session.to}</span>
                  <span className="block text-[0.5rem] font-bold uppercase tracking-wider mt-0.5">Nuevo sello</span>
                </span>
              </motion.span>
            )}
          </div>
          <h2 className="display text-[1.875rem] leading-tight mt-4">Bienvenido a {city}</h2>
          <p className="text-[0.9375rem] text-ink-3 mt-1">Has aterrizado a las {landedAt}.</p>

          <div className="grid grid-cols-3 gap-2 mt-5">
            <Fact value={formatFlightTime(session.focusedMinutes ?? session.plannedMinutes)} label="Estudiado" />
            <Fact value={`${Math.round(session.distanceKm).toLocaleString('es')} km`} label="Volado" />
            <Fact
              value={subject ? subject.shortName || subject.name : 'Libre'}
              label="Asignatura"
              color={subject ? colorVar(subject.color) : undefined}
            />
          </div>

          {task && (
            <button
              type="button"
              onClick={onCompleteTask}
              disabled={taskDone}
              className="pressable mt-3 w-full flex items-center gap-3 rounded-[18px] bg-[var(--glass-tint)] px-4 py-3 text-left disabled:opacity-100"
            >
              <span
                className={cx(
                  'grid place-items-center size-6 rounded-full border-2 shrink-0 transition-colors',
                  taskDone ? 'bg-[var(--c-switch-on)] border-transparent text-white' : 'border-ink-3/50',
                )}
              >
                {taskDone && <Check className="size-3.5" strokeWidth={3.5} />}
              </span>
              <span className="min-w-0">
                <span className="block text-[0.9375rem] font-semibold truncate">{task.title}</span>
                <span className="block text-[0.75rem] text-ink-3">
                  {taskDone ? 'Tarea completada' : '¿La has terminado? Márcala como hecha'}
                </span>
              </span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-2 mt-5">
            <Button onClick={onDone}>Terminar</Button>
            <Button variant="primary" onClick={onAgain}>
              Seguir volando
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function Fact({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="rounded-[18px] bg-[var(--glass-tint)] px-3.5 py-3 min-w-0">
      <p className="text-[1.0625rem] font-semibold tabular-nums truncate" style={color ? { color } : undefined}>
        {value}
      </p>
      <p className="text-[0.6875rem] font-medium text-ink-3 mt-0.5">{label}</p>
    </div>
  )
}
