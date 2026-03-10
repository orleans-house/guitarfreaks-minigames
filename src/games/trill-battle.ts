import type { Scene } from "../core/scene.ts";
import type { GamepadInput, NeckKey } from "../core/gamepad.ts";
import { BUTTON_COLORS, NECK_LABELS, drawText } from "../core/canvas.ts";
import { getHighScore, saveHighScore } from "../core/score.ts";

const GAME_ID = "trill-battle";
const ROUND_DURATION = 10_000; // 10 seconds per round
const COUNTDOWN_DURATION = 2000; // 2 seconds countdown before each round

const ROUNDS: [NeckKey, NeckKey][] = [
  ["r", "g"],
  ["g", "b"],
  ["b", "y"],
  ["y", "p"],
  ["r", "b"],
  ["r", "y"],
  ["g", "y"],
  ["g", "p"],
];

type Phase = "countdown" | "playing" | "roundresult" | "result";

export class TrillBattleGame implements Scene {
  private phase: Phase = "countdown";
  private currentRound = 0;
  private roundTimer = 0;
  private countdownTimer = 0;
  private trillCount = 0;
  private nextExpected = 0; // 0 = first button, 1 = second button
  private roundScores: number[] = [];
  private totalScore = 0;
  private elapsed = 0;
  private roundResultTimer = 0;
  private hitFlash: { time: number } | null = null;

  constructor(
    private input: GamepadInput,
    private onReturnToMenu: () => void,
  ) {}

  enter(): void {
    this.phase = "countdown";
    this.currentRound = 0;
    this.roundTimer = 0;
    this.countdownTimer = 0;
    this.trillCount = 0;
    this.nextExpected = 0;
    this.roundScores = [];
    this.totalScore = 0;
    this.elapsed = 0;
    this.roundResultTimer = 0;
    this.hitFlash = null;
  }

  private getCurrentPair(): [NeckKey, NeckKey] {
    return ROUNDS[this.currentRound];
  }

  private startNextRound(): void {
    if (this.currentRound >= ROUNDS.length) {
      this.phase = "result";
      this.totalScore = this.roundScores.reduce((a, b) => a + b, 0);
      saveHighScore(GAME_ID, this.totalScore);
      return;
    }
    this.phase = "countdown";
    this.countdownTimer = 0;
    this.trillCount = 0;
    this.nextExpected = 0;
    this.hitFlash = null;
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

    if (this.phase === "countdown") {
      this.countdownTimer += dt;
      if (this.countdownTimer >= COUNTDOWN_DURATION) {
        this.phase = "playing";
        this.roundTimer = 0;
      }
      return;
    }

    if (this.phase === "roundresult") {
      this.roundResultTimer += dt;
      if (this.roundResultTimer >= 1500) {
        this.currentRound++;
        this.startNextRound();
      }
      return;
    }

    // phase === 'playing'
    this.roundTimer += dt;

    if (this.roundTimer >= ROUND_DURATION) {
      // Round over
      this.roundScores.push(this.trillCount);
      this.phase = "roundresult";
      this.roundResultTimer = 0;
      return;
    }

    // Check trill input
    const pair = this.getCurrentPair();
    const justPressed = this.input.getNeckJustPressed();
    const expectedKey = pair[this.nextExpected];

    if (justPressed[expectedKey]) {
      this.trillCount++;
      this.nextExpected = this.nextExpected === 0 ? 1 : 0;
      this.hitFlash = { time: this.elapsed };
    }

    // Clear old flash
    if (this.hitFlash && this.elapsed - this.hitFlash.time > 100) {
      this.hitFlash = null;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // Background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    if (this.phase === "result") {
      this.drawFinalResult(ctx, w, h);
      return;
    }

    if (this.phase === "roundresult") {
      this.drawRoundResult(ctx, w, h);
      return;
    }

    this.drawPlaying(ctx, w, h);
  }

  private drawPlaying(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    const pair = this.getCurrentPair();

    // HUD
    drawText(
      ctx,
      `Round ${this.currentRound + 1}/${ROUNDS.length}`,
      w / 2,
      40,
      { size: 28 },
    );

    if (this.phase === "countdown") {
      const remaining = Math.ceil(
        (COUNTDOWN_DURATION - this.countdownTimer) / 1000,
      );
      drawText(ctx, `${pair[0].toUpperCase()} - ${pair[1].toUpperCase()}`, w / 2, h * 0.4, {
        size: 60,
        color: "#ffffff",
      });
      drawText(ctx, `${remaining}`, w / 2, h * 0.6, {
        size: 80,
        color: "#ffdd44",
      });
      drawText(ctx, "Get Ready!", w / 2, h * 0.75, {
        size: 24,
        color: "#888888",
      });
      return;
    }

    // Playing phase
    const timeRemaining = Math.max(0, ROUND_DURATION - this.roundTimer);
    drawText(ctx, `TIME: ${(timeRemaining / 1000).toFixed(1)}s`, 120, 40, {
      size: 28,
      color: timeRemaining < 3000 ? "#ff4444" : "#ffffff",
      align: "left",
    });
    drawText(ctx, `COUNT: ${this.trillCount}`, w - 120, 40, {
      size: 28,
      color: "#ffffff",
      align: "right",
    });

    // Draw the two target buttons large
    const buttonSize = Math.min(140, w / 5);
    const gap = buttonSize * 1.5;
    const centerY = h * 0.5;

    for (let bi = 0; bi < 2; bi++) {
      const key = pair[bi];
      const x = w / 2 + (bi === 0 ? -gap / 2 : gap / 2);
      const isNext = bi === this.nextExpected;

      if (isNext) {
        // Highlighted (next to press)
        const glowSize = buttonSize * 0.55 + Math.sin(this.elapsed * 0.008) * 5;
        const gradient = ctx.createRadialGradient(
          x,
          centerY,
          0,
          x,
          centerY,
          glowSize * 1.6,
        );
        gradient.addColorStop(0, BUTTON_COLORS[key] + "aa");
        gradient.addColorStop(1, BUTTON_COLORS[key] + "00");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, centerY, glowSize * 1.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = BUTTON_COLORS[key];
        ctx.beginPath();
        ctx.arc(x, centerY, glowSize, 0, Math.PI * 2);
        ctx.fill();

        drawText(ctx, NECK_LABELS[key], x, centerY, {
          size: 48,
          color: "#000000",
        });
      } else {
        // Dim
        ctx.fillStyle = BUTTON_COLORS[key] + "44";
        ctx.beginPath();
        ctx.arc(x, centerY, buttonSize * 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = BUTTON_COLORS[key] + "88";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, centerY, buttonSize * 0.4, 0, Math.PI * 2);
        ctx.stroke();

        drawText(ctx, NECK_LABELS[key], x, centerY, {
          size: 36,
          color: BUTTON_COLORS[key] + "88",
        });
      }
    }

    // Arrow between buttons showing trill direction
    const arrowY = centerY + buttonSize * 0.7;
    drawText(
      ctx,
      `${NECK_LABELS[pair[0]]} \u2194 ${NECK_LABELS[pair[1]]}`,
      w / 2,
      arrowY,
      {
        size: 24,
        color: "#888888",
      },
    );

    // Hit flash
    if (this.hitFlash) {
      const age = this.elapsed - this.hitFlash.time;
      const alpha = 0.2 * (1 - age / 100);
      if (alpha > 0) {
        ctx.fillStyle = `rgba(68, 255, 68, ${alpha})`;
        ctx.fillRect(0, 0, w, h);
      }
    }

    // Time bar
    const barWidth = 400;
    const barHeight = 12;
    const barX = w / 2 - barWidth / 2;
    const barY = h - 80;
    const progress = Math.max(0, 1 - this.roundTimer / ROUND_DURATION);

    ctx.fillStyle = "#333333";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 6);
    ctx.fill();

    const barColor =
      progress > 0.5 ? "#44ff44" : progress > 0.25 ? "#ffdd44" : "#ff4444";
    ctx.fillStyle = barColor;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth * progress, barHeight, 6);
    ctx.fill();

    // Title
    drawText(ctx, "Trill Battle", w / 2, h - 40, {
      size: 20,
      color: "#888888",
    });
  }

  private drawRoundResult(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    const pair = ROUNDS[this.currentRound];
    drawText(
      ctx,
      `Round ${this.currentRound + 1} Complete!`,
      w / 2,
      h * 0.35,
      {
        size: 36,
        color: "#ffdd44",
      },
    );
    drawText(
      ctx,
      `${NECK_LABELS[pair[0]]} - ${NECK_LABELS[pair[1]]}`,
      w / 2,
      h * 0.45,
      {
        size: 28,
        color: "#cccccc",
      },
    );
    drawText(ctx, `${this.trillCount} trills`, w / 2, h * 0.55, {
      size: 48,
      color: "#ffffff",
    });

    // Running total
    const runningTotal =
      this.roundScores.reduce((a, b) => a + b, 0);
    drawText(ctx, `Total: ${runningTotal}`, w / 2, h * 0.67, {
      size: 24,
      color: "#888888",
    });
  }

  private drawFinalResult(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    drawText(ctx, "RESULT", w / 2, 80, { size: 48, color: "#ffdd44" });
    drawText(ctx, "Trill Battle", w / 2, 130, { size: 24, color: "#888888" });

    // Per-round scores
    const startY = 190;
    const lineHeight = 32;
    for (let i = 0; i < this.roundScores.length; i++) {
      const pair = ROUNDS[i];
      const text = `R${i + 1}: ${NECK_LABELS[pair[0]]}-${NECK_LABELS[pair[1]]}  ${this.roundScores[i]}`;
      drawText(ctx, text, w / 2, startY + i * lineHeight, {
        size: 22,
        color: "#cccccc",
      });
    }

    const totalY = startY + this.roundScores.length * lineHeight + 30;
    drawText(ctx, `TOTAL: ${this.totalScore}`, w / 2, totalY, {
      size: 40,
      color: "#ffffff",
    });

    const highScore = getHighScore(GAME_ID);
    drawText(ctx, `HIGH SCORE: ${highScore}`, w / 2, totalY + 60, {
      size: 28,
      color: "#ffdd44",
    });

    if (this.totalScore >= highScore && this.totalScore > 0) {
      drawText(ctx, "NEW RECORD!", w / 2, totalY + 110, {
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
