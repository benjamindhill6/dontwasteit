// Web push handlers, loaded into the generated service worker (see vite.config.ts).
self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { body: event.data ? event.data.text() : '' } }
  event.waitUntil(
    self.registration.showNotification(d.title || "Don't Waste It!", {
      body: d.body || '',
      tag: d.tag,
      renotify: Boolean(d.tag),
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-48.png',
      data: { url: d.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if (new URL(w.url).origin !== self.location.origin) continue
      try { await w.focus() } catch { /* ignore */ }
      try { await w.navigate(url); return } catch { /* some browsers refuse; open instead */ }
    }
    await self.clients.openWindow(url)
  })())
})
