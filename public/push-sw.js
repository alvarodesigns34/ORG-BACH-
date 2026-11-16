/*
 * Avisos push (resumen diario y modo estudio). Lo importa el Service Worker que genera Workbox
 * (`workbox.importScripts` en vite.config.ts).
 *
 * Funciona con la aplicación cerrada: el sistema despierta al Service Worker
 * solo para mostrar el aviso.
 */

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }

  // El servidor manda también la forma declarativa (`notification`), que
  // Safari 18.4+ muestra sin pasar por aquí; el resto de navegadores llegan a
  // este manejador y leen los mismos datos.
  const declared = payload.notification || {}
  const title = payload.title || declared.title || 'Órbita'
  const tag = payload.tag || declared.tag || 'orbita'
  const options = {
    body: payload.body || declared.body || '',
    tag,
    // Un resumen nuevo sustituye al de ayer en lugar de apilarse; un aviso de
    // vuelo (aterrizaje, escala) sí vuelve a sonar aunque sustituya a otro.
    renotify: tag === 'vuelo',
    icon: new URL('pwa-192x192.png', self.registration.scope).href,
    badge: new URL('pwa-192x192.png', self.registration.scope).href,
    lang: 'es',
    data: { url: payload.url || '' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const hash = String((event.notification.data && event.notification.data.url) || '').replace(/^#/, '')
  const target = new URL(self.registration.scope)
  if (hash) target.hash = hash

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          if (hash && 'navigate' in client) client.navigate(target.href).catch(() => {})
          return client.focus()
        }
      }
      return self.clients.openWindow(target.href)
    }),
  )
})
