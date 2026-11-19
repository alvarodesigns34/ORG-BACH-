import { StrictMode, Suspense, lazy, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { LazyMotion, MotionConfig } from 'motion/react'

import { App } from './App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { installGlassLight } from './ui/glassLight'
import { cleanLandingParams, isLandingPreview, setLandingIntent, shouldShowLanding, type LandingIntent } from './landing/entry'
import './styles/index.css'

// Motion va en modo diferido (LazyMotion): el bundle inicial solo trae los
// componentes, y animación, gestos y layout llegan en su propio bloque. Se
// pide ya, en paralelo con el primer render, para que las entradas animadas
// no esperen a montar la app para empezar a descargarse.
const motionFeatures = import('./ui/motionFeatures').then((mod) => mod.default)
const loadMotionFeatures = () => motionFeatures

installGlassLight()

// Web de presentación (ver landing/entry.ts): un bloque aparte que solo se
// descarga si se va a mostrar. Mientras no se estrene, solo con ?presentacion.
const Landing = lazy(() => import('./landing/Landing'))

function Root() {
  const [landing, setLanding] = useState(shouldShowLanding)
  if (!landing) return <App />
  const enter = (intent: LandingIntent) => {
    setLandingIntent(intent)
    cleanLandingParams()
    const swap = () => {
      window.scrollTo(0, 0)
      setLanding(false)
    }
    // Entrar a la app con un fundido del navegador (sin recargar).
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (doc.startViewTransition && !reduce) doc.startViewTransition(() => flushSync(swap))
    else swap()
  }
  return (
    <Suspense fallback={null}>
      <Landing preview={isLandingPreview()} onEnter={() => enter('start')} onSignIn={() => enter('signin')} />
    </Suspense>
  )
}

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
          <Root />
        </LazyMotion>
      </MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
)
