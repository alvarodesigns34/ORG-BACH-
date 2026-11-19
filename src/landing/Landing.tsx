/**
 * Web de presentación de Órbita (v4).
 *
 * Es la propia app: lo primero que ve quien llega desde el navegador, y desde
 * aquí se entra (sin recargar) a la app. Textos en content.ts; diseño en
 * landing.css; movimiento en motion.ts (GSAP + ScrollTrigger + Lenis).
 *
 * Dirección: la calma de la app y una sola idea propia, la órbita.
 * - Portada: tu curso gira alrededor de un planeta (lo de hoy, en órbita).
 * - Funciones: una sola pantalla fija que cambia mientras lees (sin fijar la
 *   página, con `position: sticky`).
 * - El gesto de la página: el Modo Estudio a pantalla completa. Del planeta
 *   entero a ras del horizonte, el avión cruza de Madrid a Roma con el
 *   desplazamiento, para en la escala y aterriza.
 * - El resto, quieto y tipográfico.
 * Liquid Glass solo en lo que flota sobre algo (barra, botones, la tarjeta
 * de embarque sobre el globo, avisos dentro de la app). Solo transform y
 * opacity. Con «Reducir movimiento», todo en su estado final.
 */
import { trackVisit } from './visits'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ArrowRight,
  BatteryFull,
  BellRing,
  CalendarDays,
  Check,
  CloudOff,
  GraduationCap,
  Home,
  ListChecks,
  Mic,
  Plane,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Wifi,
} from 'lucide-react'

import { BrandMark } from '@/layout/Brand'
import { DotGlobe, arcPoint } from './globe'
import { gsap, ScrollTrigger, reducedMotion, scrollToTarget, useGsap, useLiquidButton, useSmoothScroll } from './motion'
import {
  ASSISTANT_DEMO,
  CLOSING,
  CONTACT_EMAIL,
  CONTACT_READY,
  DETAILS,
  DETAILS_TITLE,
  FAQ,
  FLIGHT,
  FLIGHT_STORY,
  HERO,
  LEGAL,
  NAV,
  OFFER,
  ORBIT,
  OWNER,
  PRICES,
  PRICING,
  SEO,
  STORY,
  STORY_TITLE,
  type Billing,
  type StoryId,
} from './content'
import './landing.css'

const BASE = import.meta.env.BASE_URL
const euro = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const decimal = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const vars = (v: Record<string, string | number>) => v as CSSProperties
const DEG = Math.PI / 180

/** «2 h 13 min» */
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`

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
/* Botones                                                                    */
/* -------------------------------------------------------------------------- */

/** Botón de cristal de la app: magnético con ratón, se hincha y se estira al pulsar. */
function GlassButton({
  children,
  onClick,
  tone = 'glass',
  size = 'md',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  tone?: 'tinted' | 'glass'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useLiquidButton(ref, size === 'sm' ? 0.16 : 0.24)
  const cls = tone === 'tinted' ? 'glass-tinted' : 'glass-btn'
  return (
    <button ref={ref} type="button" onClick={onClick} className={`lp-btn lp-btn-${size} lp-btn-${tone} ${cls} ${className}`}>
      <span className="lp-btn-label">{children}</span>
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Barra                                                                      */
/* -------------------------------------------------------------------------- */

function NavBar({ onEnter, onSignIn }: { onEnter: () => void; onSignIn: () => void }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Se compacta al bajar y cambia a oscuro sobre las secciones oscuras.
    const probe = () => {
      el.classList.toggle('compact', window.scrollY > 24)
      const dark = [...document.querySelectorAll<HTMLElement>('[data-tone="dark"]')].some((s) => {
        const r = s.getBoundingClientRect()
        return r.top <= 40 && r.bottom >= 40
      })
      el.classList.toggle('on-dark', dark)
    }
    let frame = 0
    const on = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), probe()))
    }
    window.addEventListener('scroll', on, { passive: true })
    probe()
    return () => {
      window.removeEventListener('scroll', on)
      cancelAnimationFrame(frame)
    }
  }, [])
  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    scrollToTarget(id)
  }
  return (
    <header ref={ref} className="lp-nav">
      <div className="lp-nav-inner liquid">
        <a className="lp-nav-brand" href="#lp-top" onClick={go('lp-top')}>
          <BrandMark size={24} />
          <span>Órbita</span>
        </a>
        <nav className="lp-nav-links" aria-label="Secciones">
          <a href="#funciones" onClick={go('funciones')}>Funciones</a>
          <a href="#estudio" onClick={go('estudio')}>Modo Estudio</a>
          <a href="#precios" onClick={go('precios')}>{NAV.pricing}</a>
          <a href="#preguntas" onClick={go('preguntas')}>{NAV.faq}</a>
          <button type="button" onClick={onSignIn}>{NAV.signIn}</button>
        </nav>
        <GlassButton tone="tinted" size="sm" onClick={onEnter}>{NAV.start}</GlassButton>
      </div>
    </header>
  )
}

/* -------------------------------------------------------------------------- */
/* Portada: tu curso, en órbita                                               */
/* -------------------------------------------------------------------------- */

/** Proporción de la elipse: el plano de la órbita visto casi de canto. */
const ORBIT_TILT = 0.32
const RINGS = [0.66, 1]

function Orbit() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const chips = [...el.querySelectorAll<HTMLElement>('.lp-orbit-chip')].filter((c) => getComputedStyle(c).display !== 'none')
    const n = chips.length
    let spin = 0
    let target = 0
    const place = (t: number) => {
      // Radio útil: que ninguna tarjeta se salga por los lados.
      const R = el.clientWidth / 2 - (el.clientWidth < 520 ? 48 : 76)
      chips.forEach((c, i) => {
        const ring = RINGS[i % 2]!
        const a = (i / n) * Math.PI * 2 + 0.6 + t * (i % 2 ? 0.05 : 0.075) + spin
        const x = Math.cos(a) * R * ring
        const y = Math.sin(a) * R * ring * ORBIT_TILT
        const depth = Math.sin(a) // 1 delante (abajo), −1 detrás (arriba)
        c.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${(0.84 + (depth + 1) * 0.08).toFixed(3)})`
        c.style.zIndex = depth > 0 ? '4' : '1'
        c.style.opacity = (0.5 + (depth + 1) * 0.25).toFixed(3)
      })
    }
    if (reducedMotion()) {
      place(0)
      return
    }
    const start = performance.now()
    let on = true
    const tick = () => {
      if (!on) return
      spin += (target - spin) * 0.06
      place((performance.now() - start) / 1000)
    }
    const io = new IntersectionObserver(([e]) => (on = !!e?.isIntersecting))
    io.observe(el)
    // El desplazamiento también hace girar la órbita.
    const st = ScrollTrigger.create({ trigger: el, start: 'top bottom', end: 'bottom top', onUpdate: (s) => (target = s.progress * 1.8) })
    gsap.ticker.add(tick)
    return () => {
      gsap.ticker.remove(tick)
      io.disconnect()
      st.kill()
    }
  }, [])
  const ry = (k: number) => 100 * k * ORBIT_TILT
  const arc = (k: number, front: boolean) => `M ${-100 * k} 0 A ${100 * k} ${ry(k)} 0 0 ${front ? 0 : 1} ${100 * k} 0`
  // Los anillos dibujan el mismo radio útil que las tarjetas.
  return (
    <div ref={root} className="lp-orbit" aria-hidden>
      <svg className="lp-orbit-rings back" viewBox="-101 -40 202 80">
        {RINGS.map((k) => <path key={k} d={arc(k, false)} />)}
      </svg>
      <div className="lp-orbit-planet" />
      <svg className="lp-orbit-rings front" viewBox="-101 -40 202 80">
        {RINGS.map((k) => <path key={k} d={arc(k, true)} />)}
      </svg>
      {ORBIT.map((o) => (
        <div key={o.title} className="lp-orbit-chip" style={vars({ '--c': o.color })}>
          <small>{o.kind}</small>
          <b>{o.title}</b>
          <span>{o.meta}</span>
        </div>
      ))}
    </div>
  )
}

function Hero({ onEnter, onSignIn }: { onEnter: () => void; onSignIn: () => void }) {
  const root = useRef<HTMLElement>(null)
  useGsap(root, (el) => {
    const q = gsap.utils.selector(el)
    gsap.from(q('.lp-hero-line > span'), { yPercent: 105, duration: 1.1, ease: 'expo.out', stagger: 0.08, delay: 0.1 })
    gsap.from(q('.lp-hero-fade'), { y: 16, autoAlpha: 0, duration: 0.9, ease: 'expo.out', stagger: 0.07, delay: 0.35 })
    gsap.from(q('.lp-orbit'), { scale: 0.94, autoAlpha: 0, duration: 1.6, ease: 'expo.out', delay: 0.2 })
    gsap.to(q('.lp-hero-orbit'), {
      yPercent: -10,
      ease: 'none',
      scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: 0.6 },
    })
  })
  return (
    <section ref={root} className="lp-hero" id="lp-top" aria-labelledby="lp-hero-title">
      <div className="lp-hero-copy">
        <h1 id="lp-hero-title" className="lp-display">
          {HERO.title.map((line) => (
            <span key={line} className="lp-hero-line"><span>{line}</span></span>
          ))}
        </h1>
        <p className="lp-hero-lead lp-hero-fade">{HERO.lead}</p>
        <div className="lp-hero-ctas lp-hero-fade">
          <GlassButton tone="tinted" size="lg" onClick={onEnter}>
            {HERO.primary} <ArrowRight aria-hidden />
          </GlassButton>
          <GlassButton size="lg" onClick={onSignIn}>{NAV.signIn}</GlassButton>
        </div>
        <ul className="lp-hero-note lp-hero-fade">
          {HERO.note.map((n) => <li key={n}>{n}</li>)}
        </ul>
      </div>
      <div className="lp-hero-orbit">
        <Orbit />
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* La app dentro de un iPad                                                   */
/* -------------------------------------------------------------------------- */

const TASKS = [
  { title: 'Ejercicios 12–18', subject: 'Matemáticas', color: 'var(--sub-sky)', time: '16:00' },
  { title: 'Resumen del tema 4', subject: 'Historia', color: 'var(--sub-terracotta)', time: '17:30' },
  { title: 'Comentario de texto', subject: 'Lengua', color: 'var(--sub-plum)', time: '19:00' },
  { title: 'Vocabulario unidad 6', subject: 'Inglés', color: 'var(--sub-teal)', time: '20:15' },
]

const SIDEBAR = [
  { icon: Home, label: 'Inicio' },
  { icon: ListChecks, label: 'Tareas' },
  { icon: CalendarDays, label: 'Agenda' },
  { icon: GraduationCap, label: 'Notas' },
  { icon: Plane, label: 'Estudio' },
]

function Ipad({ children }: { children: ReactNode }) {
  return (
    <div className="lp-ipad-frame">
      <div className="lp-ipad">
        <div className="lp-ipad-screen">{children}</div>
      </div>
    </div>
  )
}

/** Barra lateral, barra de estado y el área de contenido de la app. */
function AppShell({ nav, offline, children }: { nav: string; offline?: boolean; children: ReactNode }) {
  return (
    <div className="lp-app">
      <div className="lp-status">
        <span>9:41</span>
        <span className="lp-status-icons">
          {offline ? <Plane className="lp-status-plane" /> : <Wifi />}
          <BatteryFull />
        </span>
      </div>
      <aside className="lp-app-side">
        <div className="lp-app-brand"><BrandMark size={22} /> Órbita</div>
        {SIDEBAR.map(({ icon: Icon, label }) => (
          <span key={label} className={`lp-app-nav${label === nav ? ' on' : ''}`}><Icon /> {label}</span>
        ))}
        <span className="lp-app-nav lp-app-nav-end"><Settings /> Ajustes</span>
      </aside>
      <main className="lp-app-main">{children}</main>
    </div>
  )
}

function ScreenToday({ active, offline }: { active: boolean; offline?: boolean }) {
  // Al llegar a este capítulo, las dos primeras tareas se marcan solas.
  const [done, setDone] = useState(() => (reducedMotion() ? 2 : 0))
  const [extra, setExtra] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (!active || reducedMotion()) return
    setDone(0)
    const ids = [window.setTimeout(() => setDone(1), 700), window.setTimeout(() => setDone(2), 1300)]
    return () => ids.forEach(clearTimeout)
  }, [active])
  const isDone = (i: number) => i < done || extra.has(i)
  const count = TASKS.filter((_, i) => isDone(i)).length
  const week = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  return (
    <AppShell nav="Inicio" offline={offline}>
      <header className="lp-app-head">
        <div>
          <small>Martes, 24 de noviembre</small>
          <b>Hoy</b>
        </div>
        <span className="lp-app-ask"><Sparkles /> Pídele algo a Órbita</span>
      </header>
      <div className="lp-app-grid">
        <section className="lp-card lp-card-tasks">
          <h4>Para hoy <span className="lp-app-count">{count} de 4</span></h4>
          <ul>
            {TASKS.map((t, i) => (
              <li key={t.title} className={isDone(i) ? 'done' : ''}>
                <button
                  type="button"
                  tabIndex={-1}
                  className="lp-check"
                  onClick={() =>
                    setExtra((s) => {
                      const n = new Set(s)
                      if (n.has(i)) n.delete(i)
                      else n.add(i)
                      return n
                    })
                  }
                >
                  <Check />
                </button>
                <span className="lp-task-text">
                  <b>{t.title}</b>
                  <small><i style={{ background: t.color }} />{t.subject}</small>
                </span>
                <time>{t.time}</time>
              </li>
            ))}
          </ul>
        </section>
        <section className="lp-card lp-card-exam">
          <h4>Próximo examen</h4>
          <div className="lp-ring" style={vars({ '--v': 0.62 })}>
            <svg viewBox="0 0 44 44" aria-hidden>
              <circle cx="22" cy="22" r="18" className="track" />
              <circle cx="22" cy="22" r="18" className="value" pathLength="100" />
            </svg>
            <b>3<small>días</small></b>
          </div>
          <p><b>Biología</b> · temas 4–6</p>
        </section>
        <section className="lp-card lp-card-avg">
          <h4>Media del curso</h4>
          <b className="lp-num">7,8</b>
          <svg viewBox="0 0 120 36" className="lp-spark" aria-hidden>
            <path d="M2 30 L20 26 L38 28 L56 18 L74 20 L92 11 L118 6" />
          </svg>
        </section>
        <section className="lp-card lp-card-week">
          <h4>Semana</h4>
          <div className="lp-week">
            {week.map((d, i) => (
              <span key={d} className={i === 1 ? 'on' : ''}>
                {d}
                <i style={{ background: ['var(--sub-sky)', 'var(--c-accent-fill)', 'var(--sub-plum)', 'var(--sub-teal)', 'var(--sub-terracotta)', 'transparent', 'transparent'][i] }} />
              </span>
            ))}
          </div>
        </section>
        <section className="lp-card lp-card-flight">
          <h4>Siguiente vuelo</h4>
          <div className="lp-mini-route">
            <b>MAD</b>
            <span><i /><Plane /></span>
            <b>FCO</b>
          </div>
          <small>{hm(FLIGHT.minutes)} · Física · puerta {FLIGHT.gate}</small>
        </section>
      </div>
      {offline ? (
        <div className="lp-toast liquid">
          <span className="lp-toast-icon off"><CloudOff /></span>
          <span><b>Sin conexión</b><small>Todo sigue funcionando</small></span>
        </div>
      ) : (
        <div className="lp-toast liquid">
          <span className="lp-toast-icon"><BellRing /></span>
          <span><b>Examen de Biología en 3 días</b><small>Repasa los temas 4–6</small></span>
        </div>
      )}
    </AppShell>
  )
}

function ScreenVoice({ active }: { active: boolean }) {
  const prompt = ASSISTANT_DEMO.prompt
  const full = reducedMotion()
  const [typed, setTyped] = useState(full ? prompt.length : 0)
  const [stage, setStage] = useState(full ? 2 : 0) // 0 escribiendo · 1 respuesta · 2 en el calendario
  useEffect(() => {
    if (!active || full) return
    setTyped(0)
    setStage(0)
    let i = 0
    const ids: number[] = []
    const type = window.setInterval(() => {
      i += 1
      setTyped(i)
      if (i >= prompt.length) {
        clearInterval(type)
        ids.push(window.setTimeout(() => setStage(1), 450), window.setTimeout(() => setStage(2), 1050))
      }
    }, 32)
    return () => {
      clearInterval(type)
      ids.forEach(clearTimeout)
    }
  }, [active, full, prompt.length])
  const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']
  return (
    <AppShell nav="Agenda">
      <header className="lp-app-head">
        <div>
          <small>23 – 27 de noviembre</small>
          <b>Esta semana</b>
        </div>
      </header>
      <div className={`lp-cal${stage >= 2 ? ' placed' : ''}`}>
        {days.map((d) => {
          const card = ASSISTANT_DEMO.cards.find((c) => c.day === d)
          return (
            <div key={d} className="lp-cal-day">
              <small>{d}</small>
              <span className="lp-cal-slot">
                {card && (
                  <span className="lp-cal-card" style={vars({ '--c': card.color })}>
                    <small>{card.kind}</small>
                    {card.title.replace(/^(Entrega|Examen) de /, '')}
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <div className="lp-chat liquid">
        <div className="lp-chat-head"><Sparkles /> Asistente</div>
        <div className="lp-chat-body">
          {typed > 0 && (
            <div className="lp-bubble me">
              {prompt.slice(0, typed)}
              {stage === 0 && typed < prompt.length && <i className="lp-caret" />}
            </div>
          )}
          {stage >= 1 && (
            <div className="lp-bubble bot">
              {ASSISTANT_DEMO.reply}
              <span className="lp-undo"><RotateCcw /> Deshacer</span>
            </div>
          )}
        </div>
        <div className="lp-composer">
          <span>Pídele algo a Órbita…</span>
          <span className={`lp-mic${active && stage === 0 ? ' live' : ''}`}><Mic /></span>
        </div>
      </div>
    </AppShell>
  )
}

function Slider({ label, value, set, min = 0, weight }: { label: string; value: number; set: (n: number) => void; min?: number; weight?: string }) {
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
        onChange={(e) => set(Number(e.target.value))}
        style={vars({ '--v': (value - min) / (10 - min) })}
      />
      <b className="lp-num">{decimal(value)}</b>
    </label>
  )
}

function ScreenGrades() {
  const [first, setFirst] = useState(7.5)
  const [second, setSecond] = useState(6)
  const [target, setTarget] = useState(7)
  const need = (target - first * 0.3 - second * 0.3) / 0.4
  const state = need <= 0 ? 'done' : need > 10 ? 'out' : need >= 8 ? 'hard' : 'ok'
  const avg = (first + second) / 2
  return (
    <AppShell nav="Notas">
      <header className="lp-app-head">
        <div>
          <small>Notas · 2.º trimestre</small>
          <b>Física y Química</b>
        </div>
        <span className="lp-app-pill lp-num">Media {decimal(avg)}</span>
      </header>
      <div className="lp-grades-grid">
        <section className="lp-card">
          <h4>Calificaciones</h4>
          <ul className="lp-grade-list">
            <li><span>Primer parcial<small>Exámenes · 30 %</small></span><b className="lp-num">{decimal(first)}</b></li>
            <li><span>Segundo parcial<small>Exámenes · 30 %</small></span><b className="lp-num">{decimal(second)}</b></li>
            <li><span>Examen final<small>Exámenes · 40 %</small></span><b className="lp-muted">—</b></li>
          </ul>
        </section>
        <section className="lp-card lp-calc">
          <h4>¿Qué nota necesito?</h4>
          <Slider label="Primer parcial" weight="30 %" value={first} set={setFirst} />
          <Slider label="Segundo parcial" weight="30 %" value={second} set={setSecond} />
          <Slider label="Quiero sacar" value={target} set={setTarget} min={5} />
          <div className={`lp-need ${state}`} aria-live="polite">
            {state === 'done' ? (
              <span>Ya lo tienes, saques lo que saques.</span>
            ) : state === 'out' ? (
              <span>Con un 10 llegarías a un <b className="lp-num">{decimal(first * 0.3 + second * 0.3 + 4)}</b>.</span>
            ) : (
              <span>Necesitas un <b className="lp-num" key={decimal(need)}>{decimal(Math.max(0, need))}</b> en el final.</span>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  )
}

function Screen({ id, active }: { id: StoryId; active: boolean }) {
  if (id === 'voice') return <ScreenVoice active={active} />
  if (id === 'grades') return <ScreenGrades />
  return <ScreenToday active={active} offline={id === 'offline'} />
}

/* -------------------------------------------------------------------------- */
/* Funciones: una pantalla fija que cambia mientras lees                      */
/* -------------------------------------------------------------------------- */

function Story() {
  const root = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const triggers = [...el.querySelectorAll<HTMLElement>('.lp-step')].map((s, i) =>
      ScrollTrigger.create({ trigger: s, start: 'top 60%', end: 'bottom 60%', onToggle: (self) => self.isActive && setActive(i) }),
    )
    return () => triggers.forEach((t) => t.kill())
  }, [])
  useGsap(root, (el) => {
    gsap.from(el.querySelectorAll('.lp-story-head > *'), {
      y: 24, autoAlpha: 0, duration: 1, ease: 'expo.out', stagger: 0.08,
      scrollTrigger: { trigger: el, start: 'top 75%' },
    })
    gsap.from(el.querySelector('.lp-story-sticky'), {
      y: 48, autoAlpha: 0, duration: 1.2, ease: 'expo.out',
      scrollTrigger: { trigger: el.querySelector('.lp-story-grid'), start: 'top 80%' },
    })
  })
  return (
    <section ref={root} className="lp-story" id="funciones" aria-labelledby="lp-story-title">
      <header className="lp-story-head">
        <h2 id="lp-story-title" className="lp-h2">
          {STORY_TITLE[0]} <span className="lp-muted">{STORY_TITLE[1]}</span>
        </h2>
      </header>
      <div className="lp-story-grid">
        <div className="lp-steps">
          {STORY.map((s, i) => (
            <article key={s.id} className={`lp-step${active === i ? ' on' : ''}`}>
              <div className="lp-step-copy">
                <p className="lp-step-kicker">
                  <span className="lp-num">{String(i + 1).padStart(2, '0')}</span> {s.kicker}
                </p>
                <h3 className="lp-h3">{s.title}</h3>
                <p className="lp-body">{s.text}</p>
                {s.note && <p className="lp-small">{s.note}</p>}
              </div>
              <div className="lp-step-device" aria-hidden>
                <Ipad><Screen id={s.id} active={active === i} /></Ipad>
              </div>
            </article>
          ))}
        </div>
        <div className="lp-story-sticky" aria-hidden>
          <Ipad>
            {STORY.map((s, i) => (
              <div key={s.id} className={`lp-screen${active === i ? ' on' : ''}`}>
                <Screen id={s.id} active={active === i} />
              </div>
            ))}
          </Ipad>
          <div className="lp-story-dots">
            {STORY.map((s, i) => <i key={s.id} className={active === i ? 'on' : ''} />)}
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Modo Estudio: el vuelo a pantalla completa                                 */
/* -------------------------------------------------------------------------- */

/** Coordenadas (grados) de un punto de la ruta y su altura sobre el planeta. */
function routePoint(t: number) {
  const v = arcPoint(FLIGHT.from, FLIGHT.to, clamp(t, 0.001, 0.999))
  const len = Math.hypot(v[0], v[1], v[2])
  return { lat: Math.asin(v[1] / len) / DEG, lon: Math.atan2(v[0], v[2]) / DEG, len, v }
}

const smooth = (t: number) => t * t * (3 - 2 * t)

function StudyFlight() {
  const root = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const plane = useRef<HTMLDivElement>(null)
  const clock = useRef<HTMLElement>(null)
  const bar = useRef<HTMLSpanElement>(null)
  const status = useRef<HTMLSpanElement>(null)
  const globe = useRef<DotGlobe | null>(null)
  const reduced = reducedMotion()
  // Cámara: zoom 0 = el planeta entero; 1 = a ras del horizonte siguiendo al avión.
  const cam = useRef(reduced ? { zoom: 1, spin: 0, p: 0.62, plane: 1 } : { zoom: 0, spin: 0, p: 0, plane: 0 })
  const total = FLIGHT.minutes * 60

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const layout = (w: number, h: number) => {
      const z = smooth(clamp(cam.current.zoom))
      const narrow = w < 720
      const r0 = Math.min(w, h) * (narrow ? 0.42 : 0.29)
      const r1 = Math.max(w * 1.45, h * 1.1)
      const r = lerp(r0, r1, z)
      const cy = lerp(h * (narrow ? 0.68 : 0.66), h * 0.44 + r, z)
      return { r, cx: w / 2, cy }
    }
    const g = DotGlobe.create(c, { arcs: [{ from: FLIGHT.from, to: FLIGHT.to }], center: { lat: 24, lon: 4 }, mode: 'progress', layout })
    globe.current = g
    if (!g) return
    g.onBeforeFrame = () => {
      const k = cam.current
      const z = smooth(clamp(k.zoom))
      const h = c.clientHeight
      const { r, cy } = g.geometry()
      const pt = routePoint(k.p)
      // El avión, a algo más de media altura: la cámara mira un poco al sur de él.
      const yp = h * 0.6
      const theta = Math.asin(clamp((cy - yp) / (r * pt.len), -0.999, 0.999)) / DEG
      g.setView(lerp(24, pt.lat - theta, z), lerp(4 + k.spin, pt.lon, z))
    }
    let geo = ''
    g.onFrame = () => {
      const k = cam.current
      const { r, cx, cy } = g.geometry()
      const key = `${r.toFixed(1)}:${cx.toFixed(1)}:${cy.toFixed(1)}`
      if (key !== geo && body.current) {
        geo = key
        body.current.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) scale(${(r / 500).toFixed(4)})`
      }
      const a = g.project(routePoint(k.p).v)
      const b = g.project(routePoint(Math.min(1, k.p + 0.01)).v)
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
      if (plane.current) {
        plane.current.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0) rotate(${ang.toFixed(1)}deg)`
        plane.current.style.opacity = String(k.plane)
      }
      const left = Math.round(total * (1 - k.p))
      if (clock.current) {
        const hh = Math.floor(left / 3600)
        const mm = Math.floor((left % 3600) / 60)
        const ss = left % 60
        clock.current.textContent = `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      }
      if (bar.current) bar.current.style.transform = `scaleX(${k.p.toFixed(4)})`
    }
    g.setProgress(cam.current.p)
    g.redraw()
    return () => {
      g.dispose()
      globe.current = null
    }
  }, [total])

  useGsap(root, (el) => {
    const q = gsap.utils.selector(el)
    const k = cam.current
    let label = ''
    const say = (t: string) => {
      if (t === label || !status.current) return
      label = t
      status.current.textContent = t
    }
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: el,
        start: 'top top',
        end: '+=560%',
        scrub: 1,
        pin: q('.lp-fs-stage')[0],
        anticipatePin: 1,
      },
      onUpdate: () => {
        globe.current?.setProgress(k.p)
        const t = tl.time()
        say(t < 4.2 ? 'Embarcando' : t < 6.6 ? 'En vuelo' : t < 7.2 ? 'En escala' : t < 9.4 ? 'En vuelo' : 'Aterrizado')
      },
    })
    tl.to(k, { spin: 24, duration: 2.6 }, 0)
      .to(q('.lp-fs-title'), { y: -48, autoAlpha: 0, duration: 0.8, ease: 'power1.in' }, 1.1)
      .to(k, { zoom: 1, duration: 2.3, ease: 'power1.inOut' }, 1.2)
      .fromTo(q('.lp-fs-pass'), { y: 48, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7, ease: 'power2.out' }, 2.5)
      .to(q('.lp-fs-pass'), { y: -24, autoAlpha: 0, duration: 0.5, ease: 'power1.in' }, 3.6)
      .fromTo(q('.lp-fs-hud'), { y: 32, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: 'power2.out' }, 3.8)
      .to(k, { plane: 1, duration: 0.3 }, 3.9)
      .to(k, { p: 0.5, duration: 2.4, ease: 'power1.in' }, 4.2)
      .to(k, { p: 1, duration: 2.2, ease: 'power1.out' }, 7.2)
    q('.lp-fs-beat').forEach((b, i) => {
      const at = [4.3, 5.45, 6.6][i]!
      tl.fromTo(b, { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, ease: 'power2.out' }, at)
      tl.to(b, { y: -16, autoAlpha: 0, duration: 0.3, ease: 'power1.in' }, at + 0.75)
    })
    tl.to(q('.lp-fs-hud'), { y: 24, autoAlpha: 0, duration: 0.5, ease: 'power1.in' }, 9.5)
      .to(k, { plane: 0, duration: 0.3 }, 9.5)
      .to(k, { zoom: 0.8, duration: 1.3, ease: 'power2.inOut' }, 9.5)
      .fromTo(q('.lp-fs-landed'), { y: 40, autoAlpha: 0, scale: 0.97 }, { y: 0, autoAlpha: 1, scale: 1, duration: 0.8, ease: 'power2.out' }, 10.1)
      .to({}, { duration: 0.8 })
    gsap.from(q('.lp-fs-title > *'), {
      y: 24, autoAlpha: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08,
      scrollTrigger: { trigger: el, start: 'top 65%' },
    })
  })

  return (
    <section ref={root} className={`lp-fs lp-dark${reduced ? ' still' : ''}`} data-tone="dark" id="estudio" aria-labelledby="lp-fs-title">
      <div className="lp-fs-stage">
        <div className="lp-fs-globe" aria-hidden>
          <div ref={body} className="lp-fs-body" />
          <canvas ref={canvas} />
          <div ref={plane} className="lp-plane"><Plane /></div>
        </div>

        <div className="lp-fs-title">
          <p className="lp-kicker">Modo Estudio</p>
          <h2 id="lp-fs-title" className="lp-display lp-display-md">
            {FLIGHT_STORY.title[0]}<br /><span className="lp-muted">{FLIGHT_STORY.title[1]}</span>
          </h2>
          <p className="lp-body">{FLIGHT_STORY.lead}</p>
        </div>

        <div className="lp-fs-pass liquid" aria-hidden>
          <p className="lp-pass-kicker">Tarjeta de embarque · Hoy</p>
          <div className="lp-pass-route">
            <span><small>{FLIGHT.from.city}</small><b>{FLIGHT.from.code}</b></span>
            <span className="line"><i /><Plane /></span>
            <span className="end"><small>{FLIGHT.to.city}</small><b>{FLIGHT.to.code}</b></span>
          </div>
          <div className="lp-pass-cols">
            <span><small>Estudio</small><b>{hm(FLIGHT.minutes)}</b></span>
            <span><small>Puerta</small><b>{FLIGHT.gate}</b></span>
            <span><small>Asiento</small><b>{FLIGHT.seat}</b></span>
          </div>
        </div>

        <div className="lp-fs-beats" aria-hidden>
          {FLIGHT_STORY.beats.map((b) => (
            <p key={b.kicker} className="lp-fs-beat">
              <small>{b.kicker}</small>
              {b.text}
            </p>
          ))}
        </div>

        <div className="lp-fs-hud liquid" role="img" aria-label={`Vuelo de estudio de ejemplo: ${FLIGHT.from.city} a ${FLIGHT.to.city}, ${hm(FLIGHT.minutes)}`}>
          <div className="lp-hud-top" aria-hidden>
            <span className="lp-hud-status"><i /><span ref={status}>{reduced ? 'En vuelo' : 'Embarcando'}</span></span>
            <span>{FLIGHT.from.code} → {FLIGHT.to.code} · {FLIGHT.seat}</span>
          </div>
          <b ref={clock} className="lp-hud-clock lp-num" aria-hidden>{hm(FLIGHT.minutes)}</b>
          <div className="lp-hud-route" aria-hidden>
            <b>{FLIGHT.from.code}</b>
            <span className="lp-hud-bar"><span ref={bar} /><i /></span>
            <b>{FLIGHT.to.code}</b>
          </div>
        </div>

        <div className="lp-fs-landed liquid" aria-hidden>
          <span className="lp-landed-icon"><Check /></span>
          <h3>{FLIGHT_STORY.landed}</h3>
          <p><b className="lp-num">{hm(FLIGHT.minutes)}</b> estudiados</p>
          <small>{FLIGHT_STORY.landedNote}</small>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Lo que no se ve                                                            */
/* -------------------------------------------------------------------------- */

function Details() {
  const root = useRef<HTMLElement>(null)
  useGsap(root, (el) => {
    gsap.from(el.querySelectorAll('.lp-details-list > div'), {
      y: 24, autoAlpha: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06,
      scrollTrigger: { trigger: el, start: 'top 70%' },
    })
  })
  return (
    <section ref={root} className="lp-details" aria-labelledby="lp-details-title">
      <div className="lp-details-inner">
        <h2 id="lp-details-title" className="lp-h2">{DETAILS_TITLE}</h2>
        <dl className="lp-details-list">
          {DETAILS.map((d) => (
            <div key={d.title}>
              <dt>{d.title}</dt>
              <dd>{d.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Precios                                                                    */
/* -------------------------------------------------------------------------- */

function Pricing({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLElement>(null)
  const [billing, setBilling] = useState<Billing>('annual')
  const annual = billing === 'annual'
  const saving = Math.round((1 - PRICES.annual / (PRICES.monthly * 12)) * 100)
  useGsap(root, (el) => {
    const q = gsap.utils.selector(el)
    gsap.from(q('.lp-pricing-head > *'), { y: 24, autoAlpha: 0, stagger: 0.07, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 75%' } })
    gsap.from(q('.lp-plan, .lp-offer'), {
      y: 40, autoAlpha: 0, stagger: 0.1, duration: 1.1, ease: 'expo.out',
      scrollTrigger: { trigger: q('.lp-plans')[0], start: 'top 85%' },
    })
  })
  return (
    <section ref={root} className="lp-pricing" id="precios" aria-labelledby="lp-pricing-title">
      <header className="lp-pricing-head">
        <h2 id="lp-pricing-title" className="lp-h2">{PRICING.title}</h2>
        <div className="lp-seg liquid" role="radiogroup" aria-label="Periodo de pago" style={vars({ '--k': annual ? 1 : 0 })}>
          <span className="lp-seg-thumb" aria-hidden />
          <button type="button" role="radio" aria-checked={!annual} onClick={() => setBilling('monthly')}>Mensual</button>
          <button type="button" role="radio" aria-checked={annual} onClick={() => setBilling('annual')}>
            Anual <span className="lp-save">−{saving} %</span>
          </button>
        </div>
      </header>
      <div className="lp-plans">
        <article className="lp-plan">
          <h3>Gratis</h3>
          <p className="lp-price"><b className="lp-num">0 €</b><small>para siempre</small></p>
          <p className="lp-price-alt">Sin tarjeta y sin cuenta.</p>
          <ul className="lp-checks">
            {PRICING.free.map((f) => <li key={f}><Check aria-hidden />{f}</li>)}
          </ul>
          <GlassButton className="lp-btn-block" onClick={onEnter}>Empezar gratis</GlassButton>
        </article>
        <article className="lp-plan lp-plan-premium">
          <h3>Premium <span className="lp-badge">Más asistente</span></h3>
          <p className="lp-price">
            <b key={billing} className="lp-price-swap lp-num">{euro(annual ? PRICES.annual : PRICES.monthly)}</b>
            <small>{annual ? '/año' : '/mes'}</small>
          </p>
          <p className="lp-price-alt">
            {annual ? `${euro(Math.floor((PRICES.annual / 12) * 100) / 100)} al mes, pagando el año` : 'Cancelas cuando quieras'}
          </p>
          <ul className="lp-checks">
            {PRICING.premium.map((f) => <li key={f}><Check aria-hidden />{f}</li>)}
          </ul>
          <p className="lp-quarter">{PRICING.quarterly}</p>
          <GlassButton tone="tinted" className="lp-btn-block" onClick={onEnter}>
            {PRICING.premiumCta}
            {PRICING.premiumCtaNote && <small>{PRICING.premiumCtaNote}</small>}
          </GlassButton>
        </article>
      </div>
      <div className="lp-offer" role="group" aria-labelledby="lp-offer-title">
        <div>
          <p className="lp-kicker">{OFFER.eyebrow}</p>
          <h3 id="lp-offer-title">{OFFER.title}</h3>
          <p><WithEmail text={OFFER.text} /></p>
        </div>
        <div className="lp-offer-code" aria-hidden>
          <small>Código</small>
          <b>{OFFER.code}</b>
        </div>
      </div>
      <p className="lp-fine">{PRICING.fine}</p>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Preguntas, cierre y pie                                                    */
/* -------------------------------------------------------------------------- */

function Faq() {
  return (
    <section className="lp-faq-section" id="preguntas" aria-labelledby="lp-faq-title">
      <div className="lp-faq-inner">
        <h2 id="lp-faq-title" className="lp-h2">Preguntas frecuentes</h2>
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
  const root = useRef<HTMLElement>(null)
  useGsap(root, (el) => {
    const q = gsap.utils.selector(el)
    gsap.from(q('.lp-close > *'), { y: 24, autoAlpha: 0, stagger: 0.08, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 70%' } })
  })
  return (
    <section ref={root} className="lp-close-section" aria-labelledby="lp-close-title">
      <div className="lp-close">
        <div className="lp-close-planet" aria-hidden />
        <h2 id="lp-close-title" className="lp-display lp-display-md">
          {CLOSING.title[0]}<br /><span className="lp-muted">{CLOSING.title[1]}</span>
        </h2>
        <div className="lp-close-cta">
          <GlassButton tone="tinted" size="lg" onClick={onEnter}>{CLOSING.cta} <ArrowRight aria-hidden /></GlassButton>
        </div>
        <ul className="lp-hero-note">
          {HERO.note.map((n) => <li key={n}>{n}</li>)}
        </ul>
      </div>
    </section>
  )
}

function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="lp-footer">
      <div className="lp-footer-inner">
        <div className="lp-footer-brand">
          <BrandMark size={20} />
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

const CANVAS = '#f2f2f7'

export default function Landing({ onEnter, onSignIn, preview }: { onEnter: () => void; onSignIn: () => void; preview?: boolean }) {
  useSmoothScroll()

  // Fuente de la visita (`?ref=tiktok-3`): ver visits.ts.
  useEffect(() => {
    if (!preview) trackVisit()
  }, [preview])

  // Mientras se ve la web: título, color de la barra del sistema y fondo.
  useEffect(() => {
    const prevTitle = document.title
    document.title = SEO.title
    const html = document.documentElement
    const prevBg = html.style.background
    html.style.background = CANVAS
    html.classList.add('lp-active')
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const prevMeta = meta?.content
    if (meta) meta.content = CANVAS
    // Las fuentes y las imágenes pueden mover el diseño: recalcular al final.
    const t = window.setTimeout(() => ScrollTrigger.refresh(), 600)
    return () => {
      clearTimeout(t)
      document.title = prevTitle
      html.style.background = prevBg
      html.classList.remove('lp-active')
      if (meta && prevMeta) meta.content = prevMeta
    }
  }, [])

  return (
    <div className="lp">
      <a className="lp-skip" href="#lp-main">Saltar al contenido</a>
      <NavBar onEnter={onEnter} onSignIn={onSignIn} />
      <main id="lp-main">
        <Hero onEnter={onEnter} onSignIn={onSignIn} />
        <Story />
        <StudyFlight />
        <Details />
        <Pricing onEnter={onEnter} />
        <Faq />
        <Closing onEnter={onEnter} />
      </main>
      <Footer />
    </div>
  )
}
