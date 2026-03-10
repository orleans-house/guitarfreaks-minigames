import { Midi } from "@tonejs/midi";
import type { Track } from "@tonejs/midi";
import type { Note } from "@tonejs/midi/dist/Note";
import type { Chart, ChartNote, Chord, LoadedSong } from "./types.ts";
import type { NeckKey } from "../core/gamepad.ts";

/** Clone Hero互換 MIDIノート番号 → NeckKey マッピング */
const NOTE_MAP: Record<number, NeckKey> = {
  60: "r",
  61: "g",
  62: "b",
  63: "y",
  64: "p",
};

/** 5レーンのキー配列 */
const LANES: NeckKey[] = ["r", "g", "b", "y", "p"];

/** コードグルーピングの閾値（秒）: この時間差以内のノートは同一コード */
const CHORD_THRESHOLD = 0.01;

/** レーンのソート順 */
const LANE_ORDER: Record<NeckKey, number> = { r: 0, g: 1, b: 2, y: 3, p: 4 };

/**
 * ソート済みChartNote配列から同時刻ノートをグルーピングしてChord配列を生成する。
 * @param notes timeでソート済みのChartNote配列
 * @returns Chord配列
 */
function groupNotesIntoChords(notes: ChartNote[]): Chord[] {
  const chords: Chord[] = [];
  let i = 0;
  while (i < notes.length) {
    const time = notes[i].time;
    const lanes: NeckKey[] = [notes[i].lane];
    let j = i + 1;
    while (j < notes.length && notes[j].time - time < CHORD_THRESHOLD) {
      if (!lanes.includes(notes[j].lane)) {
        lanes.push(notes[j].lane);
      }
      j++;
    }
    // レーン順でソート
    lanes.sort((a, b) => LANE_ORDER[a] - LANE_ORDER[b]);
    chords.push({ time, lanes, hit: false, judgement: null });
    i = j;
  }
  return chords;
}

/** トラックスコアリング用の内部型 */
interface ScoredTrack {
  track: Track;
  score: number;
  polyphonyRatio: number;
}

/**
 * トラックのポリフォニー率を計算する。
 */
function calcPolyphonyRatio(track: Track): number {
  const noteCount = track.notes.length;
  if (noteCount === 0) return 0;
  let overlappingCount = 0;
  for (let i = 0; i < noteCount; i++) {
    const n = track.notes[i];
    const nEnd = n.time + n.duration;
    for (let j = 0; j < noteCount; j++) {
      if (i === j) continue;
      const m = track.notes[j];
      if (m.time < nEnd && n.time < m.time + m.duration) {
        overlappingCount++;
        break;
      }
    }
  }
  return overlappingCount / noteCount;
}

/**
 * 譜面生成に使用するトラックを最大3つ選択する。
 * ドラムチャンネル(ch9)と空トラックを除外し、スコアリングで上位を選ぶ。
 * メロディ（トップスコア）に加え、異なる特性（高ポリフォニー）のトラックを優先的に追加。
 */
function selectTracks(midi: Midi): Track[] {
  const scored: ScoredTrack[] = [];

  for (const track of midi.tracks) {
    if (track.channel === 9) continue;
    if (track.notes.length === 0) continue;

    const noteCount = track.notes.length;
    const polyphonyRatio = calcPolyphonyRatio(track);

    const sortedMidi = track.notes.map((n) => n.midi).sort((a, b) => a - b);
    const medianPitch = sortedMidi[Math.floor(sortedMidi.length / 2)];
    const midRangeBonus = medianPitch >= 48 && medianPitch <= 84 ? 1.0 : 0.7;

    const score = noteCount * (1 - polyphonyRatio * 0.5) * midRangeBonus;
    scored.push({ track, score, polyphonyRatio });
  }

  if (scored.length === 0) {
    throw new Error(
      "メロディトラックが見つかりません。有効なノートを含むトラックがありません。",
    );
  }

  // スコア降順ソート
  scored.sort((a, b) => b.score - a.score);

  const topTrack = scored[0];
  const result: Track[] = [topTrack.track];
  const minNoteCount = topTrack.track.notes.length * 0.2;

  // 残りのトラックからポリフォニーが高い順に最大2つ追加
  const candidates = scored
    .slice(1)
    .filter((s) => s.track.notes.length >= minNoteCount)
    .sort((a, b) => b.polyphonyRatio - a.polyphonyRatio);

  for (const candidate of candidates) {
    if (result.length >= 3) break;
    result.push(candidate.track);
  }

  return result;
}

/**
 * インターバルベースでノートを5レーンに変換する。
 * 音程差に応じてレーンを移動し、同一レーン3連続時は強制的に隣接レーンへ移動。
 */
function convertWithInterval(notes: Note[]): ChartNote[] {
  if (notes.length === 0) return [];

  const chartNotes: ChartNote[] = [];
  let currentLane = 2; // 中央（Bレーン）から開始
  let sameCount = 0;
  let forceDirection = 1; // 強制移動時の交互方向

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];

    if (i > 0) {
      const prevNote = notes[i - 1];
      const interval = Math.abs(note.midi - prevNote.midi);
      const goesUp = note.midi > prevNote.midi;

      let movement: number;
      if (interval === 0) {
        movement = 0;
      } else if (interval <= 2) {
        movement = 1;
      } else if (interval <= 5) {
        movement = 2;
      } else if (interval <= 8) {
        movement = 3;
      } else {
        movement = 4;
      }

      // 上昇→P方向(+)、下降→R方向(-)
      if (movement > 0) {
        currentLane = goesUp
          ? Math.min(currentLane + movement, 4)
          : Math.max(currentLane - movement, 0);
      }
    }

    // 同一レーン3回連続防止
    if (chartNotes.length >= 2) {
      const prev1 = LANES.indexOf(chartNotes[chartNotes.length - 1].lane);
      const prev2 = LANES.indexOf(chartNotes[chartNotes.length - 2].lane);
      if (prev1 === currentLane && prev2 === currentLane) {
        sameCount++;
        // 交互方向で隣接レーンへ移動
        const offset = forceDirection > 0 ? 1 : -1;
        currentLane = Math.max(0, Math.min(4, currentLane + offset));
        forceDirection *= -1;
      } else {
        sameCount = 0;
      }
    }

    chartNotes.push({
      time: note.time,
      lane: LANES[currentLane],
      hit: false,
      judgement: null,
    });
  }

  return chartNotes;
}

/**
 * 重複除去: 50ms以内かつ同一レーンのノートを除去する。
 * primaryNotesのノートを優先的に残す。
 */
function deduplicateNotes(
  notes: ChartNote[],
  primaryCount: number,
): ChartNote[] {
  const result: ChartNote[] = [];
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    let dominated = false;
    // 直前のノートと比較して50ms以内かつ同一レーンなら除去
    for (let j = result.length - 1; j >= 0; j--) {
      if (note.time - result[j].time > 0.05) break;
      if (result[j].lane === note.lane) {
        // primaryトラックのノート（先頭primaryCount個以内）を優先
        if (i >= primaryCount && j < primaryCount) {
          dominated = true;
        } else if (i < primaryCount && j >= primaryCount) {
          // 現在のノートがprimaryなら既存を消す
          result.splice(j, 1);
        } else {
          dominated = true;
        }
        break;
      }
    }
    if (!dominated) {
      result.push(note);
    }
  }
  return result;
}

/**
 * 密度制限: 1秒間のスライディングウィンドウで16ノートを超える場合、間引く。
 * primaryCountまでのノートを優先的に残す。
 */
function limitDensity(
  notes: ChartNote[],
  primaryCount: number,
): ChartNote[] {
  const maxPerSecond = 16;
  const result = [...notes];

  let windowStart = 0;
  for (let windowEnd = 0; windowEnd < result.length; windowEnd++) {
    // ウィンドウの開始位置を更新
    while (
      windowStart < windowEnd &&
      result[windowEnd].time - result[windowStart].time > 1.0
    ) {
      windowStart++;
    }

    const windowSize = windowEnd - windowStart + 1;
    if (windowSize > maxPerSecond) {
      // ウィンドウ内の非primaryノートを1つおきに削除
      const toRemove: number[] = [];
      let removeToggle = false;
      for (let k = windowStart; k <= windowEnd; k++) {
        // primaryトラック由来でないノートを間引き対象にする
        if (k >= primaryCount) {
          if (removeToggle) {
            toRemove.push(k);
          }
          removeToggle = !removeToggle;
        }
      }
      // 後ろから削除して添字がずれないようにする
      for (let r = toRemove.length - 1; r >= 0; r--) {
        result.splice(toRemove[r], 1);
        if (windowEnd >= toRemove[r]) windowEnd--;
      }
    }
  }

  return result;
}

/**
 * 複数トラックのノートをマージし、レーン変換・重複除去・密度制限を適用する。
 */
function mergeAndConvert(tracks: Track[]): ChartNote[] {
  if (tracks.length === 0) return [];

  // 各トラックを個別に変換
  const converted: ChartNote[][] = tracks.map((t) =>
    convertWithInterval(t.notes),
  );

  const primaryCount = converted[0].length;

  // 全ノートを時間順でマージ
  let merged: ChartNote[] = converted.flat();
  merged.sort((a, b) => a.time - b.time);

  // 重複除去
  merged = deduplicateNotes(merged, primaryCount);

  // 密度制限
  merged = limitDensity(merged, primaryCount);

  return merged;
}

/**
 * ノート配列のギャップ（500ms以上）を他トラックのノートで補填する。
 */
function fillGaps(notes: ChartNote[], allTracks: Track[]): ChartNote[] {
  if (notes.length === 0) return notes;

  const gapThreshold = 0.5; // 500ms
  const gapNotes: ChartNote[] = [];

  for (let i = 0; i < notes.length - 1; i++) {
    const gapStart = notes[i].time;
    const gapEnd = notes[i + 1].time;
    const gap = gapEnd - gapStart;

    if (gap <= gapThreshold) continue;

    // ギャップ内のノートが最も多いトラックを探す
    let bestTrack: Track | null = null;
    let bestCount = 0;

    for (const track of allTracks) {
      const count = track.notes.filter(
        (n) => n.time > gapStart && n.time < gapEnd,
      ).length;
      if (count > bestCount) {
        bestCount = count;
        bestTrack = track;
      }
    }

    if (bestTrack !== null && bestCount > 0) {
      const gapTrackNotes = bestTrack.notes.filter(
        (n) => n.time > gapStart && n.time < gapEnd,
      );
      const converted = convertWithInterval(gapTrackNotes);
      gapNotes.push(...converted);
    }
  }

  if (gapNotes.length === 0) return notes;

  // 元のノートとギャップ補填ノートをマージ
  const primaryCount = notes.length;
  let result = [...notes, ...gapNotes];
  result.sort((a, b) => a.time - b.time);

  // 重複除去と密度制限
  result = deduplicateNotes(result, primaryCount);
  result = limitDensity(result, primaryCount);

  return result;
}

/**
 * MIDIファイルのArrayBufferをパースしてChartデータに変換する。
 * Clone Hero互換ノート(60-64)があればそれを使用し、なければメロディトラックを
 * 自動検出して5レーンに変換する。
 * @param arrayBuffer MIDIファイルの内容
 * @param fileName ファイル名（タイトルのフォールバック用）
 * @returns LoadedSong オブジェクト（Chart + 生のMidiオブジェクト）
 * @throws ノートが0個の場合、またはパース失敗時
 */
export function loadMidiFile(arrayBuffer: ArrayBuffer, fileName: string): LoadedSong {
  const midi = new Midi(arrayBuffer);

  // 全トラックからClone Hero互換ノート(60-64)を収集
  let chartNotes: ChartNote[] = [];
  let chartTrackIndices: number[] = [];

  for (let ti = 0; ti < midi.tracks.length; ti++) {
    const track = midi.tracks[ti];
    let hasChartNote = false;
    for (const note of track.notes) {
      const lane = NOTE_MAP[note.midi];
      if (lane !== undefined) {
        chartNotes.push({
          time: note.time,
          lane,
          hit: false,
          judgement: null,
        });
        hasChartNote = true;
      }
    }
    if (hasChartNote) {
      chartTrackIndices.push(ti);
    }
  }

  // Clone Hero互換ノートが見つからない場合、複数トラック合成で自動変換
  if (chartNotes.length === 0) {
    const allNonDrumTracks = midi.tracks.filter(
      (t) => t.channel !== 9 && t.notes.length > 0,
    );
    const selectedTracks = selectTracks(midi);
    const merged = mergeAndConvert(selectedTracks);
    chartNotes = fillGaps(merged, allNonDrumTracks);
    // 選択されたトラックのインデックスを記録
    chartTrackIndices = selectedTracks.map((st) => midi.tracks.indexOf(st));
  }

  if (chartNotes.length === 0) {
    throw new Error(
      "対応するノートが見つかりません。MIDIファイルに有効なノートが含まれていません。",
    );
  }

  // timeでソート
  chartNotes.sort((a, b) => a.time - b.time);

  // BPM取得
  const bpm = midi.header.tempos[0]?.bpm ?? 120;

  // タイトル取得: 最初の名前付きトラック or ファイル名
  let title = "";
  for (const track of midi.tracks) {
    if (track.name) {
      title = track.name;
      break;
    }
  }
  if (!title) {
    // 拡張子を除いたファイル名を使用
    title = fileName.replace(/\.(mid|midi)$/i, "");
  }

  // 最後のノートの時刻 + 2秒の余白
  const lastNoteTime = chartNotes[chartNotes.length - 1].time;
  const duration = lastNoteTime + 2;

  // ノートをコード（和音）にグルーピング
  const chords = groupNotesIntoChords(chartNotes);

  const chart: Chart = {
    title,
    bpm: Math.round(bpm),
    notes: chartNotes,
    chords,
    duration,
    totalNotes: chords.length,
  };

  return { chart, midi, chartTrackIndices };
}
