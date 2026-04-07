# yet-again

A minimal PWA that receives native push notifications at predefined dates and times.

## Setup

### 1. Generate VAPID keys

VAPID keys authenticate your server with browser push services. Generate them once:

```bash
npx web-push generate-vapid-keys
```

## Local development

### Run the server locally

```bash
deno run --allow-net --env-file --allow-env --unstable-cron --unstable-kv server/server.ts
```

### Serve the client locally

```bash
cd docs
npx http-server -p 3000
```

Then open `http://localhost:3000` (or whichever port `serve` uses).

Update `SERVER_URL` in `docs/app.js` to `http://localhost:8000` (default Deno server port) while developing locally.

> Push notifications require HTTPS in production. For local testing you can use
> a tool like [ngrok](https://ngrok.com) to expose your local server over HTTPS.
