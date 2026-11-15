import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'

import { App } from './App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import './styles/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('No se encontró el contenedor #root')

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      {/* «Reducir movimiento» del sistema también para las animaciones de
          JavaScript: el CSS ya lo respeta, los muelles de Motion no lo
          hacían. Se conservan las transiciones de opacidad. */}
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
)
