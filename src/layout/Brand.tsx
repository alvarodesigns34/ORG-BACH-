/**
 * Marca de la aplicación: Órbita.
 *
 * Un planeta de cristal con su órbita sobre un fondo claro: la órbita pasa
 * por detrás del planeta arriba y por delante abajo, para que tenga volumen,
 * y acaba en un punto (tú, o el avión del modo estudio). Es el mismo dibujo
 * que el icono de la pantalla de inicio (public/icono.svg).
 */
const MARK = `<defs><linearGradient id="om-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f9fd"/><stop offset="1" stop-color="#dfe7f3"/></linearGradient><radialGradient id="om-bp" cx=".35" cy=".28" r=".85"><stop offset="0" stop-color="#8ec5ff"/><stop offset=".55" stop-color="#2f74f6"/><stop offset="1" stop-color="#1638a8"/></radialGradient><radialGradient id="om-bh" cx=".32" cy=".22" r=".35"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><filter id="om-bs" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="28" stdDeviation="34" flood-color="#1b3a8a" flood-opacity=".28"/></filter></defs><rect width="1024" height="1024" fill="url(#om-b)"/><path d="M190 610 A340 120 -22 0 1 834 414" fill="none" stroke="#1d3f9e" stroke-opacity=".35" stroke-width="22" stroke-linecap="round"/><circle cx="512" cy="512" r="250" fill="url(#om-bp)" filter="url(#om-bs)"/><circle cx="512" cy="512" r="250" fill="url(#om-bh)"/><circle cx="512" cy="512" r="249" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5"/><path d="M834 414 A340 120 -22 0 1 190 610" fill="none" stroke="#fff" stroke-width="26" stroke-linecap="round"/><circle cx="834" cy="414" r="30" fill="#fff"/>`

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      aria-hidden
      className="shrink-0 rounded-[22%] shadow-[0_0_0_0.5px_rgb(0_0_0/0.08),0_1px_2px_rgb(0_0_0/0.12),0_4px_10px_rgb(30_60_160/0.16)]"
      dangerouslySetInnerHTML={{ __html: MARK }}
    />
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
