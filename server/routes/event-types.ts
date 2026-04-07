import { EventType } from "../types.ts";
import { deleteEventDates } from "./event-dates.ts";
import { deleteEventTimes } from "./event-times.ts";

export async function handleEventTypes(
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
    // PUT /event-types — update an existing event type
    // Body: { endpoint, id, name, color }
    // -------------------------------------------------------------------------
    if (req.method === "PUT" && url.pathname === "/event-types") {
        try {
            const body = await req.json();
            const { endpoint, id, name, color } = body as { endpoint?: string; id?: string; name?: string; color?: string };
            if (!endpoint || !id || !name || !color) {
                return new Response(
                    JSON.stringify({ error: "Missing endpoint, id, name, or color" }),
                    { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
                );
            }
            const existing = await kv.get<EventType>(["event_types", endpoint, id]);
            if (!existing.value) {
                return new Response(
                    JSON.stringify({ error: "Event type not found" }),
                    { status: 404, headers: { ...cors, "Content-Type": "application/json" } },
                );
            }
            const eventType: EventType = { id, name, color };
            await kv.set(["event_types", endpoint, id], eventType);
            return new Response(
                JSON.stringify(eventType),
                { headers: { ...cors, "Content-Type": "application/json" } },
            );
        } catch {
            return new Response(
                JSON.stringify({ error: "Invalid JSON body" }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
            );
        }
    }

    // -------------------------------------------------------------------------
    // DELETE /event-types — delete an event type and cascade-delete dates/times
    // Body: { endpoint, id }
    // -------------------------------------------------------------------------
    if (req.method === "DELETE" && url.pathname === "/event-types") {
        try {
            const body = await req.json();
            const { endpoint, id } = body as { endpoint?: string; id?: string };
            if (!endpoint || !id) {
                return new Response(
                    JSON.stringify({ error: "Missing endpoint or id" }),
                    { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
                );
            }
            await kv.delete(["event_types", endpoint, id]);
            await deleteEventDates(kv, endpoint, id);
            await deleteEventTimes(kv, endpoint, id);
            return new Response(
                JSON.stringify({ ok: true }),
                { headers: { ...cors, "Content-Type": "application/json" } },
            );
        } catch {
            return new Response(
                JSON.stringify({ error: "Invalid JSON body" }),
                { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
            );
        }
    }

    return null;
}
