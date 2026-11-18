import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LazyMotion, MotionConfig } from 'motion/react'

import { App } from './App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { installGlassLight } from './ui/glassLight'
import './styles/index.css'

// Motion va en modo diferido (LazyMotion): el bundle inicial solo trae los
// componentes, y animación, gestos y layout llegan en su propio bloque. Se
// pide ya, en paralelo con el primer render, para que las entradas animadas
// no esperen a montar la app para empezar a descargarse.
const motionFeatures = import('./ui/motionFeatures').then((mod) => mod.default)
const loadMotionFeatures = () => motionFeatures

installGlassLight()

const root = document.getElementById('root')
if (!root) throw new Error('No se encontró el contenedor #root')

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      {/* «Reducir movimiento» del sistema también para las animaciones de
          JavaScript: el CSS ya lo respeta, los muelles de Motion no lo
          hacían. Se conservan las transiciones de opacidad. */}
      <MotionConfig reducedMotion="user">
        <LazyMotion features={loadMotionFeatures}>
          <App />
        </LazyMotion>
      </MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
)
