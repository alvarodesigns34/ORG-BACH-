/**
 * Safari de iPhone solo sube el teclado si el foco llega a un campo dentro
 * del propio toque. Para que «Apuntar» se abra con el teclado arriba, el «+»
 * enfoca al instante un campo invisible y la hoja pasa el foco a su campo al
 * montarse. Aquí se recuerda también a quién devolver el foco al cerrar (el
 * propio «+»), porque el campo invisible no es un sitio al que volver.
 */

const PRIMER_ID = 'keyboard-primer'
let returnTo: HTMLElement | null = null

export function primeKeyboard(): void {
  returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
  let proxy = document.getElementById(PRIMER_ID) as HTMLInputElement | null
  if (!proxy) {
    proxy = document.createElement('input')
    proxy.id = PRIMER_ID
    proxy.setAttribute('aria-hidden', 'true')
    proxy.tabIndex = -1
    proxy.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;pointer-events:none;'
    document.body.appendChild(proxy)
  }
  proxy.focus({ preventScroll: true })
}

/** Si el foco está en el campo invisible, el elemento al que volver (y lo olvida). */
export function primerReturnTarget(active: Element | null): HTMLElement | null | undefined {
  if (!active || active.id !== PRIMER_ID) return undefined
  const target = returnTo
  returnTo = null
  return target
}
