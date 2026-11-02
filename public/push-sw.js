/*
 * Avisos push. Lo importa el Service Worker que genera Workbox
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

  const title = payload.title || 'Bachillerato OS'
  const options = {
    body: payload.body || '',
    tag: payload.tag || 'bachillerato-os',
    // Un resumen nuevo sustituye al de ayer en lugar de apilarse.
    renotify: false,
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
