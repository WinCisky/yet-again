/**
 * sw.js — Service Worker for push notification handling
 *
 * This file must be served from the root of the PWA scope so it can
 * intercept push events for the entire app.
 *
 * Events handled:
 *  push            — fires when the server sends a Web Push message
 *  notificationclick — fires when the user clicks a displayed notification
 */

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
