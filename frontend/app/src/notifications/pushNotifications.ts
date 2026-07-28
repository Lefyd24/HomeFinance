/**
 * Web Push / desktop notification helpers.
 * Requires a registered service worker at /sw.js.
 */
import * as notificationsApi from './notificationsApi'

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

function keysMatch(subscription: PushSubscription, serverKeyB64: string): boolean {
  const existing = subscription.options?.applicationServerKey as ArrayBuffer | null
  if (!existing || !serverKeyB64) return false
  const expected = urlBase64ToUint8Array(serverKeyB64)
  const existingBytes = new Uint8Array(existing)
  if (existingBytes.byteLength !== expected.byteLength) return false
  return expected.every((byte, i) => existingBytes[i] === byte)
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser')
  }
  let reg = await navigator.serviceWorker.getRegistration()
  if (!reg) {
    reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  }
  await navigator.serviceWorker.ready
  return reg
}

async function getSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  try {
    const reg = await ensureServiceWorker()
    return reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

export async function isPushSubscribed(): Promise<boolean> {
  const sub = await getSubscription()
  return !!sub
}

export async function subscribePush({ forceRefresh = false } = {}): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new Error('Desktop notifications are not supported in this browser')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was denied')
  }

  const reg = await ensureServiceWorker()
  const { key } = await notificationsApi.getVapidPublicKey()
  if (!key) {
    throw new Error('Push notifications are not configured on the server (missing VAPID keys)')
  }

  let sub = await reg.pushManager.getSubscription()
  const needsNewSub = !sub || forceRefresh || !keysMatch(sub, key)
  if (sub && needsNewSub) {
    try {
      await sub.unsubscribe()
    } catch {
      // Best-effort cleanup — a stale subscription that fails to unsubscribe
      // is replaced below anyway.
    }
    sub = await reg.pushManager.getSubscription()
    if (sub) {
      try {
        await sub.unsubscribe()
      } catch {
        // Same as above.
      }
    }
    sub = null
  }

  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    })
  }

  const json = sub.toJSON()
  await notificationsApi.subscribePush({
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    user_agent: navigator.userAgent,
  })

  return sub
}

export async function unsubscribePush(): Promise<boolean> {
  const sub = await getSubscription()
  if (!sub) return false

  const endpoint = sub.endpoint
  await sub.unsubscribe()
  await notificationsApi.unsubscribePush(endpoint)
  return true
}
