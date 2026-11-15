import { useEffect, useState } from 'react'

/** Tema que se está viendo de verdad (resuelve «Automático»). */
export function useResolvedTheme(): 'light' | 'dark' {
  const read = () =>
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  const [theme, setTheme] = useState<'light' | 'dark'>(read)
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return theme
}

/** Un reloj que avanza cada `ms` mientras `active`. */
export function useNow(active: boolean, ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [active, ms])
  return now
}

/**
 * Mantiene la pantalla encendida mientras `active`: el iPad no se bloquea
 * en mitad del vuelo. El sistema suelta el bloqueo al cambiar de app, así que
 * se vuelve a pedir al regresar.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const request = async () => {
      try {
        const next = await navigator.wakeLock.request('screen')
        if (cancelled) void next.release()
        else lock = next
      } catch {
        // Batería baja o permiso denegado: el vuelo sigue igual.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request()
    }
    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => {})
    }
  }, [active])
}
