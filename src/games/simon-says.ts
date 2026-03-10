import type { Scene } from "../core/scene.ts";
import type { GamepadInput, NeckKey } from "../core/gamepad.ts";
import { BUTTON_COLORS, NECK_LABELS, drawText } from "../core/canvas.ts";
import { getHighScore, saveHighScore } from "../core/score.ts";

const LANES: NeckKey[] = ["r", "g", "b", "y", "p"];
const GAME_ID = "simon-says";
const INITIAL_SEQUENCE_LENGTH = 2;
const SHOW_ON_DURATION = 500; // ms to light up each button
const SHOW_OFF_DURATION = 200; // ms gap between buttons
const SUCCESS_DISPLAY_TIME = 800; // ms to show success message

type Phase = "showing" | "input" | "success" | "gameover";

export class SimonSaysGame implements Scene {
  private phase: Phase = "showing";
  private sequence: NeckKey[] = [];
  private playerIndex = 0;
  private showIndex = 0;
  private showTimer = 0;
  private showingOn = true; // true = button lit, false = gap between buttons
  private successTimer = 0;
  private score = 0;
  private elapsed = 0;
  private flashEffect: { key: NeckKey; correct: boolean; time: number } | null =
    null;

  constructor(
    private input: GamepadInput,
    private onReturnToMenu: () => void,
  ) {}

  enter(): void {
    this.phase = "showing";
    this.sequence = [];
    this.playerIndex = 0;
    this.showIndex = 0;
    this.showTimer = 0;
    this.showingOn = true;
    this.successTimer = 0;
    this.score = 0;
    this.elapsed = 0;
    this.flashEffect = null;
    this.generateInitialSequence();
  }

  private generateInitialSequence(): void {
    this.sequence = [];
    for (let i = 0; i < INITIAL_SEQUENCE_LENGTH; i++) {
      this.sequence.push(LANES[Math.floor(Math.random() * LANES.length)]);
    }
    this.startShowing();
  }

  private startShowing(): void {
    this.phase = "showing";
    this.showIndex = 0;
    this.showTimer = 0;
    this.showingOn = true;
  }

  private extendSequence(): void {
    this.sequence.push(LANES[Math.floor(Math.random() * LANES.length)]);
    this.score = this.sequence.length - 1; // score = longest reproduced length
  }

  update(dt: number): void {
    this.elapsed += dt;

    if (this.phase === "gameover") {
      if (
        this.input.isPickUpJustPressed() ||
        this.input.isPickDownJustPressed()
      ) {
        this.onReturnToMenu();
      }
      return;
    }

    if (this.phase === "showing") {
      this.showTimer += dt;

      if (this.showingOn) {
        // Currently lighting up a button
        if (this.showTimer >= SHOW_ON_DURATION) {
          this.showTimer -= SHOW_ON_DURATION;
          this.showingOn = false;
        }
      } else {
        // Gap between buttons
        if (this.showTimer >= SHOW_OFF_DURATION) {
          this.showTimer -= SHOW_OFF_DURATION;
          this.showIndex++;
          this.showingOn = true;

          if (this.showIndex >= this.sequence.length) {
            // Done showing, switch to input phase
            this.phase = "input";
            this.playerIndex = 0;
          }
        }
      }
      return;
    }

    if (this.phase === "success") {
      this.successTimer += dt;
      if (this.successTimer >= SUCCESS_DISPLAY_TIME) {
        this.extendSequence();
        this.startShowing();
      }
      return;
    }

    // phase === 'input'
    const justPressed = this.input.getNeckJustPressed();
    for (const key of LANES) {
      if (justPressed[key]) {
        const expected = this.sequence[this.playerIndex];
        if (key === expected) {
          // Correct
          this.flashEffect = { key, correct: true, time: this.elapsed };
          this.playerIndex++;

          if (this.playerIndex >= this.sequence.length) {
            // Completed the whole sequence
            this.score = this.sequence.length;
            this.phase = "success";
            this.successTimer = 0;
          }
        } else {
          // Wrong
          this.flashEffect = { key, correct: false, time: this.elapsed };
          this.phase = "gameover";
          saveHighScore(GAME_ID, this.score);
        }
        break; // Only process one button per frame
      }
    }

    // Clear old flash effects
    if (this.flashEffect && this.elapsed - this.flashEffect.time > 300) {
      this.flashEffect = null;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // Background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    if (this.phase === "gameover") {
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
    drawText(ctx, `SEQUENCE: ${this.sequence.length}`, w / 2, 40, {
      size: 28,
    });

    // Phase indicator
    let phaseText = "";
    let phaseColor = "#ffffff";
    if (this.phase === "showing") {
      phaseText = "Watch carefully...";
      phaseColor = "#ffdd44";
    } else if (this.phase === "input") {
      phaseText = `Your turn! (${this.playerIndex + 1}/${this.sequence.length})`;
      phaseColor = "#44ff44";
    } else if (this.phase === "success") {
      phaseText = "Correct!";
      phaseColor = "#44ff44";
    }
    drawText(ctx, phaseText, w / 2, 90, { size: 24, color: phaseColor });

    // Draw buttons
    const buttonSize = Math.min(100, (w - 150) / 5);
    const spacing = buttonSize + 30;
    const startX = w / 2 - (spacing * 4) / 2;
    const buttonY = h * 0.5;

    for (let i = 0; i < LANES.length; i++) {
      const lane = LANES[i];
      const x = startX + i * spacing;

      // Determine if this button should be lit
      let isLit = false;
      if (
        this.phase === "showing" &&
        this.showingOn &&
        this.showIndex < this.sequence.length &&
        this.sequence[this.showIndex] === lane
      ) {
        isLit = true;
      }

      // Flash effect for input phase
      const hasFlash =
        this.flashEffect &&
        this.flashEffect.key === lane &&
        this.elapsed - this.flashEffect.time < 300;

      if (isLit) {
        // Glow effect
        const glowSize = buttonSize * 0.7;
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

        // Bright button
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
        // Dim button
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

      // Flash overlay for correct/wrong input
      if (hasFlash && this.flashEffect) {
        const age = this.elapsed - this.flashEffect.time;
        const alpha = 0.6 * (1 - age / 300);
        if (alpha > 0) {
          const flashColor = this.flashEffect.correct
            ? `rgba(68, 255, 68, ${alpha})`
            : `rgba(255, 68, 68, ${alpha})`;
          ctx.fillStyle = flashColor;
          ctx.beginPath();
          ctx.arc(x, buttonY, buttonSize * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // During input phase, show which buttons in sequence have been completed
    if (this.phase === "input") {
      const dotY = buttonY + buttonSize * 0.5 + 60;
      const dotSpacing = 20;
      const dotsStartX = w / 2 - ((this.sequence.length - 1) * dotSpacing) / 2;

      for (let i = 0; i < this.sequence.length; i++) {
        const dx = dotsStartX + i * dotSpacing;
        const completed = i < this.playerIndex;
        ctx.fillStyle = completed
          ? BUTTON_COLORS[this.sequence[i]]
          : "#333333";
        ctx.beginPath();
        ctx.arc(dx, dotY, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Title
    drawText(ctx, "Simon Says", w / 2, h - 40, {
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
    drawText(ctx, "Simon Says", w / 2, 160, { size: 24, color: "#888888" });

    drawText(ctx, `SEQUENCE LENGTH: ${this.score}`, w / 2, 260, {
      size: 40,
      color: "#ffffff",
    });

    const highScore = getHighScore(GAME_ID);
    drawText(ctx, `HIGH SCORE: ${highScore}`, w / 2, 340, {
      size: 28,
      color: "#ffdd44",
    });

    if (this.score >= highScore && this.score > 0) {
      drawText(ctx, "NEW RECORD!", w / 2, 400, {
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
