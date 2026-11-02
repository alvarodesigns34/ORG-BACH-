import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  CircleCheck,
  Ellipsis,
  Pause,
  Play,
  X,
  Timer as TimerIcon,
  Trash2,
} from 'lucide-react'

import { formatDuration } from '@/domain/dates'
import { colorVar } from '@/domain/palette'
import { studyByDay } from '@/domain/stats'
import {
  createTimer,
  displayMs,
  formatClock,
  isPhaseComplete,
  isRunning,
  minutesToLog,
  nextPhase,
  pause,
  phaseProgress,
  resume,
  type PomodoroConfig,
  type TimerMode,
  type TimerState,
} from '@/domain/study'
import { useDispatch, useSettings, useToday } from '@/state/StoreProvider'
import { useStore } from '@/state/StoreProvider'
import { useStudyStats, useSubjectMap, useSubjects } from '@/state/selectors'
import * as storage from '@/storage/persistence'
import { Page, PageHeader } from '@/layout/AppShell'
import { ColumnChart, type Column } from '@/ui/charts'
import { Input, Select } from '@/ui/fields'
import { Menu } from '@/ui/Menu'
import { ConfirmDialog } from '@/ui/Modal'
import { Button, Card, EmptyState, Numeral, SectionHeader, Segmented, cx } from '@/ui/primitives'

/** Cada cuánto se repinta. El tiempo sale del reloj, no de este intervalo. */
const TICK_MS = 500

export function StudyView() {
  const settings = useSettings()
  const dispatch = useDispatch()
  const today = useToday()
  const { data } = useStore()
  const subjects = useSubjects()
  const subjectMap = useSubjectMap()
  const stats = useStudyStats()

  const config: PomodoroConfig = {
    workMinutes: settings.pomodoroMinutes,
    breakMinutes: settings.pomodoroBreakMinutes,
  }

  // El temporizador se recupera del almacenamiento: recargar sin querer a los
  // cuarenta minutos no debe perder la sesión.
  const [timer, setTimer] = useState<TimerState | null>(() => storage.loadTimer())
  const [now, setNow] = useState(() => Date.now())
  const [mode, setMode] = useState<TimerMode>('pomodoro')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [timerNotice, setTimerNotice] = useState<string | null>(null)
  const [subjectId, setSubjectId] = useState('')
  const [topic, setTopic] = useState('')

  // Persistir cada cambio del temporizador.
  useEffect(() => {
    const result = storage.saveTimer(timer)
    if (!result.ok) setTimerNotice(result.error)
  }, [timer])

  useEffect(() => {
    const onCleared = () => setTimer(null)
    window.addEventListener(storage.TIMER_CLEARED_EVENT, onCleared)
    return () => window.removeEventListener(storage.TIMER_CLEARED_EVENT, onCleared)
  }, [])

  // Si se borra la asignatura de la sesión, no se puede registrar contra ella.
  useEffect(() => {
    if (!timer?.subjectId) return
    if (!data.subjects.some((s) => s.id === timer.subjectId)) {
      setTimer({ ...timer, subjectId: undefined })
    }
  }, [data.subjects, timer])

  // Un portátil cerrado toda la noche no puede convertirse en 8 h de estudio.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'hidden') return
      setTimer((current) => (current && isRunning(current) ? pause(current) : current))
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Repintado: solo mientras corre, para no despertar la pestaña sin motivo.
  useEffect(() => {
    if (!timer || !isRunning(timer)) return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [timer])

  const complete = timer ? isPhaseComplete(timer, config, now) : false

  // --- Aviso al terminar un tramo ---
  const announced = useRef(false)
  useEffect(() => {
    if (!timer || timer.mode !== 'pomodoro') return
    if (complete && !announced.current) {
      announced.current = true
      if (settings.pomodoroSound) beep()
    }
    if (!complete) announced.current = false
  }, [complete, timer, settings.pomodoroSound])

  // El título de la pestaña lleva la cuenta atrás: se estudia con la app de
  // fondo, y si no, hay que volver a ella para saber cuánto queda.
  useEffect(() => {
    if (!timer) {
      document.title = 'Bachillerato OS'
      return
    }
    const clock = formatClock(displayMs(timer, config, now))
    const icon = timer.phase === 'trabajo' ? '📖' : '☕'
    document.title = complete ? `¡Listo! · Bachillerato OS` : `${icon} ${clock} · Bachillerato OS`
    return () => {
      document.title = 'Bachillerato OS'
    }
  }, [timer, now, config, complete])

  const start = () => {
    warmupAudio()
    setTimer(createTimer(mode, subjectId || undefined, topic.trim() || undefined))
    setNow(Date.now())
  }

  const finish = useCallback(() => {
    if (!timer) return
    const minutes = minutesToLog(timer, config, Date.now())
    if (minutes > 0) {
      dispatch({
        type: 'session/add',
        session: {
          subjectId: timer.subjectId,
          topic: timer.topic,
          startedAt: new Date(timer.sessionStartedAt).toISOString(),
          minutes,
          mode: timer.mode,
        },
      })
    }
    setTimer(null)
    setTopic('')
    setConfirmDiscard(false)
  }, [timer, config, dispatch])

  const requestFinish = useCallback(() => {
    if (!timer) return
    const minutes = minutesToLog(timer, config, Date.now())
    if (minutes <= 0) {
      setConfirmDiscard(true)
      return
    }
    finish()
  }, [timer, config, finish])

  const sessions = [...data.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const lastTwoWeeks = studyByDay(data.sessions, today, 14)

  const columns: Column[] = lastTwoWeeks.map((day) => {
    const date = new Date(`${day.day}T00:00:00`)
    return {
      label: date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }),
      shortLabel: date.getDate() === 1 || day.day === today ? String(date.getDate()) : '',
      value: day.minutes,
      formatted: day.minutes === 0 ? 'Sin estudiar' : formatDuration(day.minutes),
      highlight: day.day === today,
    }
  })

  return (
    <Page>
      <PageHeader
        title="Estudio"
        subtitle={
          stats.totalMinutes > 0
            ? `${formatDuration(stats.totalMinutes)} registrados en total`
            : 'Registra tus sesiones para saber cuánto dedicas a cada asignatura.'
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
        {/* --- Temporizador --- */}
        <div className="lg:col-span-5">
          <Card className="lg:sticky lg:top-6">
            {timerNotice && (
              <p
                role="status"
                className="text-[0.8125rem] text-danger bg-danger-quiet rounded-sm px-3 py-2 mb-4"
              >
                {timerNotice}
              </p>
            )}
            {timer ? (
              <RunningTimer
                timer={timer}
                config={config}
                now={now}
                complete={complete}
                subjectName={timer.subjectId ? subjectMap.get(timer.subjectId)?.name : undefined}
                subjectColor={timer.subjectId ? subjectMap.get(timer.subjectId)?.color : undefined}
                onPause={() => setTimer(pause(timer))}
                onResume={() => {
                  setTimer(resume(timer))
                  setNow(Date.now())
                }}
                onNextPhase={() => {
                  setTimer(nextPhase(timer, config))
                  setNow(Date.now())
                }}
                onFinish={requestFinish}
              />
            ) : (
              <IdleTimer
                mode={mode}
                onMode={setMode}
                config={config}
                subjectId={subjectId}
                onSubject={setSubjectId}
                subjects={subjects}
                topic={topic}
                onTopic={setTopic}
                onStart={start}
              />
            )}
          </Card>
        </div>

        {/* --- Cifras y gráfico --- */}
        <div className="lg:col-span-7 flex flex-col gap-5 lg:gap-6">
          <div className="card overflow-hidden">
            <dl className="grid grid-cols-3 divide-x divide-hairline">
              {[
                { label: 'Hoy', value: stats.todayMinutes },
                { label: 'Esta semana', value: stats.weekMinutes },
                { label: 'Este mes', value: stats.monthMinutes },
              ].map((item) => (
                <div key={item.label} className="px-4 sm:px-5 py-4 sm:py-5">
                  <dt className="eyebrow whitespace-nowrap">{item.label}</dt>
                  <dd className="mt-2">
                    <Numeral
                      value={item.value === 0 ? '—' : formatDuration(item.value)}
                      size="sm"
                    />
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <Card>
            <SectionHeader
              title="Últimas dos semanas"
              hint={
                stats.totalMinutes === 0
                  ? 'Aún no hay sesiones registradas.'
                  : 'Pasa el cursor por una columna para ver el detalle.'
              }
              className="mb-4"
            />
            <ColumnChart columns={columns} title="Minutos estudiados cada día" />
          </Card>

          <Card flush className="overflow-hidden">
            <SectionHeader
              title="Sesiones"
              hint={sessions.length > 0 ? `${sessions.length} registradas` : undefined}
              className="px-5 sm:px-6 pt-5 pb-4 border-b border-hairline"
            />
            {sessions.length === 0 ? (
              <EmptyState
                compact
                icon={<TimerIcon className="size-4" />}
                title="Ninguna sesión todavía"
                description="Arranca el temporizador y, al terminar, la sesión aparecerá aquí con su asignatura y su duración."
              />
            ) : (
              <ul className="max-h-[26rem] overflow-y-auto">
                {sessions.slice(0, 40).map((session) => {
                  const subject = session.subjectId ? subjectMap.get(session.subjectId) : undefined
                  const started = new Date(session.startedAt)
                  return (
                    <li
                      key={session.id}
                      className="group flex items-center gap-3 px-5 sm:px-6 py-3 border-b border-hairline last:border-b-0"
                    >
                      <span
                        aria-hidden
                        className="size-2 rounded-full shrink-0"
                        style={{
                          background: subject ? colorVar(subject.color) : 'var(--c-ink-3)',
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.875rem] text-ink truncate">
                          {subject?.name ?? 'Sin asignatura'}
                          {session.topic && <span className="text-ink-3"> · {session.topic}</span>}
                        </p>
                        <p className="text-[0.6875rem] text-ink-3 mt-0.5 tabular-nums">
                          {started.toLocaleDateString('es-ES', {
                            day: 'numeric',
                            month: 'short',
                          })}
                          {' · '}
                          {started.toLocaleTimeString('es-ES', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {session.mode === 'pomodoro' && ' · pomodoro'}
                        </p>
                      </div>
                      <span className="text-[0.875rem] font-semibold text-ink tabular-nums shrink-0">
                        {formatDuration(session.minutes)}
                      </span>
                      <Menu
                        label="Acciones de la sesión"
                        items={[
                          {
                            id: 'borrar',
                            label: 'Eliminar sesión',
                            icon: <Trash2 className="size-3.5" />,
                            destructive: true,
                            onSelect: () => setPendingDelete(session.id),
                          },
                        ]}
                        trigger={({ onClick, ref, ...aria }) => (
                          <button
                            ref={ref}
                            type="button"
                            onClick={onClick}
                            aria-haspopup="menu"
                            aria-label="Acciones de la sesión"
                            {...aria}
                            className={cx(
                              'size-7 grid place-items-center rounded-sm text-ink-3 shrink-0',
                              'hover:bg-sunken hover:text-ink transition-colors duration-150',
                              'opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100',
                              'aria-expanded:opacity-100',
                            )}
                          >
                            <Ellipsis className="size-3.5" />
                          </button>
                        )}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={finish}
        title="Terminar sin guardar"
        message="No hay minutos de trabajo que registrar. Se cierra el temporizador y se pierde el tramo en curso."
        confirmLabel="Cerrar igual"
        destructive
      />
      <ConfirmDialog
        open={!!pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) dispatch({ type: 'session/remove', id: pendingDelete })
          setPendingDelete(null)
        }}
        title="Eliminar sesión"
        message="La sesión se borrará y dejará de contar en tus horas de estudio. No se puede deshacer."
        confirmLabel="Eliminar"
        destructive
      />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Temporizador parado
// ---------------------------------------------------------------------------

function IdleTimer({
  mode,
  onMode,
  config,
  subjectId,
  onSubject,
  subjects,
  topic,
  onTopic,
  onStart,
}: {
  mode: TimerMode
  onMode: (mode: TimerMode) => void
  config: PomodoroConfig
  subjectId: string
  onSubject: (id: string) => void
  subjects: { id: string; name: string }[]
  topic: string
  onTopic: (topic: string) => void
  onStart: () => void
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <Segmented
        label="Modo del temporizador"
        value={mode}
        onChange={onMode}
        options={[
          { value: 'pomodoro' as TimerMode, label: 'Pomodoro' },
          { value: 'libre' as TimerMode, label: 'Libre' },
        ]}
        className="mb-7"
      />

      <Ring progress={0} phase="trabajo">
        <span className="numeral text-[3.5rem] leading-none font-[600]">
          {mode === 'pomodoro' ? formatClock(config.workMinutes * 60_000) : '00:00'}
        </span>
      </Ring>

      <p className="text-[0.8125rem] text-ink-3 mt-5 max-w-[34ch] text-balance">
        {mode === 'pomodoro'
          ? `${config.workMinutes} minutos de trabajo y ${config.breakMinutes} de descanso. Puedes cambiar las duraciones en Ajustes.`
          : 'El cronómetro corre hacia arriba hasta que lo pares.'}
      </p>

      <div className="w-full flex flex-col gap-3 mt-7">
        <Select
          aria-label="Asignatura de la sesión"
          value={subjectId}
          onChange={(e) => onSubject(e.target.value)}
        >
          <option value="">Sin asignatura</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>

        <Input
          value={topic}
          aria-label="Tema que vas a estudiar"
          placeholder="¿Qué vas a estudiar? (opcional)"
          onChange={(e) => onTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onStart()}
        />

        <Button variant="primary" size="lg" block onClick={onStart}>
          <Play className="size-4" />
          Empezar
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Temporizador en marcha
// ---------------------------------------------------------------------------

function RunningTimer({
  timer,
  config,
  now,
  complete,
  subjectName,
  subjectColor,
  onPause,
  onResume,
  onNextPhase,
  onFinish,
}: {
  timer: TimerState
  config: PomodoroConfig
  now: number
  complete: boolean
  subjectName?: string
  subjectColor?: import('@/domain/types').SubjectColor
  onPause: () => void
  onResume: () => void
  onNextPhase: () => void
  onFinish: () => void
}) {
  const running = isRunning(timer)
  const working = timer.phase === 'trabajo'
  const logged = minutesToLog(timer, config, now)

  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex items-center gap-2 mb-6 min-h-6">
        {subjectName && (
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: subjectColor ? colorVar(subjectColor) : 'var(--c-ink-3)' }}
          />
        )}
        <p className="text-[0.8125rem] font-medium text-ink truncate max-w-[26ch]">
          {subjectName ?? 'Sin asignatura'}
          {timer.topic && <span className="text-ink-3"> · {timer.topic}</span>}
        </p>
      </div>

      <Ring progress={phaseProgress(timer, config, now)} phase={timer.phase} paused={!running}>
        <span
          className={cx(
            'numeral text-[3rem] leading-none transition-colors duration-300',
            complete ? 'text-ok' : !running && 'text-ink-3',
          )}
          aria-live={complete ? 'polite' : 'off'}
        >
          {formatClock(displayMs(timer, config, now))}
        </span>
        <span className="eyebrow mt-2">
          {complete ? 'completado' : working ? 'trabajo' : 'descanso'}
        </span>
      </Ring>

      {timer.mode === 'pomodoro' && timer.completed > 0 && (
        <p className="text-[0.75rem] text-ink-3 mt-5 tabular-nums">
          {timer.completed}{' '}
          {timer.completed === 1 ? 'pomodoro completado' : 'pomodoros completados'}
          {logged > 0 && ` · ${formatDuration(logged)} de estudio`}
        </p>
      )}

      <div className="w-full flex flex-col gap-2 mt-7">
        {complete && timer.mode === 'pomodoro' ? (
          <Button variant="primary" size="lg" block onClick={onNextPhase}>
            <Check className="size-4" />
            {working ? 'Empezar descanso' : 'Volver al trabajo'}
          </Button>
        ) : running ? (
          <Button size="lg" block onClick={onPause}>
            <Pause className="size-4" />
            Pausar
          </Button>
        ) : (
          <Button variant="primary" size="lg" block onClick={onResume}>
            <Play className="size-4" />
            Continuar
          </Button>
        )}

        {/* El icono distingue las dos cosas muy distintas que hace este botón
            según lo que lleves: guardar la sesión o descartarla. */}
        <Button variant="ghost" block onClick={onFinish}>
          {logged > 0 ? <CircleCheck className="size-4" /> : <X className="size-4" />}
          {logged > 0 ? `Terminar y guardar ${formatDuration(logged)}` : 'Terminar sin guardar'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Anillo de progreso
// ---------------------------------------------------------------------------

const RING_SIZE = 208
const RING_STROKE = 6
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

function Ring({
  progress,
  phase,
  paused,
  children,
}: {
  progress: number
  phase: 'trabajo' | 'descanso'
  paused?: boolean
  children: React.ReactNode
}) {
  const color = phase === 'trabajo' ? 'var(--c-accent)' : 'var(--c-ok)'

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: RING_SIZE, height: RING_SIZE }}
    >
      <svg width={RING_SIZE} height={RING_SIZE} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="var(--c-sunken)"
          strokeWidth={RING_STROKE}
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - progress)}
          opacity={paused ? 0.4 : 1}
          style={{ transition: 'stroke-dashoffset 500ms linear, opacity 200ms' }}
        />
      </svg>
      <div className="flex flex-col items-center">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aviso sonoro
// ---------------------------------------------------------------------------

/**
 * Dos tonos cortos con la API de audio del navegador.
 *
 * Sin archivo de sonido: un MP3 sería otro recurso que cargar y otra petición,
 * para un pitido de medio segundo. Va envuelto en try/catch porque el
 * navegador puede bloquear el audio si el usuario no ha interactuado todavía.
 */
let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  if (!audioCtx) audioCtx = new Ctx()
  if (audioCtx.state === 'suspended') void audioCtx.resume()
  return audioCtx
}

/** Hay que crear el contexto con un gesto del usuario o el pitido sale silenciado. */
function warmupAudio() {
  getAudioContext()
}

function beep() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    for (const [index, frequency] of [880, 1174.7].entries()) {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      const start = now + index * 0.18
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16)
      oscillator.connect(gain).connect(ctx.destination)
      oscillator.start(start)
      oscillator.stop(start + 0.18)
    }
  } catch {
    // El navegador puede seguir bloqueando el audio.
  }
}
