/**
 * Cálculo de notas. Lógica pura: no importa React ni conoce la interfaz.
 *
 * Decisiones que gobiernan todos los cálculos:
 *
 * 1. Cada nota se normaliza a la escala de la aplicación antes de ponderar,
 *    porque un 45/50 y un 9/10 son la misma nota y deben pesar igual.
 *
 * 2. La media se calcula SOBRE LO YA EVALUADO, normalizando por la suma de
 *    pesos realmente presentes. Una categoría sin notas todavía no arrastra la
 *    media a cero: simplemente no participa. Es la diferencia entre "llevas un
 *    8,4" y "llevas un 2,1 porque aún no has hecho el examen final".
 *
 * 3. Los pesos incoherentes se avisan, no se corrigen en silencio. Si suman
 *    90 % o 110 %, el alumno debe verlo y decidir.
 */

import type {
  AverageMode,
  GradeCategory,
  GradeEntry,
  GradeScale,
  ID,
  Subject,
  TermId,
} from './types.ts'

export const DEFAULT_SCALE: GradeScale = { max: 10, pass: 5, decimals: 2 }

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

export interface WeightWarning {
  scope: 'asignatura' | 'categoria'
  categoryId?: ID
  label: string
  /** Suma real de los pesos declarados, en tanto por ciento. */
  sum: number
  message: string
}

export interface CategoryBreakdown {
  /** null = notas que ponderan directamente sobre la asignatura. */
  categoryId: ID | null
  name: string
  /** Peso de la categoría dentro de la asignatura (%). */
  weight: number
  entries: GradeEntry[]
  /** Media de la categoría en la escala de la app. null si aún no hay notas. */
  average: number | null
  /** Suma de los pesos que declaran sus notas (%). */
  declaredWeight: number
  /** Fracción de la categoría ya evaluada, de 0 a 1. */
  coverage: number
}

export interface SubjectResult {
  subjectId: ID
  /** Media sobre lo evaluado hasta ahora. null si no hay ninguna nota. */
  average: number | null
  /** Porcentaje de la asignatura ya evaluado (0-100). */
  evaluatedPercent: number
  categories: CategoryBreakdown[]
  entryCount: number
  warnings: WeightWarning[]
  /**
   * false cuando las notas no declaran pesos, así que `evaluatedPercent` es
   * una suposición y la interfaz no debe presentarlo como un dato firme.
   */
  weightsDeclared: boolean
}

// ---------------------------------------------------------------------------
// Utilidades numéricas
// ---------------------------------------------------------------------------

/** Redondea a `decimals` evitando los errores de coma flotante binaria. */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Lleva una nota a la escala de la aplicación (p. ej. 45/50 → 9 sobre 10). */
export function normalizeScore(entry: GradeEntry, scale: GradeScale): number {
  if (!entry.maxScore) return 0
  return (entry.score / entry.maxScore) * scale.max
}

// ---------------------------------------------------------------------------
// Media de un conjunto de notas
// ---------------------------------------------------------------------------

/**
 * Media ponderada de un grupo de notas.
 *
 * Si ninguna declara peso, cae en media aritmética: es lo que espera alguien
 * que solo quiere apuntar notas sin configurar nada.
 *
 * Y si SOLO ALGUNAS lo declaran, las demás se reparten a partes iguales el
 * hueco que queda hasta el 100 %. Antes desaparecían: al ponderar por la suma
 * declarada, una nota de peso 0 aportaba 0 arriba y 0 abajo, así que apuntar
 * la primera nota sin peso y la segunda con un 40 % hacía que la primera
 * dejara de existir. El hueco es justo lo que el propio editor enseña como
 * «queda un 60 % libre».
 */
export function averageOfEntries(
  entries: GradeEntry[],
  scale: GradeScale,
): { average: number | null; declaredWeight: number; undeclared: number } {
  if (entries.length === 0) return { average: null, declaredWeight: 0, undeclared: 0 }

  const declaredWeight = entries.reduce((sum, e) => sum + (e.weight || 0), 0)
  const undeclared = entries.filter((e) => !e.weight).length

  if (declaredWeight <= 0) {
    const total = entries.reduce((sum, e) => sum + normalizeScore(e, scale), 0)
    return { average: total / entries.length, declaredWeight: 0, undeclared }
  }

  // Lo que no está repartido se divide entre las notas sin peso. Si no queda
  // hueco, se quedan a cero —y de eso avisa `subjectResult`, para que no sea
  // en silencio—.
  const share = undeclared > 0 ? Math.max(0, 100 - declaredWeight) / undeclared : 0
  const effective = (entry: GradeEntry) => entry.weight || share

  // Normalizar por la suma real de pesos, no por 100: así una evaluación a
  // medias devuelve la media de lo hecho, no una fracción de ella.
  const totalWeight = entries.reduce((sum, e) => sum + effective(e), 0)
  if (totalWeight <= 0) return { average: null, declaredWeight, undeclared }

  const weighted = entries.reduce((sum, e) => sum + normalizeScore(e, scale) * effective(e), 0)
  return { average: weighted / totalWeight, declaredWeight, undeclared }
}

// ---------------------------------------------------------------------------
// Nota de una asignatura
// ---------------------------------------------------------------------------

function buildBreakdown(
  category: GradeCategory | null,
  entries: GradeEntry[],
  scale: GradeScale,
  /**
   * Peso del cubo cuando no lo dicta una categoría. Lo usa el cubo de notas
   * huérfanas: dejarle el 100 % por defecto lo haría valer más que todas las
   * categorías juntas.
   */
  weightOverride?: number,
): CategoryBreakdown {
  const { average, declaredWeight, undeclared } = averageOfEntries(entries, scale)

  // Si las notas declaran pesos, la cobertura es cuánto de la categoría
  // suman. Si alguna no lo declara, esa absorbe el hueco restante y la
  // categoría queda cubierta. Y si no los declara ninguna, no hay forma de
  // saberlo: se asume que lo presente es todo lo evaluado hasta ahora.
  const coverage =
    entries.length === 0
      ? 0
      : declaredWeight > 0 && undeclared === 0
        ? clamp(declaredWeight / 100, 0, 1)
        : 1

  return {
    categoryId: category?.id ?? null,
    name: category?.name ?? 'Notas',
    weight: category?.weight ?? weightOverride ?? 100,
    entries,
    average,
    declaredWeight,
    coverage,
  }
}

const ALL_TERMS: TermId[] = ['T1', 'T2', 'T3']

/**
 * Calcula la nota de una asignatura en una evaluación concreta.
 *
 * @param term  Evaluación a calcular, o 'todas' para el curso completo.
 */
export function subjectResult(
  subject: Subject,
  allGrades: GradeEntry[],
  scale: GradeScale,
  term: TermId | 'todas' = 'todas',
): SubjectResult {
  if (term === 'todas') return courseResult(subject, allGrades, scale)
  return termResult(subject, allGrades, scale, term)
}

/**
 * Nota del curso: media de las evaluaciones que ya tienen nota.
 *
 * NO es la media de todas las notas metidas en el mismo saco. Con cuatro
 * exámenes de 8 en la primera evaluación y uno de 4 en la segunda, el saco
 * único da 7,2 y el boletín da 6 —porque cada evaluación vale lo mismo,
 * tenga cuatro notas o una—. La cifra que el alumno reconoce como «la nota
 * del curso» es la segunda.
 *
 * Las evaluaciones sin ninguna nota no participan: a mitad de curso, la nota
 * es la media de lo que ya se ha evaluado, no una fracción arrastrada por dos
 * trimestres vacíos.
 */
function courseResult(
  subject: Subject,
  allGrades: GradeEntry[],
  scale: GradeScale,
): SubjectResult {
  const perTerm = ALL_TERMS.map((t) => termResult(subject, allGrades, scale, t))
  const scored = perTerm.filter((r) => r.average !== null)

  // El desglose por categorías sigue saliendo del conjunto de notas: es lo
  // que la interfaz enseña para explicar de dónde vienen. La media, en
  // cambio, es la de las evaluaciones.
  const pooled = termResult(subject, allGrades, scale, null)

  const average =
    scored.length === 0
      ? null
      : round(scored.reduce((sum, r) => sum + (r.average as number), 0) / scored.length, 4)

  // Cuánto del CURSO se ha evaluado: cada evaluación aporta un tercio, y las
  // que aún no han empezado cuentan como cero. Un curso con la primera
  // evaluación cerrada y nada más lleva un 33 %, no un 100 %.
  const evaluatedPercent = round(
    perTerm.reduce((sum, r) => sum + r.evaluatedPercent, 0) / ALL_TERMS.length,
    2,
  )

  return { ...pooled, average, evaluatedPercent }
}

function termResult(
  subject: Subject,
  allGrades: GradeEntry[],
  scale: GradeScale,
  /** null = todas las notas en el mismo saco, solo para el desglose. */
  term: TermId | null,
): SubjectResult {
  const entries = allGrades.filter(
    (g) => g.subjectId === subject.id && (term === null || g.term === term),
  )

  const warnings: WeightWarning[] = []
  const hasCategories = subject.categories.length > 0

  const breakdowns: CategoryBreakdown[] = hasCategories
    ? subject.categories.map((category) =>
        buildBreakdown(
          category,
          entries.filter((e) => e.categoryId === category.id),
          scale,
        ),
      )
    : [buildBreakdown(null, entries, scale)]

  // Las notas cuya categoría fue borrada —o que se apuntaron «sin categoría»—
  // no desaparecen del cálculo, pero solo pueden ocupar el hueco que las
  // categorías dejan sin repartir. Ni más ni menos.
  //
  // Al borrar «Trabajos 20 %», sus notas heredan justo ese 20 %, que es lo
  // correcto. Y si las categorías ya se reparten el 100 %, no queda sitio: el
  // cubo suelto vale cero y se avisa.
  //
  // Aquí hubo dos intentos fallidos. El primero le daba el 100 % siempre, y
  // una nota suelta pesaba más que todas las categorías juntas. El segundo le
  // daba el 100 % cuando ninguna categoría viva tenía notas, y eso hinchaba el
  // DENOMINADOR: con las categorías sumando 100 y el cubo suelto otros 100, la
  // asignatura pasaba a valer 200 % de sí misma y «lo evaluado» salía a mitad
  // de precio —un examen del 25 % se enseñaba como «12,5 % evaluado»—.
  const declaredCategoryWeight = subject.categories.reduce((acc, c) => acc + (c.weight || 0), 0)
  const freeWeight = round(Math.max(0, 100 - declaredCategoryWeight), 2)
  let crowdedOut = 0

  if (hasCategories) {
    const knownIds = new Set(subject.categories.map((c) => c.id))
    const orphans = entries.filter((e) => !e.categoryId || !knownIds.has(e.categoryId))
    if (orphans.length > 0) {
      if (freeWeight <= 0) crowdedOut = orphans.length
      breakdowns.push(buildBreakdown(null, orphans, scale, freeWeight))
    }
  }

  // --- Aviso: notas sueltas sin sitio donde contar ---
  // Si las categorías ya se reparten el 100 % y las demás sí tienen notas, una
  // nota suelta no tiene hueco y no entra en la media. Es defendible, pero no
  // puede ser silencioso.
  if (crowdedOut > 0) {
    warnings.push({
      scope: 'categoria',
      label: 'Notas',
      sum: 0,
      message:
        crowdedOut === 1
          ? 'Hay 1 nota sin categoría y las categorías ya reparten el 100 %, así que no cuenta en la media. Asígnale una categoría o deja hueco libre.'
          : `Hay ${crowdedOut} notas sin categoría y las categorías ya reparten el 100 %, así que no cuentan en la media. Asígnales una categoría o deja hueco libre.`,
    })
  }

  // --- Aviso: los pesos de las categorías deben sumar 100 % ---
  if (hasCategories) {
    const sum = declaredCategoryWeight
    if (Math.abs(sum - 100) > 0.01) {
      warnings.push({
        scope: 'asignatura',
        label: subject.name,
        sum: round(sum, 2),
        message:
          sum < 100
            ? `Las categorías de ${subject.name} suman ${formatPercent(sum)}. Falta un ${formatPercent(100 - sum)} por repartir.`
            : `Las categorías de ${subject.name} suman ${formatPercent(sum)}, un ${formatPercent(sum - 100)} de más.`,
      })
    }
  }

  // --- Aviso: dentro de cada categoría, los pesos tampoco deben pasar de 100 % ---
  for (const breakdown of breakdowns) {
    if (breakdown.declaredWeight > 100.01) {
      warnings.push({
        scope: 'categoria',
        categoryId: breakdown.categoryId ?? undefined,
        label: breakdown.name,
        sum: round(breakdown.declaredWeight, 2),
        message: `Las notas de ${breakdown.name} suman ${formatPercent(breakdown.declaredWeight)}, más del 100 %.`,
      })
    }
  }

  // --- Media: solo participan las categorías que ya tienen notas ---
  const scoring = breakdowns.filter((b) => b.average !== null && b.weight > 0)
  const activeWeight = scoring.reduce((sum, b) => sum + b.weight, 0)

  const average =
    scoring.length === 0 || activeWeight <= 0
      ? null
      : scoring.reduce((sum, b) => sum + (b.average as number) * b.weight, 0) / activeWeight

  // --- Porcentaje evaluado: peso de cada categoría por su cobertura ---
  const totalWeight = hasCategories
    ? breakdowns.reduce((sum, b) => sum + b.weight, 0) || 100
    : 100
  const evaluatedPercent = clamp(
    breakdowns.reduce((sum, b) => sum + (b.weight / totalWeight) * b.coverage, 0) * 100,
    0,
    100,
  )

  const weightsDeclared = breakdowns.some((b) => b.declaredWeight > 0)

  return {
    subjectId: subject.id,
    average: average === null ? null : round(average, 4),
    evaluatedPercent: round(evaluatedPercent, 2),
    categories: breakdowns,
    entryCount: entries.length,
    warnings,
    weightsDeclared,
  }
}

// ---------------------------------------------------------------------------
// Media global
// ---------------------------------------------------------------------------

/**
 * Media de todas las asignaturas que ya tienen alguna nota.
 *
 * - `aritmetica`: todas las asignaturas valen lo mismo.
 * - `ponderada`: cada una pesa según su campo `weight` (horas o créditos).
 *
 * Las asignaturas sin notas se excluyen en ambos casos: incluirlas como cero
 * daría una media falsa a principio de curso.
 */
export function globalAverage(
  subjects: Subject[],
  results: Map<ID, SubjectResult>,
  mode: AverageMode,
): number | null {
  const scored = subjects
    .filter((s) => !s.archived)
    .map((s) => ({ subject: s, average: results.get(s.id)?.average ?? null }))
    .filter((x): x is { subject: Subject; average: number } => x.average !== null)

  if (scored.length === 0) return null

  if (mode === 'aritmetica') {
    const total = scored.reduce((sum, x) => sum + x.average, 0)
    return round(total / scored.length, 4)
  }

  const totalWeight = scored.reduce((sum, x) => sum + (x.subject.weight || 0), 0)
  if (totalWeight <= 0) {
    const total = scored.reduce((sum, x) => sum + x.average, 0)
    return round(total / scored.length, 4)
  }

  const weighted = scored.reduce((sum, x) => sum + x.average * (x.subject.weight || 0), 0)
  return round(weighted / totalWeight, 4)
}

// ---------------------------------------------------------------------------
// Calculadora: ¿qué nota necesito?
// ---------------------------------------------------------------------------

export type RequiredStatus = 'alcanzable' | 'imposible' | 'ya_conseguido' | 'sin_restante'

export interface RequiredGradeResult {
  remainingPercent: number
  /** Nota media necesaria en lo que queda por evaluar. */
  needed: number
  status: RequiredStatus
  message: string
}

/**
 * Qué nota media hace falta en el porcentaje restante para llegar al objetivo.
 *
 *   objetivo = (media_actual × evaluado + x × restante) / 100
 *   x        = (objetivo × 100 − media_actual × evaluado) / restante
 */
export function requiredGrade(
  currentAverage: number,
  evaluatedPercent: number,
  targetAverage: number,
  scale: GradeScale,
): RequiredGradeResult {
  const evaluated = clamp(evaluatedPercent, 0, 100)
  const remaining = round(100 - evaluated, 2)

  if (remaining <= 0) {
    const reached = currentAverage >= targetAverage
    return {
      remainingPercent: 0,
      needed: 0,
      status: 'sin_restante',
      message: reached
        ? `Ya está todo evaluado y has alcanzado el objetivo con un ${formatGrade(currentAverage, scale)}.`
        : `Ya está todo evaluado: la nota final es ${formatGrade(currentAverage, scale)}.`,
    }
  }

  const needed = (targetAverage * 100 - currentAverage * evaluated) / remaining

  if (needed <= 0) {
    return {
      remainingPercent: remaining,
      needed: 0,
      status: 'ya_conseguido',
      message: `Ya tienes el objetivo asegurado: aunque saques un 0 en el ${formatPercent(remaining)} restante, acabarías con un ${formatGrade((currentAverage * evaluated) / 100, scale)} o más.`,
    }
  }

  if (needed > scale.max + 0.001) {
    const best = round((currentAverage * evaluated + scale.max * remaining) / 100, scale.decimals)
    return {
      remainingPercent: remaining,
      needed: round(needed, 2),
      status: 'imposible',
      message: `El objetivo no es alcanzable con el ${formatPercent(remaining)} que queda. Sacando un ${formatGrade(scale.max, scale)} en todo lo restante llegarías como máximo a ${formatGrade(best, scale)}.`,
    }
  }

  return {
    remainingPercent: remaining,
    needed: round(needed, 2),
    status: 'alcanzable',
    message: `Necesitas una media de ${formatGrade(needed, scale)} en el ${formatPercent(remaining)} que queda por evaluar.`,
  }
}

/**
 * Media final si sacas `grade` en un tramo que vale `overPercent`.
 *
 * Con `overPercent` igual al restante responde a "si saco esto en todo lo que
 * queda"; con un porcentaje menor responde a "si saco esto en el próximo
 * examen", y la media resultante es solo sobre lo evaluado hasta ahí.
 */
export function projectAverage(
  currentAverage: number,
  evaluatedPercent: number,
  grade: number,
  overPercent: number,
): number {
  const evaluated = clamp(evaluatedPercent, 0, 100)
  const chunk = Math.max(0, overPercent)
  const totalWeight = evaluated + chunk
  if (totalWeight <= 0) return 0
  return round((currentAverage * evaluated + grade * chunk) / totalWeight, 4)
}

// ---------------------------------------------------------------------------
// Validación de pesos
// ---------------------------------------------------------------------------

export interface WeightCheck {
  sum: number
  status: 'ok' | 'falta' | 'sobra'
  message: string | null
}

/** Comprueba que un reparto de pesos sume 100 %. */
export function checkWeights(weights: number[], label = 'Los pesos'): WeightCheck {
  const sum = round(
    weights.reduce((acc, w) => acc + (Number.isFinite(w) ? w : 0), 0),
    2,
  )
  if (Math.abs(sum - 100) <= 0.01) {
    return { sum, status: 'ok', message: null }
  }
  if (sum < 100) {
    return {
      sum,
      status: 'falta',
      message: `${label} suman ${formatPercent(sum)}. Falta un ${formatPercent(100 - sum)}.`,
    }
  }
  return {
    sum,
    status: 'sobra',
    message: `${label} suman ${formatPercent(sum)}, un ${formatPercent(sum - 100)} de más.`,
  }
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

/** Nota en formato español: coma decimal y los decimales de la escala. */
export function formatGrade(value: number | null | undefined, scale: GradeScale): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toLocaleString('es-ES', {
    minimumFractionDigits: scale.decimals,
    maximumFractionDigits: scale.decimals,
  })
}

/** Porcentaje sin decimales innecesarios: '30 %', '12,5 %'. */
export function formatPercent(value: number): string {
  const rounded = round(value, 2)
  const text = rounded.toLocaleString('es-ES', { maximumFractionDigits: 2 })
  return `${text} %`
}

export type GradeTone = 'ok' | 'warn' | 'danger' | 'neutral'

/**
 * Semáforo de una nota respecto al aprobado. Se usa junto a texto, nunca como
 * único portador de la información.
 */
export function gradeTone(value: number | null | undefined, scale: GradeScale): GradeTone {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'neutral'
  // Se compara lo que se VE, no el flotante crudo: un 4,995 pintado como 5,00
  // no puede ir en rojo de suspenso.
  const shown = round(value, scale.decimals)
  if (shown < scale.pass) return 'danger'
  // El tramo justo por encima del aprobado merece atención, no celebración.
  if (shown < scale.pass + (scale.max - scale.pass) * 0.35) return 'warn'
  return 'ok'
}

/**
 * Igual que `gradeTone`, pero devolviendo `undefined` en lugar de 'neutral'
 * para los componentes que esperan «sin tono» cuando no hay nota.
 */
export function numeralTone(
  value: number | null | undefined,
  scale: GradeScale,
): 'ok' | 'warn' | 'danger' | undefined {
  const tone = gradeTone(value, scale)
  return tone === 'neutral' ? undefined : tone
}
