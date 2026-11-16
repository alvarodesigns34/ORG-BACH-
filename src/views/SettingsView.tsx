import { useEffect, useRef, useState } from 'react'
import {
  Award,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Check,
  Database,
  Download,
  GraduationCap,
  Hash,
  History,
  Layers,
  Sigma,
  SunMoon,
  TriangleAlert,
  Upload,
  UserRound,
} from 'lucide-react'

import { courseLine } from '@/data/defaults'
import { APP_NAME } from '@/layout/Brand'
import { createEmptyData } from '@/data/defaults'
import { TERMS, type AverageMode, type TermId } from '@/domain/types'
import { useDispatch, useSettings, useStore } from '@/state/StoreProvider'
import * as storage from '@/storage/persistence'
import { Page, PageHeader } from '@/layout/AppShell'
import { AccountAvatar } from '@/layout/chrome'
import { ThemeToggle } from '@/layout/ThemeToggle'
import { AccountSection } from '@/features/account/Account'
import { DigestSection } from '@/features/notifications/DigestCard'
import { useSync } from '@/sync/useSync'
import { SnapshotsSheet } from '@/features/backup/Backups'
import { exportBackup } from '@/storage/backup'
import { saveSnapshot } from '@/storage/snapshots'
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
  // En iPad abre la hoja de compartir («Guardar en Archivos»); en el resto,
  // descarga el archivo (ver `exportBackup`).
  const exportData = async () => {
    if (await exportBackup(data)) setNotice({ tone: 'ok', text: 'Copia guardada correctamente.' })
  }
  const [snapshotsOpen, setSnapshotsOpen] = useState(false)

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

  const applyImport = async () => {
    if (!pendingImport) return
    // Lo de ahora se guarda como copia automática: importar se puede deshacer.
    await saveSnapshot(data, 'antes-importar')
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
              {sync.email ?? courseLine(settings)}
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
            placeholder="2.º de ESO, 1.º de Bachillerato…"
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
          <ListRow icon={Download} tint="#0a84ff" label="Exportar copia" onClick={() => void exportData()} />
          <ListRow
            icon={History}
            tint="#30b158"
            label="Copias automáticas"
            detail="Una al día, y antes de importar o borrar"
            onClick={() => setSnapshotsOpen(true)}
          />
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
          {APP_NAME} · {courseLine(settings)}
        </p>
      </div>

      <SnapshotsSheet open={snapshotsOpen} onClose={() => setSnapshotsOpen(false)} />

      <ConfirmDialog
        open={!!pendingImport}
        onCancel={() => setPendingImport(null)}
        onConfirm={() => void applyImport()}
        title="Importar esta copia"
        message={
          pendingImport
            ? `Se sustituirá TODO lo que tienes ahora por el contenido de la copia: ` +
              `${pendingImport.data.subjects.length} asignaturas, ` +
              `${pendingImport.data.grades.length} notas, ` +
              `${pendingImport.data.tasks.length} tareas y ` +
              `${pendingImport.data.exams.length} exámenes.` +
              (pendingImport.warning ? ` ${pendingImport.warning}` : '') +
              ' Lo que tienes ahora queda guardado en «Copias automáticas».'
            : ''
        }
        confirmLabel="Importar y sustituir"
        destructive
      />

      <ConfirmDialog
        open={confirmReset}
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          setConfirmReset(false)
          // Por si era un error: queda en «Copias automáticas».
          await saveSnapshot(data, 'antes-borrar')
          storage.resetAll()
          replaceAndSave(createEmptyData())
        }}
        title="Borrar todos los datos"
        message={
          synced
            ? 'Se eliminarán asignaturas, tareas, exámenes y notas en este dispositivo y en tu cuenta, así que desaparecerán también de tus otros dispositivos. En este dispositivo quedará una copia en «Copias automáticas» por si te arrepientes.'
            : 'Se eliminarán asignaturas, tareas, exámenes y notas, y volverás a la pantalla de bienvenida. En este dispositivo quedará una copia en «Copias automáticas» por si te arrepientes.'
        }
        confirmLabel="Borrar todo"
        destructive
      />
    </Page>
  )
}
