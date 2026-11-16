import { useState } from 'react'
import { BellRing, Clock, PlaneLanding, Send } from 'lucide-react'

import {
  DEFAULT_DIGEST_HOUR,
  disableDigest,
  disableFlightAlerts,
  enableDigest,
  enableFlightAlerts,
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
 * Notificaciones, como grupo de Ajustes: el resumen diario y los avisos del
 * modo estudio (aterrizaje y escalas).
 *
 * Son voluntarias: no se pide permiso hasta que el alumno activa un
 * interruptor, y nunca al abrir la aplicación. Se guardan por dispositivo
 * (cada uno con su hora) y se pueden apagar aquí mismo o en los ajustes del
 * sistema.
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
  const flights = prefs.flights && permission() === 'granted'
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

  const toggleFlights = (on: boolean) => {
    if (on) {
      void run(
        enableFlightAlerts,
        'Listo. Te avisaré al aterrizar y en cada escala, aunque el dispositivo esté bloqueado.',
      )
    } else void run(disableFlightAlerts)
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
    'Inicia sesión para activarlas: los avisos salen del servidor, por eso llegan aunque la app esté cerrada.'
  ) : blocked ? (
    'Las notificaciones están bloqueadas para esta app. Actívalas en los ajustes del sistema.'
  ) : (
    'El resumen trae las tareas de hoy y los próximos exámenes a la hora elegida (peninsular española); si no hay nada pendiente, no se envía. Los avisos de vuelo llegan al aterrizar y al empezar y terminar cada escala.'
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
      <RowSwitch
        icon={PlaneLanding}
        tint="#0a84ff"
        label="Avisos de vuelo"
        checked={flights}
        onChange={toggleFlights}
        disabled={!available || busy}
      />
    </ListGroup>
  )
}
