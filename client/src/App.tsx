import { useEffect, useRef, useState } from "react";
import type Phaser from "phaser";

type PlayerStatus = "active" | "away";

type DebugPlayer = {
  id: string;
  name: string;
  status: PlayerStatus;
};

type DeskSlotKey = "deskStyle" | "chair" | "computer" | "plant" | "mug" | "smallDecoration";

type ShopItem = {
  key: string;
  name: string;
  slot: DeskSlotKey;
  price: number;
  rarity: "common" | "uncommon" | "rare" | "epic";
};

type ProgressionSnapshot = {
  coins: number;
  xp: number;
  dailyStreak: number;
  lastSpinAt: number;
  nextSpinAt: number;
  canSpin: boolean;
  lastBadgeSwipeAt: number;
  nextBadgeSwipeAt: number;
  canBadgeSwipe: boolean;
  ownedItems: string[];
  ownedPets: string[];
  equippedDesk: Record<DeskSlotKey, string>;
  equippedPet: string;
  shop: ShopItem[];
};

type DailySpinResult = {
  key: string;
  label: string;
  rarity: "common" | "uncommon" | "rare" | "epic";
  coins: number;
  xp: number;
  itemKey: string;
  petKey: string;
};

type RoomTransitionStatus =
  | "idle"
  | "preparing"
  | "leaving"
  | "joining"
  | "switching"
  | "ready"
  | "failed";

type OfficeWorldDebug = {
  playerCount: number;
  localSessionId: string;
  connected: boolean;
  roomId: "main_office" | "my_office" | "shop" | "coffee_bar" | "arcade" | "rooftop";
  joinedRoomName: string;
  chatComposing: boolean;
  players: DebugPlayer[];
  endpoint: string;
  activeEndpoint: string;
  inputBlockReason: string;
  lastError: string;
  phase: string;
  transitionStatus: RoomTransitionStatus;
  joinLatencyMs?: number;
  firstStateLatencyMs?: number;
  progression?: ProgressionSnapshot;
  lastSpinResult?: DailySpinResult;
  lastSpinResultToken?: number;
  progressionError?: string;
  badgeSwipeNotice?: string;
  badgeSwipeNoticeToken?: number;
};

const ROOM_LABELS: Record<OfficeWorldDebug["roomId"], string> = {
  main_office: "Main Office",
  my_office: "My Office",
  shop: "Shop",
  coffee_bar: "Coffee Bar",
  arcade: "Club",
  rooftop: "Game Room"
};

const ROOM_DIRECTIONS: Record<OfficeWorldDebug["roomId"], string[]> = {
  main_office: [
    "Arrow Keys: Move around",
    "Daily Task: find today's badge swipe pin (it can appear in any room)",
    "Walk into portal zones to change rooms (including My Office and Shop)",
    "Use Leave Room button in other rooms to return here"
  ],
  my_office: [
    "Use this room for pet and desk customization",
    "Walk into portal zones or use Leave Room to return"
  ],
  shop: ["Use this room to buy desk items", "Walk into portal zones or use Leave Room to return"],
  coffee_bar: ["Arrow Keys: Move", "Use portal zones or Leave Room to exit"],
  arcade: [
    "Space: Dance on/off (on dance floor)",
    "1 / 2 / 3: Switch dance style",
    "Z / X / C / V: Send emotes",
    "Music controls are enabled in this room"
  ],
  rooftop: [
    "Enter: Join pong",
    "W / S or Up / Down: Move paddle",
    "Backspace: Leave pong slot"
  ]
};

type OfficeWorldControls = {
  move?: (intent: { up?: boolean; down?: boolean; left?: boolean; right?: boolean }) => void;
  transitionTo?: (roomId: OfficeWorldDebug["roomId"]) => void;
  emote?: (value: "🎉" | "🕺" | "💃" | "👋") => void;
  setDanceStyle?: (value: "shuffle" | "bounce" | "spin") => void;
  toggleDance?: () => void;
  joinPong?: () => void;
  leavePong?: () => void;
  requestProgression?: () => void;
  buyShopItem?: (itemKey: string) => void;
  equipDeskItem?: (slot: DeskSlotKey, itemKey: string) => void;
  equipPet?: (petKey: string) => void;
  spinDaily?: () => void;
  setUiInputBlocked?: (blocked: boolean) => void;
};

const SLOT_LABELS: Record<DeskSlotKey, string> = {
  deskStyle: "Desk",
  chair: "Chair",
  computer: "Computer",
  plant: "Plant",
  mug: "Mug",
  smallDecoration: "Decoration"
};

const SPIN_WHEEL_LABELS = [
  "25 coins",
  "50 coins",
  "Rocket Mug",
  "Bonsai",
  "Office Cat",
  "35 XP",
  "Neon Desk",
  "Tiny Lamp"
];
const SPIN_DURATION_MS = 3000;

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
const FW_EMAIL_PROMPT_INTERVAL_MS = 24 * 60 * 60 * 1000;

const getOrCreateDisplayName = () => {
  const storedName = window.localStorage.getItem("officeWorld.displayName")?.trim();
  if (storedName) {
    return storedName.slice(0, 20);
  }

  const generatedName = `Coworker${Math.floor(Math.random() * 900 + 100)}`;
  window.localStorage.setItem("officeWorld.displayName", generatedName);
  return generatedName;
};

const getOrCreatePlayerId = () => {
  const existingId = window.localStorage.getItem("officeWorld.playerId")?.trim();
  if (existingId) {
    return existingId;
  }

  const newId = `ow_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  window.localStorage.setItem("officeWorld.playerId", newId);
  return newId;
};

const getServerBaseUrl = () => {
  const explicitEndpoint = import.meta.env.VITE_COLYSEUS_URL?.trim();
  const localHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  if (localHost) {
    return "http://localhost:2567";
  }

  if (!explicitEndpoint) {
    return window.location.origin;
  }

  if (explicitEndpoint.startsWith("ws://")) {
    return explicitEndpoint.replace(/^ws:\/\//, "http://").replace(/\/$/, "");
  }

  if (explicitEndpoint.startsWith("wss://")) {
    return explicitEndpoint.replace(/^wss:\/\//, "https://").replace(/\/$/, "");
  }

  return explicitEndpoint.replace(/\/$/, "");
};

export function App() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousRoomIdRef = useRef<OfficeWorldDebug["roomId"] | null>(null);
  const fwEmailInputRef = useRef<HTMLInputElement | null>(null);
  const [debugState, setDebugState] = useState<OfficeWorldDebug | null>(null);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [volume, setVolume] = useState(0.45);
  const [musicReady, setMusicReady] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());
  const [spinAnimating, setSpinAnimating] = useState(false);
  const [spinWheelIndex, setSpinWheelIndex] = useState(0);
  const [spinReveal, setSpinReveal] = useState<DailySpinResult | null>(null);
  const [lastHandledSpinToken, setLastHandledSpinToken] = useState(0);
  const [spinTimedOut, setSpinTimedOut] = useState(false);
  const spinStopAtRef = useRef(0);
  const pendingSpinResultRef = useRef<DailySpinResult | null>(null);
  const [badgeSwipeNotice, setBadgeSwipeNotice] = useState("");
  const [lastBadgeSwipeNoticeToken, setLastBadgeSwipeNoticeToken] = useState(0);
  const [showBadgeSwipeModal, setShowBadgeSwipeModal] = useState(false);
  const [fwEmail, setFwEmail] = useState("");
  const [showFwEmailModal, setShowFwEmailModal] = useState(false);
  const [fwEmailError, setFwEmailError] = useState("");
  const [savingFwEmail, setSavingFwEmail] = useState(false);
  const [serverHealth, setServerHealth] = useState<"unknown" | "ok" | "failed">("unknown");
  const [serverHealthMessage, setServerHealthMessage] = useState("");
  const [touchDirs, setTouchDirs] = useState<{ up: boolean; down: boolean; left: boolean; right: boolean }>({
    up: false,
    down: false,
    left: false,
    right: false
  });

  const hostWithControls = window as Window & {
    officeWorldControls?: OfficeWorldControls;
  };

  const updateTouchDirection = (dir: "up" | "down" | "left" | "right", active: boolean) => {
    setTouchDirs((prev) => {
      if (prev[dir] === active) return prev;
      const next = { ...prev, [dir]: active };
      hostWithControls.officeWorldControls?.move?.(next);
      return next;
    });
  };

  useEffect(() => {
    const storedEmail = window.localStorage.getItem("officeWorld.fwEmail")?.trim().toLowerCase() ?? "";
    const lastPromptAtRaw = window.localStorage.getItem("officeWorld.fwEmailPromptAt") ?? "0";
    const lastPromptAt = Number(lastPromptAtRaw);
    const now = Date.now();
    setFwEmail(storedEmail);

    // New users (no saved email) should always see the modal until they submit.
    if (!storedEmail) {
      setShowFwEmailModal(true);
      return;
    }

    if (!Number.isFinite(lastPromptAt) || now - lastPromptAt >= FW_EMAIL_PROMPT_INTERVAL_MS) {
      window.localStorage.setItem("officeWorld.fwEmailPromptAt", String(now));
      setShowFwEmailModal(true);
      return;
    }

    setShowFwEmailModal(false);
  }, []);

  useEffect(() => {
    hostWithControls.officeWorldControls?.setUiInputBlocked?.(showFwEmailModal);

    if (showFwEmailModal) {
      window.setTimeout(() => {
        fwEmailInputRef.current?.focus();
        fwEmailInputRef.current?.select();
      }, 0);
    }
  }, [showFwEmailModal, debugState?.connected]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const host = window as Window & {
        officeWorldDebug?: OfficeWorldDebug;
      };

      setDebugState(host.officeWorldDebug ?? null);
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const healthUrl = `${getServerBaseUrl()}/health`;

    const checkHealth = async () => {
      try {
        const response = await fetch(healthUrl, { method: "GET" });
        if (!response.ok) {
          throw new Error(`Health endpoint returned ${response.status}`);
        }

        const payload = (await response.json().catch(() => null)) as { ok?: boolean; service?: string } | null;
        if (!payload?.ok) {
          throw new Error("Health endpoint did not return ok=true");
        }

        if (!cancelled) {
          setServerHealth("ok");
          setServerHealthMessage(payload.service ? `Service: ${payload.service}` : "Backend reachable");
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setServerHealth("failed");
          setServerHealthMessage(message);
        }
      }
    };

    void checkHealth();
    const timer = window.setInterval(() => {
      void checkHealth();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!debugState?.connected || debugState.progression) {
      return;
    }

    hostWithControls.officeWorldControls?.requestProgression?.();
  }, [debugState?.connected, debugState?.progression]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!spinAnimating) {
      return;
    }

    const interval = window.setInterval(() => {
      setSpinWheelIndex((value) => (value + 1) % SPIN_WHEEL_LABELS.length);
    }, 120);

    return () => {
      window.clearInterval(interval);
    };
  }, [spinAnimating]);

  useEffect(() => {
    const token = debugState?.lastSpinResultToken ?? 0;
    if (!debugState?.lastSpinResult || token <= lastHandledSpinToken) {
      return;
    }

    const result = debugState.lastSpinResult;
    setLastHandledSpinToken(token);
    pendingSpinResultRef.current = result;

    if (!spinAnimating) {
      setSpinTimedOut(false);
      setSpinReveal(result);
      return;
    }

    if (Date.now() >= spinStopAtRef.current) {
      setSpinAnimating(false);
      setSpinReveal(result);
      setSpinTimedOut(false);
    }
  }, [spinAnimating, debugState?.lastSpinResult, debugState?.lastSpinResultToken, lastHandledSpinToken]);

  useEffect(() => {
    if (!spinAnimating) {
      return;
    }

    const remainingMs = Math.max(0, spinStopAtRef.current - Date.now()) || SPIN_DURATION_MS;

    const timeoutGuard = window.setTimeout(() => {
      setSpinAnimating(false);
      const pending = pendingSpinResultRef.current;
      if (pending) {
        setSpinTimedOut(false);
        setSpinReveal(pending);
      } else {
        setSpinTimedOut(true);
      }
    }, remainingMs);

    return () => {
      window.clearTimeout(timeoutGuard);
    };
  }, [spinAnimating]);

  useEffect(() => {
    if (!spinAnimating || !debugState?.progressionError) {
      return;
    }

    setSpinAnimating(false);
    setSpinTimedOut(false);
  }, [spinAnimating, debugState?.progressionError]);

  useEffect(() => {
    const token = debugState?.badgeSwipeNoticeToken ?? 0;
    if (!debugState?.badgeSwipeNotice || token <= lastBadgeSwipeNoticeToken) {
      return;
    }

    setLastBadgeSwipeNoticeToken(token);
    setBadgeSwipeNotice(debugState.badgeSwipeNotice);
    setShowBadgeSwipeModal(true);
  }, [debugState?.badgeSwipeNotice, debugState?.badgeSwipeNoticeToken, lastBadgeSwipeNoticeToken]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) {
        return;
      }

      const host = window as Window & {
        officeWorldDebug?: OfficeWorldDebug;
        officeWorldControls?: {
          setDanceStyle: (value: "shuffle" | "bounce" | "spin") => void;
          toggleDance: () => void;
        };
      };

      if (host.officeWorldDebug?.roomId !== "arcade" || !host.officeWorldControls) {
        return;
      }

      if (event.code === "Digit1" || event.code === "Numpad1") {
        event.preventDefault();
        host.officeWorldControls.setDanceStyle("shuffle");
      } else if (event.code === "Digit2" || event.code === "Numpad2") {
        event.preventDefault();
        host.officeWorldControls.setDanceStyle("bounce");
      } else if (event.code === "Digit3" || event.code === "Numpad3") {
        event.preventDefault();
        host.officeWorldControls.setDanceStyle("spin");
      } else if (event.code === "Space") {
        event.preventDefault();
        host.officeWorldControls.toggleDance();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return;
    }

    let cancelled = false;

    void import("./game/createGame").then(({ createOfficeWorldGame }) => {
      if (cancelled || !containerRef.current || gameRef.current) {
        return;
      }

      gameRef.current = createOfficeWorldGame(containerRef.current);
    });

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = new Audio(assetPath("/audio/alex-morgan-heavy-dubstep-bass-drop-edm-530942.mp3"));
    audio.loop = true;
    audio.volume = volume;
    audio.preload = "auto";
    audioRef.current = audio;
    setMusicReady(true);

    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
      setMusicReady(false);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    const roomId = debugState?.roomId;
    const previousRoomId = previousRoomIdRef.current;

    if (!audio || !roomId) {
      return;
    }

    if (roomId !== "arcade") {
      audio.pause();
      setMusicEnabled(false);
      previousRoomIdRef.current = roomId;
      return;
    }

    if (roomId === "arcade" && previousRoomId !== "arcade") {
      audio
        .play()
        .then(() => {
          setMusicEnabled(true);
        })
        .catch((error) => {
          console.error("Auto-play was blocked until interaction:", error);
          setMusicEnabled(false);
        });
    }

    previousRoomIdRef.current = roomId;
  }, [debugState?.roomId]);

  const toggleMusic = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (debugState?.roomId !== "arcade") {
      audio.pause();
      setMusicEnabled(false);
      return;
    }

    if (musicEnabled) {
      audio.pause();
      setMusicEnabled(false);
      return;
    }

    try {
      await audio.play();
      setMusicEnabled(true);
    } catch (error) {
      console.error("Music playback was blocked until interaction:", error);
      setMusicEnabled(false);
    }
  };

  const leaveCurrentRoom = () => {
    hostWithControls.officeWorldControls?.transitionTo?.("main_office");
  };

  const progression = debugState?.progression;
  const apiBaseUrl = getServerBaseUrl();
  const basePath = import.meta.env.BASE_URL;
  const isMyOfficeRoom = debugState?.roomId === "my_office";
  const isShopRoom = debugState?.roomId === "shop";
  const spinCooldownMs = progression ? Math.max(0, progression.nextSpinAt - nowTs) : 0;
  const canSpinNow = progression?.canSpin || spinCooldownMs <= 0;
  const spinCooldownLabel =
    spinCooldownMs <= 0
      ? "Ready now"
      : `${Math.floor(spinCooldownMs / (1000 * 60 * 60))}h ${Math.floor((spinCooldownMs / (1000 * 60)) % 60)}m`;

  const equipDeskItem = (slot: DeskSlotKey, itemKey: string) => {
    hostWithControls.officeWorldControls?.equipDeskItem?.(slot, itemKey);
  };

  const spinDaily = () => {
    if (!progression || !canSpinNow) {
      return;
    }

    spinStopAtRef.current = Date.now() + SPIN_DURATION_MS;
    pendingSpinResultRef.current = null;
    setSpinReveal(null);
    setSpinTimedOut(false);
    setSpinAnimating(true);
    hostWithControls.officeWorldControls?.spinDaily?.();
  };

  const showBackendConfigWarning =
    debugState?.phase === "connection_failed" &&
    Boolean(debugState.lastError) &&
    (debugState.lastError.includes("VITE_COLYSEUS_URL") ||
      debugState.lastError.includes("Invalid seat reservation response") ||
      debugState.lastError.includes("Not Found"));
  const showBackendHealthWarning = serverHealth === "failed" && !debugState?.connected;

  const submitFwEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = fwEmail.trim().toLowerCase();
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(normalizedEmail);

    if (!isValidEmail) {
      setFwEmailError("Please enter a valid email address.");
      return;
    }

    setSavingFwEmail(true);
    setFwEmailError("");

    // Do not block UX on network/CORS issues.
    // Persist locally and close modal immediately, then sync best-effort.
    window.localStorage.setItem("officeWorld.fwEmail", normalizedEmail);
    window.localStorage.setItem("officeWorld.fwEmailPromptAt", String(Date.now()));
    setShowFwEmailModal(false);

    const playerId = getOrCreatePlayerId();
    const displayName = getOrCreateDisplayName();

    try {
      const response = await fetch(`${getServerBaseUrl()}/api/users/fw-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          playerId,
          email: normalizedEmail,
          displayName
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to save your email right now.");
      }
    } catch (error) {
      console.warn("FW email sync failed (saved locally):", error);
    } finally {
      setSavingFwEmail(false);
    }
  };

  const suppressModalKeyPropagation = (event: React.KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <main className="app-shell">
      <header className="top-bar">
        <h1>Office World MVP</h1>
        <p>Phase 4: Authoritative multiplayer movement with Colyseus</p>
      </header>
      <section className="content-grid">
        <aside className="panel">
          <h2>Player Panel</h2>
          <div className="progression-summary">
            <strong>Coins:</strong> {progression?.coins ?? 0}
            <br />
            <strong>XP:</strong> {progression?.xp ?? 0}
            <br />
            <strong>Daily Streak:</strong> {progression?.dailyStreak ?? 0}
          </div>
          <p>Find your daily badge swipe</p>
          <p>
            Room: {debugState ? ROOM_LABELS[debugState.roomId] : "-"}
            <br />
            Connection: {debugState?.connected ? "Online" : "Offline"}
            <>
              <br />
              Session: {debugState?.localSessionId || "(pending)"}
            </>
            {debugState?.joinedRoomName ? (
              <>
                <br />
                Joined Room: {debugState.joinedRoomName}
              </>
            ) : null}
            {debugState?.lastError ? (
              <>
                <br />
                Last Error: {debugState.lastError}
              </>
            ) : null}
          </p>
          {showBackendConfigWarning ? (
            <div className="backend-warning" role="alert">
              Multiplayer backend is unreachable from this deployment. Configure VITE_COLYSEUS_URL to a live Colyseus
              backend (wss://...) and redeploy.
            </div>
          ) : null}
          {showBackendHealthWarning ? (
            <div className="backend-warning" role="alert">
              Backend /health check failed. This deployment may be serving static files without the Colyseus server.
            </div>
          ) : null}
          <div className="progression-actions">
            <button
              type="button"
              onClick={spinDaily}
              disabled={!progression || !canSpinNow}
              title={canSpinNow ? "Spin your daily reward" : `Available in ${spinCooldownLabel}`}
            >
              {canSpinNow ? "Daily Spin" : `Spin Cooldown: ${spinCooldownLabel}`}
            </button>
            <button type="button" onClick={() => hostWithControls.officeWorldControls?.requestProgression?.()}>
              Refresh Progress
            </button>
          </div>
          {spinReveal ? (
            <div className="spin-result" role="status">
              <strong>Daily Reward:</strong> {spinReveal.label} ({spinReveal.rarity})
            </div>
          ) : null}
          {spinTimedOut ? (
            <div className="backend-warning" role="alert">
              Spin result timed out. Please try again.
            </div>
          ) : null}
          {debugState?.progressionError ? (
            <div className="backend-warning" role="alert">
              {debugState.progressionError}
            </div>
          ) : null}
          {isShopRoom ? <p>Shop controls are in-world only: use Arrow keys and Enter inside the Shop room.</p> : null}
          {debugState ? (
            <div className="room-help" aria-live="polite">
              <h3>Directions</h3>
              <ul>
                {ROOM_DIRECTIONS[debugState.roomId].map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {debugState?.roomId && debugState.roomId !== "main_office" ? (
            <div className="room-help-actions">
              <button type="button" onClick={leaveCurrentRoom}>Leave Room</button>
            </div>
          ) : null}
          {debugState?.roomId === "main_office" ? (
            <div className="room-help-actions">
              <button
                type="button"
                onClick={() => {
                  hostWithControls.officeWorldControls?.transitionTo?.("my_office");
                }}
              >
                Enter My Office (Fallback)
              </button>
            </div>
          ) : null}
          {debugState?.roomId === "arcade" ? (
            <div className="room-help-actions">
              <button type="button" onClick={toggleMusic} disabled={!musicReady || debugState?.roomId !== "arcade"}>
                {musicEnabled ? "Music: On" : "Music: Off"}
              </button>
              <label htmlFor="music-volume">
                Volume: {Math.round(volume * 100)}%
                <input
                  id="music-volume"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(event) => {
                    setVolume(Number(event.target.value));
                  }}
                />
              </label>
            </div>
          ) : null}
        </aside>
        <div className="game-wrapper">
          <div ref={containerRef} className="game-canvas" />
          <div className="mobile-keypad-bar" aria-label="Mobile Keypad Controls">
            <div className="mobile-dpad">
              <button
                type="button"
                className={`dpad-btn up ${touchDirs.up ? "active" : ""}`}
                onPointerDown={(e) => { e.preventDefault(); updateTouchDirection("up", true); }}
                onPointerUp={(e) => { e.preventDefault(); updateTouchDirection("up", false); }}
                onPointerLeave={() => updateTouchDirection("up", false)}
                onPointerCancel={() => updateTouchDirection("up", false)}
                aria-label="Move Up"
              >
                ▲
              </button>
              <button
                type="button"
                className={`dpad-btn left ${touchDirs.left ? "active" : ""}`}
                onPointerDown={(e) => { e.preventDefault(); updateTouchDirection("left", true); }}
                onPointerUp={(e) => { e.preventDefault(); updateTouchDirection("left", false); }}
                onPointerLeave={() => updateTouchDirection("left", false)}
                onPointerCancel={() => updateTouchDirection("left", false)}
                aria-label="Move Left"
              >
                ◀
              </button>
              <div className="dpad-btn center" />
              <button
                type="button"
                className={`dpad-btn right ${touchDirs.right ? "active" : ""}`}
                onPointerDown={(e) => { e.preventDefault(); updateTouchDirection("right", true); }}
                onPointerUp={(e) => { e.preventDefault(); updateTouchDirection("right", false); }}
                onPointerLeave={() => updateTouchDirection("right", false)}
                onPointerCancel={() => updateTouchDirection("right", false)}
                aria-label="Move Right"
              >
                ▶
              </button>
              <button
                type="button"
                className={`dpad-btn down ${touchDirs.down ? "active" : ""}`}
                onPointerDown={(e) => { e.preventDefault(); updateTouchDirection("down", true); }}
                onPointerUp={(e) => { e.preventDefault(); updateTouchDirection("down", false); }}
                onPointerLeave={() => updateTouchDirection("down", false)}
                onPointerCancel={() => updateTouchDirection("down", false)}
                aria-label="Move Down"
              >
                ▼
              </button>
            </div>
            <div className="mobile-action-buttons">
              <button
                type="button"
                className="mobile-btn"
                onClick={() => hostWithControls.officeWorldControls?.toggleDance?.()}
              >
                💃 Dance
              </button>
              <button
                type="button"
                className="mobile-btn"
                onClick={() => hostWithControls.officeWorldControls?.emote?.("🎉")}
              >
                🎉 Emote
              </button>
              {debugState?.roomId === "rooftop" ? (
                <button
                  type="button"
                  className="mobile-btn"
                  onClick={() => hostWithControls.officeWorldControls?.joinPong?.()}
                >
                  🏓 Pong
                </button>
              ) : null}
              {debugState?.roomId && debugState.roomId !== "main_office" ? (
                <button
                  type="button"
                  className="mobile-btn"
                  onClick={leaveCurrentRoom}
                >
                  🚪 Leave
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <aside className="panel">
          <h2>Online Coworkers</h2>
          {!debugState || debugState.players.length === 0 ? (
            <ul>
              <li>No players connected yet</li>
            </ul>
          ) : (
            <ul>
              {debugState.players.map((player) => {
                const isLocal = player.id === debugState.localSessionId;
                return (
                  <li key={player.id}>
                    {player.name}
                    {isLocal ? " (You)" : ""} - {player.status}
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </section>
      {(spinAnimating || spinReveal) && (
        <div className="spin-overlay" role="dialog" aria-label="Daily spin results">
          <div className="spin-overlay-panel">
            <h2>Daily Spin</h2>
            {spinAnimating ? (
              <>
                <p>Spinning...</p>
                <div className="wheel-face">{SPIN_WHEEL_LABELS[spinWheelIndex]}</div>
              </>
            ) : null}
            {!spinAnimating && spinReveal ? (
              <>
                <p className="wheel-result">{spinReveal.label}</p>
                <p>Rarity: {spinReveal.rarity}</p>
                <button
                  type="button"
                  onClick={() => {
                    setSpinReveal(null);
                  }}
                >
                  Nice
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}
      {showBadgeSwipeModal && badgeSwipeNotice ? (
        <div className="spin-overlay" role="dialog" aria-label="Badge swipe notification">
          <div className="spin-overlay-panel">
            <h2>Daily Task</h2>
            <p>{badgeSwipeNotice}</p>
            <button
              type="button"
              onClick={() => {
                setShowBadgeSwipeModal(false);
                setBadgeSwipeNotice("");
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
      {showFwEmailModal && (
        <div className="user-email-overlay" role="dialog" aria-modal="true" aria-labelledby="user-email-title">
          <div className="user-email-modal">
            <h2 id="user-email-title">Welcome to Office World</h2>
            <p>Please enter your email</p>
            <form onSubmit={submitFwEmail}>
              <label htmlFor="fw-email-input">Email</label>
              <input
                ref={fwEmailInputRef}
                id="fw-email-input"
                name="fwEmail"
                type="email"
                autoFocus
                autoComplete="email"
                value={fwEmail}
                onChange={(event) => setFwEmail(event.target.value)}
                onKeyDownCapture={suppressModalKeyPropagation}
                onKeyDown={suppressModalKeyPropagation}
                onKeyUpCapture={suppressModalKeyPropagation}
                onKeyUp={suppressModalKeyPropagation}
                placeholder="name@example.com"
                required
                disabled={savingFwEmail}
              />
              {fwEmailError ? <p className="user-email-error">{fwEmailError}</p> : null}
              <button type="submit" disabled={savingFwEmail}>
                {savingFwEmail ? "Saving..." : "Continue"}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
