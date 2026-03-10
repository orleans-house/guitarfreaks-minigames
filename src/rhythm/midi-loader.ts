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

/**
 * メロディトラックとして最適なトラックを選択する。
 * ドラムチャンネル(ch9)を除外し、ノート数・ポリフォニー率・音域でスコアリング。
 * @param midi パース済みMidiオブジェクト
 * @returns 最高スコアのトラック
 * @throws 有効なトラックがない場合
 */
function selectMelodyTrack(midi: Midi): Track {
  let bestTrack: Track | null = null;
  let bestScore = -1;

  for (const track of midi.tracks) {
    // ドラムチャンネル（channel 9、0-indexed）を除外
    if (track.channel === 9) continue;
    // ノートが0個のトラックを除外
    if (track.notes.length === 0) continue;

    const noteCount = track.notes.length;

    // ポリフォニー率を計算: 他のノートと時間的に重なるノートの割合
    let overlappingCount = 0;
    for (let i = 0; i < track.notes.length; i++) {
      const n = track.notes[i];
      const nEnd = n.time + n.duration;
      for (let j = 0; j < track.notes.length; j++) {
        if (i === j) continue;
        const m = track.notes[j];
        // nとmが時間的に重なるか
        if (m.time < nEnd && n.time < m.time + m.duration) {
          overlappingCount++;
          break; // 1つでも重なれば十分
        }
      }
    }
    const polyphonyRatio = overlappingCount / noteCount;

    // 中央値のピッチを計算
    const sortedMidi = track.notes.map((n) => n.midi).sort((a, b) => a - b);
    const medianPitch = sortedMidi[Math.floor(sortedMidi.length / 2)];

    // 中音域ボーナス: C3(48) 〜 C6(84) の範囲内なら1.0、それ以外は0.7
    const midRangeBonus = medianPitch >= 48 && medianPitch <= 84 ? 1.0 : 0.7;

    const score = noteCount * (1 - polyphonyRatio * 0.5) * midRangeBonus;

    if (score > bestScore) {
      bestScore = score;
      bestTrack = track;
    }
  }

  if (bestTrack === null) {
    throw new Error(
      "メロディトラックが見つかりません。有効なノートを含むトラックがありません。",
    );
  }

  return bestTrack;
}

/**
 * トラックのノートを5レーン譜面に自動変換する。
 * 音域を5等分してR/G/B/Y/Pレーンに割り当て。
 * @param notes トラックのノート配列
 * @returns ChartNote配列
 */
function autoConvertTrack(notes: Note[]): ChartNote[] {
  const midiNumbers = notes.map((n) => n.midi);
  const minNote = Math.min(...midiNumbers);
  const maxNote = Math.max(...midiNumbers);
  const range = maxNote - minNote;

  const chartNotes: ChartNote[] = [];

  for (const note of notes) {
    let lane: NeckKey;
    if (range < 5) {
      // 音域が5未満の場合はモジュロマッピング
      lane = LANES[note.midi % 5];
    } else {
      // 音域を5等分してレーンに割り当て
      const bin = Math.min(
        Math.floor(((note.midi - minNote) / (range + 1)) * 5),
        4,
      );
      lane = LANES[bin];
    }

    chartNotes.push({
      time: note.time,
      lane,
      hit: false,
      judgement: null,
    });
  }

  return chartNotes;
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

  for (const track of midi.tracks) {
    for (const note of track.notes) {
      const lane = NOTE_MAP[note.midi];
      if (lane !== undefined) {
        chartNotes.push({
          time: note.time,
          lane,
          hit: false,
          judgement: null,
        });
      }
    }
  }

  // Clone Hero互換ノートが見つからない場合、メロディトラックを自動変換
  if (chartNotes.length === 0) {
    const melodyTrack = selectMelodyTrack(midi);
    chartNotes = autoConvertTrack(melodyTrack.notes);
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

  return { chart, midi };
}
