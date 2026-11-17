import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

const base = process.env.GITHUB_PAGES === 'true' ? '/ORG-BACH-/' : '/'

export default defineConfig({
  // GitHub Pages sirve un repositorio de proyecto bajo /<repo>/, no en la raíz
  // del dominio. La variable la fija solo el workflow de despliegue: en local
  // (`npm run dev` / `npm run build`) el base sigue siendo '/'.
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Genera el Service Worker con Workbox en vez de escribirlo a mano: es
      // quien de verdad sabe invalidar el caché de una versión a la siguiente.
      // Un SW casero que se olvida de eso sirve una versión vieja para
      // siempre, que es peor que no tener SW.
      registerType: 'autoUpdate',
      includeAssets: ['icono.svg', 'apple-touch-icon.png'],
      manifest: {
        id: base,
        name: 'Órbita',
        short_name: 'Órbita',
        description:
          'Tus estudios en un solo sitio: tareas, exámenes, horario, notas y un modo estudio para concentrarte.',
        lang: 'es',
        start_url: base,
        scope: base,
        // El mismo gris agrupado que el fondo de la interfaz: la barra del
        // sistema y el splash de arranque se funden con la aplicación.
        theme_color: '#f2f2f7',
        background_color: '#f2f2f7',
        display: 'standalone',
        orientation: 'any',
        // Accesos directos del icono (clic derecho / pulsación larga). Los
        // muestran Chrome y Edge (Android, Windows, macOS) y Safari en macOS;
        // iPadOS e iOS todavía no los admiten. En el iPad, lo equivalente es
        // la tecla D o guardar el enlace `#/estudio?despegar=25`.
        shortcuts: [
          {
            name: 'Despegar 25 minutos',
            short_name: 'Despegar 25 min',
            url: `${base}#/estudio?despegar=25`,
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Despegar 50 minutos',
            short_name: 'Despegar 50 min',
            url: `${base}#/estudio?despegar=50`,
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Nueva tarea',
            url: `${base}#/tareas?crear=tarea`,
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Todo lo que sale del build, disponible sin conexión desde el primer
        // arranque online: JS, CSS, el HTML y las fuentes auto-alojadas.
        globPatterns: ['**/*.{js,css,html,svg,png}', 'sounds/megafonia.m4a', 'sounds/aviso.m4a'],
        globIgnores: ['**/node_modules/**/*', '**/flightMap-*.{js,css}'],
        // Avisos push (resumen diario): el manejador vive en public/ y el
        // Service Worker generado lo importa. Así Workbox sigue gestionando
        // el caché y las versiones, y el push no hay que reescribirlo.
        importScripts: ['push-sw.js'],
        // El enrutado de la aplicación es por hash ('#/tareas'): para el
        // navegador es siempre la misma URL de documento, así que basta con
        // que esa página se sirva desde el caché cuando no hay red.
        navigateFallback: `${base}index.html`,
        // Los dos avisos de megafonía (unos 70 KB) sí van precargados: tienen
        // que sonar al aterrizar aunque no haya red.
        // Los ambientes del modo estudio (2–3 MB cada uno) no se precargan:
        // se guardan la primera vez que suenan y después funcionan sin red.
        runtimeCaching: [
          {
            urlPattern: ({ sameOrigin, url }) =>
              sameOrigin && /\/assets\/(?:flightMap-|maplibre-gl-worker-)/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'orbita-motor-mapa-v1',
              expiration: { maxEntries: 8, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/sounds/') && url.pathname.endsWith('.m4a'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'orbita-sonidos-v1',
              expiration: { maxEntries: 12 },
              // Safari pide el audio por rangos: sin esto, un archivo en
              // caché no se reproduciría desde el elemento <audio>.
              rangeRequests: true,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
})
