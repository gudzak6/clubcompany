# Office World MVP

Phase 1 monorepo setup for:

- React + Vite + Phaser client
- Colyseus + Node.js server
- Shared TypeScript package
- Prisma + PostgreSQL configuration

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start PostgreSQL:

   ```bash
   npm run db:up
   ```

3. Create database tables:

   ```bash
   npm --workspace server run db:push
   ```

4. Run client and server together:

   ```bash
   npm run dev
   ```

## Local Postgres Fallback (No Docker / Neon blocked)

If outbound access to Neon on port 5432 is blocked, use local PostgreSQL.

1. Start local PostgreSQL service:

   ```bash
   npm run db:local:start
   ```

2. Switch server env to local database:

   ```bash
   npm run env:server:local
   ```

3. Create database role and database if needed:

   ```bash
   psql -d postgres -c "CREATE ROLE office_world WITH LOGIN PASSWORD 'office_world';"
   psql -d postgres -c "ALTER ROLE office_world CREATEDB;"
   psql -d postgres -c "CREATE DATABASE office_world OWNER office_world;"
   ```

4. Push Prisma schema and generate client:

   ```bash
   npm --workspace server run db:push
   npm --workspace server run db:generate
   ```

## Railway Deployment Note

If Railway logs show `The table public.User does not exist`, your app is connected but Prisma schema has not been applied to the deployed DATABASE_URL.

Run one of these against Railway database before starting the server:

```bash
npx prisma db push
```

or, if you are using migrations:

```bash
npx prisma migrate deploy
```

The Docker container in this repo now starts the Node server (not just static SPA hosting) and runs this automatically on boot:

```bash
npx prisma db push --schema server/prisma/schema.prisma
```

Required Railway variables:

- `DATABASE_URL`: your Neon Postgres connection string
- `CLIENT_URL`: your public app URL (used by CORS)
- `PORT`: provided by Railway (do not hardcode)

If logs are wired correctly, you should see:

- `[server][listening] ...`
- `[server][prisma_connected] ...`
- `[server][db_schema_ok] ...`

## Apps

- Client: http://localhost:5173
- Server HTTP: http://localhost:2567/health
- Colyseus WebSocket: ws://localhost:2567
