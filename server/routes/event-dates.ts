export async function deleteEventDates(kv: Deno.Kv, endpoint: string, eventTypeId: string): Promise<void> {
    for await (const entry of kv.list({ prefix: ["event_dates", endpoint, eventTypeId] })) {
        await kv.delete(entry.key);
    }
}

export async function handleEventDates(
    req: Request,
    url: URL,
    cors: Record<string, string>,
    kv: Deno.Kv,
): Promise<Response | null> {
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
            await deleteEventDates(kv, endpoint, eventTypeId);
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

    return null;
}
