import { Client, Room } from "colyseus";
import { MapSchema, Schema, type } from "@colyseus/schema";
import { Prisma } from "@prisma/client";
import { RoomConfig } from "./roomConfigs.js";
import { prisma } from "../lib/prisma.js";

const MAP_WIDTH = 960;
const MAP_HEIGHT = 640;
const PLAYER_WIDTH = 24;
const PLAYER_HEIGHT = 28;
const HALF_PLAYER_WIDTH = PLAYER_WIDTH / 2;
const HALF_PLAYER_HEIGHT = PLAYER_HEIGHT / 2;
const PLAYER_SPEED = 180;
const PONG_PADDLE_SPEED = 330;
const PONG_PADDLE_HALF_HEIGHT = 44;
const PONG_LEFT_X = 168;
const PONG_RIGHT_X = 792;
const PONG_BALL_RADIUS = 8;
const PONG_MAX_SCORE = 5;
const PONG_MIN_VX = 190;
const PONG_MAX_VX = 260;
const PONG_MAX_VY = 180;

const MIN_X = 32 + HALF_PLAYER_WIDTH;
const MAX_X = 928 - HALF_PLAYER_WIDTH;
const MIN_Y = 32 + HALF_PLAYER_HEIGHT;
const MAX_Y = 608 - HALF_PLAYER_HEIGHT;

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MovePayload = {
  up?: boolean;
  down?: boolean;
  left?: boolean;
  right?: boolean;
};

type DancePayload = {
  dance?: string;
};

type EmotePayload = {
  emote?: string;
};

type ChatPayload = {
  message?: string;
};

type PongInputPayload = {
  up?: boolean;
  down?: boolean;
};

type DeskSlotKey = "deskStyle" | "chair" | "computer" | "plant" | "mug" | "smallDecoration";

type EquipDeskPayload = {
  slot?: DeskSlotKey;
  itemKey?: string;
};

type EquipPetPayload = {
  petKey?: string;
};

type BuyItemPayload = {
  itemKey?: string;
};

type DailySpinReward = {
  key: string;
  label: string;
  rarity: "common" | "uncommon" | "rare" | "epic";
  weight: number;
  coins?: number;
  xp?: number;
  itemKey?: string;
  petKey?: string;
};

const DESK_SLOT_KEYS: DeskSlotKey[] = ["deskStyle", "chair", "computer", "plant", "mug", "smallDecoration"];
const SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const WRITE_BEHIND_FLUSH_MS = Number(process.env.PROGRESSION_FLUSH_MS ?? 3000);
const DEFAULT_PET = "office_dog";
const DEFAULT_DESK_EQUIPPED: Record<DeskSlotKey, string> = {
  deskStyle: "starter_desk",
  chair: "starter_chair",
  computer: "starter_computer",
  plant: "starter_plant",
  mug: "starter_mug",
  smallDecoration: "starter_decor"
};

const SHOP_ITEMS: Array<{
  key: string;
  name: string;
  slot: DeskSlotKey;
  price: number;
  rarity: "common" | "uncommon" | "rare" | "epic";
}> = [
  { key: "starter_desk", name: "Starter Desk", slot: "deskStyle", price: 0, rarity: "common" },
  { key: "oak_desk", name: "Oak Desk", slot: "deskStyle", price: 120, rarity: "common" },
  { key: "glass_desk", name: "Glass Desk", slot: "deskStyle", price: 200, rarity: "uncommon" },
  { key: "neon_desk", name: "Neon Desk", slot: "deskStyle", price: 320, rarity: "rare" },
  { key: "starter_chair", name: "Starter Chair", slot: "chair", price: 0, rarity: "common" },
  { key: "ergo_chair", name: "Ergo Chair", slot: "chair", price: 90, rarity: "common" },
  { key: "racer_chair", name: "Racer Chair", slot: "chair", price: 180, rarity: "uncommon" },
  { key: "cloud_chair", name: "Cloud Chair", slot: "chair", price: 280, rarity: "rare" },
  { key: "starter_computer", name: "Starter Computer", slot: "computer", price: 0, rarity: "common" },
  { key: "dual_monitor", name: "Dual Monitor", slot: "computer", price: 140, rarity: "common" },
  { key: "holo_monitor", name: "Holo Monitor", slot: "computer", price: 260, rarity: "rare" },
  { key: "starter_plant", name: "Starter Plant", slot: "plant", price: 0, rarity: "common" },
  { key: "bonsai_plant", name: "Bonsai", slot: "plant", price: 80, rarity: "common" },
  { key: "pixel_cactus", name: "Pixel Cactus", slot: "plant", price: 160, rarity: "uncommon" },
  { key: "starter_mug", name: "Starter Mug", slot: "mug", price: 0, rarity: "common" },
  { key: "rocket_mug", name: "Rocket Mug", slot: "mug", price: 60, rarity: "common" },
  { key: "gold_mug", name: "Gold Mug", slot: "mug", price: 220, rarity: "rare" },
  { key: "starter_decor", name: "Starter Decor", slot: "smallDecoration", price: 0, rarity: "common" },
  { key: "tiny_lamp", name: "Tiny Lamp", slot: "smallDecoration", price: 100, rarity: "uncommon" },
  { key: "retro_cube", name: "Retro Cube", slot: "smallDecoration", price: 180, rarity: "rare" }
];

const PET_KEYS = ["office_dog", "office_cat", "tiny_robot", "pigeon", "otter", "fox_bot"] as const;

const DAILY_SPIN_REWARDS: DailySpinReward[] = [
  { key: "coins_30", label: "30 coins", rarity: "common", weight: 90, coins: 30 },
  { key: "coins_35", label: "35 coins", rarity: "common", weight: 88, coins: 35 },
  { key: "coins_40", label: "40 coins", rarity: "common", weight: 82, coins: 40 },
  { key: "coins_45", label: "45 coins", rarity: "common", weight: 78, coins: 45 },
  { key: "coins_50", label: "50 coins", rarity: "common", weight: 74, coins: 50 },
  { key: "coins_60", label: "60 coins", rarity: "uncommon", weight: 58, coins: 60 },
  { key: "coins_75", label: "75 coins", rarity: "uncommon", weight: 52, coins: 75 },
  { key: "coins_90", label: "90 coins", rarity: "uncommon", weight: 42, coins: 90 },
  { key: "coins_120", label: "120 coins", rarity: "rare", weight: 22, coins: 120 },
  { key: "coins_160", label: "160 coins", rarity: "epic", weight: 10, coins: 160 },
  { key: "xp_15", label: "15 XP", rarity: "common", weight: 72, xp: 15 },
  { key: "xp_20", label: "20 XP", rarity: "common", weight: 68, xp: 20 },
  { key: "xp_25", label: "25 XP", rarity: "uncommon", weight: 54, xp: 25 },
  { key: "xp_35", label: "35 XP", rarity: "uncommon", weight: 48, xp: 35 },
  { key: "xp_50", label: "50 XP", rarity: "rare", weight: 24, xp: 50 },
  { key: "item_oak_desk", label: "Oak Desk", rarity: "uncommon", weight: 32, itemKey: "oak_desk" },
  { key: "item_glass_desk", label: "Glass Desk", rarity: "rare", weight: 18, itemKey: "glass_desk" },
  { key: "item_neon_desk", label: "Neon Desk", rarity: "epic", weight: 8, itemKey: "neon_desk" },
  { key: "item_ergo_chair", label: "Ergo Chair", rarity: "common", weight: 36, itemKey: "ergo_chair" },
  { key: "item_racer_chair", label: "Racer Chair", rarity: "rare", weight: 16, itemKey: "racer_chair" },
  { key: "item_dual_monitor", label: "Dual Monitor", rarity: "uncommon", weight: 28, itemKey: "dual_monitor" },
  { key: "item_holo_monitor", label: "Holo Monitor", rarity: "epic", weight: 7, itemKey: "holo_monitor" },
  { key: "item_bonsai", label: "Bonsai", rarity: "common", weight: 34, itemKey: "bonsai_plant" },
  { key: "item_pixel_cactus", label: "Pixel Cactus", rarity: "uncommon", weight: 26, itemKey: "pixel_cactus" },
  { key: "item_rocket_mug", label: "Rocket Mug", rarity: "common", weight: 34, itemKey: "rocket_mug" },
  { key: "item_gold_mug", label: "Gold Mug", rarity: "rare", weight: 14, itemKey: "gold_mug" },
  { key: "item_tiny_lamp", label: "Tiny Lamp", rarity: "uncommon", weight: 22, itemKey: "tiny_lamp" },
  { key: "item_retro_cube", label: "Retro Cube", rarity: "rare", weight: 14, itemKey: "retro_cube" },
  { key: "pet_cat", label: "Office Cat", rarity: "epic", weight: 7, petKey: "office_cat" },
  { key: "pet_robot", label: "Tiny Robot", rarity: "epic", weight: 5, petKey: "tiny_robot" },
  { key: "pet_pigeon", label: "Pigeon", rarity: "rare", weight: 10, petKey: "pigeon" },
  { key: "pet_otter", label: "Otter", rarity: "epic", weight: 4, petKey: "otter" },
  { key: "pet_fox_bot", label: "Fox Bot", rarity: "epic", weight: 3, petKey: "fox_bot" }
];

const ALLOWED_DANCES = new Set(["shuffle", "bounce", "spin"]);
const ALLOWED_EMOTES = new Set(["🎉", "🕺", "💃", "👋"]);

type PlayerIntent = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

type RuntimePlayer = {
  intent: PlayerIntent;
  lastInputAt: number;
  transitionCooldownUntil: number;
  pongUp: boolean;
  pongDown: boolean;
  playerId: string;
  userId?: string;
  ownedItemKeys: Set<string>;
  ownedPets: Set<string>;
  equippedDesk: Record<DeskSlotKey, string>;
  equippedPet: string;
  coinBalance: number;
  xpBalance: number;
  dailyStreak: number;
  lastSpinAt: number;
  lastBadgeSwipeAt: number;
  progressionHydrated: boolean;
};

type PendingSpinTransaction = {
  reward: DailySpinReward;
  balanceAfter: number;
  streak: number;
  xp: number;
};

type PendingPersistence = {
  userId: string;
  balances?: {
    coinBalance: number;
    xpBalance: number;
  };
  spinState?: {
    lastSpinAt: number;
    lastBadgeSwipeAt: number;
    dailyStreak: number;
  };
  petKey?: string;
  deskBySlot: Partial<Record<DeskSlotKey, string>>;
  spinTransactions: PendingSpinTransaction[];
};

function getUtcDayKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

function stableDeskSlot(playerId: string): number {
  let hash = 0;
  for (let i = 0; i < playerId.length; i += 1) {
    hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0;
  }

  return (hash % 8) + 1;
}

function weightedSpinPick(): DailySpinReward {
  const total = DAILY_SPIN_REWARDS.reduce((acc, reward) => acc + reward.weight, 0);
  let cursor = Math.random() * total;

  for (const reward of DAILY_SPIN_REWARDS) {
    cursor -= reward.weight;
    if (cursor <= 0) {
      return reward;
    }
  }

  return DAILY_SPIN_REWARDS[0];
}

class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") name = "Coworker";
  @type("string") playerId = "";
  @type("number") x = 496;
  @type("number") y = 560;
  @type("string") direction: "up" | "down" | "left" | "right" = "down";
  @type("boolean") moving = false;
  @type("string") status: "active" | "away" = "active";
  @type("string") danceAnimation = "none";
  @type("string") emote = "";
  @type("number") emoteExpiresAt = 0;
  @type("number") deskSlotIndex = 0;
  @type("string") deskStyle = DEFAULT_DESK_EQUIPPED.deskStyle;
  @type("string") chair = DEFAULT_DESK_EQUIPPED.chair;
  @type("string") computer = DEFAULT_DESK_EQUIPPED.computer;
  @type("string") plant = DEFAULT_DESK_EQUIPPED.plant;
  @type("string") mug = DEFAULT_DESK_EQUIPPED.mug;
  @type("string") smallDecoration = DEFAULT_DESK_EQUIPPED.smallDecoration;
  @type("string") petKey = DEFAULT_PET;
  @type("string") pongSide: "left" | "right" | "spectator" = "spectator";
  @type("number") pongScore = 0;
}

class PongState extends Schema {
  @type("string") status: "waiting" | "live" | "finished" = "waiting";
  @type("number") leftPaddleY = MAP_HEIGHT / 2;
  @type("number") rightPaddleY = MAP_HEIGHT / 2;
  @type("number") ballX = MAP_WIDTH / 2;
  @type("number") ballY = MAP_HEIGHT / 2;
  @type("number") ballVx = 0;
  @type("number") ballVy = 0;
  @type("string") leftPlayerId = "";
  @type("string") rightPlayerId = "";
  @type("number") leftScore = 0;
  @type("number") rightScore = 0;
  @type("string") winnerId = "";
}

class OfficeRoomState extends Schema {
  @type({ map: PlayerState })
  players = new MapSchema<PlayerState>();

  @type(PongState)
  pong = new PongState();
}

function getPlayerRect(x: number, y: number): Rect {
  return {
    x: x - HALF_PLAYER_WIDTH,
    y: y - HALF_PLAYER_HEIGHT,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT
  };
}

function overlapsRect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function pointInsideRect(px: number, py: number, rect: Rect): boolean {
  return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

let persistenceMissingTableLogged = false;
let persistenceDisabledReason = "";

function hasPrismaErrorCode(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string";
}

function isMissingUserTableError(error: unknown): boolean {
  return hasPrismaErrorCode(error) && error.code === "P2021";
}

function isMissingFwEmailColumnError(error: unknown): boolean {
  if (!hasPrismaErrorCode(error) || error.code !== "P2022") {
    return false;
  }
  const message = typeof (error as { message?: unknown }).message === "string"
    ? (error as unknown as { message: string }).message
    : "";
  return /fwEmail/i.test(message);
}

export class OfficeRoom extends Room<OfficeRoomState> {
  maxClients = 50;
  private idleThresholdMs = Number(process.env.AWAY_IDLE_SECONDS ?? 120) * 1000;
  private pongFinishedAt = 0;
  private myOfficePortalDebugNextLogAtBySession = new Map<string, number>();
  private runtimePlayers = new Map<string, RuntimePlayer>();
  private catalogIdByKey = new Map<string, string>();
  private catalogWarmupPromise?: Promise<void>;
  private pendingPersistenceByUserId = new Map<string, PendingPersistence>();
  private persistenceFlushInterval?: ReturnType<typeof setInterval>;
  private persistenceFlushInProgress = false;
  protected readonly config: RoomConfig;

  constructor(config: RoomConfig) {
    super();
    this.config = config;
  }

  private isRooftopGameRoom(): boolean {
    return this.config.id === "rooftop";
  }

  private isMyOfficeRoom(): boolean {
    return this.config.id === "my_office";
  }

  private isShopRoom(): boolean {
    return this.config.id === "shop";
  }

  private isMainOfficeRoom(): boolean {
    return this.config.id === "main_office";
  }

  private applyBadgeSwipe(runtime: RuntimePlayer, now: number): boolean {
    const currentDayKey = getUtcDayKey(now);
    const previousDayKey = runtime.lastBadgeSwipeAt > 0 ? getUtcDayKey(runtime.lastBadgeSwipeAt) : "";

    if (previousDayKey === currentDayKey) {
      return false;
    }

    if (!previousDayKey) {
      runtime.dailyStreak = 1;
    } else {
      const yesterdayKey = getUtcDayKey(now - SPIN_COOLDOWN_MS);
      runtime.dailyStreak = previousDayKey === yesterdayKey ? runtime.dailyStreak + 1 : 1;
    }

    runtime.lastBadgeSwipeAt = now;
    return true;
  }

  private resetPongBall(direction: "left" | "right") {
    const pong = this.state.pong;
    pong.ballX = MAP_WIDTH / 2;
    pong.ballY = MAP_HEIGHT / 2;

    const vxMagnitude = PONG_MIN_VX + Math.random() * (PONG_MAX_VX - PONG_MIN_VX);
    const vyMagnitude = Math.random() * PONG_MAX_VY;
    const vyDirection = Math.random() > 0.5 ? 1 : -1;

    pong.ballVx = direction === "right" ? vxMagnitude : -vxMagnitude;
    pong.ballVy = vyMagnitude * vyDirection;
  }

  private updatePongStatus() {
    if (!this.isRooftopGameRoom()) {
      return;
    }

    const pong = this.state.pong;
    const leftPlayer = pong.leftPlayerId ? this.state.players.get(pong.leftPlayerId) : undefined;
    const rightPlayer = pong.rightPlayerId ? this.state.players.get(pong.rightPlayerId) : undefined;

    if (!leftPlayer || !rightPlayer) {
      pong.status = "waiting";
      pong.winnerId = "";
      pong.ballVx = 0;
      pong.ballVy = 0;
      pong.ballX = MAP_WIDTH / 2;
      pong.ballY = MAP_HEIGHT / 2;
      return;
    }

    if (pong.status === "waiting") {
      pong.leftScore = 0;
      pong.rightScore = 0;
      leftPlayer.pongScore = 0;
      rightPlayer.pongScore = 0;
      pong.winnerId = "";
      pong.status = "live";
      this.resetPongBall(Math.random() > 0.5 ? "right" : "left");
    }
  }

  private assignPongSlots() {
    if (!this.isRooftopGameRoom()) {
      return;
    }

    const pong = this.state.pong;
    const leftPlayer = pong.leftPlayerId ? this.state.players.get(pong.leftPlayerId) : undefined;
    const rightPlayer = pong.rightPlayerId ? this.state.players.get(pong.rightPlayerId) : undefined;

    if (!leftPlayer) {
      pong.leftPlayerId = "";
    }

    if (!rightPlayer) {
      pong.rightPlayerId = "";
    }

    if (!pong.leftPlayerId) {
      const candidate = Array.from(this.state.players.values()).find((player) => player.pongSide === "spectator");
      if (candidate) {
        candidate.pongSide = "left";
        candidate.pongScore = 0;
        candidate.x = PONG_LEFT_X;
        candidate.y = pong.leftPaddleY;
        pong.leftPlayerId = candidate.id;
      }
    }

    if (!pong.rightPlayerId) {
      const candidate = Array.from(this.state.players.values()).find((player) => player.pongSide === "spectator");
      if (candidate) {
        candidate.pongSide = "right";
        candidate.pongScore = 0;
        candidate.x = PONG_RIGHT_X;
        candidate.y = pong.rightPaddleY;
        pong.rightPlayerId = candidate.id;
      }
    }

    this.state.players.forEach((player) => {
      if (player.id !== pong.leftPlayerId && player.id !== pong.rightPlayerId) {
        player.pongSide = "spectator";
        player.pongScore = 0;
      }
    });

    this.updatePongStatus();
  }

  private updatePongSimulation(dt: number) {
    if (!this.isRooftopGameRoom()) {
      return;
    }

    const pong = this.state.pong;
    const leftPlayer = pong.leftPlayerId ? this.state.players.get(pong.leftPlayerId) : undefined;
    const rightPlayer = pong.rightPlayerId ? this.state.players.get(pong.rightPlayerId) : undefined;

    if (!leftPlayer || !rightPlayer || pong.status !== "live") {
      return;
    }

    const minPaddleY = 96;
    const maxPaddleY = 544;

    const leftRuntime = this.runtimePlayers.get(leftPlayer.id);
    if (leftRuntime) {
      const inputY = (leftRuntime.pongDown ? 1 : 0) - (leftRuntime.pongUp ? 1 : 0);
      pong.leftPaddleY = Math.min(maxPaddleY, Math.max(minPaddleY, pong.leftPaddleY + inputY * PONG_PADDLE_SPEED * dt));
      leftPlayer.x = PONG_LEFT_X;
      leftPlayer.y = pong.leftPaddleY;
    }

    const rightRuntime = this.runtimePlayers.get(rightPlayer.id);
    if (rightRuntime) {
      const inputY = (rightRuntime.pongDown ? 1 : 0) - (rightRuntime.pongUp ? 1 : 0);
      pong.rightPaddleY = Math.min(maxPaddleY, Math.max(minPaddleY, pong.rightPaddleY + inputY * PONG_PADDLE_SPEED * dt));
      rightPlayer.x = PONG_RIGHT_X;
      rightPlayer.y = pong.rightPaddleY;
    }

    pong.ballX += pong.ballVx * dt;
    pong.ballY += pong.ballVy * dt;

    if (pong.ballY <= 32 + PONG_BALL_RADIUS) {
      pong.ballY = 32 + PONG_BALL_RADIUS;
      pong.ballVy = Math.abs(pong.ballVy);
    } else if (pong.ballY >= 608 - PONG_BALL_RADIUS) {
      pong.ballY = 608 - PONG_BALL_RADIUS;
      pong.ballVy = -Math.abs(pong.ballVy);
    }

    const leftWithinY = Math.abs(pong.ballY - pong.leftPaddleY) <= PONG_PADDLE_HALF_HEIGHT;
    if (pong.ballVx < 0 && pong.ballX <= PONG_LEFT_X + 12 + PONG_BALL_RADIUS && leftWithinY) {
      pong.ballX = PONG_LEFT_X + 12 + PONG_BALL_RADIUS;
      pong.ballVx = Math.abs(pong.ballVx) + 12;
      const impact = (pong.ballY - pong.leftPaddleY) / PONG_PADDLE_HALF_HEIGHT;
      pong.ballVy += impact * 90;
    }

    const rightWithinY = Math.abs(pong.ballY - pong.rightPaddleY) <= PONG_PADDLE_HALF_HEIGHT;
    if (pong.ballVx > 0 && pong.ballX >= PONG_RIGHT_X - 12 - PONG_BALL_RADIUS && rightWithinY) {
      pong.ballX = PONG_RIGHT_X - 12 - PONG_BALL_RADIUS;
      pong.ballVx = -Math.abs(pong.ballVx) - 12;
      const impact = (pong.ballY - pong.rightPaddleY) / PONG_PADDLE_HALF_HEIGHT;
      pong.ballVy += impact * 90;
    }

    const maxVelocity = 460;
    pong.ballVx = Math.min(maxVelocity, Math.max(-maxVelocity, pong.ballVx));
    pong.ballVy = Math.min(maxVelocity, Math.max(-maxVelocity, pong.ballVy));

    if (pong.ballX < 24) {
      pong.rightScore += 1;
      rightPlayer.pongScore = pong.rightScore;

      if (pong.rightScore >= PONG_MAX_SCORE) {
        pong.status = "finished";
        pong.winnerId = rightPlayer.id;
      } else {
        this.resetPongBall("left");
      }
    } else if (pong.ballX > 936) {
      pong.leftScore += 1;
      leftPlayer.pongScore = pong.leftScore;

      if (pong.leftScore >= PONG_MAX_SCORE) {
        pong.status = "finished";
        pong.winnerId = leftPlayer.id;
      } else {
        this.resetPongBall("right");
      }
    }

    if (pong.status === "finished") {
      if (this.pongFinishedAt === 0) {
        this.pongFinishedAt = Date.now();
      }

      pong.ballVx = 0;
      pong.ballVy = 0;

      // Show winner briefly, then start a fresh race-to-5 with same players.
      if (Date.now() - this.pongFinishedAt > 2200) {
        this.pongFinishedAt = 0;
        pong.status = "waiting";
        pong.winnerId = "";
      }
    } else {
      this.pongFinishedAt = 0;
    }
  }

  private collidesWithObstacles(x: number, y: number): boolean {
    const playerRect = getPlayerRect(x, y);
    return this.config.collisionRects.some((rect) => overlapsRect(playerRect, rect));
  }

  private sanitizeIntent(payload: MovePayload): PlayerIntent {
    return {
      up: Boolean(payload.up),
      down: Boolean(payload.down),
      left: Boolean(payload.left),
      right: Boolean(payload.right)
    };
  }

  private isOnDanceFloor(x: number, y: number): boolean {
    if (!this.config.danceFloor) {
      return false;
    }

    return pointInsideRect(x, y, this.config.danceFloor);
  }

  private applyRuntimeVisualsToPlayer(sessionId: string) {
    const runtime = this.runtimePlayers.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (!runtime || !player) {
      return;
    }

    player.playerId = runtime.playerId;
    player.deskSlotIndex = stableDeskSlot(runtime.playerId);
    player.petKey = runtime.equippedPet;
    player.deskStyle = runtime.equippedDesk.deskStyle;
    player.chair = runtime.equippedDesk.chair;
    player.computer = runtime.equippedDesk.computer;
    player.plant = runtime.equippedDesk.plant;
    player.mug = runtime.equippedDesk.mug;
    player.smallDecoration = runtime.equippedDesk.smallDecoration;
  }

  private createProgressionSnapshot(runtime: RuntimePlayer) {
    const now = Date.now();
    const nextSpinAt = runtime.lastSpinAt > 0 ? runtime.lastSpinAt + SPIN_COOLDOWN_MS : 0;
    const canSpin = runtime.lastSpinAt === 0 || nextSpinAt <= now;
    const nextBadgeSwipeAt = runtime.lastBadgeSwipeAt > 0 ? runtime.lastBadgeSwipeAt + SPIN_COOLDOWN_MS : 0;
    const canBadgeSwipe = runtime.lastBadgeSwipeAt === 0 || nextBadgeSwipeAt <= now;

    return {
      coins: runtime.coinBalance,
      xp: runtime.xpBalance,
      dailyStreak: runtime.dailyStreak,
      lastSpinAt: runtime.lastSpinAt,
      nextSpinAt,
      canSpin,
      lastBadgeSwipeAt: runtime.lastBadgeSwipeAt,
      nextBadgeSwipeAt,
      canBadgeSwipe,
      ownedItems: Array.from(runtime.ownedItemKeys),
      ownedPets: Array.from(runtime.ownedPets),
      equippedDesk: runtime.equippedDesk,
      equippedPet: runtime.equippedPet,
      shop: SHOP_ITEMS
    };
  }

  private sendProgressionSnapshot(client: Client) {
    const runtime = this.runtimePlayers.get(client.sessionId);
    if (!runtime) {
      return;
    }

    client.send("progression_snapshot", this.createProgressionSnapshot(runtime));
  }

  private async ensureCatalogWarm() {
    if (!this.catalogWarmupPromise) {
      this.catalogWarmupPromise = (async () => {
        const existing = await prisma.itemCatalog.findMany({
          select: {
            id: true,
            key: true
          }
        });

        for (const entry of existing) {
          this.catalogIdByKey.set(entry.key, entry.id);
        }

        await Promise.all(
          SHOP_ITEMS.map(async (item) => {
            if (this.catalogIdByKey.has(item.key)) {
              return;
            }

            const catalog = await prisma.itemCatalog.upsert({
              where: { key: item.key },
              create: {
                key: item.key,
                name: item.name,
                category: "desk_items",
                price: item.price,
                rarity: item.rarity,
                spriteKey: item.key,
                previewImage: item.key
              },
              update: {
                name: item.name,
                price: item.price,
                rarity: item.rarity
              },
              select: {
                id: true,
                key: true
              }
            });

            this.catalogIdByKey.set(catalog.key, catalog.id);
          })
        );
      })();
    }

    await this.catalogWarmupPromise;
  }

  private async resolveCatalogId(itemKey: string): Promise<string | undefined> {
    await this.ensureCatalogWarm();
    const existing = this.catalogIdByKey.get(itemKey);
    if (existing) {
      return existing;
    }

    const item = SHOP_ITEMS.find((entry: (typeof SHOP_ITEMS)[number]) => entry.key === itemKey);
    if (!item) {
      return undefined;
    }

    const catalog = await prisma.itemCatalog.upsert({
      where: { key: item.key },
      create: {
        key: item.key,
        name: item.name,
        category: "desk_items",
        price: item.price,
        rarity: item.rarity,
        spriteKey: item.key,
        previewImage: item.key
      },
      update: {
        name: item.name,
        price: item.price,
        rarity: item.rarity
      },
      select: {
        id: true,
        key: true
      }
    });

    this.catalogIdByKey.set(catalog.key, catalog.id);
    return catalog.id;
  }

  private getOrCreatePendingPersistence(userId: string): PendingPersistence {
    let pending = this.pendingPersistenceByUserId.get(userId);
    if (!pending) {
      pending = {
        userId,
        deskBySlot: {},
        spinTransactions: []
      };
      this.pendingPersistenceByUserId.set(userId, pending);
    }

    return pending;
  }

  private async flushPendingPersistence(userId?: string) {
    if (this.persistenceFlushInProgress) {
      return;
    }

    const entries = userId
      ? (() => {
          const found = this.pendingPersistenceByUserId.get(userId);
          return found ? [found] : [];
        })()
      : Array.from(this.pendingPersistenceByUserId.values());

    if (entries.length === 0) {
      return;
    }

    this.persistenceFlushInProgress = true;

    try {
      for (const pending of entries) {
        this.pendingPersistenceByUserId.delete(pending.userId);

        try {
          if (pending.balances) {
            await prisma.user.update({
              where: { id: pending.userId },
              data: {
                coinBalance: pending.balances.coinBalance,
                xpBalance: pending.balances.xpBalance
              },
              select: {
                id: true
              }
            });
          }

          if (pending.spinState) {
            await prisma.user.update({
              where: { id: pending.userId },
              data: {
                lastSpinAt: pending.spinState.lastSpinAt > 0 ? new Date(pending.spinState.lastSpinAt) : null,
                lastBadgeSwipeAt:
                  pending.spinState.lastBadgeSwipeAt > 0 ? new Date(pending.spinState.lastBadgeSwipeAt) : null,
                dailyStreak: pending.spinState.dailyStreak
              },
              select: {
                id: true
              }
            });
          }

          if (pending.petKey) {
            await prisma.avatar.upsert({
              where: {
                userId: pending.userId
              },
              create: {
                userId: pending.userId,
                bodyColor: "sunset",
                hairOrHatStyle: "basic",
                shirtStyle: "hoodie",
                starterPet: pending.petKey
              },
              update: {
                starterPet: pending.petKey
              }
            });
          }

          const deskEntries = Object.entries(pending.deskBySlot) as Array<[DeskSlotKey, string]>;
          for (const [slot, itemKey] of deskEntries) {
            await prisma.userItem.updateMany({
              where: {
                userId: pending.userId,
                equippedSlot: slot
              },
              data: {
                isEquipped: false
              }
            });

            await prisma.userItem.updateMany({
              where: {
                userId: pending.userId,
                itemCatalog: {
                  key: itemKey
                }
              },
              data: {
                isEquipped: true,
                equippedSlot: slot
              }
            });
          }

          for (const txn of pending.spinTransactions) {
            await prisma.coinTransaction.create({
              data: {
                userId: pending.userId,
                amount: txn.reward.coins ?? 0,
                reason: `Daily spin: ${txn.reward.label}`,
                sourceType: "daily_spin",
                balanceAfter: txn.balanceAfter,
                metadata: {
                  rewardKey: txn.reward.key,
                  streak: txn.streak,
                  xp: txn.xp,
                  petKey: txn.reward.petKey ?? null,
                  itemKey: txn.reward.itemKey ?? null
                }
              }
            });
          }
        } catch (error) {
          console.warn(`[progression] Write-behind flush failed for user ${pending.userId}:`, error);
        }
      }
    } finally {
      this.persistenceFlushInProgress = false;
    }
  }

  private async loadProgressionForSession(sessionId: string, playerId: string, displayName: string) {
    const runtime = this.runtimePlayers.get(sessionId);
    if (!runtime) {
      return;
    }

    if (persistenceDisabledReason) {
      runtime.progressionHydrated = true;
      this.applyRuntimeVisualsToPlayer(sessionId);
      return;
    }

    const loadStartedAt = Date.now();
    console.log(
      `[progression][load_start] room=${this.config.id} session=${sessionId} playerId=${playerId} displayName=${displayName}`
    );

    try {
      const user = await prisma.user.upsert({
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
          coinBalance: true,
          xpBalance: true,
          lastSpinAt: true,
          lastBadgeSwipeAt: true,
          dailyStreak: true
        }
      });

      await this.ensureCatalogWarm();

      runtime.userId = user.id;
      runtime.coinBalance = user.coinBalance;
      runtime.xpBalance = user.xpBalance;
      runtime.lastSpinAt = user.lastSpinAt ? user.lastSpinAt.getTime() : 0;
      runtime.lastBadgeSwipeAt = user.lastBadgeSwipeAt ? user.lastBadgeSwipeAt.getTime() : 0;
      runtime.dailyStreak = user.dailyStreak;

      const avatar =
        (await prisma.avatar.findUnique({
          where: {
            userId: user.id
          }
        })) ??
        (await prisma.avatar.create({
          data: {
            userId: user.id,
            bodyColor: "sunset",
            hairOrHatStyle: "basic",
            shirtStyle: "hoodie",
            starterPet: DEFAULT_PET
          }
        }));

      runtime.equippedPet = avatar.starterPet || DEFAULT_PET;
      runtime.ownedPets.add(DEFAULT_PET);
      runtime.ownedPets.add(runtime.equippedPet);

      await Promise.all(
        SHOP_ITEMS.filter((entry) => entry.price === 0).map(async (starterItem) => {
          const itemCatalogId = this.catalogIdByKey.get(starterItem.key);
          if (!itemCatalogId) {
            return;
          }

          await prisma.userItem.upsert({
            where: {
              userId_itemCatalogId: {
                userId: user.id,
                itemCatalogId
              }
            },
            create: {
              userId: user.id,
              itemCatalogId,
              quantity: 1,
              isEquipped: true,
              equippedSlot: starterItem.slot
            },
            update: {}
          });
        })
      );

      const refreshedItems = await prisma.userItem.findMany({
        where: { userId: user.id },
        include: {
          itemCatalog: {
            select: { key: true }
          }
        }
      });

      runtime.ownedItemKeys.clear();
      for (const entry of refreshedItems) {
        runtime.ownedItemKeys.add(entry.itemCatalog.key);
      }

      DESK_SLOT_KEYS.forEach((slot) => {
        runtime.equippedDesk[slot] = DEFAULT_DESK_EQUIPPED[slot];
      });

      for (const entry of refreshedItems) {
        const slot = entry.equippedSlot as DeskSlotKey | null;
        if (entry.isEquipped && slot && DESK_SLOT_KEYS.includes(slot)) {
          runtime.equippedDesk[slot] = entry.itemCatalog.key;
        }
      }

    } catch (error) {
      if (isMissingUserTableError(error)) {
        persistenceDisabledReason = "prisma_table_missing";
        if (!persistenceMissingTableLogged) {
          persistenceMissingTableLogged = true;
          console.error(
            "[progression][schema_missing] Prisma table public.User is missing. " +
              "Run Prisma schema deployment against the Railway DATABASE_URL (example: `npx prisma db push` or `npx prisma migrate deploy`)"
          );
        }
      } else if (isMissingFwEmailColumnError(error)) {
        persistenceDisabledReason = "prisma_column_missing_fwEmail";
        if (!persistenceMissingTableLogged) {
          persistenceMissingTableLogged = true;
          console.error(
            "[progression][schema_missing] Column User.fwEmail is missing from the database. " +
              "Run Prisma schema deployment against the Railway DATABASE_URL (example: `npx prisma db push` or `npx prisma migrate deploy`)"
          );
        }
      }

      console.warn(
        `[progression][load_failed] room=${this.config.id} session=${sessionId} playerId=${playerId} error=${serializeError(error)}`
      );
    } finally {
      runtime.progressionHydrated = true;
      console.log(
        `[progression][load_done] room=${this.config.id} session=${sessionId} playerId=${playerId} durationMs=${Date.now() - loadStartedAt}`
      );
    }

    this.applyRuntimeVisualsToPlayer(sessionId);
  }

  private async persistDeskEquip(runtime: RuntimePlayer, slot: DeskSlotKey, itemKey: string) {
    if (!runtime.userId) {
      return;
    }
    const pending = this.getOrCreatePendingPersistence(runtime.userId);
    pending.deskBySlot[slot] = itemKey;
  }

  private async persistBalances(runtime: RuntimePlayer) {
    if (!runtime.userId) {
      return;
    }

    const pending = this.getOrCreatePendingPersistence(runtime.userId);
    pending.balances = {
      coinBalance: runtime.coinBalance,
      xpBalance: runtime.xpBalance
    };
  }

  private async persistSpinState(runtime: RuntimePlayer) {
    if (!runtime.userId) {
      return;
    }

    const pending = this.getOrCreatePendingPersistence(runtime.userId);
    pending.spinState = {
      lastSpinAt: runtime.lastSpinAt,
      lastBadgeSwipeAt: runtime.lastBadgeSwipeAt,
      dailyStreak: runtime.dailyStreak
    };
  }

  private async persistPet(runtime: RuntimePlayer) {
    if (!runtime.userId) {
      return;
    }

    const pending = this.getOrCreatePendingPersistence(runtime.userId);
    pending.petKey = runtime.equippedPet;
  }

  private async recordSpin(runtime: RuntimePlayer, reward: DailySpinReward) {
    if (!runtime.userId) {
      return;
    }

    const pending = this.getOrCreatePendingPersistence(runtime.userId);
    pending.spinTransactions.push({
      reward,
      balanceAfter: runtime.coinBalance,
      streak: runtime.dailyStreak,
      xp: reward.xp ?? 0
    });
  }

  onCreate() {
    this.setState(new OfficeRoomState());
    console.log(
      `[room][create] room=${this.config.id} displayName=${this.config.displayName} ` +
        `spawn=(${this.config.spawn.x},${this.config.spawn.y}) portals=${this.config.portals.length}`
    );
    this.persistenceFlushInterval = setInterval(() => {
      void this.flushPendingPersistence();
    }, WRITE_BEHIND_FLUSH_MS);

    void this.ensureCatalogWarm().catch((error) => {
      console.warn("[progression] Catalog warmup failed:", error);
    });

    this.onMessage("move", (client, payload: MovePayload) => {
      const runtime = this.runtimePlayers.get(client.sessionId);
      const player = this.state.players.get(client.sessionId);
      if (!runtime) {
        return;
      }

      runtime.intent = this.sanitizeIntent(payload);
      if (runtime.intent.up || runtime.intent.down || runtime.intent.left || runtime.intent.right) {
        runtime.lastInputAt = Date.now();
      }

      if (player && (runtime.intent.up || runtime.intent.down || runtime.intent.left || runtime.intent.right)) {
        player.danceAnimation = "none";
      }
    });

    this.onMessage("dance_toggle", (client, payload: DancePayload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) {
        return;
      }

      const selectedDance = (payload.dance ?? "").toString();
      if (!ALLOWED_DANCES.has(selectedDance)) {
        return;
      }

      if (!this.isOnDanceFloor(player.x, player.y)) {
        player.danceAnimation = "none";
        return;
      }

      player.danceAnimation = player.danceAnimation === selectedDance ? "none" : selectedDance;
    });

    this.onMessage("emote", (client, payload: EmotePayload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) {
        return;
      }

      const emote = (payload.emote ?? "").toString();
      if (!ALLOWED_EMOTES.has(emote)) {
        return;
      }

      player.emote = emote;
      player.emoteExpiresAt = Date.now() + 2200;
    });

    this.onMessage("chat_message", (client, payload: ChatPayload) => {
      const message = (payload.message ?? "").replace(/\s+/g, " ").trim();
      if (!message) {
        return;
      }

      this.broadcast("chat_message", {
        sessionId: client.sessionId,
        message: message.slice(0, 140)
      });
    });

    this.onMessage("pong_join", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !this.isRooftopGameRoom()) {
        return;
      }

      if (player.pongSide === "spectator") {
        this.assignPongSlots();
      }
    });

    this.onMessage("pong_leave", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !this.isRooftopGameRoom()) {
        return;
      }

      if (player.pongSide === "left") {
        this.state.pong.leftPlayerId = "";
        this.state.pong.leftScore = 0;
      } else if (player.pongSide === "right") {
        this.state.pong.rightPlayerId = "";
        this.state.pong.rightScore = 0;
      }

      player.pongSide = "spectator";
      player.pongScore = 0;
      this.assignPongSlots();
    });

    this.onMessage("pong_input", (client, payload: PongInputPayload) => {
      if (!this.isRooftopGameRoom()) {
        return;
      }

      const runtime = this.runtimePlayers.get(client.sessionId);
      if (!runtime) {
        return;
      }

      runtime.pongUp = Boolean(payload.up);
      runtime.pongDown = Boolean(payload.down);
      if (runtime.pongUp || runtime.pongDown) {
        runtime.lastInputAt = Date.now();
      }
    });

    this.onMessage("progression_request", (client) => {
      this.sendProgressionSnapshot(client);
    });

    this.onMessage("progression_buy_item", async (client, payload: BuyItemPayload) => {
      if (!this.isShopRoom()) {
        client.send("progression_error", { message: "Shopping is only available in the Shop room." });
        return;
      }

      const runtime = this.runtimePlayers.get(client.sessionId);
      const itemKey = payload.itemKey?.trim() ?? "";
      const item = SHOP_ITEMS.find((entry) => entry.key === itemKey);

      if (!runtime || !item) {
        return;
      }

      if (runtime.ownedItemKeys.has(item.key)) {
        this.sendProgressionSnapshot(client);
        return;
      }

      if (runtime.coinBalance < item.price) {
        client.send("progression_error", { message: "Not enough coins." });
        return;
      }

      runtime.coinBalance -= item.price;
      runtime.ownedItemKeys.add(item.key);

      try {
        if (runtime.userId) {
          const catalogId = await this.resolveCatalogId(item.key);
          if (!catalogId) {
            throw new Error(`Missing catalog entry for item ${item.key}`);
          }

          await prisma.userItem.upsert({
            where: {
              userId_itemCatalogId: {
                userId: runtime.userId,
                itemCatalogId: catalogId
              }
            },
            create: {
              userId: runtime.userId,
              itemCatalogId: catalogId,
              quantity: 1
            },
            update: {
              quantity: {
                increment: 1
              }
            }
          });
        }

        await this.persistBalances(runtime);
      } catch (error) {
        console.warn("[progression] Unable to persist purchase:", error);
      }

      this.sendProgressionSnapshot(client);
    });

    this.onMessage("progression_equip_desk", async (client, payload: EquipDeskPayload) => {
      if (!this.isMyOfficeRoom()) {
        client.send("progression_error", { message: "Desk customization is only available in My Office." });
        return;
      }

      const runtime = this.runtimePlayers.get(client.sessionId);
      const player = this.state.players.get(client.sessionId);
      const slot = payload.slot;
      const itemKey = payload.itemKey?.trim() ?? "";
      const item = SHOP_ITEMS.find((entry) => entry.key === itemKey);

      if (!runtime || !player || !slot || !DESK_SLOT_KEYS.includes(slot) || !item || item.slot !== slot) {
        return;
      }

      if (!runtime.ownedItemKeys.has(itemKey)) {
        client.send("progression_error", { message: "Item is not in your inventory." });
        return;
      }

      runtime.equippedDesk[slot] = itemKey;
      this.applyRuntimeVisualsToPlayer(client.sessionId);

      try {
        await this.persistDeskEquip(runtime, slot, itemKey);
      } catch (error) {
        console.warn("[progression] Unable to persist desk equip:", error);
      }

      this.sendProgressionSnapshot(client);
    });

    this.onMessage("progression_equip_pet", async (client, payload: EquipPetPayload) => {
      if (!this.isMyOfficeRoom()) {
        client.send("progression_error", { message: "Pet selection is only available in My Office." });
        return;
      }

      const runtime = this.runtimePlayers.get(client.sessionId);
      const petKey = payload.petKey?.trim() ?? "";
      if (!runtime || !PET_KEYS.includes(petKey as (typeof PET_KEYS)[number])) {
        return;
      }

      runtime.equippedPet = petKey;
      this.applyRuntimeVisualsToPlayer(client.sessionId);
      console.log(`[pet] Player ${client.sessionId} equipped pet: ${petKey}`);

      try {
        await this.persistPet(runtime);
        console.log(`[pet] Persisted pet ${petKey} for userId: ${runtime.userId}`);
      } catch (error) {
        console.warn("[progression] Unable to persist pet equip:", error);
      }

      this.sendProgressionSnapshot(client);
    });

    this.onMessage("progression_badge_swipe", async (client) => {
      const runtime = this.runtimePlayers.get(client.sessionId);
      if (!runtime) {
        return;
      }

      if (!runtime.progressionHydrated) {
        client.send("progression_error", { message: "Profile still loading. Try badge swipe again in a moment." });
        return;
      }

      const now = Date.now();
      const didSwipe = this.applyBadgeSwipe(runtime, now);
      if (!didSwipe) {
        client.send("badge_swipe_logged", { message: "Badge swipe already logged today." });
        this.sendProgressionSnapshot(client);
        return;
      }

      try {
        if (runtime.userId) {
          await this.persistSpinState(runtime);
        }
      } catch (error) {
        console.warn("[progression] Unable to persist badge swipe:", error);
      }

      client.send("badge_swipe_logged", {
        message: runtime.userId ? "Badge swipe was logged." : "Badge swipe logged for this session."
      });
      this.sendProgressionSnapshot(client);
    });

    this.onMessage("progression_daily_spin", async (client) => {
      const runtime = this.runtimePlayers.get(client.sessionId);
      if (!runtime) {
        return;
      }

      const now = Date.now();
      if (runtime.lastSpinAt > 0 && runtime.lastSpinAt + SPIN_COOLDOWN_MS > now) {
        client.send("progression_error", { message: "Daily spin is still on cooldown." });
        this.sendProgressionSnapshot(client);
        return;
      }

      const reward = weightedSpinPick();
      runtime.coinBalance += reward.coins ?? 0;
      runtime.xpBalance += reward.xp ?? 0;

      if (reward.itemKey) {
        runtime.ownedItemKeys.add(reward.itemKey);
      }

      if (reward.petKey) {
        runtime.ownedPets.add(reward.petKey);
      }
      runtime.lastSpinAt = now;

      try {
        if (runtime.userId) {
          if (reward.itemKey) {
            const catalogId = await this.resolveCatalogId(reward.itemKey);
            if (catalogId) {

              await prisma.userItem.upsert({
                where: {
                  userId_itemCatalogId: {
                    userId: runtime.userId,
                    itemCatalogId: catalogId
                  }
                },
                create: {
                  userId: runtime.userId,
                  itemCatalogId: catalogId,
                  quantity: 1
                },
                update: {
                  quantity: {
                    increment: 1
                  }
                }
              });
            }
          }

          await this.persistBalances(runtime);
          await this.persistSpinState(runtime);
          await this.recordSpin(runtime, reward);
        }
      } catch (error) {
        console.warn("[progression] Unable to persist daily spin:", error);
      }

      client.send("daily_spin_result", {
        key: reward.key,
        label: reward.label,
        rarity: reward.rarity,
        coins: reward.coins ?? 0,
        xp: reward.xp ?? 0,
        itemKey: reward.itemKey ?? "",
        petKey: reward.petKey ?? ""
      });

      this.sendProgressionSnapshot(client);
    });

    this.setSimulationInterval((deltaTime) => {
      const now = Date.now();
      const dt = Math.min(deltaTime / 1000, 0.05);

      this.state.players.forEach((player, sessionId) => {
        const runtime = this.runtimePlayers.get(sessionId);
        if (!runtime) {
          return;
        }

        const inputX = (runtime.intent.right ? 1 : 0) - (runtime.intent.left ? 1 : 0);
        const inputY = (runtime.intent.down ? 1 : 0) - (runtime.intent.up ? 1 : 0);

        const inputMagnitude = Math.hypot(inputX, inputY);
        const normalizedX = inputMagnitude > 0 ? inputX / inputMagnitude : 0;
        const normalizedY = inputMagnitude > 0 ? inputY / inputMagnitude : 0;

        if (normalizedX !== 0 || normalizedY !== 0) {
          if (Math.abs(normalizedX) >= Math.abs(normalizedY)) {
            player.direction = normalizedX > 0 ? "right" : "left";
          } else {
            player.direction = normalizedY > 0 ? "down" : "up";
          }
        }

        const isPongController = this.isRooftopGameRoom() && (player.pongSide === "left" || player.pongSide === "right");
        const horizontalInput = isPongController ? 0 : normalizedX;
        const stepX = horizontalInput * PLAYER_SPEED * dt;
        const stepY = normalizedY * PLAYER_SPEED * dt;

        const previousX = player.x;
        const previousY = player.y;

        const tryX = Math.min(MAX_X, Math.max(MIN_X, player.x + stepX));
        if (!this.collidesWithObstacles(tryX, player.y)) {
          player.x = tryX;
        }

        const tryY = Math.min(MAX_Y, Math.max(MIN_Y, player.y + stepY));
        if (!this.collidesWithObstacles(player.x, tryY)) {
          player.y = tryY;
        }

        player.moving = Math.abs(player.x - previousX) > 0.01 || Math.abs(player.y - previousY) > 0.01;
        player.status = now - runtime.lastInputAt > this.idleThresholdMs ? "away" : "active";

        if (player.emote && player.emoteExpiresAt <= now) {
          player.emote = "";
          player.emoteExpiresAt = 0;
        }

        if (player.danceAnimation !== "none" && !this.isOnDanceFloor(player.x, player.y)) {
          player.danceAnimation = "none";
        }

        // Players currently assigned to Pong paddles should not be moved out
        // of the rooftop game by portal overlap while controlling a paddle.
        if (this.isRooftopGameRoom() && (player.pongSide === "left" || player.pongSide === "right")) {
          return;
        }

        if (now < runtime.transitionCooldownUntil) {
          return;
        }

        const playerRect = getPlayerRect(player.x, player.y);

        if (this.isMainOfficeRoom()) {
          const myOfficePortal = this.config.portals.find((zone) => zone.targetRoomId === "my_office");
          if (myOfficePortal) {
            const debugZone = {
              x: myOfficePortal.x - 40,
              y: myOfficePortal.y - 40,
              width: myOfficePortal.width + 80,
              height: myOfficePortal.height + 80
            };

            const nearPortal = pointInsideRect(player.x, player.y, debugZone);
            const overlapsMyOfficePortal = overlapsRect(playerRect, myOfficePortal);
            const nextLogAt = this.myOfficePortalDebugNextLogAtBySession.get(sessionId) ?? 0;

            if ((nearPortal || overlapsMyOfficePortal) && now >= nextLogAt) {
              this.myOfficePortalDebugNextLogAtBySession.set(sessionId, now + 2500);
              console.log(
                `[room][my_office_portal_check] session=${sessionId} ` +
                  `player=(${Math.round(player.x)},${Math.round(player.y)}) ` +
                  `portal=(${myOfficePortal.x},${myOfficePortal.y},${myOfficePortal.width},${myOfficePortal.height}) ` +
                  `near=${nearPortal} overlap=${overlapsMyOfficePortal}`
              );
            }
          }
        }

        const portal = this.config.portals.find((zone) => overlapsRect(playerRect, zone));
        if (!portal) {
          return;
        }

        runtime.transitionCooldownUntil = now + 1500;
        runtime.intent = { up: false, down: false, left: false, right: false };

        const client = this.clients.find((candidate) => candidate.sessionId === sessionId);
        if (client) {
          console.log(
            `[room][transition] room=${this.config.id} session=${sessionId} from=(${Math.round(player.x)},${Math.round(player.y)}) target=${portal.targetRoomId}`
          );
          client.send("transition_room", {
            roomId: portal.targetRoomId
          });
        } else {
          console.warn(
            `[room][transition_send_skipped] room=${this.config.id} session=${sessionId} target=${portal.targetRoomId} reason=client_not_found`
          );
        }
      });

      this.updatePongSimulation(dt);
    }, 1000 / 20);
  }

  async onJoin(client: Client, options?: { name?: string; playerId?: string; reconnectX?: number; reconnectY?: number }) {
    const joinStartedAt = Date.now();
    console.log(
      `[room][join_start] room=${this.config.id} session=${client.sessionId} ` +
        `name=${options?.name?.trim().slice(0, 20) || "Coworker"} ` +
        `playerId=${options?.playerId?.trim() || `guest_${client.sessionId}`} ` +
        `hasReconnect=${Number.isFinite(options?.reconnectX) && Number.isFinite(options?.reconnectY)}`
    );

    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = options?.name?.trim().slice(0, 20) || "Coworker";
    const playerId = options?.playerId?.trim() || `guest_${client.sessionId}`;
    player.playerId = playerId;

    const hasReconnectPosition =
      Number.isFinite(options?.reconnectX) && Number.isFinite(options?.reconnectY);

    if (hasReconnectPosition) {
      player.x = Math.min(MAX_X, Math.max(MIN_X, Number(options?.reconnectX)));
      player.y = Math.min(MAX_Y, Math.max(MIN_Y, Number(options?.reconnectY)));
    } else {
      const jitterX = Math.floor(Math.random() * 70) - 35;
      const jitterY = Math.floor(Math.random() * 20) - 10;
      player.x = Math.min(MAX_X, Math.max(MIN_X, this.config.spawn.x + jitterX));
      player.y = Math.min(MAX_Y, Math.max(MIN_Y, this.config.spawn.y + jitterY));
    }

    if (this.collidesWithObstacles(player.x, player.y)) {
      player.x = this.config.spawn.x;
      player.y = this.config.spawn.y;
    }

    this.state.players.set(client.sessionId, player);

    this.runtimePlayers.set(client.sessionId, {
      intent: { up: false, down: false, left: false, right: false },
      lastInputAt: Date.now(),
      transitionCooldownUntil: Date.now() + 1200,
      pongUp: false,
      pongDown: false,
      playerId,
      ownedItemKeys: new Set(Object.values(DEFAULT_DESK_EQUIPPED)),
      ownedPets: new Set(PET_KEYS),
      equippedDesk: { ...DEFAULT_DESK_EQUIPPED },
      equippedPet: DEFAULT_PET,
      coinBalance: 0,
      xpBalance: 0,
      dailyStreak: 0,
      lastSpinAt: 0,
      lastBadgeSwipeAt: 0,
      progressionHydrated: false
    });

    this.applyRuntimeVisualsToPlayer(client.sessionId);
    this.sendProgressionSnapshot(client);

    this.assignPongSlots();

    const hydrationStartedAt = Date.now();

    void this.loadProgressionForSession(client.sessionId, playerId, player.name)
      .then(() => {
        const runtime = this.runtimePlayers.get(client.sessionId);
        if (!runtime) {
          return;
        }

        this.applyRuntimeVisualsToPlayer(client.sessionId);
        this.sendProgressionSnapshot(client);

        const hydrationMs = Date.now() - hydrationStartedAt;
        console.log(
          `[room][join_hydrated] room=${this.config.id} session=${client.sessionId} hydrationMs=${hydrationMs}`
        );
      })
      .catch((error) => {
        console.warn(
          `[progression][deferred_hydration_failed] room=${this.config.id} session=${client.sessionId} error=${serializeError(error)}`
        );
      });

    const joinMs = Date.now() - joinStartedAt;
    console.log(
      `[room][join] room=${this.config.id} session=${client.sessionId} name=${player.name} players=${this.state.players.size} joinMs=${joinMs}`
    );
  }

  onLeave(client: Client, consented: boolean) {
    const roomId = this.config.id;
    const playerName = this.state.players.get(client.sessionId)?.name ?? "unknown";

    const player = this.state.players.get(client.sessionId);
    if (player?.pongSide === "left") {
      this.state.pong.leftPlayerId = "";
      this.state.pong.leftScore = 0;
    } else if (player?.pongSide === "right") {
      this.state.pong.rightPlayerId = "";
      this.state.pong.rightScore = 0;
    }

    this.state.players.delete(client.sessionId);
    const runtime = this.runtimePlayers.get(client.sessionId);
    this.runtimePlayers.delete(client.sessionId);
    this.myOfficePortalDebugNextLogAtBySession.delete(client.sessionId);
    if (runtime?.userId) {
      void this.flushPendingPersistence(runtime.userId);
    }
    this.assignPongSlots();

    console.log(
      `[room][leave] room=${roomId} session=${client.sessionId} name=${playerName} consented=${consented} players=${this.state.players.size}`
    );
  }

  async onDispose() {
    if (this.persistenceFlushInterval) {
      clearInterval(this.persistenceFlushInterval);
      this.persistenceFlushInterval = undefined;
    }

    await this.flushPendingPersistence();
    console.log(`[room][dispose] room=${this.config.id}`);
  }
}
