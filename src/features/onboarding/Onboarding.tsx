import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Plus } from 'lucide-react'

import { SUBJECT_CATALOG, defaultCategories, type CatalogSubject } from '@/data/defaults'
import { nextColor } from '@/domain/palette'
import type { SubjectColor } from '@/domain/types'
import { useDispatch, useSettings } from '@/state/StoreProvider'
import { BrandMark } from '@/layout/Brand'
import { Field, Input } from '@/ui/fields'
import { Button, cx } from '@/ui/primitives'

type Step = 'perfil' | 'asignaturas'

/**
 * Alta inicial.
 *
 * Dos pasos y nada más: nombre y asignaturas. Todo lo demás —pesos, objetivos,
 * horarios— se configura después, cuando el alumno tenga motivo para hacerlo.
 * Un formulario largo aquí garantiza que nadie llegue al segundo día.
 */
export function Onboarding() {
  const settings = useSettings()
  const dispatch = useDispatch()

  const [step, setStep] = useState<Step>('perfil')
  const [name, setName] = useState(settings.userName)
  const [course, setCourse] = useState(settings.course)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [custom, setCustom] = useState<string[]>([])
  const [customDraft, setCustomDraft] = useState('')

  const catalogByName = useMemo(() => {
    const map = new Map<string, CatalogSubject>()
    for (const group of SUBJECT_CATALOG) {
      for (const subject of group.subjects) map.set(subject.name, subject)
    }
    return map
  }, [])

  const toggle = (name: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  const goToSubjects = () => {
    if (!name.trim()) {
      setError('Escribe tu nombre para personalizar la aplicación.')
      return
    }
    setError(null)
    setStep('asignaturas')
  }

  const finish = () => {
    const chosen = [...picked, ...custom]
    if (chosen.length > 0) {
      const used: SubjectColor[] = []
      dispatch({
        type: 'subject/addMany',
        subjects: chosen.map((subjectName) => {
          const preset = catalogByName.get(subjectName)
          const color = preset?.color ?? nextColor(used)
          used.push(color)
          return {
            name: subjectName,
            color,
            weight: preset?.weight ?? 4,
            schedule: [],
            categories: defaultCategories(),
          }
        }),
      })
    }

    dispatch({
      type: 'settings/update',
      patch: { userName: name.trim(), course: course.trim() || '1.º de Bachillerato', onboarded: true },
    })
  }

  const total = picked.size + custom.length

  return (
    <div className="min-h-dvh grid lg:grid-cols-[5fr_7fr]">
      {/* --- Columna de presentación --- */}
      <div className="hidden lg:flex flex-col justify-between p-12 xl:p-16 bg-surface border-r border-hairline">
        <BrandMark size={34} />

        <div className="max-w-[30ch]">
          <p className="eyebrow mb-5">Curso {settings.academicYear}</p>
          <h1 className="display text-[3rem] xl:text-[3.5rem] leading-[1.02] tracking-[-0.03em]">
            Todo el curso,
            <br />
            en un sitio.
          </h1>
          <p className="text-[0.9375rem] text-ink-2 mt-6 leading-relaxed">
            Tareas, exámenes, notas y horas de estudio. Sin cuentas, sin nube: los datos se
            guardan en este navegador y son solo tuyos.
          </p>
        </div>

        <p className="text-[0.75rem] text-ink-3">
          Podrás cambiar cualquiera de estas opciones más adelante en Ajustes.
        </p>
      </div>

      {/* --- Columna de formulario --- */}
      <div className="flex flex-col justify-center px-6 sm:px-10 lg:px-16 py-12">
        <div className="w-full max-w-[540px] mx-auto lg:mx-0">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <BrandMark size={30} />
            <span className="display text-[0.9375rem]">
              Bachillerato&nbsp;<span className="text-ink-3">OS</span>
            </span>
          </div>

          <StepDots step={step} />

          {step === 'perfil' ? (
            <div className="animate-rise">
              <h2 className="display text-[1.75rem] leading-tight tracking-[-0.025em] mt-6">
                Empecemos por lo básico
              </h2>
              <p className="text-[0.875rem] text-ink-3 mt-2">
                Solo se usa para saludarte y para etiquetar tus datos.
              </p>

              <div className="flex flex-col gap-4 mt-8">
                <Field label="¿Cómo te llamas?" required error={error}>
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      value={name}
                      autoFocus
                      placeholder="Tu nombre"
                      onChange={(e) => {
                        setName(e.target.value)
                        if (error) setError(null)
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && goToSubjects()}
                    />
                  )}
                </Field>

                <Field label="Curso">
                  {({ id }) => (
                    <Input id={id} value={course} onChange={(e) => setCourse(e.target.value)} />
                  )}
                </Field>
              </div>

              <Button variant="primary" size="lg" onClick={goToSubjects} className="mt-8 w-full sm:w-auto">
                Continuar
                <ArrowRight className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="animate-rise">
              <h2 className="display text-[1.75rem] leading-tight tracking-[-0.025em] mt-6">
                ¿Qué asignaturas tienes?
              </h2>
              <p className="text-[0.875rem] text-ink-3 mt-2">
                Marca las tuyas. Puedes saltarte este paso y añadirlas después.
              </p>

              <div className="flex flex-col gap-6 mt-7 max-h-[46vh] overflow-y-auto pr-1 -mr-1">
                {SUBJECT_CATALOG.map((group) => (
                  <div key={group.id}>
                    <p className="eyebrow mb-1">{group.label}</p>
                    <p className="text-[0.75rem] text-ink-3 mb-2.5">{group.hint}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.subjects.map((subject) => {
                        const active = picked.has(subject.name)
                        return (
                          <button
                            key={subject.name}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggle(subject.name)}
                            className={cx(
                              'inline-flex items-center gap-1.5 h-9 px-3 rounded-sm border',
                              'text-[0.8125rem] transition-colors duration-150',
                              active
                                ? 'bg-accent-quiet border-accent/40 text-accent font-semibold'
                                : 'bg-surface border-hairline-strong text-ink-2 hover:border-ink-3/50 hover:text-ink',
                            )}
                          >
                            {active && <Check className="size-3.5" strokeWidth={3} />}
                            {subject.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {custom.length > 0 && (
                  <div>
                    <p className="eyebrow mb-2.5">Añadidas por ti</p>
                    <div className="flex flex-wrap gap-2">
                      {custom.map((name) => (
                        <button
                          key={name}
                          type="button"
                          aria-pressed
                          onClick={() => setCustom((prev) => prev.filter((n) => n !== name))}
                          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-sm border bg-accent-quiet border-accent/40 text-accent font-semibold text-[0.8125rem]"
                        >
                          <Check className="size-3.5" strokeWidth={3} />
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-5">
                <Input
                  value={customDraft}
                  placeholder="Otra asignatura (Religión, Segunda lengua…)"
                  aria-label="Añadir otra asignatura"
                  onChange={(e) => setCustomDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    const value = customDraft.trim()
                    if (value && !custom.includes(value)) setCustom((prev) => [...prev, value])
                    setCustomDraft('')
                  }}
                />
                <Button
                  aria-label="Añadir asignatura"
                  disabled={!customDraft.trim()}
                  onClick={() => {
                    const value = customDraft.trim()
                    if (value && !custom.includes(value)) setCustom((prev) => [...prev, value])
                    setCustomDraft('')
                  }}
                >
                  <Plus className="size-4" />
                </Button>
              </div>

              <div className="flex items-center gap-3 mt-8">
                <Button variant="ghost" onClick={() => setStep('perfil')}>
                  <ArrowLeft className="size-4" />
                  Atrás
                </Button>
                <Button variant="primary" size="lg" onClick={finish} className="ml-auto">
                  {total > 0 ? `Empezar con ${total} asignatura${total === 1 ? '' : 's'}` : 'Empezar sin asignaturas'}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StepDots({ step }: { step: Step }) {
  const steps: Step[] = ['perfil', 'asignaturas']
  const index = steps.indexOf(step)
  return (
    <div className="flex items-center gap-2" role="group" aria-label={`Paso ${index + 1} de 2`}>
      {steps.map((s, i) => (
        <span
          key={s}
          aria-hidden
          className={cx(
            'h-1 rounded-full transition-all duration-300 ease-out',
            i <= index ? 'bg-accent' : 'bg-hairline-strong',
            i === index ? 'w-8' : 'w-4',
          )}
        />
      ))}
      <span className="text-[0.75rem] text-ink-3 ml-1.5 tabular-nums">Paso {index + 1} de 2</span>
    </div>
  )
}
