import { useMemo, useState } from 'react'
import { ClipboardPen, Link2, X } from 'lucide-react'

import { relativeDay } from '@/domain/dates'
import { colorVar } from '@/domain/palette'
import type { Exam } from '@/domain/types'
import { useDispatch, useStore, useToday } from '@/state/StoreProvider'
import { useExamsAwaitingGrade, useSubjectMap } from '@/state/selectors'
import { GradeEditor } from '@/features/grades/GradeEditor'
import { Select } from '@/ui/fields'
import { Button, IconButton } from '@/ui/primitives'
import { useToast } from '@/ui/Toast'

/**
 * «¿Qué tal te fue?»: cierra el ciclo de un examen ya hecho pidiendo su nota.
 *
 * Sale en Inicio cuando un examen ha terminado (según su hora o su clase) y
 * sigue sin nota. Se puede apuntar la nota (queda enlazada al examen), enlazar
 * una que ya se apuntó a mano, o descartar la pregunta. Descartar se recuerda
 * en este dispositivo: no cambia los datos del curso ni la sincronización.
 */

const DISMISSED_KEY = 'orbita.examFollowUp.dismissed'

function readDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeDismissed(ids: Set<string>): void {
  try {
    // Solo los últimos: la lista no crece sin fin.
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids].slice(-60)))
  } catch {
    // Sin almacenamiento (modo privado): la pregunta volverá, nada más.
  }
}

export function ExamFollowUp() {
  const { data } = useStore()
  const dispatch = useDispatch()
  const toast = useToast()
  const today = useToday()
  const subjects = useSubjectMap()
  const awaiting = useExamsAwaitingGrade()
  const [dismissed, setDismissed] = useState(readDismissed)
  const [gradeFor, setGradeFor] = useState<Exam | null>(null)
  const [linking, setLinking] = useState(false)

  const list = awaiting.filter((e) => !dismissed.has(e.id))
  const exam = list[0]

  // Notas de la asignatura que no están enlazadas a ningún examen: las que
  // se apuntaron a mano y pueden ser la de este. Las de fecha más cercana,
  // primero.
  const linkable = useMemo(() => {
    if (!exam) return []
    const linked = new Set(data.exams.map((e) => e.gradeEntryId).filter(Boolean))
    const target = Date.parse(exam.date)
    return data.grades
      .filter((g) => g.subjectId === exam.subjectId && !linked.has(g.id))
      .sort((a, b) => Math.abs(Date.parse(a.date) - target) - Math.abs(Date.parse(b.date) - target))
      .slice(0, 8)
  }, [exam, data.exams, data.grades])

  const defaults = useMemo(
    () =>
      gradeFor
        ? {
            subjectId: gradeFor.subjectId,
            examId: gradeFor.id,
            name: gradeFor.title,
            date: gradeFor.date,
            term: gradeFor.term,
            kind: 'examen' as const,
            weight: gradeFor.weight,
          }
        : undefined,
    [gradeFor],
  )

  const editor = <GradeEditor open={!!gradeFor} defaults={defaults} onClose={() => setGradeFor(null)} />
  if (!exam) return editor

  const subject = subjects.get(exam.subjectId)
  const name = subject?.name ?? 'la asignatura'
  const when = exam.date === today ? 'hoy' : relativeDay(exam.date, today).toLowerCase()

  const dismiss = () => {
    const next = new Set(dismissed)
    next.add(exam.id)
    setDismissed(next)
    writeDismissed(next)
    setLinking(false)
    toast({
      text: 'No volveré a preguntar por este examen',
      action: {
        label: 'Deshacer',
        run: () => {
          const back = new Set(next)
          back.delete(exam.id)
          setDismissed(back)
          writeDismissed(back)
        },
      },
    })
  }

  return (
    <>
      <div role="status" className="card flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 mb-4">
        <span
          aria-hidden="true"
          className="grid place-items-center size-10 rounded-[12px] shrink-0"
          style={{
            background: subject ? `color-mix(in srgb, ${colorVar(subject.color)} 16%, transparent)` : 'var(--c-fill)',
            color: subject ? colorVar(subject.color) : 'var(--c-ink-3)',
          }}
        >
          <ClipboardPen className="size-5" strokeWidth={2.2} />
        </span>
        <div className="flex-1 basis-[16rem] min-w-0">
          <p className="text-[0.9375rem] font-semibold text-ink leading-snug">¿Qué tal te fue en {name}?</p>
          <p className="text-[0.8125rem] text-ink-3 leading-snug truncate">
            {exam.title} · {when}
            {list.length > 1 && ` · ${list.length - 1} ${list.length === 2 ? 'examen más' : 'exámenes más'} sin nota`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Button size="sm" variant="primary" onClick={() => setGradeFor(exam)}>
            Apuntar nota
          </Button>
          {linkable.length > 0 && !linking && (
            <Button size="sm" onClick={() => setLinking(true)}>
              <Link2 className="size-3.5" strokeWidth={2.4} />
              Ya la apunté
            </Button>
          )}
          <IconButton label="No preguntar por este examen" size="sm" onClick={dismiss}>
            <X className="size-4" />
          </IconButton>
        </div>
        {linking && (
          <div className="basis-full flex items-center gap-2 flex-wrap">
            <label htmlFor="exam-follow-up-link" className="text-[0.8125rem] text-ink-2">
              Es la nota:
            </label>
            <div className="flex-1 min-w-[12rem]">
              <Select
                id="exam-follow-up-link"
                defaultValue=""
                onChange={(e) => {
                  const grade = data.grades.find((g) => g.id === e.target.value)
                  if (!grade) return
                  dispatch({ type: 'exam/update', id: exam.id, patch: { gradeEntryId: grade.id } })
                  setLinking(false)
                  toast({
                    text: `Enlazada «${grade.name}»`,
                    action: {
                      label: 'Deshacer',
                      run: () => dispatch({ type: 'exam/update', id: exam.id, patch: { gradeEntryId: undefined } }),
                    },
                  })
                }}
              >
                <option value="" disabled>
                  Elige una nota de {name}
                </option>
                {linkable.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} · {g.score.toLocaleString('es-ES')}/{g.maxScore} · {relativeDay(g.date, today)}
                  </option>
                ))}
              </Select>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setLinking(false)}>
              Cancelar
            </Button>
          </div>
        )}
      </div>
      {editor}
    </>
  )
}
