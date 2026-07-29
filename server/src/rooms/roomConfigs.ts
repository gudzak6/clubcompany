export type RoomId = "main_office" | "my_office" | "shop" | "coffee_bar" | "arcade" | "rooftop";

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PortalZone = Rect & {
  targetRoomId: RoomId;
};

export type RoomConfig = {
  id: RoomId;
  displayName: string;
  spawn: { x: number; y: number };
  collisionRects: Rect[];
  portals: PortalZone[];
  danceFloor?: Rect;
};

const mainOfficeCollisions: Rect[] = [
  { x: 384, y: 96, width: 192, height: 64 },
  { x: 128, y: 160, width: 96, height: 64 },
  { x: 256, y: 160, width: 96, height: 64 },
  { x: 384, y: 160, width: 96, height: 64 },
  { x: 512, y: 160, width: 96, height: 64 },
  { x: 128, y: 320, width: 96, height: 64 },
  { x: 256, y: 320, width: 96, height: 64 },
  { x: 384, y: 320, width: 96, height: 64 },
  { x: 512, y: 320, width: 96, height: 64 }
];

const loungeCollisions: Rect[] = [
  { x: 224, y: 192, width: 192, height: 64 },
  { x: 544, y: 192, width: 192, height: 64 },
  { x: 320, y: 384, width: 320, height: 64 },
  { x: 96, y: 96, width: 64, height: 64 },
  { x: 800, y: 96, width: 64, height: 64 }
];

const myOfficeCollisions: Rect[] = [];

const coffeeBarCollisions: Rect[] = [
  { x: 224, y: 192, width: 192, height: 64 },
  { x: 544, y: 192, width: 192, height: 64 },
  { x: 96, y: 96, width: 64, height: 64 },
  { x: 800, y: 96, width: 64, height: 64 }
];

const arcadeCollisions: Rect[] = [
  { x: 224, y: 192, width: 192, height: 64 },
  { x: 544, y: 192, width: 192, height: 64 },
  // Split the lower counter to leave a center lane into the dance floor.
  { x: 320, y: 384, width: 120, height: 64 },
  { x: 520, y: 384, width: 120, height: 64 },
  { x: 96, y: 96, width: 64, height: 64 },
  { x: 800, y: 96, width: 64, height: 64 }
];

export const ROOM_CONFIGS: Record<RoomId, RoomConfig> = {
  main_office: {
    id: "main_office",
    displayName: "Main Office",
    spawn: { x: 496, y: 560 },
    collisionRects: mainOfficeCollisions,
    portals: [
      { x: 64, y: 544, width: 96, height: 64, targetRoomId: "coffee_bar" },
      { x: 176, y: 544, width: 96, height: 64, targetRoomId: "arcade" },
      { x: 288, y: 544, width: 96, height: 64, targetRoomId: "rooftop" },
      // Expanded hitbox around ToPersonalOffice so transitions are easier to trigger.
      { x: 720, y: 500, width: 200, height: 120, targetRoomId: "my_office" }
    ]
  },
  my_office: {
    id: "my_office",
    displayName: "My Office",
    spawn: { x: 480, y: 500 },
    collisionRects: myOfficeCollisions,
    portals: [
      { x: 432, y: 544, width: 96, height: 64, targetRoomId: "main_office" },
      { x: 528, y: 544, width: 96, height: 64, targetRoomId: "rooftop" }
    ]
  },
  shop: {
    id: "shop",
    displayName: "Shop",
    spawn: { x: 480, y: 500 },
    collisionRects: loungeCollisions,
    portals: [{ x: 432, y: 544, width: 96, height: 64, targetRoomId: "main_office" }]
  },
  coffee_bar: {
    id: "coffee_bar",
    displayName: "Coffee Bar",
    spawn: { x: 480, y: 500 },
    collisionRects: coffeeBarCollisions,
    portals: [
      { x: 432, y: 544, width: 96, height: 64, targetRoomId: "main_office" },
      { x: 752, y: 544, width: 96, height: 64, targetRoomId: "arcade" },
      { x: 112, y: 544, width: 96, height: 64, targetRoomId: "rooftop" }
    ]
  },
  arcade: {
    id: "arcade",
    displayName: "Club",
    spawn: { x: 480, y: 500 },
    collisionRects: arcadeCollisions,
    danceFloor: { x: 350, y: 250, width: 260, height: 170 },
    portals: [
      { x: 432, y: 544, width: 96, height: 64, targetRoomId: "main_office" },
      { x: 112, y: 544, width: 96, height: 64, targetRoomId: "coffee_bar" },
      { x: 752, y: 544, width: 96, height: 64, targetRoomId: "rooftop" }
    ]
  },
  rooftop: {
    id: "rooftop",
    displayName: "Game Room",
    spawn: { x: 480, y: 500 },
    collisionRects: [
      { x: 256, y: 256, width: 448, height: 64 },
      { x: 128, y: 128, width: 96, height: 96 },
      { x: 736, y: 128, width: 96, height: 96 }
    ],
    portals: [
      { x: 432, y: 544, width: 96, height: 64, targetRoomId: "main_office" },
      { x: 112, y: 544, width: 96, height: 64, targetRoomId: "coffee_bar" },
      { x: 752, y: 544, width: 96, height: 64, targetRoomId: "arcade" }
    ]
  }
};
