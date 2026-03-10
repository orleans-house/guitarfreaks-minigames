import type { Scene } from "../core/scene.ts";
import type { GamepadInput, NeckKey } from "../core/gamepad.ts";
import { BUTTON_COLORS, NECK_LABELS, drawText } from "../core/canvas.ts";
import { getHighScore, saveHighScore } from "../core/score.ts";

// Difficulty constants
const GAME_DURATION = 60_000; // 60 seconds
const INITIAL_SPAWN_INTERVAL = 1500;
const MIN_SPAWN_INTERVAL = 500;
const INITIAL_MOLE_LIFETIME = 1500;
const MIN_MOLE_LIFETIME = 800;
const MAX_SIMULTANEOUS_MOLES = 3;
const HIT_SCORE = 100;
const COMBO_BONUS_MULTIPLIER = 10;

const LANES: NeckKey[] = ["r", "g", "b", "y", "p"];

const GAME_ID = "whack-a-mole";

interface Mole {
  lane: NeckKey;
  spawnTime: number;
  lifetime: number;
  alive: boolean;
  hit: boolean;
  hitTime: number;
}

type Phase = "playing" | "result";

export class WhackAMoleGame implements Scene {
  private phase: Phase = "playing";
  private moles: Mole[] = [];
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private elapsed = 0;
  private spawnTimer = 0;
  private hitEffects: Array<{ lane: NeckKey; time: number; score: number }> = [];

  constructor(
    private input: GamepadInput,
    private onReturnToMenu: () => void,
  ) {}

  enter(): void {
    this.phase = "playing";
    this.moles = [];
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.hitEffects = [];
  }

  private getDifficulty(): {
    spawnInterval: number;
    moleLifetime: number;
    maxMoles: number;
  } {
    const progress = Math.min(this.elapsed / GAME_DURATION, 1);
    const spawnInterval =
      INITIAL_SPAWN_INTERVAL -
      (INITIAL_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL) * progress;
    const moleLifetime =
      INITIAL_MOLE_LIFETIME -
      (INITIAL_MOLE_LIFETIME - MIN_MOLE_LIFETIME) * progress;
    const maxMoles = Math.min(
      1 + Math.floor(progress * MAX_SIMULTANEOUS_MOLES),
      MAX_SIMULTANEOUS_MOLES,
    );
    return { spawnInterval, moleLifetime, maxMoles };
  }

  private spawnMole(): void {
    const difficulty = this.getDifficulty();
    const activeLanes = new Set(
      this.moles.filter((m) => m.alive).map((m) => m.lane),
    );

    // Find available lanes
    const available = LANES.filter((l) => !activeLanes.has(l));
    if (available.length === 0) return;

    const lane = available[Math.floor(Math.random() * available.length)];
    this.moles.push({
      lane,
      spawnTime: this.elapsed,
      lifetime: difficulty.moleLifetime,
      alive: true,
      hit: false,
      hitTime: 0,
    });
  }

  update(dt: number): void {
    if (this.phase === "result") {
      // Any pick to return to menu
      if (
        this.input.isPickUpJustPressed() ||
        this.input.isPickDownJustPressed()
      ) {
        this.onReturnToMenu();
      }
      return;
    }

    this.elapsed += dt;

    // Check game over
    if (this.elapsed >= GAME_DURATION) {
      this.phase = "result";
      saveHighScore(GAME_ID, this.score);
      return;
    }

    const difficulty = this.getDifficulty();

    // Spawn moles
    this.spawnTimer += dt;
    if (this.spawnTimer >= difficulty.spawnInterval) {
      this.spawnTimer -= difficulty.spawnInterval;
      const activeMoles = this.moles.filter((m) => m.alive).length;
      if (activeMoles < difficulty.maxMoles) {
        this.spawnMole();
      }
    }

    // Check for expired moles
    for (const mole of this.moles) {
      if (mole.alive && this.elapsed - mole.spawnTime > mole.lifetime) {
        mole.alive = false;
        this.combo = 0; // Reset combo on miss
      }
    }

    // Check neck button presses
    const justPressed = this.input.getNeckJustPressed();
    for (const key of LANES) {
      if (justPressed[key]) {
        const mole = this.moles.find((m) => m.alive && m.lane === key);
        if (mole) {
          mole.alive = false;
          mole.hit = true;
          mole.hitTime = this.elapsed;
          this.combo++;
          if (this.combo > this.maxCombo) {
            this.maxCombo = this.combo;
          }
          const points = HIT_SCORE + this.combo * COMBO_BONUS_MULTIPLIER;
          this.score += points;
          this.hitEffects.push({ lane: key, time: this.elapsed, score: points });
        }
      }
    }

    // Remove old hit effects
    this.hitEffects = this.hitEffects.filter(
      (e) => this.elapsed - e.time < 500,
    );

    // Clean up old dead moles
    this.moles = this.moles.filter(
      (m) => m.alive || this.elapsed - m.spawnTime < m.lifetime + 500,
    );
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // Background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    if (this.phase === "result") {
      this.drawResult(ctx, w, h);
      return;
    }

    this.drawPlaying(ctx, w, h);
  }

  private drawPlaying(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    // HUD
    const timeRemaining = Math.max(0, GAME_DURATION - this.elapsed);
    drawText(ctx, `TIME: ${(timeRemaining / 1000).toFixed(1)}s`, 120, 40, {
      size: 28,
      color: timeRemaining < 10000 ? "#ff4444" : "#ffffff",
      align: "left",
    });
    drawText(ctx, `SCORE: ${this.score}`, w / 2, 40, { size: 28 });
    drawText(ctx, `COMBO: ${this.combo}`, w - 120, 40, {
      size: 28,
      color: this.combo >= 5 ? "#ffdd44" : "#ffffff",
      align: "right",
    });

    // Draw lanes
    const laneWidth = Math.min(120, (w - 100) / 5);
    const laneSpacing = laneWidth + 20;
    const startX = w / 2 - (laneSpacing * 4) / 2;
    const holeY = h * 0.6;
    const holeRadius = laneWidth * 0.4;

    for (let i = 0; i < LANES.length; i++) {
      const lane = LANES[i];
      const x = startX + i * laneSpacing;

      // Draw hole (dark circle)
      ctx.fillStyle = "#0a0a1a";
      ctx.beginPath();
      ctx.ellipse(x, holeY, holeRadius, holeRadius * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Draw hole rim
      ctx.strokeStyle = BUTTON_COLORS[lane];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, holeY, holeRadius, holeRadius * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Button label
      drawText(ctx, NECK_LABELS[lane], x, holeY + holeRadius + 30, {
        size: 24,
        color: BUTTON_COLORS[lane],
      });

      // Draw mole if alive
      const mole = this.moles.find((m) => m.alive && m.lane === lane);
      if (mole) {
        const age = this.elapsed - mole.spawnTime;
        // Pop-up animation (first 200ms)
        const popProgress = Math.min(age / 200, 1);
        const moleY = holeY - holeRadius * 1.5 * popProgress;

        // Mole body
        ctx.fillStyle = BUTTON_COLORS[lane];
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(x, moleY, holeRadius * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Mole eyes
        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.arc(x - 10, moleY - 8, 5, 0, Math.PI * 2);
        ctx.arc(x + 10, moleY - 8, 5, 0, Math.PI * 2);
        ctx.fill();

        // Flashing warning when about to expire (last 300ms)
        const remaining = mole.lifetime - age;
        if (remaining < 300) {
          ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(age * 0.02));
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(x, moleY, holeRadius * 0.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // Draw hit effect
      const effect = this.hitEffects.find((e) => e.lane === lane);
      if (effect) {
        const age = this.elapsed - effect.time;
        const alpha = 1 - age / 500;
        ctx.globalAlpha = alpha;

        // Star burst
        ctx.fillStyle = BUTTON_COLORS[lane];
        for (let s = 0; s < 8; s++) {
          const angle = (s / 8) * Math.PI * 2 + age * 0.005;
          const dist = 20 + age * 0.1;
          const sx = x + Math.cos(angle) * dist;
          const sy = holeY - holeRadius + Math.sin(angle) * dist;
          ctx.beginPath();
          ctx.arc(sx, sy, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Score popup
        drawText(ctx, `+${effect.score}`, x, holeY - holeRadius * 2 - age * 0.05, {
          size: 22,
          color: "#ffdd44",
        });

        ctx.globalAlpha = 1;
      }
    }

    // Title
    drawText(ctx, "Whack-a-Mole", w / 2, h - 40, {
      size: 20,
      color: "#888888",
    });
  }

  private drawResult(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    drawText(ctx, "RESULT", w / 2, 100, { size: 48, color: "#ffdd44" });
    drawText(ctx, "Whack-a-Mole", w / 2, 160, {
      size: 24,
      color: "#888888",
    });

    drawText(ctx, `SCORE: ${this.score}`, w / 2, 260, {
      size: 40,
      color: "#ffffff",
    });
    drawText(ctx, `MAX COMBO: ${this.maxCombo}`, w / 2, 320, {
      size: 28,
      color: "#cccccc",
    });

    const highScore = getHighScore(GAME_ID);
    drawText(ctx, `HIGH SCORE: ${highScore}`, w / 2, 380, {
      size: 28,
      color: "#ffdd44",
    });

    if (this.score >= highScore && this.score > 0) {
      drawText(ctx, "NEW RECORD!", w / 2, 440, {
        size: 32,
        color: "#ff4444",
      });
    }

    drawText(ctx, "ピッキングでメニューに戻る", w / 2, h - 60, {
      size: 20,
      color: "#888888",
    });
  }

  exit(): void {
    // Nothing to clean up
  }
}
