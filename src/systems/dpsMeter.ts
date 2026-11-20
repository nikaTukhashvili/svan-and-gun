/**
 * DpsMeter (Training Ground dev tool): damage and DPS per target and for all targets together.
 *
 * - `dps`: damage in the last `windowSec`, divided by `windowSec` (falls to 0 when you stop).
 * - A session starts with the first hit and ends after `idleResetSec` with no damage. Its numbers
 *   (total, hits, session DPS, peak) stay readable until the next hit starts a new session.
 * - Time is the run clock in seconds, passed in by the caller (never Date.now()).
 */

export type DpsKey = number | 'all';

export interface DpsMeterOptions {
  windowSec: number;
  idleResetSec: number;
  /** Session DPS divides by at least this many seconds. */
  minSessionSec: number;
}

export interface DpsStats {
  /** Rolling DPS over the window. */
  dps: number;
  /** Session total ÷ session length. */
  sessionDps: number;
  /** Highest rolling DPS seen this session. */
  peakDps: number;
  total: number;
  hits: number;
  crits: number;
  /** Damage dealt by statuses (burn, poison) this session. */
  statusDamage: number;
  /** Session length in seconds (to now while active, to the last hit once idle). */
  sessionSec: number;
}

interface Track {
  /** Hits inside the window: [time, amount]. */
  recent: [number, number][];
  windowSum: number;
  start: number;
  last: number;
  total: number;
  hits: number;
  crits: number;
  statusDamage: number;
  peakDps: number;
}

const emptyStats = (): DpsStats => ({
  dps: 0,
  sessionDps: 0,
  peakDps: 0,
  total: 0,
  hits: 0,
  crits: 0,
  statusDamage: 0,
  sessionSec: 0,
});

export class DpsMeter {
  private readonly tracks = new Map<DpsKey, Track>();

  constructor(private readonly opts: DpsMeterOptions) {}

  record(key: number, amount: number, t: number, crit: boolean, byStatus: boolean): void {
    this.add(key, amount, t, crit, byStatus);
    this.add('all', amount, t, crit, byStatus);
  }

  /** Forget one target, or everything when no key is given. */
  reset(key?: DpsKey): void {
    if (key === undefined) this.tracks.clear();
    else this.tracks.delete(key);
  }

  stats(key: DpsKey, t: number): DpsStats {
    const tr = this.tracks.get(key);
    if (!tr) return emptyStats();
    this.prune(tr, t);
    const active = t - tr.last <= this.opts.idleResetSec;
    const sessionSec = (active ? t : tr.last) - tr.start;
    return {
      dps: tr.windowSum / this.opts.windowSec,
      sessionDps: tr.total / Math.max(sessionSec, this.opts.minSessionSec),
      peakDps: tr.peakDps,
      total: tr.total,
      hits: tr.hits,
      crits: tr.crits,
      statusDamage: tr.statusDamage,
      sessionSec,
    };
  }

  private add(key: DpsKey, amount: number, t: number, crit: boolean, byStatus: boolean): void {
    let tr = this.tracks.get(key);
    if (!tr || t - tr.last > this.opts.idleResetSec) {
      tr = {
        recent: [],
        windowSum: 0,
        start: t,
        last: t,
        total: 0,
        hits: 0,
        crits: 0,
        statusDamage: 0,
        peakDps: 0,
      };
      this.tracks.set(key, tr);
    }
    tr.last = t;
    tr.total += amount;
    if (byStatus) tr.statusDamage += amount;
    else tr.hits++;
    if (crit) tr.crits++;
    tr.recent.push([t, amount]);
    tr.windowSum += amount;
    this.prune(tr, t);
    tr.peakDps = Math.max(tr.peakDps, tr.windowSum / this.opts.windowSec);
  }

  private prune(tr: Track, t: number): void {
    const from = t - this.opts.windowSec;
    let i = 0;
    while (i < tr.recent.length && tr.recent[i]![0] <= from) {
      tr.windowSum -= tr.recent[i]![1];
      i++;
    }
    if (i > 0) tr.recent.splice(0, i);
    if (tr.recent.length === 0) tr.windowSum = 0; // no float drift once empty
  }
}
