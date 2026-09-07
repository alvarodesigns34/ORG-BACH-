import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import './styles/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('No se encontró el contenedor #root')

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
