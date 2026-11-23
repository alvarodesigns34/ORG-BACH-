/**
 * Movimiento: los muelles de toda la app y la respuesta háptica.
 *
 * Un muelle, a diferencia de una curva con duración fija, se puede interrumpir
 * a mitad: si el dedo cambia de idea, la animación sigue desde donde está y
 * con la velocidad que lleva. Es lo que hace que una hoja o una pestaña se
 * sientan «agarradas» al dedo y no reproducidas.
 *
 * Tres caracteres, y solo tres, para que la app se mueva como una sola cosa.
 */

import { useEffect, useState } from 'react'
import type { Transition } from 'motion/react'

export const spring = {
  /** Respuesta directa a un toque: pestañas, selectores, casillas. */
  snappy: { type: 'spring', visualDuration: 0.25, bounce: 0.16 },
  /** Superficies que entran o salen: hojas, páginas, menús. */
  smooth: { type: 'spring', visualDuration: 0.36, bounce: 0.1 },
  /** Algo que se celebra o que se suelta: completar, soltar una tarjeta. */
  bouncy: { type: 'spring', visualDuration: 0.4, bounce: 0.3 },
} as const satisfies Record<string, Transition>

/** Salidas: más rápidas que las entradas y sin rebote. */
export const exitFast: Transition = { duration: 0.16, ease: [0.32, 0, 0.67, 0] }

// ---------------------------------------------------------------------------
// Háptica
// ---------------------------------------------------------------------------

let hapticLabel: HTMLLabelElement | null = null

function iosTick() {
  // Safari en iOS no implementa `navigator.vibrate`, pero desde iOS 17.4 un
  // <input type="checkbox" switch> da el toque háptico del sistema al cambiar.
  // Pulsar su etiqueta dentro de un gesto del usuario lo dispara.
  if (!hapticLabel) {
    hapticLabel = document.createElement('label')
    hapticLabel.setAttribute('aria-hidden', 'true')
    hapticLabel.style.display = 'none'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    input.tabIndex = -1
    hapticLabel.appendChild(input)
    document.head.appendChild(hapticLabel)
  }
  hapticLabel.click()
}

/**
 * Toque háptico. Solo tiene efecto dentro de un gesto del usuario y en
 * dispositivos que lo admiten; en el resto no hace nada.
 */
export function haptic(kind: 'tick' | 'success' = 'tick'): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(kind === 'success' ? [8, 50, 14] : 8)
      return
    }
    if (typeof document === 'undefined') return
    iosTick()
    if (kind === 'success') setTimeout(iosTick, 110)
  } catch {
    // Sin háptica disponible.
  }
}

// ---------------------------------------------------------------------------
// Consultas de medios
// ---------------------------------------------------------------------------

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

/** Pantalla táctil como entrada principal (iPhone, iPad sin ratón). */
export function useCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)')
}
