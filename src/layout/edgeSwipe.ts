import { useEffect, type RefObject } from 'react'

import { skipNextTransition } from '@/router'
import { haptic } from '@/ui/motion'

/** Desde dónde empieza el gesto (px desde el borde izquierdo). */
const EDGE = 24
/** Cuánto hay que arrastrar (fracción del ancho) o a qué velocidad (px/ms). */
const DISTANCE = 0.35
const FLICK = 0.45

function installed(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/**
 * Volver deslizando desde el borde izquierdo, como en iOS: la pantalla sigue
 * al dedo y, al soltar, vuelve o se va según la distancia y la velocidad.
 *
 * Solo en la app instalada: en Safari ese gesto ya es del navegador (vuelve
 * atrás con su propia animación) y competir con él daría dos animaciones.
 * Solo con el dedo, nunca con ratón o trackpad.
 */
export function useEdgeSwipeBack(
  target: RefObject<HTMLElement | null>,
  backHref: string | undefined,
  /** Cambia con cada pantalla: el elemento es otro. */
  screenKey: string,
): void {
  useEffect(() => {
    const el = target.current
    if (!el || !backHref || !installed()) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let startX = 0
    let startY = 0
    let lastX = 0
    let lastT = 0
    let velocity = 0
    // Sin esto, el navegador se queda el arrastre horizontal (pointercancel)
    // en cuanto el dedo se mueve. El desplazamiento vertical sigue igual y
    // las filas que se deslizan en horizontal son contenedores propios.
    const root = document.documentElement
    root.style.touchAction = 'pan-y pinch-zoom'
    let tracking = false
    let decided = false
    let pointer = -1

    const reset = () => {
      tracking = false
      decided = false
      pointer = -1
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      // El borde de la pantalla o, en iPad con barra lateral, el borde
      // izquierdo del contenido (junto a la barra), como en las apps de iPadOS.
      const left = Math.max(0, el.getBoundingClientRect().left)
      if (e.clientX > EDGE && Math.abs(e.clientX - left) > EDGE) return
      tracking = true
      decided = false
      pointer = e.pointerId
      startX = lastX = e.clientX
      startY = e.clientY
      lastT = e.timeStamp
      velocity = 0
    }

    const onMove = (e: PointerEvent) => {
      if (!tracking || e.pointerId !== pointer) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (!decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        // Si el dedo va más en vertical, es desplazamiento: no es el gesto.
        if (Math.abs(dy) > Math.abs(dx) || dx < 0) return reset()
        decided = true
        el.style.willChange = 'transform'
        // La pantalla se separa como una hoja: fondo propio a toda altura.
        el.style.background = 'var(--c-canvas)'
        el.style.minHeight = '100dvh'
      }
      const dt = Math.max(1, e.timeStamp - lastT)
      velocity = 0.8 * ((e.clientX - lastX) / dt) + 0.2 * velocity
      lastX = e.clientX
      lastT = e.timeStamp
      el.style.transform = `translate3d(${Math.max(0, dx)}px,0,0)`
      el.style.boxShadow = '-12px 0 32px rgb(0 0 0 / 0.12)'
    }

    const onUp = (e: PointerEvent) => {
      if (!tracking || e.pointerId !== pointer) return
      const wasDragging = decided
      reset()
      if (!wasDragging) return
      const dx = Math.max(0, e.clientX - startX)
      const width = window.innerWidth - Math.max(0, el.getBoundingClientRect().left - dx)
      // Si el dedo se paró antes de soltar, no hay lanzamiento.
      if (e.timeStamp - lastT > 90) velocity = 0
      const leave = dx > width * DISTANCE || velocity > FLICK
      const from = `translate3d(${dx}px,0,0)`
      const clear = () => {
        el.style.transform = ''
        el.style.boxShadow = ''
        el.style.willChange = ''
        el.style.background = ''
        el.style.minHeight = ''
      }
      if (leave) {
        haptic()
        const remaining = Math.max(120, Math.min(260, (width - dx) / Math.max(velocity, 1.2)))
        el.animate([{ transform: from }, { transform: `translate3d(${width}px,0,0)` }], {
          duration: remaining,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
          fill: 'forwards',
        }).finished.then(() => {
          skipNextTransition()
          window.location.hash = backHref.slice(1)
          requestAnimationFrame(() => {
            el.getAnimations().forEach((a) => a.cancel())
            clear()
          })
        })
      } else {
        el.animate([{ transform: from }, { transform: 'translate3d(0,0,0)' }], {
          duration: 320,
          easing: 'cubic-bezier(0.2, 0.9, 0.25, 1.1)',
        })
        clear()
      }
    }

    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      root.style.touchAction = ''
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [target, backHref, screenKey])
}
