/**
 * Reflejo especular que sigue al dedo o al cursor sobre controles y paneles
 * de cristal (`.glass-btn`, `.glass-tinted`, `.glass-danger`, `.liquid`,
 * `.liquid-press`, `.filter-on`, `.card`): escribe `--gx`, `--gy` y `--g-on`
 * en un solo oyente pasivo por fotograma, sin re-render de React.
 * Con «reducir movimiento» la luz queda estática en su posición de reposo.
 */
const LIGHT_CONTROL = '.glass-btn, .glass-tinted, .glass-danger, .liquid, .liquid-press, .filter-on'

export function installGlassLight(): void {
  if (typeof window === 'undefined') return
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (media.matches) return

  let frame = 0
  let pending: { els: HTMLElement[]; clientX: number; clientY: number } | null = null
  let activeEls = new Set<HTMLElement>()

  const apply = () => {
    frame = 0
    if (!pending) return
    const { els, clientX, clientY } = pending
    pending = null

    const next = new Set(els)
    for (const prev of activeEls) {
      if (!next.has(prev)) prev.style.setProperty('--g-on', '0')
    }
    for (const el of els) {
      const rect = el.getBoundingClientRect()
      el.style.setProperty('--gx', `${(clientX - rect.left).toFixed(1)}px`)
      el.style.setProperty('--gy', `${(clientY - rect.top).toFixed(1)}px`)
      el.style.setProperty('--g-on', '1')
    }
    activeEls = next
  }

  const collect = (target: EventTarget | null): HTMLElement[] => {
    const node = target as Element | null
    if (!node?.closest) return []
    const els: HTMLElement[] = []
    const ctrl = node.closest(LIGHT_CONTROL)
    if (ctrl instanceof HTMLElement && ctrl.getAttribute('data-liquid') !== 'off') els.push(ctrl)
    const card = node.closest('.card')
    if (card instanceof HTMLElement && !els.includes(card)) els.push(card)
    return els
  }

  const track = (event: PointerEvent) => {
    const els = collect(event.target)
    if (els.length === 0) {
      if (activeEls.size > 0) {
        for (const prev of activeEls) prev.style.setProperty('--g-on', '0')
        activeEls.clear()
      }
      return
    }
    pending = { els, clientX: event.clientX, clientY: event.clientY }
    if (!frame) frame = requestAnimationFrame(apply)
  }

  const clearAll = () => {
    pending = null
    for (const el of activeEls) el.style.setProperty('--g-on', '0')
    activeEls.clear()
  }

  window.addEventListener('pointerdown', track, { passive: true })
  window.addEventListener('pointermove', track, { passive: true })
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse') clearAll()
  }, { passive: true })
  window.addEventListener('pointercancel', clearAll, { passive: true })
  window.addEventListener('blur', clearAll, { passive: true })
  document.addEventListener('pointerleave', clearAll, { passive: true })
}
