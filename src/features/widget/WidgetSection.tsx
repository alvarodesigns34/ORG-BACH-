import { useEffect, useState } from 'react'
import { ClipboardCopy, KeyRound, LayoutGrid, Trash2 } from 'lucide-react'

import { SUPABASE_URL } from '@/sync/config'
import { getClient } from '@/sync/engine'
import { useSync } from '@/sync/useSync'
import { ListGroup, ListRow } from '@/ui/list'

import { scriptableScript } from './script'

const ENDPOINT = `${SUPABASE_URL}/functions/v1/widget`

type KeyState = { created: string; used: string | null } | null

/** «hace 5 min», «hace 2 h», «el 28 nov». */
function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  if (mins < 24 * 60) return `hace ${Math.round(mins / 60)} h`
  return `el ${new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
}

function explain(error: { code?: string; message?: string }): string {
  // PGRST202: la función no existe; el servidor aún no tiene la migración.
  if (error.code === 'PGRST202' || /function/i.test(error.message ?? '')) {
    return 'El widget aún no está activado en el servidor.'
  }
  return error.message || 'No se pudo completar. Inténtalo de nuevo.'
}

/**
 * Widget de la pantalla de inicio (con la app gratuita Scriptable): crea una
 * llave de solo lectura y copia el script ya preparado. La llave solo deja
 * ver las tareas de hoy y se puede revocar aquí en cualquier momento.
 */
export function WidgetSection() {
  const sync = useSync()
  const signedIn = !!sync.email
  const [key, setKey] = useState<KeyState | undefined>(undefined)
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null)

  useEffect(() => {
    if (!signedIn) return
    let alive = true
    void getClient().then(async (client) => {
      const { data, error } = await client.rpc('widget_key_status')
      if (!alive) return
      if (error) {
        setKey(null)
        setMessage({ tone: 'danger', text: explain(error) })
        return
      }
      const row = Array.isArray(data) ? data[0] : null
      setKey(row ? { created: row.created_at, used: row.last_used_at } : null)
    })
    return () => {
      alive = false
    }
  }, [signedIn])

  if (sync.phase === 'unavailable') return null

  const create = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const client = await getClient()
      const { data, error } = await client.rpc('create_widget_key')
      if (error) throw error
      setToken(String(data))
      setKey({ created: new Date().toISOString(), used: null })
    } catch (error) {
      setMessage({ tone: 'danger', text: explain(error as { code?: string; message?: string }) })
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const client = await getClient()
      const { error } = await client.rpc('revoke_widget_key')
      if (error) throw error
      setToken(null)
      setKey(null)
      setMessage({ tone: 'ok', text: 'Llave revocada. El widget dejará de mostrar tus tareas.' })
    } catch (error) {
      setMessage({ tone: 'danger', text: explain(error as { code?: string; message?: string }) })
    } finally {
      setBusy(false)
    }
  }

  // Se copia dentro del propio toque: Safari no deja copiar tras una espera.
  const copy = () => {
    if (!token) return
    navigator.clipboard.writeText(scriptableScript(ENDPOINT, token)).then(
      () => setMessage({ tone: 'ok', text: 'Script copiado. Pégalo en un script nuevo de Scriptable.' }),
      () => setMessage({ tone: 'danger', text: 'No se pudo copiar. Vuelve a pulsar.' }),
    )
  }

  const footer = message ? (
    <span className={message.tone === 'ok' ? 'text-ok' : 'text-danger'}>{message.text}</span>
  ) : !signedIn ? (
    'Inicia sesión para usarlo: el widget lee tus tareas sincronizadas.'
  ) : token ? (
    <>
      En Scriptable (gratis en el App Store): <strong className="text-ink-2">+</strong>, pega el
      script y guárdalo. Luego mantén pulsada la pantalla de inicio,{' '}
      <strong className="text-ink-2">+ → Scriptable → pequeño</strong>, y en el widget elige ese
      script. La llave solo se muestra ahora.
    </>
  ) : (
    'Tus tareas de hoy en la pantalla de inicio, con la app gratuita Scriptable. La llave solo permite ver esas tareas y puedes revocarla aquí.'
  )

  return (
    <ListGroup header="Widget" footer={footer} id="widget">
      {token ? (
        <ListRow icon={ClipboardCopy} tint="#5e5ce6" label="Copiar script para Scriptable" action="accent" onClick={copy} />
      ) : key ? (
        <>
          <ListRow
            icon={KeyRound}
            tint="#34c759"
            label="Llave activa"
            value={key.used ? `Usada ${ago(key.used)}` : 'Sin usar todavía'}
          />
          <ListRow
            icon={LayoutGrid}
            tint="#5e5ce6"
            label="Crear una llave nueva"
            detail="La anterior deja de funcionar"
            action="accent"
            disabled={busy}
            onClick={() => void create()}
          />
          <ListRow icon={Trash2} tint="#ff453a" label="Revocar llave" action="danger" disabled={busy} onClick={() => void revoke()} />
        </>
      ) : (
        <ListRow
          icon={LayoutGrid}
          tint="#5e5ce6"
          label="Crear widget de tareas"
          action="accent"
          disabled={!signedIn || busy || key === undefined}
          onClick={() => void create()}
        />
      )}
    </ListGroup>
  )
}
