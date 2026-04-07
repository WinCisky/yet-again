const SERVER_URL = "https://yet-again.simo.deno.net";

const enableBtn = document.getElementById("enableBtn");
const unsubscribeBtn = document.getElementById("unsubscribeBtn");
const notSubscribedDiv = document.getElementById("notSubscribed");
const subscribedDiv = document.getElementById("subscribed");
const statusEl = document.getElementById("status");
const contentEl = document.getElementById("content");

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

async function getEndpoint() {
  const sub = await getExistingSubscription();
  return sub ? sub.endpoint : null;
}

async function deleteType(endpoint, id) {
  if (!confirm("Delete this event type?")) return;
  try {
    const res = await fetch(`${SERVER_URL}/event-types`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, id }),
    });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    loadEventTypes();
  } catch (err) {
    setStatus(`❌ Error: ${err.message}`);
  }
}

function renderTypes(types, endpoint) {
  contentEl.innerHTML = "";
  if (types.length === 0) {
    contentEl.textContent = "No event types configured.";
    return;
  }
  for (const t of types) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:0.5rem;";

    const color = document.createElement("span");
    color.textContent = "\u25CF";
    color.style.color = t.color;
    row.appendChild(color);

    const name = document.createElement("span");
    name.textContent = t.name;
    name.style.cssText = "flex:1;";
    row.appendChild(name);

    const editBtn = document.createElement("a");
    editBtn.href = `event-type-form.html?id=${encodeURIComponent(t.id)}`;
    editBtn.textContent = "Edit";
    row.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";;
    delBtn.addEventListener("click", () => deleteType(endpoint, t.id));
    row.appendChild(delBtn);

    contentEl.appendChild(row);
  }
}

async function loadEventTypes() {
  const endpoint = await getEndpoint();
  if (!endpoint) return;
  setStatus("Loading…");
  try {
    const res = await fetch(`${SERVER_URL}/event-types?endpoint=${encodeURIComponent(endpoint)}`);
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const types = await res.json();
    setStatus("");
    renderTypes(types, endpoint);
  } catch (err) {
    setStatus(`❌ Error: ${err.message}`);
  }
}

// On page load, check if the user is already subscribed
async function checkExistingSubscription() {
  const subscription = await getExistingSubscription();
  if (subscription) {
    showSubscribed();
    loadEventTypes();
  } else {
    showNotSubscribed();
  }
}

checkExistingSubscription();

enableBtn.addEventListener("click", async () => {
  enableBtn.disabled = true;
  setStatus("Requesting notification permission…");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    setStatus("Notification permission denied. Allow notifications and try again.");
    enableBtn.disabled = false;
    return;
  }

  try {
    setStatus("Registering service worker…");
    await navigator.serviceWorker.register("sw.js");
    const registration = await navigator.serviceWorker.ready;

    setStatus("Fetching VAPID key from server…");
    const keyRes = await fetch(`${SERVER_URL}/vapid-key`);
    if (!keyRes.ok) throw new Error(`Server returned ${keyRes.status} for /vapid-key`);
    const { publicKey } = await keyRes.json();
    const applicationServerKey = urlBase64ToUint8Array(publicKey);

    setStatus("Subscribing to push notifications…");
    let subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
    }
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    setStatus("Sending subscription to server…");
    const subRes = await fetch(`${SERVER_URL}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });
    if (!subRes.ok) throw new Error(`Server returned ${subRes.status} for /subscribe`);

    showSubscribed();
    loadEventTypes();
  } catch (err) {
    console.error("Subscription failed:", err);
    setStatus(`❌ Error: ${err.message}`);
    enableBtn.disabled = false;
  }
});

unsubscribeBtn.addEventListener("click", async () => {
  if (!confirm("Are you sure you want to unsubscribe?")) return;
  unsubscribeBtn.disabled = true;
  setStatus("Removing subscription…");
  try {
    const subscription = await getExistingSubscription();
    if (subscription) {
      // Delete subscription data from the server
      await fetch(`${SERVER_URL}/subscribe`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });
      await subscription.unsubscribe();
    }
    showNotSubscribed();
    setStatus("Subscription removed.");
  } catch (err) {
    console.error("Unsubscribe failed:", err);
    setStatus(`❌ Error: ${err.message}`);
    unsubscribeBtn.disabled = false;
  }
});
