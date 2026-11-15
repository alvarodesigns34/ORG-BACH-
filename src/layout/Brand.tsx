/**
 * Marca de la aplicación: Órbita.
 *
 * Un planeta con su órbita y un avión que la recorre dejando estela, sobre
 * un cielo nocturno: todo lo de tus estudios girando a tu alrededor, y el
 * modo estudio en forma de vuelo. La órbita pasa por delante del planeta en su mitad
 * inferior (más opaca) y por detrás en la superior, para que tenga volumen.
 */
/** El dibujo del icono (el mismo que el de la pantalla de inicio). */
const MARK = `<defs><radialGradient id="om-bg" cx="0.22" cy="0.1" r="1.1"><stop offset="0" stop-color="#7cc0ff"/><stop offset="0.45" stop-color="#2f6bff"/><stop offset="1" stop-color="#1a1d8a"/></radialGradient><radialGradient id="om-pl" cx="0.33" cy="0.28" r="0.9"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#e2edff"/><stop offset="1" stop-color="#a9c6ff"/></radialGradient><radialGradient id="om-shade" cx="0.75" cy="0.8" r="0.7"><stop offset="0" stop-color="#3a5fd9" stop-opacity="0.35"/><stop offset="1" stop-color="#3a5fd9" stop-opacity="0"/></radialGradient><radialGradient id="om-glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0.6" stop-color="#bcd6ff" stop-opacity="0.45"/><stop offset="1" stop-color="#bcd6ff" stop-opacity="0"/></radialGradient><linearGradient id="om-tr" gradientUnits="userSpaceOnUse" x1="24.36" y1="13.26" x2="12.08" y2="20.49"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect width="30" height="30" rx="6.6" fill="url(#om-bg)"/><circle cx="13.76" cy="16.55" r="0.31" fill="#fff" opacity="0.56"/><circle cx="15.20" cy="17.27" r="0.17" fill="#fff" opacity="0.58"/><circle cx="18.38" cy="22.62" r="0.15" fill="#fff" opacity="0.47"/><circle cx="4.36" cy="23.05" r="0.26" fill="#fff" opacity="0.32"/><circle cx="27.54" cy="27.08" r="0.25" fill="#fff" opacity="0.64"/><circle cx="6.09" cy="2.39" r="0.23" fill="#fff" opacity="0.33"/><circle cx="6.95" cy="8.29" r="0.14" fill="#fff" opacity="0.56"/><circle cx="13.45" cy="23.90" r="0.23" fill="#fff" opacity="0.65"/><circle cx="14.99" cy="19.22" r="0.22" fill="#fff" opacity="0.45"/><circle cx="27.94" cy="27.89" r="0.29" fill="#fff" opacity="0.69"/><circle cx="10.20" cy="7.97" r="0.18" fill="#fff" opacity="0.34"/><circle cx="21.92" cy="12.41" r="0.29" fill="#fff" opacity="0.51"/><circle cx="26.91" cy="24.03" r="0.13" fill="#fff" opacity="0.42"/><circle cx="25.67" cy="14.22" r="0.32" fill="#fff" opacity="0.52"/><ellipse cx="15" cy="15" rx="10.8" ry="4.3" transform="rotate(-24 15 15)" fill="none" stroke="#fff" stroke-opacity=".26" stroke-width="1.05"/><circle cx="15" cy="15" r="8" fill="url(#om-glow)"/><circle cx="15" cy="15" r="5.7" fill="url(#om-pl)"/><circle cx="15" cy="15" r="5.7" fill="url(#om-shade)"/><path d="M24.87 10.61 L24.97 10.93 L25.02 11.28 L25.00 11.65 L24.92 12.04 L24.78 12.44 L24.58 12.87 L24.33 13.31 L24.01 13.76 L23.64 14.21 L23.21 14.67 L22.74 15.13 L22.21 15.60 L21.65 16.05 L21.04 16.51 L20.39 16.95 L19.71 17.38 L19.00 17.79 L18.27 18.19 L17.52 18.57 L16.75 18.93 L15.97 19.26 L15.18 19.57 L14.40 19.85 L13.61 20.09 L12.84 20.31 L12.08 20.49 L11.34 20.64 L10.62 20.76 L9.92 20.84 L9.26 20.88 L8.63 20.89 L8.05 20.86 L7.50 20.80 L7.00 20.70 L6.55 20.56 L6.16 20.39 L5.81 20.19 L5.53 19.95 L5.30 19.69 L5.13 19.39" fill="none" stroke="#fff" stroke-opacity=".92" stroke-width="1.2" stroke-linecap="round"/><path d="M24.36 13.26 L24.22 13.47 L24.06 13.68 L23.90 13.90 L23.72 14.12 L23.53 14.34 L23.32 14.56 L23.11 14.78 L22.88 15.00 L22.64 15.22 L22.39 15.44 L22.13 15.66 L21.87 15.88 L21.59 16.10 L21.30 16.32 L21.00 16.53 L20.70 16.74 L20.38 16.95 L20.06 17.16 L19.74 17.36 L19.40 17.57 L19.06 17.76 L18.71 17.96 L18.36 18.15 L18.01 18.33 L17.64 18.51 L17.28 18.68 L16.91 18.85 L16.54 19.02 L16.17 19.18 L15.80 19.33 L15.42 19.48 L15.04 19.62 L14.67 19.75 L14.29 19.88 L13.92 20.00 L13.55 20.11 L13.17 20.22 L12.81 20.32 L12.44 20.41 L12.08 20.49" fill="none" stroke="url(#om-tr)" stroke-width="1.7" stroke-linecap="round"/><g transform="translate(24.80 12.40) rotate(21.0) scale(0.13) translate(-32 -32)"><path d="M32 3c2.2 0 3.6 2.6 3.6 6.4V24l20.4 12.2c.8.5 1.3 1.3 1.3 2.2v3.1L35.6 34.8V49l6.2 4.6c.4.3.7.8.7 1.3V58l-10.5-3-10.5 3v-3.1c0-.5.3-1 .7-1.3l6.2-4.6V34.8L6.7 41.5v-3.1c0-.9.5-1.7 1.3-2.2L28.4 24V9.4C28.4 5.6 29.8 3 32 3z" fill="#fff" stroke="#2350d8" stroke-width="3.5" paint-order="stroke"/></g>`

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 30"
      aria-hidden
      className="shrink-0 rounded-[22%] shadow-[0_1px_2px_rgb(0_0_0/0.15),0_4px_10px_rgb(30_40_160/0.18)]"
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
