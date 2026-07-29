import { OfficeRoom } from "./OfficeRoom.js";
import { ROOM_CONFIGS } from "./roomConfigs.js";

export class MyOfficeRoom extends OfficeRoom {
  constructor() {
    super(ROOM_CONFIGS.my_office);
  }
}
