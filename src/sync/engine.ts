/**
 * Motor de sincronización: la parte que habla con la red.
 *
 * Funcionamiento
 * --------------
 * - La aplicación sigue siendo local primero: todo se guarda en el
 *   dispositivo al instante, con o sin conexión. La sincronización trabaja
 *   en segundo plano y nunca bloquea la interfaz.
 * - Cada cambio local queda en una cola persistente (`metaStore`). Se sube en
 *   cuanto hay red; si la subida falla, la cola sigue ahí, también tras cerrar
 *   la aplicación.
 * - Se descarga al arrancar, al volver la conexión, al volver a la pestaña, al
 *   recibir un aviso en tiempo real de otro dispositivo y cada pocos minutos.
 * - Varias pestañas abiertas se turnan con Web Locks para no subir dos veces.
 *
 * La lógica de fusión (lo que decide qué se conserva) está en `merge.ts`, sin
 * red, y tiene sus propias pruebas.
 */

import type { RealtimeChannel, Session, SupabaseClient } from '@supabase/supabase-js'

import { createEmptyData } from '../data/defaults.ts'
import { today } from '../domain/dates.ts'
import { exportJSON } from '../storage/persistence.ts'
import { storeBridge } from './bridge.ts'
import { SUPABASE_KEY, SUPABASE_URL, SYNC_AVAILABLE } from './config.ts'
import { ZERO_CLOCK } from './hlc.ts'
import {
  acknowledge,
  buildPush,
  createMeta,
  hasContent,
  keyOf,
  mergeRemote,
  stampAll,
  type RemoteRow,
} from './merge.ts'
import { LOCAL_CHANGE_EVENT, loadMeta, nodeId, saveMeta } from './metaStore.ts'

export type SyncPhase =
  | 'unavailable'
  | 'loading'
  | 'signed-out'
  | 'linking'
  | 'needs-choice'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error'

export interface SyncStatus {
  phase: SyncPhase
  email: string | null
  lastSyncAt: number | null
  /** Registros locales pendientes de subir. */
  pending: number
  error: string | null
  /** Se ha abierto un enlace de recuperación: hay que pedir contraseña nueva. */
  recovery: boolean
}

const PAGE = 1000
const PUSH_BATCH = 200
const POLL_MS = 5 * 60_000
const PUSH_DEBOUNCE_MS = 1200
const PULL_DEBOUNCE_MS = 700

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

let clientPromise: Promise<SupabaseClient> | null = null

/** Se carga bajo demanda: quien no usa cuenta no descarga la librería. */
export function getClient(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // Implícito y no PKCE: el enlace de recuperación se abre a menudo en
          // un navegador distinto del que lo pidió (la PWA de iOS abre Safari),
          // y PKCE exige que sea el mismo.
          flowType: 'implicit',
          storageKey: 'bachillerato-os:auth',
        },
      }),
    )
  }
  return clientPromise
}

// ---------------------------------------------------------------------------
// Mensajes de error en castellano
// ---------------------------------------------------------------------------

export function describeAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (lower.includes('email not confirmed'))
    return 'Aún no has confirmado el correo. Abre el enlace que te hemos enviado y vuelve a intentarlo.'
  if (lower.includes('already registered') || lower.includes('already been registered'))
    return 'Ya existe una cuenta con ese correo. Inicia sesión.'
  if (lower.includes('password should') || lower.includes('weak password'))
    return 'La contraseña es demasiado débil: usa al menos 8 caracteres, con letras y números.'
  if (lower.includes('rate limit') || lower.includes('too many'))
    return 'Demasiados intentos seguidos. Espera unos minutos.'
  if (lower.includes('invalid email') || lower.includes('unable to validate email'))
    return 'Ese correo no parece válido.'
  if (lower.includes('fetch') || lower.includes('network'))
    return 'Sin conexión con el servidor. Comprueba tu red.'
  return message || 'Algo ha fallado. Inténtalo de nuevo.'
}

function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /fetch|network|timeout|load failed/i.test(message)
}

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

class SyncEngine {
  private status: SyncStatus = {
    phase: SYNC_AVAILABLE ? 'loading' : 'unavailable',
    email: null,
    lastSyncAt: null,
    pending: loadMeta()?.dirty.length ?? 0,
    error: null,
    recovery: false,
  }
  private listeners = new Set<() => void>()
  private userId: string | null = null
  private channel: RealtimeChannel | null = null
  private running: Promise<void> | null = null
  private rerun = false
  private started = false
  private retryDelay = 15_000
  private timers: Partial<
    Record<'retry' | 'push' | 'pull' | 'poll', ReturnType<typeof setTimeout>>
  > = {}

  // --- Estado observable -------------------------------------------------

  getStatus = (): SyncStatus => this.status

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch }
    for (const listener of this.listeners) listener()
  }

  private refreshPending() {
    const pending = loadMeta()?.dirty.length ?? 0
    if (pending !== this.status.pending) this.set({ pending })
  }

  // --- Arranque ----------------------------------------------------------

  start(): void {
    if (this.started || !SYNC_AVAILABLE || typeof window === 'undefined') return
    this.started = true

    void getClient().then((client) => {
      client.auth.onAuthStateChange((event, session) => {
        // Llamar a Supabase dentro de este callback puede bloquearse: se
        // difiere al siguiente turno, como recomienda la documentación.
        setTimeout(() => this.onAuth(event, session), 0)
      })
    })

    window.addEventListener('online', () => this.kick())
    window.addEventListener('offline', () =>
      this.set({ phase: this.userId ? 'offline' : this.status.phase }),
    )
    window.addEventListener(LOCAL_CHANGE_EVENT, () => {
      this.refreshPending()
      this.schedule('push', PUSH_DEBOUNCE_MS)
    })
    // Al volver: descargar lo de otros dispositivos. Al ocultarse: última
    // oportunidad de subir lo pendiente antes de que el sistema congele la app.
    document.addEventListener('visibilitychange', this.kick)
  }

  private onAuth(event: string, session: Session | null) {
    if (event === 'PASSWORD_RECOVERY') this.set({ recovery: true })
    const user = session?.user
    if (!user) {
      this.userId = null
      this.teardownRealtime()
      this.set({ phase: 'signed-out', email: null, error: null })
      return
    }
    this.set({ email: user.email ?? null })
    if (user.id === this.userId) return
    this.userId = user.id
    void this.link(user.id)
  }

  // --- Vinculación de este dispositivo con la cuenta ---------------------

  private async link(userId: string) {
    const meta = loadMeta()
    if (meta && meta.userId === userId) {
      this.subscribeRealtime(userId)
      this.kick()
      return
    }

    this.set({ phase: 'linking', error: null })
    try {
      const client = await getClient()
      const store = await storeBridge()
      store.applyRemote(() => null) // guarda cualquier cambio a medias antes de decidir
      const { count, error } = await client
        .from('sync_records')
        .select('id', { count: 'exact', head: true })
      if (error) throw error
      const local = store.getData()

      if (!count) {
        // Cuenta vacía: este dispositivo la inaugura con todo lo que tiene.
        saveMeta(stampAll(createMeta(userId, nodeId()), local))
      } else if (!hasContent(local)) {
        // Dispositivo nuevo y sin datos: solo hay que descargar.
        saveMeta(createMeta(userId, nodeId()))
      } else {
        // Hay datos a ambos lados: decide el alumno (ver resolveLink).
        this.set({ phase: 'needs-choice' })
        return
      }
      this.subscribeRealtime(userId)
      this.kick()
    } catch (error) {
      this.fail(error, () => this.userId === userId && void this.link(userId))
    }
  }

  /**
   * - `merge`: se suman los dos cursos. Si había ajustes distintos, mandan los
   *   de la cuenta.
   * - `remote`: se descarga una copia de lo local (por si acaso) y este
   *   dispositivo pasa a tener exactamente lo de la cuenta.
   */
  async resolveLink(choice: 'merge' | 'remote') {
    const userId = this.userId
    if (!userId || this.status.phase !== 'needs-choice') return
    const store = await storeBridge()
    if (choice === 'merge') {
      saveMeta(
        stampAll(createMeta(userId, nodeId()), store.getData(), { settingsClock: ZERO_CLOCK }),
      )
      this.subscribeRealtime(userId)
      this.set({ phase: 'syncing' })
      this.kick()
      return
    }

    downloadBackup(
      exportJSON(store.getData()),
      `bachillerato-os-antes-de-sincronizar-${today()}.json`,
    )
    saveMeta(createMeta(userId, nodeId()))
    this.set({ phase: 'syncing' })
    try {
      await this.pull({ replaceLocal: true })
      this.subscribeRealtime(userId)
      this.kick()
    } catch (error) {
      this.fail(error, () => this.kick())
    }
  }

  // --- Ciclo -------------------------------------------------------------

  /** Pide un ciclo de sincronización; si ya hay uno en marcha, otro detrás. */
  kick = (): void => {
    if (!this.userId) return
    if (this.status.phase === 'needs-choice' || this.status.phase === 'linking') return
    if (this.running) {
      this.rerun = true
      return
    }
    this.running = this.cycle().finally(() => {
      this.running = null
      if (this.rerun) {
        this.rerun = false
        this.kick()
      }
    })
  }

  private schedule(kind: 'push' | 'pull', delay: number) {
    clearTimeout(this.timers[kind])
    this.timers[kind] = setTimeout(this.kick, delay)
  }

  private async cycle() {
    if (!navigator.onLine) {
      this.set({ phase: 'offline' })
      return
    }
    this.set({ phase: 'syncing' })
    try {
      await withLock(async () => {
        await this.pull()
        await this.push()
      })
      this.retryDelay = 15_000
      clearTimeout(this.timers.retry)
      this.set({ phase: 'synced', lastSyncAt: Date.now(), error: null })
      this.refreshPending()
      clearTimeout(this.timers.poll)
      this.timers.poll = setTimeout(() => {
        if (document.visibilityState === 'visible') this.kick()
      }, POLL_MS)
    } catch (error) {
      this.fail(error, () => this.kick())
    }
  }

  private fail(error: unknown, retry: () => void) {
    console.warn('[sync]', error)
    this.set({
      phase: isNetworkError(error) ? 'offline' : 'error',
      error: isNetworkError(error) ? null : describeAuthError(error),
    })
    clearTimeout(this.timers.retry)
    this.timers.retry = setTimeout(retry, this.retryDelay)
    this.retryDelay = Math.min(this.retryDelay * 2, 5 * 60_000)
  }

  private async pull(options: { replaceLocal?: boolean } = {}) {
    const userId = this.userId
    const meta = loadMeta()
    if (!userId || !meta || meta.userId !== userId) return
    const client = await getClient()
    const store = await storeBridge()

    const rows: RemoteRow[] = []
    let cursor = meta.cursor
    for (;;) {
      const { data, error } = await client
        .from('sync_records')
        .select('collection,id,data,clocks,seq')
        .eq('user_id', userId)
        .gt('seq', cursor)
        .order('seq', { ascending: true })
        .limit(PAGE)
      if (error) throw error
      const page = (data ?? []) as RemoteRow[]
      rows.push(...page)
      if (page.length < PAGE) break
      cursor = page[page.length - 1].seq
    }
    if (rows.length === 0 && !options.replaceLocal) return

    // Se fusiona todo de una vez: aplicar a medias podría dejar, por ejemplo,
    // notas cuya asignatura llega en la página siguiente.
    store.applyRemote((current) => {
      const latest = loadMeta()
      if (!latest || latest.userId !== userId) return null
      const base = options.replaceLocal ? createEmptyData() : current
      const result = mergeRemote(base, latest, rows)
      saveMeta(result.meta)
      return result.changed || options.replaceLocal ? result.data : null
    })
  }

  private async push() {
    const userId = this.userId
    if (!userId) return
    const client = await getClient()
    const store = await storeBridge()
    store.applyRemote(() => null) // asegura que los relojes cubren lo último tecleado

    for (let round = 0; round < 25; round++) {
      const meta = loadMeta()
      if (!meta || meta.userId !== userId || meta.dirty.length === 0) break
      const keys = meta.dirty.slice(0, PUSH_BATCH)
      const batch = buildPush(store.getData(), meta, keys)
      const sent = new Set(batch.map((r) => keyOf(r.collection, r.id)))
      if (batch.length > 0) {
        const { error } = await client.rpc('sync_push', { p_records: batch })
        if (error) throw error
      }
      const after = loadMeta()
      if (!after) break
      // Lo que no se pudo construir (registro inexistente) sale de la cola.
      const cleaned = {
        ...after,
        dirty: after.dirty.filter((k) => !keys.includes(k) || sent.has(k)),
      }
      saveMeta(acknowledge(cleaned, batch))
      this.refreshPending()
    }
  }

  // --- Tiempo real -------------------------------------------------------

  private subscribeRealtime(userId: string) {
    if (this.channel) return
    void getClient().then((client) => {
      if (this.userId !== userId || this.channel) return
      this.channel = client
        .channel(`sync-${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sync_records', filter: `user_id=eq.${userId}` },
          () => this.schedule('pull', PULL_DEBOUNCE_MS),
        )
        .subscribe()
    })
  }

  private teardownRealtime() {
    const channel = this.channel
    this.channel = null
    if (channel) void getClient().then((client) => client.removeChannel(channel))
  }

  // --- Cuenta ------------------------------------------------------------

  async signIn(email: string, password: string): Promise<string | null> {
    const client = await getClient()
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
    return error ? describeAuthError(error) : null
  }

  /** Devuelve null si todo fue bien, o el error. */
  async signUp(
    email: string,
    password: string,
  ): Promise<{ error: string | null; needsConfirmation: boolean }> {
    const client = await getClient()
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: appUrl() },
    })
    if (error) return { error: describeAuthError(error), needsConfirmation: false }
    return { error: null, needsConfirmation: !data.session }
  }

  async sendPasswordReset(email: string): Promise<string | null> {
    const client = await getClient()
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: appUrl(),
    })
    return error ? describeAuthError(error) : null
  }

  async updatePassword(password: string): Promise<string | null> {
    const client = await getClient()
    const { error } = await client.auth.updateUser({ password })
    if (!error) this.set({ recovery: false })
    return error ? describeAuthError(error) : null
  }

  dismissRecovery() {
    this.set({ recovery: false })
  }

  /**
   * Cierra la sesión en este dispositivo. Los datos locales se quedan (y sus
   * cambios se siguen anotando): al volver a entrar con la misma cuenta se
   * sube lo hecho mientras tanto. `wipeLocal` es para un ordenador prestado.
   */
  async signOut(wipeLocal = false) {
    const client = await getClient()
    await this.running
    // Último intento de subir lo pendiente antes de perder la sesión.
    if (navigator.onLine && (loadMeta()?.dirty.length ?? 0) > 0) {
      try {
        await withLock(() => this.push())
      } catch {
        // Si no se puede, queda en la cola para la próxima vez.
      }
    }
    this.teardownRealtime()
    await client.auth.signOut({ scope: 'local' })
    if (wipeLocal) {
      saveMeta(null)
      const store = await storeBridge()
      store.applyRemote(() => createEmptyData())
    }
    this.userId = null
    this.set({ phase: 'signed-out', email: null, pending: loadMeta()?.dirty.length ?? 0 })
  }

  /** Borra la cuenta y todo lo guardado en la nube. Lo local se conserva. */
  async deleteAccount(): Promise<string | null> {
    const client = await getClient()
    const { error } = await client.rpc('delete_my_account')
    if (error) return describeAuthError(error)
    this.teardownRealtime()
    saveMeta(null)
    await client.auth.signOut({ scope: 'local' })
    this.userId = null
    this.set({ phase: 'signed-out', email: null, pending: 0 })
    return null
  }

  async accessToken(): Promise<string | null> {
    const client = await getClient()
    const { data } = await client.auth.getSession()
    return data.session?.access_token ?? null
  }
}

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks) return fn()
  return locks.request('bachillerato-os-sync', fn) as Promise<T>
}

/** Dirección de la aplicación, sin hash: adonde vuelven los enlaces de correo. */
function appUrl(): string {
  return `${window.location.origin}${window.location.pathname}`
}

function downloadBackup(json: string, name: string) {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const syncEngine = new SyncEngine()
