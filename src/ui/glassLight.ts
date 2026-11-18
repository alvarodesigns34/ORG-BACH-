/**
 * Reflejo que sigue al dedo o al cursor sobre los botones de cristal
 * (`.glass-btn`): escribe la posición en --gx/--gy y el CSS pinta ahí la luz.
 * Un solo oyente para toda la app, pasivo y sin re-render. Con «reducir
 * movimiento» la luz se queda quieta arriba.
 */
export function installGlassLight(): void {
  if (typeof window === 'undefined') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  let frame = 0
  let pending: { el: HTMLElement; x: number; y: number } | null = null
  const apply = () => {
    frame = 0
    if (!pending) return
    pending.el.style.setProperty('--gx', `${pending.x}px`)
    pending.el.style.setProperty('--gy', `${pending.y}px`)
    pending = null
  }
  const track = (event: PointerEvent) => {
    const el = (event.target as Element | null)?.closest?.('.glass-btn, .glass-tinted')
    if (!(el instanceof HTMLElement)) return
    const rect = el.getBoundingClientRect()
    pending = { el, x: event.clientX - rect.left, y: event.clientY - rect.top }
    if (!frame) frame = requestAnimationFrame(apply)
  }
  const leave = (event: PointerEvent) => {
    const el = (event.target as Element | null)?.closest?.('.glass-btn, .glass-tinted')
    if (el instanceof HTMLElement && !el.contains(event.relatedTarget as Node | null)) {
      el.style.removeProperty('--gx')
      el.style.removeProperty('--gy')
    }
  }
  window.addEventListener('pointerdown', track, { passive: true })
  window.addEventListener('pointermove', track, { passive: true })
  window.addEventListener('pointerout', leave, { passive: true })
}
