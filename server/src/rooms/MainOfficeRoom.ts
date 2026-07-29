import { OfficeRoom } from "./OfficeRoom.js";
import { ROOM_CONFIGS } from "./roomConfigs.js";

export class MainOfficeRoom extends OfficeRoom {
  constructor() {
    super(ROOM_CONFIGS.main_office);
  }
}
