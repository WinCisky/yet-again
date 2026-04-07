import { EventTime } from "../types.ts";

export async function deleteEventTimes(kv: Deno.Kv, endpoint: string, eventTypeId: string): Promise<void> {
    for await (const entry of kv.list({ prefix: ["event_times", endpoint, eventTypeId] })) {
        await kv.delete(entry.key);
    }
}

export async function handleEventTimes(
    req: Request,
    url: URL,
    cors: Record<string, string>,
    kv: Deno.Kv,
): Promise<Response | null> {
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
            await deleteEventTimes(kv, endpoint, eventTypeId);
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
