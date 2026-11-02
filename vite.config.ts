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
        name: 'Bachillerato OS',
        short_name: 'Bachillerato',
        description:
          'Centro de control académico personal: tareas, exámenes, notas y estudio en un solo sitio.',
        lang: 'es',
        start_url: base,
        scope: base,
        // El mismo gris agrupado que el fondo de la interfaz: la barra del
        // sistema y el splash de arranque se funden con la aplicación.
        theme_color: '#f2f2f7',
        background_color: '#f2f2f7',
        display: 'standalone',
        orientation: 'any',
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
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // Avisos push (resumen diario): el manejador vive en public/ y el
        // Service Worker generado lo importa. Así Workbox sigue gestionando
        // el caché y las versiones, y el push no hay que reescribirlo.
        importScripts: ['push-sw.js'],
        // El enrutado de la aplicación es por hash ('#/tareas'): para el
        // navegador es siempre la misma URL de documento, así que basta con
        // que esa página se sirva desde el caché cuando no hay red.
        navigateFallback: `${base}index.html`,
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
