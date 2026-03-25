import type { Midi } from "@tonejs/midi";

interface ScheduledNote {
  time: number;
  duration: number;
  midi: number;
  velocity: number;
}

/**
 * MIDIの全ノートをWeb Audio APIオシレーターで再生するシンセサイザー。
 * orleans-house/midi-parser の合成パターンを参考にした実装。
 */
export class MidiSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private notes: ScheduledNote[] = [];
  private nextNoteIndex = 0;
  private schedulerTimer: number | null = null;
  private startTimestamp = 0;
  private activeOscillators: OscillatorNode[] = [];
  private waveform: PeriodicWave | null = null;
  /** 譜面トラックの全ノート（ピッキング時の即時再生用） */
  private chartNotes: ScheduledNote[] = [];

  /**
   * @tonejs/midi の Midi オブジェクトから再生用ノートを取得。
   * chartTrackIndices で指定されたトラックはバックグラウンド再生から除外し、
   * ピッキング時の即時再生用に保持する。
   */
  loadSong(midi: Midi, chartTrackIndices: number[] = []): void {
    this.notes = [];
    this.chartNotes = [];
    const excludeSet = new Set(chartTrackIndices);

    for (let ti = 0; ti < midi.tracks.length; ti++) {
      const track = midi.tracks[ti];
      // ドラムチャンネル（ch10, 0-indexed = 9）は除外
      if (track.channel === 9) continue;

      const isChartTrack = excludeSet.has(ti);
      for (const note of track.notes) {
        const sn: ScheduledNote = {
          time: note.time,
          duration: note.duration,
          midi: note.midi,
          velocity: note.velocity,
        };
        if (isChartTrack) {
          this.chartNotes.push(sn);
        } else {
          this.notes.push(sn);
        }
      }
    }
    this.notes.sort((a, b) => a.time - b.time);
    this.chartNotes.sort((a, b) => a.time - b.time);
  }

  /** performance.now() ベースのタイムスタンプで再生開始 */
  play(startTimestamp: number): void {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.ctx.destination);

    this.createWaveform();

    this.startTimestamp = startTimestamp;
    this.nextNoteIndex = 0;
    this.activeOscillators = [];

    this.schedule();
    this.schedulerTimer = window.setInterval(() => this.schedule(), 200);
  }

  /**
   * 譜面トラックのノートを即時再生する（ピッキング成功時に呼び出す）。
   * chordTime に一致するノートを探して鳴らす。
   */
  playChordNotes(chordTime: number): void {
    if (!this.ctx || !this.masterGain) return;

    const threshold = 0.01; // 10ms
    for (const note of this.chartNotes) {
      if (note.time < chordTime - threshold) continue;
      if (note.time > chordTime + threshold) break;
      this.scheduleNote(note, this.ctx.currentTime);
    }
  }

  /** 全オシレーター停止、スケジューラ停止、AudioContext破棄 */
  stop(): void {
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    for (const osc of this.activeOscillators) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
    this.activeOscillators = [];
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.masterGain = null;
  }

  /**
   * ピアノ風 PeriodicWave を生成。
   * midi-parser/src/js/waveforms.js の piano 定義を移植:
   *   real: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
   *   imag: [0, 1, 0.5, 0.33, 0.2, 0.13, 0.08, 0.05, 0.03, 0.02, 0.01]
   */
  private createWaveform(): void {
    if (!this.ctx) return;
    const real = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const imag = new Float32Array([0, 1, 0.5, 0.33, 0.2, 0.13, 0.08, 0.05, 0.03, 0.02, 0.01]);
    this.waveform = this.ctx.createPeriodicWave(real, imag, {
      disableNormalization: false,
    });
  }

  /** チャンク方式スケジューラ: 15秒先読みでノートをスケジュール */
  private schedule(): void {
    if (!this.ctx || !this.masterGain) return;

    const now = performance.now();
    const songTime = (now - this.startTimestamp) / 1000;
    const lookAhead = 15;

    while (this.nextNoteIndex < this.notes.length) {
      const note = this.notes[this.nextNoteIndex];
      if (note.time > songTime + lookAhead) break;

      // 既に通過したノートはスキップ
      if (note.time < songTime - 0.1) {
        this.nextNoteIndex++;
        continue;
      }

      const delay = note.time - songTime;
      const audioTime = this.ctx.currentTime + Math.max(0, delay);
      this.scheduleNote(note, audioTime);
      this.nextNoteIndex++;
    }
  }

  /** 個別ノートをオシレーター+エンベロープでスケジュール */
  private scheduleNote(note: ScheduledNote, audioTime: number): void {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // 周波数: A4=440Hz基準
    osc.frequency.value = midiToFreq(note.midi);

    // カスタム波形を適用
    if (this.waveform) {
      osc.setPeriodicWave(this.waveform);
    } else {
      osc.type = "triangle";
    }

    // エンベロープ: アタック 10ms、エクスポネンシャルリリース
    const vel = note.velocity * 0.5;
    const duration = Math.min(note.duration, 2);
    gain.gain.setValueAtTime(0, audioTime);
    gain.gain.linearRampToValueAtTime(vel, audioTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, audioTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(audioTime);
    osc.stop(audioTime + duration + 0.05);

    this.activeOscillators.push(osc);
    osc.onended = () => {
      const idx = this.activeOscillators.indexOf(osc);
      if (idx >= 0) this.activeOscillators.splice(idx, 1);
    };
  }
}

/** MIDIノート番号を周波数(Hz)に変換 */
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
