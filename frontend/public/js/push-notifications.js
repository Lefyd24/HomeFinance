/**
 * Web Push / desktop notification helpers.
 * Requires a registered service worker at /sw.js (see Layout.ensureServiceWorker).
 */

const PushNotifications = {
    isSupported() {
        return (
            typeof window !== 'undefined' &&
            'serviceWorker' in navigator &&
            'PushManager' in window &&
            'Notification' in window
        );
    },

    urlBase64ToUint8Array(base64) {
        const padding = '='.repeat((4 - (base64.length % 4)) % 4);
        const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(b64);
        return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
    },

    _keysMatch(subscription, serverKeyB64) {
        const existing = subscription?.options?.applicationServerKey;
        if (!existing || !serverKeyB64) return false;
        const expected = this.urlBase64ToUint8Array(serverKeyB64);
        if (existing.byteLength !== expected.byteLength) return false;
        return expected.every((byte, i) => existing[i] === byte);
    },

    async ensureServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            throw new Error('Service workers are not supported in this browser');
        }
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
            reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        }
        await navigator.serviceWorker.ready;
        return reg;
    },

    async getSubscription() {
        if (!this.isSupported()) return null;
        try {
            const reg = await this.ensureServiceWorker();
            return reg.pushManager.getSubscription();
        } catch {
            return null;
        }
    },

    async isSubscribed() {
        const sub = await this.getSubscription();
        return !!sub;
    },

    async subscribe({ forceRefresh = false } = {}) {
        if (!this.isSupported()) {
            throw new Error('Desktop notifications are not supported in this browser');
        }

        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
            throw new Error('Notification permission was denied');
        }

        const reg = await this.ensureServiceWorker();
        const { key } = await API.notifications.vapidKey();
        if (!key) {
            throw new Error('Push notifications are not configured on the server (missing VAPID keys)');
        }

        let sub = await reg.pushManager.getSubscription();
        if (sub && (forceRefresh || !this._keysMatch(sub, key))) {
            try {
                await sub.unsubscribe();
            } catch (e) {
                console.warn('Could not unsubscribe stale push subscription', e);
            }
            sub = null;
        }

        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(key),
            });
        }

        const json = sub.toJSON();
        await API.notifications.subscribe({
            endpoint: sub.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
            user_agent: navigator.userAgent,
        });

        return sub;
    },

    async unsubscribe() {
        const sub = await this.getSubscription();
        if (!sub) return false;

        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await API.notifications.unsubscribe({ endpoint });
        return true;
    },
};

window.PushNotifications = PushNotifications;
