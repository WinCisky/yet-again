/**
 * app.js — client-side push subscription logic
 *
 * On button click:
 *  1. Request notification permission from the browser
 *  2. Register the service worker (sw.js)
 *  3. Fetch the VAPID public key from the server
 *  4. Subscribe to Web Push via PushManager
 *  5. Send the subscription object to the server's /subscribe endpoint
 */

const SERVER_URL = "https://yet-again.simo.deno.net";

const btn = document.getElementById("enableBtn");
const statusEl = document.getElementById("status");

function setStatus(msg) {
  statusEl.textContent = msg;
}

/**
 * Convert a base64url string (as returned by the server) to a Uint8Array,
 * which is what PushManager.subscribe() expects for applicationServerKey.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

btn.addEventListener("click", async () => {
  btn.disabled = true;
  setStatus("Requesting notification permission…");

  // Step 1: Ask the user for notification permission
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    setStatus("Notification permission denied. Please allow notifications and try again.");
    btn.disabled = false;
    return;
  }

  try {
    // Step 2: Register the service worker
    setStatus("Registering service worker…");
    const registration = await navigator.serviceWorker.register("sw.js");
    // Wait for the service worker to be ready before subscribing
    await navigator.serviceWorker.ready;

    // Step 3: Fetch the VAPID public key from the server
    setStatus("Fetching VAPID key from server…");
    const keyRes = await fetch(`${SERVER_URL}/vapid-key`);
    if (!keyRes.ok) throw new Error(`Server returned ${keyRes.status} for /vapid-key`);
    const { publicKey } = await keyRes.json();

    // Step 4: Subscribe to push using the VAPID key
    setStatus("Subscribing to push notifications…");
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true, // required: all pushes must show a notification
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    // Step 5: Send the subscription to the server so it can push to us later
    setStatus("Sending subscription to server…");
    const subRes = await fetch(`${SERVER_URL}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });
    if (!subRes.ok) throw new Error(`Server returned ${subRes.status} for /subscribe`);

    setStatus("✅ Subscribed! You will receive notifications at the scheduled times.");
    btn.textContent = "Subscribed";
  } catch (err) {
    console.error("Subscription failed:", err);
    setStatus(`❌ Error: ${err.message}`);
    btn.disabled = false;
  }
});
