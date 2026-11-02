import { useState } from 'react'
import { BellRing, Clock, Send } from 'lucide-react'

import {
  DEFAULT_DIGEST_HOUR,
  disableDigest,
  enableDigest,
  loadPrefs,
  permission,
  pushSupport,
  sendTestDigest,
  updateDigestHour,
} from '@/push/push'
import { useSync } from '@/sync/useSync'
import { ListGroup, ListRow, RowSelect, RowSwitch } from '@/ui/list'

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6) // 06:00 – 23:00

/**
 * Resumen diario por notificación, como grupo de Ajustes.
 *
 * Es voluntario: no se pide permiso hasta que el alumno activa el interruptor,
 * y nunca al abrir la aplicación. Se guarda por dispositivo (cada uno con su
 * hora) y se puede apagar aquí mismo o en los ajustes del sistema.
 */
export function DigestSection() {
  const sync = useSync()
  const support = pushSupport()
  const [prefs, setPrefs] = useState(loadPrefs)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null)

  if (sync.phase === 'unavailable') return null
  const signedIn = !!sync.email
  const blocked = permission() === 'denied'
  const enabled = prefs.enabled && permission() === 'granted'
  const available = support.ok && signedIn

  const run = async (task: () => Promise<void>, ok?: string) => {
    setBusy(true)
    setMessage(null)
    try {
      await task()
      if (ok) setMessage({ tone: 'ok', text: ok })
    } catch (error) {
      setMessage({ tone: 'danger', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setPrefs(loadPrefs())
      setBusy(false)
    }
  }

  const toggle = (on: boolean) => {
    // `enableDigest` pide el permiso lo primero, dentro del gesto del clic:
    // Safari no muestra la petición si antes hay otra espera.
    if (on) void run(() => enableDigest(prefs.hour), 'Listo. Recibirás el resumen cada día.')
    else void run(disableDigest)
  }

  const footer = message ? (
    <span className={message.tone === 'ok' ? 'text-ok' : 'text-danger'}>{message.text}</span>
  ) : !support.ok && support.reason === 'needs-install' ? (
    <>
      En iPhone y iPad las notificaciones solo funcionan con la app instalada: pulsa{' '}
      <strong className="text-ink-2">Compartir → Añadir a pantalla de inicio</strong> y ábrela desde
      el icono.
    </>
  ) : !support.ok ? (
    'Este navegador no admite notificaciones push.'
  ) : !signedIn ? (
    'Inicia sesión para activarlo: el resumen se prepara en el servidor con tus datos sincronizados, por eso llega aunque la app esté cerrada.'
  ) : blocked ? (
    'Las notificaciones están bloqueadas para esta app. Actívalas en los ajustes del sistema.'
  ) : (
    'Las tareas de hoy y los próximos exámenes, a la hora elegida (peninsular española), aunque la app esté cerrada. Si no hay nada pendiente, no se envía.'
  )

  return (
    <ListGroup header="Notificaciones" footer={footer}>
      <RowSwitch
        icon={BellRing}
        tint="#ff453a"
        label="Resumen diario"
        checked={enabled}
        onChange={toggle}
        disabled={!available || busy}
      />
      {enabled && (
        <>
          <RowSelect
            icon={Clock}
            tint="#ff9f0a"
            label="Hora"
            value={String(prefs.hour)}
            onChange={(value) => {
              const hour = Number(value)
              setPrefs((p) => ({ ...p, hour }))
              void run(() => updateDigestHour(hour))
            }}
            options={HOURS.map((h) => ({
              value: String(h),
              label: `${String(h).padStart(2, '0')}:00${h === DEFAULT_DIGEST_HOUR ? ' (recomendada)' : ''}`,
            }))}
          />
          <ListRow
            icon={Send}
            tint="#5e5ce6"
            label="Enviar una prueba"
            disabled={busy}
            onClick={() => void run(sendTestDigest, 'Enviado. Debería llegarte en unos segundos.')}
          />
        </>
      )}
    </ListGroup>
  )
}
