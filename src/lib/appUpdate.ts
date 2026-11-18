// Keeps installed copies of the app on the newest deploy.
//
// How it works:
// - The service worker (sw.js, built by vite-plugin-pwa) keeps a copy of the app for fast,
//   offline launches. When a new deploy goes out, the browser installs the new worker in the
//   background and it takes over right away (skipWaiting + clientsClaim in vite.config.ts).
// - This module asks for that check when the app opens, whenever it comes back to the
//   foreground, and every 30 minutes while it is open.
// - It also compares the build id baked into this code with /version.json on the server, as a
//   backup in case the worker update does not happen for some reason.
// - When a newer version is ready: if the app was just opened and nobody has touched it yet,
//   it reloads on its own (behind the splash screen). Otherwise it shows the update banner,
//   so nobody loses something they are typing.
//
// The worker registration is never removed, because push alert subscriptions live on it.

type Listener = () => void

const CHECK_EVERY_MS = 30 * 60 * 1000
const MIN_GAP_MS = 15 * 1000
const AUTO_RELOAD_WINDOW_MS = 20 * 1000
const RELOAD_GUARD_KEY = 'dwi-update-reload-at'
const RELOAD_GUARD_MS = 60 * 1000

const loadedAt = Date.now()
let touched = false
let ready = false
let staleOnly = false
let lastCheck = 0
const listeners = new Set<Listener>()

export const isUpdateReady = () => ready

export function onUpdateReady(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

const reloadedRecently = () => {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0)
    return Date.now() - at < RELOAD_GUARD_MS
  } catch { return false }
}

/** A newer version is ready. `viaWorker` is false when only /version.json says so. */
function markReady(viaWorker: boolean) {
  staleOnly = !viaWorker
  const fresh = !touched && Date.now() - loadedAt < AUTO_RELOAD_WINDOW_MS
  if (fresh && !reloadedRecently()) { void applyUpdate(); return }
  if (ready) return
  ready = true
  listeners.forEach((fn) => fn())
}

/** Reloads into the newest version. */
export async function applyUpdate() {
  try { sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now())) } catch { /* ignore */ }
  if (staleOnly && 'caches' in window) {
    // The worker never picked up the new deploy. Drop its saved copy of the app so this reload
    // comes from the server. The worker itself (and push alerts) stays in place.
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      await reg?.update()
    } catch { /* ignore */ }
    try { await Promise.all((await caches.keys()).map((k) => caches.delete(k))) } catch { /* ignore */ }
  }
  await workerSettled()
  window.location.reload()
}

/** Waits (up to 3 seconds) for the newest worker to finish taking over before reloading. */
async function workerSettled() {
  const sw = navigator.serviceWorker?.controller
  if (!sw || sw.state === 'activated') return
  await new Promise<void>((resolve) => {
    const done = () => resolve()
    sw.addEventListener('statechange', () => { if (sw.state === 'activated') done() })
    setTimeout(done, 3000)
  })
}

async function serverVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const body = (await res.json()) as { version?: unknown }
    return typeof body.version === 'string' ? body.version : null
  } catch { return null }
}

async function check() {
  if (ready || Date.now() - lastCheck < MIN_GAP_MS) return
  lastCheck = Date.now()
  let reg: ServiceWorkerRegistration | undefined
  if ('serviceWorker' in navigator) {
    try {
      reg = await navigator.serviceWorker.getRegistration()
      await reg?.update()
    } catch { /* offline or blocked, try again later */ }
    // A new worker is on its way. It takes over by itself and 'controllerchange' fires.
    if (reg?.installing || reg?.waiting) return
  }
  const latest = await serverVersion()
  if (latest && latest !== __APP_VERSION__) markReady(false)
}

let started = false

/** Call once at startup. */
export function startUpdateChecks() {
  if (started || import.meta.env.DEV) return
  started = true

  const markTouched = () => { touched = true }
  window.addEventListener('pointerdown', markTouched, { capture: true, once: true })
  window.addEventListener('keydown', markTouched, { capture: true, once: true })

  if ('serviceWorker' in navigator) {
    const hadController = Boolean(navigator.serviceWorker.controller)
    // Fires when a new worker takes over this page. On the very first install there was no
    // worker before, so that one is not an update.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) markReady(true)
    })
    // updateViaCache 'none': the browser always asks the server for sw.js and the scripts it
    // loads, instead of trusting its own HTTP cache.
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(() => check())
      .catch(() => check())
  } else {
    void check()
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check()
  })
  window.addEventListener('pageshow', (e) => { if (e.persisted) void check() })
  window.addEventListener('online', () => void check())
  window.setInterval(() => { if (document.visibilityState === 'visible') void check() }, CHECK_EVERY_MS)
}
