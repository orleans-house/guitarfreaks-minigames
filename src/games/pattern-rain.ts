import type { Scene } from "../core/scene.ts";
import type { GamepadInput, NeckKey } from "../core/gamepad.ts";
import { BUTTON_COLORS, NECK_LABELS, drawText } from "../core/canvas.ts";
import { getHighScore, saveHighScore } from "../core/score.ts";

const LANES: NeckKey[] = ["r", "g", "b", "y", "p"];
const GAME_ID = "pattern-rain";

// Timing windows (ms)
const GREAT_WINDOW = 100;
const GOOD_WINDOW = 200;

// Scoring
const GREAT_SCORE = 100;
const GOOD_SCORE = 50;

// Life
const MAX_LIVES = 20;

// Speed and density
const INITIAL_SPEED = 0.2; // pixels per ms
const MAX_SPEED = 0.5;
const INITIAL_SPAWN_INTERVAL = 1200; // ms
const MIN_SPAWN_INTERVAL = 400;
const SPEED_RAMP_TIME = 120_000; // time to reach max difficulty (ms)

// Travel time: how long a note takes from top to judgment line
const TRAVEL_DISTANCE_RATIO = 0.8; // judgment line at 80% of height

type Phase = "playing" | "result";

interface Note {
  lane: NeckKey;
  targetTime: number; // elapsed time when note should be hit
  judged: boolean;
  judgment: "great" | "good" | "miss" | null;
  judgeTime: number;
}

interface JudgmentPopup {
  text: string;
  color: string;
  time: number;
  x: number;
}

export class PatternRainGame implements Scene {
  private phase: Phase = "playing";
  private elapsed = 0;
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private lives = MAX_LIVES;
  private notes: Note[] = [];
  private spawnTimer = 0;
  private popups: JudgmentPopup[] = [];
  private greatCount = 0;
  private goodCount = 0;
  private missCount = 0;

  constructor(
    private input: GamepadInput,
    private onReturnToMenu: () => void,
  ) {}

  enter(): void {
    this.phase = "playing";
    this.elapsed = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lives = MAX_LIVES;
    this.notes = [];
    this.spawnTimer = 0;
    this.popups = [];
    this.greatCount = 0;
    this.goodCount = 0;
    this.missCount = 0;
  }

  private getSpeed(): number {
    const progress = Math.min(this.elapsed / SPEED_RAMP_TIME, 1);
    return INITIAL_SPEED + (MAX_SPEED - INITIAL_SPEED) * progress;
  }

  private getSpawnInterval(): number {
    const progress = Math.min(this.elapsed / SPEED_RAMP_TIME, 1);
    return (
      INITIAL_SPAWN_INTERVAL -
      (INITIAL_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL) * progress
    );
  }

  private spawnNotes(): void {
    // Determine how many notes (1 or 2 simultaneous)
    const noteCount = Math.random() < 0.3 ? 2 : 1;

    const available = [...LANES];
    const speed = this.getSpeed();
    // Calculate how far in the future the note should arrive at the judgment line
    // travelTime = travelDistance / speed
    // We'll compute travelDistance based on a reference height of 600px
    // Actual positioning is done in draw() relative to canvas size
    const travelTime = 600 * TRAVEL_DISTANCE_RATIO / speed;
    const targetTime = this.elapsed + travelTime;

    for (let i = 0; i < noteCount && available.length > 0; i++) {
      const idx = Math.floor(Math.random() * available.length);
      const lane = available[idx];
      available.splice(idx, 1);

      this.notes.push({
        lane,
        targetTime,
        judged: false,
        judgment: null,
        judgeTime: 0,
      });
    }
  }

  private judgeNote(
    note: Note,
    laneX: number,
  ): void {
    const timeDiff = Math.abs(this.elapsed - note.targetTime);
    note.judged = true;
    note.judgeTime = this.elapsed;

    if (timeDiff <= GREAT_WINDOW) {
      note.judgment = "great";
      this.score += GREAT_SCORE;
      this.combo++;
      this.greatCount++;
      this.popups.push({
        text: "Great!",
        color: "#ffdd44",
        time: this.elapsed,
        x: laneX,
      });
    } else if (timeDiff <= GOOD_WINDOW) {
      note.judgment = "good";
      this.score += GOOD_SCORE;
      this.combo++;
      this.goodCount++;
      this.popups.push({
        text: "Good",
        color: "#44ff44",
        time: this.elapsed,
        x: laneX,
      });
    }
    // Notes outside GOOD_WINDOW won't reach here (handled as miss in update)

    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }
  }

  update(dt: number): void {
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

    // Spawn notes
    this.spawnTimer += dt;
    const spawnInterval = this.getSpawnInterval();
    if (this.spawnTimer >= spawnInterval) {
      this.spawnTimer -= spawnInterval;
      this.spawnNotes();
    }

    // Calculate lane positions for popup x coordinates
    // Use a reference width; actual draw will recalculate
    const refW = 800;
    const laneWidth = Math.min(80, (refW - 100) / 5);
    const laneSpacing = laneWidth + 20;
    const startX = refW / 2 - (laneSpacing * 4) / 2;

    // Check button presses against notes
    const justPressed = this.input.getNeckJustPressed();
    for (const key of LANES) {
      if (justPressed[key]) {
        // Find the closest unjudged note in this lane within GOOD_WINDOW
        let bestNote: Note | null = null;
        let bestDiff = Infinity;
        for (const note of this.notes) {
          if (note.judged || note.lane !== key) continue;
          const diff = Math.abs(this.elapsed - note.targetTime);
          if (diff <= GOOD_WINDOW && diff < bestDiff) {
            bestNote = note;
            bestDiff = diff;
          }
        }

        if (bestNote) {
          const laneIdx = LANES.indexOf(key);
          const laneX = startX + laneIdx * laneSpacing;
          this.judgeNote(bestNote, laneX);
        }
      }
    }

    // Check for missed notes (past the GOOD_WINDOW without being judged)
    for (const note of this.notes) {
      if (!note.judged && this.elapsed - note.targetTime > GOOD_WINDOW) {
        note.judged = true;
        note.judgment = "miss";
        note.judgeTime = this.elapsed;
        this.lives--;
        this.combo = 0;
        this.missCount++;

        const laneIdx = LANES.indexOf(note.lane);
        const laneX = startX + laneIdx * laneSpacing;
        this.popups.push({
          text: "Miss",
          color: "#ff4444",
          time: this.elapsed,
          x: laneX,
        });

        if (this.lives <= 0) {
          this.phase = "result";
          saveHighScore(GAME_ID, this.score);
          return;
        }
      }
    }

    // Clean up old notes (well past the judgment line)
    this.notes = this.notes.filter(
      (n) => !n.judged || this.elapsed - n.judgeTime < 500,
    );

    // Clean up old popups
    this.popups = this.popups.filter((p) => this.elapsed - p.time < 800);
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
    const judgmentY = h * TRAVEL_DISTANCE_RATIO;
    const speed = this.getSpeed();

    // Lane dimensions
    const laneWidth = Math.min(80, (w - 100) / 5);
    const laneSpacing = laneWidth + 20;
    const startX = w / 2 - (laneSpacing * 4) / 2;

    // Draw lane lines
    for (let i = 0; i < LANES.length; i++) {
      const x = startX + i * laneSpacing;
      ctx.strokeStyle = BUTTON_COLORS[LANES[i]] + "22";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Draw judgment line
    ctx.strokeStyle = "#ffffff44";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX - laneWidth / 2, judgmentY);
    ctx.lineTo(startX + (LANES.length - 1) * laneSpacing + laneWidth / 2, judgmentY);
    ctx.stroke();

    // Draw lane buttons at judgment line
    for (let i = 0; i < LANES.length; i++) {
      const lane = LANES[i];
      const x = startX + i * laneSpacing;
      const neckState = this.input.getNeckState();
      const isPressed = neckState[lane];

      if (isPressed) {
        ctx.fillStyle = BUTTON_COLORS[lane] + "88";
        ctx.beginPath();
        ctx.arc(x, judgmentY, laneWidth * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = BUTTON_COLORS[lane] + "66";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, judgmentY, laneWidth * 0.4, 0, Math.PI * 2);
      ctx.stroke();

      drawText(ctx, NECK_LABELS[lane], x, judgmentY + laneWidth * 0.4 + 18, {
        size: 16,
        color: BUTTON_COLORS[lane] + "88",
      });
    }

    // Draw notes
    for (const note of this.notes) {
      if (note.judged && note.judgment !== null && note.judgment !== "miss") {
        // Judged notes fade out
        const age = this.elapsed - note.judgeTime;
        const alpha = Math.max(0, 1 - age / 300);
        if (alpha <= 0) continue;
        ctx.globalAlpha = alpha;
      }

      const laneIdx = LANES.indexOf(note.lane);
      const x = startX + laneIdx * laneSpacing;

      // Position: note moves from top to judgment line
      // At targetTime, note should be at judgmentY
      const timeDiff = note.targetTime - this.elapsed;
      const pixelOffset = timeDiff * speed;
      const noteY = judgmentY - pixelOffset;

      // Only draw if on screen
      if (noteY > -30 && noteY < h + 30) {
        const noteSize = laneWidth * 0.35;

        // Note body
        ctx.fillStyle = BUTTON_COLORS[note.lane];
        ctx.beginPath();
        ctx.roundRect(x - noteSize, noteY - noteSize * 0.4, noteSize * 2, noteSize * 0.8, 4);
        ctx.fill();

        // Note label
        drawText(ctx, NECK_LABELS[note.lane], x, noteY, {
          size: 16,
          color: "#000000",
        });
      }

      ctx.globalAlpha = 1;
    }

    // Draw judgment popups
    for (const popup of this.popups) {
      const age = this.elapsed - popup.time;
      const alpha = Math.max(0, 1 - age / 800);
      const yOffset = age * 0.05;

      ctx.globalAlpha = alpha;
      drawText(ctx, popup.text, popup.x, judgmentY - 50 - yOffset, {
        size: 22,
        color: popup.color,
      });
      ctx.globalAlpha = 1;
    }

    // HUD
    drawText(ctx, `SCORE: ${this.score}`, w / 2, 30, { size: 28 });

    // Combo
    if (this.combo > 1) {
      drawText(ctx, `${this.combo} COMBO`, w / 2, 65, {
        size: 22,
        color: this.combo >= 10 ? "#ffdd44" : "#cccccc",
      });
    }

    // Lives bar
    const barWidth = 200;
    const barHeight = 10;
    const barX = 20;
    const barY = 25;
    const lifeRatio = this.lives / MAX_LIVES;

    drawText(ctx, "LIFE", barX, barY - 4, {
      size: 14,
      color: "#888888",
      align: "left",
    });

    ctx.fillStyle = "#333333";
    ctx.beginPath();
    ctx.roundRect(barX, barY + 8, barWidth, barHeight, 4);
    ctx.fill();

    const lifeColor =
      lifeRatio > 0.5 ? "#44ff44" : lifeRatio > 0.25 ? "#ffdd44" : "#ff4444";
    ctx.fillStyle = lifeColor;
    ctx.beginPath();
    ctx.roundRect(barX, barY + 8, barWidth * lifeRatio, barHeight, 4);
    ctx.fill();

    // Title
    drawText(ctx, "Pattern Rain", w / 2, h - 20, {
      size: 18,
      color: "#888888",
    });
  }

  private drawResult(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    drawText(ctx, "GAME OVER", w / 2, 80, { size: 48, color: "#ff4444" });
    drawText(ctx, "Pattern Rain", w / 2, 130, { size: 24, color: "#888888" });

    drawText(ctx, `SCORE: ${this.score}`, w / 2, 220, {
      size: 40,
      color: "#ffffff",
    });
    drawText(ctx, `MAX COMBO: ${this.maxCombo}`, w / 2, 275, {
      size: 28,
      color: "#cccccc",
    });

    drawText(ctx, `Great: ${this.greatCount}`, w / 2, 330, {
      size: 22,
      color: "#ffdd44",
    });
    drawText(ctx, `Good: ${this.goodCount}`, w / 2, 365, {
      size: 22,
      color: "#44ff44",
    });
    drawText(ctx, `Miss: ${this.missCount}`, w / 2, 400, {
      size: 22,
      color: "#ff4444",
    });

    const highScore = getHighScore(GAME_ID);
    drawText(ctx, `HIGH SCORE: ${highScore}`, w / 2, 460, {
      size: 28,
      color: "#ffdd44",
    });

    if (this.score >= highScore && this.score > 0) {
      drawText(ctx, "NEW RECORD!", w / 2, 510, {
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
