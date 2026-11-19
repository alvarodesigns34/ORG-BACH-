/**
 * Textos y datos de la web de presentación, en un solo sitio para poder
 * sustituirlos sin tocar el diseño.
 *
 * Fuente: planes/orbita-lanzamiento/web/copy-y-estructura-web.md (18-11-2026).
 * Reglas de honestidad: solo se anuncia lo que existe hoy; pagos
 * «próximamente»; nada de cifrado de extremo a extremo; no se nombran otras
 * apps (el modo de estudio es «Modo Estudio» / «vuelos de estudio»).
 *
 * MARCADORES pendientes de Álvaro: [CORREO_CONTACTO], [DOMINIO].
 */

/** Identidad pública: sin nombre ni datos personales. */
export const BRAND = 'Órbita'
export const OWNER = 'Órbita (España)'

/**
 * Correo de contacto. MARCADOR: sustituir por el definitivo cuando exista.
 * Mientras siga siendo el marcador, la web no crea enlaces «mailto».
 */
export const CONTACT_EMAIL = '[CORREO_CONTACTO]'
export const CONTACT_READY = !CONTACT_EMAIL.startsWith('[')

/** Rutas de los textos legales (relativas a la base de la app). */
export const LEGAL = {
  privacy: 'legal/privacidad.html',
  terms: 'legal/condiciones.html',
} as const

export const NAV = { pricing: 'Precios', faq: 'Preguntas', signIn: 'Iniciar sesión', start: 'Empezar gratis' }

export const HERO = {
  eyebrow: 'Para estudiar con cabeza',
  title: ['Tu curso, en órbita.', 'Todo bajo control.'],
  lead:
    'Tareas, exámenes, notas y un asistente que te organiza la semana con solo decírselo. Funciona sin cuenta y sin conexión.',
  primary: 'Empezar gratis',
  secondary: 'Ya tengo cuenta',
  note: ['Gratis', 'Sin anuncios', 'Se instala desde el navegador, sin tienda de apps'],
  chips: [
    { title: 'Habla y lo apunta', detail: '«Tengo mates el viernes»' },
    { title: 'Funciona sin internet', detail: 'Modo avión, sin problema' },
    { title: '¿Qué nota necesito?', detail: 'Necesitas un 6,4' },
  ],
}

/**
 * Panel de salidas de la portada: la semana de un alumno contada como un
 * aeropuerto (ilustración, no datos de nadie). Mayúsculas: es un panel.
 */
export type BoardStatus = 'ontime' | 'boarding' | 'done' | 'need'
export const BOARD: { day: string; time: string; to: string; status: string; tone: BoardStatus; note: string; gate: string }[] = [
  { day: 'LUN', time: '08:30', to: 'MATEMÁTICAS', status: 'EN HORA', tone: 'ontime', note: 'Examen · temas 4 y 5', gate: 'A3' },
  { day: 'MAR', time: '16:00', to: 'LENGUA', status: 'EMBARCANDO', tone: 'boarding', note: 'Comentario de texto', gate: 'B1' },
  { day: 'MIÉ', time: '17:30', to: 'HISTORIA', status: 'HECHO', tone: 'done', note: 'Resumen del tema 6', gate: 'C2' },
  { day: 'JUE', time: '19:00', to: 'INGLÉS', status: 'EN HORA', tone: 'ontime', note: 'Vocabulario unidad 6', gate: 'A1' },
  { day: 'VIE', time: '09:00', to: 'FÍSICA', status: 'NECESITAS 6,4', tone: 'need', note: 'Parcial · cuenta un 40 %', gate: 'D4' },
]
export const BOARD_TITLE = 'SALIDAS · ESTA SEMANA'
export const CLOSING_BOARD = { to: 'TU CURSO', gate: 'Ó', status: 'EMBARCANDO' }

/** Frase que se ilumina palabra a palabra al desplazar. */
export const MANIFESTO =
  'La agenda en una app, las notas en otra y el examen del viernes en la cabeza. Órbita lo junta todo en un sitio y cada mañana te dice qué toca hoy.'

/** Los tres capítulos de la maqueta que responde al desplazamiento. */
export const CHAPTERS = [
  {
    id: 'plan',
    kicker: 'Hoy',
    title: 'Diez segundos y sabes qué toca.',
    text: 'Tareas con subtareas, exámenes, calendario y horario. Lo de hoy, arriba; lo que se acerca, avisado.',
  },
  {
    id: 'assistant',
    kicker: 'Asistente',
    title: 'Dilo y queda apuntado.',
    text: '«Tengo mates el viernes» y se crea el examen. «Mueve la entrega al jueves» y la mueve. Siempre con Deshacer.',
    note: 'Usa IA y puede equivocarse: revisa lo que crea. 15 mensajes al mes gratis.',
  },
  {
    id: 'grades',
    kicker: 'Notas',
    title: 'La nota que necesitas, antes del examen.',
    text: 'Medias ponderadas, categorías con su peso y la calculadora del final. Mueve las barras: es la de verdad.',
  },
] as const

/** Franja que se desplaza sola (decorativa). */
export const MARQUEE = [
  'Tareas',
  'Exámenes',
  'Calendario',
  'Notas',
  'Asignaturas',
  'Objetivos',
  'Horario',
  'Asistente por voz',
  'Vuelos de estudio',
  'Resumen diario',
  'Copias automáticas',
  'Modo oscuro',
]

export type FeatureId = 'plan' | 'assistant' | 'grades' | 'flight'
export const FEATURES: { id: FeatureId; title: string; text: string; note?: string }[] = [
  {
    id: 'plan',
    title: 'Todo en un sitio.',
    text: 'Tareas con subtareas, exámenes, calendario y horario. Abres Órbita por la mañana y en diez segundos sabes qué toca hoy.',
  },
  {
    id: 'assistant',
    title: 'Habla, no teclees.',
    text: 'Dile «tengo mates el viernes» y se crea el examen. «Mueve la entrega al jueves» y la mueve. Siempre con Deshacer.',
    note: 'El asistente usa IA y puede equivocarse: revisa lo que crea. Límite gratuito de 15 mensajes al mes.',
  },
  {
    id: 'grades',
    title: 'Tus notas, claras.',
    text: 'Medias ponderadas, categorías con su peso y la calculadora de la nota que necesitas en el examen final. Pruébala.',
  },
  {
    id: 'flight',
    title: 'Estudia en vuelo.',
    text: 'Elige un destino, despega y estudia hasta aterrizar. Con escalas para descansar y tu progreso en un globo.',
  },
]

/** Demo del asistente (ilustración, no datos de nadie). */
export const ASSISTANT_DEMO = {
  prompt: 'Tengo mates el viernes y entrega de lengua el jueves',
  reply: 'Hecho. He apuntado las dos cosas en tu calendario.',
  cards: [
    { day: 'Jue', title: 'Entrega de Lengua', kind: 'Tarea', color: 'var(--sub-plum)' },
    { day: 'Vie', title: 'Examen de Matemáticas', kind: 'Examen', color: 'var(--sub-sky)' },
  ],
}

export const OFFLINE = {
  title: 'Funciona donde tú estés.',
  lead: 'Sin wifi en el tren, sin cuenta si no quieres: tus datos viven en tu dispositivo y Órbita arranca al instante.',
  list: [
    'Sin conexión, sin problema',
    'Sin cuenta para empezar',
    'Copias automáticas en tu dispositivo',
    'Exportas todo cuando quieras',
    'Sin anuncios',
  ],
  link: 'Cómo cuidamos tus datos',
}

export const FLIGHT = {
  eyebrow: 'Modo Estudio',
  title: ['Cada sesión', 'es un vuelo.'],
  lead:
    'Planea el trayecto, elige cuánto vas a estudiar y despega. Escalas para descansar, sonidos de ambiente y un aviso al aterrizar. Tu tiempo estudiado, siempre sumado.',
  points: [
    { title: 'Tarjeta de embarque', text: 'Destino, puerta y asiento para cada sesión.' },
    { title: 'Escalas para descansar', text: 'Las pausas también cuentan.' },
    { title: 'Sonido de ambiente', text: 'Cabina, lluvia u olas para aislarte.' },
  ],
  // Datos de la ilustración. Con la velocidad de la app (10 km por minuto
  // de estudio, domain/flights.ts), Madrid–Roma son 2 h 13 min.
  from: { code: 'MAD', city: 'Madrid', lat: 40.47, lon: -3.56 },
  to: { code: 'FCO', city: 'Roma', lat: 41.8, lon: 12.25 },
  minutes: 133,
  seat: '12A',
  gate: 'B7',
}

/** Precios en euros (IVA incluido). Premium aún no se cobra. */
export const PRICES = { monthly: 2.99, quarterly: 6.99, annual: 19.99 }
export const PAYMENTS_ENABLED = false

export type Billing = 'monthly' | 'annual'

export const PRICING = {
  title: 'Gratis de verdad. Premium, si quieres más asistente.',
  free: [
    'Tareas, exámenes, calendario, notas y objetivos',
    'Modo Estudio con vuelos',
    'Sin conexión y sin cuenta',
    'Sincronización con cuenta',
    'Resumen diario y avisos',
    'Copias y exportación',
    '15 mensajes al mes con el asistente',
  ],
  premium: ['Todo lo gratuito', '250 mensajes al mes con el asistente, voz incluida', 'Todo lo que añadamos a Premium'],
  quarterly: 'o 6,99 € por 3 meses, sin renovación: para épocas de exámenes',
  premiumCta: PAYMENTS_ENABLED ? 'Hazte Premium' : 'Empezar gratis',
  premiumCtaNote: PAYMENTS_ENABLED ? '' : 'El pago llega pronto',
  fine:
    'Pagos próximamente. Precios con IVA incluido. Cancelas cuando quieras. Para contratar Premium hay que ser mayor de edad o contar con un adulto.',
}

export const OFFER = {
  eyebrow: 'Oferta de lanzamiento',
  title: '12 meses de Premium gratis para los 3 primeros.',
  text: CONTACT_READY
    ? `Escríbenos a ${CONTACT_EMAIL} contando para qué quieres Órbita. Las 3 plazas se asignan por orden de llegada y se canjean con un código.`
    : 'Las 3 plazas se asignan por orden de llegada y se canjean con un código. Muy pronto contaremos aquí cómo pedir el tuyo.',
  seats: 3,
  code: 'ORBITA-····-····',
}

export const FAQ: [string, string][] = [
  ['¿Es gratis?', 'Sí. Puedes usar Órbita gratis para siempre. Premium solo añade más uso del asistente y las funciones nuevas que vayamos incluyendo.'],
  ['¿Tengo que crear una cuenta?', 'No. Sin cuenta, tus datos se quedan en tu dispositivo. Con cuenta se sincronizan entre tus dispositivos y recibes el resumen diario.'],
  ['¿Cómo la instalo? No está en la App Store.', 'Órbita es una app web: ábrela en Safari, pulsa Compartir → «Añadir a pantalla de inicio» y listo. En Android, Chrome te ofrece «Instalar». Sin tienda y sin descargas pesadas. Si vienes desde un enlace de TikTok o Instagram, ábrelo antes en Safari.'],
  ['¿Qué hace el asistente con mis datos?', 'Para responderte envía tu mensaje y un resumen de tu curso a Mistral AI (Francia). Nuestro servidor no guarda la conversación. Es opcional y está explicado en la política de privacidad.'],
  ['¿Mis datos están cifrados de extremo a extremo?', 'No. Se transmiten por conexión segura y cada usuario solo accede a los suyos, pero tu curso sincronizado se guarda en un servidor y no está cifrado de extremo a extremo. Si no creas cuenta, nada sale de tu dispositivo.'],
  ['¿Funciona sin internet?', 'Sí. Las tareas, exámenes, calendario y notas funcionan sin conexión. El asistente y el mapa necesitan internet.'],
  ['¿Para qué etapa vale?', 'ESO, Bachillerato, FP, universidad y oposiciones. Las etapas y asignaturas son configurables.'],
  ['¿Puedo borrar mis datos?', 'Sí, desde Ajustes: exportar todo y eliminar tu cuenta en el momento.'],
  ['¿Qué edad hay que tener?', 'Al menos 14 años.'],
  ['¿Quién está detrás?', CONTACT_READY ? `${OWNER}. Escríbenos a ${CONTACT_EMAIL}.` : `${OWNER}. Muy pronto publicaremos aquí un correo de contacto.`],
]

export const CLOSING = {
  title: ['Empieza hoy.', 'Tu próximo examen te lo agradecerá.'],
  cta: 'Empezar gratis',
}

export const SEO = {
  title: 'Órbita · La app para organizar tus estudios',
  description:
    'Tareas, exámenes y notas en un solo sitio, con un asistente de IA que te organiza la semana. Gratis, sin cuenta y sin conexión.',
}

/* ---------------------------------------------------------------- v3 ---- */

export const HIGHLIGHTS_TITLE = 'Cuatro cosas que vas a usar cada día.'
export const HIGHLIGHTS = [
  { id: 'today', kicker: 'Hoy', title: 'Abres Órbita y sabes qué toca.', text: 'Tareas con subtareas, exámenes, calendario y horario. Lo de hoy arriba; lo que se acerca, avisado.' },
  { id: 'voice', kicker: 'Asistente', title: 'Dilo en voz alta. Queda apuntado.', text: '«Tengo mates el viernes» y se crea el examen. Siempre con Deshacer.' },
  { id: 'grades', kicker: 'Notas', title: 'La nota que necesitas, antes del examen.', text: 'Medias ponderadas por categorías y la calculadora del examen final.' },
  { id: 'flight', kicker: 'Modo Estudio', title: 'Cada sesión de estudio es un vuelo.', text: 'Elige destino y duración, despega y estudia hasta aterrizar.' },
] as const

export const BENTO_TITLE = ['Funciona donde estés.', 'Incluso sin internet.']
export const BENTO = {
  offline: { title: 'Modo avión, sin problema.', text: 'Tareas, exámenes, calendario y notas funcionan sin conexión. Toca el interruptor.' },
  account: { title: 'Sin cuenta para empezar.', text: 'Tus datos se quedan en tu dispositivo. Con cuenta, se sincronizan.' },
  backups: { title: 'Copias automáticas.', text: 'Una al día, y antes de importar o borrar.' },
  export: { title: 'Todo tuyo.', text: 'Exporta una copia o pásalo a Calendario cuando quieras.' },
  ads: { title: 'Sin anuncios.', text: 'Ni ahora ni en el plan gratuito.' },
  install: { title: 'Sin tienda de apps.', text: 'En Safari: Compartir → «Añadir a pantalla de inicio».' },
}

/* ---------------------------------------------------------------- v4 ---- */

/** Lo que gira alrededor del planeta en la portada (ilustración). */
export const ORBIT = [
  { kind: 'Examen', title: 'Biología', meta: 'En 3 días', color: 'var(--sub-sky)' },
  { kind: 'Tarea', title: 'Ejercicios 12–18', meta: 'Hoy · 16:00', color: 'var(--sub-terracotta)' },
  { kind: 'Vuelo', title: 'Madrid → Roma', meta: '2 h 13 min de estudio', color: 'var(--c-accent-fill)' },
  { kind: 'Notas', title: 'Necesitas un 6,4', meta: 'Física · examen final', color: 'var(--sub-teal)' },
  { kind: 'Asistente', title: '«Tengo mates el viernes»', meta: 'Apuntado', color: 'var(--sub-plum)' },
]

export const STORY_TITLE = ['Una app.', 'Todo tu curso.']

export type StoryId = 'today' | 'voice' | 'grades' | 'offline'
export const STORY: { id: StoryId; kicker: string; title: string; text: string; note?: string }[] = [
  {
    id: 'today',
    kicker: 'Hoy',
    title: 'Abres Órbita y sabes qué toca.',
    text: 'Tareas con subtareas, exámenes, calendario y horario. Lo de hoy, arriba. Lo que se acerca, avisado con tiempo.',
  },
  {
    id: 'voice',
    kicker: 'Asistente',
    title: 'Lo dices y queda apuntado.',
    text: '«Tengo mates el viernes» y se crea el examen. «Mueve la entrega al jueves» y la mueve. Siempre con Deshacer.',
    note: 'Usa IA y puede equivocarse: revisa lo que crea. 15 mensajes al mes gratis.',
  },
  {
    id: 'grades',
    kicker: 'Notas',
    title: 'La nota que necesitas, antes del examen.',
    text: 'Medias ponderadas por categorías y la calculadora del examen final. Mueve las barras: es la de verdad.',
  },
  {
    id: 'offline',
    kicker: 'Sin conexión',
    title: 'Modo avión, sin problema.',
    text: 'Tareas, exámenes, calendario y notas funcionan sin internet. Sin cuenta, tus datos no salen de tu dispositivo.',
  },
]

/** El vuelo del Modo Estudio, contado en pantalla completa. */
export const FLIGHT_STORY = {
  title: ['Cada sesión de estudio', 'es un vuelo.'],
  lead: 'Eliges destino según el tiempo que quieres estudiar, despegas y no paras hasta aterrizar.',
  beats: [
    { kicker: 'Despegue', text: 'Empieza la cuenta atrás. Hasta Roma, solo estudiar.' },
    { kicker: 'En ruta', text: 'Sonido de ambiente: cabina, lluvia u olas.' },
    { kicker: 'Escala', text: 'Las pausas también cuentan. Descansas y sigues.' },
  ],
  landed: 'Bienvenido a Roma.',
  landedNote: 'Tu tiempo estudiado, sumado a tu semana.',
}

export const DETAILS_TITLE = 'Y lo que no se ve.'
export const DETAILS: { title: string; text: string }[] = [
  { title: 'Sin cuenta para empezar', text: 'Tus datos se quedan en tu dispositivo. Con cuenta, se sincronizan.' },
  { title: 'Copias automáticas', text: 'Una al día, y antes de importar o borrar.' },
  { title: 'Todo tuyo', text: 'Exporta una copia o pásalo a Calendario cuando quieras.' },
  { title: 'Sin anuncios', text: 'Ni ahora ni en el plan gratuito.' },
  { title: 'Sin tienda de apps', text: 'En Safari: Compartir → «Añadir a pantalla de inicio».' },
  { title: 'Para cualquier etapa', text: 'ESO, Bachillerato, FP, universidad y oposiciones.' },
]
