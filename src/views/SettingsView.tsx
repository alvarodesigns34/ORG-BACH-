import { useEffect, useRef, useState } from 'react'
import {
  Award,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Check,
  Coffee,
  Database,
  Download,
  GraduationCap,
  Hash,
  Layers,
  Sigma,
  SunMoon,
  Timer,
  TriangleAlert,
  Upload,
  UserRound,
  Volume2,
} from 'lucide-react'

import { createEmptyData } from '@/data/defaults'
import { today as todayISO } from '@/domain/dates'
import { TERMS, type AverageMode, type TermId } from '@/domain/types'
import { useDispatch, useSettings, useStore } from '@/state/StoreProvider'
import * as storage from '@/storage/persistence'
import { Page, PageHeader } from '@/layout/AppShell'
import { AccountAvatar } from '@/layout/chrome'
import { ThemeToggle } from '@/layout/ThemeToggle'
import { AccountSection } from '@/features/account/Account'
import { DigestSection } from '@/features/notifications/DigestCard'
import { useSync } from '@/sync/useSync'
import { ListGroup, ListRow, RowInput, RowNumber, RowSelect, RowSwitch } from '@/ui/list'
import { ConfirmDialog } from '@/ui/Modal'
import { cx } from '@/ui/primitives'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

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
  const [pendingImport, setPendingImport] = useState<Extract<
    ReturnType<typeof storage.importJSON>,
    { ok: true }
  > | null>(null)

  const update = (
    patch: Parameters<typeof dispatch>[0] extends never ? never : Partial<typeof settings>,
  ) => dispatch({ type: 'settings/update', patch })

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
    plural(data.subjects.length, 'asignatura', 'asignaturas'),
    plural(data.tasks.length, 'tarea', 'tareas'),
    plural(data.grades.length, 'nota', 'notas'),
  ].join(' · ')

  return (
    <Page className="max-w-[680px]">
      <PageHeader title="Ajustes" />

      <div className="flex flex-col gap-8">
        {/* --- Perfil: como la tarjeta del ID de Apple --- */}
        <div className="card flex items-center gap-4 px-4 py-4">
          <AccountAvatar size={60} decorative />
          <div className="min-w-0">
            <p className="text-[1.25rem] font-semibold tracking-[-0.02em] truncate">
              {settings.userName || 'Sin nombre'}
            </p>
            <p className="text-[0.875rem] text-ink-3 truncate">
              {sync.email ?? `${settings.course} · ${settings.academicYear}`}
            </p>
          </div>
        </div>

        <AccountSection />
        <DigestSection />

        <ListGroup header="Perfil">
          <RowInput
            icon={UserRound}
            tint="#8e8e93"
            label="Nombre"
            value={settings.userName}
            placeholder="Tu nombre"
            onChange={(userName) => update({ userName })}
          />
          <RowInput
            icon={GraduationCap}
            tint="#bf5af2"
            label="Curso"
            value={settings.course}
            onChange={(course) => update({ course })}
          />
          <RowInput
            icon={CalendarRange}
            tint="#ff9f0a"
            label="Curso académico"
            value={settings.academicYear}
            placeholder="2026/2027"
            onChange={(academicYear) => update({ academicYear })}
          />
          <RowSelect
            icon={Layers}
            tint="#0a84ff"
            label="Evaluación actual"
            value={settings.activeTerm}
            onChange={(activeTerm) => update({ activeTerm: activeTerm as TermId })}
            options={TERMS.map((t) => ({ value: t.id, label: t.name }))}
          />
        </ListGroup>

        <ListGroup
          header="Apariencia"
          footer="«Automático» sigue la configuración de tu dispositivo."
        >
          <ListRow icon={SunMoon} tint="#5e5ce6" label="Tema" accessory={<ThemeToggle />} />
          <RowSelect
            icon={CalendarDays}
            tint="#ff453a"
            label="La semana empieza"
            value={String(settings.weekStartsOn)}
            onChange={(v) => update({ weekStartsOn: Number(v) as 0 | 1 })}
            options={[
              { value: '1', label: 'En lunes' },
              { value: '0', label: 'En domingo' },
            ]}
          />
        </ListGroup>

        <ListGroup
          header="Calificación"
          footer={
            settings.averageMode === 'aritmetica'
              ? 'En la media global todas las asignaturas valen lo mismo.'
              : 'En la media global cada asignatura pesa según sus horas semanales.'
          }
        >
          <RowNumber
            icon={Award}
            tint="#30b158"
            label="Nota máxima"
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
          <RowNumber
            icon={Check}
            tint="#30b158"
            label="Aprobado desde"
            min={0}
            max={settings.gradeScale.max}
            value={settings.gradeScale.pass}
            fallback={5}
            onCommit={(pass) => update({ gradeScale: { ...settings.gradeScale, pass } })}
          />
          <RowSelect
            icon={Hash}
            tint="#64d2ff"
            label="Decimales"
            value={String(settings.gradeScale.decimals)}
            onChange={(v) =>
              update({ gradeScale: { ...settings.gradeScale, decimals: Number(v) } })
            }
            options={[
              { value: '0', label: 'Ninguno' },
              { value: '1', label: '1' },
              { value: '2', label: '2' },
            ]}
          />
          <RowSelect
            icon={Sigma}
            tint="#0a84ff"
            label="Media global"
            value={settings.averageMode}
            onChange={(averageMode) => update({ averageMode: averageMode as AverageMode })}
            options={[
              { value: 'aritmetica', label: 'Aritmética' },
              { value: 'ponderada', label: 'Por horas' },
            ]}
          />
        </ListGroup>

        <ListGroup
          header="Avisos en Inicio"
          footer="Asignaturas por debajo de su objetivo y semanas con demasiadas tareas juntas."
        >
          <RowSwitch
            icon={TriangleAlert}
            tint="#ff9f0a"
            label="Mostrar avisos"
            checked={settings.alertsEnabled}
            onChange={(alertsEnabled) => update({ alertsEnabled })}
          />
          {settings.alertsEnabled && (
            <RowNumber
              icon={CalendarClock}
              tint="#ff453a"
              label="Antelación"
              suffix="días antes"
              min={1}
              max={30}
              integer
              value={settings.examAlertDays}
              fallback={7}
              onCommit={(examAlertDays) => update({ examAlertDays })}
            />
          )}
        </ListGroup>

        <ListGroup header="Temporizador de estudio">
          <RowNumber
            icon={Timer}
            tint="#ff6b2c"
            label="Tramo de trabajo"
            suffix="min"
            min={5}
            max={120}
            integer
            value={settings.pomodoroMinutes}
            fallback={25}
            onCommit={(pomodoroMinutes) => update({ pomodoroMinutes })}
          />
          <RowNumber
            icon={Coffee}
            tint="#a2845e"
            label="Descanso"
            suffix="min"
            min={1}
            max={60}
            integer
            value={settings.pomodoroBreakMinutes}
            fallback={5}
            onCommit={(pomodoroBreakMinutes) => update({ pomodoroBreakMinutes })}
          />
          <RowSwitch
            icon={Volume2}
            tint="#ff375f"
            label="Sonido al terminar"
            checked={settings.pomodoroSound}
            onChange={(pomodoroSound) => update({ pomodoroSound })}
          />
        </ListGroup>

        <ListGroup
          header="Tus datos"
          footer={
            notice ? (
              <span
                role="status"
                className={cx(
                  notice.tone === 'ok' && 'text-ok',
                  notice.tone === 'warn' && 'text-warn',
                  notice.tone === 'danger' && 'text-danger',
                )}
              >
                {notice.text}
              </span>
            ) : synced ? (
              'Se guardan en este dispositivo y en tu cuenta. La copia es un archivo JSON legible que puedes guardar donde quieras.'
            ) : (
              'Se guardan solo en este dispositivo. Exporta una copia de vez en cuando, o inicia sesión para tenerla en la nube.'
            )
          }
        >
          <ListRow icon={Database} tint="#8e8e93" label="Contenido" value={counts} />
          <ListRow icon={Download} tint="#0a84ff" label="Exportar copia" onClick={exportData} />
          <ListRow
            icon={Upload}
            tint="#0a84ff"
            label="Importar copia"
            onClick={() => fileInput.current?.click()}
          />
          <ListRow label="Empezar de cero" action="danger" onClick={() => setConfirmReset(true)} />
        </ListGroup>
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

        <p className="text-center text-[0.75rem] text-ink-3 pb-2">
          Bachillerato OS · {settings.course} · {settings.academicYear}
        </p>
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
