# Production Room Transition Runbook

## Goal

Ensure production is running the real Node + Colyseus backend (not static-only), then validate Stage 2 transition behavior:

- persistent client reuse
- single in-flight transition
- safe rollback on failed join
- no duplicate room joins/listeners

## 1) Confirm runtime mode in production

Run these checks against your deployed URL.

1. Check health endpoint:

```bash
curl -i https://<your-domain>/health
```

Expected:

- HTTP 200
- JSON body with `{"ok":true,"service":"office-world-server"}`

If this fails or returns HTML, production is likely static-only.

2. Check startup logs for Node server signatures:

Expected log fragments:

- `[server][rooms_registered] rooms=main_office,my_office,shop,coffee_bar,arcade,rooftop`
- `[server][listening] url=http://0.0.0.0:<port>`
- `[server][prisma_connected] Prisma connection established`

If logs only show:

- `Accepting connections at http://localhost:3000`

then you are running static `serve` and multiplayer room transitions will fail.

## 2) Force correct container startup

Your Dockerfile already has the correct CMD:

```sh
npx prisma db push --schema server/prisma/schema.prisma && node --experimental-specifier-resolution=node server/dist/index.js
```

In your deployment platform, ensure there is no custom Start Command overriding this with:

- `npm run start:spa`
- `serve -s dist ...`

## 3) Required production environment variables

Set and verify:

- `DATABASE_URL`
- `CLIENT_URL`
- `PORT`
- `NODE_ENV=production`

Client build var:

- `VITE_COLYSEUS_URL=wss://<your-backend-domain>`

Important:

- If frontend and backend are same origin, `VITE_COLYSEUS_URL` can still be set explicitly to avoid ambiguity.

## 4) Stage 2 client checks (in browser)

Use Player Panel diagnostics.

Expected after the latest changes:

- `Server Health: ok`
- `Transition: preparing -> leaving -> joining -> switching -> ready`
- `Active Endpoint` remains stable while moving room-to-room

Failure indicators:

- `Server Health: failed`
- repeated `Transition: failed`
- endpoint flapping every room change

## 5) My Office functional checks

1. From Main Office, walk into My Office portal.
2. Confirm room title changes and local player appears.
3. Confirm no blank screen on failure.
4. If join fails, confirm rollback to previous room happens.

Expected logs:

- Client: `[client][connect_timing] room=my_office joinLatencyMs=... firstStateLatencyMs=...`
- Server: `[room][join_start] room=my_office ...`

## 6) Latency verification checklist

For each route pair (main_office -> coffee_bar, my_office, arcade, rooftop):

1. Record Join Latency and First State from the panel.
2. Repeat transition 5 times.
3. Verify there are no duplicate reconnect storms.
4. Verify transitions after first join feel faster and stable.

## 7) If issues persist

1. Capture these logs together:
   - server startup logs
   - room join/leave logs
   - browser console `[client][connect_timing]`
2. Verify production image tag matches latest commit containing Stage 2 changes.
3. Verify deployment actually rebuilt client bundle and server dist from latest source.

## 8) Rollback safety

If release is unstable:

1. Roll back deployment image to previous known-good tag.
2. Keep database schema unchanged (no destructive migration in this stage).
3. Re-run this runbook before next rollout.
