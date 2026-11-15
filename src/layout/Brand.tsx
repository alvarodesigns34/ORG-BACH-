import { useId } from 'react'

/**
 * Marca de la aplicación: Órbita.
 *
 * Un planeta con su órbita y un avión que la recorre: todo lo de tus
 * estudios girando a tu alrededor, y el modo estudio en forma de vuelo. La órbita pasa por delante del planeta en su mitad
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
      {/* El avión que da la vuelta: el modo estudio dentro de la marca. */}
      <g transform="translate(23.49 14.1) rotate(41) scale(0.118) translate(-32 -32)">
        <path d="M32 3c2.2 0 3.6 2.6 3.6 6.4V24l20.4 12.2c.8.5 1.3 1.3 1.3 2.2v3.1L35.6 34.8V49l6.2 4.6c.4.3.7.8.7 1.3V58l-10.5-3-10.5 3v-3.1c0-.5.3-1 .7-1.3l6.2-4.6V34.8L6.7 41.5v-3.1c0-.9.5-1.7 1.3-2.2L28.4 24V9.4C28.4 5.6 29.8 3 32 3z" fill="#fff" stroke="#1a5fd0" strokeWidth="5" paintOrder="stroke" />
      </g>
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
