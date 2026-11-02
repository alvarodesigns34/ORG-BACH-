import { Monitor, Moon, Sun } from 'lucide-react'

import { useDispatch, useSettings } from '@/state/StoreProvider'
import type { ThemePreference } from '@/domain/types'
import { cx } from '@/ui/primitives'

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'system', label: 'Automático', Icon: Monitor },
]

/**
 * Tres estados explícitos en lugar de un interruptor de dos.
 * «Automático» debe poder elegirse: es el que sigue al sistema del alumno.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const settings = useSettings()
  const dispatch = useDispatch()

  return (
    <div
      role="radiogroup"
      aria-label="Tema de la aplicación"
      className={cx(
        'inline-flex items-center gap-0.5 p-[3px] rounded-full bg-fill',
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = settings.theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => dispatch({ type: 'settings/update', patch: { theme: value } })}
            className={cx(
              'size-8 grid place-items-center rounded-full transition-[background-color,color,box-shadow] duration-200',
              active ? 'bg-raised text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
            )}
          >
            <Icon className="size-[15px]" strokeWidth={2} />
          </button>
        )
      })}
    </div>
  )
}
