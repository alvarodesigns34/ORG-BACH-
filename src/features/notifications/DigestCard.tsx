import { useState } from 'react'
import { BellRing, Send, Share } from 'lucide-react'

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
import { Field, Select, Switch } from '@/ui/fields'
import { Button, Card, SectionHeader, cx } from '@/ui/primitives'

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6) // 06:00 – 23:00

/**
 * Resumen diario por notificación.
 *
 * Es voluntario: no se pide permiso hasta que el alumno activa el interruptor,
 * y nunca al abrir la aplicación. Se guarda por dispositivo (cada uno con su
 * hora) y se puede apagar aquí mismo o en los ajustes del sistema.
 */
export function DigestCard() {
  const sync = useSync()
  const support = pushSupport()
  const [prefs, setPrefs] = useState(loadPrefs)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null)

  if (sync.phase === 'unavailable') return null
  const signedIn = !!sync.email
  const blocked = permission() === 'denied'
  const enabled = prefs.enabled && permission() === 'granted'

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

  return (
    <Card>
      <SectionHeader
        title="Resumen diario"
        hint="Una notificación con las tareas de hoy y los próximos exámenes, aunque la app esté cerrada."
        className="mb-5"
      />

      {!support.ok && support.reason === 'needs-install' ? (
        <div className="flex gap-3 rounded-[14px] bg-fill px-4 py-3.5 text-[0.875rem] text-ink-2">
          <Share className="size-5 text-accent shrink-0 mt-0.5" />
          <p>
            En iPhone y iPad las notificaciones solo funcionan con la app instalada. Pulsa{' '}
            <strong className="text-ink">Compartir → Añadir a pantalla de inicio</strong>, abre la
            app desde el icono y vuelve aquí.
          </p>
        </div>
      ) : !support.ok ? (
        <p className="text-[0.875rem] text-ink-3">Este navegador no admite notificaciones push.</p>
      ) : !signedIn ? (
        <div className="flex gap-3 rounded-[14px] bg-fill px-4 py-3.5 text-[0.875rem] text-ink-2">
          <BellRing className="size-5 text-accent shrink-0 mt-0.5" />
          <p>
            Inicia sesión arriba para activarlo. El resumen se prepara en el servidor con tus datos
            sincronizados: por eso llega aunque la app esté cerrada.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <Switch
            checked={enabled}
            onChange={toggle}
            label="Recibir el resumen en este dispositivo"
            description={
              blocked
                ? 'Las notificaciones están bloqueadas. Actívalas para esta app en los ajustes del sistema.'
                : 'Si un día no hay nada pendiente, no se envía.'
            }
          />

          {enabled && (
            <div className="flex flex-wrap items-end gap-3 pt-5 border-t border-hairline">
              <Field
                label="Hora del aviso"
                hint="Hora peninsular española, con el cambio de hora incluido."
              >
                {({ id, describedBy }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    className="max-w-[9rem]"
                    value={String(prefs.hour)}
                    disabled={busy}
                    onChange={(e) => {
                      const hour = Number(e.target.value)
                      setPrefs((p) => ({ ...p, hour }))
                      void run(() => updateDigestHour(hour))
                    }}
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, '0')}:00
                        {h === DEFAULT_DIGEST_HOUR ? ' (recomendada)' : ''}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(sendTestDigest, 'Enviado. Debería llegarte en unos segundos.')
                }
              >
                <Send className="size-4" />
                Enviar prueba
              </Button>
            </div>
          )}

          {message && (
            <p
              role="status"
              className={cx(
                'text-[0.8125rem] rounded-[12px] px-3.5 py-2.5',
                message.tone === 'ok' ? 'bg-ok-quiet text-ok' : 'bg-danger-quiet text-danger',
              )}
            >
              {message.text}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}
