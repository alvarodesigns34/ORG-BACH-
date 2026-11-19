/**
 * Web de presentación de Órbita.
 *
 * Es la propia app: lo primero que ve quien llega desde el navegador, y desde
 * aquí se entra (sin recargar) a la app. Comparte tokens y materiales con la
 * app (index.css); lo propio de la web está en landing.css. Los textos, en
 * content.ts.
 *
 * Movimiento: solo transform y opacity, una vez por fotograma; todo se queda
 * quieto con «Reducir movimiento». El globo es WebGL y se pausa fuera de
 * pantalla. No se carga MapLibre: el globo real se reserva para la app.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ArrowRight,
  Calculator,
  Check,
  ChevronDown,
  Gift,
  Mic,
  Plane,
  RotateCcw,
  Wifi,
  WifiOff,
} from 'lucide-react'

import { BrandMark } from '@/layout/Brand'
import { DotGlobe, arcPoint, prefersReducedMotion, type ArcSpec } from './globe'
import {
  ASSISTANT_DEMO,
  CLOSING,
  CONTACT_EMAIL,
  CONTACT_READY,
  FAQ,
  FEATURES,
  FLIGHT,
  HERO,
  LEGAL,
  MARQUEE,
  NAV,
  OFFER,
  OFFLINE,
  OWNER,
  PRICES,
  PRICING,
  SEO,
  type Billing,
  type FeatureId,
} from './content'
import './landing.css'

const BASE = import.meta.env.BASE_URL
const at = (i: number) => ({ '--i': i }) as CSSProperties
const euro = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const decimal = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

/** Texto con el correo: enlace solo cuando el correo ya existe. */
function WithEmail({ text }: { text: string }) {
  if (!text.includes(CONTACT_EMAIL)) return <>{text}</>
  const [a, b] = text.split(CONTACT_EMAIL)
  return (
    <>
      {a}
      {CONTACT_READY ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : <span className="lp-placeholder">{CONTACT_EMAIL}</span>}
      {b}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Revelados                                                                  */
/* -------------------------------------------------------------------------- */

/** `true` la primera vez que el elemento entra en pantalla. */
function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null)
  const [inView, setIn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || inView) return
    if (typeof IntersectionObserver === 'undefined') {
      setIn(true)
      return
    }
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setIn(true), {
      threshold,
      rootMargin: '0px 0px -6% 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [inView, threshold])
  return { ref, inView }
}

/** Bloque cuyos hijos `.lp-rv` suben y aparecen, escalonados con `--i`. */
function Reveal({ className = '', children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const { ref, inView } = useInView<HTMLDivElement>(0.16)
  return (
    <div ref={ref} className={`lp-reveal${inView ? ' in' : ''} ${className}`} {...rest}>
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Globo                                                                      */
/* -------------------------------------------------------------------------- */

const MAD = { lat: 40.47, lon: -3.56 }
const HERO_ARCS: ArcSpec[] = [
  { from: MAD, to: { lat: 48.86, lon: 2.35 } },
  { from: MAD, to: { lat: 40.71, lon: -74.0 } },
  { from: { lat: 41.39, lon: 2.17 }, to: { lat: 41.9, lon: 12.5 } },
  { from: { lat: 37.39, lon: -5.98 }, to: { lat: 51.5, lon: -0.12 } },
  { from: MAD, to: { lat: 19.43, lon: -99.13 } },
  { from: { lat: 39.47, lon: -0.38 }, to: { lat: 52.52, lon: 13.4 } },
  { from: MAD, to: { lat: -34.6, lon: -58.38 } },
  { from: { lat: 38.72, lon: -9.14 }, to: { lat: 25.2, lon: 55.27 } },
  { from: { lat: 43.26, lon: -2.93 }, to: { lat: 59.33, lon: 18.07 } },
  { from: MAD, to: { lat: 4.71, lon: -74.07 } },
  { from: { lat: 28.1, lon: -15.43 }, to: MAD },
]

function useGlobe(canvas: React.RefObject<HTMLCanvasElement | null>, make: (c: HTMLCanvasElement) => DotGlobe | null) {
  const globe = useRef<DotGlobe | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const g = make(c)
    globe.current = g
    setReady(!!g)
    return () => {
      g?.dispose()
      globe.current = null
    }
    // Se crea una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { globe, ready }
}

/** Planeta de cristal: cuerpo de CSS; continentes y vuelos en WebGL. */
function Planet({ children }: { children?: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const { globe, ready } = useGlobe(canvas, (c) =>
    DotGlobe.create(c, { arcs: HERO_ARCS, center: { lat: 26, lon: -18 }, spin: 3.2, scale: 0.4 }),
  )
  // Gira un poco más al desplazar la página: el planeta responde a la mano.
  useEffect(() => {
    if (prefersReducedMotion()) return
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        globe.current?.setExtraYaw(-window.scrollY * 0.05)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [globe])
  return (
    <div className={`lp-planet${ready ? ' gl' : ''}`} aria-hidden>
      <svg className="lp-ring lp-ring-back" viewBox="-100 -100 200 200">
        <ellipse cx="0" cy="0" rx="97" ry="29" transform="rotate(-20)" />
      </svg>
      <div className="lp-planet-body" />
      <canvas ref={canvas} className="lp-planet-canvas" />
      <div className="lp-planet-shine" />
      <svg className="lp-ring lp-ring-front" viewBox="-100 -100 200 200">
        <g transform="rotate(-20)">
          <path d="M -97 0 A 97 29 0 0 0 97 0" />
          <circle className="lp-ring-sat" r="2.6" cx="97" cy="0" />
        </g>
      </svg>
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Barra                                                                      */
/* -------------------------------------------------------------------------- */

function NavBar({ onEnter, onSignIn, dark, compact }: { onEnter: () => void; onSignIn: () => void; dark: boolean; compact: boolean }) {
  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    scrollToId(id)
  }
  return (
    <header className={`lp-nav${dark ? ' on-dark' : ''}${compact ? ' compact' : ''}`}>
      <div className="lp-nav-inner">
        <a className="lp-nav-brand" href="#lp-top" onClick={go('lp-top')}>
          <BrandMark size={28} />
          <span>Órbita</span>
        </a>
        <nav className="lp-nav-links" aria-label="Secciones">
          <a href="#precios" onClick={go('precios')}>{NAV.pricing}</a>
          <a href="#preguntas" onClick={go('preguntas')}>{NAV.faq}</a>
          <button type="button" onClick={onSignIn}>{NAV.signIn}</button>
        </nav>
        <button type="button" className="lp-btn lp-btn-primary lp-btn-sm" onClick={onEnter}>
          {NAV.start}
        </button>
      </div>
    </header>
  )
}

/* -------------------------------------------------------------------------- */
/* Portada                                                                    */
/* -------------------------------------------------------------------------- */

const CHIP_ICONS = [Mic, WifiOff, Calculator]

function Hero({ onEnter, onSignIn }: { onEnter: () => void; onSignIn: () => void }) {
  return (
    <section className="lp-hero lp-dark" id="lp-top" aria-labelledby="lp-hero-title">
      <div className="lp-stars" aria-hidden />
      <div className="lp-hero-grid">
        <div className="lp-hero-copy">
          <p className="lp-eyebrow lp-enter" style={at(0)}>{HERO.eyebrow}</p>
          <h1 id="lp-hero-title" className="lp-display">
            {HERO.title.map((line, i) => (
              <span key={line} className="lp-enter" style={at(1 + i)}>{line}</span>
            ))}
          </h1>
          <p className="lp-lead lp-enter" style={at(3)}>{HERO.lead}</p>
          <div className="lp-ctas lp-enter" style={at(4)}>
            <button type="button" className="lp-btn lp-btn-primary lp-btn-lg" onClick={onEnter}>
              {HERO.primary}
              <ArrowRight aria-hidden />
            </button>
            <button type="button" className="lp-btn lp-btn-glass lp-btn-lg" onClick={onSignIn}>
              {HERO.secondary}
            </button>
          </div>
          <ul className="lp-hero-note lp-enter" style={at(5)}>
            {HERO.note.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
        <div className="lp-hero-art lp-enter-pop">
          <Planet />
          {HERO.chips.map((c, i) => {
            const Icon = CHIP_ICONS[i]!
            return (
              <div key={c.title} className={`lp-chip lp-chip-${i + 1}`} aria-hidden>
                <span className="lp-chip-icon"><Icon /></span>
                <span>
                  <b>{c.title}</b>
                  <small>{c.detail}</small>
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <button type="button" className="lp-scroll-cue" onClick={() => scrollToId('funciones')} aria-label="Ver funciones">
        <ChevronDown aria-hidden />
      </button>
    </section>
  )
}

function Marquee() {
  return (
    <div className="lp-marquee" aria-hidden>
      <div className="lp-marquee-track">
        {[0, 1].map((copy) => (
          <div key={copy} className="lp-marquee-set">
            {MARQUEE.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Historia en 4 actos: maquetas vivas de la app                              */
/* -------------------------------------------------------------------------- */

const TASKS = [
  { title: 'Ejercicios 12–18', subject: 'Matemáticas', color: 'var(--sub-sky)', time: '16:00' },
  { title: 'Resumen del tema 4', subject: 'Historia', color: 'var(--sub-terracotta)', time: '17:30' },
  { title: 'Comentario de texto', subject: 'Lengua', color: 'var(--sub-plum)', time: '19:00' },
  { title: 'Vocabulario unidad 6', subject: 'Inglés', color: 'var(--sub-teal)', time: '20:15' },
]

function MockPlan() {
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  return (
    <div className="lp-mock lp-mock-plan">
      <div className="lp-mock-head">
        <small>Martes, 24 de noviembre</small>
        <b>Hoy</b>
      </div>
      <div className="lp-week">
        {days.map((d, i) => (
          <span key={d} className={i === 1 ? 'on' : ''}>
            {d}
            <i style={{ opacity: [0.9, 1, 0.6, 0.9, 0.35, 0, 0][i] }} />
          </span>
        ))}
      </div>
      <div className="lp-exam-pill">
        <span className="lp-exam-ring" aria-hidden>
          <svg viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="16" className="track" />
            <circle cx="20" cy="20" r="16" className="value" pathLength="100" />
          </svg>
          <b>6</b>
        </span>
        <span>
          <b>Examen de Biología</b>
          <small>En 6 días · temas 4–6</small>
        </span>
      </div>
      <ul className="lp-tasks">
        {TASKS.map((t, i) => (
          <li key={t.title} style={at(i)}>
            <span className="lp-check"><Check /></span>
            <span className="lp-task-text">
              <b>{t.title}</b>
              <small><i style={{ background: t.color }} />{t.subject}</small>
            </span>
            <time>{t.time}</time>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Demo del asistente: se teclea la petición, aparecen las dos tarjetas en la
 * semana y, al final, «Deshacer» las retira. Se repite mientras se ve.
 */
function MockAssistant({ on }: { on: boolean }) {
  const [phase, setPhase] = useState(0) // 0 vacío · 1 tecleando · 2 respuesta · 3 tarjetas · 4 deshecho
  const [typed, setTyped] = useState(0)
  const reduced = prefersReducedMotion()
  useEffect(() => {
    if (!on) return
    if (reduced) {
      setTyped(ASSISTANT_DEMO.prompt.length)
      setPhase(3)
      return
    }
    let alive = true
    const timers: number[] = []
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => alive && fn(), ms))
    const run = () => {
      setPhase(1)
      setTyped(0)
      const n = ASSISTANT_DEMO.prompt.length
      for (let i = 1; i <= n; i++) later(300 + i * 34, () => setTyped(i))
      const t = 300 + n * 34
      later(t + 500, () => setPhase(2))
      later(t + 1300, () => setPhase(3))
      later(t + 5200, () => setPhase(4))
      later(t + 7000, run)
    }
    run()
    return () => {
      alive = false
      timers.forEach(clearTimeout)
    }
  }, [on, reduced])
  const days = ['L', 'M', 'X', 'J', 'V']
  return (
    <div className={`lp-mock lp-mock-chat phase-${phase}`}>
      <div className="lp-cal">
        {days.map((d, i) => {
          const card = ASSISTANT_DEMO.cards.find((c) => c.day.startsWith(['Lun', 'Mar', 'Mié', 'Jue', 'Vie'][i]!.slice(0, 3)))
          return (
            <div key={d} className="lp-cal-day">
              <small>{d}</small>
              <span className="lp-cal-slot">
                {card && (
                  <span className="lp-cal-card" style={{ '--c': card.color } as CSSProperties}>
                    <b>{card.kind}</b>
                    {card.title.replace(/^(Entrega|Examen) de /, '')}
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <div className="lp-chat-body">
        {phase >= 2 && (
          <div className="lp-bubble bot">
            {ASSISTANT_DEMO.reply}
            {phase === 3 && (
              <span className="lp-undo">
                <RotateCcw aria-hidden />
                Deshacer
              </span>
            )}
            {phase === 4 && <span className="lp-undone">Deshecho</span>}
          </div>
        )}
      </div>
      <div className="lp-composer">
        <span className="lp-composer-text">
          {phase >= 1 ? ASSISTANT_DEMO.prompt.slice(0, typed) : <span className="lp-composer-ph">Pídele algo a Órbita…</span>}
          {phase === 1 && <i className="lp-caret" />}
        </span>
        <span className="lp-composer-mic"><Mic aria-hidden /></span>
      </div>
    </div>
  )
}

function Slider({ label, value, set, min = 0, weight, interactive }: {
  label: string
  value: number
  set: (n: number) => void
  min?: number
  weight?: string
  interactive: boolean
}) {
  return (
    <label className="lp-slider">
      <span>
        {label}
        {weight && <small>{weight}</small>}
      </span>
      <input
        type="range"
        min={min}
        max={10}
        step={0.1}
        value={value}
        tabIndex={interactive ? 0 : -1}
        onChange={(e) => set(Number(e.target.value))}
        style={{ '--v': (value - min) / (10 - min) } as CSSProperties}
      />
      <b className="lp-num">{decimal(value)}</b>
    </label>
  )
}

/** Calculadora de la nota necesaria, de verdad: se puede tocar. */
function MockGrades({ interactive }: { interactive: boolean }) {
  const [first, setFirst] = useState(7.5)
  const [second, setSecond] = useState(6)
  const [target, setTarget] = useState(7)
  // Parciales al 30 % cada uno y examen final al 40 %.
  const need = (target - first * 0.3 - second * 0.3) / 0.4
  const state = need <= 0 ? 'done' : need > 10 ? 'out' : need >= 8 ? 'hard' : 'ok'
  return (
    <div className="lp-mock lp-mock-grades">
      <div className="lp-mock-head">
        <small style={{ color: 'var(--sub-indigo)' }}>Física y Química</small>
        <b>¿Qué nota necesito?</b>
      </div>
      <Slider label="Primer parcial" weight="30 %" value={first} set={setFirst} interactive={interactive} />
      <Slider label="Segundo parcial" weight="30 %" value={second} set={setSecond} interactive={interactive} />
      <Slider label="Quiero sacar" value={target} set={setTarget} min={5} interactive={interactive} />
      <div className={`lp-need ${state}`} aria-live={interactive ? 'polite' : undefined}>
        {state === 'done' ? (
          <span>Ya lo tienes, saques lo que saques en el final.</span>
        ) : state === 'out' ? (
          <span>Con un 10 en el final llegarías a un <b className="lp-num">{decimal(first * 0.3 + second * 0.3 + 4)}</b>.</span>
        ) : (
          <span>
            Necesitas un <b className="lp-num lp-need-n" key={decimal(need)}>{decimal(Math.max(0, need))}</b> en el examen final (40 %).
          </span>
        )}
      </div>
    </div>
  )
}

function MockFlight() {
  return (
    <div className="lp-mock lp-mock-flight">
      <div className="lp-mini-pass">
        <div className="lp-pass-top">
          <span>
            <small>{FLIGHT.from.city}</small>
            <b>{FLIGHT.from.code}</b>
          </span>
          <span className="lp-mini-route" aria-hidden>
            <i />
            <Plane />
          </span>
          <span className="end">
            <small>{FLIGHT.to.city}</small>
            <b>{FLIGHT.to.code}</b>
          </span>
        </div>
        <div className="lp-pass-grid">
          <span><small>Duración</small><b>{FLIGHT.minutes} min</b></span>
          <span><small>Puerta</small><b>{FLIGHT.gate}</b></span>
          <span><small>Asiento</small><b>{FLIGHT.seat}</b></span>
        </div>
      </div>
      <div className="lp-stamps" aria-hidden>
        {['LIS', 'CDG', 'FCO', 'BER'].map((c, i) => (
          <span key={c} style={at(i)}>{c}</span>
        ))}
      </div>
      <small className="lp-mock-foot">Esta semana: 6 h 20 min en vuelo</small>
    </div>
  )
}

function Stage({ id, active, interactive }: { id: FeatureId; active?: boolean; interactive?: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.35)
  const on = active ?? inView
  return (
    <div ref={ref} className={`lp-stage lp-stage-${id}${on ? ' on' : ''}`} aria-hidden={id === 'grades' && interactive ? undefined : true}>
      {id === 'plan' && <MockPlan />}
      {id === 'assistant' && <MockAssistant on={on} />}
      {id === 'grades' && <MockGrades interactive={!!interactive} />}
      {id === 'flight' && <MockFlight />}
    </div>
  )
}

/**
 * En pantallas anchas (iPad en horizontal, ordenador) la maqueta se queda fija
 * a un lado y cambia según el texto que esté en el centro de la pantalla. En
 * el móvil, cada acto con su maqueta debajo.
 */
function Features() {
  const [active, setActive] = useState(0)
  const [wide, setWide] = useState(() => matchMedia('(min-width: 960px)').matches)
  const steps = useRef<(HTMLElement | null)[]>([])
  useEffect(() => {
    const mq = matchMedia('(min-width: 960px)')
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step))
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    steps.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [])
  return (
    <section className="lp-section lp-features" id="funciones" aria-labelledby="lp-features-title">
      <Reveal className="lp-section-head">
        <p className="lp-eyebrow lp-rv">Cómo funciona</p>
        <h2 id="lp-features-title" className="lp-h2 lp-rv" style={at(1)}>
          Deja de repartir tu curso entre la agenda, las notas del móvil y la memoria.
        </h2>
      </Reveal>
      <div className="lp-story">
        {wide && (
          <div className="lp-story-stage" data-active={FEATURES[active]?.id}>
            <div className="lp-story-glow" aria-hidden />
            {FEATURES.map((f, i) => (
              <div key={f.id} className={`lp-story-frame${i === active ? ' active' : ''}`} inert={i !== active}>
                <Stage id={f.id} active={i === active} interactive={i === active} />
              </div>
            ))}
          </div>
        )}
        <div className="lp-story-steps">
          {FEATURES.map((f, i) => (
            <article
              key={f.id}
              className={`lp-step${i === active ? ' active' : ''}`}
              data-step={i}
              ref={(el) => {
                steps.current[i] = el
              }}
            >
              <Reveal>
                <p className="lp-step-n lp-rv">{String(i + 1).padStart(2, '0')}</p>
                <h3 className="lp-h3 lp-rv" style={at(1)}>{f.title}</h3>
                <p className="lp-body lp-rv" style={at(2)}>{f.text}</p>
                {f.note && <p className="lp-small lp-rv" style={at(3)}>{f.note}</p>}
              </Reveal>
              {!wide && (
                <div className={`lp-step-art lp-stage-wrap-${f.id}`}>
                  <Stage id={f.id} interactive />
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Sin conexión: el interruptor de modo avión                                 */
/* -------------------------------------------------------------------------- */

function Offline() {
  const [plane, setPlane] = useState(true)
  const [done, setDone] = useState<Set<number>>(new Set([0]))
  const toggle = (i: number) =>
    setDone((s) => {
      const n = new Set(s)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  return (
    <section className="lp-section" id="sin-conexion" aria-labelledby="lp-offline-title">
      <div className="lp-offline">
        <Reveal className="lp-offline-copy">
          <h2 id="lp-offline-title" className="lp-h2 lp-rv">{OFFLINE.title}</h2>
          <p className="lp-body lp-rv" style={at(1)}>{OFFLINE.lead}</p>
          <ul className="lp-checks">
            {OFFLINE.list.map((t, i) => (
              <li key={t} className="lp-rv" style={at(i + 2)}>
                <Check aria-hidden />
                {t}
              </li>
            ))}
          </ul>
          <a className="lp-link lp-rv" style={at(8)} href={`${BASE}${LEGAL.privacy}`}>
            {OFFLINE.link} <ArrowRight aria-hidden />
          </a>
        </Reveal>
        <Reveal className="lp-offline-demo">
          <div className={`lp-device lp-rv${plane ? ' plane' : ''}`}>
            <div className="lp-device-status">
              <span className="lp-num">9:41</span>
              <span className="lp-device-icons">
                {plane ? <Plane aria-label="Modo avión activado" /> : <Wifi aria-label="Con conexión" />}
              </span>
            </div>
            <button type="button" className="lp-toggle-row" role="switch" aria-checked={plane} onClick={() => setPlane((p) => !p)}>
              <span className="lp-toggle-icon"><Plane aria-hidden /></span>
              <span>Modo avión</span>
              <span className="lp-switch" aria-hidden><i /></span>
            </button>
            <p className="lp-device-label">Hoy · toca para marcar</p>
            <ul className="lp-device-tasks">
              {TASKS.slice(0, 3).map((t, i) => (
                <li key={t.title}>
                  <button type="button" aria-pressed={done.has(i)} onClick={() => toggle(i)}>
                    <span className="lp-check"><Check /></span>
                    <span className="lp-task-text">
                      <b>{t.title}</b>
                      <small><i style={{ background: t.color }} />{t.subject}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="lp-device-foot" aria-live="polite">
              {plane ? 'Sin conexión. Todo sigue funcionando.' : 'Con conexión. Si tienes cuenta, se sincroniza.'}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Vuelos de estudio: el vuelo avanza con el desplazamiento                   */
/* -------------------------------------------------------------------------- */

const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)

/**
 * El globo de los vuelos se ve como un horizonte: un planeta enorme cuyo
 * borde cruza la pantalla, con la ruta encima.
 */
function flightLayout(w: number, h: number) {
  if (w >= 960) {
    const r = Math.max(w * 0.82, h * 1.1)
    return { r, cx: w * 0.47, cy: h * 0.36 + r }
  }
  const r = w * 1.3
  return { r, cx: w / 2, cy: h * 0.2 + r }
}

function FlightShow() {
  const section = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const plane = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const clock = useRef<HTMLElement>(null)
  const bar = useRef<HTMLSpanElement>(null)
  const [reduced] = useState(prefersReducedMotion)
  const route = { from: FLIGHT.from, to: FLIGHT.to }
  const { globe, ready } = useGlobe(canvas, (c) =>
    DotGlobe.create(c, {
      arcs: [route],
      center: { lat: -8, lon: 4 },
      mode: 'progress',
      layout: flightLayout,
    }),
  )

  useEffect(() => {
    const g = globe.current
    const el = section.current
    if (!g || !el) return
    const total = FLIGHT.minutes * 60
    let p = reduced ? 0.62 : 0.02
    let geo = ''
    g.onFrame = () => {
      const { r, cx, cy } = g.geometry()
      const key = `${r.toFixed(1)}:${cx.toFixed(1)}:${cy.toFixed(1)}`
      if (key !== geo && body.current) {
        geo = key
        body.current.style.width = `${2 * r}px`
        body.current.style.left = `${cx}px`
        body.current.style.top = `${cy}px`
      }
      const a = g.project(arcPoint(route.from, route.to, Math.max(0.001, Math.min(0.999, p))))
      const b = g.project(arcPoint(route.from, route.to, Math.min(1, p + 0.01)))
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
      if (plane.current) {
        plane.current.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0) rotate(${ang.toFixed(1)}deg)`
        plane.current.style.opacity = p > 0.985 ? '0' : '1'
      }
      const left = Math.round(total * (1 - p))
      if (clock.current) clock.current.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`
      if (bar.current) bar.current.style.transform = `scaleX(${p.toFixed(4)})`
    }
    g.setProgress(p)
    if (reduced) return
    const pinned = matchMedia('(min-width: 960px)')
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const r = el.getBoundingClientRect()
        const vh = window.innerHeight
        // Con la sección fijada, el vuelo dura lo que su recorrido; sin
        // fijar (móvil), mientras la sección cruza la pantalla.
        const raw = pinned.matches ? -r.top / Math.max(1, r.height - vh) : (vh * 0.75 - r.top) / Math.max(1, r.height * 0.8)
        p = 0.02 + easeInOut(Math.min(1, Math.max(0, raw))) * 0.98
        g.setProgress(p)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
      g.onFrame = undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, reduced])

  return (
    <section ref={section} className={`lp-flight lp-dark${reduced ? ' still' : ''}`} id="vuelos" aria-labelledby="lp-flight-title">
      <div className="lp-flight-pin">
        <Reveal className="lp-flight-copy">
          <p className="lp-eyebrow lp-rv">{FLIGHT.eyebrow}</p>
          <h2 id="lp-flight-title" className="lp-display lp-display-md">
            {FLIGHT.title.map((l, i) => (
              <span key={l} className="lp-rv" style={at(1 + i)}>{l}</span>
            ))}
          </h2>
          <p className="lp-lead lp-rv" style={at(3)}>{FLIGHT.lead}</p>
          <ul className="lp-flight-points">
            {FLIGHT.points.map((pt, i) => (
              <li key={pt.title} className="lp-rv" style={at(4 + i)}>
                <b>{pt.title}</b>
                <span>{pt.text}</span>
              </li>
            ))}
          </ul>
        </Reveal>
        <div className="lp-flight-stage">
          <div className="lp-flight-globe" aria-hidden>
            <div ref={body} className="lp-flight-body" />
            <canvas ref={canvas} />
            <div ref={plane} className="lp-plane"><Plane /></div>
          </div>
          <div
            className="lp-pass"
            role="img"
            aria-label={`Tarjeta de embarque de ejemplo: hoy, ${FLIGHT.from.city} a ${FLIGHT.to.city}, ${FLIGHT.minutes} minutos de estudio`}
          >
            <p className="lp-pass-today" aria-hidden>Hoy</p>
            <div className="lp-pass-top" aria-hidden>
              <span>
                <small>{FLIGHT.from.city}</small>
                <b>{FLIGHT.from.code}</b>
              </span>
              <Plane className="lp-pass-plane" />
              <span className="end">
                <small>{FLIGHT.to.city}</small>
                <b>{FLIGHT.to.code}</b>
              </span>
            </div>
            <div className="lp-pass-progress" aria-hidden><span ref={bar} /></div>
            <div className="lp-pass-grid" aria-hidden>
              <span><small>Queda</small><b ref={clock} className="lp-num">{FLIGHT.minutes}:00</b></span>
              <span><small>Puerta</small><b>{FLIGHT.gate}</b></span>
              <span><small>Asiento</small><b>{FLIGHT.seat}</b></span>
            </div>
            <div className="lp-pass-stub" aria-hidden>
              <span className="lp-barcode" />
              <small>Estudio · {FLIGHT.minutes} min</small>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Precios y oferta                                                           */
/* -------------------------------------------------------------------------- */

function Pricing({ onEnter }: { onEnter: () => void }) {
  const [billing, setBilling] = useState<Billing>('annual')
  const annual = billing === 'annual'
  const saving = Math.round((1 - PRICES.annual / (PRICES.monthly * 12)) * 100)
  return (
    <section className="lp-section" id="precios" aria-labelledby="lp-pricing-title">
      <Reveal className="lp-section-head center">
        <p className="lp-eyebrow lp-rv">Precios</p>
        <h2 id="lp-pricing-title" className="lp-h2 lp-rv" style={at(1)}>{PRICING.title}</h2>
      </Reveal>
      <Reveal className="lp-billing">
        <div className="lp-seg lp-rv" role="radiogroup" aria-label="Periodo de pago" style={{ '--k': annual ? 1 : 0 } as CSSProperties}>
          <span className="lp-seg-thumb" aria-hidden />
          <button type="button" role="radio" aria-checked={!annual} onClick={() => setBilling('monthly')}>Mensual</button>
          <button type="button" role="radio" aria-checked={annual} onClick={() => setBilling('annual')}>
            Anual <span className="lp-save">−{saving} %</span>
          </button>
        </div>
      </Reveal>
      <div className="lp-plans">
        <Reveal className="lp-plan">
          <h3 className="lp-rv">Gratis</h3>
          <p className="lp-price lp-rv" style={at(1)}>
            <b className="lp-num">0 €</b>
            <small>para siempre</small>
          </p>
          <p className="lp-price-alt lp-rv" style={at(1)}>Sin tarjeta y sin cuenta.</p>
          <ul className="lp-checks">
            {PRICING.free.map((f, i) => (
              <li key={f} className="lp-rv" style={at(i + 2)}>
                <Check aria-hidden />
                {f}
              </li>
            ))}
          </ul>
          <button type="button" className="lp-btn lp-btn-quiet lp-btn-block" onClick={onEnter}>
            Empezar gratis
          </button>
        </Reveal>
        <Reveal className="lp-plan lp-plan-premium">
          <h3 className="lp-rv">
            Premium <span className="lp-badge">Más asistente</span>
          </h3>
          <p className="lp-price lp-rv" style={at(1)}>
            <b key={billing} className="lp-price-swap lp-num">{euro(annual ? PRICES.annual : PRICES.monthly)}</b>
            <small>{annual ? '/año' : '/mes'}</small>
          </p>
          <p className="lp-price-alt lp-rv" style={at(1)}>
            {annual ? `${euro(Math.floor((PRICES.annual / 12) * 100) / 100)} al mes, pagando el año` : 'Cancelas cuando quieras'}
          </p>
          <ul className="lp-checks">
            {PRICING.premium.map((f, i) => (
              <li key={f} className="lp-rv" style={at(i + 2)}>
                <Check aria-hidden />
                {f}
              </li>
            ))}
          </ul>
          <p className="lp-quarter lp-rv" style={at(6)}>{PRICING.quarterly}</p>
          <button type="button" className="lp-btn lp-btn-primary lp-btn-block" onClick={onEnter}>
            {PRICING.premiumCta}
            {PRICING.premiumCtaNote && <small>{PRICING.premiumCtaNote}</small>}
          </button>
        </Reveal>
      </div>
      <Offer />
      <p className="lp-fine">{PRICING.fine}</p>
    </section>
  )
}

function Offer() {
  const { ref, inView } = useInView<HTMLDivElement>(0.35)
  return (
    <div ref={ref} className={`lp-offer lp-dark${inView ? ' in' : ''}`} role="group" aria-labelledby="lp-offer-title">
      <div className="lp-stars" aria-hidden />
      <div className="lp-offer-copy">
        <p className="lp-eyebrow"><Gift aria-hidden /> {OFFER.eyebrow}</p>
        <h3 id="lp-offer-title" className="lp-h3">{OFFER.title}</h3>
        <p className="lp-body"><WithEmail text={OFFER.text} /></p>
        <div className="lp-seats">
          {Array.from({ length: OFFER.seats }, (_, i) => (
            <span key={i} style={at(i)} aria-hidden>{i + 1}</span>
          ))}
          <small>{OFFER.seats} plazas, por orden de llegada</small>
        </div>
      </div>
      <div className="lp-ticket" aria-hidden>
        <div className="lp-ticket-shine" />
        <small>Código de lanzamiento</small>
        <b>{OFFER.code}</b>
        <span className="lp-ticket-row">
          <span>Premium</span>
          <span>12 meses</span>
        </span>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Preguntas, cierre y pie                                                    */
/* -------------------------------------------------------------------------- */

function Faq() {
  return (
    <section className="lp-section lp-narrow" id="preguntas" aria-labelledby="lp-faq-title">
      <Reveal className="lp-section-head">
        <h2 id="lp-faq-title" className="lp-h2 lp-rv">Preguntas frecuentes</h2>
      </Reveal>
      <div className="lp-faq">
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>
              {q}
              <ChevronDown aria-hidden />
            </summary>
            <p><WithEmail text={a} /></p>
          </details>
        ))}
      </div>
    </section>
  )
}

function Closing({ onEnter }: { onEnter: () => void }) {
  return (
    <section className="lp-closing lp-dark" aria-labelledby="lp-closing-title">
      <div className="lp-stars" aria-hidden />
      <div className="lp-closing-planet" aria-hidden>
        <div className="lp-planet-body" />
      </div>
      <Reveal className="lp-closing-copy">
        <h2 id="lp-closing-title" className="lp-display lp-display-md">
          {CLOSING.title.map((l, i) => (
            <span key={l} className="lp-rv" style={at(i)}>{l}</span>
          ))}
        </h2>
        <button type="button" className="lp-btn lp-btn-primary lp-btn-lg lp-rv" style={at(2)} onClick={onEnter}>
          {CLOSING.cta}
          <ArrowRight aria-hidden />
        </button>
      </Reveal>
    </section>
  )
}

function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="lp-footer">
      <div className="lp-footer-inner">
        <div className="lp-footer-brand">
          <BrandMark size={22} />
          <span>Órbita</span>
        </div>
        <nav aria-label="Legal y contacto">
          <a href={`${BASE}${LEGAL.privacy}`}>Privacidad</a>
          <a href={`${BASE}${LEGAL.terms}`}>Condiciones</a>
          {CONTACT_READY && <a href={`mailto:${CONTACT_EMAIL}`}>Contacto</a>}
        </nav>
        <small>© {year} {OWNER}</small>
      </div>
    </footer>
  )
}

/* -------------------------------------------------------------------------- */
/* Página                                                                     */
/* -------------------------------------------------------------------------- */

const NIGHT = '#03050b'

export default function Landing({ onEnter, onSignIn, preview }: { onEnter: () => void; onSignIn: () => void; preview?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const [dark, setDark] = useState(true)
  const [compact, setCompact] = useState(false)

  // Mientras se ve la web: título, color de la barra del sistema y fondo del
  // documento (el rebote de Safari arriba enseña el cielo, no el gris).
  useEffect(() => {
    const prevTitle = document.title
    document.title = SEO.title
    const html = document.documentElement
    const prevBg = html.style.background
    html.style.background = NIGHT
    html.classList.add('lp-active')
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const prevMeta = meta?.content
    if (meta) meta.content = NIGHT
    return () => {
      document.title = prevTitle
      html.style.background = prevBg
      html.classList.remove('lp-active')
      if (meta && prevMeta) meta.content = prevMeta
    }
  }, [])

  useEffect(() => {
    const el = root.current
    if (!el) return
    const reduced = prefersReducedMotion()
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const y = window.scrollY
        const vh = window.innerHeight
        if (!reduced) el.style.setProperty('--hero-p', Math.min(1, y / (vh * 0.9)).toFixed(4))
        el.style.setProperty('--page-p', (y / Math.max(1, document.documentElement.scrollHeight - vh)).toFixed(4))
        setCompact(y > 12)
        // La barra se vuelve oscura sobre las secciones oscuras.
        const probe = 32
        setDark(
          [...el.querySelectorAll<HTMLElement>('.lp-hero, .lp-flight, .lp-closing')].some((s) => {
            const r = s.getBoundingClientRect()
            return r.top <= probe && r.bottom >= probe
          }),
        )
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div className="lp" ref={root}>
      <a className="lp-skip" href="#lp-main">Saltar al contenido</a>
      <NavBar onEnter={onEnter} onSignIn={onSignIn} dark={dark} compact={compact} />
      <main id="lp-main">
        <Hero onEnter={onEnter} onSignIn={onSignIn} />
        <Marquee />
        <Features />
        <Offline />
        <FlightShow />
        <Pricing onEnter={onEnter} />
        <Faq />
        <Closing onEnter={onEnter} />
      </main>
      <Footer />
      {preview && (
        <div className="lp-preview-badge" role="note">
          Vista previa · no publicada
        </div>
      )}
      <span className="lp-progress" aria-hidden />
    </div>
  )
}
