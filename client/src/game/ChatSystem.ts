import Phaser from "phaser";
import { Player } from "./Player";

type ChatSystemOptions = {
  scene: Phaser.Scene;
  findPlayerBySessionId: (sessionId: string) => Player | undefined;
  isUiInputBlocked?: () => boolean;
  sendMessage: (message: string) => void;
  onComposeStateChange?: (isComposing: boolean) => void;
};

export class ChatSystem {
  private readonly scene: Phaser.Scene;
  private readonly findPlayerBySessionId: (sessionId: string) => Player | undefined;
  private readonly isUiInputBlocked?: () => boolean;
  private readonly sendMessage: (message: string) => void;
  private readonly onComposeStateChange?: (isComposing: boolean) => void;

  private isOpen = false;
  private draft = "";
  private panel?: Phaser.GameObjects.Rectangle;
  private prompt?: Phaser.GameObjects.Text;
  private draftText?: Phaser.GameObjects.Text;
  private cursorVisible = true;
  private cursorTimer?: Phaser.Time.TimerEvent;

  constructor(options: ChatSystemOptions) {
    this.scene = options.scene;
    this.findPlayerBySessionId = options.findPlayerBySessionId;
    this.isUiInputBlocked = options.isUiInputBlocked;
    this.sendMessage = options.sendMessage;
    this.onComposeStateChange = options.onComposeStateChange;
  }

  start() {
    this.panel = this.scene.add
      .rectangle(480, 612, 900, 40, 0x0a1027, 0.86)
      .setStrokeStyle(2, 0x93c5fd, 0.8)
      .setScrollFactor(0)
      .setDepth(2200)
      .setVisible(false);

    this.prompt = this.scene.add
      .text(42, 602, "Chat", {
        color: "#f8fafc",
        fontFamily: "monospace",
        fontSize: "13px",
        fontStyle: "bold"
      })
      .setScrollFactor(0)
      .setDepth(2201)
      .setVisible(false);

    this.draftText = this.scene.add
      .text(102, 602, "", {
        color: "#f8fafc",
        fontFamily: "monospace",
        fontSize: "13px"
      })
      .setScrollFactor(0)
      .setDepth(2201)
      .setVisible(false);

    this.cursorTimer = this.scene.time.addEvent({
      delay: 450,
      loop: true,
      callback: () => {
        this.cursorVisible = !this.cursorVisible;
        this.refreshDraftText();
      }
    });

    this.scene.input.keyboard?.on("keydown", this.onKeyDown, this);
  }

  destroy() {
    this.scene.input.keyboard?.off("keydown", this.onKeyDown, this);
    this.cursorTimer?.remove(false);
    this.cursorTimer = undefined;
    this.panel?.destroy();
    this.prompt?.destroy();
    this.draftText?.destroy();
  }

  isComposing(): boolean {
    return this.isOpen;
  }

  handleIncomingChat(sessionId: string, message: string) {
    const player = this.findPlayerBySessionId(sessionId);
    if (!player) {
      return;
    }

    player.showSpeechBubble(message);
  }

  private onKeyDown(event: KeyboardEvent) {
    const activeElement = document.activeElement as HTMLElement | null;
    const isFormFocused = Boolean(
      activeElement &&
        (activeElement.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName))
    );
    if (isFormFocused || this.isUiInputBlocked?.()) {
      return;
    }

    const key = event.key;
    const isOpenComposerShortcut = key === "/" || key.toLowerCase() === "t";

    if (!this.isOpen && isOpenComposerShortcut) {
      event.preventDefault();
      this.openComposer();
      return;
    }

    if (key === "Enter") {
      event.preventDefault();
      const outgoing = this.draft.trim();
      if (outgoing) {
        this.sendMessage(outgoing);
      }
      this.closeComposer();
      return;
    }

    if (!this.isOpen) {
      return;
    }

    if (key === "Escape") {
      event.preventDefault();
      this.closeComposer();
      return;
    }

    if (key === "Backspace") {
      event.preventDefault();
      this.draft = this.draft.slice(0, -1);
      this.refreshDraftText();
      return;
    }

    if (key.length === 1 && this.draft.length < 140) {
      this.draft += key;
      this.refreshDraftText();
    }
  }

  private openComposer() {
    this.isOpen = true;
    this.draft = "";
    this.cursorVisible = true;
    this.panel?.setVisible(true);
    this.prompt?.setVisible(true);
    this.draftText?.setVisible(true);
    this.refreshDraftText();
    this.onComposeStateChange?.(true);
  }

  private closeComposer() {
    this.isOpen = false;
    this.draft = "";
    this.panel?.setVisible(false);
    this.prompt?.setVisible(false);
    this.draftText?.setVisible(false);
    this.onComposeStateChange?.(false);
  }

  private refreshDraftText() {
    if (!this.draftText || !this.isOpen) {
      return;
    }

    const trimmedDisplay = this.draft.length > 110 ? this.draft.slice(-110) : this.draft;
    const cursor = this.cursorVisible ? "|" : " ";
    this.draftText.setText(`${trimmedDisplay}${cursor}`);
  }
}
