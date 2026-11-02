/**
 * Asistente de voz y texto de Bachillerato OS (Mistral).
 *
 * Recibe lo que dice (audio) o escribe (texto) el alumno, junto con un
 * contexto mínimo (asignaturas, tareas abiertas, exámenes sin nota), y pide al
 * modelo que lo convierta en ACCIONES estructuradas. No toca la base de datos:
 * devuelve las acciones y la app las valida y aplica con su propia lógica.
 *
 * - Voz: Voxtral la transcribe (WAV en base64, que la app genera a 16 kHz
 *   mono) y el modelo de texto grande la interpreta, igual que un texto.
 * - Requiere sesión (JWT del usuario) y tiene un límite diario por usuario.
 * - La clave vive en el secreto MISTRAL_API_KEY de Supabase; nunca llega al
 *   navegador ni al repositorio.
 */

import postgres from 'npm:postgres@3.4.5'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 })
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const API = 'https://api.mistral.ai/v1/chat/completions'

const list = (value: string | undefined, fallback: string) =>
  (value ?? fallback)
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)

/** En orden de preferencia; si uno no está disponible, se prueba el siguiente. */
const TEXT_MODELS = list(
  Deno.env.get('MISTRAL_TEXT_MODELS'),
  'mistral-large-latest,mistral-medium-latest,mistral-small-latest',
)
const AUDIO_MODELS = list(
  Deno.env.get('MISTRAL_AUDIO_MODELS'),
  'voxtral-small-latest,voxtral-mini-latest',
)
const DAILY_LIMIT = Number(Deno.env.get('ASSISTANT_DAILY_LIMIT') ?? 150)
const CALL_TIMEOUT_MS = 30_000

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
// Instrucciones
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

const FORMAT = `Responde SOLO con un objeto JSON, sin texto alrededor, con esta forma:
{
  "heard": "lo que ha dicho el alumno, transcrito literalmente (solo si te llega audio; si es texto, cadena vacía)",
  "reply": "respuesta breve en español",
  "actions": [ { "type": "add_task|complete_task|add_exam|add_grade|add_event|add_subject|log_study", ...campos } ]
}
Campos posibles de cada acción (pon solo los que procedan): title, subject_id, subject_name, date (YYYY-MM-DD), time (HH:MM), priority (baja|media|alta|urgente), estimated_minutes, notes, score, max_score, weight (0-100), term (T1|T2|T3), grade_kind (examen|trabajo|practica|oral|participacion|otro), task_id, exam_id, category_id, minutes.`

function instructions(context: unknown): string {
  return `Eres el asistente de Bachillerato OS, una app para organizar el curso de un alumno de Bachillerato en España.
El alumno te habla (audio) o escribe en español. Convierte lo que pide en ACCIONES para la app.

Acciones:
- add_task: tarea. title obligatorio (sin la asignatura ni la fecha dentro, p. ej. «Ejercicios del tema 4»). date si dice cuándo («para hoy» = today). time si da hora. priority si lo dice («urgente»; «importante» = alta). estimated_minutes si dice cuánto le llevará. subject_id si menciona asignatura.
- complete_task: marcar hecha. task_id de open_tasks que mejor encaje.
- add_exam: examen. subject_id y date obligatorios. title («Examen tema 4»), time, notes (temario), weight (% si lo dice), term.
- add_grade: nota sacada. subject_id y score obligatorios. max_score solo si dice que no es sobre grade_max. weight = % que vale («vale un 40 %» → 40). term: «primera evaluación» = T1, «segunda» = T2, «tercera» = T3; si no lo dice, active_term. grade_kind según lo que sea. Si corresponde a un examen de exams_without_grade de esa asignatura, pon su exam_id. title si lo dice.
- add_event: algo con fecha que no es tarea ni examen (excursión, reunión). title y date.
- add_subject: SOLO si pide crear una asignatura o nombra una que claramente no existe en subjects. subject_name obligatorio; las acciones siguientes que la usen llevan el mismo subject_name.
- log_study: «he estudiado 45 minutos de física» → minutes, subject_id, date (today si no dice).

Reglas:
- Fechas: NO las calcules de cabeza. Búscalas en next_days del contexto (fecha y día de la semana de hoy y los próximos días). «El jueves» y «el jueves que viene» = el primer jueves de next_days posterior a hoy. «El jueves de la semana que viene» = el jueves de la semana siguiente (lunes a domingo). «Mañana» y «pasado mañana» = las dos fechas siguientes a hoy. «La semana que viene» sin día = el lunes de la semana siguiente. Escribe SIEMPRE en date la fecha exacta tomada de next_days.
- Asignaturas: usa SIEMPRE el id exacto de subjects. Interpreta coloquialismos: «mates» = Matemáticas, «bio»/«biología» = Biología…, «física» = Física y Química, «inglés» = Lengua Extranjera (Inglés), «lengua» = Lengua Castellana, «filo» = Filosofía, «histo» = Historia. Si hay ambigüedad real entre dos, no adivines: actions vacío y pregunta en reply.
- Puedes devolver varias acciones si pide varias cosas.
- Si no entiendes o falta algo imprescindible (fecha de un examen, la nota), actions vacío y pregunta en reply.
- reply: muy breve, natural, en español de España, tuteando. Si devuelves acciones, confirma en pasado lo que queda hecho («Apuntado: examen de Biología el jueves 5»), nunca lo preguntes: la app ya lo aplica. Solo pregunta cuando actions va vacío.
- No inventes datos que no ha dicho.

${FORMAT}

Contexto del alumno (JSON): ${JSON.stringify(context)}`
}

// ---------------------------------------------------------------------------
// Mistral
// ---------------------------------------------------------------------------

interface Input {
  text?: string
  /** WAV en base64. */
  audio?: string
}

class ModelError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function callMistral(
  model: string,
  key: string,
  system: string,
  input: Input,
  jsonMode: boolean,
): Promise<string | null> {
  const userContent = input.audio
    ? [
        { type: 'input_audio', input_audio: input.audio },
        {
          type: 'text',
          text: input.text ?? 'Haz lo que pide el alumno en este mensaje de voz.',
        },
      ]
    : (input.text ?? '')
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: unknown } }[]
  }
  if (!res.ok) throw new ModelError(res.status, JSON.stringify(body).slice(0, 400))
  const message = body.choices?.[0]?.message?.content
  if (typeof message === 'string') return message
  // Algunos modelos devuelven el contenido troceado.
  if (Array.isArray(message)) {
    return message.map((p) => (p && typeof p.text === 'string' ? (p.text as string) : '')).join('')
  }
  return null
}

/**
 * Paso 1 con voz: Voxtral solo transcribe. Interpretar (fechas, asignaturas)
 * lo hace después el modelo de texto grande, que acierta mucho más: en las
 * pruebas, Voxtral entendía bien la frase pero contaba mal los días.
 */
async function transcribe(key: string, audio: string): Promise<string> {
  let lastError: unknown = null
  for (const model of AUDIO_MODELS) {
    const started = Date.now()
    try {
      const text = await callMistral(
        model,
        key,
        'Transcribe literalmente, en español, lo que dice el audio. Devuelve SOLO la transcripción, sin comillas ni comentarios.',
        { audio, text: 'Transcribe este audio.' },
        false,
      )
      console.log('mistral transcripción', model, `${Date.now() - started}ms`)
      if (text?.trim()) return text.trim().slice(0, 2000)
    } catch (error) {
      console.error('mistral transcripción fallo', model, String(error).slice(0, 300))
      lastError = error
      if (error instanceof ModelError && (error.status === 401 || error.status === 403)) {
        throw error
      }
    }
  }
  throw lastError ?? new Error('Sin transcripción')
}

async function ask(
  key: string,
  system: string,
  input: Input,
): Promise<{ text: string; model: string }> {
  const models = input.audio ? AUDIO_MODELS : TEXT_MODELS
  let lastError: unknown = null
  for (const model of models) {
    // Primero con modo JSON; si el modelo no lo admite (400), sin él: el
    // formato ya va pedido en las instrucciones.
    for (const jsonMode of [true, false]) {
      const started = Date.now()
      try {
        const text = await callMistral(model, key, system, input, jsonMode)
        console.log('mistral ok', model, jsonMode ? 'json' : 'libre', `${Date.now() - started}ms`)
        if (text) return { text, model }
      } catch (error) {
        console.error(
          'mistral fallo',
          model,
          jsonMode ? 'json' : 'libre',
          `${Date.now() - started}ms`,
          error instanceof ModelError ? `${error.status} ${error.message}` : String(error),
        )
        lastError = error
        // Un 401/403 (clave) no se arregla probando otros modelos.
        if (error instanceof ModelError && (error.status === 401 || error.status === 403)) {
          throw error
        }
        // Solo un 400 justifica reintentar el mismo modelo sin modo JSON;
        // cualquier otro fallo pasa directamente al siguiente modelo.
        if (!(error instanceof ModelError && error.status === 400)) break
      }
    }
  }
  throw lastError ?? new Error('Sin respuesta del modelo')
}

function parseResult(text: string): { reply: string; heard: string; actions: unknown[] } {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new SyntaxError('Sin JSON')
  const parsed = JSON.parse(text.slice(start, end + 1)) as {
    reply?: unknown
    heard?: unknown
    actions?: unknown
  }
  return {
    reply: typeof parsed.reply === 'string' ? parsed.reply.slice(0, 500) : '',
    heard: typeof parsed.heard === 'string' ? parsed.heard.slice(0, 1000) : '',
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

    const key = Deno.env.get('MISTRAL_API_KEY')
    if (!key) {
      return json(
        { error: 'El asistente aún no está configurado: falta la clave de Mistral en Supabase.' },
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
    if (typeof body.text === 'string' && body.text.trim()) {
      input.text = body.text.trim().slice(0, 2000)
    }
    if (body.audio && typeof body.audio.data === 'string' && body.audio.data.length > 0) {
      input.audio = body.audio.data
    }
    if (!input.text && !input.audio) {
      return json({ error: 'No he recibido nada que procesar.' }, 400)
    }

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
    // Con voz: primero se transcribe y luego se interpreta como texto.
    const heard = input.audio ? await transcribe(key, input.audio) : ''
    const { text, model } = await ask(
      key,
      instructions(context),
      heard ? { text: input.text ? `${input.text}\n${heard}` : heard } : input,
    )
    const result = parseResult(text)
    return json({
      ...result,
      heard: heard || result.heard,
      model,
      remaining: Math.max(0, DAILY_LIMIT - usage.requests),
    })
  } catch (error) {
    console.error('assistant', error)
    if (error instanceof ModelError && (error.status === 401 || error.status === 403)) {
      return json({ error: 'La clave de Mistral no es válida o no tiene permiso.' }, 502)
    }
    if (error instanceof ModelError && (error.status === 429 || error.status >= 500)) {
      return json({ error: 'La IA está saturada o sin saldo ahora mismo. Prueba en un rato.' }, 429)
    }
    if (error instanceof SyntaxError) {
      return json({ error: 'No he entendido la respuesta de la IA. Repítelo, por favor.' }, 502)
    }
    return json({ error: 'No se pudo hablar con la IA. Inténtalo de nuevo.' }, 502)
  }
})
