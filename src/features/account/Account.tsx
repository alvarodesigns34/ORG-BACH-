import { useEffect, useState, type FormEvent } from 'react'
import { Cloud, CloudCheck, CloudOff, Mail, ShieldCheck } from 'lucide-react'

import { syncEngine } from '@/sync/engine'
import { useSync } from '@/sync/useSync'
import { Checkbox, Field, Input } from '@/ui/fields'
import { ConfirmDialog, Modal } from '@/ui/Modal'
import { Button, Segmented } from '@/ui/primitives'
import { ListGroup, ListRow } from '@/ui/list'

// ---------------------------------------------------------------------------
// Formulario de acceso
// ---------------------------------------------------------------------------

type Mode = 'entrar' | 'crear'

/**
 * Correo y contraseña. Se eligió sobre el «enlace mágico» porque en la PWA de
 * iPhone los enlaces del correo se abren en Safari, no en la app instalada, y
 * la sesión quedaría en el sitio equivocado. Con contraseña se entra desde la
 * propia app.
 */
export function AuthForm({ onDone }: { onDone?: () => void }) {
  const [mode, setMode] = useState<Mode>('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setInfo(null)
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Escribe un correo válido.')
      return
    }
    if (mode === 'crear' && password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'entrar') {
        const failure = await syncEngine.signIn(email, password)
        if (failure) setError(failure)
        else onDone?.()
      } else {
        const result = await syncEngine.signUp(email, password)
        if (result.error) setError(result.error)
        else if (result.needsConfirmation) {
          setInfo(
            `Te hemos enviado un correo a ${email.trim()}. Abre el enlace para confirmar la cuenta y vuelve aquí para iniciar sesión.`,
          )
          setMode('entrar')
          setPassword('')
        } else onDone?.()
      }
    } finally {
      setBusy(false)
    }
  }

  const forgot = async () => {
    setError(null)
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Escribe tu correo arriba y vuelve a pulsar «¿Has olvidado la contraseña?».')
      return
    }
    setBusy(true)
    const failure = await syncEngine.sendPasswordReset(email)
    setBusy(false)
    if (failure) setError(failure)
    else setInfo('Te hemos enviado un enlace para elegir una contraseña nueva.')
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Segmented
        label="Acceso"
        value={mode}
        onChange={(m) => {
          setMode(m)
          setError(null)
        }}
        options={[
          { value: 'entrar', label: 'Iniciar sesión' },
          { value: 'crear', label: 'Crear cuenta' },
        ]}
        className="self-start"
      />
      <Field label="Correo electrónico">
        {({ id }) => (
          <Input
            id={id}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </Field>
      <Field label="Contraseña" hint={mode === 'crear' ? 'Al menos 8 caracteres.' : undefined}>
        {({ id, describedBy }) => (
          <Input
            id={id}
            type="password"
            aria-describedby={describedBy}
            autoComplete={mode === 'crear' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>

      {error && (
        <p
          role="alert"
          className="text-[0.8125rem] text-danger bg-danger-quiet rounded-[12px] px-3.5 py-2.5"
        >
          {error}
        </p>
      )}
      {info && (
        <p
          role="status"
          className="text-[0.8125rem] text-ok bg-ok-quiet rounded-[12px] px-3.5 py-2.5 flex gap-2"
        >
          <Mail className="size-4 shrink-0 mt-0.5" />
          {info}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Un momento…' : mode === 'entrar' ? 'Iniciar sesión' : 'Crear cuenta'}
        </Button>
        {mode === 'entrar' && (
          <button
            type="button"
            onClick={forgot}
            disabled={busy}
            className="text-[0.8125rem] font-medium text-accent hover:underline underline-offset-4"
          >
            ¿Has olvidado la contraseña?
          </button>
        )}
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Tarjeta de Ajustes
// ---------------------------------------------------------------------------

function relativeTime(at: number | null): string {
  if (!at) return 'todavía no'
  const seconds = Math.round((Date.now() - at) / 1000)
  if (seconds < 45) return 'ahora mismo'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return new Date(at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

/** Texto corto del estado, para la fila «Estado». */
function statusText(status: ReturnType<typeof useSync>): string {
  switch (status.phase) {
    case 'syncing':
    case 'linking':
      return 'Sincronizando…'
    case 'offline':
      return status.pending > 0 ? `Sin conexión · ${status.pending} por subir` : 'Sin conexión'
    case 'error':
      return 'Error'
    case 'needs-choice':
      return 'Falta elegir cómo combinar'
    default:
      return `Al día · ${relativeTime(status.lastSyncAt)}`
  }
}

/**
 * Cuenta y sincronización, como grupo de una lista de Ajustes.
 *
 * Sin sesión: una sola fila que abre la hoja de acceso. Con sesión: la
 * cuenta, el estado y las acciones, con las destructivas en rojo y al final.
 */
export function AccountSection() {
  const status = useSync()
  const [signingIn, setSigningIn] = useState(false)
  const [confirmOut, setConfirmOut] = useState(false)
  const [wipe, setWipe] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // Refresca «hace X min» sin depender de que cambie otra cosa.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  if (status.phase === 'unavailable') return null
  const signedIn = !!status.email

  return (
    <>
      <ListGroup
        id="cuenta"
        header="Cuenta y sincronización"
        footer={
          status.error ? (
            <span className="text-danger">{status.error}</span>
          ) : message ? (
            message
          ) : signedIn ? (
            'Los cambios se guardan al instante aquí y se sincronizan solos con tus otros dispositivos, también al recuperar la conexión.'
          ) : (
            'Opcional. Con una cuenta tienes tu curso en el móvil y en el ordenador, y recibes el resumen diario.'
          )
        }
      >
        {status.phase === 'loading' ? (
          <ListRow icon={Cloud} tint="#0a84ff" label="Comprobando la sesión…" />
        ) : !signedIn ? (
          <ListRow
            icon={Cloud}
            tint="#0a84ff"
            label="Iniciar sesión o crear cuenta"
            onClick={() => setSigningIn(true)}
          />
        ) : (
          <>
            <ListRow icon={Mail} tint="#0a84ff" label="Cuenta" value={status.email} />
            <ListRow
              icon={status.phase === 'offline' ? CloudOff : CloudCheck}
              tint={status.phase === 'error' ? 'var(--c-danger)' : '#30b158'}
              label="Estado"
              value={statusText(status)}
            />
            <ListRow
              label="Sincronizar ahora"
              action="accent"
              disabled={status.phase === 'syncing'}
              onClick={() => syncEngine.kick()}
            />
            <ListRow label="Cerrar sesión" action="accent" onClick={() => setConfirmOut(true)} />
            <ListRow
              label="Eliminar cuenta"
              action="danger"
              onClick={() => setConfirmDelete(true)}
            />
          </>
        )}
      </ListGroup>

      <Modal open={signingIn} onClose={() => setSigningIn(false)} title="Tu cuenta" size="sm">
        <ul className="flex flex-col gap-3 mb-6 text-[0.875rem] text-ink-2">
          <li className="flex gap-3">
            <CloudCheck className="size-5 text-accent shrink-0" />
            Los cambios se guardan al instante en el dispositivo y se sincronizan solos al recuperar
            la conexión.
          </li>
          <li className="flex gap-3">
            <ShieldCheck className="size-5 text-accent shrink-0" />
            Solo tú puedes ver tus datos. Si editas lo mismo en dos sitios sin conexión, se
            conservan los cambios de ambos.
          </li>
        </ul>
        <AuthForm onDone={() => setSigningIn(false)} />
      </Modal>

      <Modal
        open={confirmOut}
        onClose={() => setConfirmOut(false)}
        title="Cerrar sesión"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOut(false)}>
              Cancelar
            </Button>
            <Button
              variant={wipe ? 'dangerFill' : 'primary'}
              onClick={async () => {
                setConfirmOut(false)
                await syncEngine.signOut(wipe)
                setWipe(false)
              }}
            >
              Cerrar sesión
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[0.875rem] text-ink-2 leading-relaxed">
            Tus datos siguen en la cuenta. En este dispositivo se quedan también, y lo que cambies
            se subirá cuando vuelvas a entrar con la misma cuenta.
          </p>
          <Checkbox
            checked={wipe}
            onChange={setWipe}
            label="Borrar también los datos de este dispositivo (ordenador compartido)"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false)
          const failure = await syncEngine.deleteAccount()
          setMessage(
            failure
              ? `No se pudo eliminar la cuenta: ${failure}`
              : 'Cuenta eliminada. Tus datos siguen en este dispositivo.',
          )
        }}
        title="Eliminar la cuenta"
        message="Se borrarán la cuenta y todo lo guardado en la nube, en todos tus dispositivos conectados. Lo que hay en este dispositivo se conserva. Esta acción no se puede deshacer."
        confirmLabel="Eliminar cuenta"
        destructive
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Diálogos globales
// ---------------------------------------------------------------------------

/**
 * Este dispositivo ya tenía un curso y la cuenta también. Juntar en silencio
 * podía duplicar asignaturas; sustituir en silencio, perder trabajo. Decide el
 * alumno, y la opción que borra algo descarga antes una copia.
 */
export function LinkChoiceDialog() {
  const status = useSync()
  const [busy, setBusy] = useState(false)
  const open = status.phase === 'needs-choice'

  const choose = async (choice: 'merge' | 'remote') => {
    setBusy(true)
    await syncEngine.resolveLink(choice)
    setBusy(false)
  }

  return (
    <Modal
      open={open}
      onClose={() => void syncEngine.signOut(false)}
      title="Ya tienes datos en esta cuenta"
      description={status.email ?? undefined}
      size="sm"
    >
      <div className="flex flex-col gap-3">
        <p className="text-[0.875rem] text-ink-2 leading-relaxed">
          Este dispositivo también tiene un curso guardado. ¿Qué quieres hacer?
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => choose('merge')}
          className="pressable text-left rounded-[16px] bg-accent-quiet px-4 py-3.5"
        >
          <span className="block text-[0.9375rem] font-semibold text-accent">Combinar los dos</span>
          <span className="block text-[0.8125rem] text-ink-2 mt-0.5">
            Se suman tareas, notas y asignaturas de ambos. Recomendado si no son el mismo curso
            copiado.
          </span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => choose('remote')}
          className="pressable text-left rounded-[16px] bg-fill px-4 py-3.5"
        >
          <span className="block text-[0.9375rem] font-semibold">Usar solo los de la cuenta</span>
          <span className="block text-[0.8125rem] text-ink-2 mt-0.5">
            Antes se descarga una copia de lo que hay en este dispositivo, por si acaso.
          </span>
        </button>
        <Button variant="ghost" disabled={busy} onClick={() => void syncEngine.signOut(false)}>
          Cancelar y cerrar sesión
        </Button>
      </div>
    </Modal>
  )
}

/** Tras abrir el enlace de «He olvidado mi contraseña». */
export function RecoveryDialog() {
  const status = useSync()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (password.length < 8) {
      setError('Al menos 8 caracteres.')
      return
    }
    setBusy(true)
    const failure = await syncEngine.updatePassword(password)
    setBusy(false)
    setError(failure)
    if (!failure) setPassword('')
  }

  return (
    <Modal
      open={status.recovery}
      onClose={() => syncEngine.dismissRecovery()}
      title="Elige una contraseña nueva"
      size="sm"
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Contraseña nueva" error={error}>
          {({ id }) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" disabled={busy} className="self-start">
          Guardar contraseña
        </Button>
      </form>
    </Modal>
  )
}
