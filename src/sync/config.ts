/**
 * Conexión con Supabase.
 *
 * La URL y la clave PUBLICABLE no son secretas: viajan dentro de la propia
 * aplicación y están pensadas para ello. Lo que protege los datos son las
 * políticas RLS (cada cuenta solo lee lo suyo) y que las escrituras pasen por
 * `sync_push`, que solo escribe en la cuenta autenticada. Ninguna clave
 * secreta toca el cliente ni el repositorio.
 *
 * Se pueden sobrescribir con VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY
 * (por ejemplo, para apuntar a un proyecto de pruebas). Si alguna queda vacía,
 * la aplicación funciona solo en local y oculta todo lo relativo a la cuenta.
 */

const DEFAULT_URL = 'https://jhokoahcicsodfpzquej.supabase.co'
const DEFAULT_KEY = 'sb_publishable_dX8ZZNhmu5G_HA_kytkrCg_EcIhU9zC'

const env = import.meta.env as Record<string, string | undefined>

export const SUPABASE_URL = env.VITE_SUPABASE_URL ?? DEFAULT_URL
export const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? DEFAULT_KEY

export const SYNC_AVAILABLE = Boolean(SUPABASE_URL && SUPABASE_KEY)

export const DIGEST_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/daily-digest`
