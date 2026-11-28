/**
 * Edge Function `widget`: las tareas de hoy para el widget de Scriptable.
 *
 * Solo lectura. Se autentica con la llave del widget (cabecera
 * `x-widget-key`), que el alumno crea y revoca en Ajustes → Widget; en la base
 * solo está su huella SHA-256. Sin llave válida no devuelve nada. Despliégala
 * con «Verify JWT» desactivado: la llave hace ese papel.
 */

import postgres from 'npm:postgres@3.4.5'

import { buildSummary, type SyncRow } from './summary.ts'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 })

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS })
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return reply({ error: 'Método no permitido' }, 405)
  const key = req.headers.get('x-widget-key') ?? ''
  if (!/^orb_[0-9a-f]{64}$/.test(key)) return reply({ error: 'Falta la llave del widget' }, 401)

  const url = new URL(req.url)
  const today = url.searchParams.get('today') ?? ''
  const now = url.searchParams.get('now') ?? ''
  const offset = Number(url.searchParams.get('offset') ?? 0)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isFinite(offset) || Math.abs(offset) > 840) {
    return reply({ error: 'Parámetros inválidos' }, 400)
  }

  try {
    const hash = await sha256Hex(key)
    const owners = await sql<{ user_id: string }[]>`
      update private.widget_keys set last_used_at = now()
      where key_hash = ${hash}
      returning user_id`
    const userId = owners[0]?.user_id
    if (!userId) return reply({ error: 'Llave no válida o revocada' }, 401)

    const rows = await sql<SyncRow[]>`
      select collection, id, data, clocks
      from public.sync_records
      where user_id = ${userId} and collection in ('tasks', 'subjects')`
    return reply(buildSummary(rows, today, now, offset))
  } catch (error) {
    console.error('widget', error)
    return reply({ error: 'Error del servidor' }, 500)
  }
})
