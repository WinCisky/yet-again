import { PushSubscriptionLike } from "../types.ts";

export async function handleSubscription(
  req: Request,
  url: URL,
  cors: Record<string, string>,
  kv: Deno.Kv,
  vapidPublicKey: string,
): Promise<Response | null> {
  // GET /vapid-key — return the VAPID public key so the client can subscribe
  if (req.method === "GET" && url.pathname === "/vapid-key") {
    return new Response(
      JSON.stringify({ publicKey: vapidPublicKey }),
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

  // DELETE /subscribe — remove a push subscription
  if (req.method === "DELETE" && url.pathname === "/subscribe") {
    try {
      const body = await req.json();
      if (
        typeof body !== "object" ||
        body === null ||
        !("endpoint" in body) ||
        typeof (body as PushSubscriptionLike).endpoint !== "string"
      ) {
        return new Response(
          JSON.stringify({ error: "Invalid payload, endpoint required" }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      const { endpoint } = body as PushSubscriptionLike;
      await kv.delete(["subscriptions", endpoint]);
      console.log(`Subscription deleted from KV: ${endpoint}`);

      return new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    } catch (err) {
      console.error("Failed to delete subscription:", err);
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
  }

  return null;
}
