import { useId } from 'react'

/**
 * Marca de la aplicación: Órbita.
 *
 * Un planeta con su órbita y un pequeño satélite: todo lo de tus estudios
 * girando a tu alrededor. La órbita pasa por delante del planeta en su mitad
 * inferior (más opaca) y por detrás en la superior, para que tenga volumen.
 */
export function BrandMark({ size = 30 }: { size?: number }) {
  // Ids únicos: la marca aparece a la vez en la barra lateral y en otros sitios.
  const uid = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" fill="none" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`bf${uid}`} x1="0" y1="0" x2="0" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3b8dff" />
          <stop offset="1" stopColor="#0052c4" />
        </linearGradient>
        <radialGradient id={`bp${uid}`} cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#d7e6ff" />
        </radialGradient>
      </defs>
      <rect width="30" height="30" rx="8.5" fill={`url(#bf${uid})`} />
      <ellipse
        cx="15"
        cy="15"
        rx="10.6"
        ry="4.1"
        transform="rotate(-24 15 15)"
        stroke="#fff"
        strokeOpacity="0.42"
        strokeWidth="1.35"
      />
      <circle cx="15" cy="15" r="5.4" fill={`url(#bp${uid})`} />
      <path
        d="M5.32 19.31 A10.6 4.1 -24 0 0 24.68 10.69"
        stroke="#fff"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <circle cx="22.2" cy="15.4" r="1.55" fill="#fff" />
    </svg>
  )
}

export const APP_NAME = 'Órbita'

export function BrandWordmark() {
  return (
    <span className="display text-[0.9375rem] leading-none tracking-[-0.01em] text-ink">
      {APP_NAME}
    </span>
  )
}
