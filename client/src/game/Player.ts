import Phaser from "phaser";
import { SpeechBubble } from "./SpeechBubble";

export type PlayerStatus = "active" | "away";

export class Player {
  readonly body: Phaser.GameObjects.Rectangle;
  readonly nameText: Phaser.GameObjects.Text;
  petOrb?: Phaser.GameObjects.Sprite;
  emoteText?: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  status: PlayerStatus;
  name: string;
  danceAnimation: string;
  petKey: string;
  emote: string;
  emoteExpiresAt: number;
  danceBaseX: number;
  danceBaseY: number;

  private speechBubble: SpeechBubble;

  constructor(
    private scene: Phaser.Scene,
    readonly sessionId: string,
    x: number,
    y: number,
    name: string,
    status: PlayerStatus,
    isLocal: boolean,
    danceAnimation: string,
    petKey: string,
    emote: string,
    emoteExpiresAt: number
  ) {
    this.body = scene.add.rectangle(x, y, 24, 28, isLocal ? 0x8be9fd : 0xffb86c);
    this.body.setStrokeStyle(2, 0x0d1b2a);

    this.nameText = scene.add
      .text(x, y - 24, name, {
        color: "#fef6d8",
        fontFamily: "monospace",
        fontSize: "12px"
      })
      .setOrigin(0.5);

    this.targetX = x;
    this.targetY = y;
    this.status = status;
    this.name = name;
    this.danceAnimation = danceAnimation;
    this.petKey = petKey;
    this.emote = emote;
    this.emoteExpiresAt = emoteExpiresAt;
    this.danceBaseX = x;
    this.danceBaseY = y;

    if (petKey && petKey !== "none") {
      this.petOrb = scene.add.sprite(x + 18, y + 12, petKey);
      this.petOrb.setScale(0.09);
    }

    this.applyStatusVisuals();

    this.speechBubble = new SpeechBubble(scene, () => ({ x: this.body.x, y: this.body.y - 24 }));
  }

  showSpeechBubble(message: string) {
    this.speechBubble.show(message);
  }

  updateSpeechBubblePosition() {
    this.speechBubble.update();
  }

  destroy() {
    this.speechBubble.destroy();
    this.body.destroy();
    this.nameText.destroy();
    this.petOrb?.destroy();
    this.emoteText?.destroy();
  }

  applyStatusVisuals() {
    this.nameText.setText(this.status === "away" ? `${this.name} (away)` : this.name);
    this.nameText.setColor(this.status === "away" ? "#f4b8c3" : "#fef6d8");
  }
}
