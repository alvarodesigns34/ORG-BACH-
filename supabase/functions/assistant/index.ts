/**
 * Asistente de voz y texto de Bachillerato OS.
 *
 * Recibe lo que dice (audio) o escribe (texto) el alumno, junto con un
 * contexto mínimo (asignaturas, tareas abiertas, exámenes sin nota), y pide a
 * Gemini que lo convierta en ACCIONES estructuradas. No toca la base de datos:
 * devuelve las acciones y la app las valida y aplica con su propia lógica.
 *
 * - Requiere sesión (JWT del usuario).
 * - Límite diario por usuario, para que nadie agote la cuota gratuita.
 * - La clave de Gemini vive en el secreto GEMINI_API_KEY de Supabase; nunca
 *   llega al navegador ni al repositorio.
 */

import postgres from 'npm:postgres@3.4.5'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 })
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

const PRIMARY_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash'
/** Si el principal agota su cuota gratuita, se prueba con el ligero. */
const FALLBACK_MODEL = Deno.env.get('GEMINI_FALLBACK_MODEL') ?? 'gemini-3.5-flash-lite'
const DAILY_LIMIT = Number(Deno.env.get('ASSISTANT_DAILY_LIMIT') ?? 150)
const API = 'https://generativelanguage.googleapis.com/v1beta'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// Instrucciones y formato de respuesta
// ---------------------------------------------------------------------------

const ACTION_TYPES = [
  'add_task',
  'complete_task',
  'add_exam',
  'add_grade',
  'add_event',
  'add_subject',
  'log_study',
]

const SCHEMA = {
  type: 'object',
  properties: {
    reply: {
      type: 'string',
      description: 'Respuesta breve en español (máx. 2 frases) confirmando o preguntando.',
    },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ACTION_TYPES },
          title: { type: 'string' },
          subject_id: { type: 'string' },
          subject_name: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          time: { type: 'string', description: 'HH:MM (24 h)' },
          priority: { type: 'string', enum: ['baja', 'media', 'alta', 'urgente'] },
          estimated_minutes: { type: 'number' },
          notes: { type: 'string' },
          score: { type: 'number' },
          max_score: { type: 'number' },
          weight: { type: 'number', description: 'Porcentaje 0-100' },
          term: { type: 'string', enum: ['T1', 'T2', 'T3'] },
          grade_kind: {
            type: 'string',
            enum: ['examen', 'trabajo', 'practica', 'oral', 'participacion', 'otro'],
          },
          task_id: { type: 'string' },
          exam_id: { type: 'string' },
          category_id: { type: 'string' },
          minutes: { type: 'number' },
        },
        required: ['type'],
      },
    },
  },
  required: ['reply', 'actions'],
}

function instructions(context: unknown): string {
  return `Eres el asistente de Bachillerato OS, una app para organizar el curso de un alumno de Bachillerato en España.
El alumno te habla (audio) o escribe en español. Convierte lo que pide en ACCIONES para la app. Responde SOLO con JSON que siga el esquema.

Acciones:
- add_task: tarea. title obligatorio. date (YYYY-MM-DD) si dice cuándo («para hoy», «para el viernes»). time si da hora. priority si lo dice («urgente», «importante» = alta). estimated_minutes si dice cuánto le llevará. subject_id si menciona asignatura.
- complete_task: marcar hecha. task_id de open_tasks que mejor encaje (o title si no hay id).
- add_exam: examen. subject_id y date obligatorios. title («Examen tema 4»), time, notes (temario), weight (% si lo dice), term.
- add_grade: nota sacada. subject_id, score obligatorios. max_score solo si dice que no es sobre la escala habitual (grade_max del contexto). weight = % que vale («vale un 40 %» → 40). term: «primera evaluación» = T1, «segunda» = T2, «tercera» = T3; si no lo dice, active_term. grade_kind: examen, trabajo, practica, oral, participacion u otro. Si corresponde a un examen de exams_without_grade de esa asignatura, pon su exam_id. title: nombre de la nota si lo dice.
- add_event: algo con fecha que no es tarea ni examen (excursión, reunión, entrega sin trabajo). title y date.
- add_subject: SOLO si el alumno pide crear una asignatura o se refiere a una que claramente no existe en subjects. subject_name obligatorio. Las acciones siguientes que la usen llevan subject_name igual.
- log_study: «he estudiado 45 minutos de física» → minutes, subject_id, date (hoy si no dice).

Reglas:
- Fechas relativas respecto a today y weekday del contexto, zona Europe/Madrid. «El jueves» = el próximo jueves (hoy si hoy es jueves y no ha dicho «que viene»). «Mañana», «pasado mañana», «la semana que viene» (lunes siguiente salvo que diga día).
- Asignaturas: usa SIEMPRE el id exacto de subjects. Interpreta coloquialismos: «mates» = Matemáticas, «bio»/«biología» = Biología…, «física» = Física y Química, «inglés» = Lengua Extranjera (Inglés), «lengua» = Lengua Castellana. Si hay ambigüedad real entre dos, no adivines: deja actions vacío y pregunta en reply.
- Puedes devolver varias acciones si pide varias cosas.
- Si no entiendes o falta algo imprescindible (fecha de un examen, nota), actions vacío y pregunta en reply, breve.
- reply: muy breve, natural, en español de España, tuteando. Confirma lo hecho («Apuntado: examen de Biología el jueves 5»).
- No inventes datos que no ha dicho.

Contexto del alumno (JSON): ${JSON.stringify(context)}`
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

interface Input {
  text?: string
  audio?: { data: string; mimeType: string }
}

class GeminiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

function extractText(body: Record<string, unknown>): string | null {
  // Interactions API: steps[] con type "model_output" y content[] de texto.
  if (typeof body.output_text === 'string') return body.output_text
  const steps = Array.isArray(body.steps)
    ? body.steps
    : Array.isArray(body.outputs)
      ? body.outputs
      : []
  const parts: string[] = []
  for (const step of steps as Record<string, unknown>[]) {
    if (typeof step.text === 'string') parts.push(step.text)
    const content = Array.isArray(step.content) ? step.content : []
    for (const c of content as Record<string, unknown>[]) {
      if (c.type === 'text' && typeof c.text === 'string') parts.push(c.text)
    }
  }
  if (parts.length) return parts.join('')
  // generateContent: candidates[0].content.parts[].text
  const candidates = Array.isArray(body.candidates) ? body.candidates : []
  const first = candidates[0] as { content?: { parts?: { text?: string }[] } } | undefined
  const text = first?.content?.parts?.map((p) => p.text ?? '').join('')
  return text || null
}

async function callInteractions(model: string, key: string, system: string, input: Input) {
  const content: unknown[] = []
  if (input.text) content.push({ type: 'text', text: input.text })
  if (input.audio) {
    content.push({ type: 'text', text: 'Mensaje de voz del alumno:' })
    content.push({ type: 'audio', data: input.audio.data, mime_type: input.audio.mimeType })
  }
  const res = await fetch(`${API}/interactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      model,
      system_instruction: system,
      input: content,
      store: false,
      response_format: { type: 'text', mime_type: 'application/json', schema: SCHEMA },
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new GeminiError(res.status, JSON.stringify(body).slice(0, 400))
  return extractText(body)
}

/** API clásica, por si la de Interactions no está disponible para el modelo. */
async function callGenerateContent(model: string, key: string, system: string, input: Input) {
  const parts: unknown[] = []
  if (input.text) parts.push({ text: input.text })
  if (input.audio) {
    parts.push({ text: 'Mensaje de voz del alumno:' })
    parts.push({ inlineData: { mimeType: input.audio.mimeType, data: input.audio.data } })
  }
  const res = await fetch(`${API}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: `${system}\n\nFormato JSON: ${JSON.stringify(SCHEMA)}` }],
      },
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new GeminiError(res.status, JSON.stringify(body).slice(0, 400))
  return extractText(body)
}

async function ask(
  key: string,
  system: string,
  input: Input,
): Promise<{ text: string; model: string }> {
  let lastError: unknown = null
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    for (const call of [callInteractions, callGenerateContent]) {
      try {
        const text = await call(model, key, system, input)
        if (text) return { text, model }
      } catch (error) {
        lastError = error
        // 429: cuota agotada → siguiente modelo. 400/404: formato o modelo no
        // admitido en esta API → siguiente forma de llamar. Otro: sigue igual.
        if (error instanceof GeminiError && error.status === 429) break
      }
    }
  }
  throw lastError ?? new Error('Sin respuesta del modelo')
}

function parseResult(text: string): { reply: string; actions: unknown[] } {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
  const parsed = JSON.parse(cleaned) as { reply?: unknown; actions?: unknown }
  return {
    reply: typeof parsed.reply === 'string' ? parsed.reply.slice(0, 500) : '',
    actions: Array.isArray(parsed.actions)
      ? parsed.actions.filter(
          (a) =>
            a &&
            typeof a === 'object' &&
            ACTION_TYPES.includes((a as { type?: string }).type ?? ''),
        )
      : [],
  }
}

// ---------------------------------------------------------------------------
// Petición
// ---------------------------------------------------------------------------

async function userFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const apikey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey },
  })
  if (!res.ok) return null
  const user = (await res.json()) as { id?: string }
  return user.id ?? null
}

function madridDay(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  try {
    const userId = await userFromRequest(req)
    if (!userId) return json({ error: 'Inicia sesión para usar el asistente.' }, 401)

    const key = Deno.env.get('GEMINI_API_KEY')
    if (!key) {
      return json(
        { error: 'El asistente aún no está configurado: falta la clave de Gemini en Supabase.' },
        503,
      )
    }

    const length = Number(req.headers.get('content-length') ?? 0)
    if (length > 12_000_000) return json({ error: 'El audio es demasiado largo.' }, 413)

    const body = (await req.json().catch(() => null)) as {
      text?: unknown
      audio?: { data?: unknown; mimeType?: unknown }
      context?: unknown
    } | null
    if (!body) return json({ error: 'Petición vacía.' }, 400)

    const input: Input = {}
    if (typeof body.text === 'string' && body.text.trim())
      input.text = body.text.trim().slice(0, 2000)
    if (
      body.audio &&
      typeof body.audio.data === 'string' &&
      typeof body.audio.mimeType === 'string' &&
      body.audio.data.length > 0
    ) {
      input.audio = { data: body.audio.data, mimeType: body.audio.mimeType.split(';')[0] }
    }
    if (!input.text && !input.audio)
      return json({ error: 'No he recibido nada que procesar.' }, 400)

    // Límite diario, contado antes de llamar al modelo.
    const [usage] = await sql<{ requests: number }[]>`
      insert into private.assistant_usage (user_id, day, requests)
      values (${userId}, ${madridDay()}, 1)
      on conflict (user_id, day) do update set requests = private.assistant_usage.requests + 1
      returning requests`
    if (usage.requests > DAILY_LIMIT) {
      return json({ error: `Has llegado al límite de ${DAILY_LIMIT} peticiones de hoy.` }, 429)
    }

    const context = body.context && typeof body.context === 'object' ? body.context : {}
    const { text, model } = await ask(key, instructions(context), input)
    const result = parseResult(text)
    return json({ ...result, model, remaining: Math.max(0, DAILY_LIMIT - usage.requests) })
  } catch (error) {
    console.error('assistant', error)
    if (error instanceof GeminiError && error.status === 429) {
      return json(
        {
          error: 'La IA está saturada o se ha agotado la cuota gratuita de hoy. Prueba más tarde.',
        },
        429,
      )
    }
    if (error instanceof SyntaxError) {
      return json({ error: 'No he entendido la respuesta de la IA. Repítelo, por favor.' }, 502)
    }
    return json({ error: 'No se pudo hablar con la IA. Inténtalo de nuevo.' }, 502)
  }
})
