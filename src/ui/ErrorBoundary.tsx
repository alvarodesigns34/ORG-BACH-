import { Component, type ErrorInfo, type ReactNode } from 'react'

import * as storage from '@/storage/persistence'
import { Button } from './primitives'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Si una vista revienta, no puede llevarse el curso entero: los datos siguen
 * en localStorage y hay que poder exportarlos desde aquí.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Bachillerato OS', error, info.componentStack)
  }

  private exportCopy = () => {
    try {
      const outcome = storage.load()
      const blob = new Blob([storage.exportJSON(outcome.data)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'bachillerato-os-rescate.json'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      // Si ni el almacenamiento responde, recargar es lo único que queda.
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-dvh grid place-items-center px-6 bg-canvas text-ink">
        <div className="max-w-md flex flex-col gap-4">
          <p className="eyebrow">Algo ha fallado</p>
          <h1 className="display text-[1.75rem] leading-tight">
            La pantalla se ha caído. Tus datos siguen en el navegador.
          </h1>
          <p className="text-[0.875rem] text-ink-2 leading-relaxed">
            Exporta una copia antes de recargar. Si el error se repite, empieza
            de cero desde Ajustes después de guardar esa copia.
          </p>
          <p className="text-[0.75rem] text-ink-3 font-mono break-all">
            {this.state.error.message}
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Button variant="primary" onClick={this.exportCopy}>
              Exportar copia
            </Button>
            <Button onClick={() => window.location.reload()}>Recargar</Button>
          </div>
        </div>
      </div>
    )
  }
}
