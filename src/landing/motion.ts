/**
 * Motor de movimiento de la web: GSAP + ScrollTrigger y desplazamiento suave
 * con Lenis (solo rueda y trackpad; con el dedo, el desplazamiento nativo del
 * sistema, que en iPad e iPhone ya es perfecto).
 *
 * Todo lo ligado al desplazamiento usa `scrub` con inercia: la animación
 * persigue a la posición en vez de saltar con ella, que es lo que hace que
 * se sienta fluido y no «pegado» al dedo.
 *
 * Con «Reducir movimiento» no se crea nada: la página se ve en su estado
 * final y se desplaza como cualquier otra.
 */
import { useEffect, useLayoutEffect, type RefObject } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

export { gsap, ScrollTrigger }

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

let lenis: Lenis | null = null

/** Desplazamiento suave para toda la página mientras se ve la web. */
export function useSmoothScroll() {
  useEffect(() => {
    if (reducedMotion()) return
    lenis = new Lenis({
      lerp: 0.1,
      wheelMultiplier: 0.9,
      // El dedo, nativo: iOS ya tiene su inercia y no hay que imitarla.
      syncTouch: false,
    })
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (time: number) => lenis?.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(tick)
      lenis?.destroy()
      lenis = null
    }
  }, [])
}

/** Ir a una sección con el mismo desplazamiento suave. */
export function scrollToTarget(target: string | HTMLElement) {
  const el = typeof target === 'string' ? document.getElementById(target) : target
  if (!el) return
  if (lenis) lenis.scrollTo(el, { offset: -8, duration: 1.4 })
  else el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' })
}

/**
 * Animaciones de una sección, con limpieza automática al desmontar
 * (`gsap.context`). `setup` recibe la raíz y solo se llama sin «Reducir
 * movimiento».
 */
export function useGsap(scope: RefObject<HTMLElement | null>, setup: (root: HTMLElement) => void, deps: unknown[] = []) {
  useLayoutEffect(() => {
    const root = scope.current
    if (!root || reducedMotion()) return
    const ctx = gsap.context(() => setup(root), root)
    return () => ctx.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/**
 * Botón de cristal vivo, como los de iOS 26:
 * - Con ratón, se inclina unos píxeles hacia el cursor (magnético).
 * - Al pulsar (dedo o ratón), se hincha un poco; si arrastras sin soltar, se
 *   estira hacia ese lado con resistencia de goma; al soltar vuelve con un
 *   muelle.
 * Solo transform, con `gsap.quickTo`: nada de reflujo.
 */
export function useLiquidButton(ref: RefObject<HTMLElement | null>, strength = 0.26) {
  useEffect(() => {
    const el = ref.current
    if (!el || reducedMotion()) return
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const spring = { duration: 0.7, ease: 'elastic.out(1, 0.42)' }
    const follow = { duration: 0.35, ease: 'power3.out' }
    const to = (vars: gsap.TweenVars, how = spring) => gsap.to(el, { ...vars, ...how, overwrite: 'auto' })
    let down: { x: number; y: number } | null = null
    // Goma: cuanto más tiras, menos cede.
    const rubber = (d: number, max: number) => (max * d) / (Math.abs(d) + max)

    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      if (down) {
        const dx = e.clientX - down.x
        const dy = e.clientY - down.y
        const sx = Math.abs(rubber(dx, r.width)) / r.width
        const sy = Math.abs(rubber(dy, r.height)) / r.height
        to(
          {
            x: rubber(dx, 22),
            y: rubber(dy, 14),
            scaleX: 1.07 + sx * 0.22 - sy * 0.08,
            scaleY: 1.07 + sy * 0.22 - sx * 0.08,
          },
          follow,
        )
      } else if (fine) {
        to({ x: (e.clientX - (r.left + r.width / 2)) * strength, y: (e.clientY - (r.top + r.height / 2)) * strength }, follow)
      }
    }
    const press = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY }
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* sin captura: el estirado acaba al salir del botón */
      }
      to({ scaleX: 1.07, scaleY: 1.07 }, { duration: 0.28, ease: 'power3.out' })
    }
    const release = () => {
      if (!down) return
      down = null
      to({ x: 0, y: 0, scaleX: 1, scaleY: 1 })
    }
    const leave = () => {
      down = null
      to({ x: 0, y: 0, scaleX: 1, scaleY: 1 })
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerdown', press)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerdown', press)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      el.removeEventListener('pointerleave', leave)
    }
  }, [ref, strength])
}

/** Recalcula los disparadores cuando cambia algo que mueve el diseño. */
export function refreshTriggers() {
  ScrollTrigger.refresh()
}
