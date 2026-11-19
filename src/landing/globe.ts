/**
 * Globo de puntos de la web de presentación (WebGL 1, sin dependencias).
 *
 * Unos 6.500 puntos de tierra (máscara de Natural Earth codificada en bits,
 * ver landDots.ts) y unas rutas de vuelo dibujadas como estelas de puntos. El
 * cuerpo del planeta (degradado, brillo, atmósfera) es CSS detrás del lienzo:
 * así el lienzo solo pinta puntos y cuesta muy poco a la GPU.
 *
 * - Se pausa fuera de pantalla y con la pestaña oculta.
 * - Con «Reducir movimiento», un solo fotograma quieto.
 * - Sin WebGL, no pinta nada: el planeta de CSS sigue ahí.
 */
import { LAND_BITS, LAND_ROWS } from './landDots'

export interface LatLon {
  lat: number
  lon: number
}
export interface ArcSpec {
  from: LatLon
  to: LatLon
  /** Desfase del ciclo (0–1) en el modo `loop`. */
  phase?: number
}
export interface GlobeOptions {
  arcs: ArcSpec[]
  /** Punto que mira a la cámara al empezar. */
  center: LatLon
  /** Grados por segundo de giro propio (0 = quieto). */
  spin?: number
  /** `loop`: estelas que van y vienen. `progress`: un vuelo que avanza con `setProgress`. */
  mode?: 'loop' | 'progress'
  /** Radio del globo en fracción del lado menor del lienzo. */
  scale?: number
  /** Desplazamiento vertical del centro, en fracción del alto (0 = centrado). */
  offsetY?: number
  /** Radio y centro a medida (px CSS), en vez de `scale` y `offsetY`. */
  layout?: (w: number, h: number) => { r: number; cx: number; cy: number }
}

const DEG = Math.PI / 180

function toVec(lat: number, lon: number, r = 1): [number, number, number] {
  const la = lat * DEG
  const lo = lon * DEG
  return [r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo)]
}

/** Puntos de tierra como vectores unitarios. */
function landPoints(): Float32Array {
  const bin = atob(LAND_BITS)
  const out: number[] = []
  let k = 0
  for (let i = 0; i < LAND_ROWS; i++) {
    const lat = -90 + ((i + 0.5) * 180) / LAND_ROWS
    const n = Math.max(1, Math.round(2 * LAND_ROWS * Math.cos(lat * DEG)))
    for (let j = 0; j < n; j++, k++) {
      if (bin.charCodeAt(k >> 3) & (1 << (k & 7))) {
        const lon = -180 + ((j + 0.5) * 360) / n
        out.push(...toVec(lat, lon))
      }
    }
  }
  return new Float32Array(out)
}

const ARC_STEPS = 96

/** Punto de una ruta: interpolación esférica con altura en forma de arco. */
export function arcPoint(a: LatLon, b: LatLon, t: number): [number, number, number] {
  const p = toVec(a.lat, a.lon)
  const q = toVec(b.lat, b.lon)
  const dot = Math.min(1, Math.max(-1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]))
  const w = Math.acos(dot)
  const s = Math.sin(w) || 1
  const ka = Math.sin((1 - t) * w) / s
  const kb = Math.sin(t * w) / s
  const h = 1 + Math.sin(Math.PI * t) * Math.min(0.3, 0.03 + w * 0.3)
  return [(p[0] * ka + q[0] * kb) * h, (p[1] * ka + q[1] * kb) * h, (p[2] * ka + q[2] * kb) * h]
}

const VERT = `
attribute vec3 aPos;
attribute vec3 aMeta; // x: 0 tierra / 1 ruta / 2 aeropuerto; y: t en la ruta; z: desfase
uniform mat3 uRot;
uniform vec2 uScale;
uniform vec2 uCenter;
uniform float uDot;
uniform float uTime;
uniform float uProgress;
uniform float uMode;
varying float vAlpha;
varying float vKind;
varying float vHead;
void main() {
  vec3 p = uRot * aPos;
  float kind = aMeta.x;
  vKind = kind;
  float front = smoothstep(-0.12, 0.2, p.z);
  // Detrás del planeta solo se ve lo que asoma por fuera del disco.
  float outside = step(1.0, length(p.xy));
  float visible = max(front, outside);
  float size = uDot;
  float alpha = 1.0;
  vHead = 0.0;
  if (kind < 0.5) {
    // Tierra: escorzo hacia el borde y luz del sol arriba a la izquierda.
    vec3 sun = normalize(vec3(-0.55, 0.55, 0.65));
    float lit = clamp(dot(p, sun) * 0.9 + 0.45, 0.25, 1.0);
    size *= mix(0.45, 1.0, clamp(p.z, 0.0, 1.0));
    alpha = mix(0.08, 1.0, front) * lit;
  } else if (kind < 1.5) {
    float t = aMeta.y;
    float head;
    float a;
    if (uMode < 0.5) {
      head = fract(uTime * 0.11 + aMeta.z) * 1.7 - 0.2;
      float d = head - t;
      a = d >= 0.0 ? exp(-d * 3.2) * step(d, 1.0) : 0.0;
      a = max(a, 0.16);
    } else {
      head = uProgress;
      float d = head - t;
      a = d >= 0.0 ? 0.95 : 0.18 * step(0.5, fract(t * 48.0));
    }
    vHead = smoothstep(0.03, 0.0, abs(head - t));
    size *= 1.6 + vHead * 3.2;
    alpha = a * mix(0.15, 1.0, visible);
  } else {
    // Aeropuertos: un pulso que se abre y se apaga.
    float ph = fract(uTime * 0.5 + aMeta.z);
    size *= 1.4 + ph * 5.0;
    alpha = (1.0 - ph) * 0.8 * front;
  }
  vAlpha = alpha;
  gl_PointSize = size;
  gl_Position = vec4(p.x * uScale.x + uCenter.x, p.y * uScale.y + uCenter.y, -p.z * 0.5, 1.0);
}`

const FRAG = `
precision mediump float;
varying float vAlpha;
varying float vKind;
varying float vHead;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  float a;
  vec3 col;
  if (vKind < 0.5) {
    a = smoothstep(0.5, 0.3, r);
    col = vec3(0.93, 0.97, 1.0);
  } else if (vKind < 1.5) {
    a = smoothstep(0.5, 0.0, r);
    col = mix(vec3(0.36, 0.66, 1.0), vec3(0.92, 0.97, 1.0), vHead);
  } else {
    a = smoothstep(0.5, 0.42, r) * smoothstep(0.28, 0.4, r);
    col = vec3(0.55, 0.8, 1.0);
  }
  gl_FragColor = vec4(col * a * vAlpha, a * vAlpha);
}`

export const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export class DotGlobe {
  private gl: WebGLRenderingContext
  private prog: WebGLProgram
  private count = 0
  private loc: Record<string, WebGLUniformLocation | null> = {}
  private raf = 0
  private running = false
  private start = performance.now()
  private yaw: number
  private pitch: number
  private extraYaw = 0
  private progress = 0
  private width = 0
  private height = 0
  private dpr = 1
  private io?: IntersectionObserver
  private ro?: ResizeObserver
  private onScreen = true
  private reduced = prefersReducedMotion()
  private disposed = false

  /** Intenta crear el globo; sin WebGL devuelve null. */
  static create(canvas: HTMLCanvasElement, opts: GlobeOptions): DotGlobe | null {
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' })
    if (!gl) return null
    try {
      return new DotGlobe(canvas, gl, opts)
    } catch {
      return null
    }
  }

  private constructor(
    private canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext,
    private opts: GlobeOptions,
  ) {
    this.gl = gl
    this.yaw = -opts.center.lon * DEG
    this.pitch = opts.center.lat * DEG
    this.prog = this.program()
    this.buffers()
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.disable(gl.DEPTH_TEST)

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.io = new IntersectionObserver(([e]) => {
      this.onScreen = !!e?.isIntersecting
      this.sync()
    }, { rootMargin: '80px' })
    this.io.observe(canvas)
    document.addEventListener('visibilitychange', this.sync)
    canvas.addEventListener('webglcontextlost', this.lost)
    this.resize()
  }

  private program(): WebGLProgram {
    const gl = this.gl
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
      return s
    }
    const p = gl.createProgram()!
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link')
    gl.useProgram(p)
    for (const u of ['uRot', 'uScale', 'uCenter', 'uDot', 'uTime', 'uProgress', 'uMode']) this.loc[u] = gl.getUniformLocation(p, u)
    return p
  }

  private buffers() {
    const gl = this.gl
    const land = landPoints()
    const pos: number[] = Array.from(land)
    const meta: number[] = []
    for (let i = 0; i < land.length / 3; i++) meta.push(0, 0, 0)
    this.opts.arcs.forEach((arc, i) => {
      const phase = arc.phase ?? i / this.opts.arcs.length
      for (let s = 0; s <= ARC_STEPS; s++) {
        const t = s / ARC_STEPS
        pos.push(...arcPoint(arc.from, arc.to, t))
        meta.push(1, t, phase)
      }
      for (const end of [arc.from, arc.to]) {
        pos.push(...toVec(end.lat, end.lon, 1.002))
        meta.push(2, 0, phase + (end === arc.to ? 0.5 : 0))
      }
    })
    this.count = pos.length / 3
    const bind = (data: number[], name: string) => {
      const b = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, b)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW)
      const l = gl.getAttribLocation(this.prog, name)
      gl.enableVertexAttribArray(l)
      gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0)
    }
    bind(pos, 'aPos')
    bind(meta, 'aMeta')
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.width = Math.max(1, rect.width)
    this.height = Math.max(1, rect.height)
    this.canvas.width = Math.round(this.width * this.dpr)
    this.canvas.height = Math.round(this.height * this.dpr)
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    this.draw(performance.now())
  }

  /** Radio y centro del globo en píxeles CSS (para colocar cosas encima). */
  geometry(): { r: number; cx: number; cy: number } {
    if (this.opts.layout) return this.opts.layout(this.width, this.height)
    const r = Math.min(this.width, this.height) * (this.opts.scale ?? 0.46)
    return { r, cx: this.width / 2, cy: (this.height / 2) * (1 - (this.opts.offsetY ?? 0)) }
  }

  /** Giro añadido desde fuera (p. ej., al desplazar la página), en grados. */
  setExtraYaw(deg: number) {
    this.extraYaw = deg * DEG
    if (!this.running) this.draw(performance.now())
  }

  /** Punto que mira a la cámara (para una cámara que sigue al avión). */
  setView(lat: number, lon: number) {
    this.yaw = -lon * DEG
    this.pitch = lat * DEG
  }

  /** Vuelve a pintar ahora (si no está en marcha el bucle). */
  redraw() {
    if (!this.running) this.draw(performance.now())
  }

  setProgress(p: number) {
    this.progress = Math.min(1, Math.max(0, p))
    if (!this.running) this.draw(performance.now())
  }

  private rotation(now: number): number[] {
    const spin = this.reduced ? 0 : (this.opts.spin ?? 0)
    const yaw = this.yaw + this.extraYaw + ((now - this.start) / 1000) * spin * DEG
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch)
    // Primero el giro (eje Y), después la inclinación (eje X). Columnas para GLSL.
    return [cy, sp * sy, -cp * sy, 0, cp, sp, sy, -sp * cy, cp * cy]
  }

  /** Posición en pantalla (px CSS, desde la esquina del lienzo) de un punto de una ruta. */
  project(v: [number, number, number]): { x: number; y: number; front: boolean } {
    const m = this.rotation(this.lastNow)
    const x = m[0]! * v[0] + m[3]! * v[1] + m[6]! * v[2]
    const y = m[1]! * v[0] + m[4]! * v[1] + m[7]! * v[2]
    const z = m[2]! * v[0] + m[5]! * v[1] + m[8]! * v[2]
    const { r, cx, cy } = this.geometry()
    return { x: cx + x * r, y: cy - y * r, front: z > -0.05 || Math.hypot(x, y) > 1 }
  }

  private lastNow = performance.now()

  private draw(now: number) {
    if (this.disposed) return
    this.onBeforeFrame?.(now)
    this.lastNow = now
    const gl = this.gl
    const { r, cx, cy } = this.geometry()
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniformMatrix3fv(this.loc.uRot!, false, this.rotation(now))
    gl.uniform2f(this.loc.uScale!, (2 * r) / this.width, (2 * r) / this.height)
    gl.uniform2f(this.loc.uCenter!, (2 * cx) / this.width - 1, 1 - (2 * cy) / this.height)
    gl.uniform1f(this.loc.uDot!, Math.min(3.4, Math.max(1.7, r / 140)) * this.dpr)
    gl.uniform1f(this.loc.uTime!, this.reduced ? 3.2 : (now - this.start) / 1000)
    gl.uniform1f(this.loc.uProgress!, this.progress)
    gl.uniform1f(this.loc.uMode!, this.opts.mode === 'progress' ? 1 : 0)
    gl.drawArrays(gl.POINTS, 0, this.count)
    this.onFrame?.(now)
  }

  /** Se llama antes de cada fotograma (para mover la cámara). */
  onBeforeFrame?: (now: number) => void

  /** Se llama tras cada fotograma (para mover lo que va encima del globo). */
  onFrame?: (now: number) => void

  private loop = (now: number) => {
    if (!this.running) return
    this.draw(now)
    this.raf = requestAnimationFrame(this.loop)
  }

  private sync = () => {
    const should = !this.disposed && !this.reduced && this.onScreen && document.visibilityState === 'visible'
    if (should && !this.running) {
      this.running = true
      this.raf = requestAnimationFrame(this.loop)
    } else if (!should && this.running) {
      this.running = false
      cancelAnimationFrame(this.raf)
    }
  }

  private lost = (e: Event) => {
    e.preventDefault()
    this.dispose()
  }

  dispose() {
    this.disposed = true
    this.running = false
    cancelAnimationFrame(this.raf)
    this.io?.disconnect()
    this.ro?.disconnect()
    document.removeEventListener('visibilitychange', this.sync)
    this.canvas.removeEventListener('webglcontextlost', this.lost)
  }
}
