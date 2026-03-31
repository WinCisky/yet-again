# yet-again

A minimal PWA that receives native push notifications at predefined dates and times.

## Architecture

```
┌─────────────────────────┐         ┌─────────────────────────┐
│   GitHub Pages (PWA)    │         │   Deno Deploy (Server)  │
│                         │         │                         │
│  docs/index.html        │         │  server/server.ts       │
│  docs/app.js       ◄────┼─────────┼─ GET /vapid-key        │
│  docs/sw.js             │  Push   │  POST /subscribe        │
│  docs/manifest.json     │◄────────┼─ Deno.cron (every min) │
│                         │         │  const NOTIFICATIONS    │
└─────────────────────────┘         └─────────────────────────┘
```

### How it works

1. The **server** (`server/server.ts`) holds a `NOTIFICATIONS` array with hardcoded date/time + message entries.
2. The client (PWA) visits the page, clicks **Enable Notifications**, which:
   - Asks the browser for notification permission
   - Registers the service worker
   - Fetches the VAPID public key from the server
   - Subscribes to Web Push and sends the subscription to `POST /subscribe`
3. The server runs `Deno.cron` every minute; when a notification's time arrives it calls `webpush.sendNotification()` for every stored subscriber.
4. The service worker wakes up, receives the push event, and calls `self.registration.showNotification()` — even if the browser tab is closed.

## File structure

```
yet-again/
├── README.md
├── server/
│   └── server.ts        ← Deno Deploy server
└── docs/                ← GitHub Pages (served at /yet-again/)
    ├── index.html
    ├── app.js
    ├── sw.js
    └── manifest.json
```

---

## Setup

### 1. Generate VAPID keys

VAPID keys authenticate your server with browser push services. Generate them once:

```bash
npx web-push generate-vapid-keys
```

Copy the output — you will need both the **public** and **private** keys.

### 2. Deploy the server to Deno Deploy

1. Go to [dash.deno.com](https://dash.deno.com) and create a new project.
2. Link it to this repository and set the entry point to `server/server.ts`.
3. In the project's **Settings → Environment Variables**, add:

   | Name               | Value                                      |
   |--------------------|--------------------------------------------|
   | `VAPID_PUBLIC_KEY` | the public key from step 1                 |
   | `VAPID_PRIVATE_KEY`| the private key from step 1                |
   | `VAPID_SUBJECT`    | `mailto:you@example.com` (your contact)    |

4. Note your deployment URL, e.g. `https://your-project.deno.dev`.

### 3. Update the client with your server URL

Open `docs/app.js` and update the `SERVER_URL` constant at the top:

```js
const SERVER_URL = "https://your-project.deno.dev";
```

Commit and push the change.

### 4. Enable GitHub Pages

1. Go to **Settings → Pages** in this repository.
2. Set **Source** to `Deploy from a branch`.
3. Choose `main` branch and `/docs` folder.
4. Save — the PWA will be live at `https://wincisky.github.io/yet-again/`.

### 5. Customise the notification schedule

Edit the `NOTIFICATIONS` array in `server/server.ts`:

```ts
const NOTIFICATIONS = [
  { date: "2026-04-01T09:00:00Z", title: "Morning Reminder", body: "Time to start your day!" },
  { date: "2026-04-01T12:00:00Z", title: "Lunch Break",      body: "Don't forget to eat!" },
  { date: "2026-04-01T18:00:00Z", title: "Evening Check-in", body: "How was your day?" },
];
```

All `date` values must be ISO 8601 UTC strings. The cron job checks every minute, so notifications fire within one minute of the specified time.

> **Note:** Subscriptions are stored in memory and are lost when the server restarts.
> For a production setup, replace the in-memory `Set` with [Deno KV](https://deno.com/kv).

---

## Local development

### Run the server locally

```bash
deno run --allow-net --allow-env server/server.ts
```

Set the required env vars first (or use a `.env` file with `--env`):

```bash
export VAPID_PUBLIC_KEY="..."
export VAPID_PRIVATE_KEY="..."
export VAPID_SUBJECT="mailto:you@example.com"
deno run --allow-net --allow-env server/server.ts
```

### Serve the client locally

```bash
# Using the Node.js serve package
npx serve docs/

# Or Python's built-in server
python3 -m http.server 8080 --directory docs/
```

Then open `http://localhost:3000` (or whichever port `serve` uses).

Update `SERVER_URL` in `docs/app.js` to `http://localhost:8000` (default Deno server port) while developing locally.

> Push notifications require HTTPS in production. For local testing you can use
> a tool like [ngrok](https://ngrok.com) to expose your local server over HTTPS.

---

## Deployment checklist

- [ ] VAPID keys generated and stored as env vars on Deno Deploy
- [ ] `SERVER_URL` in `docs/app.js` updated to your Deno Deploy URL
- [ ] `server/server.ts` deployed on Deno Deploy with correct env vars
- [ ] GitHub Pages enabled on the `main` branch `/docs` folder
- [ ] `NOTIFICATIONS` array updated with your desired dates and messages
