/**
 * sw.js — Service Worker for push notification handling
 *
 * This file must be served from the root of the PWA scope so it can
 * intercept push events for the entire app.
 */

// ---------------------------------------------------------------------------
// Cache — pre-cache static assets so page navigations are instant
// ---------------------------------------------------------------------------
const CACHE_NAME = "yet-again-v1";
const STATIC_ASSETS = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./global.js",
    "./privacy.html",
    "./event-type-form.html",
    "./event-times.html",
    "./event-dates.html",
    "./event-types.html",
    "./manifest.json",
    "./icons/icon-192.png",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
            )
        )
    );
    self.clients.claim();
});

// Network-first: always fetch from network, fall back to cache when offline
self.addEventListener("fetch", (event) => {
    const { request } = event;
    // Skip non-GET and API requests
    if (request.method !== "GET" || request.url.includes("/api/") ||
        !request.url.startsWith(self.location.origin)) {
        return;
    }
    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            })
            .catch(() => caches.match(request))
    );
});

// ---------------------------------------------------------------------------
// push event — parse the payload and show a native OS notification
// ---------------------------------------------------------------------------
self.addEventListener("push", (event) => {
    // The server sends a JSON payload: { title, body }
    let data = { title: "Notification", body: "" };
    if (event.data) {
        try {
            data = event.data.json();
        } catch {
            data.body = event.data.text();
        }
    }

    // showNotification() keeps the service worker alive until the notification
    // is displayed — we must wrap it in event.waitUntil()
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: "icons/icon-192.png", // optional — see manifest.json
        })
    );
});

// ---------------------------------------------------------------------------
// notificationclick event — bring the app window into focus when tapped
// ---------------------------------------------------------------------------
self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    // Try to focus an existing window on this origin, or open a new one
    event.waitUntil(
        clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then((windowClients) => {
                for (const client of windowClients) {
                    if ("focus" in client) {
                        return client.focus();
                    }
                }
                // No existing window — open the PWA
                if (clients.openWindow) {
                    return clients.openWindow(self.location.origin);
                }
            })
    );
});
