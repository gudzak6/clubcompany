import Phaser from "phaser";
import { Client as ColyseusClient, Room as ColyseusRoom } from "colyseus.js";
import { ChatSystem } from "./ChatSystem";
import { Player } from "./Player";

type RoomId = "main_office" | "my_office" | "shop" | "coffee_bar" | "arcade" | "rooftop";

type RoomTransitionStatus =
  | "idle"
  | "preparing"
  | "leaving"
  | "joining"
  | "switching"
  | "ready"
  | "failed";

type ConnectRoomOptions = {
  preservePosition?: boolean;
  suppressRollback?: boolean;
};

type TiledProperty = {
  name: string;
  type: string;
  value: string | number | boolean;
};

type TiledObject = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties?: TiledProperty[];
};

type RoomVisualConfig = {
  mapKey: string;
  displayName: string;
};

type DebugPlayer = {
  id: string;
  name: string;
  status: "active" | "away";
};

type DeskSlotKey = "deskStyle" | "chair" | "computer" | "plant" | "mug" | "smallDecoration";

type ShopItem = {
  key: string;
  name: string;
  slot: DeskSlotKey;
  price: number;
  rarity: "common" | "uncommon" | "rare" | "epic";
};

type ProgressionSnapshot = {
  coins: number;
  xp: number;
  dailyStreak: number;
  lastSpinAt: number;
  nextSpinAt: number;
  canSpin: boolean;
  lastBadgeSwipeAt: number;
  nextBadgeSwipeAt: number;
  canBadgeSwipe: boolean;
  ownedItems: string[];
  ownedPets: string[];
  equippedDesk: Record<DeskSlotKey, string>;
  equippedPet: string;
  shop: ShopItem[];
};

type DailySpinResult = {
  key: string;
  label: string;
  rarity: "common" | "uncommon" | "rare" | "epic";
  coins: number;
  xp: number;
  itemKey: string;
  petKey: string;
};

type PongSnapshot = {
  status?: "waiting" | "live" | "finished";
  leftPaddleY?: number;
  rightPaddleY?: number;
  ballX?: number;
  ballY?: number;
  leftPlayerId?: string;
  rightPlayerId?: string;
  leftScore?: number;
  rightScore?: number;
  winnerId?: string;
};

const ROOM_VISUALS: Record<RoomId, RoomVisualConfig> = {
  main_office: { mapKey: "main-office-map", displayName: "Main Office" },
  my_office: { mapKey: "coffee-bar-map", displayName: "My Office" },
  shop: { mapKey: "coffee-bar-map", displayName: "Shop" },
  coffee_bar: { mapKey: "coffee-bar-map", displayName: "Coffee Bar" },
  arcade: { mapKey: "arcade-map", displayName: "Club" },
  rooftop: { mapKey: "rooftop-map", displayName: "Game Room" }
};

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;

class OfficeScene extends Phaser.Scene {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: {
    space: Phaser.Input.Keyboard.Key;
    one: Phaser.Input.Keyboard.Key;
    two: Phaser.Input.Keyboard.Key;
    three: Phaser.Input.Keyboard.Key;
    z: Phaser.Input.Keyboard.Key;
    x: Phaser.Input.Keyboard.Key;
    c: Phaser.Input.Keyboard.Key;
    v: Phaser.Input.Keyboard.Key;
    enter: Phaser.Input.Keyboard.Key;
    backspace: Phaser.Input.Keyboard.Key;
  };
  private colyseusClient?: ColyseusClient;
  private room?: ColyseusRoom;
  private chatSystem?: ChatSystem;
  private localSessionId = "";
  private avatars = new Map<string, Player>();
  private connectionText?: Phaser.GameObjects.Text;
  private transitionDebugText?: Phaser.GameObjects.Text;
  private roomTitleText?: Phaser.GameObjects.Text;
  private roomHintText?: Phaser.GameObjects.Text;
  private chatHintText?: Phaser.GameObjects.Text;
  private sceneObjects: Phaser.GameObjects.GameObject[] = [];
  private sceneTweens: Phaser.Tweens.Tween[] = [];
  private pongVisual?: {
    board: Phaser.GameObjects.Rectangle;
    centerLine: Phaser.GameObjects.Rectangle;
    leftPaddle: Phaser.GameObjects.Rectangle;
    rightPaddle: Phaser.GameObjects.Rectangle;
    ball: Phaser.GameObjects.Arc;
    scoreText: Phaser.GameObjects.Text;
    statusText: Phaser.GameObjects.Text;
  };
  private currentRoomId: RoomId = "main_office";
  private transitioning = false;
  private transitionStatus: RoomTransitionStatus = "idle";
  private transitionToken = 0;
  private queuedTransition?: { roomId: RoomId; options?: ConnectRoomOptions };
  private roomBindingToken = 0;
  private ignoreTransitionRoomUntil = 0;
  private uiInputBlocked = false;
  private selectedDance: "shuffle" | "bounce" | "spin" = "shuffle";
  private lastEmoteSentAt = 0;
  private lastIntentSignature = "";
  private lastMoveSentAt = 0;
  private lastPongInputSignature = "";
  private lastPongInputSentAt = 0;
  private lastEndpointAttempt = "";
  private activeEndpoint = "";
  private lastConnectionError = "";
  private connectionPhase = "idle";
  private roomConnectStartedAt = 0;
  private roomJoinedAt = 0;
  private firstStateAt = 0;
  private progression?: ProgressionSnapshot;
  private lastSpinResult?: DailySpinResult;
  private lastSpinResultToken = 0;
  private progressionError = "";
  private badgeSwipeNotice = "";
  private badgeSwipeNoticeToken = 0;
  private badgeSwipeZone?: { x: number; y: number; width: number; height: number };
  private wasInsideBadgeSwipeZone = false;
  private lastBadgeSwipeAttemptAt = 0;
  private inputBlockReason = "none";
  private externalMoveIntent = { up: false, down: false, left: false, right: false };
  private suppressBrowserScrollKeys?: (event: KeyboardEvent) => void;
  private deskStatusBySlot = new Map<number, Phaser.GameObjects.Text>();
  private focusedOverlay: "shop" | "pet" | "desk" = "shop";
  private shopCursorIndex = 0;
  private shopScrollOffset = 0;
  private shopRowTexts: Phaser.GameObjects.Text[] = [];
  private shopStatusText?: Phaser.GameObjects.Text;
  private shopRowInfo: Array<{ itemIndex: number; text: Phaser.GameObjects.Text }> = [];
  private petCursorIndex = 0;
  private petRowTexts: Phaser.GameObjects.Text[] = [];
  private petRowIcons: Phaser.GameObjects.Image[] = [];
  private petStatusText?: Phaser.GameObjects.Text;
  private deskCursorIndex = 0;
  private deskRowTexts: Phaser.GameObjects.Text[] = [];
  private deskStatusText?: Phaser.GameObjects.Text;
  private readonly PET_KEYS = ["office_dog", "office_cat", "tiny_robot", "pigeon", "otter", "fox_bot"];
  private readonly DESK_SLOTS: Array<"deskStyle" | "chair" | "computer" | "plant" | "mug" | "smallDecoration"> = [
    "deskStyle",
    "chair",
    "computer",
    "plant",
    "mug",
    "smallDecoration"
  ];
  private readonly DESK_SLOT_LABELS: Record<string, string> = {
    deskStyle: "Desk",
    chair: "Chair",
    computer: "Computer",
    plant: "Plant",
    mug: "Mug",
    smallDecoration: "Decoration"
  };

  private readonly shopVisibleRows = 6;
  private readonly BADGE_SWIPE_SIZE = { width: 96, height: 64 };
  private readonly BADGE_SWIPE_ROOMS: RoomId[] = ["my_office", "coffee_bar", "arcade"];
  private readonly BADGE_SWIPE_POINTS: Record<RoomId, Array<{ x: number; y: number }>> = {
    main_office: [
      { x: 160, y: 500 },
      { x: 320, y: 500 },
      { x: 480, y: 500 },
      { x: 640, y: 500 },
      { x: 800, y: 500 },
      { x: 480, y: 272 }
    ],
    my_office: [
      { x: 768, y: 176 }
    ],
    shop: [
      { x: 768, y: 176 }
    ],
    coffee_bar: [
      { x: 768, y: 176 }
    ],
    arcade: [
      { x: 768, y: 176 }
    ],
    rooftop: [
      { x: 160, y: 500 },
      { x: 320, y: 500 },
      { x: 480, y: 500 },
      { x: 640, y: 500 },
      { x: 800, y: 500 },
      { x: 496, y: 384 }
    ]
  };

  constructor() {
    super("OfficeScene");
  }

  private isSceneActiveSafe(): boolean {
    return this.sys.isActive();
  }

  preload() {
    this.load.tilemapTiledJSON("main-office-map", assetPath("/maps/main-office.json"));
    this.load.tilemapTiledJSON("coffee-bar-map", assetPath("/maps/coffee-bar.json"));
    this.load.tilemapTiledJSON("arcade-map", assetPath("/maps/arcade.json"));
    this.load.tilemapTiledJSON("rooftop-map", assetPath("/maps/rooftop.json"));

    // Load pet textures
    this.load.image("office_dog", assetPath("/pets/office_dog.png"));
    this.load.image("office_cat", assetPath("/pets/office_cat.png"));
    this.load.image("tiny_robot", assetPath("/pets/tiny_robot.png"));
    this.load.image("pigeon", assetPath("/pets/pigeon.png"));
    this.load.image("otter", assetPath("/pets/otter.png"));
    this.load.image("fox_bot", assetPath("/pets/fox_bot.png"));
  }

  private ensureOfficeTilesTexture() {
    if (this.textures.exists("office-tiles-image")) {
      return;
    }

    const canvasTexture = this.textures.createCanvas("office-tiles-image", 160, 32);
    if (!canvasTexture) {
      throw new Error("Unable to create office tiles texture.");
    }
    const ctx = canvasTexture.context;

    const paintTile = (index: number, fill: string, accent?: string) => {
      const x = index * 32;
      ctx.fillStyle = fill;
      ctx.fillRect(x, 0, 32, 32);

      if (accent) {
        ctx.fillStyle = accent;
        ctx.fillRect(x + 2, 2, 28, 28);
      }
    };

    paintTile(0, "#6aa6d9", "#82b8e5");
    paintTile(1, "#c2a36a", "#b48a4d");
    paintTile(2, "#5f4b8b", "#7866a8");
    paintTile(3, "#d28f60", "#bc7748");
    paintTile(4, "#1d2742", "#2d3c66");

    // Add subtle checker detail to floor tile.
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    for (let y = 0; y < 32; y += 8) {
      for (let x = 0; x < 32; x += 8) {
        if ((x + y) % 16 === 0) {
          ctx.fillRect(x + 1, y + 1, 6, 6);
        }
      }
    }

    canvasTexture.refresh();
  }

  private getProperty(object: TiledObject, key: string): string {
    const match = object.properties?.find((property) => property.name === key);
    return typeof match?.value === "string" ? match.value : "";
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName);
  }

  private drawObjectLabel(object: TiledObject, label: string, fill: number, stroke: number) {
    const box = this.add
      .rectangle(object.x + object.width / 2, object.y + object.height / 2, object.width, object.height, fill, 0.28)
      .setStrokeStyle(2, stroke)
      .setDepth(500);

    box.setAlpha(0.45);

    const text = this.add
      .text(object.x + object.width / 2, object.y + object.height / 2, label, {
        color: "#ffffff",
        fontFamily: "monospace",
        fontSize: "13px",
        fontStyle: "bold",
        align: "center"
      })
      .setOrigin(0.5)
      .setDepth(501)
      .setBackgroundColor("rgba(7, 10, 18, 0.75)");

    this.sceneObjects.push(box, text);
  }

  private getUtcDayKey(timestampMs: number): string {
    const date = new Date(timestampMs);
    return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
  }

  private hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  private addDailyBadgeSwipeTask(roomId: RoomId) {
    const dayKey = this.getUtcDayKey(Date.now());
    const roomIndex = this.hashString(`${dayKey}-room`) % this.BADGE_SWIPE_ROOMS.length;
    const todayRoom = this.BADGE_SWIPE_ROOMS[roomIndex];
    if (todayRoom !== roomId) {
      return;
    }

    const points = this.BADGE_SWIPE_POINTS[todayRoom];
    const pointIndex = this.hashString(`${dayKey}-${todayRoom}-point`) % points.length;
    const candidate = points[pointIndex];
    const width = this.BADGE_SWIPE_SIZE.width;
    const height = this.BADGE_SWIPE_SIZE.height;
    const zoneX = candidate.x - width / 2;
    const zoneY = candidate.y - height / 2;

    this.badgeSwipeZone = {
      x: zoneX,
      y: zoneY,
      width,
      height
    };

    const taskBox = this.add
      .rectangle(candidate.x, candidate.y, width, height, 0x0ea5e9, 0.24)
      .setStrokeStyle(2, 0xffffff, 0.95)
      .setDepth(520);

    const pinStem = this.add.rectangle(candidate.x, zoneY - 18, 4, 18, 0xffffff, 0.95).setDepth(521);
    const pinHead = this.add.circle(candidate.x, zoneY - 30, 9, 0xef4444, 0.95).setDepth(522);

    const label = this.add
      .text(candidate.x, zoneY - 56, "Find your daily badge swipe", {
        color: "#ffffff",
        fontFamily: "monospace",
        fontSize: "12px",
        fontStyle: "bold",
        align: "center"
      })
      .setOrigin(0.5)
      .setDepth(522)
      .setBackgroundColor("rgba(7, 10, 18, 0.75)");

    this.sceneObjects.push(taskBox, pinStem, pinHead, label);
  }

  private clearRoomVisuals() {
    this.sceneTweens.forEach((tween) => tween.stop());
    this.sceneTweens = [];
    this.sceneObjects.forEach((object) => object.destroy());
    this.sceneObjects = [];
    this.pongVisual = undefined;
    this.badgeSwipeZone = undefined;
    this.wasInsideBadgeSwipeZone = false;
    this.deskStatusBySlot.clear();
    this.shopRowTexts = [];
    this.shopStatusText = undefined;
  }

  private addShopOverlay() {
    const panel = this.add
      .rectangle(770, 200, 240, 260, 0x0a1027, 0.82)
      .setStrokeStyle(2, 0x67e8f9, 0.9)
      .setDepth(690)
      .setScrollFactor(0);

    const title = this.add
      .text(770, 72, "SHOP", {
        color: "#fef6d8",
        fontFamily: "monospace",
        fontSize: "14px",
        fontStyle: "bold"
      })
      .setOrigin(0.5)
      .setDepth(691)
      .setScrollFactor(0);

    const controls = this.add
      .text(770, 88, "Click to select   Enter to buy", {
        color: "#cfe8ff",
        fontFamily: "monospace",
        fontSize: "9px"
      })
      .setOrigin(0.5)
      .setDepth(691)
      .setScrollFactor(0);

    this.sceneObjects.push(panel, title, controls);

    this.shopRowTexts = [];
    this.shopRowInfo = [];
    for (let i = 0; i < this.shopVisibleRows; i += 1) {
      const row = this.add
        .text(650, 110 + i * 22, "", {
          color: "#e2e8f0",
          fontFamily: "monospace",
          fontSize: "10px"
        })
        .setDepth(691)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.onShopItemClick(i));

      this.shopRowTexts.push(row);
      this.sceneObjects.push(row);
    }

    this.shopStatusText = this.add
      .text(770, 260, "", {
        color: "#fef6d8",
        fontFamily: "monospace",
        fontSize: "9px",
        align: "center"
      })
      .setOrigin(0.5)
      .setDepth(691)
      .setScrollFactor(0);
    this.sceneObjects.push(this.shopStatusText);

    this.refreshShopOverlay();
  }

  private refreshShopOverlay() {
    if ((this.currentRoomId !== "my_office" && this.currentRoomId !== "shop") || this.shopRowTexts.length === 0) {
      return;
    }

    const items = this.progression?.shop ?? [];
    if (items.length === 0) {
      this.shopRowTexts.forEach((row, idx) => {
        row.setText(idx === 0 ? "Loading shop items..." : "");
        row.setColor("#94a3b8");
      });

      this.shopStatusText?.setText("Waiting for progression data...");
      return;
    }

    this.shopCursorIndex = Math.max(0, Math.min(items.length - 1, this.shopCursorIndex));
    if (this.shopCursorIndex < this.shopScrollOffset) {
      this.shopScrollOffset = this.shopCursorIndex;
    }
    if (this.shopCursorIndex >= this.shopScrollOffset + this.shopVisibleRows) {
      this.shopScrollOffset = this.shopCursorIndex - this.shopVisibleRows + 1;
    }

    for (let rowIndex = 0; rowIndex < this.shopVisibleRows; rowIndex += 1) {
      const itemIndex = this.shopScrollOffset + rowIndex;
      const row = this.shopRowTexts[rowIndex];

      if (itemIndex >= items.length) {
        row.setText("");
        continue;
      }

      const item = items[itemIndex];
      const selected = itemIndex === this.shopCursorIndex;
      const owned = this.progression?.ownedItems.includes(item.key) ?? false;
      const canAfford = (this.progression?.coins ?? 0) >= item.price;
      const availability = owned ? "owned" : `${item.price}c`;
      row.setText(`${selected ? ">" : " "} ${item.name} [${item.rarity}] ${availability}`);

      if (selected) {
        row.setColor("#fef08a");
      } else if (owned) {
        row.setColor("#86efac");
      } else if (canAfford) {
        row.setColor("#e2e8f0");
      } else {
        row.setColor("#fca5a5");
      }
    }

    const selectedItem = items[this.shopCursorIndex];
    const owned = this.progression?.ownedItems.includes(selectedItem.key) ?? false;
    const canAfford = (this.progression?.coins ?? 0) >= selectedItem.price;
    const status = owned
      ? `${selectedItem.name} already owned`
      : canAfford
        ? `Press Enter to buy ${selectedItem.name} for ${selectedItem.price} coins`
        : `Need ${selectedItem.price - (this.progression?.coins ?? 0)} more coins`;
    this.shopStatusText?.setText(status);
  }

  private onShopItemClick(rowIndex: number) {
    if (this.currentRoomId !== "my_office" && this.currentRoomId !== "shop") {
      return;
    }

    const itemIndex = this.shopScrollOffset + rowIndex;
    const shopItems = this.progression?.shop ?? [];
    if (itemIndex >= shopItems.length) {
      return;
    }

    this.shopCursorIndex = itemIndex;
    this.focusedOverlay = "shop";
    this.refreshShopOverlay();
  }

  private addPetOverlay() {
    const panel = this.add
      .rectangle(170, 200, 240, 260, 0x0a1027, 0.82)
      .setStrokeStyle(2, 0x67e8f9, 0.9)
      .setDepth(690)
      .setScrollFactor(0);

    const title = this.add
      .text(170, 72, "PETS", {
        color: "#fef6d8",
        fontFamily: "monospace",
        fontSize: "14px",
        fontStyle: "bold"
      })
      .setOrigin(0.5)
      .setDepth(691)
      .setScrollFactor(0);

    const controls = this.add
      .text(170, 88, "Click to select   Enter to equip", {
        color: "#cfe8ff",
        fontFamily: "monospace",
        fontSize: "9px"
      })
      .setOrigin(0.5)
      .setDepth(691)
      .setScrollFactor(0);

    this.sceneObjects.push(panel, title, controls);

    this.petRowTexts = [];
    this.petRowIcons = [];
    for (let i = 0; i < 6; i += 1) {
      const icon = this.add
        .image(68, 116 + i * 22, this.PET_KEYS[Math.min(i, this.PET_KEYS.length - 1)])
        .setScale(0.12)
        .setDepth(691)
        .setScrollFactor(0)
        .setVisible(false)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.onPetClick(i));

      const row = this.add
        .text(82, 110 + i * 22, "", {
          color: "#e2e8f0",
          fontFamily: "monospace",
          fontSize: "10px"
        })
        .setDepth(691)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.onPetClick(i));

      this.petRowIcons.push(icon);
      this.petRowTexts.push(row);
      this.sceneObjects.push(icon, row);
    }

    this.petStatusText = this.add
      .text(170, 260, "", {
        color: "#fef6d8",
        fontFamily: "monospace",
        fontSize: "9px",
        align: "center"
      })
      .setOrigin(0.5)
      .setDepth(691)
      .setScrollFactor(0);
    this.sceneObjects.push(this.petStatusText);

    this.refreshPetOverlay();
  }

  private refreshPetOverlay() {
    if (this.currentRoomId !== "my_office" || this.petRowTexts.length === 0) {
      return;
    }

    const pets = this.PET_KEYS;
    if (pets.length === 0) {
      this.petRowTexts.forEach((row, idx) => {
        row.setText(idx === 0 ? "No pets available..." : "");
        row.setColor("#94a3b8");
      });
      this.petRowIcons.forEach(icon => icon.setVisible(false));

      this.petStatusText?.setText("Loading pets...");
      return;
    }

    this.petCursorIndex = Math.max(0, Math.min(pets.length - 1, this.petCursorIndex));

    for (let rowIndex = 0; rowIndex < this.petRowTexts.length; rowIndex += 1) {
      const petIndex = rowIndex;
      const row = this.petRowTexts[rowIndex];
      const icon = this.petRowIcons[rowIndex];

      if (petIndex >= pets.length) {
        row.setText("");
        icon.setVisible(false);
        continue;
      }

      const petKey = pets[petIndex];
      const petName = petKey.replace(/_/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      const selected = petIndex === this.petCursorIndex;
      const equipped = this.progression?.equippedPet === petKey;

      icon.setTexture(petKey);
      icon.setVisible(true);
      row.setText(`${selected ? ">" : " "} ${petName}${equipped ? " [EQUIPPED]" : ""}`);

      if (selected) {
        row.setColor("#fef08a");
      } else if (equipped) {
        row.setColor("#86efac");
      } else {
        row.setColor("#e2e8f0");
      }
    }

    const selectedPet = pets[this.petCursorIndex];
    const selectedPetName = selectedPet.replace(/_/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    const equipped = this.progression?.equippedPet === selectedPet;
    const status = equipped
      ? `${selectedPetName} is currently equipped`
      : `Press Enter to equip ${selectedPetName}`;
    this.petStatusText?.setText(status);
  }

  private addDeskOverlay() {
    const panel = this.add
      .rectangle(470, 200, 240, 220, 0x0a1027, 0.82)
      .setStrokeStyle(2, 0x67e8f9, 0.9)
      .setDepth(690)
      .setScrollFactor(0);

    const title = this.add
      .text(470, 72, "DESK", {
        color: "#fef6d8",
        fontFamily: "monospace",
        fontSize: "14px",
        fontStyle: "bold"
      })
      .setOrigin(0.5)
      .setDepth(691)
      .setScrollFactor(0);

    const controls = this.add
      .text(470, 88, "Click to select   Enter to equip", {
        color: "#cfe8ff",
        fontFamily: "monospace",
        fontSize: "9px"
      })
      .setOrigin(0.5)
      .setDepth(691)
      .setScrollFactor(0);

    this.sceneObjects.push(panel, title, controls);

    this.deskRowTexts = [];
    for (let i = 0; i < this.DESK_SLOTS.length; i += 1) {
      const row = this.add
        .text(350, 110 + i * 20, "", {
          color: "#e2e8f0",
          fontFamily: "monospace",
          fontSize: "10px"
        })
        .setDepth(691)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.onDeskClick(i));

      this.deskRowTexts.push(row);
      this.sceneObjects.push(row);
    }

    this.deskStatusText = this.add
      .text(470, 240, "", {
        color: "#fef6d8",
        fontFamily: "monospace",
        fontSize: "9px",
        align: "center"
      })
      .setOrigin(0.5)
      .setDepth(691)
      .setScrollFactor(0);
    this.sceneObjects.push(this.deskStatusText);

    this.refreshDeskOverlay();
  }

  private refreshDeskOverlay() {
    if (this.currentRoomId !== "my_office" || this.deskRowTexts.length === 0) {
      return;
    }

    const slots = this.DESK_SLOTS;
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const row = this.deskRowTexts[slotIndex];
      const slot = slots[slotIndex];
      const slotLabel = this.DESK_SLOT_LABELS[slot];
      const selected = slotIndex === this.deskCursorIndex;
      const equipped = this.progression?.equippedDesk[slot];
      const itemName = equipped ? equipped.replace(/_/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "None";

      row.setText(`${selected ? ">" : " "} ${slotLabel}: ${itemName}`);

      if (selected) {
        row.setColor("#fef08a");
      } else if (equipped) {
        row.setColor("#86efac");
      } else {
        row.setColor("#e2e8f0");
      }
    }

    const slot = this.DESK_SLOTS[this.deskCursorIndex];
    const slotLabel = this.DESK_SLOT_LABELS[slot];
    const equipped = this.progression?.equippedDesk[slot];
    const itemName = equipped ? equipped.replace(/_/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "None";
    const status = equipped ? `Current: ${itemName}` : `No item equipped`;
    this.deskStatusText?.setText(status);
  }

  private onDeskClick(slotIndex: number) {
    if (this.currentRoomId !== "my_office") {
      return;
    }

    if (slotIndex >= this.DESK_SLOTS.length) {
      return;
    }

    this.deskCursorIndex = slotIndex;
    this.focusedOverlay = "desk";
    this.refreshDeskOverlay();
  }

  private onPetClick(rowIndex: number) {
    if (this.currentRoomId !== "my_office") {
      return;
    }

    const petIndex = rowIndex;
    const pets = this.PET_KEYS;
    if (petIndex >= pets.length) {
      return;
    }

    this.petCursorIndex = petIndex;
    this.focusedOverlay = "pet";
    this.refreshPetOverlay();
  }

  private addRooftopPongVisuals() {
    const board = this.add.rectangle(480, 320, 760, 520, 0x0b1220, 0.42).setStrokeStyle(2, 0x6ee7b7, 0.85);
    const centerLine = this.add.rectangle(480, 320, 4, 500, 0x93c5fd, 0.45);
    const leftPaddle = this.add.rectangle(168, 320, 16, 88, 0x60a5fa, 0.95);
    const rightPaddle = this.add.rectangle(792, 320, 16, 88, 0xf59e0b, 0.95);
    const ball = this.add.circle(480, 320, 8, 0xf8fafc, 1);
    const scoreText = this.add
      .text(480, 86, "0 : 0", {
        color: "#fef6d8",
        fontFamily: "monospace",
        fontSize: "28px"
      })
      .setOrigin(0.5);
    const statusText = this.add
      .text(480, 118, "Waiting for 2 players. Press Enter to join Pong.", {
        color: "#d8cba1",
        fontFamily: "monospace",
        fontSize: "13px"
      })
      .setOrigin(0.5);

    this.sceneObjects.push(board, centerLine, leftPaddle, rightPaddle, ball, scoreText, statusText);
    this.pongVisual = {
      board,
      centerLine,
      leftPaddle,
      rightPaddle,
      ball,
      scoreText,
      statusText
    };
  }

  private updatePongVisuals(pong?: PongSnapshot) {
    if (!this.pongVisual || !pong) {
      return;
    }

    this.pongVisual.leftPaddle.y = pong.leftPaddleY ?? this.pongVisual.leftPaddle.y;
    this.pongVisual.rightPaddle.y = pong.rightPaddleY ?? this.pongVisual.rightPaddle.y;
    this.pongVisual.ball.x = pong.ballX ?? this.pongVisual.ball.x;
    this.pongVisual.ball.y = pong.ballY ?? this.pongVisual.ball.y;

    const leftScore = pong.leftScore ?? 0;
    const rightScore = pong.rightScore ?? 0;
    this.pongVisual.scoreText.setText(`${leftScore} : ${rightScore}`);

    if (pong.status === "live") {
      this.pongVisual.statusText.setText("Pong live. W/S or Up/Down to move paddle. Backspace to leave match.");
    } else if (pong.status === "finished") {
      const winner = pong.winnerId === this.localSessionId ? "You win!" : "Round complete.";
      this.pongVisual.statusText.setText(`${winner} Press Enter to join the next game.`);
    } else {
      this.pongVisual.statusText.setText("Waiting for 2 players. Press Enter to join Pong.");
    }
  }

  private addClubFreewheelEffects() {
    const danceFloor = this.add.rectangle(480, 330, 260, 160, 0x0a1027, 0.26).setStrokeStyle(2, 0x5b8cfa, 0.9);
    danceFloor.setBlendMode(Phaser.BlendModes.ADD);
    this.sceneObjects.push(danceFloor);

    const danceGhostText = this.add
      .text(480, 330, "PRESS SPACE TO DANCE", {
        color: "#e8f4ff",
        fontFamily: "monospace",
        fontSize: "18px",
        fontStyle: "bold"
      })
      .setOrigin(0.5)
      .setAlpha(0.25)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.sceneObjects.push(danceGhostText);

    const ghostTextPulse = this.tweens.add({
      targets: danceGhostText,
      alpha: { from: 0.14, to: 0.42 },
      duration: 760,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut"
    });
    this.sceneTweens.push(ghostTextPulse);

    const danceTip = this.add
      .text(480, 236, "Tip: Space = dance, 1/2/3 = style", {
        color: "#fff4cc",
        fontFamily: "monospace",
        fontSize: "12px"
      })
      .setOrigin(0.5)
      .setBackgroundColor("rgba(18, 26, 46, 0.72)")
      .setPadding(8, 4)
      .setAlpha(0.95);
    this.sceneObjects.push(danceTip);

    const danceTipFade = this.tweens.add({
      targets: danceTip,
      alpha: { from: 0.95, to: 0.5 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut"
    });
    this.sceneTweens.push(danceTipFade);

    const floorPulse = this.tweens.add({
      targets: danceFloor,
      alpha: { from: 0.14, to: 0.42 },
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut"
    });
    this.sceneTweens.push(floorPulse);

    const floorColorTween = this.tweens.addCounter({
      from: 0,
      to: 360,
      duration: 3200,
      repeat: -1,
      onUpdate: (tween) => {
        const hue = tween.getValue() ?? 0;
        const color = Phaser.Display.Color.HSLToColor((hue % 360) / 360, 0.72, 0.56).color;
        danceFloor.setFillStyle(color, 0.22);
      }
    });
    this.sceneTweens.push(floorColorTween);

    const discoBall = this.add.circle(480, 120, 20, 0xe5e7eb, 0.9).setStrokeStyle(2, 0x94a3b8, 1);
    const discoReflection = this.add.rectangle(480, 120, 5, 36, 0xffffff, 0.24);
    const discoBeam = this.add.rectangle(480, 120, 12, 230, 0xa78bfa, 0.16).setOrigin(0.5, 0);
    discoBeam.setBlendMode(Phaser.BlendModes.ADD);
    this.sceneObjects.push(discoBeam, discoBall, discoReflection);

    const discoSpin = this.tweens.add({
      targets: [discoBall, discoReflection],
      angle: "+=360",
      duration: 5800,
      repeat: -1,
      ease: "Linear"
    });
    this.sceneTweens.push(discoSpin);

    const discoSweep = this.tweens.add({
      targets: discoBeam,
      angle: { from: -24, to: 24 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut"
    });
    this.sceneTweens.push(discoSweep);

    const spotlightA = this.add.ellipse(230, 320, 210, 74, 0x22d3ee, 0.16);
    const spotlightB = this.add.ellipse(730, 320, 210, 74, 0xf472b6, 0.16);
    spotlightA.setBlendMode(Phaser.BlendModes.ADD);
    spotlightB.setBlendMode(Phaser.BlendModes.ADD);
    this.sceneObjects.push(spotlightA, spotlightB);

    const spotlightTweenA = this.tweens.add({
      targets: spotlightA,
      x: { from: 210, to: 390 },
      duration: 1900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut"
    });
    const spotlightTweenB = this.tweens.add({
      targets: spotlightB,
      x: { from: 750, to: 570 },
      duration: 1900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut"
    });
    this.sceneTweens.push(spotlightTweenA, spotlightTweenB);

    const djBooth = this.add.rectangle(480, 176, 220, 52, 0x0f172a, 0.9).setStrokeStyle(2, 0x60a5fa, 0.95);
    const speakerLeft = this.add.rectangle(360, 178, 36, 64, 0x111827, 0.95).setStrokeStyle(2, 0x38bdf8, 0.9);
    const speakerRight = this.add.rectangle(600, 178, 36, 64, 0x111827, 0.95).setStrokeStyle(2, 0x38bdf8, 0.9);
    const djLabel = this.add
      .text(480, 177, "DJ Dwarin", {
        color: "#fef6d8",
        fontFamily: "monospace",
        fontSize: "14px"
      })
      .setOrigin(0.5);
    this.sceneObjects.push(djBooth, speakerLeft, speakerRight, djLabel);

    const tableA = this.add.rectangle(260, 446, 84, 30, 0x7c3aed, 0.82).setStrokeStyle(2, 0xc4b5fd, 0.95);
    const tableB = this.add.rectangle(700, 446, 84, 30, 0x7c3aed, 0.82).setStrokeStyle(2, 0xc4b5fd, 0.95);
    const chairA = this.add.rectangle(220, 478, 24, 24, 0x4c1d95, 0.88);
    const chairB = this.add.rectangle(300, 478, 24, 24, 0x4c1d95, 0.88);
    const chairC = this.add.rectangle(660, 478, 24, 24, 0x4c1d95, 0.88);
    const chairD = this.add.rectangle(740, 478, 24, 24, 0x4c1d95, 0.88);
    this.sceneObjects.push(tableA, tableB, chairA, chairB, chairC, chairD);

    const lights = [
      { x: 200, y: 120, color: 0xff4fa3, duration: 700 },
      { x: 480, y: 110, color: 0x40e0d0, duration: 560 },
      { x: 760, y: 120, color: 0xf9f871, duration: 820 },
      { x: 300, y: 220, color: 0x7bf1a8, duration: 640 },
      { x: 660, y: 220, color: 0x83a0ff, duration: 760 }
    ];

    lights.forEach((light, index) => {
      const glow = this.add.circle(light.x, light.y, 145, light.color, 0.06);
      glow.setBlendMode(Phaser.BlendModes.ADD);
      this.sceneObjects.push(glow);

      const tween = this.tweens.add({
        targets: glow,
        alpha: { from: 0.03, to: 0.22 },
        scale: { from: 0.9, to: 1.12 },
        duration: light.duration,
        delay: index * 90,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut"
      });

      this.sceneTweens.push(tween);
    });

    const marquee = this.add
      .text(480, 76, "Club • DJ Dwarin Live", {
        color: "#fef6d8",
        fontFamily: "monospace",
        fontSize: "15px"
      })
      .setOrigin(0.5);
    this.sceneObjects.push(marquee);

    const marqueeTween = this.tweens.add({
      targets: marquee,
      alpha: { from: 0.55, to: 1 },
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut"
    });
    this.sceneTweens.push(marqueeTween);
  }

  private getDisplayName(): string {
    const storedName = window.localStorage.getItem("officeWorld.displayName")?.trim();
    if (storedName) {
      return storedName.slice(0, 20);
    }

    const generatedName = `Coworker${Math.floor(Math.random() * 900 + 100)}`;
    window.localStorage.setItem("officeWorld.displayName", generatedName);
    return generatedName;
  }

  private normalizeJoinedRoomId(value?: string): RoomId | undefined {
    const roomName = (value ?? "").trim().toLowerCase();
    if (roomName === "main_office") {
      return "main_office";
    }
    if (roomName === "my_office") {
      return "my_office";
    }
    if (roomName === "shop") {
      return "shop";
    }
    if (roomName === "coffee_bar") {
      return "coffee_bar";
    }
    if (roomName === "arcade") {
      return "arcade";
    }
    if (roomName === "rooftop") {
      return "rooftop";
    }
    return undefined;
  }

  private getPlayerId(): string {
    const existingId = window.localStorage.getItem("officeWorld.playerId");
    if (existingId) {
      return existingId;
    }

    const newId = `ow_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    window.localStorage.setItem("officeWorld.playerId", newId);
    return newId;
  }

  private publishDebugState() {
    const debugHost = globalThis as unknown as {
      officeWorldDebug?: {
        playerCount: number;
        localSessionId: string;
        connected: boolean;
        roomId: RoomId;
        joinedRoomName: string;
        chatComposing: boolean;
        players: DebugPlayer[];
        endpoint: string;
        activeEndpoint: string;
        inputBlockReason: string;
        lastError: string;
        phase: string;
        transitionStatus: RoomTransitionStatus;
        joinLatencyMs?: number;
        firstStateLatencyMs?: number;
        progression?: ProgressionSnapshot;
        lastSpinResult?: DailySpinResult;
        lastSpinResultToken?: number;
        progressionError?: string;
        badgeSwipeNotice?: string;
        badgeSwipeNoticeToken?: number;
      };
      officeWorldControls?: {
        move: (intent: { up?: boolean; down?: boolean; left?: boolean; right?: boolean }) => void;
        transitionTo: (roomId: RoomId) => void;
        emote: (value: "🎉" | "🕺" | "💃" | "👋") => void;
        setDanceStyle: (value: "shuffle" | "bounce" | "spin") => void;
        toggleDance: () => void;
        joinPong: () => void;
        leavePong: () => void;
        requestProgression: () => void;
        buyShopItem: (itemKey: string) => void;
        equipDeskItem: (slot: DeskSlotKey, itemKey: string) => void;
        badgeSwipe: () => void;
        spinDaily: () => void;
        setUiInputBlocked: (blocked: boolean) => void;
      };
    };

    const players: DebugPlayer[] = [];
    this.avatars.forEach((avatar, id) => {
      players.push({ id, name: avatar.name, status: avatar.status });
    });

    debugHost.officeWorldDebug = {
      playerCount: this.avatars.size,
      localSessionId: this.localSessionId,
      connected: Boolean(this.room),
      roomId: this.currentRoomId,
      joinedRoomName: this.room?.name ?? "",
      chatComposing: this.chatSystem?.isComposing() ?? false,
      players,
      endpoint: this.lastEndpointAttempt,
      activeEndpoint: this.activeEndpoint,
      inputBlockReason: this.inputBlockReason,
      lastError: this.lastConnectionError,
      phase: this.connectionPhase,
      transitionStatus: this.transitionStatus,
      joinLatencyMs:
        this.roomConnectStartedAt > 0 && this.roomJoinedAt > 0
          ? Math.max(0, this.roomJoinedAt - this.roomConnectStartedAt)
          : undefined,
      firstStateLatencyMs:
        this.roomConnectStartedAt > 0 && this.firstStateAt > 0
          ? Math.max(0, this.firstStateAt - this.roomConnectStartedAt)
          : undefined,
      progression: this.progression,
      lastSpinResult: this.lastSpinResult,
      lastSpinResultToken: this.lastSpinResultToken,
      progressionError: this.progressionError,
      badgeSwipeNotice: this.badgeSwipeNotice,
      badgeSwipeNoticeToken: this.badgeSwipeNoticeToken
    };

    debugHost.officeWorldControls = {
      move: (intent) => {
        this.externalMoveIntent = {
          up: Boolean(intent?.up),
          down: Boolean(intent?.down),
          left: Boolean(intent?.left),
          right: Boolean(intent?.right)
        };
        this.sendRoomMessage("move", intent);
      },
      transitionTo: (roomId) => {
        void this.connectToRoom(roomId);
      },
      emote: (value) => {
        this.sendRoomMessage("emote", { emote: value });
      },
      setDanceStyle: (value) => {
        this.selectedDance = value;
        this.roomHintText?.setText(`Dance style: ${value.charAt(0).toUpperCase()}${value.slice(1)}`);
      },
      toggleDance: () => {
        this.sendRoomMessage("dance_toggle", { dance: this.selectedDance });
      },
      joinPong: () => {
        this.sendRoomMessage("pong_join");
      },
      leavePong: () => {
        this.sendRoomMessage("pong_leave");
      },
      requestProgression: () => {
        this.sendRoomMessage("progression_request");
      },
      buyShopItem: (itemKey: string) => {
        this.sendRoomMessage("progression_buy_item", { itemKey });
      },
      equipDeskItem: (slot: DeskSlotKey, itemKey: string) => {
        this.sendRoomMessage("progression_equip_desk", { slot, itemKey });
      },
      badgeSwipe: () => {
        this.sendRoomMessage("progression_badge_swipe");
      },
      spinDaily: () => {
        this.sendRoomMessage("progression_daily_spin");
      },
      setUiInputBlocked: (blocked) => {
        this.uiInputBlocked = blocked;
      }
    };
  }

  private canSendRoomMessage(): boolean {
    if (!this.room) {
      return false;
    }

    const roomWithConnection = this.room as unknown as {
      connection?: {
        readyState?: number;
        ws?: { readyState?: number };
        transport?: { ws?: { readyState?: number } };
      };
    };

    const readyState =
      roomWithConnection.connection?.transport?.ws?.readyState ??
      roomWithConnection.connection?.ws?.readyState ??
      roomWithConnection.connection?.readyState;

    if (typeof readyState === "number") {
      // 1 == OPEN
      return readyState === 1;
    }

    return true;
  }

  private sendRoomMessage(type: string, payload?: unknown): boolean {
    if (!this.canSendRoomMessage()) {
      return false;
    }

    try {
      if (typeof payload === "undefined") {
        this.room?.send(type);
      } else {
        this.room?.send(type, payload as object);
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/websocket|closing|closed/i.test(message)) {
        console.warn(`[client][send_failed] type=${type}:`, error);
      }
      return false;
    }
  }

  private setDanceStyle(style: "shuffle" | "bounce" | "spin") {
    this.selectedDance = style;
    const label = style.charAt(0).toUpperCase() + style.slice(1);
    this.roomHintText?.setText(`Dance style: ${label}`);
  }

  private toggleDance() {
    this.sendRoomMessage("dance_toggle", { dance: this.selectedDance });
  }

  private upsertAvatar(
    sessionId: string,
    x: number,
    y: number,
    name: string,
    status: "active" | "away",
    danceAnimation: string,
    petKey: string,
    emote: string,
    emoteExpiresAt: number
  ) {
    if (!this.isSceneActiveSafe()) {
      return;
    }

    const existing = this.avatars.get(sessionId);
    if (existing) {
      if (!existing.body.active || !existing.nameText.active) {
        this.removeAvatar(sessionId);
      } else {
        existing.targetX = x;
        existing.targetY = y;
        existing.danceBaseX = x;
        existing.danceBaseY = y;
        existing.status = status;
        existing.name = name;
        existing.danceAnimation = danceAnimation;
        existing.emote = emote;
        existing.emoteExpiresAt = emoteExpiresAt;
        existing.applyStatusVisuals();

        const petKeyChanged = existing.petKey !== petKey;
        existing.petKey = petKey;

        if (petKeyChanged && existing.petOrb) {
          existing.petOrb.destroy();
          existing.petOrb = undefined;
        }

        if (petKey && petKey !== "none") {
          if (!existing.petOrb || !existing.petOrb.active) {
            existing.petOrb = this.add.sprite(existing.body.x + 18, existing.body.y + 12, petKey);
            existing.petOrb.setScale(0.09);
          }
        } else if (existing.petOrb) {
          existing.petOrb.destroy();
          existing.petOrb = undefined;
        }

        if (emote && emoteExpiresAt > Date.now()) {
          if (!existing.emoteText || !existing.emoteText.active) {
            existing.emoteText = this.add
              .text(existing.body.x, existing.body.y - 48, emote, {
                color: "#ffffff",
                fontFamily: "monospace",
                fontSize: "22px"
              })
              .setOrigin(0.5);
          }
          existing.emoteText.setText(emote);
          existing.emoteText.setAlpha(1);
        }
        return;
      }
    }

    const isLocal = sessionId === this.localSessionId;
    const avatar = new Player(
      this,
      sessionId,
      x,
      y,
      name,
      status,
      isLocal,
      danceAnimation,
      petKey,
      emote,
      emoteExpiresAt
    );
    this.avatars.set(sessionId, avatar);

    if (emote && emoteExpiresAt > Date.now()) {
      avatar.emoteText = this.add
        .text(x, y - 48, emote, {
          color: "#ffffff",
          fontFamily: "monospace",
          fontSize: "22px"
        })
        .setOrigin(0.5);
    }

    if (isLocal) {
      this.cameras.main.startFollow(avatar.body, true, 0.12, 0.12);
      this.cameras.main.setDeadzone(120, 80);
    }

    this.publishDebugState();
  }

  private removeAvatar(sessionId: string) {
    const existing = this.avatars.get(sessionId);
    if (!existing) {
      return;
    }

    existing.destroy();
    this.avatars.delete(sessionId);
    this.publishDebugState();
  }

  private renderRoom(roomId: RoomId) {
    this.clearRoomVisuals();

    const roomVisual = ROOM_VISUALS[roomId];
    const map = this.make.tilemap({ key: roomVisual.mapKey });
    const tileset = map.addTilesetImage("office-tiles", "office-tiles-image", 32, 32, 0, 0);
    if (!tileset) {
      throw new Error("Unable to load office tileset.");
    }

    const floorLayer = map.createLayer("Floor", tileset, 0, 0);
    if (floorLayer) {
      floorLayer.setDepth(0);
      this.sceneObjects.push(floorLayer);
    }

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    if (roomId === "main_office") {
      const collisionLayer = map.getObjectLayer("Collision");
      collisionLayer?.objects.forEach((shape) => {
        if (!shape.width || !shape.height || shape.x === undefined || shape.y === undefined) {
          return;
        }

        const blocker = this.add.rectangle(
          shape.x + shape.width / 2,
          shape.y + shape.height / 2,
          shape.width,
          shape.height,
          0x0f172a,
          0.08
        );
        blocker.setStrokeStyle(1, 0x1f2937, 0.18);
        blocker.setDepth(-1);
        this.sceneObjects.push(blocker);
      });
    }

    if (roomId === "my_office") {
      this.deskCursorIndex = 0;
    }

    if (roomId === "main_office") {
      const deskLabels = [
        { slot: 1, x: 176, y: 192, label: "Desk 1" },
        { slot: 2, x: 304, y: 192, label: "Desk 2" },
        { slot: 3, x: 432, y: 192, label: "Desk 3" },
        { slot: 4, x: 560, y: 192, label: "Desk 4" },
        { slot: 5, x: 176, y: 352, label: "Desk 5" },
        { slot: 6, x: 304, y: 352, label: "Desk 6" },
        { slot: 7, x: 432, y: 352, label: "Desk 7" },
        { slot: 8, x: 560, y: 352, label: "Desk 8" }
      ];

      deskLabels.forEach((desk) => {
        const label = this.add
          .text(desk.x, desk.y, desk.label, {
            color: "#fef6d8",
            fontFamily: "monospace",
            fontSize: "12px"
          })
          .setOrigin(0.5);

        const status = this.add
          .text(desk.x, desk.y + 18, "Unclaimed", {
            color: "#a4e1ff",
            fontFamily: "monospace",
            fontSize: "8px",
            align: "center"
          })
          .setOrigin(0.5)
          .setWordWrapWidth(114, true);

        this.deskStatusBySlot.set(desk.slot, status);
        this.sceneObjects.push(label, status);
      });

      const portalHints = [
        { x: 704, y: 592, label: "Shop" },
        { x: 840, y: 592, label: "My Office" }
      ];

      portalHints.forEach((hint) => {
        const text = this.add
          .text(hint.x, hint.y, hint.label, {
            color: "#93c5fd",
            fontFamily: "monospace",
            fontSize: "11px"
          })
          .setOrigin(0.5);
        this.sceneObjects.push(text);
      });
    }

    if (roomId !== "rooftop") {
      const portalLayer = map.getObjectLayer("Portals");
      (portalLayer?.objects as TiledObject[] | undefined)?.forEach((portal) => {
        const destination = this.getProperty(portal, "destination") || portal.name;
        this.drawObjectLabel(portal, destination, 0xf59e0b, 0xffffff);
      });
    }

    // Intentionally skip LockedEntrances overlay labels to keep the map UI clear.

    this.addDailyBadgeSwipeTask(roomId);

    if (roomId === "arcade") {
      this.addClubFreewheelEffects();
    }

    if (roomId === "rooftop") {
      this.addRooftopPongVisuals();
    }

    if (roomId === "my_office") {
      this.addShopOverlay();
      this.addPetOverlay();
      this.addDeskOverlay();
    }

    this.roomTitleText?.setText(roomVisual.displayName);
  }

  private updateDeskStatuses(state: any) {
    if (this.currentRoomId !== "main_office" || this.deskStatusBySlot.size === 0) {
      return;
    }

    this.deskStatusBySlot.forEach((text) => {
      text.setText("Unclaimed");
      text.setColor("#a4e1ff");
    });

    state.players?.forEach?.((player: any) => {
      const slot = Number(player.deskSlotIndex ?? 0);
      const target = this.deskStatusBySlot.get(slot);
      if (!target) {
        return;
      }

      const compactItemLabel = (entry: unknown) =>
        String(entry ?? "")
          .replace(/^starter_/, "")
          .replace(/_/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 8);

      const deskSummary = [player.deskStyle, player.chair, player.computer]
        .filter((entry) => typeof entry === "string" && entry.length > 0)
        .map((entry) => compactItemLabel(entry))
        .slice(0, 2)
        .join("+");
      const shortName = String(player.name ?? "Coworker").slice(0, 8);
      target.setText(`${shortName}: ${deskSummary || "starter"}`);
      target.setColor("#fef6d8");
    });
  }

  private normalizeEndpoint(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
      return trimmed.replace(/\/$/, "");
    }

    if (trimmed.startsWith("http://")) {
      return trimmed.replace(/^http:\/\//, "ws://").replace(/\/$/, "");
    }

    if (trimmed.startsWith("https://")) {
      return trimmed.replace(/^https:\/\//, "wss://").replace(/\/$/, "");
    }

    return "";
  }

  private getEndpointCandidates(): { isLocalHost: boolean; endpoints: string[] } {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const localDefaultEndpoint = `${protocol}://localhost:2567`;
    const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const explicitEndpoint = import.meta.env.VITE_COLYSEUS_URL?.trim();
    const productionDefaultEndpoint = "wss://game-production-d3b2.up.railway.app";
    const normalizedExplicitEndpoint = explicitEndpoint ? this.normalizeEndpoint(explicitEndpoint) : "";

    const endpointCandidates = isLocalHost
      ? [localDefaultEndpoint]
      : normalizedExplicitEndpoint
        ? [normalizedExplicitEndpoint]
        : [productionDefaultEndpoint];

    return {
      isLocalHost,
      endpoints: [...new Set(endpointCandidates)]
    };
  }

  private ensureClientForEndpoint(endpoint: string) {
    if (this.colyseusClient && this.activeEndpoint === endpoint) {
      return;
    }

    this.colyseusClient = new ColyseusClient(endpoint);
    this.activeEndpoint = endpoint;
  }

  private async connectToRoom(targetRoomId: RoomId, options?: ConnectRoomOptions) {
    if (this.transitioning) {
      this.queuedTransition = { roomId: targetRoomId, options };
      return;
    }

    if (targetRoomId === this.currentRoomId && this.room && !options?.preservePosition) {
      return;
    }

    const previousRoomId = this.currentRoomId;
    const previousRoom = this.room;
    const transitionToken = ++this.transitionToken;
    this.transitioning = true;
    this.transitionStatus = "preparing";

    const preservePosition = Boolean(options?.preservePosition);
    const localAvatarBeforeReconnect = preservePosition ? this.avatars.get(this.localSessionId) : undefined;
    const reconnectX = localAvatarBeforeReconnect ? Math.round(localAvatarBeforeReconnect.targetX) : undefined;
    const reconnectY = localAvatarBeforeReconnect ? Math.round(localAvatarBeforeReconnect.targetY) : undefined;
    const endpointConfig = this.getEndpointCandidates();
    const uniqueEndpointCandidates = endpointConfig.endpoints;

    this.connectionPhase = "connecting";
    this.roomConnectStartedAt = Date.now();
    this.roomJoinedAt = 0;
    this.firstStateAt = 0;
    this.connectionText?.setText("Connecting...");

    if (transitionToken !== this.transitionToken) {
      return;
    }

    if (!endpointConfig.isLocalHost && uniqueEndpointCandidates.length === 0) {
      this.lastEndpointAttempt = "not-configured";
      this.lastConnectionError =
        "Production backend is not configured. Set VITE_COLYSEUS_URL to your Colyseus server URL (wss://...).";
      this.connectionPhase = "connection_failed";
      this.transitionStatus = "failed";
      this.publishDebugState();
      this.connectionText?.setText("Connection failed");
      this.roomHintText?.setText("Set VITE_COLYSEUS_URL and redeploy");
      this.transitioning = false;
      return;
    }

    try {
      let joinedRoom: ColyseusRoom | undefined;
      let lastJoinError: unknown;
      this.lastConnectionError = "";
      this.transitionStatus = "joining";
      this.connectionPhase = "seat_reserving";

      for (const endpoint of uniqueEndpointCandidates) {
        try {
          this.lastEndpointAttempt = endpoint;
          this.publishDebugState();
          this.ensureClientForEndpoint(endpoint);

          // Validate matchmake payload shape before consuming seat reservation.
          // Some deployment edge paths may return non-Colyseus JSON/HTML, which
          // otherwise crashes inside colyseus.js at response.room.name.
          const matchmakingResponse = (
            await (this.colyseusClient as unknown as {
              http: {
                post: (path: string, options: { headers: Record<string, string>; body: string }) => Promise<{ data: any }>;
              };
            }).http.post(`matchmake/joinOrCreate/${targetRoomId}`, {
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                name: this.getDisplayName(),
                playerId: this.getPlayerId(),
                reconnectX,
                reconnectY
              })
            })
          ).data;

          if (matchmakingResponse?.error) {
            throw new Error(
              `Matchmake failed (${matchmakingResponse.code ?? "unknown"}): ${String(matchmakingResponse.error)}`
            );
          }

          if (
            !matchmakingResponse ||
            typeof matchmakingResponse !== "object" ||
            !matchmakingResponse.room ||
            typeof matchmakingResponse.room.name !== "string" ||
            typeof matchmakingResponse.room.roomId !== "string" ||
            typeof matchmakingResponse.sessionId !== "string"
          ) {
            throw new Error(`Invalid seat reservation response from ${endpoint}`);
          }

          joinedRoom = await (
            this.colyseusClient as unknown as {
              consumeSeatReservation: (response: any, rootSchema?: unknown, reuseRoomInstance?: unknown) => Promise<ColyseusRoom>;
            }
          ).consumeSeatReservation(matchmakingResponse);

          if (transitionToken !== this.transitionToken) {
            await joinedRoom.leave().catch(() => undefined);
            return;
          }

          break;
        } catch (error) {
          lastJoinError = error;
          this.lastConnectionError = error instanceof Error ? error.message : String(error);

          if (this.activeEndpoint === endpoint) {
            this.colyseusClient = undefined;
            this.activeEndpoint = "";
          }

          this.publishDebugState();
          console.warn(`Join failed for endpoint ${endpoint}:`, error);
        }
      }

      if (!joinedRoom) {
        throw lastJoinError ?? new Error("Unable to join room from any endpoint candidate.");
      }

      this.transitionStatus = "switching";
      this.roomBindingToken += 1;

      if (previousRoom && previousRoom !== joinedRoom) {
        try {
          await previousRoom.leave();
        } catch (error) {
          console.warn("Error while leaving previous room:", error);
        }
      }

      this.avatars.forEach((avatar) => {
        avatar.destroy();
      });
      this.avatars.clear();
      this.lastIntentSignature = "";

      this.room = joinedRoom;
      this.lastConnectionError = "";
      this.connectionPhase = "room_joined";
      this.transitionStatus = "ready";
      this.roomJoinedAt = Date.now();
      this.ignoreTransitionRoomUntil = Date.now() + 2200;
      this.localSessionId = joinedRoom.sessionId;

      const joinedRoomId = this.normalizeJoinedRoomId(joinedRoom.name) ?? targetRoomId;
      if (joinedRoomId !== this.currentRoomId) {
        this.currentRoomId = joinedRoomId;
      }
      this.renderRoom(this.currentRoomId);

      this.connectionText?.setText("Connected");
      this.roomHintText?.setText(
        joinedRoomId === "rooftop"
          ? "Enter: join pong, Backspace: leave pong, W/S or arrows move paddle. / or T opens chat."
          : joinedRoomId === "arcade"
            ? "Space to dance. 1/2/3 styles. Z/X/C/V emotes. / or T opens chat."
            : joinedRoomId === "my_office"
              ? "Customize pet and desk from the player panel. Click items to shop, Enter to buy. / or T opens chat."
            : "Use portal zones to change rooms. / or T opens chat."
      );

      if (joinedRoomId === "rooftop") {
        this.sendRoomMessage("pong_join");
      }

      const activeBindingToken = this.roomBindingToken;

      joinedRoom.onStateChange((state: any) => {
        if (activeBindingToken !== this.roomBindingToken || !this.isSceneActiveSafe()) {
          return;
        }

        const seen = new Set<string>();

        if (state.players?.forEach) {
          state.players.forEach((player: any, sessionId: string) => {
            seen.add(sessionId);
            this.upsertAvatar(
              sessionId,
              player.x,
              player.y,
              player.name,
              player.status ?? "active",
              player.danceAnimation ?? "none",
              player.petKey ?? "",
              player.emote ?? "",
              player.emoteExpiresAt ?? 0
            );
          });
        }

        this.avatars.forEach((_avatar, sessionId) => {
          if (!seen.has(sessionId)) {
            this.removeAvatar(sessionId);
          }
        });

        if (this.currentRoomId === "rooftop") {
          this.updatePongVisuals(state.pong as PongSnapshot | undefined);
        }

        this.updateDeskStatuses(state);

        if (this.connectionPhase !== "state_received") {
          this.connectionPhase = "state_received";
          this.firstStateAt = Date.now();
          const joinLatencyMs = this.roomJoinedAt > 0 ? this.roomJoinedAt - this.roomConnectStartedAt : -1;
          const firstStateLatencyMs = this.firstStateAt - this.roomConnectStartedAt;
          console.log(
            `[client][connect_timing] room=${this.currentRoomId} joinLatencyMs=${joinLatencyMs} firstStateLatencyMs=${firstStateLatencyMs}`
          );
        }
        this.publishDebugState();
      });

      joinedRoom.onMessage("progression_snapshot", (payload: ProgressionSnapshot) => {
        if (activeBindingToken !== this.roomBindingToken || !this.isSceneActiveSafe()) {
          return;
        }

        this.progression = payload;
        this.progressionError = "";
        this.refreshShopOverlay();
        this.publishDebugState();
      });

      joinedRoom.onMessage("daily_spin_result", (payload: DailySpinResult) => {
        if (activeBindingToken !== this.roomBindingToken || !this.isSceneActiveSafe()) {
          return;
        }

        this.lastSpinResult = payload;
        this.lastSpinResultToken += 1;
        this.progressionError = "";
        this.publishDebugState();
      });

      joinedRoom.onMessage("progression_error", (payload: { message?: string }) => {
        if (activeBindingToken !== this.roomBindingToken || !this.isSceneActiveSafe()) {
          return;
        }

        this.progressionError = payload.message ?? "Progression action failed.";
        this.refreshShopOverlay();
        this.publishDebugState();
      });

      joinedRoom.onMessage("badge_swipe_logged", (payload: { message?: string }) => {
        if (activeBindingToken !== this.roomBindingToken || !this.isSceneActiveSafe()) {
          return;
        }

        this.badgeSwipeNotice = payload.message ?? "Badge swipe was logged.";
        this.badgeSwipeNoticeToken += 1;
        this.progressionError = "";
        this.publishDebugState();
      });

      joinedRoom.onMessage("chat_message", (payload: { sessionId?: string; message?: string }) => {
        if (activeBindingToken !== this.roomBindingToken || !this.isSceneActiveSafe()) {
          return;
        }

        const sessionId = payload.sessionId?.trim() ?? "";
        const message = payload.message?.trim() ?? "";
        if (!sessionId || !message) {
          return;
        }

        this.chatSystem?.handleIncomingChat(sessionId, message);
      });

      joinedRoom.onMessage("transition_room", (payload: { roomId?: RoomId }) => {
        if (activeBindingToken !== this.roomBindingToken || !this.isSceneActiveSafe()) {
          return;
        }

        if (Date.now() < this.ignoreTransitionRoomUntil) {
          return;
        }

        if (!payload?.roomId || payload.roomId === this.currentRoomId) {
          return;
        }

        this.transitionDebugText?.setText(
          `Portal: ${ROOM_VISUALS[this.currentRoomId].displayName} -> ${ROOM_VISUALS[payload.roomId].displayName}`
        );
        this.transitionDebugText?.setVisible(true);
        this.time.delayedCall(2500, () => {
          this.transitionDebugText?.setVisible(false);
        });
        this.connectionText?.setText(`Transitioning to ${ROOM_VISUALS[payload.roomId].displayName}...`);
        void this.connectToRoom(payload.roomId);
      });

      joinedRoom.onLeave(() => {
        if (activeBindingToken !== this.roomBindingToken || !this.isSceneActiveSafe()) {
          return;
        }

        if (!this.transitioning) {
          this.room = undefined;
          this.localSessionId = "";
          this.connectionPhase = "disconnected";
          this.transitionStatus = "failed";
          this.publishDebugState();
          this.connectionText?.setText("Disconnected. Reconnecting...");
          this.time.delayedCall(350, () => {
            if (!this.isSceneActiveSafe() || this.transitioning) {
              return;
            }
            void this.connectToRoom(this.currentRoomId, { preservePosition: true, suppressRollback: true });
          });
        }
      });

      joinedRoom.onError((code, message) => {
        if (activeBindingToken !== this.roomBindingToken || !this.isSceneActiveSafe()) {
          return;
        }

        this.lastConnectionError = `Room error ${code}: ${message ?? "unknown"}`;
        this.connectionPhase = "room_error";
        this.transitionStatus = "failed";
        this.publishDebugState();
        this.connectionText?.setText(`Error ${code}`);
        console.error("Colyseus room error:", message);

        if (!this.transitioning) {
          this.room = undefined;
          this.localSessionId = "";
          this.time.delayedCall(350, () => {
            if (!this.isSceneActiveSafe() || this.transitioning) {
              return;
            }
            void this.connectToRoom(this.currentRoomId, { preservePosition: true, suppressRollback: true });
          });
        }
      });

      this.sendRoomMessage("progression_request");

      this.publishDebugState();
    } catch (error) {
      this.lastConnectionError = error instanceof Error ? error.message : String(error);
      this.connectionPhase = "connection_failed";
      this.transitionStatus = "failed";
      this.publishDebugState();
      this.connectionText?.setText("Connection failed");
      if (/provided room name\s+".+"\s+not defined/i.test(this.lastConnectionError)) {
        this.roomHintText?.setText("Target room is not deployed on backend yet.");
      } else {
        this.roomHintText?.setText("Check server connection and retry");
      }
      console.error("Unable to join room:", error);
    } finally {
      if (transitionToken !== this.transitionToken) {
        return;
      }

      this.transitioning = false;

      const queued = this.queuedTransition;
      this.queuedTransition = undefined;
      if (queued && (queued.roomId !== this.currentRoomId || Boolean(queued.options?.preservePosition))) {
        void this.connectToRoom(queued.roomId, queued.options);
      }
    }
  }

  create() {
    this.cameras.main.setBackgroundColor("#1f2a44");

    this.ensureOfficeTilesTexture();

    this.roomTitleText = this.add.text(32, 20, "Loading...", {
      color: "#fef6d8",
      fontFamily: "monospace",
      fontSize: "24px"
    })
      .setScrollFactor(0)
      .setDepth(100);

    this.roomHintText = this.add.text(32, 50, "Arrow keys to move. / or T opens chat.", {
      color: "#d8cba1",
      fontFamily: "monospace",
      fontSize: "14px"
    })
      .setScrollFactor(0)
      .setDepth(100);

    this.chatHintText = this.add
      .text(478, 18, "PRESS T TO CHAT", {
        color: "#fef08a",
        fontFamily: "monospace",
        fontSize: "13px",
        fontStyle: "bold",
        stroke: "#0b1020",
        strokeThickness: 4
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2300)
      .setBackgroundColor("rgba(7, 10, 18, 0.84)")
      .setPadding(10, 6);

    this.connectionText = this.add.text(32, 74, "Offline", {
      color: "#fef6d8",
      fontFamily: "monospace",
      fontSize: "12px"
    })
      .setScrollFactor(0)
      .setDepth(100);

    this.transitionDebugText = this.add.text(32, 92, "", {
      color: "#93c5fd",
      fontFamily: "monospace",
      fontSize: "11px"
    })
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false);

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.input.keyboard?.disableGlobalCapture();

    this.suppressBrowserScrollKeys = (event: KeyboardEvent) => {
      if (this.uiInputBlocked || this.isEditableTarget(event.target)) {
        return;
      }

      const movementCodes = new Set([
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD"
      ]);

      if (movementCodes.has(event.code)) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", this.suppressBrowserScrollKeys, { passive: false });

    this.keys = this.input.keyboard
      ? {
          space: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false),
          one: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE, false),
          two: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO, false),
          three: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE, false),
          z: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z, false),
          x: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X, false),
          c: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C, false),
          v: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V, false),
          enter: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER, false),
          backspace: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.BACKSPACE, false)
        }
      : undefined;

    // Keep form fields usable (email modal) by allowing browser-default
    // key behavior while still reading key state in-game.
    this.input.keyboard?.removeCapture([
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.Z,
      Phaser.Input.Keyboard.KeyCodes.X,
      Phaser.Input.Keyboard.KeyCodes.C,
      Phaser.Input.Keyboard.KeyCodes.V,
      Phaser.Input.Keyboard.KeyCodes.ENTER,
      Phaser.Input.Keyboard.KeyCodes.DELETE,
      Phaser.Input.Keyboard.KeyCodes.BACKSPACE
    ]);

    this.chatSystem = new ChatSystem({
      scene: this,
      findPlayerBySessionId: (sessionId: string) => this.avatars.get(sessionId),
      isUiInputBlocked: () => this.uiInputBlocked,
      sendMessage: (message: string) => {
        this.sendRoomMessage("chat_message", { message });
      },
      onComposeStateChange: () => {
        this.publishDebugState();
      }
    });
    this.chatSystem.start();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.shutdown();
    });

    this.renderRoom(this.currentRoomId);
    void this.connectToRoom(this.currentRoomId);
  }

  update() {
    if (!this.cursors || !this.keys) {
      return;
    }

    const now = this.time.now;
    const activeElement = document.activeElement as HTMLElement | null;
    const isDomInputFocused = Boolean(
      activeElement &&
        (activeElement.isContentEditable ||
          activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.tagName === "SELECT")
    );
    const blockGameInput = this.uiInputBlocked || isDomInputFocused;
    const nextInputBlockReason = this.uiInputBlocked
      ? "ui_input_blocked"
      : isDomInputFocused
        ? `dom_focus:${activeElement?.tagName.toLowerCase() ?? "unknown"}`
        : "none";
    if (nextInputBlockReason !== this.inputBlockReason) {
      this.inputBlockReason = nextInputBlockReason;
      this.publishDebugState();
    }

    if (blockGameInput) {
      if (this.room && !this.transitioning && (this.lastIntentSignature !== "0000" || now - this.lastMoveSentAt > 160)) {
        this.sendRoomMessage("move", { up: false, down: false, left: false, right: false });
        this.lastIntentSignature = "0000";
        this.lastMoveSentAt = now;
      }

      if (this.currentRoomId === "rooftop" && this.room && (this.lastPongInputSignature !== "00" || now - this.lastPongInputSentAt > 160)) {
        this.sendRoomMessage("pong_input", { up: false, down: false });
        this.lastPongInputSignature = "00";
        this.lastPongInputSentAt = now;
      }

      return;
    }

    const isComposingChat = this.chatSystem?.isComposing() ?? false;
    const up = !isComposingChat && (this.cursors.up.isDown || this.externalMoveIntent.up);
    const down = !isComposingChat && (this.cursors.down.isDown || this.externalMoveIntent.down);
    const left = !isComposingChat && (this.cursors.left.isDown || this.externalMoveIntent.left);
    const right = !isComposingChat && (this.cursors.right.isDown || this.externalMoveIntent.right);

    const intentSignature = `${Number(up)}${Number(down)}${Number(left)}${Number(right)}`;

    if (!isComposingChat && Phaser.Input.Keyboard.JustDown(this.keys.one)) {
      this.setDanceStyle("shuffle");
    }
    if (!isComposingChat && Phaser.Input.Keyboard.JustDown(this.keys.two)) {
      this.setDanceStyle("bounce");
    }
    if (!isComposingChat && Phaser.Input.Keyboard.JustDown(this.keys.three)) {
      this.setDanceStyle("spin");
    }

    if (!isComposingChat && Phaser.Input.Keyboard.JustDown(this.keys.space)) {
      this.toggleDance();
    }

    if (this.currentRoomId === "rooftop" && this.room) {
      if (!isComposingChat && Phaser.Input.Keyboard.JustDown(this.keys.enter)) {
        this.sendRoomMessage("pong_join");
      }

      if (!isComposingChat && Phaser.Input.Keyboard.JustDown(this.keys.backspace)) {
        this.sendRoomMessage("pong_leave");
      }

      const pongSignature = `${Number(up)}${Number(down)}`;
      if (pongSignature !== this.lastPongInputSignature || now - this.lastPongInputSentAt > 70) {
        this.sendRoomMessage("pong_input", { up, down });
        this.lastPongInputSignature = pongSignature;
        this.lastPongInputSentAt = now;
      }
    }

    if ((this.currentRoomId === "my_office" || this.currentRoomId === "shop") && this.room) {
      const shopItems = this.progression?.shop ?? [];
      if (!isComposingChat && shopItems.length > 0 && this.focusedOverlay === "shop") {
        if (Phaser.Input.Keyboard.JustDown(this.keys.enter)) {
          const selected = shopItems[this.shopCursorIndex];
          const owned = this.progression?.ownedItems.includes(selected.key) ?? false;
          const canAfford = (this.progression?.coins ?? 0) >= selected.price;

          if (!owned && canAfford) {
            this.sendRoomMessage("progression_buy_item", { itemKey: selected.key });
          }
        }
      }
    }

    if (this.currentRoomId === "my_office" && this.room) {
      const pets = this.PET_KEYS;
      if (!isComposingChat && pets.length > 0 && this.focusedOverlay === "pet") {
        if (Phaser.Input.Keyboard.JustDown(this.keys.enter)) {
          const selected = pets[this.petCursorIndex];
          this.sendRoomMessage("progression_equip_pet", { petKey: selected });
        }
      }

      if (!isComposingChat && this.focusedOverlay === "desk") {
        if (Phaser.Input.Keyboard.JustDown(this.keys.enter)) {
          const slot = this.DESK_SLOTS[this.deskCursorIndex];
          const currentItem = this.progression?.equippedDesk[slot];
          if (currentItem) {
            this.sendRoomMessage("progression_equip_desk", { slot, itemKey: currentItem });
          }
        }
      }
    }

    if (this.room && !isComposingChat && now - this.lastEmoteSentAt > 200) {
      const emoteKeys: Array<{ key: Phaser.Input.Keyboard.Key; value: "🎉" | "🕺" | "💃" | "👋" }> = [
        { key: this.keys.z, value: "🎉" },
        { key: this.keys.x, value: "🕺" },
        { key: this.keys.c, value: "💃" },
        { key: this.keys.v, value: "👋" }
      ];

      const pressed = emoteKeys.find((entry) => Phaser.Input.Keyboard.JustDown(entry.key));
      if (pressed) {
        this.sendRoomMessage("emote", { emote: pressed.value });
        this.lastEmoteSentAt = now;
      }
    }

    if (this.room && !this.transitioning && (intentSignature !== this.lastIntentSignature || now - this.lastMoveSentAt > 80)) {
      this.sendRoomMessage("move", { up, down, left, right });
      this.lastIntentSignature = intentSignature;
      this.lastMoveSentAt = now;
    }

    this.avatars.forEach((avatar, sessionId) => {
      const easing = sessionId === this.localSessionId ? 0.45 : 0.3;
      avatar.danceBaseX = Phaser.Math.Linear(avatar.danceBaseX, avatar.targetX, easing);
      avatar.danceBaseY = Phaser.Math.Linear(avatar.danceBaseY, avatar.targetY, easing);

      let danceOffsetX = 0;
      let danceOffsetY = 0;
      let danceAngle = 0;

      if (avatar.danceAnimation === "shuffle") {
        danceOffsetX = Math.sin(now / 85) * 4;
      } else if (avatar.danceAnimation === "bounce") {
        danceOffsetY = -Math.abs(Math.sin(now / 95)) * 8;
      } else if (avatar.danceAnimation === "spin") {
        danceAngle = (now / 4) % 360;
      }

      avatar.body.x = avatar.danceBaseX + danceOffsetX;
      avatar.body.y = avatar.danceBaseY + danceOffsetY;
      avatar.body.setAngle(danceAngle);
      avatar.nameText.setPosition(avatar.body.x, avatar.body.y - 24);

      if (avatar.petOrb) {
        const petTargetX = avatar.body.x + (sessionId === this.localSessionId ? -18 : 18);
        const petTargetY = avatar.body.y + 12;
        avatar.petOrb.x = Phaser.Math.Linear(avatar.petOrb.x, petTargetX, 0.2);
        avatar.petOrb.y = Phaser.Math.Linear(avatar.petOrb.y, petTargetY, 0.2);
      }

      if (avatar.emoteText) {
        const visible = avatar.emote && avatar.emoteExpiresAt > Date.now();
        if (visible) {
          avatar.emoteText.setPosition(avatar.body.x, avatar.body.y - 48);
          avatar.emoteText.setAlpha(Math.min(1, (avatar.emoteExpiresAt - Date.now()) / 900 + 0.1));
        } else {
          avatar.emoteText.destroy();
          avatar.emoteText = undefined;
        }
      }

      avatar.updateSpeechBubblePosition();
    });

    if (this.room && this.badgeSwipeZone) {
      const localAvatar = this.avatars.get(this.localSessionId);
      const isInsideZone =
        Boolean(localAvatar) &&
        localAvatar!.body.x >= this.badgeSwipeZone.x &&
        localAvatar!.body.x <= this.badgeSwipeZone.x + this.badgeSwipeZone.width &&
        localAvatar!.body.y >= this.badgeSwipeZone.y &&
        localAvatar!.body.y <= this.badgeSwipeZone.y + this.badgeSwipeZone.height;

      if (isInsideZone && !this.wasInsideBadgeSwipeZone) {
        if (now - this.lastBadgeSwipeAttemptAt > 1000) {
          this.sendRoomMessage("progression_badge_swipe");
          this.lastBadgeSwipeAttemptAt = now;
        }
      }

      this.wasInsideBadgeSwipeZone = isInsideZone;
    } else {
      this.wasInsideBadgeSwipeZone = false;
    }

    if (this.currentRoomId === "shop") {
      this.refreshShopOverlay();
    }
  }

  shutdown() {
    this.roomBindingToken += 1;

    if (this.room) {
      void this.room.leave();
      this.room = undefined;
    }

    this.transitioning = false;
    this.transitionStatus = "idle";
    this.activeEndpoint = "";
    if (this.suppressBrowserScrollKeys) {
      window.removeEventListener("keydown", this.suppressBrowserScrollKeys);
      this.suppressBrowserScrollKeys = undefined;
    }
    this.lastPongInputSignature = "";
    this.chatSystem?.destroy();
    this.chatSystem = undefined;
    this.chatHintText?.destroy();
    this.chatHintText = undefined;
    this.transitionDebugText = undefined;

    this.avatars.forEach((avatar) => {
      avatar.destroy();
    });
    this.avatars.clear();
    this.clearRoomVisuals();
    this.publishDebugState();
  }
}

export function createOfficeWorldGame(parent: HTMLDivElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 640,
    pixelArt: true,
    backgroundColor: "#1f2a44",
    scene: [OfficeScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    }
  });
}
