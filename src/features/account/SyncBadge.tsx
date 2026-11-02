import { Cloud, CloudCheck, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'

import { hrefFor } from '@/router'
import { useSync } from '@/sync/useSync'
import { cx } from '@/ui/primitives'

/**
 * Estado de la sincronización en una línea.
 *
 * Discreto a propósito: cuando todo va bien no reclama atención. Solo cambia
 * de tono cuando hay algo que el alumno debería saber (sin conexión con
 * cambios pendientes, o un error).
 */
export function SyncBadge({ className }: { className?: string }) {
  const status = useSync()
  if (status.phase === 'unavailable' || status.phase === 'loading') return null

  let icon = <CloudCheck className="size-3.5" strokeWidth={2.2} />
  let text = 'Sincronizado'
  let tone = 'text-ink-3'

  switch (status.phase) {
    case 'signed-out':
      icon = <Cloud className="size-3.5" strokeWidth={2.2} />
      text = 'Solo en este dispositivo'
      break
    case 'linking':
    case 'syncing':
      icon = (
        <RefreshCw className="size-3.5 animate-spin [animation-duration:1.4s]" strokeWidth={2.2} />
      )
      text = 'Sincronizando…'
      break
    case 'needs-choice':
      icon = <TriangleAlert className="size-3.5" strokeWidth={2.2} />
      text = 'Elige cómo combinar tus datos'
      tone = 'text-warn'
      break
    case 'offline':
      icon = <CloudOff className="size-3.5" strokeWidth={2.2} />
      text = status.pending > 0 ? `Sin conexión · ${status.pending} por subir` : 'Sin conexión'
      break
    case 'error':
      icon = <TriangleAlert className="size-3.5" strokeWidth={2.2} />
      text = 'Error al sincronizar'
      tone = 'text-danger'
      break
  }

  return (
    <a
      href={hrefFor('ajustes', { seccion: 'cuenta' })}
      className={cx(
        'inline-flex items-center gap-1.5 text-[0.75rem] font-medium rounded-full',
        'hover:text-ink transition-colors duration-150',
        tone,
        className,
      )}
      aria-live="polite"
    >
      {icon}
      <span className="truncate">{text}</span>
    </a>
  )
}
