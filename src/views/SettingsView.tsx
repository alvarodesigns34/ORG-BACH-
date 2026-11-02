import { useEffect, useRef, useState } from 'react'
import { Download, RotateCcw, Upload } from 'lucide-react'

import { createEmptyData } from '@/data/defaults'
import { today as todayISO } from '@/domain/dates'
import { TERMS, type AverageMode, type TermId } from '@/domain/types'
import { useDispatch, useSettings, useStore } from '@/state/StoreProvider'
import * as storage from '@/storage/persistence'
import { Page, PageHeader } from '@/layout/AppShell'
import { ThemeToggle } from '@/layout/ThemeToggle'
import { AccountCard } from '@/features/account/Account'
import { DigestCard } from '@/features/notifications/DigestCard'
import { useSync } from '@/sync/useSync'
import { Field, Input, NumberField, Select, Switch } from '@/ui/fields'
import { ConfirmDialog } from '@/ui/Modal'
import { Button, Card, SectionHeader, cx } from '@/ui/primitives'

export function SettingsView({ section }: { section?: string | null }) {
  const settings = useSettings()
  const dispatch = useDispatch()
  const { data, replaceAndSave } = useStore()
  const sync = useSync()
  const synced = !!sync.email

  // `#/ajustes?seccion=cuenta` (desde el indicador de sincronización) lleva
  // directamente a la tarjeta de la cuenta.
  useEffect(() => {
    if (!section) return
    const id = requestAnimationFrame(() =>
      document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
    return () => cancelAnimationFrame(id)
  }, [section])

  const fileInput = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'danger'; text: string } | null>(
    null,
  )
  const [confirmReset, setConfirmReset] = useState(false)
  /** Copia ya leída y validada, a la espera de que el alumno confirme. */
  const [pendingImport, setPendingImport] = useState<
    Extract<ReturnType<typeof storage.importJSON>, { ok: true }> | null
  >(null)

  const update = (patch: Parameters<typeof dispatch>[0] extends never ? never : Partial<typeof settings>) =>
    dispatch({ type: 'settings/update', patch })

  // --- Exportar ---
  const exportData = () => {
    const blob = new Blob([storage.exportJSON(data)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    // Día local, no el `slice` del ISO en UTC: entre medianoche y las dos de
    // la madrugada el archivo salía fechado el día anterior.
    link.download = `bachillerato-os-${todayISO()}.json`
    link.click()
    // Liberar el objeto en cuanto el navegador ha tomado la descarga.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice({ tone: 'ok', text: 'Copia descargada correctamente.' })
  }

  // --- Importar ---
  // Se lee y se valida el archivo, pero NO se aplica todavía: importar borra
  // el curso entero, igual que «Empezar de cero», y era la única acción
  // destructiva que no pedía confirmación. Con el archivo ya leído se puede
  // además decir cuántas asignaturas y notas van a entrar, que es lo que
  // permite darse cuenta de que uno se ha equivocado de copia.
  const importFile = async (file: File) => {
    const text = await file.text()
    const result = storage.importJSON(text)
    if (!result.ok) {
      setNotice({ tone: 'danger', text: result.error })
      return
    }
    setPendingImport(result)
  }

  const applyImport = () => {
    if (!pendingImport) return
    storage.clearTimer()
    replaceAndSave(pendingImport.data)
    setNotice(
      pendingImport.warning
        ? { tone: 'warn', text: `Datos importados. ${pendingImport.warning}` }
        : { tone: 'ok', text: 'Datos importados. Se ha sustituido todo el contenido anterior.' },
    )
    setPendingImport(null)
  }

  const counts = [
    { label: 'Asignaturas', value: data.subjects.length },
    { label: 'Tareas', value: data.tasks.length },
    { label: 'Exámenes', value: data.exams.length },
    { label: 'Notas', value: data.grades.length },
  ]

  return (
    <Page className="max-w-[760px]">
      <PageHeader title="Ajustes" />

      <div className="flex flex-col gap-5">
        <AccountCard />
        <DigestCard />

        {/* --- Perfil --- */}
        <Card>
          <SectionHeader title="Tu perfil" className="mb-5" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nombre">
              {({ id }) => (
                <Input
                  id={id}
                  value={settings.userName}
                  onChange={(e) => update({ userName: e.target.value })}
                />
              )}
            </Field>
            <Field label="Curso">
              {({ id }) => (
                <Input
                  id={id}
                  value={settings.course}
                  onChange={(e) => update({ course: e.target.value })}
                />
              )}
            </Field>
            <Field label="Curso académico">
              {({ id }) => (
                <Input
                  id={id}
                  value={settings.academicYear}
                  placeholder="2026/2027"
                  onChange={(e) => update({ academicYear: e.target.value })}
                />
              )}
            </Field>
            <Field label="Evaluación actual" hint="Determina qué notas se muestran por defecto.">
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={settings.activeTerm}
                  onChange={(e) => update({ activeTerm: e.target.value as TermId })}
                >
                  {TERMS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </Card>

        {/* --- Apariencia --- */}
        <Card>
          <SectionHeader title="Apariencia" className="mb-5" />
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[0.875rem] font-medium text-ink">Tema</p>
              <p className="text-[0.8125rem] text-ink-3 mt-0.5">
                «Automático» sigue la configuración de tu dispositivo.
              </p>
            </div>
            <ThemeToggle />
          </div>

          <div className="mt-5 pt-5 border-t border-hairline">
            <Field label="La semana empieza en">
              {({ id }) => (
                <Select
                  id={id}
                  className="max-w-[14rem]"
                  value={String(settings.weekStartsOn)}
                  onChange={(e) => update({ weekStartsOn: Number(e.target.value) as 0 | 1 })}
                >
                  <option value="1">Lunes</option>
                  <option value="0">Domingo</option>
                </Select>
              )}
            </Field>
          </div>
        </Card>

        {/* --- Notas --- */}
        <Card>
          <SectionHeader
            title="Sistema de calificación"
            hint="Afecta a todos los cálculos de medias."
            className="mb-5"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Nota máxima">
              {({ id }) => (
                <NumberField
                  id={id}
                  min={1}
                  max={100}
                  value={settings.gradeScale.max}
                  fallback={10}
                  onCommit={(max) =>
                    update({
                      gradeScale: {
                        ...settings.gradeScale,
                        max,
                        // El aprobado nunca puede quedar por encima del máximo.
                        pass: Math.min(settings.gradeScale.pass, max),
                      },
                    })
                  }
                />
              )}
            </Field>
            <Field label="Aprobado a partir de">
              {({ id }) => (
                <NumberField
                  id={id}
                  min={0}
                  max={settings.gradeScale.max}
                  value={settings.gradeScale.pass}
                  fallback={5}
                  onCommit={(pass) =>
                    update({ gradeScale: { ...settings.gradeScale, pass } })
                  }
                />
              )}
            </Field>
            <Field label="Decimales">
              {({ id }) => (
                <Select
                  id={id}
                  value={String(settings.gradeScale.decimals)}
                  onChange={(e) =>
                    update({
                      gradeScale: { ...settings.gradeScale, decimals: Number(e.target.value) },
                    })
                  }
                >
                  <option value="0">Sin decimales</option>
                  <option value="1">1 decimal</option>
                  <option value="2">2 decimales</option>
                </Select>
              )}
            </Field>
          </div>

          <div className="mt-4">
            <Field
              label="Cómo se calcula la media global"
              hint={
                settings.averageMode === 'aritmetica'
                  ? 'Todas las asignaturas valen lo mismo.'
                  : 'Cada asignatura pesa según sus horas semanales.'
              }
            >
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  className="max-w-[20rem]"
                  value={settings.averageMode}
                  onChange={(e) => update({ averageMode: e.target.value as AverageMode })}
                >
                  <option value="aritmetica">Media aritmética de asignaturas</option>
                  <option value="ponderada">Media ponderada por horas</option>
                </Select>
              )}
            </Field>
          </div>
        </Card>

        {/* --- Alertas --- */}
        <Card>
          <SectionHeader title="Avisos" className="mb-5" />
          <div className="flex flex-col gap-5">
            <Switch
              checked={settings.alertsEnabled}
              onChange={(alertsEnabled) => update({ alertsEnabled })}
              label="Mostrar avisos en el inicio"
              description="Tareas atrasadas, exámenes cercanos y asignaturas por debajo de su objetivo."
            />
            {settings.alertsEnabled && (
              <Field label="Avisar de un examen con esta antelación">
                {({ id }) => (
                  <NumberField
                    id={id}
                    min={1}
                    max={30}
                    integer
                    suffix="días"
                    className="max-w-[12rem]"
                    value={settings.examAlertDays}
                    fallback={7}
                    onCommit={(examAlertDays) => update({ examAlertDays })}
                  />
                )}
              </Field>
            )}
          </div>
        </Card>

        {/* --- Estudio --- */}
        <Card>
          <SectionHeader
            title="Temporizador de estudio"
            hint="Duraciones del pomodoro."
            className="mb-5"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Tramo de trabajo">
              {({ id }) => (
                <NumberField
                  id={id}
                  min={5}
                  max={120}
                  integer
                  suffix="min"
                  value={settings.pomodoroMinutes}
                  fallback={25}
                  onCommit={(pomodoroMinutes) => update({ pomodoroMinutes })}
                />
              )}
            </Field>
            <Field label="Descanso">
              {({ id }) => (
                <NumberField
                  id={id}
                  min={1}
                  max={60}
                  integer
                  suffix="min"
                  value={settings.pomodoroBreakMinutes}
                  fallback={5}
                  onCommit={(pomodoroBreakMinutes) => update({ pomodoroBreakMinutes })}
                />
              )}
            </Field>
          </div>
          <div className="mt-5 pt-5 border-t border-hairline">
            <Switch
              checked={settings.pomodoroSound}
              onChange={(pomodoroSound) => update({ pomodoroSound })}
              label="Aviso sonoro al terminar un tramo"
              description="Dos tonos cortos, para enterarte con la pestaña de fondo."
            />
          </div>
        </Card>

        {/* --- Datos --- */}
        <Card>
          <SectionHeader
            title="Tus datos"
            hint={
              synced
                ? 'Se guardan en este dispositivo y en tu cuenta.'
                : 'Se guardan solo en este dispositivo. Inicia sesión arriba para tener una copia en la nube.'
            }
            className="mb-5"
          />

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            {counts.map((item) => (
              <div key={item.label}>
                <dt className="eyebrow">{item.label}</dt>
                <dd className="text-[1.125rem] font-semibold text-ink mt-1 tabular-nums">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          {notice && (
            <p
              role="status"
              className={cx(
                'text-[0.8125rem] rounded-sm px-3 py-2 mb-4',
                notice.tone === 'ok' && 'bg-ok-quiet text-ok',
                notice.tone === 'warn' && 'bg-warn-quiet text-warn',
                notice.tone === 'danger' && 'bg-danger-quiet text-danger',
              )}
            >
              {notice.text}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={exportData}>
              <Download className="size-4" />
              Exportar copia
            </Button>

            <Button onClick={() => fileInput.current?.click()} aria-label="Importar copia JSON">
              <Upload className="size-4" />
              Importar copia
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void importFile(file)
                e.target.value = ''
              }}
            />

            <Button variant="danger" onClick={() => setConfirmReset(true)} className="ml-auto">
              <RotateCcw className="size-4" />
              Empezar de cero
            </Button>
          </div>

          <p className="text-[0.75rem] text-ink-3 mt-4 leading-relaxed">
            La copia es un archivo JSON legible. Guárdala de vez en cuando: es lo que te permite
            cambiar de navegador o de ordenador sin perder el curso.
          </p>
        </Card>
      </div>

      <ConfirmDialog
        open={!!pendingImport}
        onCancel={() => setPendingImport(null)}
        onConfirm={applyImport}
        title="Importar esta copia"
        message={
          pendingImport
            ? `Se sustituirá TODO lo que tienes ahora por el contenido de la copia: ` +
              `${pendingImport.data.subjects.length} asignaturas, ` +
              `${pendingImport.data.grades.length} notas, ` +
              `${pendingImport.data.tasks.length} tareas y ` +
              `${pendingImport.data.exams.length} exámenes.` +
              (pendingImport.warning ? ` ${pendingImport.warning}` : '') +
              ' Esta acción no se puede deshacer.'
            : ''
        }
        confirmLabel="Importar y sustituir"
        destructive
      />

      <ConfirmDialog
        open={confirmReset}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          storage.resetAll()
          replaceAndSave(createEmptyData())
          setConfirmReset(false)
        }}
        title="Borrar todos los datos"
        message={
          synced
            ? 'Se eliminarán asignaturas, tareas, exámenes, notas y sesiones de estudio en este dispositivo y en tu cuenta, así que desaparecerán también de tus otros dispositivos. Si quieres conservarlos, exporta antes una copia. Esta acción no se puede deshacer.'
            : 'Se eliminarán asignaturas, tareas, exámenes, notas y sesiones de estudio, y volverás a la pantalla de bienvenida. Si quieres conservarlos, exporta antes una copia. Esta acción no se puede deshacer.'
        }
        confirmLabel="Borrar todo"
        destructive
      />
    </Page>
  )
}
