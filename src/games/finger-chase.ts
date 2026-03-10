import type { Scene } from "../core/scene.ts";
import type { GamepadInput, NeckKey } from "../core/gamepad.ts";
import { BUTTON_COLORS, NECK_LABELS, drawText } from "../core/canvas.ts";
import { getHighScore, saveHighScore } from "../core/score.ts";

// Difficulty constants
const INITIAL_GRACE_TIME = 1000;
const MIN_GRACE_TIME = 300;
const GRACE_DECREASE_PER_HIT = 15;
const HIT_SCORE = 100;
const MISS_PENALTY = 50;
const MAX_LIVES = 3;
const LEVEL_UP_HITS = 10; // Hits per level-up

const LANES: NeckKey[] = ["r", "g", "b", "y", "p"];
const GAME_ID = "finger-chase";

type Pattern = "bounce" | "random" | "skip";

type Phase = "playing" | "result";

export class FingerChaseGame implements Scene {
  private phase: Phase = "playing";
  private currentTarget: NeckKey = "r";
  private targetTimer = 0;
  private graceTime = INITIAL_GRACE_TIME;
  private score = 0;
  private lives = MAX_LIVES;
  private level = 1;
  private hitCount = 0;
  private pattern: Pattern = "bounce";
  private bounceDirection = 1; // 1 = right, -1 = left
  private elapsed = 0;

  constructor(
    private input: GamepadInput,
    private onReturnToMenu: () => void,
  ) {}

  enter(): void {
    this.phase = "playing";
    this.currentTarget = LANES[Math.floor(Math.random() * LANES.length)];
    this.targetTimer = 0;
    this.graceTime = INITIAL_GRACE_TIME;
    this.score = 0;
    this.lives = MAX_LIVES;
    this.level = 1;
    this.hitCount = 0;
    this.pattern = "bounce";
    this.bounceDirection = 1;
    this.elapsed = 0;
  }

  private getNextTarget(): NeckKey {
    const currentIndex = LANES.indexOf(this.currentTarget);

    switch (this.pattern) {
      case "bounce": {
        let nextIndex = currentIndex + this.bounceDirection;
        if (nextIndex >= LANES.length) {
          this.bounceDirection = -1;
          nextIndex = currentIndex - 1;
        } else if (nextIndex < 0) {
          this.bounceDirection = 1;
          nextIndex = currentIndex + 1;
        }
        return LANES[nextIndex];
      }
      case "random": {
        const others = LANES.filter((l) => l !== this.currentTarget);
        return others[Math.floor(Math.random() * others.length)];
      }
      case "skip": {
        let nextIndex = currentIndex + this.bounceDirection * 2;
        if (nextIndex >= LANES.length || nextIndex < 0) {
          this.bounceDirection *= -1;
          nextIndex = currentIndex + this.bounceDirection * 2;
          // Clamp just in case
          nextIndex = Math.max(0, Math.min(LANES.length - 1, nextIndex));
        }
        return LANES[nextIndex];
      }
    }
  }

  private advanceTarget(): void {
    this.currentTarget = this.getNextTarget();
    this.targetTimer = 0;
  }

  private updateLevel(): void {
    const newLevel = 1 + Math.floor(this.hitCount / LEVEL_UP_HITS);
    if (newLevel !== this.level) {
      this.level = newLevel;
      if (this.level <= 2) {
        this.pattern = "bounce";
      } else if (this.level <= 4) {
        this.pattern = "random";
      } else {
        this.pattern = "skip";
      }
    }
  }

  update(dt: number): void {
    this.elapsed += dt;

    if (this.phase === "result") {
      if (
        this.input.isPickUpJustPressed() ||
        this.input.isPickDownJustPressed()
      ) {
        this.onReturnToMenu();
      }
      return;
    }

    // Update grace timer
    this.targetTimer += dt;
    if (this.targetTimer >= this.graceTime) {
      // Time expired -- lose a life
      this.lives--;
      if (this.lives <= 0) {
        this.phase = "result";
        saveHighScore(GAME_ID, this.score);
        return;
      }
      this.advanceTarget();
    }

    // Check neck button presses
    const justPressed = this.input.getNeckJustPressed();
    for (const key of LANES) {
      if (justPressed[key]) {
        if (key === this.currentTarget) {
          // Correct!
          this.score += HIT_SCORE;
          this.hitCount++;
          this.updateLevel();
          this.graceTime = Math.max(
            MIN_GRACE_TIME,
            INITIAL_GRACE_TIME - this.hitCount * GRACE_DECREASE_PER_HIT,
          );
          this.advanceTarget();
        } else {
          // Wrong button
          this.score = Math.max(0, this.score - MISS_PENALTY);
        }
      }
    }

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
    // Lives (hearts)
    for (let i = 0; i < MAX_LIVES; i++) {
      const heartX = 40 + i * 40;
      const heartColor = i < this.lives ? "#ff4444" : "#333333";
      drawText(ctx, "\u2665", heartX, 40, {
        size: 32,
        color: heartColor,
        align: "center",
      });
    }

    drawText(ctx, `SCORE: ${this.score}`, w / 2, 40, { size: 28 });
    drawText(ctx, `Lv.${this.level} (${this.pattern})`, w - 120, 40, {
      size: 22,
      color: "#cccccc",
      align: "right",
    });

    // Grace time bar
    const barWidth = 300;
    const barHeight = 12;
    const barX = w / 2 - barWidth / 2;
    const barY = 80;
    const progress = Math.max(0, 1 - this.targetTimer / this.graceTime);

    ctx.fillStyle = "#333333";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 6);
    ctx.fill();

    const barColor =
      progress > 0.5
        ? "#44ff44"
        : progress > 0.25
          ? "#ffdd44"
          : "#ff4444";
    ctx.fillStyle = barColor;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth * progress, barHeight, 6);
    ctx.fill();

    // Draw buttons
    const buttonSize = Math.min(100, (w - 150) / 5);
    const spacing = buttonSize + 30;
    const startX = w / 2 - (spacing * 4) / 2;
    const buttonY = h * 0.5;

    for (let i = 0; i < LANES.length; i++) {
      const lane = LANES[i];
      const x = startX + i * spacing;
      const isTarget = lane === this.currentTarget;

      if (isTarget) {
        // Glow effect
        const glowSize = buttonSize * 0.7 + Math.sin(this.elapsed * 0.005) * 8;
        const gradient = ctx.createRadialGradient(
          x,
          buttonY,
          0,
          x,
          buttonY,
          glowSize * 1.5,
        );
        gradient.addColorStop(0, BUTTON_COLORS[lane] + "88");
        gradient.addColorStop(1, BUTTON_COLORS[lane] + "00");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, buttonY, glowSize * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Enlarged button
        ctx.fillStyle = BUTTON_COLORS[lane];
        ctx.beginPath();
        ctx.arc(x, buttonY, glowSize, 0, Math.PI * 2);
        ctx.fill();

        // Label
        drawText(ctx, NECK_LABELS[lane], x, buttonY, {
          size: 36,
          color: "#000000",
        });
      } else {
        // Inactive button
        ctx.fillStyle = BUTTON_COLORS[lane] + "33";
        ctx.beginPath();
        ctx.arc(x, buttonY, buttonSize * 0.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = BUTTON_COLORS[lane] + "66";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, buttonY, buttonSize * 0.5, 0, Math.PI * 2);
        ctx.stroke();

        drawText(ctx, NECK_LABELS[lane], x, buttonY, {
          size: 24,
          color: BUTTON_COLORS[lane] + "66",
        });
      }
    }


    // Title
    drawText(ctx, "Finger Chase", w / 2, h - 40, {
      size: 20,
      color: "#888888",
    });
  }

  private drawResult(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    drawText(ctx, "GAME OVER", w / 2, 100, { size: 48, color: "#ff4444" });
    drawText(ctx, "Finger Chase", w / 2, 160, {
      size: 24,
      color: "#888888",
    });

    drawText(ctx, `SCORE: ${this.score}`, w / 2, 260, {
      size: 40,
      color: "#ffffff",
    });
    drawText(ctx, `LEVEL: ${this.level}`, w / 2, 320, {
      size: 28,
      color: "#cccccc",
    });
    drawText(ctx, `HITS: ${this.hitCount}`, w / 2, 370, {
      size: 28,
      color: "#cccccc",
    });

    const highScore = getHighScore(GAME_ID);
    drawText(ctx, `HIGH SCORE: ${highScore}`, w / 2, 430, {
      size: 28,
      color: "#ffdd44",
    });

    if (this.score >= highScore && this.score > 0) {
      drawText(ctx, "NEW RECORD!", w / 2, 490, {
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
