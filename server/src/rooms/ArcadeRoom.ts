import { OfficeRoom } from "./OfficeRoom.js";
import { ROOM_CONFIGS } from "./roomConfigs.js";

export class ArcadeRoom extends OfficeRoom {
  constructor() {
    super(ROOM_CONFIGS.arcade);
  }
}
