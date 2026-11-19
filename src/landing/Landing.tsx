/**
 * Web de presentación de Órbita (v3).
 *
 * Es la propia app: lo primero que ve quien llega desde el navegador, y desde
 * aquí se entra (sin recargar) a la app. Textos en content.ts; diseño en
 * landing.css; movimiento en motion.ts (GSAP + ScrollTrigger + Lenis).
 *
 * Lenguaje: el de la app. Mismo lienzo gris, tarjetas blancas, azul de
 * acento, tipografía del sistema y Liquid Glass en todo lo que flota sobre
 * contenido (barra, botones, avisos, el calculador sobre el fondo de
 * pantalla, la tarjeta de embarque sobre el globo).
 *
 * Coreografía: cada sección tiene UNA idea de movimiento ligada al
 * desplazamiento, con inercia (`scrub`), y el resto quieto. Solo transform y
 * opacity. Con «Reducir movimiento», todo en su estado final.
 */
import { trackVisit } from "./visits";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  BellRing,
  Check,
  ChevronRight,
  CloudOff,
  Download,
  History,
  Home,
  ListChecks,
  Mic,
  NotebookPen,
  Plane,
  Plus,
  RotateCcw,
  Settings,
  Share,
  Sparkles,
  UserRoundX,
  CalendarDays,
  GraduationCap,
  Wifi,
  BadgeX,
} from "lucide-react";

import { BrandMark } from "@/layout/Brand";
import { DotGlobe, arcPoint } from "./globe";
import {
  gsap,
  ScrollTrigger,
  reducedMotion,
  scrollToTarget,
  useGsap,
  useMagnetic,
  useSmoothScroll,
} from "./motion";
import {
  ASSISTANT_DEMO,
  BENTO,
  BENTO_TITLE,
  CHAPTERS,
  CLOSING,
  CONTACT_EMAIL,
  CONTACT_READY,
  FAQ,
  FLIGHT,
  HERO,
  HIGHLIGHTS,
  HIGHLIGHTS_TITLE,
  LEGAL,
  MANIFESTO,
  NAV,
  OFFER,
  OWNER,
  PRICES,
  PRICING,
  SEO,
  type Billing,
} from "./content";
import "./landing.css";

const BASE = import.meta.env.BASE_URL;
const euro = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    n,
  );
const decimal = (n: number) =>
  n.toLocaleString("es-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** Texto con el correo: enlace solo cuando el correo ya existe. */
function WithEmail({ text }: { text: string }) {
  if (!CONTACT_READY || !text.includes(CONTACT_EMAIL)) return <>{text}</>;
  const [a, b] = text.split(CONTACT_EMAIL);
  return (
    <>
      {a}
      <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      {b}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Botones                                                                    */
/* -------------------------------------------------------------------------- */

/** Botón de cristal de la app, magnético con ratón y con muelle al pulsar. */
function GlassButton({
  children,
  onClick,
  tone = "glass",
  size = "md",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "tinted" | "glass" | "dark";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useMagnetic(ref, size === "sm" ? 0.18 : 0.26);
  const cls = tone === "tinted" ? "glass-tinted" : "glass-btn";
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={`lp-btn lp-btn-${size} lp-btn-${tone} ${cls} ${className}`}
    >
      <span className="lp-btn-label">{children}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Barra                                                                      */
/* -------------------------------------------------------------------------- */

function NavBar({
  onEnter,
  onSignIn,
}: {
  onEnter: () => void;
  onSignIn: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Se compacta al bajar y cambia a oscuro sobre las secciones oscuras.
    const probe = () => {
      const y = window.scrollY;
      el.classList.toggle("compact", y > 24);
      const dark = [
        ...document.querySelectorAll<HTMLElement>('[data-tone="dark"]'),
      ].some((s) => {
        const r = s.getBoundingClientRect();
        return r.top <= 40 && r.bottom >= 40;
      });
      el.classList.toggle("on-dark", dark);
    };
    let frame = 0;
    const on = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), probe()));
    };
    window.addEventListener("scroll", on, { passive: true });
    probe();
    return () => {
      window.removeEventListener("scroll", on);
      cancelAnimationFrame(frame);
    };
  }, []);
  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    scrollToTarget(id);
  };
  return (
    <header ref={ref} className="lp-nav">
      <div className="lp-nav-inner liquid">
        <a className="lp-nav-brand" href="#lp-top" onClick={go("lp-top")}>
          <BrandMark size={26} />
          <span>Órbita</span>
        </a>
        <nav className="lp-nav-links" aria-label="Secciones">
          <a href="#funciones" onClick={go("funciones")}>
            Funciones
          </a>
          <a href="#precios" onClick={go("precios")}>
            {NAV.pricing}
          </a>
          <a href="#preguntas" onClick={go("preguntas")}>
            {NAV.faq}
          </a>
          <button type="button" onClick={onSignIn}>
            {NAV.signIn}
          </button>
        </nav>
        <GlassButton tone="tinted" size="sm" onClick={onEnter}>
          {NAV.start}
        </GlassButton>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* La app en un iPad (portada)                                                */
/* -------------------------------------------------------------------------- */

const TASKS = [
  {
    title: "Ejercicios 12–18",
    subject: "Matemáticas",
    color: "var(--sub-sky)",
    time: "16:00",
  },
  {
    title: "Resumen del tema 4",
    subject: "Historia",
    color: "var(--sub-terracotta)",
    time: "17:30",
  },
  {
    title: "Comentario de texto",
    subject: "Lengua",
    color: "var(--sub-plum)",
    time: "19:00",
  },
  {
    title: "Vocabulario unidad 6",
    subject: "Inglés",
    color: "var(--sub-teal)",
    time: "20:15",
  },
];

const SIDEBAR = [
  { icon: Home, label: "Inicio", on: true },
  { icon: ListChecks, label: "Tareas" },
  { icon: CalendarDays, label: "Agenda" },
  { icon: GraduationCap, label: "Notas" },
  { icon: Plane, label: "Estudio" },
];

function IpadApp() {
  const week = ["L", "M", "X", "J", "V", "S", "D"];
  return (
    <div className="lp-app">
      <aside className="lp-app-side">
        <div className="lp-app-brand">
          <BrandMark size={22} /> Órbita
        </div>
        {SIDEBAR.map(({ icon: Icon, label, on }) => (
          <span key={label} className={`lp-app-nav${on ? " on" : ""}`}>
            <Icon /> {label}
          </span>
        ))}
        <span className="lp-app-nav lp-app-nav-end">
          <Settings /> Ajustes
        </span>
      </aside>
      <main className="lp-app-main">
        <header className="lp-app-head">
          <div>
            <small>Martes, 24 de noviembre</small>
            <b>Hoy</b>
          </div>
          <span className="lp-app-ask">
            <Sparkles /> Pídele algo a Órbita
          </span>
        </header>
        <div className="lp-app-grid">
          <section className="lp-card lp-card-tasks">
            <h4>
              Para hoy{" "}
              <span className="lp-app-count" data-count>
                0 de 4
              </span>
            </h4>
            <ul>
              {TASKS.map((t) => (
                <li key={t.title} data-task>
                  <span className="lp-check">
                    <Check />
                  </span>
                  <span className="lp-task-text">
                    <b>{t.title}</b>
                    <small>
                      <i style={{ background: t.color }} />
                      {t.subject}
                    </small>
                  </span>
                  <time>{t.time}</time>
                </li>
              ))}
            </ul>
          </section>
          <section className="lp-card lp-card-exam">
            <h4>Próximo examen</h4>
            <div className="lp-ring" style={vars({ "--v": 0.62 })}>
              <svg viewBox="0 0 44 44" aria-hidden>
                <circle cx="22" cy="22" r="18" className="track" />
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  className="value"
                  pathLength="100"
                />
              </svg>
              <b>
                3<small>días</small>
              </b>
            </div>
            <p>
              <b>Biología</b> · temas 4–6
            </p>
          </section>
          <section className="lp-card lp-card-week">
            <h4>Semana</h4>
            <div className="lp-week">
              {week.map((d, i) => (
                <span key={d} className={i === 1 ? "on" : ""}>
                  {d}
                  <i
                    style={{
                      background: [
                        "var(--sub-sky)",
                        "var(--c-accent-fill)",
                        "var(--sub-plum)",
                        "var(--sub-teal)",
                        "var(--sub-terracotta)",
                        "transparent",
                        "transparent",
                      ][i],
                    }}
                  />
                </span>
              ))}
            </div>
          </section>
          <section className="lp-card lp-card-flight">
            <h4>Siguiente vuelo</h4>
            <div className="lp-mini-route">
              <b>MAD</b>
              <span>
                <i />
                <Plane />
              </span>
              <b>FCO</b>
            </div>
            <small>50 min · Física · puerta B7</small>
          </section>
          <section className="lp-card lp-card-avg">
            <h4>Media del curso</h4>
            <b className="lp-num">7,8</b>
            <svg viewBox="0 0 120 36" className="lp-spark" aria-hidden>
              <path d="M2 30 L20 26 L38 28 L56 18 L74 20 L92 11 L118 6" />
            </svg>
          </section>
        </div>
      </main>
    </div>
  );
}

function Hero({
  onEnter,
  onSignIn,
}: {
  onEnter: () => void;
  onSignIn: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  useGsap(root, (el) => {
    const q = gsap.utils.selector(el);
    // Entrada al cargar: el titular sube línea a línea y el iPad asoma.
    gsap.from(q(".lp-hero-line > span"), {
      yPercent: 110,
      duration: 1.3,
      ease: "expo.out",
      stagger: 0.09,
      delay: 0.1,
    });
    gsap.from(q(".lp-hero-fade"), {
      y: 24,
      autoAlpha: 0,
      duration: 1.1,
      ease: "expo.out",
      stagger: 0.08,
      delay: 0.35,
    });
    gsap.from(q(".lp-ipad-in"), {
      y: 140,
      autoAlpha: 0,
      duration: 1.6,
      ease: "expo.out",
      delay: 0.45,
    });

    const tasks = q("[data-task]");
    const count = el.querySelector<HTMLElement>("[data-count]");
    let done = -1;
    const check = (p: number, from: number, step: number) => {
      // Las tareas se marcan una a una en el último tramo.
      const n = Math.max(0, Math.min(4, Math.floor((p - from) / step)));
      if (n === done) return;
      done = n;
      tasks.forEach((t, i) => t.classList.toggle("done", i < n));
      if (count) count.textContent = `${n} de 4`;
    };
    const wrap = q(".lp-ipad-wrap")[0] as HTMLElement;

    if (window.matchMedia("(min-width: 720px)").matches) {
      // iPad y escritorio: la portada se fija, el texto se aparta y el iPad
      // sube, se endereza y queda centrado; luego la app «se usa».
      const center = () =>
        (window.innerHeight - wrap.offsetHeight) / 2 + 26 - wrap.offsetTop;
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: "+=150%",
          scrub: 1,
          pin: q(".lp-hero-stage")[0],
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => check(self.progress, 0.56, 0.07),
        },
      });
      tl.to(
        q(".lp-hero-copy"),
        { y: -60, autoAlpha: 0, scale: 0.96, duration: 0.3, ease: "power1.in" },
        0,
      )
        .fromTo(
          q(".lp-ipad"),
          { rotateX: 24, scale: 0.9 },
          { rotateX: 0, scale: 1, duration: 0.5, ease: "power2.inOut" },
          0,
        )
        .fromTo(
          wrap,
          { y: 0 },
          { y: center, duration: 0.5, ease: "power2.inOut" },
          0,
        )
        .fromTo(
          q(".lp-hero-notice"),
          { y: -30, autoAlpha: 0, scale: 0.92 },
          {
            y: 0,
            autoAlpha: 1,
            scale: 1,
            duration: 0.1,
            ease: "back.out(1.6)",
          },
          0.5,
        )
        .to({}, { duration: 0.4 });
    } else {
      // Móvil: sin fijar (el dedo manda); el iPad se endereza al llegar.
      gsap.fromTo(
        q(".lp-ipad"),
        { rotateX: 24, scale: 0.92 },
        {
          rotateX: 0,
          scale: 1,
          ease: "none",
          scrollTrigger: {
            trigger: wrap,
            start: "top bottom",
            end: "center 55%",
            scrub: 0.8,
            onUpdate: (self) => check(self.progress, 0.7, 0.07),
          },
        },
      );
      gsap.fromTo(
        q(".lp-hero-notice"),
        { y: -20, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          ease: "back.out(1.6)",
          duration: 0.6,
          scrollTrigger: { trigger: wrap, start: "center 70%" },
        },
      );
    }
  });
  return (
    <section
      ref={root}
      className="lp-hero"
      id="lp-top"
      aria-labelledby="lp-hero-title"
    >
      <div className="lp-hero-stage">
        <div className="lp-hero-copy">
          <p className="lp-hero-brand lp-hero-fade">
            <BrandMark size={44} />
          </p>
          <h1 id="lp-hero-title" className="lp-display">
            {HERO.title.map((line) => (
              <span key={line} className="lp-hero-line">
                <span>{line}</span>
              </span>
            ))}
          </h1>
          <p className="lp-hero-lead lp-hero-fade">{HERO.lead}</p>
          <div className="lp-hero-ctas lp-hero-fade">
            <GlassButton tone="tinted" size="lg" onClick={onEnter}>
              {HERO.primary} <ArrowRight aria-hidden />
            </GlassButton>
            <GlassButton size="lg" onClick={onSignIn}>
              {NAV.signIn}
            </GlassButton>
          </div>
          <ul className="lp-hero-note lp-hero-fade">
            {HERO.note.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
        <div className="lp-ipad-wrap" aria-hidden>
          <div className="lp-ipad-in">
            <div className="lp-ipad">
              <div className="lp-ipad-screen">
                <IpadApp />
                <div className="lp-hero-notice liquid">
                  <span className="lp-notice-icon">
                    <BellRing />
                  </span>
                  <span>
                    <b>Examen de Biología en 3 días</b>
                    <small>Repasa los temas 4–6 · Órbita</small>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* La frase que se ilumina                                                    */
/* -------------------------------------------------------------------------- */

function Statement() {
  const root = useRef<HTMLElement>(null);
  const words = MANIFESTO.split(" ");
  useGsap(root, (el) => {
    gsap.fromTo(
      el.querySelectorAll(".lp-word"),
      { opacity: 0.16 },
      {
        opacity: 1,
        ease: "none",
        stagger: 0.1,
        scrollTrigger: {
          trigger: el.querySelector(".lp-statement-text"),
          start: "top 78%",
          end: "bottom 45%",
          scrub: 0.8,
        },
      },
    );
  });
  return (
    <section ref={root} className="lp-statement" aria-label="Qué es Órbita">
      <p className="lp-statement-text" aria-label={MANIFESTO}>
        {words.map((w, i) => (
          <span
            key={i}
            className={`lp-word${/^Órbita$|^hoy\.$/.test(w) ? " em" : ""}`}
            aria-hidden
          >
            {w}{" "}
          </span>
        ))}
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Lo esencial: galería horizontal fijada                                     */
/* -------------------------------------------------------------------------- */

function VisualToday() {
  return (
    <div className="lp-v lp-v-today">
      <div className="lp-v-exam">
        <div className="lp-ring sm" style={vars({ "--v": 0.7 })}>
          <svg viewBox="0 0 44 44" aria-hidden>
            <circle cx="22" cy="22" r="18" className="track" />
            <circle cx="22" cy="22" r="18" className="value" pathLength="100" />
          </svg>
          <b>3</b>
        </div>
        <span>
          <b>Examen de Biología</b>
          <small>En 3 días · temas 4–6</small>
        </span>
      </div>
      <ul className="lp-v-list">
        {TASKS.slice(0, 3).map((t, i) => (
          <li key={t.title} className={i === 0 ? "done" : ""}>
            <span className="lp-check">
              <Check />
            </span>
            <span className="lp-task-text">
              <b>{t.title}</b>
              <small>
                <i style={{ background: t.color }} />
                {t.subject}
              </small>
            </span>
            <time>{t.time}</time>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VisualVoice() {
  return (
    <div className="lp-v lp-v-voice">
      <div className="lp-wave" aria-hidden>
        {Array.from({ length: 28 }, (_, i) => (
          <i
            key={i}
            style={vars({
              "--d": `${(i * 73) % 900}ms`,
              "--h": 0.3 + ((i * 37) % 70) / 100,
            })}
          />
        ))}
      </div>
      <p className="lp-v-said">«Tengo mates el viernes»</p>
      <div className="lp-v-made liquid">
        <span className="lp-v-made-dot" />
        <span>
          <b>Examen de Matemáticas</b>
          <small>Viernes · creado por el asistente</small>
        </span>
        <span className="lp-v-undo">
          <RotateCcw /> Deshacer
        </span>
      </div>
    </div>
  );
}

function VisualGrades() {
  return (
    <div className="lp-v lp-v-grades">
      <div className="lp-ring xl" style={vars({ "--v": 0.64 })}>
        <svg viewBox="0 0 44 44" aria-hidden>
          <circle cx="22" cy="22" r="18" className="track" />
          <circle cx="22" cy="22" r="18" className="value" pathLength="100" />
        </svg>
        <b className="lp-num">6,4</b>
      </div>
      <p>Necesitas en el examen final para sacar un 7.</p>
    </div>
  );
}

function VisualFlight() {
  return (
    <div className="lp-v lp-v-flight">
      <div className="lp-pass-mini">
        <small>Tarjeta de embarque · Hoy</small>
        <div className="lp-mini-route big">
          <span>
            <small>Madrid</small>
            <b>MAD</b>
          </span>
          <span className="line">
            <i />
            <Plane />
          </span>
          <span className="end">
            <small>Roma</small>
            <b>FCO</b>
          </span>
        </div>
        <div className="lp-pass-cols">
          <span>
            <small>Duración</small>
            <b>50 min</b>
          </span>
          <span>
            <small>Puerta</small>
            <b>B7</b>
          </span>
          <span>
            <small>Asiento</small>
            <b>12A</b>
          </span>
        </div>
      </div>
    </div>
  );
}

const VISUALS = {
  today: VisualToday,
  voice: VisualVoice,
  grades: VisualGrades,
  flight: VisualFlight,
};

function Highlights() {
  const root = useRef<HTMLElement>(null);
  useGsap(root, (el) => {
    const track = el.querySelector<HTMLElement>(".lp-hl-track")!;
    const distance = () => track.scrollWidth - el.clientWidth;
    const move = gsap.to(track, {
      x: () => -distance(),
      ease: "none",
      scrollTrigger: {
        trigger: el,
        start: "top top",
        end: () => `+=${distance()}`,
        scrub: 1,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });
    // Dentro de cada tarjeta, la ilustración va un poco más despacio.
    el.querySelectorAll<HTMLElement>(".lp-hl-visual").forEach((v) => {
      gsap.fromTo(
        v,
        { xPercent: 10 },
        {
          xPercent: -6,
          ease: "none",
          scrollTrigger: {
            trigger: v,
            containerAnimation: move,
            start: "left right",
            end: "right left",
            scrub: true,
          },
        },
      );
    });
    gsap.to(el.querySelector(".lp-hl-progress i"), {
      scaleX: 1,
      ease: "none",
      scrollTrigger: {
        trigger: el,
        start: "top top",
        end: () => `+=${distance()}`,
        scrub: true,
      },
    });
  });
  return (
    <section
      ref={root}
      className="lp-hl"
      id="funciones"
      aria-labelledby="lp-hl-title"
    >
      <div className="lp-hl-inner">
        <header className="lp-hl-head">
          <h2 id="lp-hl-title" className="lp-h2">
            {HIGHLIGHTS_TITLE}
          </h2>
          <span className="lp-hl-progress" aria-hidden>
            <i />
          </span>
        </header>
        <div className="lp-hl-track">
          {HIGHLIGHTS.map((h) => {
            const Visual = VISUALS[h.id];
            return (
              <article key={h.id} className={`lp-hl-card lp-hl-${h.id}`}>
                <div className="lp-hl-copy">
                  <p className="lp-kicker">{h.kicker}</p>
                  <h3 className="lp-h3">{h.title}</h3>
                  <p className="lp-body">{h.text}</p>
                </div>
                <div className="lp-hl-visual" aria-hidden>
                  <Visual />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Asistente: el mensaje se escribe con el desplazamiento                      */
/* -------------------------------------------------------------------------- */

function Assistant() {
  const root = useRef<HTMLElement>(null);
  const [typed, setTyped] = useState(() =>
    reducedMotion() ? ASSISTANT_DEMO.prompt.length : 0,
  );
  const [stage, setStage] = useState(() => (reducedMotion() ? 2 : 0)); // 0 escribiendo · 1 respuesta · 2 en el calendario
  const ch = CHAPTERS[1];
  useGsap(root, (el) => {
    const q = gsap.utils.selector(el);
    const len = ASSISTANT_DEMO.prompt.length;
    const tl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: el,
        start: "top top",
        end: "+=170%",
        scrub: 0.8,
        pin: q(".lp-as-stage")[0],
        anticipatePin: 1,
        onUpdate: (self) => {
          const p = self.progress;
          setTyped(Math.round(clamp01((p - 0.06) / 0.4) * len));
          setStage(p > 0.62 ? 2 : p > 0.5 ? 1 : 0);
        },
      },
    });
    tl.fromTo(
      q(".lp-as-phone"),
      { y: 60, rotate: -4 },
      { y: -20, rotate: 0, duration: 1 },
      0,
    )
      .fromTo(
        q(".lp-as-chip-a"),
        { autoAlpha: 0, x: -40, scale: 0.9 },
        { autoAlpha: 1, x: 0, scale: 1, duration: 0.12, ease: "back.out(1.7)" },
        0.64,
      )
      .fromTo(
        q(".lp-as-chip-b"),
        { autoAlpha: 0, x: 40, scale: 0.9 },
        { autoAlpha: 1, x: 0, scale: 1, duration: 0.12, ease: "back.out(1.7)" },
        0.7,
      )
      .fromTo(q(".lp-as-copy"), { y: 30 }, { y: -30, duration: 1 }, 0);
  });
  const prompt = ASSISTANT_DEMO.prompt;
  const days = ["L", "M", "X", "J", "V"];
  const dayKeys = ["Lun", "Mar", "Mié", "Jue", "Vie"];
  return (
    <section ref={root} className="lp-as" aria-labelledby="lp-as-title">
      <div className="lp-as-stage">
        <div className="lp-as-copy">
          <p className="lp-kicker">{ch.kicker}</p>
          <h2 id="lp-as-title" className="lp-h2">
            {ch.title}
          </h2>
          <p className="lp-body">{ch.text}</p>
          <p className="lp-small">{"note" in ch ? ch.note : ""}</p>
        </div>
        <div className="lp-as-visual" aria-hidden>
          <div className="lp-as-phone">
            <div className="lp-phone-island" />
            <div
              className={`lp-phone-screen lp-chat${stage >= 2 ? " placed" : ""}`}
            >
              <div className="lp-chat-head">
                <small>Asistente</small>
                <b>Esta semana</b>
              </div>
              <div className="lp-cal">
                {days.map((d, i) => {
                  const card = ASSISTANT_DEMO.cards.find(
                    (c) => c.day === dayKeys[i]!.slice(0, 3),
                  );
                  return (
                    <div key={d} className="lp-cal-day">
                      <small>{d}</small>
                      <span className="lp-cal-slot">
                        {card && (
                          <span
                            className="lp-cal-card"
                            style={vars({ "--c": card.color })}
                          >
                            <b>{card.kind}</b>
                            {card.title.replace(/^(Entrega|Examen) de /, "")}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="lp-chat-body">
                {typed > 0 && (
                  <div className="lp-bubble me">
                    {prompt.slice(0, typed)}
                    {stage === 0 && typed < prompt.length && (
                      <i className="lp-caret" />
                    )}
                  </div>
                )}
                {stage >= 1 && (
                  <div className="lp-bubble bot">
                    {ASSISTANT_DEMO.reply}
                    <span className="lp-undo">
                      <RotateCcw /> Deshacer
                    </span>
                  </div>
                )}
              </div>
              <div className="lp-composer">
                <span>Pídele algo a Órbita…</span>
                <span
                  className={`lp-mic${typed > 0 && stage === 0 ? " live" : ""}`}
                >
                  <Mic />
                </span>
              </div>
            </div>
          </div>
          <div className="lp-as-chip lp-as-chip-a liquid">
            <span
              className="lp-chip-bar"
              style={vars({ "--c": "var(--sub-plum)" })}
            />
            <span>
              <small>Jueves · Tarea</small>
              <b>Entrega de Lengua</b>
            </span>
          </div>
          <div className="lp-as-chip lp-as-chip-b liquid">
            <span
              className="lp-chip-bar"
              style={vars({ "--c": "var(--sub-sky)" })}
            />
            <span>
              <small>Viernes · Examen</small>
              <b>Matemáticas</b>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Notas: el calculador de cristal sobre un fondo de pantalla                 */
/* -------------------------------------------------------------------------- */

function Slider({
  label,
  value,
  set,
  min = 0,
  weight,
}: {
  label: string;
  value: number;
  set: (n: number) => void;
  min?: number;
  weight?: string;
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
        onChange={(e) => set(Number(e.target.value))}
        style={vars({ "--v": (value - min) / (10 - min) })}
      />
      <b className="lp-num">{decimal(value)}</b>
    </label>
  );
}

function Grades() {
  const root = useRef<HTMLElement>(null);
  const [first, setFirst] = useState(7.5);
  const [second, setSecond] = useState(6);
  const [target, setTarget] = useState(7);
  const need = (target - first * 0.3 - second * 0.3) / 0.4;
  const state =
    need <= 0 ? "done" : need > 10 ? "out" : need >= 8 ? "hard" : "ok";
  useGsap(root, (el) => {
    const q = gsap.utils.selector(el);
    gsap.fromTo(
      q(".lp-wall-img"),
      { scale: 1.18, yPercent: -6 },
      {
        scale: 1,
        yPercent: 6,
        ease: "none",
        scrollTrigger: {
          trigger: q(".lp-wall")[0],
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      },
    );
    gsap.fromTo(
      q(".lp-calc"),
      { y: 120, rotateX: 14, autoAlpha: 0.4 },
      {
        y: 0,
        rotateX: 0,
        autoAlpha: 1,
        ease: "power3.out",
        scrollTrigger: {
          trigger: q(".lp-wall")[0],
          start: "top 85%",
          end: "top 25%",
          scrub: 1,
        },
      },
    );
    gsap.fromTo(
      q(".lp-wall-chip"),
      { y: 60, autoAlpha: 0 },
      {
        y: 0,
        autoAlpha: 1,
        stagger: 0.15,
        ease: "power3.out",
        scrollTrigger: {
          trigger: q(".lp-wall")[0],
          start: "top 60%",
          end: "top 10%",
          scrub: 1,
        },
      },
    );
  });
  return (
    <section ref={root} className="lp-grades" aria-labelledby="lp-grades-title">
      <header className="lp-center-head">
        <p className="lp-kicker">{CHAPTERS[2].kicker}</p>
        <h2 id="lp-grades-title" className="lp-h2">
          {CHAPTERS[2].title}
        </h2>
        <p className="lp-body">{CHAPTERS[2].text}</p>
      </header>
      <div className="lp-wall">
        <div className="lp-wall-img" aria-hidden />
        <div className="lp-wall-chip lp-wall-chip-a liquid" aria-hidden>
          <small>Media del curso</small>
          <b className="lp-num">7,8</b>
        </div>
        <div className="lp-wall-chip lp-wall-chip-b liquid" aria-hidden>
          <small>Física y Química</small>
          <b>Parcial 1 · 7,5</b>
        </div>
        <div className="lp-calc liquid">
          <div className="lp-calc-head">
            <small>Física y Química</small>
            <b>¿Qué nota necesito?</b>
          </div>
          <Slider
            label="Primer parcial"
            weight="30 %"
            value={first}
            set={setFirst}
          />
          <Slider
            label="Segundo parcial"
            weight="30 %"
            value={second}
            set={setSecond}
          />
          <Slider label="Quiero sacar" value={target} set={setTarget} min={5} />
          <div className={`lp-need ${state}`} aria-live="polite">
            {state === "done" ? (
              <span>Ya lo tienes, saques lo que saques en el final.</span>
            ) : state === "out" ? (
              <span>
                Con un 10 en el final llegarías a un{" "}
                <b className="lp-num">
                  {decimal(first * 0.3 + second * 0.3 + 4)}
                </b>
                .
              </span>
            ) : (
              <span>
                Necesitas un{" "}
                <b className="lp-num" key={decimal(need)}>
                  {decimal(Math.max(0, need))}
                </b>{" "}
                en el examen final (40 %).
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Modo Estudio: el vuelo avanza con el desplazamiento                        */
/* -------------------------------------------------------------------------- */

function flightLayout(w: number, h: number) {
  if (w >= 960) {
    const r = Math.max(w * 0.82, h * 1.1);
    return { r, cx: w * 0.47, cy: h * 0.5 + r };
  }
  const r = w * 1.3;
  return { r, cx: w / 2, cy: h * 0.46 + r };
}

function StudyFlight() {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const globe = useRef<DotGlobe | null>(null);
  const progress = useRef(reducedMotion() ? 0.62 : 0.02);
  const route = { from: FLIGHT.from, to: FLIGHT.to };

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const g = DotGlobe.create(c, {
      arcs: [route],
      center: { lat: -8, lon: 4 },
      mode: "progress",
      layout: flightLayout,
    });
    globe.current = g;
    if (!g) return;
    const total = FLIGHT.minutes * 60;
    let geo = "";
    g.onFrame = () => {
      const p = progress.current;
      const { r, cx, cy } = g.geometry();
      const key = `${r.toFixed(1)}:${cx.toFixed(1)}:${cy.toFixed(1)}`;
      if (key !== geo && body.current) {
        geo = key;
        body.current.style.width = `${2 * r}px`;
        body.current.style.left = `${cx}px`;
        body.current.style.top = `${cy}px`;
      }
      const a = g.project(
        arcPoint(route.from, route.to, Math.max(0.001, Math.min(0.999, p))),
      );
      const b = g.project(
        arcPoint(route.from, route.to, Math.min(1, p + 0.01)),
      );
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      if (plane.current) {
        plane.current.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0) rotate(${ang.toFixed(1)}deg)`;
        plane.current.style.opacity = p > 0.985 ? "0" : "1";
      }
      const left = Math.round(total * (1 - p));
      if (clock.current)
        clock.current.textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
      if (bar.current) bar.current.style.transform = `scaleX(${p.toFixed(4)})`;
    };
    g.setProgress(progress.current);
    return () => {
      g.dispose();
      globe.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useGsap(root, (el) => {
    const q = gsap.utils.selector(el);
    const state = { p: 0.02 };
    gsap.to(state, {
      p: 1,
      ease: "power1.inOut",
      scrollTrigger: {
        trigger: el,
        start: "top top",
        end: "+=200%",
        scrub: 1.2,
        pin: q(".lp-fl-stage")[0],
        anticipatePin: 1,
      },
      onUpdate: () => {
        progress.current = state.p;
        globe.current?.setProgress(state.p);
      },
    });
    gsap.from(q(".lp-fl-copy > *"), {
      y: 40,
      autoAlpha: 0,
      stagger: 0.08,
      duration: 1.1,
      ease: "expo.out",
      scrollTrigger: { trigger: el, start: "top 70%" },
    });
    gsap.fromTo(
      q(".lp-fl-pass"),
      { y: 80, rotate: 6, autoAlpha: 0 },
      {
        y: 0,
        rotate: 2,
        autoAlpha: 1,
        ease: "power3.out",
        scrollTrigger: {
          trigger: el,
          start: "top 60%",
          end: "top top",
          scrub: 1,
        },
      },
    );
  });

  return (
    <section
      ref={root}
      className="lp-fl lp-dark"
      data-tone="dark"
      id="estudio"
      aria-labelledby="lp-fl-title"
    >
      <div className="lp-fl-stage">
        <div className="lp-fl-globe" aria-hidden>
          <div ref={body} className="lp-fl-body" />
          <canvas ref={canvas} />
          <div ref={plane} className="lp-plane">
            <Plane />
          </div>
        </div>
        <div className="lp-fl-copy">
          <p className="lp-kicker">{FLIGHT.eyebrow}</p>
          <h2 id="lp-fl-title" className="lp-display lp-display-md">
            {FLIGHT.title.map((l) => (
              <span key={l}>{l} </span>
            ))}
          </h2>
          <p className="lp-body">{FLIGHT.lead}</p>
        </div>
        <div
          className="lp-fl-pass liquid"
          role="img"
          aria-label={`Tarjeta de embarque de ejemplo: ${FLIGHT.from.city} a ${FLIGHT.to.city}, ${FLIGHT.minutes} minutos de estudio`}
        >
          <div aria-hidden>
            <p className="lp-pass-kicker">Tarjeta de embarque · Hoy</p>
            <div className="lp-mini-route big">
              <span>
                <small>{FLIGHT.from.city}</small>
                <b>{FLIGHT.from.code}</b>
              </span>
              <span className="line">
                <i />
                <Plane />
              </span>
              <span className="end">
                <small>{FLIGHT.to.city}</small>
                <b>{FLIGHT.to.code}</b>
              </span>
            </div>
            <div className="lp-pass-bar">
              <span ref={bar} />
            </div>
            <div className="lp-pass-cols">
              <span>
                <small>Queda</small>
                <b ref={clock} className="lp-num">
                  {FLIGHT.minutes}:00
                </b>
              </span>
              <span>
                <small>Puerta</small>
                <b>{FLIGHT.gate}</b>
              </span>
              <span>
                <small>Asiento</small>
                <b>{FLIGHT.seat}</b>
              </span>
            </div>
            <ul className="lp-pass-points">
              {FLIGHT.points.map((pt) => (
                <li key={pt.title}>
                  <b>{pt.title}</b> {pt.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Funciona donde estés: rejilla de piezas                                    */
/* -------------------------------------------------------------------------- */

function Bento() {
  const root = useRef<HTMLElement>(null);
  const [plane, setPlane] = useState(true);
  const [done, setDone] = useState<Set<number>>(new Set([0]));
  useGsap(root, (el) => {
    gsap.from(el.querySelectorAll(".lp-bento-head > *"), {
      y: 40,
      autoAlpha: 0,
      stagger: 0.08,
      duration: 1.1,
      ease: "expo.out",
      scrollTrigger: { trigger: el, start: "top 75%" },
    });
    ScrollTrigger.batch(el.querySelectorAll(".lp-tile"), {
      start: "top 88%",
      once: true,
      onEnter: (batch) =>
        gsap.fromTo(
          batch,
          { y: 70, autoAlpha: 0, scale: 0.96 },
          {
            y: 0,
            autoAlpha: 1,
            scale: 1,
            stagger: 0.09,
            duration: 1.2,
            ease: "expo.out",
            overwrite: true,
          },
        ),
    });
  });
  const toggle = (i: number) =>
    setDone((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  return (
    <section
      ref={root}
      className="lp-bento-section"
      id="sin-conexion"
      aria-labelledby="lp-bento-title"
    >
      <header className="lp-bento-head lp-center-head">
        <h2 id="lp-bento-title" className="lp-h2">
          {BENTO_TITLE[0]}
          <br />
          <span className="lp-muted">{BENTO_TITLE[1]}</span>
        </h2>
      </header>
      <div className="lp-bento">
        <article className={`lp-tile lp-tile-offline${plane ? " plane" : ""}`}>
          <div className="lp-tile-copy">
            <h3>{BENTO.offline.title}</h3>
            <p>{BENTO.offline.text}</p>
          </div>
          <div className="lp-offline-ui">
            <button
              type="button"
              className="lp-airplane liquid"
              role="switch"
              aria-checked={plane}
              onClick={() => setPlane((p) => !p)}
            >
              <span className="lp-airplane-icon">
                <Plane aria-hidden />
              </span>
              <span>Modo avión</span>
              <span className="lp-switch" aria-hidden>
                <i />
              </span>
            </button>
            <ul className="lp-offline-tasks">
              {TASKS.slice(0, 3).map((t, i) => (
                <li key={t.title}>
                  <button
                    type="button"
                    aria-pressed={done.has(i)}
                    onClick={() => toggle(i)}
                  >
                    <span className="lp-check">
                      <Check />
                    </span>
                    <span className="lp-task-text">
                      <b>{t.title}</b>
                      <small>
                        <i style={{ background: t.color }} />
                        {t.subject}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="lp-offline-foot" aria-live="polite">
              {plane ? (
                <>
                  <CloudOff aria-hidden /> Sin conexión. Todo sigue funcionando.
                </>
              ) : (
                <>
                  <Wifi aria-hidden /> Con conexión. Si tienes cuenta, se
                  sincroniza.
                </>
              )}
            </p>
          </div>
        </article>
        <article className="lp-tile lp-tile-icon">
          <span className="lp-tile-glyph" style={vars({ "--c": "#5e5ce6" })}>
            <UserRoundX />
          </span>
          <h3>{BENTO.account.title}</h3>
          <p>{BENTO.account.text}</p>
        </article>
        <article className="lp-tile lp-tile-icon">
          <span className="lp-tile-glyph" style={vars({ "--c": "#30b158" })}>
            <History />
          </span>
          <h3>{BENTO.backups.title}</h3>
          <p>{BENTO.backups.text}</p>
        </article>
        <article className="lp-tile lp-tile-icon">
          <span className="lp-tile-glyph" style={vars({ "--c": "#0a84ff" })}>
            <Download />
          </span>
          <h3>{BENTO.export.title}</h3>
          <p>{BENTO.export.text}</p>
        </article>
        <article className="lp-tile lp-tile-icon">
          <span className="lp-tile-glyph" style={vars({ "--c": "#ff3b30" })}>
            <BadgeX />
          </span>
          <h3>{BENTO.ads.title}</h3>
          <p>{BENTO.ads.text}</p>
        </article>
        <article className="lp-tile lp-tile-wide lp-tile-install">
          <div>
            <h3>{BENTO.install.title}</h3>
            <p>{BENTO.install.text}</p>
          </div>
          <div className="lp-install-steps" aria-hidden>
            <span className="liquid">
              <Share /> Compartir
            </span>
            <ChevronRight />
            <span className="liquid">
              <Plus /> Añadir a inicio
            </span>
            <ChevronRight />
            <span className="lp-install-icon">
              <BrandMark size={44} />
            </span>
          </div>
        </article>
        <a className="lp-tile lp-tile-link" href={`${BASE}${LEGAL.privacy}`}>
          <NotebookPen aria-hidden />
          <span>Cómo cuidamos tus datos</span>
          <ArrowRight aria-hidden />
        </a>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Precios                                                                    */
/* -------------------------------------------------------------------------- */

function Pricing({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLElement>(null);
  const [billing, setBilling] = useState<Billing>("annual");
  const annual = billing === "annual";
  const saving = Math.round((1 - PRICES.annual / (PRICES.monthly * 12)) * 100);
  useGsap(root, (el) => {
    const q = gsap.utils.selector(el);
    gsap.from(q(".lp-center-head > *"), {
      y: 40,
      autoAlpha: 0,
      stagger: 0.08,
      duration: 1.1,
      ease: "expo.out",
      scrollTrigger: { trigger: el, start: "top 75%" },
    });
    gsap.fromTo(
      q(".lp-plan"),
      { y: 90, autoAlpha: 0 },
      {
        y: 0,
        autoAlpha: 1,
        stagger: 0.12,
        duration: 1.3,
        ease: "expo.out",
        scrollTrigger: { trigger: q(".lp-plans")[0], start: "top 85%" },
      },
    );
    gsap.fromTo(
      q(".lp-price-wall"),
      { yPercent: -8 },
      {
        yPercent: 8,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      },
    );
  });
  return (
    <section
      ref={root}
      className="lp-pricing"
      id="precios"
      aria-labelledby="lp-pricing-title"
    >
      <div className="lp-price-wall" aria-hidden />
      <header className="lp-center-head">
        <p className="lp-kicker">Precios</p>
        <h2 id="lp-pricing-title" className="lp-h2">
          {PRICING.title}
        </h2>
        <div
          className="lp-seg liquid"
          role="radiogroup"
          aria-label="Periodo de pago"
          style={vars({ "--k": annual ? 1 : 0 })}
        >
          <span className="lp-seg-thumb" aria-hidden />
          <button
            type="button"
            role="radio"
            aria-checked={!annual}
            onClick={() => setBilling("monthly")}
          >
            Mensual
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={annual}
            onClick={() => setBilling("annual")}
          >
            Anual <span className="lp-save">−{saving} %</span>
          </button>
        </div>
      </header>
      <div className="lp-plans">
        <article className="lp-plan liquid">
          <h3>Gratis</h3>
          <p className="lp-price">
            <b className="lp-num">0 €</b>
            <small>para siempre</small>
          </p>
          <p className="lp-price-alt">Sin tarjeta y sin cuenta.</p>
          <ul className="lp-checks">
            {PRICING.free.map((f) => (
              <li key={f}>
                <Check aria-hidden />
                {f}
              </li>
            ))}
          </ul>
          <GlassButton className="lp-btn-block" onClick={onEnter}>
            Empezar gratis
          </GlassButton>
        </article>
        <article className="lp-plan lp-plan-premium liquid">
          <h3>
            Premium <span className="lp-badge">Más asistente</span>
          </h3>
          <p className="lp-price">
            <b key={billing} className="lp-price-swap lp-num">
              {euro(annual ? PRICES.annual : PRICES.monthly)}
            </b>
            <small>{annual ? "/año" : "/mes"}</small>
          </p>
          <p className="lp-price-alt">
            {annual
              ? `${euro(Math.floor((PRICES.annual / 12) * 100) / 100)} al mes, pagando el año`
              : "Cancelas cuando quieras"}
          </p>
          <ul className="lp-checks">
            {PRICING.premium.map((f) => (
              <li key={f}>
                <Check aria-hidden />
                {f}
              </li>
            ))}
          </ul>
          <p className="lp-quarter">{PRICING.quarterly}</p>
          <GlassButton tone="tinted" className="lp-btn-block" onClick={onEnter}>
            {PRICING.premiumCta}
            {PRICING.premiumCtaNote && <small>{PRICING.premiumCtaNote}</small>}
          </GlassButton>
        </article>
      </div>
      <div
        className="lp-offer liquid"
        role="group"
        aria-labelledby="lp-offer-title"
      >
        <div>
          <p className="lp-kicker">{OFFER.eyebrow}</p>
          <h3 id="lp-offer-title" className="lp-h3">
            {OFFER.title}
          </h3>
          <p className="lp-body">
            <WithEmail text={OFFER.text} />
          </p>
        </div>
        <div className="lp-offer-code" aria-hidden>
          <small>Código</small>
          <b>{OFFER.code}</b>
          <span>Premium · 12 meses</span>
        </div>
      </div>
      <p className="lp-fine">{PRICING.fine}</p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Preguntas, cierre y pie                                                    */
/* -------------------------------------------------------------------------- */

function Faq() {
  return (
    <section
      className="lp-faq-section"
      id="preguntas"
      aria-labelledby="lp-faq-title"
    >
      <header className="lp-center-head">
        <h2 id="lp-faq-title" className="lp-h2">
          Preguntas frecuentes
        </h2>
      </header>
      <div className="lp-faq">
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>
              {q}
              <Plus aria-hidden />
            </summary>
            <p>
              <WithEmail text={a} />
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Closing({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLElement>(null);
  useGsap(root, (el) => {
    const q = gsap.utils.selector(el);
    gsap.fromTo(
      q(".lp-close-icon"),
      { scale: 0.55, rotate: -14, y: 60 },
      {
        scale: 1,
        rotate: 0,
        y: 0,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top bottom",
          end: "center center",
          scrub: 1,
        },
      },
    );
    gsap.from(q(".lp-close-copy > *"), {
      y: 40,
      autoAlpha: 0,
      stagger: 0.1,
      duration: 1.2,
      ease: "expo.out",
      scrollTrigger: { trigger: el, start: "top 55%" },
    });
  });
  return (
    <section
      ref={root}
      className="lp-close lp-dark"
      data-tone="dark"
      aria-labelledby="lp-close-title"
    >
      <div className="lp-close-glow" aria-hidden />
      <div className="lp-close-icon" aria-hidden>
        <BrandMark size={132} />
      </div>
      <div className="lp-close-copy">
        <h2 id="lp-close-title" className="lp-display lp-display-md">
          {CLOSING.title[0]}
          <br />
          <span className="lp-muted">{CLOSING.title[1]}</span>
        </h2>
        <div className="lp-close-cta">
          <GlassButton tone="tinted" size="lg" onClick={onEnter}>
            {CLOSING.cta} <ArrowRight aria-hidden />
          </GlassButton>
        </div>
        <ul className="lp-hero-note">
          {HERO.note.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="lp-footer lp-dark" data-tone="dark">
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
        <small>
          © {year} {OWNER}
        </small>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------------------- */
/* Página                                                                     */
/* -------------------------------------------------------------------------- */

const CANVAS = "#f2f2f7";

export default function Landing({
  onEnter,
  onSignIn,
  preview,
}: {
  onEnter: () => void;
  onSignIn: () => void;
  preview?: boolean;
}) {
  useSmoothScroll();

  // Fuente de la visita (`?ref=tiktok-3`): ver visits.ts.
  useEffect(() => {
    if (!preview) trackVisit();
  }, [preview]);

  // Mientras se ve la web: título, color de la barra del sistema y fondo.
  useEffect(() => {
    const prevTitle = document.title;
    document.title = SEO.title;
    const html = document.documentElement;
    const prevBg = html.style.background;
    html.style.background = CANVAS;
    html.classList.add("lp-active");
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    const prevMeta = meta?.content;
    if (meta) meta.content = CANVAS;
    // Las fuentes y las imágenes pueden mover el diseño: recalcular al final.
    const t = window.setTimeout(() => ScrollTrigger.refresh(), 600);
    return () => {
      clearTimeout(t);
      document.title = prevTitle;
      html.style.background = prevBg;
      html.classList.remove("lp-active");
      if (meta && prevMeta) meta.content = prevMeta;
    };
  }, []);

  return (
    <div className="lp">
      <a className="lp-skip" href="#lp-main">
        Saltar al contenido
      </a>
      <NavBar onEnter={onEnter} onSignIn={onSignIn} />
      <main id="lp-main">
        <Hero onEnter={onEnter} onSignIn={onSignIn} />
        <Statement />
        <Highlights />
        <Assistant />
        <Grades />
        <StudyFlight />
        <Bento />
        <Pricing onEnter={onEnter} />
        <Faq />
        <Closing onEnter={onEnter} />
      </main>
      <Footer />
    </div>
  );
}
