import { EventTime, EventType } from "../types.ts";

export async function handleEvents(
  req: Request,
  url: URL,
  cors: Record<string, string>,
  kv: Deno.Kv,
): Promise<Response | null> {
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

  return null;
}
