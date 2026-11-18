import { callFn, supabase } from './supabase'

export type PushState =
  | 'unsupported'   // this browser can't do web push
  | 'ios-install'   // iPhone/iPad in Safari: add to Home Screen first
  | 'denied'        // the person blocked notifications
  | 'off'           // supported, not turned on yet
  | 'on'            // subscribed on this device

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function currentSub(): Promise<PushSubscription | null> {
  if (!supported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

export async function pushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'ios-install'
  if (!supported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const sub = await currentSub()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

async function save(sub: PushSubscription) {
  const j = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_user_agent: navigator.userAgent,
  })
  if (error) throw new Error(error.message)
}

function keyBytes(b64: string) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

/** Ask permission (must run from a tap) and register this device for the signed-in person. */
export async function turnOnPush(): Promise<PushState> {
  if (!supported()) return pushState()
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off'
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const { public_key } = await callFn<{ public_key: string }>('send-alerts', { action: 'public_key' })
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(public_key) })
  }
  await save(sub)
  return 'on'
}

export async function turnOffPush(): Promise<void> {
  const sub = await currentSub()
  if (!sub) return
  await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}

/** On app start: make sure this device's subscription belongs to whoever is signed in now. */
export async function syncPush(): Promise<void> {
  try {
    if (!supported() || Notification.permission !== 'granted') return
    const sub = await currentSub()
    if (sub) await save(sub)
  } catch { /* not worth bothering anyone about */ }
}

/** Before sign-out: stop this device getting the old person's alerts. */
export async function forgetPushDevice(): Promise<void> {
  try {
    const sub = await currentSub()
    if (sub) await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
  } catch { /* ignore */ }
}
