import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { m as motion } from 'motion/react'
import {
  BookOpen,
  CalendarDays,
  CalendarPlus,
  CornerDownLeft,
  GraduationCap,
  ListChecks,
  Moon,
  NotebookPen,
  PlaneTakeoff,
  Plus,
  Search,
  Sparkles,
  Sun,
  Target,
  X,
} from 'lucide-react'

import { formatDuration, formatShort, relativeDay } from '@/domain/dates'
import { formatGrade } from '@/domain/grades'
import { colorVar } from '@/domain/palette'
import { parseQuickTask } from '@/domain/quickCapture'
import { isDone, normalize } from '@/domain/tasks'
import { hrefFor, studyHref } from '@/router'
import { useDispatch, useSettings, useStore, useToday } from '@/state/StoreProvider'
import { useSubjectMap } from '@/state/selectors'
import { NAV_ITEMS } from '@/layout/navigation'
import type { CreateKind } from '@/layout/chrome'
import { Modal } from '@/ui/Modal'
import { spring } from '@/ui/motion'
import { useToast } from '@/ui/Toast'
import { PRIORITY_LABEL, cx } from '@/ui/primitives'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onCreate: (kind: CreateKind) => void
  onOpenAssistant: () => void
}

interface PaletteItem {
  id: string
  group: string
  label: string
  detail?: string
  badge?: string
  color?: string
  icon: ReactNode
  keywords: string
  run: () => void
}

/**
 * Búsqueda global y acciones rápidas (⌘K / /), 100 % local y sin latencia.
 *
 * Permite saltar a cualquier asignatura, tarea, examen, nota, evento, objetivo
 * o sección, lanzar acciones (crear, despegar un vuelo, cambiar de tema) y
 * capturar tareas en lenguaje natural desde cualquier pantalla.
 */
export function CommandPalette({
  open,
  onClose,
  onCreate,
  onOpenAssistant,
}: CommandPaletteProps) {
  const { data } = useStore()
  const settings = useSettings()
  const today = useToday()
  const dispatch = useDispatch()
  const toast = useToast()
  const subjects = useSubjectMap()

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const go = (hash: string) => {
    onClose()
    window.location.hash = hash.startsWith('#') ? hash.slice(1) : hash
  }

  const hasSubjects = useMemo(() => data.subjects.some((s) => !s.archived), [data.subjects])

  const parsedQuick = useMemo(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) return null
    const parsed = parseQuickTask(trimmed, data.subjects, today)
    return parsed.title.trim() ? parsed : null
  }, [query, data.subjects, today])

  const results = useMemo<PaletteItem[]>(() => {
    const needle = normalize(query)
    const items: PaletteItem[] = []

    const pushIfMatch = (item: PaletteItem) => {
      if (!needle || item.keywords.includes(needle)) items.push(item)
    }

    // 1. Cuando no hay texto, mostrar accesos rápidos y secciones principales.
    if (!needle) {
      items.push(
        {
          id: 'act-task',
          group: 'Acciones rápidas',
          label: 'Nueva tarea',
          badge: 'N',
          icon: <Plus className="size-4 text-accent" />,
          keywords: 'nueva tarea crear',
          run: () => {
            onClose()
            onCreate('tarea')
          },
        },
        ...(hasSubjects
          ? [
              {
                id: 'act-exam',
                group: 'Acciones rápidas',
                label: 'Apuntar examen',
                badge: 'E',
                icon: <CalendarPlus className="size-4 text-danger" />,
                keywords: 'nuevo examen apuntar',
                run: () => {
                  onClose()
                  onCreate('examen')
                },
              },
              {
                id: 'act-grade',
                group: 'Acciones rápidas',
                label: 'Apuntar nota',
                badge: 'G',
                icon: <GraduationCap className="size-4 text-accent" />,
                keywords: 'nueva nota calificacion',
                run: () => {
                  onClose()
                  onCreate('nota')
                },
              },
            ]
          : []),
        {
          id: 'act-flight',
          group: 'Acciones rápidas',
          label: 'Despegar vuelo de 25 min',
          badge: 'D',
          icon: <PlaneTakeoff className="size-4 text-accent" />,
          keywords: 'estudiar vuelo despegar pomodoro 25',
          run: () => go(hrefFor('estudio', { despegar: '25' })),
        },
        {
          id: 'act-assistant',
          group: 'Acciones rápidas',
          label: 'Abrir Asistente',
          badge: 'A',
          icon: <Sparkles className="size-4 text-accent" />,
          keywords: 'asistente ia voz preguntar',
          run: () => {
            onClose()
            onOpenAssistant()
          },
        },
        {
          id: 'act-theme',
          group: 'Acciones rápidas',
          label:
            settings.theme === 'dark' ? 'Cambiar a aspecto claro' : 'Cambiar a aspecto oscuro',
          icon:
            settings.theme === 'dark' ? (
              <Sun className="size-4 text-warn" />
            ) : (
              <Moon className="size-4 text-accent" />
            ),
          keywords: 'tema claro oscuro apariencia modo noche',
          run: () => {
            const next = settings.theme === 'dark' ? 'light' : 'dark'
            dispatch({ type: 'settings/update', patch: { theme: next } })
            onClose()
          },
        },
      )

      for (const nav of NAV_ITEMS) {
        items.push({
          id: `nav-${nav.id}`,
          group: 'Ir a',
          label: nav.label,
          icon: <nav.icon className="size-4 text-ink-2" />,
          keywords: normalize(nav.label),
          run: () => go(hrefFor(nav.id)),
        })
      }
      return items
    }

    // 2. Con texto: buscar en todo el curso (asignaturas, tareas, exámenes, notas, eventos, objetivos, acciones).
    for (const s of data.subjects) {
      if (s.archived) continue
      pushIfMatch({
        id: `subj-${s.id}`,
        group: 'Asignaturas',
        label: s.name,
        detail: [s.shortName, s.teacher, s.room && `Aula ${s.room}`].filter(Boolean).join(' · '),
        color: colorVar(s.color),
        icon: <BookOpen className="size-4" style={{ color: colorVar(s.color) }} />,
        keywords: normalize([s.name, s.shortName, s.teacher ?? '', s.room ?? ''].join(' ')),
        run: () => go(hrefFor('asignaturas', { id: s.id })),
      })
    }

    let taskMatches = 0
    for (const t of data.tasks) {
      if (taskMatches >= 8) break
      const subject = t.subjectId ? subjects.get(t.subjectId) : undefined
      const kw = normalize(
        [t.title, t.description ?? '', t.tags.join(' '), subject?.name ?? '', subject?.shortName ?? ''].join(' '),
      )
      if (!kw.includes(needle)) continue
      taskMatches++
      items.push({
        id: `task-${t.id}`,
        group: 'Tareas',
        label: t.title,
        detail: [
          isDone(t) ? 'Completada' : null,
          subject?.name,
          t.dueDate ? relativeDay(t.dueDate, today) : null,
          t.estimatedMinutes ? formatDuration(t.estimatedMinutes) : null,
        ]
          .filter(Boolean)
          .join(' · '),
        color: subject ? colorVar(subject.color) : undefined,
        icon: <ListChecks className={cx('size-4', isDone(t) ? 'text-ok' : 'text-accent')} />,
        keywords: kw,
        run: () =>
          go(
            t.dueDate
              ? hrefFor('calendario', { dia: t.dueDate })
              : hrefFor('tareas', isDone(t) ? { vista: 'completadas' } : undefined),
          ),
      })
    }

    let examMatches = 0
    for (const e of data.exams) {
      if (examMatches >= 6) break
      const subject = subjects.get(e.subjectId)
      if (subject?.archived) continue
      const kw = normalize([e.title, e.topics ?? '', subject?.name ?? '', subject?.shortName ?? ''].join(' '))
      if (!kw.includes(needle)) continue
      examMatches++
      items.push({
        id: `exam-${e.id}`,
        group: 'Exámenes',
        label: e.title,
        detail: [subject?.name, formatShort(e.date), e.time, e.topics].filter(Boolean).join(' · '),
        color: subject ? colorVar(subject.color) : undefined,
        icon: <NotebookPen className="size-4 text-danger" />,
        keywords: kw,
        run: () => go(hrefFor('calendario', { dia: e.date })),
      })
    }

    let gradeMatches = 0
    for (const g of data.grades) {
      if (gradeMatches >= 5) break
      const subject = subjects.get(g.subjectId)
      if (subject?.archived) continue
      const kw = normalize([g.name, g.comment ?? '', subject?.name ?? '', subject?.shortName ?? ''].join(' '))
      if (!kw.includes(needle)) continue
      gradeMatches++
      items.push({
        id: `grade-${g.id}`,
        group: 'Notas',
        label: g.name,
        detail: [subject?.name, g.term, formatShort(g.date)].filter(Boolean).join(' · '),
        badge: formatGrade(g.score, settings.gradeScale),
        color: subject ? colorVar(subject.color) : undefined,
        icon: <GraduationCap className="size-4 text-accent" />,
        keywords: kw,
        run: () => go(hrefFor('asignaturas', { id: g.subjectId })),
      })
    }

    for (const ev of data.events) {
      const subject = ev.subjectId ? subjects.get(ev.subjectId) : undefined
      pushIfMatch({
        id: `event-${ev.id}`,
        group: 'Eventos',
        label: ev.title,
        detail: [formatShort(ev.date), ev.startTime, ev.notes].filter(Boolean).join(' · '),
        icon: <CalendarDays className="size-4 text-warn" />,
        keywords: normalize([ev.title, ev.notes ?? '', subject?.name ?? ''].join(' ')),
        run: () => go(hrefFor('calendario', { dia: ev.date })),
      })
    }

    for (const goal of data.goals) {
      if (goal.archived) continue
      pushIfMatch({
        id: `goal-${goal.id}`,
        group: 'Objetivos',
        label: goal.title,
        icon: <Target className="size-4 text-accent" />,
        keywords: normalize(goal.title),
        run: () => go(hrefFor('objetivos')),
      })
    }

    // Secciones y acciones coincidentes
    for (const nav of NAV_ITEMS) {
      pushIfMatch({
        id: `nav-${nav.id}`,
        group: 'Secciones',
        label: nav.label,
        icon: <nav.icon className="size-4 text-ink-2" />,
        keywords: normalize(nav.label),
        run: () => go(hrefFor(nav.id)),
      })
    }

    pushIfMatch({
      id: 'act-flight-25',
      group: 'Acciones',
      label: 'Despegar vuelo de 25 min',
      icon: <PlaneTakeoff className="size-4 text-accent" />,
      keywords: 'despegar vuelo estudiar foco pomodoro 25',
      run: () => go(studyHref({ minutes: 25 })),
    })
    pushIfMatch({
      id: 'act-theme',
      group: 'Acciones',
      label: settings.theme === 'dark' ? 'Cambiar a aspecto claro' : 'Cambiar a aspecto oscuro',
      icon:
        settings.theme === 'dark' ? (
          <Sun className="size-4 text-warn" />
        ) : (
          <Moon className="size-4 text-accent" />
        ),
      keywords: 'tema claro oscuro aspecto modo noche dia',
      run: () => {
        const next = settings.theme === 'dark' ? 'light' : 'dark'
        dispatch({ type: 'settings/update', patch: { theme: next } })
        onClose()
      },
    })

    // Captura rápida de tarea siempre disponible cuando el usuario escribe algo
    if (parsedQuick) {
      const subj = parsedQuick.subjectId ? subjects.get(parsedQuick.subjectId) : undefined
      const meta = [
        subj?.shortName || subj?.name,
        parsedQuick.dueDate
          ? `${relativeDay(parsedQuick.dueDate, today)}${parsedQuick.dueTime ? ` ${parsedQuick.dueTime}` : ''}`
          : null,
        parsedQuick.estimatedMinutes ? formatDuration(parsedQuick.estimatedMinutes) : null,
        parsedQuick.priority !== 'media' ? PRIORITY_LABEL[parsedQuick.priority] : null,
      ]
        .filter(Boolean)
        .join(' · ')

      items.push({
        id: 'quick-create-task',
        group: 'Captura rápida',
        label: `Crear tarea: «${parsedQuick.title}»`,
        detail: meta || 'Añadir directamente a Tareas',
        badge: 'Intro',
        icon: <Plus className="size-4 text-accent" />,
        keywords: '',
        run: () => {
          dispatch({
            type: 'task/add',
            task: {
              title: parsedQuick.title,
              subjectId: parsedQuick.subjectId,
              dueDate: parsedQuick.dueDate,
              dueTime: parsedQuick.dueTime,
              priority: parsedQuick.priority,
              status: 'pendiente',
              estimatedMinutes: parsedQuick.estimatedMinutes,
              tags: parsedQuick.tags,
              subtasks: [],
            },
          })
          onClose()
          toast({ text: `Tarea añadida: ${parsedQuick.title}` })
        },
      })
    }

    return items
  }, [
    query,
    data.subjects,
    data.tasks,
    data.exams,
    data.grades,
    data.events,
    data.goals,
    subjects,
    today,
    settings.gradeScale,
    settings.theme,
    hasSubjects,
    parsedQuick,
    dispatch,
    onClose,
    onCreate,
    onOpenAssistant,
    toast,
  ])

  const clampedIndex = results.length === 0 ? -1 : Math.min(activeIndex, results.length - 1)
  const activeItem = clampedIndex >= 0 ? results[clampedIndex] : undefined

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (!activeItem || !listRef.current) return
    const node = listRef.current.querySelector<HTMLElement>(`[data-cmd-id="${activeItem.id}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [activeItem?.id])

  // Agrupar preservando el orden de aparición.
  const groups = useMemo(() => {
    const map = new Map<string, { item: PaletteItem; flatIndex: number }[]>()
    results.forEach((item, flatIndex) => {
      const list = map.get(item.group) ?? []
      list.push({ item, flatIndex })
      map.set(item.group, list)
    })
    return [...map.entries()]
  }, [results])

  return (
    <Modal open={open} onClose={onClose} title="Buscar en Órbita" size="md">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 z-[1] size-4 text-ink-3 pointer-events-none"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="command-palette-list"
            aria-activedescendant={activeItem ? `cmd-${activeItem.id}` : undefined}
            aria-label="Buscar en todo el curso o crear tarea rápida"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                if (results.length > 0) setActiveIndex((i) => (i + 1) % results.length)
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                if (results.length > 0) setActiveIndex((i) => (i - 1 + results.length) % results.length)
              } else if (e.key === 'Enter' && activeItem) {
                e.preventDefault()
                activeItem.run()
              }
            }}
            placeholder="Busca tareas, exámenes, asignaturas… o escribe para crear"
            className="glass-input w-full h-11 rounded-full pl-10 pr-10 text-[1rem] text-ink placeholder:text-ink-3 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              className="pressable absolute right-1.5 top-1/2 -translate-y-1/2 size-8 grid place-items-center rounded-full text-ink-3 hover:text-ink hover:bg-fill/70"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <ul
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Resultados"
          className="max-h-[52dvh] overflow-y-auto -mx-1 px-1 flex flex-col gap-3"
        >
          {groups.map(([group, entries]) => (
            <li key={group} role="presentation" className="flex flex-col gap-0.5">
              <p className="px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-ink-3">
                {group}
              </p>
              {entries.map(({ item, flatIndex }) => {
                const selected = flatIndex === clampedIndex
                return (
                  <button
                    key={item.id}
                    id={`cmd-${item.id}`}
                    data-cmd-id={item.id}
                    role="option"
                    aria-selected={selected}
                    type="button"
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                    onClick={() => item.run()}
                    className={cx(
                      'pressable relative w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-[16px] transition-colors',
                      'text-ink',
                    )}
                  >
                    {selected && (
                      <motion.span
                        layoutId="cmd-active-pill"
                        aria-hidden
                        transition={spring.snappy}
                        className="absolute inset-0 rounded-[16px] filter-on pointer-events-none"
                      />
                    )}
                    <span
                      className={cx(
                        'relative z-[1] grid place-items-center size-8 rounded-full shrink-0 transition-transform duration-200',
                        selected
                          ? 'bg-surface shadow-[0_2px_8px_rgb(0_0_0/0.08)] scale-[1.05]'
                          : 'bg-surface/80',
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="relative z-[1] min-w-0 flex-1">
                      <span className="block text-[0.9375rem] font-medium truncate">
                        {item.label}
                      </span>
                      {item.detail && (
                        <span className="block text-[0.75rem] text-ink-3 truncate">
                          {item.detail}
                        </span>
                      )}
                    </span>
                    {item.badge && (
                      <kbd className="kbd-apple pointer-coarse:hidden relative z-[1] shrink-0 min-w-6 h-6 px-1.5 inline-grid place-items-center rounded-[7px] text-[0.6875rem] font-semibold text-ink-2 tabular-nums">
                        {item.badge}
                      </kbd>
                    )}
                    {selected && !item.badge && (
                      <CornerDownLeft className="relative z-[1] size-3.5 text-accent shrink-0" aria-hidden />
                    )}
                  </button>
                )
              })}
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between pt-2 border-t border-hairline text-[0.75rem] text-ink-3">
          {/* Las teclas solo sirven con teclado físico; en táctil, el truco útil. */}
          <span className="pointer-coarse:hidden">↑↓ mover · Intro abrir · Esc cerrar</span>
          <span className="hidden sm:inline pointer-coarse:inline">
            Tip: «Derivadas #MAT mañana 45m» crea tarea
          </span>
        </div>
      </div>
    </Modal>
  )
}
