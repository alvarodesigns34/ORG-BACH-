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
 * Botón magnético: con ratón, se inclina hacia el cursor unos píxeles y
 * vuelve con un muelle al salir. Con el dedo no hace nada (ahí manda la
 * pulsación, que ya hunde el botón).
 */
export function useMagnetic(ref: RefObject<HTMLElement | null>, strength = 0.28) {
  useEffect(() => {
    const el = ref.current
    if (!el || reducedMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const x = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.45)' })
    const y = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.45)' })
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      x((e.clientX - (r.left + r.width / 2)) * strength)
      y((e.clientY - (r.top + r.height / 2)) * strength)
    }
    const leave = () => {
      x(0)
      y(0)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    }
  }, [ref, strength])
}

/** Recalcula los disparadores cuando cambia algo que mueve el diseño. */
export function refreshTriggers() {
  ScrollTrigger.refresh()
}
