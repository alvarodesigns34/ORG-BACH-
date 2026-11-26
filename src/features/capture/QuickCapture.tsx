import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, NotebookPen, Sparkles } from 'lucide-react'

import { addDays, relativeDay } from '@/domain/dates'
import { colorVar, quietVar } from '@/domain/palette'
import { formatGrade } from '@/domain/grades'
import { parseQuickGrade, parseQuickTask, subjectFromSchedule } from '@/domain/quickCapture'
import type { ID } from '@/domain/types'
import { useDispatch, useSettings, useStore, useToday } from '@/state/StoreProvider'
import { useChrome } from '@/layout/chrome'
import { Modal } from '@/ui/Modal'
import { useToast } from '@/ui/Toast'
import { haptic } from '@/ui/motion'
import { Button, Segmented, cx } from '@/ui/primitives'

type Kind = 'tarea' | 'nota'

/**
 * Apuntar en dos toques: «+» y escribir. Una sola línea en lenguaje natural
 * («Problemas física mañana», «Examen tema 4 mates 7,5»): la asignatura, la
 * fecha y la nota salen del texto, del horario (la clase que acabas de dar) o
 * de lo último que apuntaste, y se corrigen con un toque en las cápsulas.
 *
 * Crea lo mismo que los editores completos, con los mismos campos: no cambia
 * nada de cómo se guardan los datos.
 */
export function QuickCapture({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useStore()
  const dispatch = useDispatch()
  const settings = useSettings()
  const today = useToday()
  const toast = useToast()
  const { openCreate } = useChrome()

  const [kind, setKind] = useState<Kind>('tarea')
  const [text, setText] = useState('')
  // undefined = automática; null = sin asignatura elegida a mano.
  const [subjectPick, setSubjectPick] = useState<ID | null | undefined>(undefined)
  const [datePick, setDatePick] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setText('')
    setSubjectPick(undefined)
    setDatePick(undefined)
    setError(null)
  }, [open])

  const subjects = useMemo(() => data.subjects.filter((s) => !s.archived), [data.subjects])
  const scheduleGuess = useMemo(() => (open ? subjectFromSchedule(subjects, new Date()) : undefined), [subjects, open])
  // La última asignatura con la que apuntaste una nota: si vas pasando las
  // notas de un boletín, suelen ir seguidas.
  const lastGradeSubject = useMemo(() => {
    let best: { id: ID; at: string } | undefined
    for (const g of data.grades) if (!best || g.createdAt > best.at) best = { id: g.subjectId, at: g.createdAt }
    return best?.id
  }, [data.grades])

  const task = useMemo(() => (kind === 'tarea' ? parseQuickTask(text, subjects, today) : null), [kind, text, subjects, today])
  const grade = useMemo(
    () => (kind === 'nota' ? parseQuickGrade(text, subjects, settings.gradeScale.max) : null),
    [kind, text, subjects, settings.gradeScale.max],
  )

  const parsedSubject = task?.subjectId ?? grade?.subjectId
  const autoSubject = parsedSubject ?? scheduleGuess ?? (kind === 'nota' ? lastGradeSubject : undefined)
  const subjectId = subjectPick !== undefined ? subjectPick : autoSubject
  const suggested = subjectPick === undefined && !parsedSubject && !!autoSubject

  // Lo que apuntas volviendo a casa suele ser para mañana.
  const tomorrow = addDays(today, 1)
  const dueDate = datePick !== undefined ? datePick : (task?.dueDate ?? tomorrow)

  const submit = () => {
    if (!text.trim()) {
      setError(kind === 'tarea' ? 'Escribe la tarea.' : 'Escribe la nota, p. ej. «Examen tema 4 7,5».')
      return
    }
    if (kind === 'tarea' && task) {
      dispatch({
        type: 'task/add',
        task: {
          title: task.title,
          subjectId: subjectId ?? undefined,
          dueDate: dueDate ?? undefined,
          dueTime: dueDate ? task.dueTime : undefined,
          priority: task.priority,
          status: 'pendiente',
          estimatedMinutes: task.estimatedMinutes,
          tags: task.tags,
          subtasks: [],
        },
      })
      haptic('success')
      toast({ text: `Tarea apuntada${dueDate ? ` para ${relativeDay(dueDate, today).toLowerCase()}` : ''}` })
      onClose()
      return
    }
    if (kind === 'nota' && grade) {
      if (!subjectId) return setError('Elige la asignatura en las cápsulas de abajo.')
      if (grade.score === undefined) return setError('Falta la nota: escríbela con decimales, p. ej. 7,5 o 16/20.')
      dispatch({
        type: 'grade/add',
        grade: {
          subjectId,
          categoryId: null,
          term: settings.activeTerm,
          name: grade.name,
          kind: grade.kind,
          score: grade.score,
          maxScore: grade.maxScore ?? settings.gradeScale.max,
          // 0 = se reparte el peso libre, como al dejarlo vacío en el editor.
          weight: 0,
          date: today,
        },
      })
      haptic('success')
      toast({ text: `Nota apuntada: ${grade.name}` })
      onClose()
    }
  }

  const more = (target: 'tarea' | 'nota' | 'examen' | 'evento') => {
    onClose()
    window.setTimeout(() => openCreate(target), 220)
  }

  const chip = (active: boolean) =>
    cx(
      'pressable shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[0.8125rem] font-medium whitespace-nowrap transition-colors',
      active ? 'bg-accent-fill text-white' : 'bg-fill text-ink-2',
    )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Apuntar"
      size="sm"
      keyboard
      footer={
        <>
          <Button variant="ghost" onClick={() => more(kind)} className="mr-auto">
            Más detalles
          </Button>
          <Button variant="primary" onClick={submit} disabled={!text.trim()}>
            Añadir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Segmented
          label="Qué apuntas"
          value={kind}
          onChange={(k) => {
            setKind(k)
            setError(null)
          }}
          options={[
            { value: 'tarea' as Kind, label: 'Tarea' },
            { value: 'nota' as Kind, label: 'Nota' },
          ]}
          className="self-stretch [&>*]:flex-1"
        />

        <div className="form-group">
          <div className="form-row flex items-center gap-2 pl-4 pr-2">
            <Sparkles className="size-4 shrink-0 text-accent" aria-hidden />
            <input
              data-autofocus
              value={text}
              enterKeyHint="done"
              aria-label={kind === 'tarea' ? 'Tarea en una línea' : 'Nota en una línea'}
              aria-invalid={!!error}
              placeholder={kind === 'tarea' ? 'Problemas física mañana' : 'Examen tema 4 mates 7,5'}
              onChange={(e) => {
                setText(e.target.value)
                if (error) setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
              className="flex-1 min-w-0 h-[3.25rem] bg-transparent text-[1.0625rem] text-ink placeholder:text-ink-3 focus:outline-none"
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="px-1 -mt-2 text-[0.8125rem] text-danger">
            {error}
          </p>
        )}

        {/* --- Lo que se ha entendido --- */}
        {kind === 'nota' && (
          <p className="px-1 text-[0.8125rem] text-ink-3" aria-live="polite">
            {grade?.score !== undefined ? (
              <>
                <span className="font-semibold text-ink">
                  {formatGrade(grade.score, { ...settings.gradeScale, max: grade.maxScore ?? settings.gradeScale.max })}
                  {grade.maxScore && grade.maxScore !== settings.gradeScale.max ? ` / ${grade.maxScore}` : ''}
                </span>{' '}
                · {grade.name} · {settings.activeTerm.replace('T', '')}.ª evaluación · hoy
              </>
            ) : (
              'Escribe qué fue y la nota; la asignatura sale del texto o de las cápsulas.'
            )}
          </p>
        )}

        {kind === 'tarea' && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" role="group" aria-label="Fecha">
            {[
              { label: 'Hoy', value: today },
              { label: 'Mañana', value: tomorrow },
              { label: 'Sin fecha', value: null },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={dueDate === option.value}
                onClick={() => setDatePick(option.value)}
                className={chip(dueDate === option.value)}
              >
                {option.label}
              </button>
            ))}
            {dueDate && dueDate !== today && dueDate !== tomorrow && (
              <span className={chip(true)}>
                {relativeDay(dueDate, today)}
                {task?.dueTime ? ` · ${task.dueTime}` : ''}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5" role="group" aria-label="Asignatura">
          {subjects.map((s) => {
            const active = subjectId === s.id
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSubjectPick(active ? null : s.id)}
                className={cx(
                  'pressable shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[0.8125rem] font-semibold whitespace-nowrap transition-[background-color,color,box-shadow]',
                  active ? 'shadow-[0_2px_8px_-2px_rgb(0_0_0/0.25)]' : 'text-ink-2',
                )}
                style={{ background: active ? colorVar(s.color) : quietVar(s.color), color: active ? 'var(--c-surface)' : colorVar(s.color) }}
              >
                {s.shortName || s.name}
                {active && suggested && <span className="font-medium opacity-80">· sugerida</span>}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-1 pt-1 text-[0.8125rem] text-ink-3">
          <span className="mr-1">También:</span>
          {(
            [
              { k: 'examen', label: 'Examen', icon: NotebookPen },
              { k: 'evento', label: 'Evento', icon: CalendarPlus },
            ] as const
          ).map(({ k, label, icon: Icon }) => (
            <button
              key={k}
              type="button"
              onClick={() => more(k)}
              className="pressable inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-accent font-medium hover:bg-accent-quiet"
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
