# Club Studio × FrontDesk AI

A boutique-fitness website ("Club Studio · Powered by FrontDesk AI") with a **staff console** that shows
booking requests arriving **live** from a Retell voice agent. The website, the database and the API all
live in this repo. The voice agent itself is configured separately in Retell.

> **Independent class project.** Not affiliated with, endorsed by or sponsored by Club Studio, Club Studio
> Fitness or Fitness International. Facts were gathered from public pages on Nov 6, 2026 and may have
> changed. **Seat availability is simulated.** The source site's terms limit reuse of its content, so keep
> this repo private / within the team.

---

## 1. Run it (60 seconds)

Requires **Node 22 or newer** (it uses Node's built-in SQLite). There is nothing to `npm install`.

```bash
npm start
```

| What            | URL                                  |
|-----------------|--------------------------------------|
| Customer site   | http://localhost:3000                |
| Staff console   | http://localhost:3000/#/staff        |

The **Customer | Staff** switch in the top-right corner of every page flips between the two views.

Optional settings go in a `.env` file (copy `.env.example`) or in your host's environment variables:

| Variable          | What it does                                                                 |
|-------------------|------------------------------------------------------------------------------|
| `PORT`            | Port to listen on (default 3000; hosts set this for you)                     |
| `FRONTDESK_PHONE` | The number callers dial to reach the agent. Shown on the site. Defaults to `(860) 750-8999` (set in `src/config.js`); the env var overrides it |
| `API_KEY`         | If set, `POST /api/bookings`, `/api/availability` and `/api/retell/webhook` require it |
| `DB_PATH`         | SQLite file location (default `./data/frontdesk.db`)                         |

The database is created and filled automatically on first start (classes, seat counts, 12 sample requests,
and an activity feed). If the file is ever deleted or wiped by a host restart, it simply re-seeds.

---

## 2. Connecting the Retell agent (for the teammate)

Retell reaches this server over the internet, so it needs a **public HTTPS URL** (see section 4).

### Render web service

Deploy this repository as a Node web service with `npm install` as the build command, `npm start` as the start command, and `/api/health` as the health check. Set `API_KEY` and `STAFF_PASSWORD` as environment variables in Render. Leave `RETELL_PORT` unset. Render supplies `PORT` and the app listens on it for both the website and the Retell tools.

In Retell, use the Render origin with `POST /api/availability` and `POST /api/bookings`, passing the `API_KEY` value in an `x-api-key` header. Open `/#/staff/requests` and sign in with the staff passphrase. Open the dashboard before a rehearsal to wake a Free instance. Its SQLite data is temporary and will be reseeded after a restart or spin-down.

### Local staff dashboard with a Retell-only tunnel

Set `API_KEY` to a generated secret and `RETELL_PORT=3911` in `.env`, then run `npm start`. Open the staff dashboard at `http://localhost:3000/#/staff`. Point the HTTPS tunnel at `http://127.0.0.1:3911`. This listener accepts the two tool POSTs with `x-api-key`. The dashboard, live event stream, and reset stay on the local website port.

Use an unpublished Single Prompt copy for rehearsal. Copy the tool definitions from `retell/functions.json` with the tunnel origin as the base URL. Add `x-api-key` to both tools and leave **Payload: args only** off so retries keep the Retell call ID. Add `retell/intake-instructions.txt` and remove the old FAQ-only lines that forbid those two operations. Leave the optional webhook unset. Update both function URLs when a temporary tunnel hostname changes.

Use a fictional name and callback number. Choose a future class from the site, ask the agent to check it, confirm the details, and verify that one pending request appears. Confirm it from the dashboard and check that the simulated seat count drops by one. Test a caller correction and a declined request. Use the dashboard’s labeled simulation if the connection fails during the presentation.

### Add a custom function to the single-prompt agent

In the Retell dashboard: *Agent → Functions → Add → Custom Function*.
(The staff console's **Demo tools** page shows these exact values with Copy buttons.)

| Field        | Value |
|--------------|-------|
| Name         | `submit_booking_request` |
| Description  | Save the caller's class booking request or question for the Club Studio staff. Call it once you have the caller's name and what they want. This is a request only; never tell the caller it is confirmed. |
| Method / URL | `POST` `https://YOUR-PUBLIC-URL/api/bookings` |
| Headers      | *(only if you set `API_KEY`)* `x-api-key: YOUR_KEY` |
| Parameters   | JSON schema below |

Either Retell body style works: with **"Payload: args only"** on, the body is just the arguments; with it off,
Retell sends `{ "name", "args", "call" }`. The server accepts both, and when `call.call_id` and
`call.from_number` are present it saves them (the phone number fills in if the agent didn't collect one).

```json
{
  "type": "object",
  "required": ["caller_name"],
  "properties": {
    "caller_name":      { "type": "string", "description": "Caller's name" },
    "caller_phone":     { "type": "string", "description": "Best callback number" },
    "class_name":       { "type": "string", "description": "Class requested, e.g. Reform, CS4, Ride, Box x Bags, Hot Pilates, Yoga Flow, Yoga Restore. Use the caller's words if unsure." },
    "class_date":       { "type": "string", "description": "Class date as YYYY-MM-DD" },
    "class_time":       { "type": "string", "description": "Class start time, e.g. 9:15 AM" },
    "is_member":        { "type": "string", "enum": ["yes", "no"] },
    "membership_tier":  { "type": "string", "description": "Standard, Standard Plus or Premier, if a member" },
    "experience_level": { "type": "string" },
    "goals":            { "type": "string" },
    "questions_asked":  { "type": "string", "description": "Questions the caller asked that staff should follow up on" },
    "call_summary":     { "type": "string", "description": "One or two sentences summarizing the call" },
    "needs_followup":   { "type": "string", "enum": ["yes", "no"] },
    "followup_reason":  { "type": "string" }
  }
}
```

### What the server does with a request

- **Matches the class for you.** Spoken names work ("spin" → Ride, "reformer" → Reform, "boxing" → Box x Bags).
  Dates accept `2026-12-03`, `12/3`, `Dec 3`, `tomorrow`, `Saturday`. Times accept `9:15 AM`, `9am`, `21:15`.
- **Saves a *pending request*, never a confirmed booking.** Staff confirm it in the console, and only then
  does the seat count drop. (Confirming a full class puts the caller on the waitlist.)
- **Replies with a `message` the agent can read aloud**, plus `class` details and seats left. Example:

```json
{
  "success": true,
  "request_id": "REQ-20261203-0004",
  "request_type": "booking",
  "status": "pending",
  "message": "Saved a booking request for Ride on Saturday, December 5 at 9:15 AM. There are 3 spots left right now. A staff member will confirm it; this is a request, not a confirmed booking.",
  "class": { "class_id": "SW-20261205-0915-ride", "class_name": "Ride", "start_time": "9:15 AM", "seats_left": 3 }
}
```

- **Handles ambiguity.** If several classes match ("boxing on Saturday" has two times), the reply has
  `"success": false, "needs_clarification": true` and an `options` list. Tell the agent to ask the caller
  which one, then call the function again. **Calls with the same `call_id` update the same request**, so you
  never get duplicates.
- **Past or holiday classes** (Thanksgiving, Christmas Eve/Day, New Year's Eve are unconfirmed in the data)
  are saved as an *inquiry* flagged for follow-up, and the reply says why.
- A missing `caller_name` returns `success: false` and asks the agent to collect it.

### Suggested lines for the agent prompt

> After you have the caller's name, phone number, class, date and time, call `submit_booking_request`.
> Convert dates to YYYY-MM-DD using today's date. Read the function's `message` back to the caller in your
> own words. **Never say the booking is confirmed.** Say the team will confirm it. If the result has
> `needs_clarification`, ask the caller to choose from `options`, then call the function again.
> If the caller asks something you can't answer from the knowledge base (parking, holiday hours, mat
> rental, drop-in prices), call the function with `questions_asked` filled in and `needs_followup: "yes"`.

The knowledge-base documents for the agent are in `data/rag/` (each `## ` section is one chunk) and
`data/fact_sheet.csv` is a 37-answer key for grading test calls.

### Optional extras

| Endpoint | Use |
|----------|-----|
| `GET /api/availability?class_name=Reform&date=2026-12-05&time=9:00 AM` | A second custom function so the agent can check seats *before* offering a class. Returns `result` (`matched`, `ambiguous`, `none`, `past`, `holiday`) and the class. |
| `POST /api/retell/webhook` | Set as the agent's webhook URL. `call_started` puts an **"Incoming call"** banner on the staff screen; `call_analyzed` attaches Retell's call summary to the request. Always replies 204. (Signature verification is not implemented: this is a dev build.) |

If `API_KEY` is set, the webhook can't send custom headers, so use `...?api_key=YOUR_KEY` in its URL.

---

## 3. Demo day

**Before** (the day before, and again 30 minutes before):

1. Start the server and get a public URL (section 4). Open `https://YOUR-URL/api/health`. It should say `{"ok":true,...}`.
2. Paste that URL into the Retell function (and webhook, if used). Place a real test call.
3. If you are on a free host, **wake it up** by opening the site a few minutes before you present, since free servers sleep when idle.
4. Staff console → **Demo tools → Reset demo data**. This restores seats, sample requests and the feed. Don't redeploy after this.
5. Set `FRONTDESK_PHONE` so the real number shows on the site.
6. Optional: press the **expand** button in the staff header for larger text on a projector, and the **sparkle** button for a sound when a request arrives (the browser needs one click first).

**On stage:**

1. Show the **Customer** view (classes, membership, FAQ).
2. Click **Staff** in the corner. Leave the **Overview** page open.
3. Make the call. The **Incoming call** banner (if the webhook is on), then the **New booking request** banner, a highlighted **NEW** row, the counters ticking up and a line in **Live activity**.
4. Click the row. In the drawer, **Confirm booking** and watch the seat count change (or open **Schedule**).

**Backup if the phone, Wi-Fi or tunnel fails:** Staff → **Demo tools → Simulate an incoming call**. It sends the same request the agent would, clearly tagged *Simulated*. Don't present it as a real call.

---

## 4. Getting a public URL

| Option | Notes |
|--------|-------|
| **Hosted (Render, Railway, Fly.io…)** | Connect this repo, start command `npm start`, Node 22+. Most reliable. Free tiers can sleep when idle and may wipe local files on restart (the app re-seeds, but saved requests are lost). |
| **GitHub Codespaces** | Run `npm start`, then in the Ports tab set port 3000 to **Public**. Works only while the Codespace runs; the URL changes if you recreate it. |
| **Laptop + tunnel (ngrok / Cloudflare Tunnel)** | `npm start`, then `ngrok http 3000`. The free URL usually changes each time you restart the tunnel, so update Retell. Try it on the actual network first; some campus Wi-Fi blocks tunnels. A phone hotspot is a good fallback. |

GitHub Pages **cannot** host this (static files only, no server or database).

---

## 5. API reference

| Method & path | Auth | Purpose |
|---------------|------|---------|
| `POST /api/bookings` | key* | **Retell custom function.** Create or update (by `call_id`) a request. |
| `GET /api/availability` | key* | Check a class (optional agent function). |
| `POST /api/retell/webhook` | key* | Retell call events (optional). |
| `POST /api/website/requests` | none | The website's "Request spot" form (same logic, source `website`). |
| `GET /api/requests`, `GET /api/requests/:id` | none | List/read requests. Filters: `status`, `type`, `q`, `followup=yes`. |
| `PATCH /api/requests/:id` | none | Staff update: `{status, staff_notes, needs_followup}`. Status: `pending`, `confirmed`, `waitlisted`, `cancelled`, `resolved`. Adjusts seats. |
| `GET /api/classes`, `/api/classes/:id`, `/api/catalog` | none | Schedule (`from`, `to`, `type`, `studio`) and class types. |
| `GET /api/stats`, `/api/activity` | none | Dashboard numbers and the feed. |
| `GET /api/stream` | none | Server-Sent Events: `request.created`, `request.updated`, `class.updated`, `activity`, `reset`. |
| `POST /api/simulate` | none | `{kind: booking\|full\|inquiry, instant?: true}` |
| `POST /api/admin/reset` | none | Restore the demo data. |
| `GET /api/health`, `/api/config` | none | Health check; phone, today's date, whether a key is required. |

\* only enforced when `API_KEY` is set. Send it as `x-api-key`, `Authorization: Bearer …` or `?api_key=…`.
The staff console and its endpoints are **open access** (development build), so don't put real customer data in it.

### Database (SQLite, `node:sqlite`)

- `requests`: one row per request: `request_id`, `created_at`, `request_type` (`booking`/`inquiry`), `caller_name`,
  `caller_phone`, `is_member`, `membership_tier`, `class_id`, `class_name`, `class_start_iso`,
  `seat_status_at_request`, `experience_level`, `goals`, `questions_asked`, `call_summary`, `needs_followup`,
  `followup_reason`, `status`, `staff_notes`, `source` (`voice_agent`/`website`/`simulation`), `call_id`.
  (Columns follow `data/booking_requests_template.csv`.)
- `classes`: 1,208 classes Nov 6 – Dec 31, 2026 with simulated `seats_left` and `waitlist`.
- `catalog`: 17 class types (intensity, heat, gear, spoken aliases).
- `activity`: the live feed.

Connect your own tools to the **API**, not the file. A direct DB connection only works on the machine running the server.

---

## 6. Project structure

```
server.js            HTTP server (static files + API)
src/config.js        env + .env loader      src/db.js       schema, seeding, queries
src/service.js       request logic, simulation, webhook      src/matcher.js  spoken class/date/time → class
src/api.js           routes                 src/events.js   live updates (SSE)      src/time.js  Eastern-time helpers
public/              the site: index.html, css/, js/ (customer pages + staff console), img/ (drop photos here)
data/                schedule + catalog CSVs, rag/ knowledge base, fact_sheet.csv, sources/
tests/api.test.js    npm test: 13 API tests
scripts/reset.js     npm run reset
```

Photos: see `public/img/README.md`. Generated artwork is used until you add some.

## 7. Data notes

- Class data is the team's `frontdesk-data` pack: week 1 (Nov 6–12) is the observed real schedule; later weeks repeat
  that pattern; **seat counts are simulated**. Four demo-pinned classes (Nov 13–15) are in the past now: past classes
  show greyed out and can't be requested.
- Not published by the club, and shown as "confirm with the club" rather than guessed: parking, holiday hours,
  childcare, mat rental, class sizes, drop-in prices, personal-training and recovery pricing, which free-trial offer applies.
- Where each fact came from: `data/sources/source-ledger.md` (good for a data-sources slide).

## 8. Troubleshooting

- **"Live" chip says Reconnecting** — the browser lost the stream; the page polls every 4 s meanwhile and recovers on its own.
- **Retell says the function failed** — open `https://YOUR-URL/api/health` from your phone; if it doesn't load, it's the URL/tunnel/sleeping host. A 401 means `API_KEY` is set but the header is missing.
- **Request saved as an inquiry instead of a booking** — read its *Follow-up* reason in the drawer (class not matched, already started, or holiday).
- **Port in use** — set `PORT=3001`.
- `npm test` runs the API tests (they start their own throwaway servers and databases).
