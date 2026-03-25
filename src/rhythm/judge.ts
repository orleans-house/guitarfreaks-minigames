import type { NeckState, NeckKey } from "../core/gamepad.ts";
import type { Chord, Judgement } from "./types.ts";

/** 判定ウィンドウの外側（自動MISS境界、秒） */
export const MISS_WINDOW = 0.150;

/** タイミングウィンドウ定義 */
const TIMING_WINDOWS: { judgement: Judgement; window: number }[] = [
  { judgement: "perfect", window: 0.030 },
  { judgement: "great", window: 0.060 },
  { judgement: "good", window: 0.100 },
];

/** 全ネックキー */
const ALL_KEYS: NeckKey[] = ["r", "g", "b", "y", "p"];

/**
 * ピッキング時刻に最も近い未判定コードを探す。
 * MISS_WINDOW内のもののみ返す。
 * @param chords ソート済みChord配列
 * @param pickTime ピッキング時刻（秒）
 * @returns 最も近い未判定Chord、なければnull
 */
export function findClosestChord(chords: Chord[], pickTime: number): Chord | null {
  let closest: Chord | null = null;
  let closestDiff = Infinity;

  for (const chord of chords) {
    if (chord.hit) continue;
    const diff = Math.abs(chord.time - pickTime);
    if (diff > MISS_WINDOW) {
      // ソート済みなので、pickTimeより十分先のコードに到達したら終了
      if (chord.time > pickTime + MISS_WINDOW) break;
      continue;
    }
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = chord;
    }
  }
  return closest;
}

/**
 * ネック状態がコードの要求レーンと完全一致するか判定する。
 * 余分なボタンが押されている場合もMISS。
 * @param chord 判定対象コード
 * @param neckState 現在のネック状態
 * @returns 完全一致ならtrue
 */
export function checkNeckMatch(chord: Chord, neckState: NeckState): boolean {
  for (const key of ALL_KEYS) {
    const required = chord.lanes.includes(key);
    const pressed = neckState[key];
    if (required !== pressed) return false;
  }
  return true;
}

/**
 * コードを判定する: ネック状態の完全一致チェック + タイミング判定。
 * @param chord 判定対象コード
 * @param neckState 現在のネック状態
 * @param pickTime ピッキング時刻（秒）
 * @returns 判定結果
 */
export function judgeChord(chord: Chord, neckState: NeckState, pickTime: number): Judgement {
  // ネック状態が一致しない場合は常にMISS
  if (!checkNeckMatch(chord, neckState)) {
    return "miss";
  }

  // タイミング判定
  const diff = Math.abs(chord.time - pickTime);
  for (const tw of TIMING_WINDOWS) {
    if (diff <= tw.window) return tw.judgement;
  }
  return "miss";
}

/**
 * 通過した未判定コードを自動MISSにする。
 * @param chords ソート済みChord配列
 * @param currentTime 現在時刻（秒）
 * @returns 今回MISSになったコードの配列
 */
export function processAutoMiss(chords: Chord[], currentTime: number): Chord[] {
  const missed: Chord[] = [];
  for (const chord of chords) {
    if (chord.hit) continue;
    if (chord.time < currentTime - MISS_WINDOW) {
      chord.hit = true;
      chord.judgement = "miss";
      missed.push(chord);
    }
    // ソート済みなので、まだMISS_WINDOW内に入ってないコードに到達したら終了
    if (chord.time > currentTime) break;
  }
  return missed;
}

/**
 * スコアを計算する。コンボボーナス付き。
 * @param judgement 判定結果
 * @param combo 現在のコンボ数
 * @returns スコア
 */
export function calcScore(judgement: Judgement, combo: number): number {
  const base: Record<Judgement, number> = {
    perfect: 1000,
    great: 700,
    good: 400,
    miss: 0,
  };
  const comboBonus = Math.min(combo, 50) * 10;
  return base[judgement] + (judgement !== "miss" ? comboBonus : 0);
}
