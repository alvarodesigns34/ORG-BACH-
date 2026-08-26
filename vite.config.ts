import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // GitHub Pages sirve un repositorio de proyecto bajo /<repo>/, no en la raíz
  // del dominio. La variable la fija solo el workflow de despliegue: en local
  // (`npm run dev` / `npm run build`) el base sigue siendo '/'.
  base: process.env.GITHUB_PAGES === 'true' ? '/ORG-BACH-/' : '/',
  plugins: [react(), tailwindcss()],
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
