import type { Scene } from "../core/scene.ts";
import type { GamepadInput } from "../core/gamepad.ts";
import { drawText } from "../core/canvas.ts";
import { getHighScore, saveHighScore } from "../core/score.ts";
import type { Chart, Chord, Judgement, RhythmPhase } from "./types.ts";
import { loadMidiFile } from "./midi-loader.ts";
import { MidiSynth } from "./synth.ts";
import { judgeChord, findClosestChord, calcScore, processAutoMiss } from "./judge.ts";
import {
  drawHighway,
  drawBarLines,
  drawNotes,
  drawHUD,
  drawJudgementFeedback,
  type JudgementDisplay,
} from "./highway-renderer.ts";

const GAME_ID = "rhythm-game";

/** コードグルーピングの閾値（秒）: midi-loaderと同じ値 */
const CHORD_THRESHOLD = 0.01;

/** ゲーム開始前のカウントダウン（秒） */
const COUNTDOWN_SEC = 2;

export class RhythmGame implements Scene {
  private phase: RhythmPhase = "file-select";

  // file-select
  private fileInput: HTMLInputElement | null = null;
  private canvasClickHandler: ((e: MouseEvent) => void) | null = null;
  private dragOverHandler: ((e: DragEvent) => void) | null = null;
  private dropHandler: ((e: DragEvent) => void) | null = null;
  private errorMessage: string | null = null;

  // audio
  private synth = new MidiSynth();

  // playing
  private chart: Chart | null = null;
  private startTimestamp = 0;
  private currentTime = 0;
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private judgementCounts: Record<Judgement, number> = {
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
  };
  private lastJudgement: JudgementDisplay | null = null;
  private isCountdown = false;
  private countdownStart = 0;

  constructor(
    private input: GamepadInput,
    private onReturnToMenu: () => void,
  ) {}

  enter(): void {
    this.phase = "file-select";
    this.errorMessage = null;
    this.setupFileInput();
  }

  private setupFileInput(): void {
    // 非表示のfile input要素を作成
    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = ".mid,.midi";
    this.fileInput.style.display = "none";
    document.body.appendChild(this.fileInput);

    this.fileInput.addEventListener("change", () => {
      const file = this.fileInput?.files?.[0];
      if (file) {
        this.handleFile(file);
      }
    });

    // Canvas上のクリックでファイルピッカーを開く
    const canvas = document.querySelector("canvas");
    if (canvas) {
      this.canvasClickHandler = () => {
        if (this.phase === "file-select") {
          this.fileInput?.click();
        }
      };
      canvas.addEventListener("click", this.canvasClickHandler);

      // ドラッグ&ドロップ対応
      this.dragOverHandler = (e: DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = "copy";
        }
      };
      this.dropHandler = (e: DragEvent) => {
        e.preventDefault();
        if (this.phase !== "file-select") return;
        const file = e.dataTransfer?.files[0];
        if (file) {
          this.handleFile(file);
        }
      };
      canvas.addEventListener("dragover", this.dragOverHandler);
      canvas.addEventListener("drop", this.dropHandler);
    }
  }

  private handleFile(file: File): void {
    this.errorMessage = null;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arrayBuffer = reader.result as ArrayBuffer;
        const loadedSong = loadMidiFile(arrayBuffer, file.name);
        this.chart = loadedSong.chart;
        this.synth.loadSong(loadedSong.midi, loadedSong.chartTrackIndices);
        this.startPlaying();
      } catch (e: unknown) {
        if (e instanceof Error) {
          this.errorMessage = e.message;
        } else {
          this.errorMessage = "MIDIファイルの読み込みに失敗しました。";
        }
      }
    };
    reader.onerror = () => {
      this.errorMessage = "ファイルの読み込みに失敗しました。";
    };
    reader.readAsArrayBuffer(file);
  }

  private startPlaying(): void {
    // カウントダウンを開始
    this.isCountdown = true;
    this.countdownStart = performance.now();
    this.phase = "playing";
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.judgementCounts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.lastJudgement = null;
    this.currentTime = -COUNTDOWN_SEC;
    this.startTimestamp = 0; // set after countdown

    // ノートとコードの状態をリセット
    if (this.chart) {
      for (const note of this.chart.notes) {
        note.hit = false;
        note.judgement = null;
      }
      for (const chord of this.chart.chords) {
        chord.hit = false;
        chord.judgement = null;
      }
    }

    // DOM要素のクリーンアップ（file-select用）
    this.cleanupFileInput();
  }

  private cleanupFileInput(): void {
    const canvas = document.querySelector("canvas");
    if (canvas) {
      if (this.canvasClickHandler) {
        canvas.removeEventListener("click", this.canvasClickHandler);
        this.canvasClickHandler = null;
      }
      if (this.dragOverHandler) {
        canvas.removeEventListener("dragover", this.dragOverHandler);
        this.dragOverHandler = null;
      }
      if (this.dropHandler) {
        canvas.removeEventListener("drop", this.dropHandler);
        this.dropHandler = null;
      }
    }
    if (this.fileInput) {
      this.fileInput.remove();
      this.fileInput = null;
    }
  }

  private transitionToResult(): void {
    this.phase = "result";
    this.synth.stop();
    saveHighScore(GAME_ID, this.score);
  }

  update(_dt: number): void {
    // SELECT to return to menu at any phase
    if (this.input.isSelectJustPressed()) {
      this.onReturnToMenu();
      return;
    }

    if (this.phase === "file-select" || this.phase === "result") {
      return;
    }

    // playing phase
    if (!this.chart) return;

    const now = performance.now();

    // カウントダウン処理
    if (this.isCountdown) {
      const countdownElapsed = (now - this.countdownStart) / 1000;
      this.currentTime = -COUNTDOWN_SEC + countdownElapsed;

      if (countdownElapsed >= COUNTDOWN_SEC) {
        this.isCountdown = false;
        this.startTimestamp = now;
        this.currentTime = 0;
        this.synth.play(this.startTimestamp);
      }
      return;
    }

    // 通常プレイ: performance.now()基準の絶対時刻
    this.currentTime = (now - this.startTimestamp) / 1000;

    // 自動MISS判定（コード単位）
    const missedChords = processAutoMiss(this.chart.chords, this.currentTime);
    if (missedChords.length > 0) {
      this.judgementCounts.miss += missedChords.length;
      this.combo = 0;
      this.lastJudgement = { type: "miss", time: now };
      // 対応するChartNoteも同期
      for (const chord of missedChords) {
        this.syncChartNotes(chord);
      }
    }

    // ピッキング入力チェック（Up or Down）
    if (this.input.isPickUpJustPressed() || this.input.isPickDownJustPressed()) {
      const neckState = this.input.getNeckState();
      const chord = findClosestChord(this.chart.chords, this.currentTime);

      if (chord !== null) {
        const judgement = judgeChord(chord, neckState, this.currentTime);

        // コードを判定済みにする
        chord.hit = true;
        chord.judgement = judgement;
        this.judgementCounts[judgement]++;

        // 対応するChartNoteを同期
        this.syncChartNotes(chord);

        if (judgement === "miss") {
          this.combo = 0;
        } else {
          // 成功時: 譜面トラックのノートを即時再生
          this.synth.playChordNotes(chord.time);
          const points = calcScore(judgement, this.combo);
          this.score += points;
          this.combo++;
          if (this.combo > this.maxCombo) {
            this.maxCombo = this.combo;
          }
        }

        this.lastJudgement = { type: judgement, time: now };
      }
      // ピックしたが近くにコードがない場合は無視（ペナルティなし）
    }

    // 全ノート判定完了 or 譜面終了
    if (this.currentTime > this.chart.duration) {
      this.transitionToResult();
    }
  }

  /**
   * コードが判定された際に、対応するChartNoteのhitとjudgementを同期する。
   * これによりhighway-rendererがノートを非表示にする。
   */
  private syncChartNotes(chord: Chord): void {
    if (!this.chart) return;
    for (const note of this.chart.notes) {
      if (note.hit) continue;
      if (Math.abs(note.time - chord.time) < CHORD_THRESHOLD) {
        if (chord.lanes.includes(note.lane)) {
          note.hit = true;
          note.judgement = chord.judgement;
        }
      }
      // ソート済みなので、コード時刻を十分超えたら終了
      if (note.time > chord.time + CHORD_THRESHOLD) break;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // 背景
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    switch (this.phase) {
      case "file-select":
        this.drawFileSelect(ctx, w, h);
        break;
      case "playing":
        this.drawPlaying(ctx, w, h);
        break;
      case "result":
        this.drawResult(ctx, w, h);
        break;
    }
  }

  private drawFileSelect(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    drawText(ctx, "Rhythm Game", w / 2, 100, { size: 48, color: "#ffffff" });

    drawText(ctx, "MIDIファイルをドロップまたはクリックして選択", w / 2, h * 0.4, {
      size: 24,
      color: "#cccccc",
    });

    // ファイル選択エリアの枠
    const boxW = 500;
    const boxH = 120;
    const boxX = w / 2 - boxW / 2;
    const boxY = h * 0.4 + 40;

    ctx.strokeStyle = "#555555";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 12);
    ctx.stroke();
    ctx.setLineDash([]);

    drawText(ctx, "(.mid / .midi)", w / 2, boxY + boxH / 2, {
      size: 20,
      color: "#888888",
    });

    // 対応フォーマットの説明
    drawText(
      ctx,
      "Clone Hero互換: ノート番号 60=R, 61=G, 62=B, 63=Y, 64=P",
      w / 2,
      boxY + boxH + 40,
      { size: 16, color: "#666666" },
    );

    // エラーメッセージ
    if (this.errorMessage) {
      drawText(ctx, this.errorMessage, w / 2, boxY + boxH + 80, {
        size: 18,
        color: "#ff4444",
      });
    }

    drawText(ctx, "SELECT: メニューに戻る", w / 2, h - 40, {
      size: 16,
      color: "#888888",
    });
  }

  private drawPlaying(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    if (!this.chart) return;

    const neckState = this.input.getNeckState();

    // カウントダウン表示
    if (this.isCountdown) {
      drawHighway(ctx, w, h, neckState);

      const remaining = Math.ceil(-this.currentTime);
      if (remaining > 0) {
        drawText(ctx, `${remaining}`, w / 2, h * 0.4, {
          size: 80,
          color: "#ffdd44",
        });
      } else {
        drawText(ctx, "GO!", w / 2, h * 0.4, {
          size: 80,
          color: "#44ff44",
        });
      }

      drawText(ctx, this.chart.title, w / 2, h * 0.25, {
        size: 28,
        color: "#cccccc",
      });
      drawText(ctx, `BPM: ${this.chart.bpm}  Notes: ${this.chart.totalNotes}`, w / 2, h * 0.30, {
        size: 18,
        color: "#888888",
      });
      return;
    }

    // ハイウェイ描画
    drawHighway(ctx, w, h, neckState);
    drawBarLines(ctx, this.currentTime, this.chart.bpm, this.chart.duration, w, h);
    drawNotes(ctx, this.chart.notes, this.currentTime, w, h);
    drawHUD(
      ctx,
      this.score,
      this.combo,
      this.maxCombo,
      this.judgementCounts,
      this.currentTime,
      this.chart.duration,
      w,
    );
    drawJudgementFeedback(ctx, this.lastJudgement, performance.now(), w, h);

    // ガイドテキスト
    drawText(ctx, "SELECT: 中断", w / 2, h - 20, {
      size: 14,
      color: "#555555",
    });
  }

  private drawResult(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    if (!this.chart) return;

    drawText(ctx, "RESULT", w / 2, 80, { size: 48, color: "#ffdd44" });
    drawText(ctx, this.chart.title, w / 2, 130, { size: 24, color: "#888888" });

    // スコア
    drawText(ctx, `SCORE: ${this.score}`, w / 2, 210, {
      size: 40,
      color: "#ffffff",
    });

    // 最大コンボ
    drawText(ctx, `MAX COMBO: ${this.maxCombo}`, w / 2, 270, {
      size: 28,
      color: "#cccccc",
    });

    // 判定内訳
    const startY = 330;
    const lineHeight = 36;

    const judgements: { key: Judgement; label: string; color: string }[] = [
      { key: "perfect", label: "PERFECT", color: "#ffd700" },
      { key: "great", label: "GREAT", color: "#44ff44" },
      { key: "good", label: "GOOD", color: "#4488ff" },
      { key: "miss", label: "MISS", color: "#ff4444" },
    ];

    for (let i = 0; i < judgements.length; i++) {
      const j = judgements[i];
      const count = this.judgementCounts[j.key];
      const pct = this.chart.totalNotes > 0
        ? ((count / this.chart.totalNotes) * 100).toFixed(1)
        : "0.0";
      const y = startY + i * lineHeight;

      drawText(ctx, `${j.label}: ${count}`, w / 2 - 40, y, {
        size: 22,
        color: j.color,
        align: "right",
      });
      drawText(ctx, `(${pct}%)`, w / 2 + 10, y, {
        size: 18,
        color: "#888888",
        align: "left",
      });
    }

    // ハイスコア
    const highScore = getHighScore(GAME_ID);
    const hsY = startY + judgements.length * lineHeight + 30;
    drawText(ctx, `HIGH SCORE: ${highScore}`, w / 2, hsY, {
      size: 28,
      color: "#ffdd44",
    });

    if (this.score >= highScore && this.score > 0) {
      drawText(ctx, "NEW RECORD!", w / 2, hsY + 50, {
        size: 32,
        color: "#ff4444",
      });
    }

    drawText(ctx, "SELECT: メニューに戻る", w / 2, h - 60, {
      size: 20,
      color: "#888888",
    });
  }

  exit(): void {
    this.synth.stop();
    this.cleanupFileInput();
  }
}
