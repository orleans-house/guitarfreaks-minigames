import type { NeckKey } from "../core/gamepad.ts";
import type { ChartNote, Judgement } from "./types.ts";

/** 判定ウィンドウ（秒） */
const PERFECT_WINDOW = 0.030;
const GREAT_WINDOW = 0.060;
const GOOD_WINDOW = 0.100;
export const MISS_WINDOW = 0.150;

/** 基礎スコア */
const SCORE_PERFECT = 1000;
const SCORE_GREAT = 700;
const SCORE_GOOD = 400;

/**
 * ノートのタイミングと入力タイミングから判定を返す。
 * MISS_WINDOWの外なら null を返す（まだ判定対象外）。
 */
export function judgeNote(noteTime: number, inputTime: number): Judgement | null {
  const diff = Math.abs(noteTime - inputTime);

  if (diff <= PERFECT_WINDOW) return "perfect";
  if (diff <= GREAT_WINDOW) return "great";
  if (diff <= GOOD_WINDOW) return "good";
  if (diff <= MISS_WINDOW) return "miss";
  return null;
}

/**
 * 指定レーンの未判定ノートから、currentTimeに最も近いものを探す。
 * MISS_WINDOW内のもののみ返す。
 * @returns ノート配列内のインデックス、見つからなければ null
 */
export function findClosestNote(
  notes: ChartNote[],
  lane: NeckKey,
  currentTime: number,
): number | null {
  let bestIndex: number | null = null;
  let bestDiff = Infinity;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];

    // 既に判定済みはスキップ
    if (note.hit) continue;

    // currentTimeより十分先のノートは到達不可能なのでbreak
    if (note.time > currentTime + MISS_WINDOW) break;

    // currentTimeより十分前のノートはスキップ
    if (note.time < currentTime - MISS_WINDOW) continue;

    // レーンが違うならスキップ
    if (note.lane !== lane) continue;

    const diff = Math.abs(note.time - currentTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/**
 * スコアを計算する。コンボボーナス付き。
 */
export function calcScore(judgement: Judgement, combo: number): number {
  let base: number;
  switch (judgement) {
    case "perfect":
      base = SCORE_PERFECT;
      break;
    case "great":
      base = SCORE_GREAT;
      break;
    case "good":
      base = SCORE_GOOD;
      break;
    case "miss":
      return 0;
  }
  return Math.floor(base * (1 + combo * 0.01));
}

/**
 * 毎フレーム呼び出して、通過した未判定ノートを自動MISSにする。
 * @param notes ノート配列
 * @param currentTime 現在時刻（秒）
 * @param startIndex 走査開始インデックス
 * @returns 更新後の走査開始インデックスとMISS数
 */
export function processAutoMiss(
  notes: ChartNote[],
  currentTime: number,
  startIndex: number,
): { nextIndex: number; missCount: number } {
  let missCount = 0;
  let nextIndex = startIndex;

  for (let i = startIndex; i < notes.length; i++) {
    const note = notes[i];

    // このノートがまだMISS_WINDOW内に入ってない場合は終了
    if (note.time > currentTime - MISS_WINDOW) break;

    if (!note.hit) {
      note.hit = true;
      note.judgement = "miss";
      missCount++;
    }

    nextIndex = i + 1;
  }

  return { nextIndex, missCount };
}
