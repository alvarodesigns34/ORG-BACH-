/**
 * Web de presentación de Órbita.
 *
 * Es la propia app: lo primero que ve quien llega desde el navegador, y desde
 * aquí se entra (sin recargar) a la app. Los textos, en content.ts; el diseño,
 * en landing.css.
 *
 * Dirección: un aeropuerto de noche. La semana del alumno es un panel de
 * salidas (el gesto de la página), estudiar es volar (modo Estudio) y lo
 * demás se cuenta sobre papel. El desplazamiento dirige la historia: secciones
 * fijadas, una frase que se ilumina, una maqueta de la app que cambia y se
 * rellena con el dedo, un vuelo que avanza.
 *
 * Movimiento: un solo `requestAnimationFrame` para toda la página; solo
 * transform y opacity. Con «Reducir movimiento», todo aparece en su estado
 * final y nada se fija.
 */
import { trackVisit } from './visits'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowRight, Check, Mic, Plane, Plus, RotateCcw, Wifi } from 'lucide-react'

import { BrandMark } from '@/layout/Brand'
import { DotGlobe, arcPoint, prefersReducedMotion } from './globe'
import {
  ASSISTANT_DEMO,
  BOARD,
  BOARD_TITLE,
  CHAPTERS,
  CLOSING,
  CLOSING_BOARD,
  CONTACT_EMAIL,
  CONTACT_READY,
  FAQ,
  FLIGHT,
  HERO,
  LEGAL,
  MANIFESTO,
  NAV,
  OFFER,
  OFFLINE,
  OWNER,
  PRICES,
  PRICING,
  SEO,
  type Billing,
  type BoardStatus,
} from './content'
import './landing.css'

const BASE = import.meta.env.BASE_URL
const at = (i: number) => ({ '--i': i }) as CSSProperties
const euro = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const decimal = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const WIDE = '(min-width: 960px)'

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

/** Texto con el correo: enlace solo cuando el correo ya existe. */
function WithEmail({ text }: { text: string }) {
  if (!CONTACT_READY || !text.includes(CONTACT_EMAIL)) return <>{text}</>
  const [a, b] = text.split(CONTACT_EMAIL)
  return (
    <>
      {a}
      <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      {b}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Un solo bucle de desplazamiento para toda la página                        */
/* -------------------------------------------------------------------------- */

type Tick = () => void
const ticks = new Set<Tick>()
let frame = 0
const schedule = () => {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    ticks.forEach((t) => t())
  })
}

/** Llama a `fn` una vez por fotograma mientras se desplaza o cambia el tamaño. */
function useScrollTick(fn: Tick) {
  const latest = useRef(fn)
  latest.current = fn
  useEffect(() => {
    const tick = () => latest.current()
    ticks.add(tick)
    if (ticks.size === 1) {
      window.addEventListener('scroll', schedule, { passive: true })
      window.addEventListener('resize', schedule)
    }
    schedule()
    return () => {
      ticks.delete(tick)
      if (!ticks.size) {
        window.removeEventListener('scroll', schedule)
        window.removeEventListener('resize', schedule)
      }
    }
  }, [])
}

/** 0 → 1 mientras una sección fijada recorre su altura extra. */
function pinProgress(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  return clamp01(-r.top / Math.max(1, r.height - window.innerHeight))
}

function useMedia(query: string) {
  const [on, setOn] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const f = () => setOn(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [query])
  return on
}

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
      rootMargin: '0px 0px -8% 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [inView, threshold])
  return { ref, inView }
}

/** Bloque cuyos hijos `.lp-rv` aparecen escalonados con `--i` (una vez). */
function Reveal({ as: Tag = 'div', className = '', children, ...rest }: { as?: 'div' | 'header'; className?: string; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  const { ref, inView } = useInView<HTMLDivElement>(0.18)
  return (
    <Tag ref={ref} className={`lp-reveal${inView ? ' in' : ''} ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

/* -------------------------------------------------------------------------- */
/* Panel de salidas (letras que caen como en los paneles de aeropuerto)       */
/* -------------------------------------------------------------------------- */

const FLAP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** Pseudoaleatorio estable: mismas letras de paso en cada fotograma. */
const noise = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Tiempo transcurrido desde que el panel empieza a girar; `null` mientras no
 * ha empezado, `Infinity` cuando ya está quieto (o con «Reducir movimiento»).
 */
function useFlapClock(start: boolean, duration: number) {
  const [t, setT] = useState<number | null>(() => (prefersReducedMotion() ? Infinity : null))
  useEffect(() => {
    if (!start || t === Infinity) return
    const t0 = performance.now()
    const id = window.setInterval(() => {
      const e = performance.now() - t0
      setT(e >= duration ? Infinity : e)
    }, 55)
    return () => clearInterval(id)
    // Solo arranca una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start])
  return t
}

/** Una celda por letra; cada cambio de letra «cae» con una animación corta. */
function Flaps({ text, width, t, delay = 0, seed = 0 }: { text: string; width: number; t: number | null; delay?: number; seed?: number }) {
  const chars = text.padEnd(width, ' ').slice(0, width).split('')
  return (
    <span className="lp-flaps" aria-hidden>
      {chars.map((c, i) => {
        const settle = delay + i * 26 + 260
        let shown = c
        if (t === null) shown = ' '
        else if (t < settle && c !== ' ') shown = t < delay ? ' ' : FLAP_CHARS[Math.floor(noise(Math.floor(t / 55), i + seed * 31) * FLAP_CHARS.length)]!
        return (
          <span className="lp-flap" key={i}>
            <span key={shown} className={t !== null && t !== Infinity ? 'fall' : undefined}>{shown === ' ' ? ' ' : shown}</span>
          </span>
        )
      })}
    </span>
  )
}

const TONE_LABEL: Record<BoardStatus, string> = { ontime: '', boarding: 'Ahora', done: 'Hecho', need: 'Objetivo' }

function DepartureBoard({ start }: { start: boolean }) {
  const t = useFlapClock(start, 2600)
  return (
    <div className="lp-board" role="table" aria-label="Ejemplo: tu semana en Órbita, contada como un panel de salidas">
      <div className="lp-board-head" aria-hidden>
        <span className="lp-board-title"><Plane /> {BOARD_TITLE}</span>
        <span className="lp-board-clock">07:58</span>
      </div>
      <div className="lp-board-cols" aria-hidden>
        <span className="c-day">Día</span>
        <span className="c-time">Hora</span>
        <span className="c-to">Destino</span>
        <span className="c-st">Estado</span>
      </div>
      {BOARD.map((r, i) => (
        <div key={r.to} className={`lp-board-row tone-${r.tone}`} role="row" style={at(i)}>
          <span className="sr-only" role="cell">
            {r.day} {r.time}, {r.to.toLowerCase()}: {r.note}. {r.status.toLowerCase()}
          </span>
          <span className="c-day"><Flaps text={r.day} width={3} t={t} delay={i * 180} seed={i} /></span>
          <span className="c-time"><Flaps text={r.time} width={5} t={t} delay={i * 180 + 60} seed={i + 10} /></span>
          <span className="c-to"><Flaps text={r.to} width={11} t={t} delay={i * 180 + 120} seed={i + 20} /></span>
          <span className="c-st"><Flaps text={r.status} width={13} t={t} delay={i * 180 + 200} seed={i + 30} /></span>
          <span className="lp-board-note" aria-hidden>
            <span className="n-when">{r.day.charAt(0) + r.day.slice(1).toLowerCase()} {r.time} · </span>
            {r.note}<span className="n-gate"> · Puerta {r.gate}</span>
            {TONE_LABEL[r.tone] && <em>{TONE_LABEL[r.tone]}</em>}
          </span>
        </div>
      ))}
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
          <BrandMark size={26} />
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
/* Portada: el panel se endereza y se acerca al desplazar                      */
/* -------------------------------------------------------------------------- */

function Hero({ onEnter, onSignIn }: { onEnter: () => void; onSignIn: () => void }) {
  const section = useRef<HTMLElement>(null)
  const [start, setStart] = useState(false)
  const reduced = prefersReducedMotion()
  useEffect(() => {
    const id = window.setTimeout(() => setStart(true), 650)
    return () => clearTimeout(id)
  }, [])
  useScrollTick(() => {
    const el = section.current
    if (!el || reduced) return
    if (!matchMedia(WIDE).matches) return
    const p = pinProgress(el)
    el.style.setProperty('--p', p.toFixed(4))
    el.dataset.focus = p > 0.5 ? '1' : '0'
  })
  return (
    <section ref={section} className={`lp-hero lp-night${reduced ? ' still' : ''}`} id="lp-top" aria-labelledby="lp-hero-title">
      <div className="lp-hero-pin">
        <svg className="lp-hero-orbit" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden>
          <ellipse cx="560" cy="330" rx="640" ry="190" transform="rotate(-9 560 330)" />
        </svg>
        <div className="lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-kicker lp-enter" style={at(0)}>{HERO.eyebrow}</p>
            <h1 id="lp-hero-title" className="lp-display">
              {HERO.title.map((line, i) => (
                <span key={line} className="lp-line"><span className="lp-enter-line" style={at(i + 1)}>{line}</span></span>
              ))}
            </h1>
            <p className="lp-lead lp-enter" style={at(3)}>{HERO.lead}</p>
            <div className="lp-ctas lp-enter" style={at(4)}>
              <button type="button" className="lp-btn lp-btn-primary lp-btn-lg" onClick={onEnter}>
                {HERO.primary}
                <ArrowRight aria-hidden />
              </button>
              <button type="button" className="lp-textlink" onClick={onSignIn}>
                {HERO.secondary} <span>· {NAV.signIn}</span>
              </button>
            </div>
            <ul className="lp-hero-note lp-enter" style={at(5)}>
              {HERO.note.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
          <div className="lp-hero-board lp-enter-board">
            <DepartureBoard start={start} />
            <p className="lp-hero-caption" aria-hidden>Cada examen y cada entrega, a su hora.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Manifiesto: la frase se ilumina palabra a palabra                          */
/* -------------------------------------------------------------------------- */

function Manifesto() {
  const box = useRef<HTMLDivElement>(null)
  const words = MANIFESTO.split(' ')
  const reduced = prefersReducedMotion()
  useScrollTick(() => {
    const el = box.current
    if (!el) return
    if (reduced) return el.style.setProperty('--p', '1')
    const r = el.getBoundingClientRect()
    const vh = window.innerHeight
    // Empieza cuando el texto llega al 85 % de la pantalla y acaba al 30 %.
    const p = clamp01((vh * 0.85 - r.top) / Math.max(1, r.height + vh * 0.3))
    el.style.setProperty('--p', p.toFixed(4))
  })
  return (
    <section className="lp-paper lp-manifesto" aria-label="Qué es Órbita">
      <div ref={box} className="lp-manifesto-text" style={{ '--n': words.length } as CSSProperties}>
        <p className="lp-kicker">Por qué Órbita</p>
        <p className="lp-big" aria-label={MANIFESTO}>
          {words.map((w, i) => (
            <span key={i} className={/Órbita|hoy\.?$/.test(w) ? 'em' : undefined} style={at(i)} aria-hidden>
              {w}{' '}
            </span>
          ))}
        </p>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Capítulos: una maqueta de la app que cambia y se rellena al desplazar      */
/* -------------------------------------------------------------------------- */

const TASKS = [
  { title: 'Ejercicios 12–18', subject: 'Matemáticas', color: 'var(--sub-sky)', time: '16:00' },
  { title: 'Resumen del tema 4', subject: 'Historia', color: 'var(--sub-terracotta)', time: '17:30' },
  { title: 'Comentario de texto', subject: 'Lengua', color: 'var(--sub-plum)', time: '19:00' },
  { title: 'Vocabulario unidad 6', subject: 'Inglés', color: 'var(--sub-teal)', time: '20:15' },
]

function ScreenToday({ local }: { local: number }) {
  const done = Math.min(TASKS.length, Math.floor(local * 5.2))
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  return (
    <div className="lp-screen">
      <div className="lp-screen-head">
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
            <circle cx="20" cy="20" r="16" className="value" pathLength="100" style={{ strokeDashoffset: 100 - 20 - local * 45 }} />
          </svg>
          <b>3</b>
        </span>
        <span>
          <b>Examen de Biología</b>
          <small>En 3 días · temas 4–6</small>
        </span>
      </div>
      <ul className="lp-tasks">
        {TASKS.map((t, i) => (
          <li key={t.title} className={i < done ? 'done' : ''}>
            <span className="lp-check"><Check /></span>
            <span className="lp-task-text">
              <b>{t.title}</b>
              <small><i style={{ background: t.color }} />{t.subject}</small>
            </span>
            <time>{t.time}</time>
          </li>
        ))}
      </ul>
      <p className="lp-screen-foot lp-num">{done} de {TASKS.length} hechas</p>
    </div>
  )
}

function ScreenAssistant({ local }: { local: number }) {
  const prompt = ASSISTANT_DEMO.prompt
  const typed = Math.round(clamp01(local / 0.5) * prompt.length)
  const replied = local > 0.56
  const placed = local > 0.66
  const days = ['L', 'M', 'X', 'J', 'V']
  const dayKeys = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']
  return (
    <div className={`lp-screen lp-screen-chat${placed ? ' placed' : ''}`}>
      <div className="lp-screen-head">
        <small>Asistente</small>
        <b>Esta semana</b>
      </div>
      <div className="lp-cal">
        {days.map((d, i) => {
          const card = ASSISTANT_DEMO.cards.find((c) => c.day === dayKeys[i]!.slice(0, 3))
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
        {typed > 0 && <div className="lp-bubble me">{prompt.slice(0, typed)}{!replied && typed < prompt.length && <i className="lp-caret" />}</div>}
        {replied && (
          <div className="lp-bubble bot">
            {ASSISTANT_DEMO.reply}
            <span className="lp-undo"><RotateCcw aria-hidden /> Deshacer</span>
          </div>
        )}
      </div>
      <div className="lp-composer">
        <span className="lp-composer-ph">Pídele algo a Órbita…</span>
        <span className={`lp-composer-mic${typed > 0 && !replied ? ' live' : ''}`}><Mic aria-hidden /></span>
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

/** Calculadora de la nota necesaria, de verdad: el desplazamiento la rellena y luego se puede tocar. */
function ScreenGrades({ local, interactive }: { local: number; interactive: boolean }) {
  const [own, setOwn] = useState<{ first: number; second: number; target: number } | null>(null)
  const k = clamp01(local / 0.6)
  const auto = { first: 4 + k * 3.5, second: 3 + k * 3, target: 7 }
  const v = own ?? auto
  const set = (key: 'first' | 'second' | 'target') => (n: number) => setOwn({ ...v, [key]: n })
  // Parciales al 30 % cada uno y examen final al 40 %.
  const need = (v.target - v.first * 0.3 - v.second * 0.3) / 0.4
  const state = need <= 0 ? 'done' : need > 10 ? 'out' : need >= 8 ? 'hard' : 'ok'
  return (
    <div className="lp-screen lp-screen-grades">
      <div className="lp-screen-head">
        <small style={{ color: 'var(--sub-indigo)' }}>Física y Química</small>
        <b>¿Qué nota necesito?</b>
      </div>
      <Slider label="Primer parcial" weight="30 %" value={v.first} set={set('first')} interactive={interactive} />
      <Slider label="Segundo parcial" weight="30 %" value={v.second} set={set('second')} interactive={interactive} />
      <Slider label="Quiero sacar" value={v.target} set={set('target')} min={5} interactive={interactive} />
      <div className={`lp-need ${state}`} aria-live={interactive && own ? 'polite' : undefined}>
        {state === 'done' ? (
          <span>Ya lo tienes, saques lo que saques en el final.</span>
        ) : state === 'out' ? (
          <span>Con un 10 en el final llegarías a un <b className="lp-num">{decimal(v.first * 0.3 + v.second * 0.3 + 4)}</b>.</span>
        ) : (
          <span>
            Necesitas un <b className="lp-num">{decimal(Math.max(0, need))}</b> en el final (40 %).
          </span>
        )}
      </div>
    </div>
  )
}

function Chapters() {
  const section = useRef<HTMLElement>(null)
  const [chapter, setChapter] = useState(0)
  const [local, setLocal] = useState(0)
  const reduced = prefersReducedMotion()
  useScrollTick(() => {
    const el = section.current
    if (!el) return
    const p = pinProgress(el)
    const n = CHAPTERS.length
    const c = Math.min(n - 1, Math.floor(p * n))
    // Cada capítulo se completa en su primer 80 %: el resto se queda quieto
    // para que dé tiempo a leerlo antes de pasar al siguiente.
    const l = reduced ? 1 : clamp01((p * n - c) / 0.8)
    el.style.setProperty('--p', p.toFixed(4))
    for (let i = 0; i < n; i++) el.style.setProperty(`--c${i}`, clamp01(p * n - i).toFixed(4))
    setChapter(c)
    setLocal(Math.round(l * 60) / 60)
  })
  const ch = CHAPTERS[chapter]!
  return (
    <section ref={section} className="lp-paper lp-chapters" id="funciones" aria-labelledby="lp-chapters-title">
      <h2 id="lp-chapters-title" className="sr-only">Cómo funciona</h2>
      <div className="lp-chapters-pin">
        <div className="lp-chapters-grid">
          <div className="lp-chapters-copy">
            <div className="lp-segments" aria-hidden>
              {CHAPTERS.map((c, i) => (
                <span key={c.id} className={i === chapter ? 'on' : ''}>
                  <i style={{ transform: `scaleX(var(--c${i}, 0))` }} />
                  <b>{c.kicker}</b>
                </span>
              ))}
            </div>
            <div className="lp-chapter" key={ch.id} aria-live="polite">
              <p className="lp-kicker lp-num">{String(chapter + 1).padStart(2, '0')} / {String(CHAPTERS.length).padStart(2, '0')}</p>
              <h3 className="lp-h2">{ch.title}</h3>
              <p className="lp-body">{ch.text}</p>
              {'note' in ch && <p className="lp-small">{ch.note}</p>}
            </div>
          </div>
          <div className="lp-device-wrap" data-chapter={chapter}>
            <div className="lp-device">
              <div className="lp-device-island" aria-hidden />
              <div className="lp-device-track" style={{ '--k': chapter } as CSSProperties}>
                <div className="lp-device-page" inert={chapter !== 0} aria-hidden>
                  <ScreenToday local={chapter > 0 ? 1 : local} />
                </div>
                <div className="lp-device-page" inert={chapter !== 1} aria-hidden>
                  <ScreenAssistant local={chapter > 1 ? 1 : chapter < 1 ? 0 : local} />
                </div>
                <div className="lp-device-page" inert={chapter !== 2}>
                  <ScreenGrades local={chapter < 2 ? 0 : local} interactive={chapter === 2} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Vuelos de estudio: el vuelo avanza con el desplazamiento                   */
/* -------------------------------------------------------------------------- */

const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)

/** El globo como horizonte: un planeta enorme cuyo borde cruza la pantalla. */
function flightLayout(w: number, h: number) {
  if (w >= 960) {
    const r = Math.max(w * 0.82, h * 1.1)
    return { r, cx: w * 0.47, cy: h * 0.4 + r }
  }
  const r = w * 1.3
  return { r, cx: w / 2, cy: h * 0.22 + r }
}

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
  const progress = useRef(reduced ? 0.62 : 0.02)

  useEffect(() => {
    const g = globe.current
    if (!g) return
    const total = FLIGHT.minutes * 60
    let geo = ''
    g.onFrame = () => {
      const p = progress.current
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
    g.setProgress(progress.current)
    return () => {
      g.onFrame = undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  useScrollTick(() => {
    const el = section.current
    if (!el) return
    if (reduced) return
    const r = el.getBoundingClientRect()
    const vh = window.innerHeight
    const pinned = matchMedia(WIDE).matches
    // Con la sección fijada, el vuelo dura lo que su recorrido; sin fijar
    // (móvil), mientras la sección cruza la pantalla.
    const raw = pinned ? -r.top / Math.max(1, r.height - vh) : (vh * 0.75 - r.top) / Math.max(1, r.height * 0.8)
    progress.current = 0.02 + easeInOut(clamp01(raw)) * 0.98
    globe.current?.setProgress(progress.current)
  })

  return (
    <section ref={section} className={`lp-flight lp-night${reduced ? ' still' : ''}`} id="vuelos" aria-labelledby="lp-flight-title">
      <div className="lp-flight-pin">
        <Reveal className="lp-flight-copy">
          <p className="lp-kicker lp-rv">{FLIGHT.eyebrow}</p>
          <h2 id="lp-flight-title" className="lp-display lp-display-md">
            {FLIGHT.title.map((l, i) => (
              <span key={l} className="lp-line"><span className="lp-rv-line" style={at(1 + i)}>{l}</span></span>
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
            <div className="lp-pass-main" aria-hidden>
              <p className="lp-pass-today">Tarjeta de embarque · Hoy</p>
              <div className="lp-pass-top">
                <span>
                  <small>{FLIGHT.from.city}</small>
                  <b>{FLIGHT.from.code}</b>
                </span>
                <span className="lp-pass-route"><i /><Plane /></span>
                <span className="end">
                  <small>{FLIGHT.to.city}</small>
                  <b>{FLIGHT.to.code}</b>
                </span>
              </div>
              <div className="lp-pass-progress"><span ref={bar} /></div>
              <div className="lp-pass-grid">
                <span><small>Queda</small><b ref={clock} className="lp-num">{FLIGHT.minutes}:00</b></span>
                <span><small>Puerta</small><b>{FLIGHT.gate}</b></span>
                <span><small>Asiento</small><b>{FLIGHT.seat}</b></span>
              </div>
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
/* Sin conexión: el interruptor está en el propio titular                     */
/* -------------------------------------------------------------------------- */

function Offline() {
  const { ref, inView } = useInView<HTMLDivElement>(0.5)
  const [plane, setPlane] = useState<boolean | null>(null)
  const on = plane ?? inView
  const [done, setDone] = useState<Set<number>>(new Set([0]))
  const toggle = (i: number) =>
    setDone((s) => {
      const n = new Set(s)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  return (
    <section className={`lp-paper lp-offline${on ? ' plane' : ''}`} id="sin-conexion" aria-labelledby="lp-offline-title">
      <div className="lp-wrap">
        <div ref={ref}>
          <Reveal as="header" className="lp-offline-head">
            <p className="lp-kicker lp-rv">Sin conexión</p>
            <h2 id="lp-offline-title" className="lp-display lp-display-md lp-rv" style={at(1)}>
              Funciona en{' '}
              <button type="button" className="lp-inline-switch" role="switch" aria-checked={on} aria-label="Modo avión" onClick={() => setPlane(!on)}>
                <span className="lp-inline-switch-knob"><Plane aria-hidden /></span>
              </button>{' '}
              modo avión.
            </h2>
          </Reveal>
        </div>
        <div className="lp-offline-grid">
          <Reveal className="lp-offline-copy">
            <p className="lp-lead lp-rv">{OFFLINE.lead}</p>
            <ul className="lp-rules">
              {OFFLINE.list.map((t, i) => (
                <li key={t} className="lp-rv" style={at(i + 1)}>{t}</li>
              ))}
            </ul>
            <a className="lp-arrowlink lp-rv" style={at(7)} href={`${BASE}${LEGAL.privacy}`}>
              {OFFLINE.link} <ArrowRight aria-hidden />
            </a>
          </Reveal>
          <Reveal className="lp-offline-demo">
            <div className="lp-phone lp-rv">
              <div className="lp-phone-status">
                <span className="lp-num">9:41</span>
                <span className="lp-phone-icons">{on ? <Plane aria-label="Modo avión activado" /> : <Wifi aria-label="Con conexión" />}</span>
              </div>
              <p className="lp-phone-label">Hoy · toca para marcar</p>
              <ul className="lp-phone-tasks">
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
              <p className="lp-phone-foot" aria-live="polite">
                {on ? 'Sin conexión. Todo sigue funcionando.' : 'Con conexión. Si tienes cuenta, se sincroniza.'}
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Precios: dos billetes y la oferta de lanzamiento                           */
/* -------------------------------------------------------------------------- */

function Pricing({ onEnter }: { onEnter: () => void }) {
  const [billing, setBilling] = useState<Billing>('annual')
  const annual = billing === 'annual'
  const saving = Math.round((1 - PRICES.annual / (PRICES.monthly * 12)) * 100)
  return (
    <section className="lp-paper lp-pricing" id="precios" aria-labelledby="lp-pricing-title">
      <div className="lp-wrap">
        <Reveal as="header" className="lp-head">
          <p className="lp-kicker lp-rv">Precios</p>
          <h2 id="lp-pricing-title" className="lp-h2 lp-rv" style={at(1)}>{PRICING.title}</h2>
        </Reveal>
        <div className="lp-tickets">
          <Reveal className="lp-ticket lp-ticket-free">
            <div className="lp-ticket-main">
              <p className="lp-ticket-class lp-rv">Gratis</p>
              <p className="lp-price lp-rv" style={at(1)}>
                <b className="lp-num">0 €</b>
                <small>para siempre · sin tarjeta y sin cuenta</small>
              </p>
              <ul className="lp-rules">
                {PRICING.free.map((f, i) => (
                  <li key={f} className="lp-rv" style={at(i + 2)}>{f}</li>
                ))}
              </ul>
            </div>
            <div className="lp-ticket-stub">
              <button type="button" className="lp-btn lp-btn-ink lp-btn-block" onClick={onEnter}>
                Empezar gratis
              </button>
            </div>
          </Reveal>
          <Reveal className="lp-ticket lp-ticket-premium lp-night">
            <div className="lp-ticket-main">
              <div className="lp-ticket-top lp-rv">
                <p className="lp-ticket-class">Premium</p>
                <div className="lp-seg" role="radiogroup" aria-label="Periodo de pago" style={{ '--k': annual ? 1 : 0 } as CSSProperties}>
                  <span className="lp-seg-thumb" aria-hidden />
                  <button type="button" role="radio" aria-checked={!annual} onClick={() => setBilling('monthly')}>Mensual</button>
                  <button type="button" role="radio" aria-checked={annual} onClick={() => setBilling('annual')}>
                    Anual <span className="lp-save">−{saving} %</span>
                  </button>
                </div>
              </div>
              <p className="lp-price lp-rv" style={at(1)}>
                <b key={billing} className="lp-price-swap lp-num">{euro(annual ? PRICES.annual : PRICES.monthly)}</b>
                <small>
                  {annual ? `al año · ${euro(Math.floor((PRICES.annual / 12) * 100) / 100)} al mes` : 'al mes · cancelas cuando quieras'}
                </small>
              </p>
              <ul className="lp-rules">
                {PRICING.premium.map((f, i) => (
                  <li key={f} className="lp-rv" style={at(i + 2)}>{f}</li>
                ))}
              </ul>
              <p className="lp-quarter lp-rv" style={at(6)}>{PRICING.quarterly}</p>
            </div>
            <div className="lp-ticket-stub">
              <button type="button" className="lp-btn lp-btn-primary lp-btn-block" onClick={onEnter}>
                {PRICING.premiumCta}
                {PRICING.premiumCtaNote && <small>{PRICING.premiumCtaNote}</small>}
              </button>
            </div>
          </Reveal>
        </div>
        <Offer />
        <p className="lp-fine">{PRICING.fine}</p>
      </div>
    </section>
  )
}

function Offer() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4)
  const seats = ['1A', '1B', '1C']
  return (
    <div ref={ref} className={`lp-offer lp-night${inView ? ' in' : ''}`} role="group" aria-labelledby="lp-offer-title">
      <div className="lp-offer-copy">
        <p className="lp-kicker">{OFFER.eyebrow}</p>
        <h3 id="lp-offer-title" className="lp-h3">{OFFER.title}</h3>
        <p className="lp-body"><WithEmail text={OFFER.text} /></p>
      </div>
      <div className="lp-offer-seats" aria-hidden>
        <small>Fila 1 · Premium 12 meses</small>
        <div className="lp-seatmap">
          {seats.map((s, i) => (
            <span key={s} style={at(i)}>{s}</span>
          ))}
        </div>
        <b className="lp-offer-code">{OFFER.code}</b>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Preguntas, cierre y pie                                                    */
/* -------------------------------------------------------------------------- */

function Faq() {
  return (
    <section className="lp-paper lp-faq-section" id="preguntas" aria-labelledby="lp-faq-title">
      <div className="lp-wrap lp-faq-grid">
        <Reveal as="header" className="lp-faq-head">
          <p className="lp-kicker lp-rv">Preguntas</p>
          <h2 id="lp-faq-title" className="lp-h2 lp-rv" style={at(1)}>Lo que nos preguntan antes de empezar.</h2>
        </Reveal>
        <div className="lp-faq">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <Plus aria-hidden />
              </summary>
              <p><WithEmail text={a} /></p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function Closing({ onEnter }: { onEnter: () => void }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.4)
  const t = useFlapClock(inView, 1600)
  return (
    <section className="lp-closing lp-night" aria-labelledby="lp-closing-title">
      <div ref={ref} className="lp-wrap lp-closing-inner">
        <div className="lp-board lp-board-one" aria-hidden>
          <div className="lp-board-row tone-boarding">
            <span className="c-to"><Flaps text={CLOSING_BOARD.to} width={8} t={t} seed={3} /></span>
            <span className="c-gate"><Flaps text={CLOSING_BOARD.gate} width={1} t={t} delay={160} seed={5} /></span>
            <span className="c-st"><Flaps text={CLOSING_BOARD.status} width={10} t={t} delay={240} seed={7} /></span>
          </div>
        </div>
        <Reveal>
          <h2 id="lp-closing-title" className="lp-display">
            {CLOSING.title.map((l, i) => (
              <span key={l} className="lp-line"><span className="lp-rv-line" style={at(i)}>{l}</span></span>
            ))}
          </h2>
          <button type="button" className="lp-btn lp-btn-primary lp-btn-lg lp-rv" style={at(2)} onClick={onEnter}>
            {CLOSING.cta}
            <ArrowRight aria-hidden />
          </button>
        </Reveal>
      </div>
    </section>
  )
}

function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="lp-footer lp-night">
      <div className="lp-wrap lp-footer-inner">
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

const NIGHT = '#05070c'

export default function Landing({ onEnter, onSignIn, preview }: { onEnter: () => void; onSignIn: () => void; preview?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const [dark, setDark] = useState(true)
  const [compact, setCompact] = useState(false)
  const wide = useMedia(WIDE)

  // Fuente de la visita (`?ref=tiktok-3`): ver visits.ts.
  useEffect(() => {
    if (!preview) trackVisit()
  }, [preview])

  // Mientras se ve la web: título, color de la barra del sistema y fondo del
  // documento (el rebote de Safari arriba enseña la noche).
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

  useScrollTick(() => {
    const el = root.current
    if (!el) return
    const y = window.scrollY
    setCompact(y > 12)
    // La barra se vuelve clara sobre las secciones de noche.
    const probe = 36
    setDark(
      [...el.querySelectorAll<HTMLElement>('.lp-hero, .lp-flight, .lp-closing, .lp-footer')].some((s) => {
        const r = s.getBoundingClientRect()
        return r.top <= probe && r.bottom >= probe
      }),
    )
  })

  return (
    <div className={`lp${wide ? ' wide' : ''}`} ref={root}>
      <a className="lp-skip" href="#lp-main">Saltar al contenido</a>
      <NavBar onEnter={onEnter} onSignIn={onSignIn} dark={dark} compact={compact} />
      <main id="lp-main">
        <Hero onEnter={onEnter} onSignIn={onSignIn} />
        <Manifesto />
        <Chapters />
        <FlightShow />
        <Offline />
        <Pricing onEnter={onEnter} />
        <Faq />
        <Closing onEnter={onEnter} />
      </main>
      <Footer />
    </div>
  )
}
