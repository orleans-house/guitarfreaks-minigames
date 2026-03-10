import type { NeckKey, NeckState } from "../core/gamepad.ts";
import { BUTTON_COLORS, NECK_LABELS, drawText } from "../core/canvas.ts";
import type { ChartNote, Judgement } from "./types.ts";

const LANES: NeckKey[] = ["r", "g", "b", "y", "p"];

/** 判定ラインの画面下からの割合 */
const JUDGE_LINE_RATIO = 0.15;

/** 表示範囲: 判定ラインの上何秒分のノートを表示するか */
const LOOK_AHEAD_SEC = 2.0;

/** 判定ライン通過後に表示する秒数 */
const LOOK_BEHIND_SEC = 0.3;

/** 判定テキストの表示時間（秒） */
const JUDGEMENT_DISPLAY_SEC = 0.5;

/** 判定テキストの色 */
const JUDGEMENT_COLORS: Record<Judgement, string> = {
  perfect: "#ffd700",
  great: "#44ff44",
  good: "#4488ff",
  miss: "#ff4444",
};

/** 判定テキスト（大文字表示） */
const JUDGEMENT_TEXT: Record<Judgement, string> = {
  perfect: "PERFECT",
  great: "GREAT",
  good: "GOOD",
  miss: "MISS",
};

export interface JudgementDisplay {
  type: Judgement;
  time: number; // performance.now() 基準のタイムスタンプ
}

interface HighwayLayout {
  laneWidth: number;
  spacing: number;
  startX: number;
  judgeLineY: number;
  scrollSpeed: number;
  noteRadius: number;
}

function calcLayout(w: number, h: number): HighwayLayout {
  const laneWidth = Math.min(80, (w - 200) / 5);
  const spacing = laneWidth;
  const startX = w / 2 - (spacing * 4) / 2;
  const judgeLineY = h * (1 - JUDGE_LINE_RATIO);
  const scrollSpeed = judgeLineY / LOOK_AHEAD_SEC;
  const noteRadius = laneWidth * 0.4;

  return { laneWidth, spacing, startX, judgeLineY, scrollSpeed, noteRadius };
}

/**
 * レーン背景と判定ラインを描画する。
 */
export function drawHighway(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  neckState: NeckState,
): void {
  const layout = calcLayout(w, h);

  // レーン背景（真っ黒）
  const totalWidth = layout.laneWidth * LANES.length;
  const bgX = layout.startX - layout.laneWidth / 2;
  ctx.fillStyle = "#000000";
  ctx.fillRect(bgX, 0, totalWidth, h);

  // 押下時のレーンハイライト
  for (let i = 0; i < LANES.length; i++) {
    const lane = LANES[i];
    const x = layout.startX + i * layout.spacing;
    const isPressed = neckState[lane];

    if (isPressed) {
      ctx.fillStyle = BUTTON_COLORS[lane] + "22";
      ctx.fillRect(x - layout.laneWidth / 2, 0, layout.laneWidth, h);
    }
  }

  // 判定ライン（白い横線）
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(
    layout.startX - layout.laneWidth / 2 - 10,
    layout.judgeLineY,
  );
  ctx.lineTo(
    layout.startX + (LANES.length - 1) * layout.spacing + layout.laneWidth / 2 + 10,
    layout.judgeLineY,
  );
  ctx.stroke();

  // レーンラベル（判定ラインの下）+ 押下時のハイライト
  for (let i = 0; i < LANES.length; i++) {
    const lane = LANES[i];
    const x = layout.startX + i * layout.spacing;
    const isPressed = neckState[lane];

    if (isPressed) {
      // 押下時のハイライトエフェクト
      ctx.fillStyle = BUTTON_COLORS[lane] + "44";
      ctx.beginPath();
      ctx.arc(x, layout.judgeLineY, layout.noteRadius * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    drawText(ctx, NECK_LABELS[lane], x, layout.judgeLineY + 35, {
      size: 20,
      color: isPressed ? BUTTON_COLORS[lane] : BUTTON_COLORS[lane] + "88",
    });
  }
}

/**
 * ノートを描画する。
 */
export function drawNotes(
  ctx: CanvasRenderingContext2D,
  notes: ChartNote[],
  currentTime: number,
  w: number,
  h: number,
): void {
  const layout = calcLayout(w, h);

  const laneIndex: Record<NeckKey, number> = { r: 0, g: 1, b: 2, y: 3, p: 4 };

  for (const note of notes) {
    // 表示範囲外はスキップ
    if (note.time < currentTime - LOOK_BEHIND_SEC) continue;
    if (note.time > currentTime + LOOK_AHEAD_SEC) break;

    // 判定済みノートは描画しない
    if (note.hit) continue;

    const i = laneIndex[note.lane];
    const x = layout.startX + i * layout.spacing;
    // ノートのY座標: 判定ライン - (note.time - currentTime) * scrollSpeed
    const y = layout.judgeLineY - (note.time - currentTime) * layout.scrollSpeed;

    // 画面外チェック
    if (y < -layout.noteRadius || y > h + layout.noteRadius) continue;

    // ノート描画（細い横棒）
    const barWidth = layout.laneWidth * 0.85;
    const barHeight = 6;
    ctx.fillStyle = BUTTON_COLORS[note.lane];
    ctx.beginPath();
    ctx.roundRect(x - barWidth / 2, y - barHeight / 2, barWidth, barHeight, 3);
    ctx.fill();
  }
}

/**
 * スコア・コンボ・判定カウントを表示する。
 */
export function drawHUD(
  ctx: CanvasRenderingContext2D,
  score: number,
  combo: number,
  maxCombo: number,
  judgementCounts: Record<Judgement, number>,
  currentTime: number,
  duration: number,
  w: number,
): void {
  // 左上: スコア
  drawText(ctx, `SCORE: ${score}`, 20, 40, {
    size: 28,
    color: "#ffffff",
    align: "left",
  });

  // 右上: コンボ（2以上で表示）
  if (combo >= 2) {
    drawText(ctx, `${combo} COMBO`, w - 20, 40, {
      size: 32,
      color: "#ffdd44",
      align: "right",
    });
  }

  // 左上2行目: 判定カウント（小さく）
  const countText =
    `P:${judgementCounts.perfect} G:${judgementCounts.great} ` +
    `OK:${judgementCounts.good} M:${judgementCounts.miss}`;
  drawText(ctx, countText, 20, 72, {
    size: 16,
    color: "#888888",
    align: "left",
  });

  // 右上2行目: Max Combo
  drawText(ctx, `MAX: ${maxCombo}`, w - 20, 72, {
    size: 16,
    color: "#888888",
    align: "right",
  });

  // プログレスバー（画面上部）
  const barWidth = Math.min(400, w - 100);
  const barX = (w - barWidth) / 2;
  const barY = 16;
  const barHeight = 6;
  const progress = Math.min(1, currentTime / duration);

  ctx.fillStyle = "#333333";
  ctx.beginPath();
  ctx.roundRect(barX, barY, barWidth, barHeight, 3);
  ctx.fill();

  ctx.fillStyle = "#44ff44";
  ctx.beginPath();
  ctx.roundRect(barX, barY, barWidth * progress, barHeight, 3);
  ctx.fill();
}

/**
 * 直近の判定結果をフェードアウト表示する。
 */
export function drawJudgementFeedback(
  ctx: CanvasRenderingContext2D,
  display: JudgementDisplay | null,
  nowMs: number,
  w: number,
  h: number,
): void {
  if (!display) return;

  const elapsed = (nowMs - display.time) / 1000;
  if (elapsed > JUDGEMENT_DISPLAY_SEC) return;

  const alpha = 1 - elapsed / JUDGEMENT_DISPLAY_SEC;
  const yOffset = elapsed * 40; // 上にフロート

  const layout = calcLayout(w, h);

  ctx.globalAlpha = alpha;
  drawText(ctx, JUDGEMENT_TEXT[display.type], w / 2, layout.judgeLineY - 60 - yOffset, {
    size: 36,
    color: JUDGEMENT_COLORS[display.type],
  });
  ctx.globalAlpha = 1;
}
