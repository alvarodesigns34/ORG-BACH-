/**
 * Entrega del .ics al sistema.
 *
 * En iPhone y iPad, descargar un archivo `text/calendar` abre la hoja de
 * Calendario («Añadir todo»). En escritorio se guarda el archivo y se abre con
 * el calendario que haya. No se usa la hoja de compartir: en iOS manda el
 * archivo a Archivos y no a Calendario.
 */

import { today as todayISO } from '../domain/dates.ts'
import { buildIcs } from '../domain/ics.ts'
import type { AppData } from '../domain/types.ts'

export function exportCalendar(data: AppData): void {
  const text = buildIcs({
    tasks: data.tasks,
    exams: data.exams,
    subjects: data.subjects,
    today: todayISO(),
  })
  const file = new File([text], `orbita-calendario-${todayISO()}.ics`, { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
