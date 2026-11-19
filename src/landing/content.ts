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
  secondary: 'Iniciar sesión',
  note: ['Gratis', 'Sin anuncios', 'Se instala desde el navegador, sin tienda de apps'],
  chips: [
    { title: 'Habla y lo apunta', detail: '«Tengo mates el viernes»' },
    { title: 'Funciona sin internet', detail: 'Modo avión, sin problema' },
    { title: '¿Qué nota necesito?', detail: 'Necesitas un 6,4' },
  ],
}

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
  // Datos de la ilustración («Hoy: Madrid → Roma · 50 min»; Lisboa quedaba
  // demasiado cerca para verse el arco en el globo).
  from: { code: 'MAD', city: 'Madrid', lat: 40.47, lon: -3.56 },
  to: { code: 'FCO', city: 'Roma', lat: 41.8, lon: 12.25 },
  minutes: 50,
  seat: '12A',
  gate: 'B7',
}

/** Precios en euros (IVA incluido). Premium aún no se cobra. */
export const PRICES = { monthly: 2.99, quarterly: 6.99, annual: 19.99 }
export const PAYMENTS_ENABLED = false

export type Billing = 'monthly' | 'annual'

export const PRICING = {
  title: 'Empieza gratis. Crece cuando quieras.',
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
