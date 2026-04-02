/**
 * server.ts — Deno Deploy push notification server
 *
 * Responsibilities:
 *  - Expose GET /vapid-key so the client can subscribe to Web Push
 *  - Expose POST /subscribe to store push subscriptions (in-memory)
 *  - Run a Deno.cron job every minute to check if any notification is due,
 *    and if so send a Web Push message to all stored subscribers
 *
 * Required environment variables:
 *  VAPID_PUBLIC_KEY   — base64url-encoded VAPID public key
 *  VAPID_PRIVATE_KEY  — base64url-encoded VAPID private key
 *  VAPID_SUBJECT      — contact URI, e.g. "mailto:you@example.com"
 *
 * Generate keys once with:
 *   npx web-push generate-vapid-keys
 */

// Use the web-push npm package via Deno's npm: specifier — no package.json needed
import webpush from "npm:web-push@3";

// ---------------------------------------------------------------------------
// VAPID configuration — read from environment variables
// ---------------------------------------------------------------------------
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:example@example.com";

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn(
    "WARNING: VAPID_PUBLIC_KEY and/or VAPID_PRIVATE_KEY env vars are not set.\n" +
    "Generate them with:  npx web-push generate-vapid-keys\n" +
    "Then set them as environment variables on Deno Deploy."
  );
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ---------------------------------------------------------------------------
// Hardcoded notification schedule — edit these to your desired dates/times
// All times are in UTC (ISO 8601 format).
// ---------------------------------------------------------------------------
const NOTIFICATIONS = [
  { date: "2026-04-02T21:30:00Z", title: "Morning Reminder", body: "Time to start your day!" },
  { date: "2026-04-02T22:30:00Z", title: "Lunch Break", body: "Don't forget to eat!" },
  { date: "2026-04-02T22:45:00Z", title: "Evening Check-in", body: "How was your day?" },
];

// ---------------------------------------------------------------------------
// In-memory stores — these reset on each deployment/restart.
// For persistence across restarts, use Deno KV instead.
// ---------------------------------------------------------------------------

// Set of serialized PushSubscription JSON strings
const subscriptions = new Set<string>();

// Set of notification date strings that have already been sent, to prevent duplicates
const sentNotifications = new Set<string>();

// ---------------------------------------------------------------------------
// CORS helper — allow the GitHub Pages origin and localhost for dev
// ---------------------------------------------------------------------------
function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = [
    "https://wincisky.github.io",
  ];
  // Allow any localhost origin for local development
  const isLocalhost = origin != null && /^http:\/\/localhost(:\d+)?$/.test(origin);
  const allowedOrigin = (origin && allowed.includes(origin)) || isLocalhost
    ? origin
    : allowed[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin!,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// ---------------------------------------------------------------------------
// HTTP request handler
// ---------------------------------------------------------------------------
function handler(req: Request): Response {
  const url = new URL(req.url);
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // GET /vapid-key — return the VAPID public key so the client can subscribe
  if (req.method === "GET" && url.pathname === "/vapid-key") {
    return new Response(
      JSON.stringify({ publicKey: VAPID_PUBLIC_KEY }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  // POST /subscribe — store a new push subscription
  if (req.method === "POST" && url.pathname === "/subscribe") {
    return req.json().then((body: unknown) => {
      const sub = JSON.stringify(body);
      subscriptions.add(sub);
      console.log(`Subscription stored. Total subscribers: ${subscriptions.size}`);
      return new Response(
        JSON.stringify({ ok: true }),
        { status: 201, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }).catch((err) => {
      console.error("Failed to parse subscription body:", err);
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    });
  }

  // 404 for everything else
  return new Response("Not Found", { status: 404, headers: cors });
}

// ---------------------------------------------------------------------------
// Cron job — runs every minute, checks if any notification is due
// ---------------------------------------------------------------------------
Deno.cron("check-notifications", "*/5 * * * *", async () => {
  // send a test notification to all of the subscribed clients
  const now = new Date();

  // Send to all stored subscriptions
  const payload = JSON.stringify({ title: `test ${now.toISOString()}`, body: `hello ${now.toDateString()}`});
  const sendPromises = [...subscriptions].map(async (subJson) => {
    try {
      const sub = JSON.parse(subJson);
      await webpush.sendNotification(sub, payload);
    } catch (err) {
      console.error("Failed to send push to subscriber:", err);
      // Remove invalid/expired subscriptions
      subscriptions.delete(subJson);
    }
  });

  await Promise.all(sendPromises);

  // const now = new Date();

  // for (const notification of NOTIFICATIONS) {
  //   const notifDate = new Date(notification.date);

  //   // Check if this notification's minute has arrived and it hasn't been sent yet
  //   const sameMinute =
  //     notifDate.getUTCFullYear() === now.getUTCFullYear() &&
  //     notifDate.getUTCMonth() === now.getUTCMonth() &&
  //     notifDate.getUTCDate() === now.getUTCDate() &&
  //     notifDate.getUTCHours() === now.getUTCHours() &&
  //     notifDate.getUTCMinutes() === now.getUTCMinutes();

  //   if (sameMinute && !sentNotifications.has(notification.date)) {
  //     console.log(`Sending notification: "${notification.title}" to ${subscriptions.size} subscriber(s)`);
  //     sentNotifications.add(notification.date);

  //     // Send to all stored subscriptions
  //     const payload = JSON.stringify({ title: notification.title, body: notification.body });
  //     const sendPromises = [...subscriptions].map(async (subJson) => {
  //       try {
  //         const sub = JSON.parse(subJson);
  //         await webpush.sendNotification(sub, payload);
  //       } catch (err) {
  //         console.error("Failed to send push to subscriber:", err);
  //         // Remove invalid/expired subscriptions
  //         subscriptions.delete(subJson);
  //       }
  //     });

  //     await Promise.all(sendPromises);
  //   }
  // }
});

// ---------------------------------------------------------------------------
// Start the HTTP server
// ---------------------------------------------------------------------------
console.log("Server starting…");
Deno.serve(handler);
