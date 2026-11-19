/**
 * Liquid Glass reactivo: la física de los controles de cristal.
 *
 * En iOS 26 un botón de cristal no se «hunde» al tocarlo: se hincha, se
 * ilumina por dentro y, si arrastras el dedo, se estira hacia él como una
 * gota de agua con tensión superficial. Al soltar vuelve con un muelle que se
 * pasa un poco y se asienta. Este módulo hace eso para TODA la app con un solo
 * oyente delegado, sin re-render de React y escribiendo solo propiedades que
 * compone la GPU (`translate`, `scale` y una variable para el brillo).
 *
 * Qué entra: `.glass-btn`, `.glass-tinted`, `.liquid-press` y cualquier cosa
 * con `data-liquid`. `data-liquid="off"` lo excluye. Se usan las propiedades
 * individuales `translate`/`scale`, que se suman a un `transform` que ponga
 * Motion, así que no pisan sus animaciones de entrada.
 *
 * Con «reducir movimiento» no hay deformación: solo el brillo.
 */

const SELECTOR = '.glass-btn, .glass-tinted, .liquid-press, [data-liquid]'

/** Muelle amortiguado de un grado de libertad (integración semi-implícita). */
interface Spring {
  value: number
  velocity: number
  target: number
}

function spring(value: number): Spring {
  return { value, velocity: 0, target: value }
}

function stepSpring(s: Spring, dt: number, stiffness: number, damping: number): void {
  const force = stiffness * (s.target - s.value) - damping * s.velocity
  s.velocity += force * dt
  s.value += s.velocity * dt
}

function settled(s: Spring, eps: number): boolean {
  return Math.abs(s.target - s.value) < eps && Math.abs(s.velocity) < eps * 10
}

/** Banda elástica de iOS: cuanto más tiras, menos avanza. */
function rubber(distance: number, limit: number): number {
  const sign = Math.sign(distance)
  const d = Math.abs(distance)
  return sign * limit * (1 - 1 / (d / limit + 1))
}

interface LiquidState {
  el: HTMLElement
  x: Spring
  y: Spring
  sx: Spring
  sy: Spring
  glow: Spring
  /** El elemento ya traía `translate`/`scale` propios: solo brillo. */
  glowOnly: boolean
  pointerId: number | null
  originX: number
  originY: number
  w: number
  h: number
  grow: number
  hovering: boolean
  running: boolean
}

const states = new WeakMap<HTMLElement, LiquidState>()
const active = new Set<LiquidState>()
let frame = 0
let last = 0
let reduceMotion = false

function stateFor(el: HTMLElement): LiquidState {
  let st = states.get(el)
  if (!st) {
    const cs = getComputedStyle(el)
    st = {
      el,
      x: spring(0),
      y: spring(0),
      sx: spring(1),
      sy: spring(1),
      glow: spring(0),
      glowOnly: (cs.translate !== 'none' && cs.translate !== '') || (cs.scale !== 'none' && cs.scale !== ''),
      pointerId: null,
      originX: 0,
      originY: 0,
      w: 0,
      h: 0,
      grow: 1,
      hovering: false,
      running: false,
    }
    states.set(el, st)
    el.setAttribute('data-liq', '')
  }
  return st
}

function write(st: LiquidState): void {
  const { el } = st
  el.style.setProperty('--press', st.glow.value.toFixed(3))
  if (st.glowOnly || reduceMotion) return
  el.style.translate = `${st.x.value.toFixed(2)}px ${st.y.value.toFixed(2)}px`
  el.style.scale = `${st.sx.value.toFixed(4)} ${st.sy.value.toFixed(4)}`
}

function clear(st: LiquidState): void {
  const { el } = st
  el.style.removeProperty('--press')
  if (st.glowOnly || reduceMotion) return
  el.style.removeProperty('translate')
  el.style.removeProperty('scale')
}

function tick(now: number): void {
  // Paso fijo para que el muelle se comporte igual a 60 y a 120 Hz, y con
  // tope por si la pestaña estuvo en segundo plano.
  const elapsed = Math.min(0.064, (now - (last || now)) / 1000)
  last = now
  const steps = Math.max(1, Math.round(elapsed / (1 / 240)))
  const dt = elapsed / steps || 1 / 240
  for (const st of active) {
    const pressed = st.pointerId !== null
    for (let i = 0; i < steps; i++) {
      // Agarrado: muelle firme (sigue al dedo). Suelto: algo más blando y con
      // menos amortiguación, para que rebote como una gota.
      stepSpring(st.x, dt, pressed ? 900 : 420, pressed ? 46 : 19)
      stepSpring(st.y, dt, pressed ? 900 : 420, pressed ? 46 : 19)
      stepSpring(st.sx, dt, pressed ? 700 : 520, pressed ? 34 : 17)
      stepSpring(st.sy, dt, pressed ? 700 : 520, pressed ? 34 : 17)
      stepSpring(st.glow, dt, 380, pressed ? 30 : 34)
    }
    write(st)
    if (
      !pressed &&
      settled(st.x, 0.05) &&
      settled(st.y, 0.05) &&
      settled(st.sx, 0.0008) &&
      settled(st.sy, 0.0008) &&
      settled(st.glow, 0.004)
    ) {
      // En reposo bajo el cursor se queda levantado, pero sin gastar fotogramas.
      if (!st.hovering) clear(st)
      st.running = false
      active.delete(st)
    }
  }
  frame = active.size ? requestAnimationFrame(tick) : 0
  if (!frame) last = 0
}

function run(st: LiquidState): void {
  if (!st.running) {
    st.running = true
    active.add(st)
  }
  if (!frame) frame = requestAnimationFrame(tick)
}

function eligible(target: EventTarget | null): HTMLElement | null {
  const el = (target as Element | null)?.closest?.(SELECTOR)
  if (!(el instanceof HTMLElement)) return null
  if (el.getAttribute('data-liquid') === 'off') return null
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return null
  return el
}

/**
 * Cuánto se hincha: lo mismo en puntos para cualquier tamaño (un botón
 * redondo crece bastante, uno ancho apenas), con tope.
 */
function growFor(w: number, h: number): number {
  return 1 + Math.min(0.13, 7 / Math.max(w, h, 1))
}

function onDown(event: PointerEvent): void {
  if (event.button !== 0) return
  const el = eligible(event.target)
  if (!el) return
  const st = stateFor(el)
  const rect = el.getBoundingClientRect()
  st.pointerId = event.pointerId
  st.originX = event.clientX
  st.originY = event.clientY
  st.w = rect.width
  st.h = rect.height
  st.grow = growFor(rect.width, rect.height)
  st.sx.target = st.grow
  st.sy.target = st.grow
  st.glow.target = 1
  // El toque inicial empuja un poco la escala: se nota al instante aunque
  // el dedo no se mueva.
  st.sx.velocity += 2.4
  st.sy.velocity += 2.4
  run(st)
}

function onMove(event: PointerEvent): void {
  for (const st of active) {
    if (st.pointerId !== event.pointerId) continue
    const dx = event.clientX - st.originX
    const dy = event.clientY - st.originY
    // El cristal se desplaza hacia el dedo con resistencia creciente…
    const ex = rubber(dx, 12)
    const ey = rubber(dy, 12)
    st.x.target = ex
    st.y.target = ey
    // …y se estira en esa dirección conservando más o menos el volumen.
    const kx = Math.min(0.2, (Math.abs(ex) / Math.max(st.w, 24)) * 0.9)
    const ky = Math.min(0.2, (Math.abs(ey) / Math.max(st.h, 24)) * 0.9)
    st.sx.target = st.grow * (1 + kx - ky * 0.45)
    st.sy.target = st.grow * (1 + ky - kx * 0.45)
    // Si el dedo se aleja mucho, el botón «suelta» la luz: no se activará.
    const far = Math.hypot(dx, dy) > Math.max(st.w, st.h) * 0.5 + 56
    st.glow.target = far ? 0.25 : 1
  }
}

function release(event: PointerEvent): void {
  for (const st of active) {
    if (st.pointerId !== event.pointerId) continue
    st.pointerId = null
    st.x.target = 0
    st.y.target = 0
    const rest = st.hovering ? 1.02 : 1
    st.sx.target = rest
    st.sy.target = rest
    st.glow.target = st.hovering ? 0.35 : 0
  }
}

function onOver(event: PointerEvent): void {
  if (event.pointerType !== 'mouse') return
  const el = eligible(event.target)
  if (!el) return
  const st = stateFor(el)
  if (st.hovering) return
  st.hovering = true
  if (st.pointerId === null) {
    const lift = 1 + Math.min(0.04, 2 / Math.max(el.offsetWidth, el.offsetHeight, 1))
    st.sx.target = lift
    st.sy.target = lift
    st.glow.target = 0.35
  }
  run(st)
}

function onOut(event: PointerEvent): void {
  if (event.pointerType !== 'mouse') return
  const el = eligible(event.target)
  if (!el || el.contains(event.relatedTarget as Node | null)) return
  const st = states.get(el)
  if (!st) return
  st.hovering = false
  if (st.pointerId === null) {
    st.sx.target = 1
    st.sy.target = 1
    st.glow.target = 0
  }
  run(st)
}

let installed = false

export function installLiquid(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  reduceMotion = media.matches
  media.addEventListener('change', () => {
    reduceMotion = media.matches
  })
  const opts = { passive: true, capture: true } as const
  window.addEventListener('pointerdown', onDown, opts)
  window.addEventListener('pointermove', onMove, opts)
  window.addEventListener('pointerup', release, opts)
  window.addEventListener('pointercancel', release, opts)
  window.addEventListener('pointerover', onOver, opts)
  window.addEventListener('pointerout', onOut, opts)
  // Si la ventana pierde el foco con un dedo puesto, todo vuelve a su sitio.
  window.addEventListener('blur', () => {
    for (const st of active) {
      st.pointerId = null
      st.hovering = false
      st.x.target = st.y.target = 0
      st.sx.target = st.sy.target = 1
      st.glow.target = 0
    }
  })
}

// ---------------------------------------------------------------------------
// Indicador líquido (segmentos, pestañas): una lente que viaja entre opciones
// con un muelle y se estira según su velocidad, como una gota que se desliza.
// ---------------------------------------------------------------------------

export interface LiquidIndicator {
  /** Lleva la lente a una caja (coordenadas del contenedor). */
  to(box: { x?: number; w?: number; y?: number; h?: number }, immediate?: boolean): void
  /** El dedo la está arrastrando: sigue al dedo sin muelle lento. */
  drag(x: number): void
  /** Presión (0–1): la lente se hincha y se ilumina. */
  press(on: boolean): void
  destroy(): void
}

export function createLiquidIndicator(el: HTMLElement): LiquidIndicator {
  const x = spring(0)
  const w = spring(0)
  const y = spring(0)
  const h = spring(0)
  const p = spring(0)
  let raf = 0
  let lastT = 0
  let dragging = false
  let initialised = false
  let useW = false
  let useH = false
  let rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const paint = () => {
    // Estiramiento por velocidad: a más rápido, más larga y más fina.
    const vx = rm ? 0 : Math.min(1, Math.abs(x.velocity) / 2600)
    const vy = rm ? 0 : Math.min(1, Math.abs(y.velocity) / 2600)
    const stretchX = 1 + vx * 0.32 - vy * 0.1 + p.value * 0.08
    const stretchY = 1 + vy * 0.3 - vx * 0.18 + p.value * 0.14
    if (useW) el.style.width = `${w.value.toFixed(2)}px`
    if (useH) el.style.height = `${h.value.toFixed(2)}px`
    el.style.transform = `translate3d(${x.value.toFixed(2)}px, ${y.value.toFixed(2)}px, 0) scale(${stretchX.toFixed(4)}, ${stretchY.toFixed(4)})`
    el.style.setProperty('--press', p.value.toFixed(3))
  }

  const loop = (now: number) => {
    const elapsed = Math.min(0.064, (now - (lastT || now)) / 1000)
    lastT = now
    const steps = Math.max(1, Math.round(elapsed / (1 / 240)))
    const dt = elapsed / steps || 1 / 240
    for (let i = 0; i < steps; i++) {
      stepSpring(x, dt, dragging ? 1400 : 380, dragging ? 70 : 26)
      stepSpring(w, dt, 420, 30)
      stepSpring(y, dt, 380, 28)
      stepSpring(h, dt, 420, 30)
      stepSpring(p, dt, 420, 32)
    }
    paint()
    if (
      !dragging &&
      settled(x, 0.05) &&
      settled(w, 0.05) &&
      settled(y, 0.05) &&
      settled(h, 0.05) &&
      settled(p, 0.004)
    ) {
      raf = 0
      lastT = 0
      return
    }
    raf = requestAnimationFrame(loop)
  }
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(loop)
  }
  const snap = (s: Spring, v: number) => {
    s.value = v
    s.target = v
    s.velocity = 0
  }

  return {
    to(box, immediate) {
      rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (box.x !== undefined) x.target = box.x
      if (box.w !== undefined) {
        useW = true
        w.target = box.w
      }
      if (box.y !== undefined) y.target = box.y
      if (box.h !== undefined) {
        useH = true
        h.target = box.h
      }
      if (!initialised || immediate || rm) {
        initialised = true
        if (box.x !== undefined) snap(x, box.x)
        if (box.w !== undefined) snap(w, box.w)
        if (box.y !== undefined) snap(y, box.y)
        if (box.h !== undefined) snap(h, box.h)
        paint()
        return
      }
      kick()
    },
    drag(nx) {
      dragging = true
      x.target = nx
      kick()
    },
    press(on) {
      if (!on) dragging = false
      p.target = on ? 1 : 0
      kick()
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf)
    },
  }
}
