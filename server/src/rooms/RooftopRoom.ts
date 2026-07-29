import { OfficeRoom } from "./OfficeRoom.js";
import { ROOM_CONFIGS } from "./roomConfigs.js";

export class RooftopRoom extends OfficeRoom {
  constructor() {
    super(ROOM_CONFIGS.rooftop);
  }
}
