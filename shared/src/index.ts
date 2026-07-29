export type Department = "engineering" | "design" | "marketing" | "operations";

export type PlayerStatus = "active" | "away";

export interface AvatarSelection {
  bodyColor: string;
  hairOrHatStyle: string;
  shirtStyle: string;
  starterPet: "office_dog" | "office_cat" | "tiny_robot" | "pigeon";
}

export interface PlayerProfile {
  id: string;
  displayName: string;
  department: Department;
  avatar: AvatarSelection;
}

export interface MovementIntent {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface Position {
  x: number;
  y: number;
}

export interface RoomPlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  moving: boolean;
  direction: "up" | "down" | "left" | "right";
  status: PlayerStatus;
}

export type ClientMessage =
  | { type: "movement"; payload: MovementIntent }
  | { type: "chat"; payload: { message: string } }
  | { type: "emote"; payload: { emote: string } };

export type ServerMessage =
  | { type: "snapshot"; payload: { players: RoomPlayerState[] } }
  | { type: "player_joined"; payload: RoomPlayerState }
  | { type: "player_left"; payload: { id: string } };
