/**
 * server.ts — Deno Deploy push notification server
 *
 * Responsibilities:
 *  - Expose GET /vapid-key so the client can subscribe to Web Push
 *  - Expose POST /subscribe to store push subscriptions in Deno KV
 *  - Run a Deno.cron job every minute to check if any notification is due,
 *    and if so send a Web Push message to all subscribers stored in KV
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

// Open Deno KV once at startup and reuse it for all requests and cron jobs.
const kv = await Deno.openKv();

interface PushSubscriptionLike {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

interface EventType {
  id: string;
  name: string;
  color: string;
}

interface EventTime {
  hour: number;
  minute: number;
}

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
async function handler(req: Request): Promise<Response> {
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
    try {
      const body = await req.json();
      if (
        typeof body !== "object" ||
        body === null ||
        !("endpoint" in body) ||
        typeof (body as PushSubscriptionLike).endpoint !== "string"
      ) {
        return new Response(
          JSON.stringify({ error: "Invalid subscription payload" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      const subscription = body as PushSubscriptionLike;
      await kv.set(["subscriptions", subscription.endpoint], subscription);

      let count = 0;
      for await (const _entry of kv.list({ prefix: ["subscriptions"] })) {
        count += 1;
      }
      console.log(`Subscription stored in KV. Total subscribers: ${count}`);

      return new Response(
        JSON.stringify({ ok: true }),
        { status: 201, headers: { ...cors, "Content-Type": "application/json" } },
      );
    } catch (err) {
      console.error("Failed to parse subscription body:", err);
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
  }

  // -------------------------------------------------------------------------
  // POST /event-types — create a new event type for a user
  // Body: { endpoint, name, color }
  // -------------------------------------------------------------------------
  if (req.method === "POST" && url.pathname === "/event-types") {
    try {
      const body = await req.json();
      const { endpoint, name, color } = body as { endpoint?: string; name?: string; color?: string };
      if (!endpoint || !name || !color) {
        return new Response(
          JSON.stringify({ error: "Missing endpoint, name, or color" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
      const id = crypto.randomUUID();
      const eventType: EventType = { id, name, color };
      await kv.set(["event_types", endpoint, id], eventType);
      return new Response(
        JSON.stringify(eventType),
        { status: 201, headers: { ...cors, "Content-Type": "application/json" } },
      );
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
  }

  // -------------------------------------------------------------------------
  // GET /event-types?endpoint=... — get all event types for a user
  // -------------------------------------------------------------------------
  if (req.method === "GET" && url.pathname === "/event-types") {
    const endpoint = url.searchParams.get("endpoint");
    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: "Missing endpoint query parameter" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
    const types: EventType[] = [];
    for await (const entry of kv.list<EventType>({ prefix: ["event_types", endpoint] })) {
      if (entry.value) types.push(entry.value);
    }
    return new Response(
      JSON.stringify(types),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  // -------------------------------------------------------------------------
  // POST /event-dates — set dates for an event type for a user
  // Body: { endpoint, eventTypeId, dates: ["2026-04-02", ...] }
  // -------------------------------------------------------------------------
  if (req.method === "POST" && url.pathname === "/event-dates") {
    try {
      const body = await req.json();
      const { endpoint, eventTypeId, dates } = body as {
        endpoint?: string;
        eventTypeId?: string;
        dates?: string[];
      };
      if (!endpoint || !eventTypeId || !Array.isArray(dates)) {
        return new Response(
          JSON.stringify({ error: "Missing endpoint, eventTypeId, or dates" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
      // Delete existing dates for this event type, then write new ones
      for await (const entry of kv.list({ prefix: ["event_dates", endpoint, eventTypeId] })) {
        await kv.delete(entry.key);
      }
      for (const date of dates) {
        await kv.set(["event_dates", endpoint, eventTypeId, date], date);
      }
      return new Response(
        JSON.stringify({ ok: true, dates }),
        { status: 201, headers: { ...cors, "Content-Type": "application/json" } },
      );
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
  }

  // -------------------------------------------------------------------------
  // GET /event-dates?endpoint=...&eventTypeId=... — get dates for an event type
  // -------------------------------------------------------------------------
  if (req.method === "GET" && url.pathname === "/event-dates") {
    const endpoint = url.searchParams.get("endpoint");
    const eventTypeId = url.searchParams.get("eventTypeId");
    if (!endpoint || !eventTypeId) {
      return new Response(
        JSON.stringify({ error: "Missing endpoint or eventTypeId query parameter" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
    const dates: string[] = [];
    for await (const entry of kv.list<string>({ prefix: ["event_dates", endpoint, eventTypeId] })) {
      if (entry.value) dates.push(entry.value);
    }
    return new Response(
      JSON.stringify(dates),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  // -------------------------------------------------------------------------
  // POST /event-times — set times for an event type for a user
  // Body: { endpoint, eventTypeId, times: [{ hour: 14, minute: 30 }, ...] }
  // -------------------------------------------------------------------------
  if (req.method === "POST" && url.pathname === "/event-times") {
    try {
      const body = await req.json();
      const { endpoint, eventTypeId, times } = body as {
        endpoint?: string;
        eventTypeId?: string;
        times?: EventTime[];
      };
      if (!endpoint || !eventTypeId || !Array.isArray(times)) {
        return new Response(
          JSON.stringify({ error: "Missing endpoint, eventTypeId, or times" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
      // Delete existing times for this event type, then write new ones
      for await (const entry of kv.list({ prefix: ["event_times", endpoint, eventTypeId] })) {
        await kv.delete(entry.key);
      }
      for (const t of times) {
        const key = `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
        await kv.set(["event_times", endpoint, eventTypeId, key], { hour: t.hour, minute: t.minute });
      }
      return new Response(
        JSON.stringify({ ok: true, times }),
        { status: 201, headers: { ...cors, "Content-Type": "application/json" } },
      );
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
  }

  // -------------------------------------------------------------------------
  // GET /event-times?endpoint=...&eventTypeId=... — get times for an event type
  // -------------------------------------------------------------------------
  if (req.method === "GET" && url.pathname === "/event-times") {
    const endpoint = url.searchParams.get("endpoint");
    const eventTypeId = url.searchParams.get("eventTypeId");
    if (!endpoint || !eventTypeId) {
      return new Response(
        JSON.stringify({ error: "Missing endpoint or eventTypeId query parameter" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
    const times: EventTime[] = [];
    for await (const entry of kv.list<EventTime>({ prefix: ["event_times", endpoint, eventTypeId] })) {
      if (entry.value) times.push(entry.value);
    }
    return new Response(
      JSON.stringify(times),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

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
