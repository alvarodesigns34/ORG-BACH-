/**
 * Progreso de los objetivos.
 *
 * Se calcula a partir de los datos reales: notas registradas, sesiones de
 * estudio y tareas completadas. No hay progreso que el alumno tenga que
 * actualizar a mano, salvo en los objetivos de tipo «manual», que existen
 * precisamente para lo que la aplicación no puede medir.
 */

import { formatDuration, startOfWeek, toDay } from './dates.ts'
import { formatGrade, round } from './grades.ts'
import type { SubjectResult } from './grades.ts'
import { isDone } from './tasks.ts'
import type {
  DateISO,
  Goal,
  GoalKind,
  GoalScope,
  GradeScale,
  ID,
  StudySession,
  Subject,
  Task,
  TermId,
} from './types.ts'

export interface GoalContext {
  tasks: Task[]
  sessions: StudySession[]
  subjects: Subject[]
  /** Resultados de la evaluación activa. Los usa el alcance «trimestral». */
  results: Map<ID, SubjectResult>
  globalAverage: number | null
  /** Resultados de TODO el curso. Los usa el alcance «anual». */
  courseResults: Map<ID, SubjectResult>
  courseAverage: number | null
  /**
   * Resultados de una evaluación concreta, para los objetivos que fijan la
   * suya con `goal.term`.
   *
   * Sin esto, un objetivo «media de la 1.ª evaluación» seguía a la evaluación
   * activa: cambiarla en Ajustes reescribía en silencio lo que medían TODOS
   * los objetivos trimestrales ya creados.
   */
  termResults?: (term: TermId) => { results: Map<ID, SubjectResult>; average: number | null }
  scale: GradeScale
  today: DateISO
  weekStartsOn: 0 | 1
}

export interface GoalProgress {
  current: number
  target: number
  /** 0-100, recortado: un 130 % de un objetivo se muestra como completado. */
  percent: number
  /** Texto listo para leer: «7 h 35 min de 8 h». */
  label: string
  /**
   * Cifra que resume el estado, ya formateada.
   *
   * En horas o tareas es el porcentaje, que ahí sí significa algo. En una
   * media NO: decir que un 8,09 es «el 90 %» de un objetivo de 9 da a entender
   * que se parte de cero, cuando el punto de partida real es el aprobado. Ahí
   * se muestra cuánto falta, que es la pregunta de verdad.
   */
  headline: string
  done: boolean
  /** false cuando aún no hay datos con los que medir. */
  measurable: boolean
}

/** Alcances que tienen sentido para cada tipo de objetivo. */
export const SCOPES_BY_KIND: Record<GoalKind, GoalScope[]> = {
  // Una media no se mide por días: se mide por evaluación o por curso.
  media: ['trimestral', 'anual'],
  horas_estudio: ['diario', 'semanal', 'anual'],
  tareas: ['diario', 'semanal'],
  manual: ['diario', 'semanal', 'trimestral', 'anual'],
}

export const SCOPE_LABEL: Record<GoalScope, string> = {
  diario: 'Hoy',
  semanal: 'Esta semana',
  trimestral: 'Esta evaluación',
  anual: 'Este curso',
}

export const KIND_LABEL: Record<GoalKind, string> = {
  media: 'Nota media',
  horas_estudio: 'Horas de estudio',
  tareas: 'Tareas completadas',
  manual: 'Seguimiento manual',
}

/** Primer día del periodo del objetivo. `null` = sin límite (todo el curso). */
function windowStart(scope: GoalScope, ctx: GoalContext): DateISO | null {
  switch (scope) {
    case 'diario':
      return ctx.today
    case 'semanal':
      return startOfWeek(ctx.today, ctx.weekStartsOn)
    default:
      // Ni la evaluación ni el curso tienen fechas registradas, así que se
      // cuenta todo lo acumulado. Es honesto: la aplicación no sabe cuándo
      // empezó el trimestre, y aparentar que sí daría cifras falsas.
      return null
  }
}

export function goalProgress(goal: Goal, ctx: GoalContext): GoalProgress {
  const target = goal.target > 0 ? goal.target : 1
  const from = windowStart(goal.scope, ctx)

  switch (goal.kind) {
    case 'media': {
      // «Este curso» tiene que mirar el curso entero. Usar los resultados de
      // la evaluación activa haría que un objetivo anual midiera en realidad
      // un trimestre, sin que nada en la interfaz lo delatara.
      //
      // Y un objetivo que fija su evaluación (`goal.term`) mide ESA, no la que
      // esté activa en Ajustes: si no, cambiar de evaluación reescribía lo que
      // medían todos los objetivos trimestrales de golpe.
      const annual = goal.scope === 'anual'
      const fixed = !annual && goal.term && ctx.termResults ? ctx.termResults(goal.term) : null

      const source = annual ? ctx.courseResults : (fixed?.results ?? ctx.results)
      const overall = annual ? ctx.courseAverage : (fixed ? fixed.average : ctx.globalAverage)

      const average = goal.subjectId ? (source.get(goal.subjectId)?.average ?? null) : overall

      if (average === null) {
        return {
          current: 0,
          target,
          percent: 0,
          label: 'Sin notas todavía',
          headline: '—',
          done: false,
          measurable: false,
        }
      }
      const shown = round(average, ctx.scale.decimals)
      const done = shown >= target
      return {
        current: average,
        target,
        percent: clampPercent((average / target) * 100),
        label: `${formatGrade(average, ctx.scale)} de ${formatGrade(target, ctx.scale)}`,
        headline: done ? 'Conseguido' : `faltan ${formatGrade(target - shown, ctx.scale)}`,
        done,
        measurable: true,
      }
    }

    case 'horas_estudio': {
      const minutes = ctx.sessions
        .filter((s) => {
          if (goal.subjectId && s.subjectId !== goal.subjectId) return false
          return !from || toDay(new Date(s.startedAt)) >= from
        })
        .reduce((sum, s) => sum + s.minutes, 0)

      const targetMinutes = target * 60
      const percent = clampPercent((minutes / targetMinutes) * 100)
      return {
        current: minutes / 60,
        target,
        percent,
        label: `${formatDuration(minutes)} de ${formatDuration(targetMinutes)}`,
        headline: `${Math.round(percent)} %`,
        done: minutes >= targetMinutes,
        measurable: true,
      }
    }

    case 'tareas': {
      const completed = ctx.tasks.filter((t) => {
        if (!isDone(t) || !t.completedAt) return false
        if (goal.subjectId && t.subjectId !== goal.subjectId) return false
        // El día natural sale de la hora local, no de recortar el ISO: cerca
        // de medianoche esos dos días pueden no coincidir.
        return !from || toDay(new Date(t.completedAt)) >= from
      }).length

      const percent = clampPercent((completed / target) * 100)
      return {
        current: completed,
        target,
        percent,
        label: `${completed} de ${target}`,
        headline: `${Math.round(percent)} %`,
        done: completed >= target,
        measurable: true,
      }
    }

    case 'manual':
    default: {
      const current = goal.manualProgress ?? 0
      const percent = clampPercent((current / target) * 100)
      return {
        current,
        target,
        percent,
        label: `${formatNumber(current)} de ${formatNumber(target)}`,
        headline: `${Math.round(percent)} %`,
        done: current >= target,
        measurable: true,
      }
    }
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function formatNumber(value: number): string {
  return value.toLocaleString('es-ES', { maximumFractionDigits: 2 })
}

/** Sugerencia de título al crear, para no dejar el campo en blanco. */
export function suggestTitle(kind: GoalKind, scope: GoalScope, target: number, subject?: Subject): string {
  const where = subject ? ` en ${subject.name}` : ''
  switch (kind) {
    case 'media':
      return `Conseguir una media de ${target.toLocaleString('es-ES')}${where}`
    case 'horas_estudio':
      return `Estudiar ${target} h${where} · ${SCOPE_LABEL[scope].toLowerCase()}`
    case 'tareas':
      return `Completar ${target} tareas${where} · ${SCOPE_LABEL[scope].toLowerCase()}`
    default:
      return ''
  }
}
