import type { Scene } from "../core/scene.ts";
import type { GamepadInput, NeckKey } from "../core/gamepad.ts";
import { BUTTON_COLORS, NECK_LABELS, drawText } from "../core/canvas.ts";
import { getHighScore, saveHighScore } from "../core/score.ts";

const LANES: NeckKey[] = ["r", "g", "b", "y", "p"];
const MAX_SPAN = 2; // Normal mode: max distance between ON buttons
const GAME_ID_NORMAL = "speed-typing";
const GAME_ID_ABSURD = "speed-typing-absurd";
const GAME_DURATION = 60_000; // 60 seconds
const PROBLEM_TIME_LIMIT = 5_000; // 5 seconds per problem

type Mode = "normal" | "absurd";
type Phase = "mode-select" | "playing" | "result";

interface Problem {
  target: Record<NeckKey, boolean>;
  onCount: number;
}

export class SpeedTypingGame implements Scene {
  private phase: Phase = "mode-select";
  private mode: Mode = "normal";
  private modeCursor = 0;
  private elapsed = 0;
  private score = 0;
  private misses = 0;
  private problemTimer = 0;
  private currentProblem: Problem | null = null;

  constructor(
    private input: GamepadInput,
    private onReturnToMenu: () => void,
  ) {}

  enter(): void {
    this.phase = "mode-select";
    this.modeCursor = 0;
    this.elapsed = 0;
    this.score = 0;
    this.misses = 0;
    this.problemTimer = 0;
    this.currentProblem = null;
  }

  private startGame(): void {
    this.mode = this.modeCursor === 0 ? "normal" : "absurd";
    this.phase = "playing";
    this.elapsed = 0;
    this.score = 0;
    this.misses = 0;
    this.problemTimer = 0;
    this.generateProblem();
  }

  private getOnButtonCount(): number {
    // Increase number of ON buttons based on elapsed time
    const progress = this.elapsed / GAME_DURATION;
    if (progress < 0.3) return 1;
    if (progress < 0.6) return 2;
    return 3;
  }

  private generateProblem(): void {
    const onCount = this.getOnButtonCount();

    if (this.mode === "absurd" || onCount === 1) {
      this.generateAbsurdProblem(onCount);
    } else {
      this.generateNormalProblem(onCount);
    }
  }

  private generateAbsurdProblem(onCount: number): void {
    const target: Record<NeckKey, boolean> = {
      r: false, g: false, b: false, y: false, p: false,
    };
    const available = [...LANES];
    for (let i = 0; i < onCount; i++) {
      const idx = Math.floor(Math.random() * available.length);
      target[available[idx]] = true;
      available.splice(idx, 1);
    }
    this.currentProblem = { target, onCount };
  }

  private generateNormalProblem(onCount: number): void {
    const target: Record<NeckKey, boolean> = {
      r: false, g: false, b: false, y: false, p: false,
    };

    // Pick a random start position, then choose onCount buttons within MAX_SPAN
    const maxStart = LANES.length - 1 - MAX_SPAN;
    const startIdx = Math.floor(Math.random() * (maxStart + 1));
    // Available lanes within the span
    const candidates: NeckKey[] = [];
    for (let i = startIdx; i <= startIdx + MAX_SPAN && i < LANES.length; i++) {
      candidates.push(LANES[i]);
    }
    // Shuffle and pick onCount
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (let i = 0; i < onCount && i < candidates.length; i++) {
      target[candidates[i]] = true;
    }
    this.currentProblem = { target, onCount };
  }

  update(dt: number): void {
    if (this.phase === "mode-select") {
      if (this.input.isPickDownJustPressed()) {
        this.modeCursor = (this.modeCursor + 1) % 2;
      }
      if (this.input.isPickUpJustPressed()) {
        this.modeCursor = (this.modeCursor + 1) % 2;
      }
      const justPressed = this.input.getNeckJustPressed();
      const anyPressed = (Object.keys(justPressed) as NeckKey[]).some(
        (k) => justPressed[k],
      );
      if (anyPressed) {
        this.startGame();
      }
      return;
    }

    if (this.phase === "result") {
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
      const gameId = this.mode === "normal" ? GAME_ID_NORMAL : GAME_ID_ABSURD;
      saveHighScore(gameId, this.score);
      return;
    }

    // Check problem time limit
    if (this.currentProblem) {
      this.problemTimer += dt;
      if (this.problemTimer >= PROBLEM_TIME_LIMIT) {
        // Time's up for this problem -- penalty
        this.score = Math.max(0, this.score - 1);
        this.misses++;
        this.problemTimer = 0;
        this.generateProblem();
        return;
      }

      // Check if current neck state matches the target
      const neckState = this.input.getNeckState();
      let match = true;
      for (const key of LANES) {
        if (neckState[key] !== this.currentProblem.target[key]) {
          match = false;
          break;
        }
      }

      if (match) {
        this.score++;
        this.problemTimer = 0;
        this.generateProblem();
      }
    }

  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // Background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    if (this.phase === "mode-select") {
      this.drawModeSelect(ctx, w, h);
      return;
    }

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

    const onCount = this.currentProblem?.onCount ?? 1;
    drawText(ctx, `${onCount} button${onCount > 1 ? "s" : ""}`, w - 120, 40, {
      size: 22,
      color: "#cccccc",
      align: "right",
    });

    // Target display (center)
    const buttonSize = Math.min(100, (w - 150) / 5);
    const spacing = buttonSize + 30;
    const startX = w / 2 - (spacing * 4) / 2;
    const targetY = h * 0.35;
    const playerY = h * 0.65;

    drawText(ctx, "TARGET", w / 2, targetY - buttonSize * 0.5 - 30, {
      size: 20,
      color: "#888888",
    });

    if (this.currentProblem) {
      for (let i = 0; i < LANES.length; i++) {
        const lane = LANES[i];
        const x = startX + i * spacing;
        const isOn = this.currentProblem.target[lane];

        if (isOn) {
          // ON: bright, large
          const glowSize = buttonSize * 0.65;
          const gradient = ctx.createRadialGradient(
            x,
            targetY,
            0,
            x,
            targetY,
            glowSize * 1.5,
          );
          gradient.addColorStop(0, BUTTON_COLORS[lane] + "88");
          gradient.addColorStop(1, BUTTON_COLORS[lane] + "00");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, targetY, glowSize * 1.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = BUTTON_COLORS[lane];
          ctx.beginPath();
          ctx.arc(x, targetY, glowSize, 0, Math.PI * 2);
          ctx.fill();

          drawText(ctx, NECK_LABELS[lane], x, targetY, {
            size: 32,
            color: "#000000",
          });
        } else {
          // OFF: dim
          ctx.fillStyle = BUTTON_COLORS[lane] + "22";
          ctx.beginPath();
          ctx.arc(x, targetY, buttonSize * 0.4, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = BUTTON_COLORS[lane] + "44";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, targetY, buttonSize * 0.4, 0, Math.PI * 2);
          ctx.stroke();

          drawText(ctx, NECK_LABELS[lane], x, targetY, {
            size: 20,
            color: BUTTON_COLORS[lane] + "44",
          });
        }
      }
    }

    // Player current state (bottom)
    drawText(ctx, "YOUR INPUT", w / 2, playerY - buttonSize * 0.5 - 30, {
      size: 20,
      color: "#888888",
    });

    const neckState = this.input.getNeckState();
    for (let i = 0; i < LANES.length; i++) {
      const lane = LANES[i];
      const x = startX + i * spacing;
      const isPressed = neckState[lane];
      const isCorrect =
        this.currentProblem && neckState[lane] === this.currentProblem.target[lane];

      if (isPressed) {
        // Pressed: show in color
        ctx.fillStyle = isCorrect
          ? BUTTON_COLORS[lane]
          : BUTTON_COLORS[lane] + "88";
        ctx.beginPath();
        ctx.arc(x, playerY, buttonSize * 0.55, 0, Math.PI * 2);
        ctx.fill();

        // Wrong indicator
        if (!isCorrect) {
          ctx.strokeStyle = "#ff4444";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, playerY, buttonSize * 0.55, 0, Math.PI * 2);
          ctx.stroke();
        }

        drawText(ctx, NECK_LABELS[lane], x, playerY, {
          size: 28,
          color: "#000000",
        });
      } else {
        // Not pressed
        ctx.fillStyle = BUTTON_COLORS[lane] + "22";
        ctx.beginPath();
        ctx.arc(x, playerY, buttonSize * 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isCorrect
          ? BUTTON_COLORS[lane] + "44"
          : "#ff4444" + "66";
        ctx.lineWidth = isCorrect ? 1 : 2;
        ctx.beginPath();
        ctx.arc(x, playerY, buttonSize * 0.4, 0, Math.PI * 2);
        ctx.stroke();

        drawText(ctx, NECK_LABELS[lane], x, playerY, {
          size: 20,
          color: BUTTON_COLORS[lane] + "44",
        });
      }
    }


    // Problem time limit bar
    const barWidth = spacing * 4 + buttonSize;
    const barHeight = 8;
    const barX = w / 2 - barWidth / 2;
    const barY = (targetY + playerY) / 2;
    const progress = Math.max(0, 1 - this.problemTimer / PROBLEM_TIME_LIMIT);

    ctx.fillStyle = "#333333";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 4);
    ctx.fill();

    const barColor = progress > 0.3 ? "#44aaff" : "#ff4444";
    ctx.fillStyle = barColor;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth * progress, barHeight, 4);
    ctx.fill();

    // Title
    const title = this.mode === "normal" ? "Speed Typing" : "Speed Typing (理不尽)";
    drawText(ctx, title, w / 2, h - 40, {
      size: 20,
      color: "#888888",
    });
  }

  private drawModeSelect(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    drawText(ctx, "Speed Typing", w / 2, 100, { size: 48, color: "#ffffff" });
    drawText(ctx, "モード選択", w / 2, 160, { size: 24, color: "#888888" });

    const modes = [
      { name: "ノーマル", desc: "隣接ボタンの組み合わせのみ" },
      { name: "理不尽", desc: "全ボタンの組み合わせ" },
    ];

    const startY = 260;
    const lineHeight = 80;

    for (let i = 0; i < modes.length; i++) {
      const y = startY + i * lineHeight;
      const isSelected = i === this.modeCursor;

      if (isSelected) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        ctx.beginPath();
        ctx.roundRect(w / 2 - 220, y - 28, 440, 56, 8);
        ctx.fill();

        drawText(ctx, ">", w / 2 - 200, y - 8, {
          size: 28,
          color: "#ffdd44",
          align: "left",
        });
      }

      drawText(ctx, modes[i].name, w / 2 - 160, y - 8, {
        size: 28,
        color: isSelected ? "#ffffff" : "#888888",
        align: "left",
      });

      drawText(ctx, modes[i].desc, w / 2 - 160, y + 20, {
        size: 16,
        color: isSelected ? "#aaaaaa" : "#555555",
        align: "left",
      });

      // High score
      const gameId = i === 0 ? GAME_ID_NORMAL : GAME_ID_ABSURD;
      const hs = getHighScore(gameId);
      if (hs > 0) {
        drawText(ctx, `HI: ${hs}`, w / 2 + 200, y - 8, {
          size: 18,
          color: "#ffdd44",
          align: "right",
        });
      }
    }

    drawText(ctx, "Pick Up/Down: 選択  |  ネックボタン: 決定", w / 2, h - 40, {
      size: 16,
      color: "#888888",
    });
  }

  private drawResult(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    const modeLabel = this.mode === "normal" ? "Speed Typing" : "Speed Typing (理不尽)";
    drawText(ctx, "RESULT", w / 2, 100, { size: 48, color: "#ffdd44" });
    drawText(ctx, modeLabel, w / 2, 160, { size: 24, color: "#888888" });

    drawText(ctx, `CORRECT: ${this.score}`, w / 2, 260, {
      size: 40,
      color: "#ffffff",
    });

    const gameId = this.mode === "normal" ? GAME_ID_NORMAL : GAME_ID_ABSURD;
    const highScore = getHighScore(gameId);
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
