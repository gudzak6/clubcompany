import Phaser from "phaser";

type AnchorProvider = () => { x: number; y: number };

export class SpeechBubble {
  private container?: Phaser.GameObjects.Container;
  private bg?: Phaser.GameObjects.Graphics;
  private shadow?: Phaser.GameObjects.Graphics;
  private pointer?: Phaser.GameObjects.Graphics;
  private pointerShadow?: Phaser.GameObjects.Graphics;
  private text?: Phaser.GameObjects.Text;
  private hideTimer?: Phaser.Time.TimerEvent;
  private fadeTween?: Phaser.Tweens.Tween;

  constructor(
    private scene: Phaser.Scene,
    private getAnchor: AnchorProvider
  ) {}

  show(message: string) {
    const normalized = this.normalizeMessage(message);
    if (!normalized) {
      return;
    }

    this.hideTimer?.remove(false);
    this.fadeTween?.stop();
    this.destroyVisuals();

    const anchor = this.getAnchor();
    const text = this.scene.add.text(0, 0, "", {
      color: "#111111",
      fontFamily: "Arial",
      fontSize: "13px",
      align: "center"
    });
    const formatted = this.formatToTwoLines(text, normalized, 180);
    text.setText(formatted);
    text.setOrigin(0.5);

    const textBounds = text.getBounds();
    const horizontalPadding = 12;
    const verticalPadding = 8;
    const bubbleWidth = Math.min(180 + horizontalPadding * 2, textBounds.width + horizontalPadding * 2);
    const bubbleHeight = textBounds.height + verticalPadding * 2;
    const pointerWidth = 14;
    const pointerHeight = 8;
    const radius = 12;

    const shadow = this.scene.add.graphics();
    shadow.fillStyle(0x000000, 0.18);
    shadow.fillRoundedRect(-bubbleWidth / 2 + 2, -bubbleHeight / 2 + 2, bubbleWidth, bubbleHeight, radius);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0xffffff, 0.95);
    bg.fillRoundedRect(-bubbleWidth / 2, -bubbleHeight / 2, bubbleWidth, bubbleHeight, radius);

    const pointerShadow = this.scene.add.graphics();
    pointerShadow.fillStyle(0x000000, 0.18);
    pointerShadow.fillPoints(
      [
        new Phaser.Geom.Point(-pointerWidth / 2 + 2, bubbleHeight / 2 + 2),
        new Phaser.Geom.Point(pointerWidth / 2 + 2, bubbleHeight / 2 + 2),
        new Phaser.Geom.Point(2, bubbleHeight / 2 + pointerHeight + 2)
      ],
      true
    );

    const pointer = this.scene.add.graphics();
    pointer.fillStyle(0xffffff, 0.95);
    pointer.fillPoints(
      [
        new Phaser.Geom.Point(-pointerWidth / 2, bubbleHeight / 2),
        new Phaser.Geom.Point(pointerWidth / 2, bubbleHeight / 2),
        new Phaser.Geom.Point(0, bubbleHeight / 2 + pointerHeight)
      ],
      true
    );

    const container = this.scene.add.container(anchor.x, anchor.y - 44, [shadow, bg, pointerShadow, pointer, text]);
    container.setDepth(2000);
    container.setAlpha(0);
    container.setScale(0.93);

    this.container = container;
    this.shadow = shadow;
    this.bg = bg;
    this.pointerShadow = pointerShadow;
    this.pointer = pointer;
    this.text = text;

    this.fadeTween = this.scene.tweens.add({
      targets: container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      y: anchor.y - 48,
      duration: 150,
      ease: "Back.Out"
    });

    this.hideTimer = this.scene.time.delayedCall(5000, () => {
      this.hide();
    });
  }

  update() {
    if (!this.container) {
      return;
    }

    const anchor = this.getAnchor();
    this.container.setPosition(anchor.x, anchor.y - 48);
  }

  hide() {
    if (!this.container) {
      return;
    }

    this.hideTimer?.remove(false);
    this.hideTimer = undefined;
    this.fadeTween?.stop();

    const toHide = this.container;
    this.fadeTween = this.scene.tweens.add({
      targets: toHide,
      alpha: 0,
      duration: 200,
      ease: "Quad.In",
      onComplete: () => {
        this.destroyVisuals();
      }
    });
  }

  destroy() {
    this.hideTimer?.remove(false);
    this.hideTimer = undefined;
    this.fadeTween?.stop();
    this.fadeTween = undefined;
    this.destroyVisuals();
  }

  private destroyVisuals() {
    this.container?.destroy(true);
    this.container = undefined;
    this.bg = undefined;
    this.shadow = undefined;
    this.pointer = undefined;
    this.pointerShadow = undefined;
    this.text = undefined;
  }

  private normalizeMessage(message: string): string {
    return message.replace(/\s+/g, " ").trim();
  }

  private formatToTwoLines(textObject: Phaser.GameObjects.Text, raw: string, maxWidth: number): string {
    const words = raw.split(" ");
    const lines: string[] = [];
    let current = "";

    const fitsWidth = (value: string): boolean => {
      textObject.setText(value);
      return textObject.width <= maxWidth;
    };

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (fitsWidth(candidate)) {
        current = candidate;
      } else {
        if (!current) {
          current = this.truncateWordToWidth(textObject, word, maxWidth);
        }
        lines.push(current);
        current = word;
      }
    }

    if (current) {
      lines.push(current);
    }

    if (lines.length <= 2) {
      return lines.join("\n");
    }

    const lineOne = lines[0];
    let lineTwo = lines[1];
    while (lineTwo.length > 0 && !fitsWidth(`${lineTwo}...`)) {
      lineTwo = lineTwo.slice(0, -1).trimEnd();
    }

    return `${lineOne}\n${lineTwo || "..."}...`;
  }

  private truncateWordToWidth(textObject: Phaser.GameObjects.Text, value: string, maxWidth: number): string {
    let output = value;
    while (output.length > 1) {
      textObject.setText(`${output}...`);
      if (textObject.width <= maxWidth) {
        return `${output}...`;
      }
      output = output.slice(0, -1);
    }
    return `${output}...`;
  }
}
