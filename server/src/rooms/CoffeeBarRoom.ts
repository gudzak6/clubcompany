import { OfficeRoom } from "./OfficeRoom.js";
import { ROOM_CONFIGS } from "./roomConfigs.js";

export class CoffeeBarRoom extends OfficeRoom {
  constructor() {
    super(ROOM_CONFIGS.coffee_bar);
  }
}
