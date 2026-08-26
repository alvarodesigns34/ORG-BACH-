/**
 * Marca de la aplicación.
 *
 * El cuadrado reproduce el margen de un cuaderno: la línea vertical a un
 * tercio y dos renglones. Es una referencia concreta al objeto que sustituye,
 * no un icono genérico de app.
 */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 30"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <rect width="30" height="30" rx="8" fill="var(--c-accent)" />
      <path
        d="M10.5 7v16"
        stroke="var(--c-accent-ink)"
        strokeOpacity="0.45"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M13.5 12.5h8M13.5 17.5h5.5"
        stroke="var(--c-accent-ink)"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function BrandWordmark() {
  return (
    <span className="display text-[0.9375rem] leading-none tracking-[-0.01em] text-ink">
      Bachillerato&nbsp;<span className="text-ink-3">OS</span>
    </span>
  )
}
