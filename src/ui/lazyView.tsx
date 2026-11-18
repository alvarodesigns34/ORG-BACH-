import { use, type ComponentType } from 'react'

/**
 * Como `React.lazy`, pero con `preload()` y sin el «tropiezo» de la primera
 * vez: `lazy` suspende al menos una vez aunque el código ya esté descargado
 * (pide el módulo al renderizar y espera a la promesa), y React mantiene el
 * esqueleto de carga un mínimo de ~300 ms. Aquí, si el módulo ya llegó, la
 * vista se pinta en el mismo fotograma, que es lo que necesita la transición
 * entre pantallas.
 */
export function lazyView<P extends object>(load: () => Promise<ComponentType<P>>) {
  let Loaded: ComponentType<P> | null = null
  let loading: Promise<void> | null = null

  const preload = (): Promise<void> => {
    loading ??= load().then(
      (component) => {
        Loaded = component
      },
      (error: unknown) => {
        // Sin red a mitad de una actualización: el siguiente intento vuelve
        // a pedirlo en vez de quedarse con el fallo para siempre.
        loading = null
        throw error
      },
    )
    return loading
  }

  function View(props: P) {
    if (!Loaded) use(preload())
    const Component = Loaded as ComponentType<P>
    return <Component {...props} />
  }

  return Object.assign(View, { preload, isLoaded: () => Loaded !== null })
}

/** Ejecuta en reposo, o tras un rato si el navegador no tiene `requestIdleCallback`. */
export function whenIdle(task: () => void, timeout = 2000): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(task, { timeout })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(task, 400)
  return () => window.clearTimeout(id)
}
