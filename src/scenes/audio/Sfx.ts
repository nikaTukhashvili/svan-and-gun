/**
 * Placeholder sound effects (T35), synthesized with WebAudio so the game needs no audio files.
 * Routed through Phaser's master volume node, so the volume setting applies. Each sound has a
 * minimum gap so a burst of hits does not become noise, and combat sounds vary their pitch a
 * little so repeats do not grate.
 *
 * One instance per game (`sfxFor`), shared by every scene: the run, the level-up screen and menu
 * buttons.
 */
import type Phaser from 'phaser';

/** Every sound, in groups (the Training Ground sound test lists them in this order). */
export const SFX_NAMES = [
  'shoot',
  'shootHeavy',
  'reload',
  'reloaded',
  'hit',
  'crit',
  'kill',
  'hurt',
  'zap',
  'freeze',
  'burst',
  'explosion',
  'throw',
  'enemyShot',
  'pickup',
  'silver',
  'heal',
  'horn',
  'chest',
  'levelUp',
  'elite',
  'bossSpawn',
  'slam',
  'bossDeath',
  'victory',
  'defeat',
  'click',
  'select',
  'grab',
  'place',
  'upgrade',
  'mutate',
  'replace',
  'error',
  'reroll',
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

/** Minimum ms between two plays of the same sound. */
const MIN_GAP: Partial<Record<SfxName, number>> = {
  hit: 35,
  crit: 50,
  kill: 30,
  pickup: 40,
  silver: 60,
  shoot: 25,
  zap: 70,
  freeze: 60,
  burst: 80,
  enemyShot: 70,
  click: 40,
};

/** Sounds whose pitch varies a little on each play (cosmetic). */
const VARY = new Set<SfxName>([
  'shoot',
  'shootHeavy',
  'hit',
  'crit',
  'kill',
  'zap',
  'freeze',
  'burst',
  'pickup',
  'enemyShot',
]);

const instances = new WeakMap<Phaser.Game, Sfx>();

/** The game's shared sound bank. */
export function sfxFor(game: Phaser.Game): Sfx {
  let s = instances.get(game);
  if (!s) {
    s = new Sfx(game);
    instances.set(game, s);
  }
  return s;
}

export class Sfx {
  private readonly ctx: AudioContext | null;
  private readonly out: AudioNode | null;
  private readonly last = new Map<SfxName, number>();
  private noiseBuffer: AudioBuffer | null = null;
  /** Pitch factor for the sound being played. */
  private pitch = 1;

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
    // Cosmetic randomness only (not gameplay), so Math.random is fine here.
    this.pitch = VARY.has(name) ? 1 + (Math.random() - 0.5) * 0.08 : 1;

    switch (name) {
      // ---------- gun and combat ----------
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
      case 'crit':
        this.tone(1100, 700, 0.05, 'square', 0.05);
        this.tone(330, 220, 0.05, 'triangle', 0.07);
        break;
      case 'kill':
        this.tone(440, 110, 0.09, 'triangle', 0.08);
        break;
      case 'hurt':
        this.tone(140, 60, 0.18, 'sawtooth', 0.16);
        break;
      case 'zap':
        this.noise(0.07, 0.08, 7000, 'highpass');
        this.tone(1900, 500, 0.07, 'sawtooth', 0.035);
        break;
      case 'freeze':
        this.tone(2100, 2900, 0.1, 'sine', 0.05);
        this.tone(3200, 2400, 0.14, 'triangle', 0.025, 0.03);
        this.noise(0.12, 0.06, 5000, 'highpass');
        break;
      case 'burst':
        this.noise(0.28, 0.22, 1400);
        this.tone(130, 55, 0.22, 'sine', 0.12);
        break;
      case 'explosion':
        this.noise(0.4, 0.4, 600);
        this.tone(90, 30, 0.35, 'sine', 0.25);
        break;
      case 'throw':
        this.noise(0.16, 0.1, 2200, 'bandpass');
        break;
      case 'enemyShot':
        this.tone(760, 320, 0.07, 'triangle', 0.035);
        break;

      // ---------- pickups ----------
      case 'pickup':
        this.tone(1200, 1600, 0.04, 'sine', 0.05);
        break;
      case 'silver':
        this.tone(1600, 2100, 0.05, 'sine', 0.06);
        this.tone(2400, 2400, 0.06, 'sine', 0.03, 0.04);
        break;
      case 'heal':
        this.tone(523, 784, 0.22, 'sine', 0.08);
        this.tone(659, 988, 0.22, 'sine', 0.05, 0.06);
        break;
      case 'horn':
        this.tone(220, 220, 0.45, 'sawtooth', 0.06);
        this.tone(330, 330, 0.45, 'sawtooth', 0.04, 0.05);
        break;
      case 'chest':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, 0.1, 'triangle', 0.06, i * 0.06));
        break;

      // ---------- run events ----------
      case 'levelUp':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.09, 'square', 0.06, i * 0.07));
        break;
      case 'elite':
        this.tone(110, 98, 0.6, 'sawtooth', 0.08);
        this.tone(165, 147, 0.6, 'sawtooth', 0.05, 0.08);
        break;
      case 'bossSpawn':
        this.noise(0.9, 0.25, 250);
        this.tone(55, 45, 1.0, 'sawtooth', 0.14);
        this.tone(82, 70, 1.0, 'sawtooth', 0.08, 0.15);
        break;
      case 'slam':
        this.noise(0.3, 0.3, 300);
        this.tone(70, 35, 0.4, 'sine', 0.3);
        break;
      case 'bossDeath':
        this.noise(0.9, 0.35, 500);
        [392, 523, 659, 784].forEach((f, i) => this.tone(f, f, 0.2, 'triangle', 0.08, 0.3 + i * 0.12));
        break;
      case 'victory':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.18, 'square', 0.06, i * 0.14));
        this.tone(1047, 1047, 0.6, 'triangle', 0.06, 0.56);
        break;
      case 'defeat':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, f * 0.97, 0.26, 'triangle', 0.08, i * 0.2));
        break;

      // ---------- menus and the level-up screen ----------
      case 'click':
        this.tone(620, 820, 0.03, 'square', 0.035);
        break;
      case 'select':
        this.tone(440, 440, 0.06, 'triangle', 0.06);
        this.tone(660, 660, 0.09, 'triangle', 0.06, 0.06);
        break;
      case 'grab':
        this.tone(320, 520, 0.05, 'triangle', 0.05);
        break;
      case 'place':
        this.noise(0.06, 0.12, 900);
        this.tone(190, 120, 0.08, 'sine', 0.14);
        break;
      case 'upgrade':
        [660, 880, 1320].forEach((f, i) => this.tone(f, f, 0.08, 'square', 0.05, i * 0.06));
        break;
      case 'mutate':
        [330, 415, 494].forEach((f) => this.tone(f, f * 1.5, 0.6, 'triangle', 0.05));
        this.tone(200, 1400, 0.5, 'sine', 0.05);
        [988, 1319].forEach((f, i) => this.tone(f, f, 0.2, 'square', 0.04, 0.45 + i * 0.08));
        break;
      case 'replace':
        this.tone(420, 200, 0.12, 'sawtooth', 0.05);
        break;
      case 'error':
        this.tone(160, 150, 0.07, 'square', 0.05);
        this.tone(160, 150, 0.07, 'square', 0.05, 0.1);
        break;
      case 'reroll':
        this.noise(0.1, 0.08, 4000, 'highpass');
        this.tone(700, 1300, 0.12, 'triangle', 0.05);
        break;
    }
  }

  private tone(from: number, to: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from * this.pitch, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to * this.pitch), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.out!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, freq: number, type: BiquadFilterType = 'lowpass'): void {
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
    filter.type = type;
    filter.frequency.value = freq * this.pitch;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.out!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
