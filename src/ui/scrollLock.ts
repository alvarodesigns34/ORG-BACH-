/**
 * Bloqueo del fondo mientras hay diálogos abiertos.
 *
 * Es UNO para toda la app, con contador. Antes cada diálogo guardaba y
 * devolvía `body.style.overflow` por su cuenta: con dos abiertos a la vez
 * (un formulario y su «¿Eliminar?») que se cierran en el mismo render, el
 * segundo en cerrarse restauraba el «hidden» que había guardado del primero
 * y la página se quedaba sin poder desplazarse — los botones seguían
 * funcionando, pero no se podía bajar.
 */

let locks = 0
let saved = { overflow: '', paddingRight: '' }

export function lockScroll(doc: Document = document): () => void {
  const { body } = doc
  if (locks === 0) {
    saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight }
    // Se compensa el ancho de la barra para que la página no salte de lado.
    const gap = (doc.defaultView?.innerWidth ?? 0) - doc.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (gap > 0) body.style.paddingRight = `${gap}px`
    doc.getElementById('root')?.setAttribute('inert', '')
  }
  locks += 1

  let released = false
  return () => {
    if (released) return
    released = true
    locks = Math.max(0, locks - 1)
    if (locks === 0) {
      body.style.overflow = saved.overflow
      body.style.paddingRight = saved.paddingRight
      doc.getElementById('root')?.removeAttribute('inert')
    }
  }
}

/** Para pruebas. */
export function activeScrollLocks(): number {
  return locks
}
