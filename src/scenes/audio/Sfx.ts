/**
 * Placeholder sound effects (T35), synthesized with WebAudio so Phase 1 needs no audio files.
 * Routed through Phaser's master volume node, so the volume setting applies. Each sound has a
 * minimum gap so a burst of hits does not become noise.
 */
import type Phaser from 'phaser';

export type SfxName =
  | 'shoot'
  | 'shootHeavy'
  | 'reload'
  | 'reloaded'
  | 'hit'
  | 'kill'
  | 'hurt'
  | 'levelUp'
  | 'pickup'
  | 'explosion'
  | 'slam'
  | 'bossDeath';

/** Minimum ms between two plays of the same sound. */
const MIN_GAP: Partial<Record<SfxName, number>> = { hit: 35, kill: 30, pickup: 40, shoot: 25 };

export class Sfx {
  private readonly ctx: AudioContext | null;
  private readonly out: AudioNode | null;
  private readonly last = new Map<SfxName, number>();
  private noiseBuffer: AudioBuffer | null = null;

  constructor(game: Phaser.Game) {
    const sm = game.sound as Partial<Phaser.Sound.WebAudioSoundManager>;
    this.ctx = sm.context ?? null;
    this.out = sm.masterVolumeNode ?? null;
  }

  play(name: SfxName): void {
    const ctx = this.ctx;
    if (!ctx || !this.out || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const gap = MIN_GAP[name];
    if (gap !== undefined && (now - (this.last.get(name) ?? -1)) * 1000 < gap) return;
    this.last.set(name, now);

    switch (name) {
      case 'shoot':
        this.noise(0.05, 0.18, 2500);
        this.tone(520, 180, 0.06, 'square', 0.05);
        break;
      case 'shootHeavy':
        this.noise(0.14, 0.32, 900);
        this.tone(160, 50, 0.16, 'sawtooth', 0.12);
        break;
      case 'reload':
        this.tone(900, 700, 0.04, 'square', 0.05);
        break;
      case 'reloaded':
        this.tone(700, 1100, 0.05, 'square', 0.06);
        break;
      case 'hit':
        this.tone(320, 240, 0.03, 'triangle', 0.06);
        break;
      case 'kill':
        this.tone(440, 110, 0.09, 'triangle', 0.08);
        break;
      case 'hurt':
        this.tone(140, 60, 0.18, 'sawtooth', 0.16);
        break;
      case 'levelUp':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.09, 'square', 0.06, i * 0.07));
        break;
      case 'pickup':
        this.tone(1200, 1600, 0.04, 'sine', 0.05);
        break;
      case 'explosion':
        this.noise(0.4, 0.4, 600);
        this.tone(90, 30, 0.35, 'sine', 0.25);
        break;
      case 'slam':
        this.noise(0.3, 0.3, 300);
        this.tone(70, 35, 0.4, 'sine', 0.3);
        break;
      case 'bossDeath':
        this.noise(0.9, 0.35, 500);
        [392, 523, 659, 784].forEach((f, i) => this.tone(f, f, 0.2, 'triangle', 0.08, 0.3 + i * 0.12));
        break;
    }
  }

  private tone(from: number, to: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.out!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, lowpass: number): void {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) {
      const len = Math.floor(ctx.sampleRate * 1);
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = this.noiseBuffer.getChannelData(0);
      // Cosmetic randomness only (not gameplay), so Math.random is fine here.
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.out!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
