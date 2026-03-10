import { Midi } from "@tonejs/midi";
import type { Chart, ChartNote, LoadedSong } from "./types.ts";
import type { NeckKey } from "../core/gamepad.ts";

/** Clone Hero互換 MIDIノート番号 → NeckKey マッピング */
const NOTE_MAP: Record<number, NeckKey> = {
  60: "r",
  61: "g",
  62: "b",
  63: "y",
  64: "p",
};

/**
 * MIDIファイルのArrayBufferをパースしてChartデータに変換する。
 * @param arrayBuffer MIDIファイルの内容
 * @param fileName ファイル名（タイトルのフォールバック用）
 * @returns LoadedSong オブジェクト（Chart + 生のMidiオブジェクト）
 * @throws ノートが0個の場合、またはパース失敗時
 */
export function loadMidiFile(arrayBuffer: ArrayBuffer, fileName: string): LoadedSong {
  const midi = new Midi(arrayBuffer);

  // 全トラックからノートを収集
  const chartNotes: ChartNote[] = [];

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

  if (chartNotes.length === 0) {
    throw new Error(
      "対応するノートが見つかりません。MIDIノート番号60-64（C4-E4）を使用したファイルが必要です。",
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

  const chart: Chart = {
    title,
    bpm: Math.round(bpm),
    notes: chartNotes,
    duration,
    totalNotes: chartNotes.length,
  };

  return { chart, midi };
}
