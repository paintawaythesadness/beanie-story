# Beanie Editor

Beanie Editor is a small private web app for editing Twine or Twee story passages one at a time from a phone or tablet.

It is intentionally simple:

- Frontend: React + Vite
- API: Cloudflare Worker
- Storage: Cloudflare KV
- Auth: one shared password checked by the backend

This MVP avoids OAuth, databases, and desktop-heavy editing screens. You open a node by ID, edit it, save it, and quickly jump back to recent nodes.

## Project structure

```text
beanie-editor/
├─ frontend/          # React mobile web app
├─ worker/            # Cloudflare Worker API
├─ package.json       # Workspace scripts
├─ tsconfig.base.json
└─ README.md
```

## What it does

- Password-gated login screen
- Open a passage by exact ID
- Edit `name`, optional `displayTitle`, `content`, and `meta`
- Save one passage record at a time into Cloudflare KV
- Show a small recent-passages list
- Store a short-lived signed session token in `localStorage`
- Store unsaved local drafts per passage in `localStorage`

## Data model

Each passage is stored in KV as JSON under a URL-encoded key like `node:Ask%20the%20teens%20what%20happened`.

```json
{
  "id": "Ask the teens what happened",
  "name": "Ask the teens what happened",
  "content": "Passage body here...",
  "meta": {
    "editStatus": "default",
    "position": "123,456",
    "size": "100,100"
  },
  "modifiedAt": "2026-03-30T12:00:00Z"
}
```

`displayTitle` is optional and preserved when present, but it is not required.

Recent nodes are stored in a separate KV key:

```text
meta:recent
```

That value is just a JSON array of passage IDs, for example:

```json
["Ask the teens what happened", "Scene 1: The Case Begins", "OpenAnotherJar"]
```

## Auth design

This app uses a deliberately simple auth model.

1. The user submits a password to `POST /api/login`
2. The Worker compares it to the `EDITOR_PASSWORD` secret
3. If correct, the Worker returns a signed session token with an expiry time
4. The frontend stores that token in `localStorage`
5. Protected API routes require `Authorization: Bearer <token>`

This is not enterprise auth. It is meant for a private low-traffic personal tool. The tradeoff is simplicity over advanced account management.

## Requirements

Before starting:

- Node.js 20+
- npm 10+
- A Cloudflare account
- Wrangler installed through project dependencies

## Install dependencies

From the repo root:

```bash
npm install
```

## Create the KV namespace

Run these commands:

```bash
npx wrangler kv namespace create EDITOR_KV
npx wrangler kv namespace create EDITOR_KV --preview
```

Cloudflare will print namespace IDs. Copy those IDs into `worker/wrangler.toml`:

```toml
kv_namespaces = [
  { binding = "EDITOR_KV", id = "your-production-id", preview_id = "your-preview-id" }
]
```

## Set Worker secrets

From the `worker/` directory, set the two required secrets:

```bash
npx wrangler secret put EDITOR_PASSWORD
npx wrangler secret put AUTH_SECRET
```

Use:

- `EDITOR_PASSWORD`: the password you will type into the app
- `AUTH_SECRET`: a long random string used to sign session tokens

Example `AUTH_SECRET` value:

```text
use-a-long-random-string-here-not-a-short-word
```

## Local development

You will run the frontend and Worker in two terminals.

### Terminal 1: run the Worker

```bash
cd worker
npx wrangler dev
```

The API will usually run at:

```text
http://127.0.0.1:8787
```

For local secrets, create `worker/.dev.vars`:

```text
EDITOR_PASSWORD=your-local-password
AUTH_SECRET=your-local-random-secret
```

### Terminal 2: run the frontend

```bash
cd frontend
npm run dev
```

By default the frontend talks to `http://127.0.0.1:8787`.

If you want a different API URL, create `frontend/.env.local`:

```text
VITE_API_BASE_URL=http://127.0.0.1:8787
```

## Build locally

From the repo root:

```bash
npm run build
```

That runs the frontend build and TypeScript checks for the Worker.

## Deploy the Worker

From the `worker/` directory:

```bash
npx wrangler deploy
```

After deploy, you will get a Worker URL such as:

```text
https://beanie-editor-api.your-subdomain.workers.dev
```

If your frontend will use that URL directly, set:

- `ALLOWED_ORIGINS` in `worker/wrangler.toml` to include your frontend origin
- `VITE_API_BASE_URL` in the frontend Pages project to your Worker URL

Example:

```toml
[vars]
ALLOWED_ORIGINS = "http://localhost:5173,https://beanie-editor.pages.dev"
```

## Deploy the frontend to Cloudflare Pages

Create a new Cloudflare Pages project pointing at this repo.

Use these settings:

- Framework preset: `Vite`
- Root directory: `frontend`
- Build command: `npm run build`
- Build output directory: `dist`

Add this environment variable in Pages:

```text
VITE_API_BASE_URL=https://your-worker-name.your-subdomain.workers.dev
```

Then deploy.

## Suggested deployment model

The easiest beginner-friendly setup is:

- Cloudflare Pages hosts the React app
- Cloudflare Worker hosts the API
- Cloudflare KV stores the nodes

This keeps the architecture simple and cheap on low traffic.

## API endpoints

- `POST /api/login`
- `POST /api/logout`
- `GET /api/node/:id`
- `PUT /api/node/:id`
- `GET /api/recent`

## Passage ID rules

Passage IDs are trimmed but otherwise preserved exactly. Spaces and punctuation are allowed.

## Notes for future improvements

Not included in this MVP:

- importing or exporting `.twee`
- Twine parsing
- multiple users
- collaborative editing
- version history
- attachments

Reason: the goal here is a minimal deployable private editor, not a full content platform.

## Helpful commands

From the repo root:

```bash
npm run dev:worker
npm run dev:frontend
npm run build
npm run typecheck
```

## Security tradeoffs

This app is intentionally simple. That is useful here, but you should understand the limits:

- It uses one shared password, not user accounts
- Session tokens are stored in `localStorage`
- There is no server-side session revocation list
- `POST /api/logout` is mostly a client-side convenience

For a personal or family editing tool on very low traffic, this is usually reasonable. For a team product or sensitive data, use stronger auth.
