import { OfficeRoom } from "./OfficeRoom.js";
import { ROOM_CONFIGS } from "./roomConfigs.js";

export class ShopRoom extends OfficeRoom {
  constructor() {
    super(ROOM_CONFIGS.shop);
  }
}