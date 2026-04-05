import webpush from "npm:web-push@3";
import { corsHeaders } from "./helper.ts";
import { EventTime, EventType, PushSubscriptionLike } from "./types.ts";
import { handleEventTypes } from "./routes/event-types.ts";
import { handleEventDates } from "./routes/event-dates.ts";
import { handleEventTimes } from "./routes/event-times.ts";
import { handleSubscription } from "./routes/subscription.ts";

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

const kv = await Deno.openKv();

// ---------------------------------------------------------------------------
// HTTP request handler
// ---------------------------------------------------------------------------
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // Subscription routes (vapid-key, subscribe)
  const subResponse = await handleSubscription(req, url, cors, kv, VAPID_PUBLIC_KEY);
  if (subResponse) return subResponse;

  // Event type routes
  const typeResponse = await handleEventTypes(req, url, cors, kv);
  if (typeResponse) return typeResponse;

  // Event date routes
  const dateResponse = await handleEventDates(req, url, cors, kv);
  if (dateResponse) return dateResponse;

  // Event time routes
  const timeResponse = await handleEventTimes(req, url, cors, kv);
  if (timeResponse) return timeResponse;

  // 404 for everything else
  return new Response("Not Found", { status: 404, headers: cors });
}

// ---------------------------------------------------------------------------
// Cron job — runs every minute, checks if any notification is due
// ---------------------------------------------------------------------------
Deno.cron("check-notifications", "*/5 * * * *", async () => {
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

  // Today's date string in UTC (YYYY-MM-DD)
  const todayStr = now.toISOString().slice(0, 10);

  // Current time in minutes since midnight (UTC)
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const agoMinutes = fiveMinAgo.getUTCHours() * 60 + fiveMinAgo.getUTCMinutes();

  // Load all subscriptions
  const subscriptions: Array<{ endpoint: string; value: PushSubscriptionLike }> = [];
  for await (const entry of kv.list<PushSubscriptionLike>({ prefix: ["subscriptions"] })) {
    if (entry.value) {
      subscriptions.push({ endpoint: entry.value.endpoint, value: entry.value });
    }
  }
  console.log(`[cron] ${now.toISOString()} — ${subscriptions.length} subscriber(s)`);

  for (const sub of subscriptions) {
    // Iterate event types for this user
    for await (const etEntry of kv.list<EventType>({ prefix: ["event_types", sub.endpoint] })) {
      const eventType = etEntry.value;
      if (!eventType) continue;

      // Check if today is one of the configured dates for this event type
      const dateEntry = await kv.get<string>(["event_dates", sub.endpoint, eventType.id, todayStr]);
      if (!dateEntry.value) continue;

      // Check if any configured time falls within the last 5 minutes
      for await (const timeEntry of kv.list<EventTime>({ prefix: ["event_times", sub.endpoint, eventType.id] })) {
        const t = timeEntry.value;
        if (!t) continue;
        const tMinutes = t.hour * 60 + t.minute;

        // Handle midnight wrap-around
        const inWindow = agoMinutes <= nowMinutes
          ? tMinutes > agoMinutes && tMinutes <= nowMinutes
          : tMinutes > agoMinutes || tMinutes <= nowMinutes;

        if (inWindow) {
          console.log(`[cron] Sending notification for "${eventType.name}" to subscriber`);
          const payload = JSON.stringify({
            title: eventType.name,
            body: `Evento: ${eventType.name} — ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`,
          });
          try {
            await webpush.sendNotification(sub.value, payload);
          } catch (err) {
            console.error("[cron] Failed to send push:", err);
            await kv.delete(["subscriptions", sub.endpoint]);
          }
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Start the HTTP server
// ---------------------------------------------------------------------------
console.log("Server starting…");
Deno.serve(handler);
