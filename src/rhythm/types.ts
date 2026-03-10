import type { Midi } from "@tonejs/midi";
import type { NeckKey } from "../core/gamepad.ts";

/** MIDIから変換された1つのノート */
export interface ChartNote {
  /** 秒単位の出現時刻 */
  time: number;
  /** 対応するレーン */
  lane: NeckKey;
  /** 判定済みかどうか（プレイ中に変更される） */
  hit: boolean;
  /** 判定結果（未判定ならnull） */
  judgement: Judgement | null;
}

/** 同時刻のノーツをまとめたコード（和音） */
export interface Chord {
  /** 秒単位の出現時刻 */
  time: number;
  /** 押さえるべきレーンの配列（ソート済み） */
  lanes: NeckKey[];
  /** 判定済みかどうか */
  hit: boolean;
  /** 判定結果 */
  judgement: Judgement | null;
}

/** 譜面全体 */
export interface Chart {
  /** 曲名（MIDIトラック名またはファイル名） */
  title: string;
  /** 表示用BPM（MIDIヘッダの最初のテンポ） */
  bpm: number;
  /** ノート配列（timeでソート済み） */
  notes: ChartNote[];
  /** コード配列（判定単位） */
  chords: Chord[];
  /** 譜面の総時間（秒）：最後のノートの時刻 + 余白 */
  duration: number;
  /** 総ノート数（コード数ベース） */
  totalNotes: number;
}

/** MIDIファイルから読み込んだ曲データ（譜面＋シンセ用Midiオブジェクト） */
export interface LoadedSong {
  chart: Chart;
  midi: Midi;
  /** 譜面生成に使用されたトラックのインデックス（シンセで除外するため） */
  chartTrackIndices: number[];
}

/** 判定ランク */
export type Judgement = "perfect" | "great" | "good" | "miss";

/** ゲームのフェーズ */
export type RhythmPhase = "file-select" | "playing" | "result";
