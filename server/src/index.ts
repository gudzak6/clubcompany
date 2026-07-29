import "dotenv/config";
import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MainOfficeRoom } from "./rooms/MainOfficeRoom.js";
import { MyOfficeRoom } from "./rooms/MyOfficeRoom.js";
import { CoffeeBarRoom } from "./rooms/CoffeeBarRoom.js";
import { ArcadeRoom } from "./rooms/ArcadeRoom.js";
import { RooftopRoom } from "./rooms/RooftopRoom.js";
import { ShopRoom } from "./rooms/ShopRoom.js";
import { prisma } from "./lib/prisma.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const clientUrl = process.env.CLIENT_URL ?? "http://localhost:5173";
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(currentDir, "../../dist");

const app = express();
app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json());

const REGISTERED_ROOMS = ["main_office", "my_office", "shop", "coffee_bar", "arcade", "rooftop"] as const;

function isMissingFwEmailColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const withCode = error as { code?: unknown; message?: unknown };
  const code = typeof withCode.code === "string" ? withCode.code : "";
  const message = typeof withCode.message === "string" ? withCode.message : "";

  return code === "P2022" && /fwEmail/i.test(message);
}

if (existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
}

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "office-world-server",
    rooms: REGISTERED_ROOMS,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "unknown"
  });
});

app.post("/api/users/fw-email", async (req, res) => {
  const playerId = typeof req.body?.playerId === "string" ? req.body.playerId.trim() : "";
  const emailRaw = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const displayNameRaw = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
  const email = emailRaw.toLowerCase();
  const displayName = displayNameRaw ? displayNameRaw.slice(0, 20) : "Coworker";

  if (!playerId) {
    res.status(400).json({ ok: false, error: "playerId is required" });
    return;
  }

  if (!email) {
    res.status(400).json({ ok: false, error: "email is required" });
    return;
  }

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email);
  if (!isValidEmail) {
    res.status(400).json({ ok: false, error: "email must be a valid address" });
    return;
  }

  try {
    try {
      const user = await prisma.user.upsert({
        where: { playerId },
        create: {
          playerId,
          fwEmail: email,
          displayName,
          department: "engineering"
        },
        update: {
          fwEmail: email
        },
        select: {
          id: true,
          playerId: true,
          fwEmail: true
        }
      });

      res.status(200).json({ ok: true, user });
      return;
    } catch (error) {
      if (!isMissingFwEmailColumnError(error)) {
        throw error;
      }

      console.warn("[fw-email] Missing User.fwEmail column; saving user without fwEmail");

      const fallbackUser = await prisma.user.upsert({
        where: { playerId },
        create: {
          playerId,
          displayName,
          department: "engineering"
        },
        update: {
          displayName
        },
        select: {
          id: true,
          playerId: true
        }
      });

      res.status(200).json({ ok: true, user: { ...fallbackUser, fwEmail: null }, degraded: "missing_fwEmail_column" });
    }
  } catch (error) {
    console.error("Failed to persist FW email:", error);
    res.status(500).json({ ok: false, error: "Unable to save email right now" });
  }
});

if (existsSync(clientDistPath)) {
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

const server = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server })
});

gameServer.define("main_office", MainOfficeRoom);
gameServer.define("my_office", MyOfficeRoom);
gameServer.define("shop", ShopRoom);
gameServer.define("coffee_bar", CoffeeBarRoom);
gameServer.define("arcade", ArcadeRoom);
gameServer.define("rooftop", RooftopRoom);

console.log(`[server][rooms_registered] rooms=${REGISTERED_ROOMS.join(",")}`);

void prisma
  .$connect()
  .then(async () => {
    console.log("[server][prisma_connected] Prisma connection established");

    try {
      const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT to_regclass('public."User"') IS NOT NULL as "exists"
      `;

      if (!result[0]?.exists) {
        console.error(
          "[server][db_schema_missing] Table public.User is missing in DATABASE_URL. " +
            "Run Prisma schema deployment on Railway (for example: `npx prisma db push` or `npx prisma migrate deploy`)."
        );
      } else {
        console.log("[server][db_schema_ok] Required Prisma tables detected");

        // Check for recently-added columns that may not yet be migrated
        const columnCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'User'
              AND column_name = 'fwEmail'
          ) as "exists"
        `;
        if (!columnCheck[0]?.exists) {
          console.error(
            "[server][db_column_missing] Column User.fwEmail is missing from the database. " +
              "Run `npx prisma db push` or `npx prisma migrate deploy` against the Railway DATABASE_URL to add it. " +
              "Progression persistence will be disabled until the column is added."
          );
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error(`[server][db_schema_check_failed] ${message}`);
    }
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`[server][prisma_connect_failed] ${message}`);
  });

server.listen(port, host, () => {
  console.log(
    `[server][listening] url=http://${host}:${port} clientUrl=${clientUrl} nodeEnv=${process.env.NODE_ENV ?? "unset"}`
  );
});
