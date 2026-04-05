const SERVER_URL = "https://yet-again.simo.deno.net";

const enableBtn = document.getElementById("enableBtn");
const unsubscribeBtn = document.getElementById("unsubscribeBtn");
const notSubscribedDiv = document.getElementById("notSubscribed");
const subscribedDiv = document.getElementById("subscribed");
const statusEl = document.getElementById("status");

function setStatus(msg) {
  statusEl.textContent = msg;
}

function showSubscribed() {
  notSubscribedDiv.style.display = "none";
  subscribedDiv.style.display = "flex";
}

function showNotSubscribed() {
  subscribedDiv.style.display = "none";
  notSubscribedDiv.style.display = "flex";
  enableBtn.disabled = false;
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

/**
 * Return the current PushSubscription if any, or null.
 */
async function getExistingSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.getRegistration("sw.js");
  if (!registration) return null;
  return await registration.pushManager.getSubscription();
}

// On page load, check if the user is already subscribed
async function checkExistingSubscription() {
  const subscription = await getExistingSubscription();
  if (subscription) {
    showSubscribed();
    setStatus("✅ Sottoscrizione attiva.");
  } else {
    showNotSubscribed();
  }
}

checkExistingSubscription();

enableBtn.addEventListener("click", async () => {
  enableBtn.disabled = true;
  setStatus("Richiesta permesso notifiche…");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    setStatus("Permesso notifiche negato. Consenti le notifiche e riprova.");
    enableBtn.disabled = false;
    return;
  }

  try {
    setStatus("Registrazione service worker…");
    await navigator.serviceWorker.register("sw.js");
    const registration = await navigator.serviceWorker.ready;

    setStatus("Recupero chiave VAPID dal server…");
    const keyRes = await fetch(`${SERVER_URL}/vapid-key`);
    if (!keyRes.ok) throw new Error(`Server returned ${keyRes.status} for /vapid-key`);
    const { publicKey } = await keyRes.json();
    const applicationServerKey = urlBase64ToUint8Array(publicKey);

    setStatus("Sottoscrizione alle notifiche push…");
    let subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
    }
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    setStatus("Invio sottoscrizione al server…");
    const subRes = await fetch(`${SERVER_URL}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });
    if (!subRes.ok) throw new Error(`Server returned ${subRes.status} for /subscribe`);

    showSubscribed();
    setStatus("✅ Sottoscrizione attiva.");
  } catch (err) {
    console.error("Subscription failed:", err);
    setStatus(`❌ Errore: ${err.message}`);
    enableBtn.disabled = false;
  }
});

unsubscribeBtn.addEventListener("click", async () => {
  unsubscribeBtn.disabled = true;
  setStatus("Rimozione sottoscrizione…");
  try {
    const subscription = await getExistingSubscription();
    if (subscription) {
      await subscription.unsubscribe();
    }
    showNotSubscribed();
    setStatus("Sottoscrizione rimossa.");
  } catch (err) {
    console.error("Unsubscribe failed:", err);
    setStatus(`❌ Errore: ${err.message}`);
    unsubscribeBtn.disabled = false;
  }
});
