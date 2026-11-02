/**
 * Asistente de voz y texto de Bachillerato OS (Mistral).
 *
 * Es una conversación: recibe lo que dice (audio) o escribe (texto) el alumno,
 * el historial reciente de la charla y un resumen de su curso con las cuentas
 * ya hechas por la app (medias, porcentaje evaluado, nota necesaria). Devuelve
 * una respuesta y, si procede, ACCIONES estructuradas. No toca la base de
 * datos: la app valida y aplica las acciones con su propia lógica.
 *
 * Calidad:
 * - El modelo razona antes de responder (campo `thinking`, que no se enseña).
 * - Cada respuesta se revisa aquí contra el contexto (ids que existen, fechas
 *   válidas, campos obligatorios). Si algo falla, se le devuelve al modelo con
 *   los problemas concretos para que lo corrija una vez.
 * - Voz: primero se transcribe con el endpoint de transcripción de Voxtral (con
 *   los nombres de las asignaturas como pistas) y luego la interpreta el
 *   modelo de texto grande, igual que un texto.
 *
 * Requiere sesión (JWT del usuario) y tiene un límite diario por usuario. La
 * clave vive en el secreto MISTRAL_API_KEY de Supabase; nunca llega al
 * navegador ni al repositorio.
 */

import postgres from 'npm:postgres@3.4.5'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, {
  prepare: false,
  max: 2,
})
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const CHAT_API = 'https://api.mistral.ai/v1/chat/completions'
const TRANSCRIBE_API = 'https://api.mistral.ai/v1/audio/transcriptions'

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
/** Transcripción dedicada (más precisa y sin «interpretar» el audio). */
const TRANSCRIBE_MODEL = Deno.env.get('MISTRAL_TRANSCRIBE_MODEL') ?? 'voxtral-mini-latest'
/** Respaldo: transcribir pidiéndoselo a Voxtral por el chat. */
const AUDIO_CHAT_MODELS = list(
  Deno.env.get('MISTRAL_AUDIO_MODELS'),
  'voxtral-small-latest,voxtral-mini-latest',
)
const DAILY_LIMIT = Number(Deno.env.get('ASSISTANT_DAILY_LIMIT') ?? 150)
const CALL_TIMEOUT_MS = 40_000
const MAX_HISTORY = 20

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
  'update_task',
  'complete_task',
  'reopen_task',
  'delete_task',
  'add_subtasks',
  'add_exam',
  'update_exam',
  'delete_exam',
  'add_grade',
  'update_grade',
  'delete_grade',
  'add_event',
  'update_event',
  'delete_event',
  'add_subject',
  'set_target',
  'log_study',
]

const FORMAT = `FORMATO DE RESPUESTA: SOLO un objeto JSON, sin texto alrededor, con las claves en este orden:
{
  "thinking": "tu razonamiento, breve y paso a paso (el alumno no lo ve): qué pide, qué datos del contexto usas (ids, fechas sacadas de next_days/past_days, notas), cálculos hechos y comprobación final",
  "reply": "lo que le dices al alumno",
  "actions": [ { "type": "...", ...campos } ]
}`

const ACTIONS_DOC = `ACCIONES (pon solo los campos que procedan; los ids, SIEMPRE copiados del contexto o de un [id] que aparezca en la conversación):
- add_task: title (obligatorio; sin la asignatura ni la fecha dentro, p. ej. «Ejercicios 4 y 5 del tema 3»), subject_id, date, time, priority (baja|media|alta|urgente; «importante» = alta), estimated_minutes, notes, items (lista de pasos/subtareas, solo si los dice o pide que la dividas).
- update_task: task_id + SOLO los campos que cambian: title (título nuevo), date (null = quitar fecha), time (null = quitar hora), priority, status (pendiente|en_progreso|completada), estimated_minutes, notes, subject_id.
- complete_task / reopen_task / delete_task: task_id.
- add_subtasks: task_id + items (lista de textos cortos).
- add_exam: subject_id y date obligatorios; title («Examen tema 4»), time, notes (temario), weight (% del trimestre, si lo dice), term.
- update_exam: exam_id + campos que cambian (date, time, title, notes, weight, term, subject_id). delete_exam: exam_id.
- add_grade: subject_id y score obligatorios. max_score solo si no es sobre grade_max («un 16 sobre 20»). weight = % que vale («vale un 40 %» → 40). term: «primera evaluación/trimestre» = T1, «segunda» = T2, «tercera» = T3; si no lo dice, el del examen enlazado o active_term. grade_kind (examen|trabajo|practica|oral|participacion|otro). Si es la nota de un examen de exams con grade_id null de esa asignatura, pon su exam_id (y no inventes weight: se toma del examen). title si lo dice. category_id si encaja con una categoría de la asignatura.
- update_grade: grade_id + campos que cambian (score, max_score, weight, term, title, grade_kind, date). delete_grade: grade_id.
- add_event: algo con fecha que no es tarea ni examen (excursión, reunión, cumpleaños). title y date; time, notes.
- update_event / delete_event: event_id (+ campos que cambian).
- add_subject: SOLO si pide crear una asignatura que no existe. subject_name obligatorio; las acciones siguientes que la usen llevan ese mismo subject_name en vez de subject_id.
- set_target: subject_id + target (nota objetivo; null la quita). «Quiero sacar un 8 en mates».
- log_study: minutes, subject_id, date (hoy si no dice), title (tema). «He estudiado 45 min de física».`

function instructions(context: unknown): string {
  return `Eres el asistente personal de Bachillerato OS, la app con la que un alumno de Bachillerato en España organiza su curso. Hablas con él como un compañero listo y fiable: tuteas, español de España, natural y al grano.

PUEDES:
1. Apuntar y cambiar cosas en la app mediante ACCIONES (tareas, exámenes, notas, eventos, asignaturas, objetivos, estudio).
2. Responder preguntas sobre su curso con los datos del contexto: qué tiene hoy/mañana/esta semana, cuándo es un examen, su media, qué nota necesita, qué le queda pendiente, cómo organizarse.
3. Ayudarle a planificar (repartir el estudio antes de un examen, dividir una tarea en pasos). Un plan de repaso son tareas add_task normalmente 3–6 sesiones (no una cada día salvo que lo pida), con subject_id, date, estimated_minutes y títulos claros («Repaso: formulación»), repartidas antes del examen, nunca el mismo día ni después, y evitando días con otros exámenes. Si pide «hazme un plan», créalo; si solo lo sugieres tú, ofrécelo sin crear nada.

ES UNA CONVERSACIÓN: usa los mensajes anteriores. «Muévelo al viernes», «ponle prioridad alta», «bórralo», «el de antes», «sí, hazlo», «mejor a las 5» se refieren a lo último de lo que se habló. Tus mensajes anteriores terminan con [Hecho en la app: …] con los ids reales de lo que se aplicó: úsalos (task_id, exam_id, grade_id…) para editar. Si dice «deshaz eso» o «no, era otra cosa», corrige con acciones (update_/delete_) sobre esos ids. Si una vez preguntaste algo y ahora responde, completa la acción pendiente con todo lo que ya dijo.

REGLAS DE FECHAS (aquí es donde más se falla):
- NUNCA calcules fechas de cabeza: búscalas en next_days (hoy y los 20 días siguientes) o past_days (los 7 anteriores), y copia la fecha exacta.
- «Hoy» = today. «Mañana»/«pasado mañana» = las dos fechas siguientes. «El jueves» o «el jueves que viene» = el primer jueves de next_days posterior a hoy (si hoy es jueves, el de la semana siguiente). «El jueves de la semana que viene» = el jueves de la semana siguiente (semanas de lunes a domingo). «La semana que viene» sin día = el lunes siguiente. «El lunes pasado», «ayer» → past_days. «El 15» = el próximo día 15. Fechas lejanas: YYYY-MM-DD correcta del año que toque (el curso va de septiembre a junio).
- «Esta tarde», «a las 5» → time 17:00; «a las 9 de la mañana» → 09:00. Ten en cuenta now (hora actual).
- En thinking escribe la fecha elegida con su día de la semana tal y como aparece en next_days, para comprobarla.

REGLAS DE ASIGNATURAS:
- Usa SIEMPRE el id exacto de subjects. Coloquialismos: «mates» = Matemáticas, «bio»/«biología» = Biología…, «física»/«fyq»/«química» = Física y Química (o Física/Química si existen por separado), «inglés» = Lengua Extranjera (Inglés), «lengua» = Lengua Castellana y Literatura, «filo» = Filosofía, «histo»/«historia» = Historia…, «dibujo» = Dibujo Técnico, «tecno» = Tecnología, «edu física» = Educación Física.
- Si encaja con dos asignaturas de verdad (p. ej. Matemáticas I y Matemáticas Aplicadas), no adivines: pregunta en reply dando las opciones, y actions vacío.
- Nunca nombres ni ofrezcas asignaturas que no estén en subjects.
- Si nombra una asignatura que no existe: una tarea, evento o estudio se apunta igualmente SIN subject_id (y lo dices: «La he apuntado sin asignatura porque no tienes Historia; si quieres, la creo»). Un examen, nota u objetivo necesitan asignatura: pregunta si quiere crearla (no la crees sin que lo pida).

REGLAS DE NOTAS Y CUENTAS:
- Las medias y porcentajes ya calculados están en subjects[].terms (avg = media sobre lo evaluado, evaluated_pct = % evaluado del trimestre), course_avg, term_average (media del trimestre activo) y needed_for_target (media necesaria en lo que queda del trimestre activo para llegar al objetivo; status: alcanzable | imposible | ya_conseguido | sin_restante). Úsalos tal cual; no los recalcules.
- «Quiero sacar un X en Y» o «mi objetivo en Y es X» = set_target (y en reply dile qué necesita con needed_for_target); no preguntes después si lo apuntas.
- needed_for_target.needed es la MEDIA necesaria en todo lo que queda por evaluar (remaining_pct). Si pregunta por un examen concreto que vale menos que eso, acláralo («necesitas un 8,58 de media en el 60 % que queda, este examen incluido»).
- Si pide «qué nota necesito para sacar un X» y no hay target, calcúlalo: necesaria = (X·100 − avg·evaluated_pct) / (100 − evaluated_pct). Si pregunta «qué media me queda si saco Y en un examen que vale p %»: (avg·evaluated_pct + Y·p) / (evaluated_pct + p). Haz las cuentas en thinking, con dos decimales, y redondea al dar la respuesta (coma decimal: «7,67»).
- Una nota por encima de grade_max no existe: si dice «un 16» con grade_max 10, pregunta sobre cuánto era.

CUÁNDO ACTUAR Y CUÁNDO PREGUNTAR:
- Si está claro, actúa sin pedir confirmación. Puedes devolver varias acciones si pide varias cosas.
- Pregunta (actions vacío) solo si falta algo imprescindible (fecha de un examen, la nota, qué tarea de varias parecidas) o hay ambigüedad real. Pregunta UNA cosa concreta, con opciones si ayuda.
- Borrar: solo si lo pide claramente.
- No inventes nada que no haya dicho (ni horas, ni pesos, ni temario). No dupliques: si algo igual ya existe en el contexto (misma tarea/examen), dilo en vez de crearlo otra vez, salvo que insista.

CÓMO RESPONDER (reply):
- Lo que va en actions YA SE APLICA al instante: confírmalo en pasado y con el dato clave («Apuntado: examen de Biología el jueves 5 de noviembre.»). Nunca preguntes «¿quieres que lo apunte?» si ya va en actions. Puedes terminar con una sugerencia breve y útil («¿Te reparto el repaso en 3 días?»).
- Preguntas sobre sus datos: respuesta directa primero, luego el detalle. Para listas usa líneas que empiecen por «• ». Fechas en palabras («el jueves 5»), no en formato ISO. Nunca enseñes ids.
- Breve: 1–3 frases salvo que pida un plan o una lista. Texto plano: sin markdown (ni asteriscos, ni almohadillas), sin emojis, sin relleno, sin repetir lo que ha dicho. No acabes con coletillas como «¿Necesitas algo más?» o «¿Quieres ajustar algo?»: solo pregunta si de verdad hace falta o propones algo concreto.

${ACTIONS_DOC}

${FORMAT}

CONTEXTO DEL ALUMNO (JSON, datos actuales de la app; manda sobre lo que se dijo antes en la conversación):
${JSON.stringify(context)}`
}

// ---------------------------------------------------------------------------
// Validación: lo que el modelo propone frente a lo que hay en el contexto
// ---------------------------------------------------------------------------

interface Ctx {
  today?: string
  grade_max?: number
  subjects?: { id: string; name: string; short?: string }[]
  open_tasks?: { id: string }[]
  recently_completed?: { id: string }[]
  exams?: { id: string; subject_id: string; grade_id: string | null }[]
  recent_grades?: { id: string }[]
  events?: { id: string }[]
}

type Action = Record<string, unknown> & { type: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const isDay = (v: unknown) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Problemas concretos, redactados para que el modelo los pueda corregir. */
function validate(actions: Action[], context: Ctx, history: Msg[]): string[] {
  const problems: string[] = []
  const subjects = context.subjects ?? []
  const subjectIds = new Set(subjects.map((s) => s.id))
  const newSubjects = new Set(
    actions
      .filter((a) => a.type === 'add_subject' && typeof a.subject_name === 'string')
      .map((a) => norm(a.subject_name as string)),
  )
  // Ids que aparecen en la conversación (cosas recién creadas por la app).
  const talked = history.map((m) => m.content).join('\n')
  const ids = (list?: { id: string }[]) => new Set((list ?? []).map((x) => x.id))
  const taskIds = new Set([...ids(context.open_tasks), ...ids(context.recently_completed)])
  const examIds = ids(context.exams)
  const gradeIds = ids(context.recent_grades)
  const eventIds = ids(context.events)
  const known = (set: Set<string>, id: unknown) =>
    typeof id === 'string' && (set.has(id) || talked.includes(`[${id}]`))

  actions.forEach((a, i) => {
    const n = `acción ${i + 1} (${a.type})`
    const sid = a.subject_id
    const sname = typeof a.subject_name === 'string' ? norm(a.subject_name) : ''
    const subjectOk = () =>
      (typeof sid === 'string' && subjectIds.has(sid)) ||
      (sname &&
        (newSubjects.has(sname) ||
          subjects.some((s) => norm(s.name) === sname || norm(s.short ?? '') === sname)))
    const needsSubject = ['add_exam', 'add_grade', 'set_target'].includes(a.type)
    const mentions = sid !== undefined || a.subject_name !== undefined
    if (a.type !== 'add_subject' && (needsSubject || mentions) && !subjectOk()) {
      problems.push(
        `${n}: subject_id «${sid ?? a.subject_name ?? '(vacío)'}» no es un id de subjects. Usa el id exacto o pregunta.`,
      )
    }
    for (const key of ['date'] as const) {
      if (a[key] !== undefined && a[key] !== null && !isDay(a[key])) {
        problems.push(
          `${n}: date «${a[key]}» no es una fecha YYYY-MM-DD válida; cópiala de next_days.`,
        )
      }
    }
    if (
      a.time !== undefined &&
      a.time !== null &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(a.time))
    ) {
      problems.push(`${n}: time «${a.time}» debe ser HH:MM.`)
    }
    switch (a.type) {
      case 'add_task':
        if (typeof a.title !== 'string' || !a.title.trim()) problems.push(`${n}: falta title.`)
        break
      case 'add_exam':
        if (!isDay(a.date))
          problems.push(`${n}: un examen necesita date; si no la sabes, pregunta.`)
        break
      case 'add_event':
        if (!isDay(a.date) || typeof a.title !== 'string')
          problems.push(`${n}: necesita title y date.`)
        break
      case 'add_grade': {
        const max = typeof a.max_score === 'number' ? a.max_score : (context.grade_max ?? 10)
        if (typeof a.score !== 'number' || a.score < 0 || a.score > max) {
          problems.push(`${n}: score debe ser un número entre 0 y ${max}.`)
        }
        if (a.exam_id !== undefined) {
          const exam = context.exams?.find((e) => e.id === a.exam_id)
          if (!exam) problems.push(`${n}: exam_id «${a.exam_id}» no existe en exams.`)
          else if (exam.grade_id)
            problems.push(
              `${n}: ese examen ya tiene nota (grade_id ${exam.grade_id}); usa update_grade si quiere cambiarla.`,
            )
          else if (typeof sid === 'string' && exam.subject_id !== sid)
            problems.push(`${n}: el exam_id es de otra asignatura.`)
        }
        break
      }
      case 'update_task':
      case 'complete_task':
      case 'reopen_task':
      case 'delete_task':
      case 'add_subtasks':
        if (!known(taskIds, a.task_id)) {
          problems.push(
            `${n}: task_id «${a.task_id ?? '(vacío)'}» no existe; cópialo de open_tasks, recently_completed o de un [id] de la conversación.`,
          )
        }
        if (a.type === 'add_subtasks' && (!Array.isArray(a.items) || a.items.length === 0)) {
          problems.push(`${n}: falta items.`)
        }
        break
      case 'update_exam':
      case 'delete_exam':
        if (!known(examIds, a.exam_id))
          problems.push(`${n}: exam_id «${a.exam_id ?? '(vacío)'}» no existe en exams.`)
        break
      case 'update_grade':
      case 'delete_grade':
        if (!known(gradeIds, a.grade_id))
          problems.push(`${n}: grade_id «${a.grade_id ?? '(vacío)'}» no existe en recent_grades.`)
        break
      case 'update_event':
      case 'delete_event':
        if (!known(eventIds, a.event_id))
          problems.push(`${n}: event_id «${a.event_id ?? '(vacío)'}» no existe en events.`)
        break
      case 'log_study':
        if (typeof a.minutes !== 'number' || a.minutes <= 0) problems.push(`${n}: falta minutes.`)
        break
    }
  })
  return problems
}

// ---------------------------------------------------------------------------
// Mistral
// ---------------------------------------------------------------------------

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

class ModelError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

function contentText(message: unknown): string | null {
  if (typeof message === 'string') return message
  // Algunos modelos devuelven el contenido troceado.
  if (Array.isArray(message)) {
    return message.map((p) => (p && typeof p.text === 'string' ? (p.text as string) : '')).join('')
  }
  return null
}

async function chat(
  model: string,
  key: string,
  messages: unknown[],
  jsonMode: boolean,
  temperature = 0.15,
): Promise<string | null> {
  const res = await fetch(CHAT_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: 2500,
      messages,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: unknown } }[]
  }
  if (!res.ok) throw new ModelError(res.status, JSON.stringify(body).slice(0, 400))
  return contentText(body.choices?.[0]?.message?.content)
}

const isKeyError = (e: unknown) => e instanceof ModelError && (e.status === 401 || e.status === 403)

function decodeBase64(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Paso 1 con voz: solo transcribir. Interpretar (fechas, asignaturas) lo hace
 * después el modelo de texto grande, que acierta mucho más.
 */
async function transcribe(
  key: string,
  audio: { data: string; mimeType: string },
  hints: string[],
): Promise<string> {
  const bytes = decodeBase64(audio.data)
  const ext = audio.mimeType.includes('wav')
    ? 'wav'
    : audio.mimeType.includes('webm')
      ? 'webm'
      : audio.mimeType.includes('ogg')
        ? 'ogg'
        : 'm4a'

  // 1) Endpoint de transcripción, con las asignaturas como pistas de
  //    vocabulario; si las pistas no se aceptan, sin ellas.
  for (const withHints of hints.length ? [true, false] : [false]) {
    const started = Date.now()
    try {
      const form = new FormData()
      form.append('model', TRANSCRIBE_MODEL)
      form.append('file', new Blob([bytes], { type: audio.mimeType }), `voz.${ext}`)
      form.append('language', 'es')
      if (withHints) for (const h of hints) form.append('context_bias', h)
      const res = await fetch(TRANSCRIBE_API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        body: form,
      })
      const body = (await res.json().catch(() => ({}))) as { text?: unknown }
      if (!res.ok) throw new ModelError(res.status, JSON.stringify(body).slice(0, 300))
      console.log(
        'transcripción',
        TRANSCRIBE_MODEL,
        withHints ? 'pistas' : 'sin pistas',
        `${Date.now() - started}ms`,
      )
      return typeof body.text === 'string' ? body.text.trim().slice(0, 3000) : ''
    } catch (error) {
      console.error(
        'transcripción fallo',
        withHints ? 'pistas' : 'sin pistas',
        String(error).slice(0, 300),
      )
      if (isKeyError(error)) throw error
    }
  }

  // 2) Respaldo: pedírselo a Voxtral por el chat.
  let lastError: unknown = null
  for (const model of AUDIO_CHAT_MODELS) {
    try {
      const text = await chat(
        model,
        key,
        [
          {
            role: 'system',
            content:
              'Transcribe literalmente, en español, lo que dice el audio. Devuelve SOLO la transcripción, sin comillas ni comentarios. Si no se entiende nada, devuelve una cadena vacía.',
          },
          {
            role: 'user',
            content: [
              { type: 'input_audio', input_audio: audio.data },
              { type: 'text', text: 'Transcribe este audio.' },
            ],
          },
        ],
        false,
        0,
      )
      return (text ?? '').trim().slice(0, 3000)
    } catch (error) {
      console.error('transcripción chat fallo', model, String(error).slice(0, 300))
      lastError = error
      if (isKeyError(error)) throw error
    }
  }
  throw lastError ?? new Error('Sin transcripción')
}

/** Llama al primer modelo de texto disponible. */
async function ask(key: string, messages: unknown[]): Promise<{ text: string; model: string }> {
  let lastError: unknown = null
  for (const model of TEXT_MODELS) {
    // Primero con modo JSON; si el modelo no lo admite (400), sin él: el
    // formato ya va pedido en las instrucciones.
    for (const jsonMode of [true, false]) {
      const started = Date.now()
      try {
        const text = await chat(model, key, messages, jsonMode)
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
        if (isKeyError(error)) throw error
        // Solo un 400 justifica reintentar el mismo modelo sin modo JSON.
        if (!(error instanceof ModelError && error.status === 400)) break
      }
    }
  }
  throw lastError ?? new Error('Sin respuesta del modelo')
}

interface Parsed {
  thinking: string
  reply: string
  actions: Action[]
}

function parseResult(text: string): Parsed {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new SyntaxError('Sin JSON')
  const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  return {
    thinking: typeof parsed.thinking === 'string' ? parsed.thinking : '',
    reply: typeof parsed.reply === 'string' ? parsed.reply.trim().slice(0, 2500) : '',
    actions: Array.isArray(parsed.actions)
      ? (parsed.actions.filter(
          (a) =>
            a &&
            typeof a === 'object' &&
            ACTION_TYPES.includes((a as { type?: string }).type ?? ''),
        ) as Action[])
      : [],
  }
}

/** Historial saneado: alterna usuario/asistente y empieza por el usuario. */
function cleanHistory(raw: unknown): Msg[] {
  if (!Array.isArray(raw)) return []
  const out: Msg[] = []
  for (const m of raw.slice(-MAX_HISTORY)) {
    if (!m || typeof m !== 'object') continue
    const { role, content } = m as { role?: unknown; content?: unknown }
    if (
      (role !== 'user' && role !== 'assistant') ||
      typeof content !== 'string' ||
      !content.trim()
    ) {
      continue
    }
    const text = content.trim().slice(0, 4000)
    const last = out[out.length - 1]
    if (last && last.role === role) last.content += `\n${text}`
    else out.push({ role, content: text })
  }
  while (out.length && out[0].role !== 'user') out.shift()
  // Si acaba en el usuario (p. ej. un intento que falló), se une al mensaje nuevo.
  return out
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
        {
          error: 'El asistente aún no está configurado: falta la clave de Mistral en Supabase.',
        },
        503,
      )
    }

    const length = Number(req.headers.get('content-length') ?? 0)
    if (length > 12_000_000) return json({ error: 'El audio es demasiado largo.' }, 413)

    const body = (await req.json().catch(() => null)) as {
      text?: unknown
      audio?: { data?: unknown; mimeType?: unknown }
      context?: unknown
      history?: unknown
      debug?: unknown
    } | null
    if (!body) return json({ error: 'Petición vacía.' }, 400)

    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 3000) : ''
    const audio =
      body.audio && typeof body.audio.data === 'string' && body.audio.data.length > 0
        ? {
            data: body.audio.data,
            mimeType: typeof body.audio.mimeType === 'string' ? body.audio.mimeType : 'audio/wav',
          }
        : null
    if (!text && !audio) return json({ error: 'No he recibido nada que procesar.' }, 400)

    // Límite diario, contado antes de llamar al modelo.
    const [usage] = await sql<{ requests: number }[]>`
      insert into private.assistant_usage (user_id, day, requests)
      values (${userId}, ${madridDay()}, 1)
      on conflict (user_id, day) do update set requests = private.assistant_usage.requests + 1
      returning requests`
    if (usage.requests > DAILY_LIMIT) {
      return json({ error: `Has llegado al límite de ${DAILY_LIMIT} peticiones de hoy.` }, 429)
    }

    const context = (body.context && typeof body.context === 'object' ? body.context : {}) as Ctx
    const history = cleanHistory(body.history)

    // Con voz: primero se transcribe y luego se interpreta como texto.
    let heard = ''
    if (audio) {
      // Pistas de vocabulario: palabras sueltas (Mistral no admite espacios
      // ni comas en cada una), p. ej. «Matemáticas», «Geología», «Filosofía».
      const hints = [
        ...new Set(
          (context.subjects ?? [])
            .flatMap((s) => s.name.split(/[^\p{L}\p{N}]+/u))
            .filter((w) => w.length >= 4),
        ),
      ].slice(0, 40)
      heard = await transcribe(key, audio, hints)
      if (!heard) {
        return json(
          {
            error: 'No te he oído bien. Repítelo un poco más cerca del micro.',
          },
          422,
        )
      }
    }
    const said = [text, heard].filter(Boolean).join('\n')

    // El mensaje del usuario se une al último del historial si este también
    // era suyo (un intento anterior que falló).
    const turns: Msg[] = [...history]
    if (turns.length && turns[turns.length - 1].role === 'user') {
      turns[turns.length - 1] = {
        role: 'user',
        content: `${turns[turns.length - 1].content}\n${said}`,
      }
    } else {
      turns.push({ role: 'user', content: said })
    }
    const messages: unknown[] = [{ role: 'system', content: instructions(context) }, ...turns]

    let { text: raw, model } = await ask(key, messages)
    let result: Parsed
    let repaired = false
    try {
      result = parseResult(raw)
    } catch {
      // JSON roto: se le pide una sola vez que lo rehaga.
      const retry = await ask(key, [
        ...messages,
        { role: 'assistant', content: raw.slice(0, 4000) },
        {
          role: 'user',
          content: 'Tu respuesta no era un JSON válido. Devuelve SOLO el objeto JSON pedido.',
        },
      ])
      raw = retry.text
      model = retry.model
      result = parseResult(raw)
      repaired = true
    }

    // Revisión: si algo no cuadra con el contexto, el modelo lo corrige una vez.
    const problems = validate(result.actions, context, history)
    if (problems.length > 0) {
      console.log('revisión', problems.length, 'problemas')
      try {
        const retry = await ask(key, [
          ...messages,
          { role: 'assistant', content: raw.slice(0, 6000) },
          {
            role: 'user',
            content: `REVISIÓN AUTOMÁTICA (no lo ha escrito el alumno): tu respuesta tiene estos problemas:\n- ${problems.join('\n- ')}\nCorrígelos usando solo ids y fechas que existan en el contexto. Si no puedes resolver alguno, quita esa acción y pregunta al alumno en reply. Devuelve el JSON completo corregido.`,
          },
        ])
        const fixed = parseResult(retry.text)
        if (
          validate(fixed.actions, context, history).length < problems.length ||
          fixed.actions.length === 0
        ) {
          result = fixed
          model = retry.model
          repaired = true
        }
      } catch (error) {
        // Si la revisión falla, se sigue con la primera respuesta: la app
        // descarta por su cuenta lo que no sea válido.
        if (isKeyError(error)) throw error
        console.error('revisión fallo', String(error).slice(0, 200))
      }
    }

    return json({
      reply: result.reply,
      heard,
      actions: result.actions.slice(0, 25),
      model,
      repaired,
      remaining: Math.max(0, DAILY_LIMIT - usage.requests),
      ...(body.debug === true ? { thinking: result.thinking } : {}),
    })
  } catch (error) {
    console.error('assistant', error)
    if (isKeyError(error)) {
      return json({ error: 'La clave de Mistral no es válida o no tiene permiso.' }, 502)
    }
    if (error instanceof ModelError && (error.status === 429 || error.status >= 500)) {
      return json(
        {
          error: 'La IA está saturada o sin saldo ahora mismo. Prueba en un rato.',
        },
        429,
      )
    }
    if (error instanceof SyntaxError) {
      return json(
        {
          error: 'No he entendido la respuesta de la IA. Repítelo, por favor.',
        },
        502,
      )
    }
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return json({ error: 'La IA está tardando demasiado. Inténtalo otra vez.' }, 504)
    }
    return json({ error: 'No se pudo hablar con la IA. Inténtalo de nuevo.' }, 502)
  }
})
