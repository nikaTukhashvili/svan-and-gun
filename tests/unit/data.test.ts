import { describe, expect, it } from 'vitest';
import { DataValidationError, parseGameData } from '../../src/data/registry';
import { loadGameData, loadRawData } from '../helpers/loadData';

// Tests deliberately break raw JSON, so loose typing is the point here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

/** Run parseGameData on a modified copy of the real data and return the problems found. */
function problemsAfter(mutate: (files: Loose, maps: Loose) => void): string[] {
  const { files, maps } = loadRawData();
  mutate(files, maps);
  try {
    parseGameData(files, maps);
    return [];
  } catch (err) {
    if (err instanceof DataValidationError) return [...err.problems];
    throw err;
  }
}

describe('game data files', () => {
  it('every JSON file passes its schema and the cross-file checks', () => {
    expect(() => loadGameData()).not.toThrow();
  });

  it('matches the GDD Phase 1 scope', () => {
    const d = loadGameData();
    expect(d.guns.map((g) => g.id)).toEqual(['long_gun', 'double_barrel', 'scrap_smg']);
    // 3 elements + 3 hybrids + 6 grey + 5 fittings (GDD: Barrel fusion)
    const count = (f: string) => d.barrelMods.filter((m) => m.family === f).length;
    expect([count('element'), count('hybrid'), count('grey'), count('fitting')]).toEqual([3, 3, 6, 5]);
    expect(d.supportPerks).toHaveLength(6);
    expect(d.enemies).toHaveLength(5);
    expect(d.buffs).toHaveLength(12);
    // Every slot is open from the start, so the barrel order is the player's plan, not the level's.
    expect(d.config.slots.barrelUnlockLevels[0]).toBe(1);
    for (const g of d.guns) expect(g.barrel.slots).toBeLessThanOrEqual(d.config.slots.maxTotalSlots);
    const boss = d.timeline.events.find((e) => e.type === 'boss');
    expect(boss?.at).toBe(330);
  });

  it('returns frozen data so systems cannot change tuning at runtime', () => {
    const d = loadGameData();
    expect(Object.isFrozen(d)).toBe(true);
    expect(Object.isFrozen(d.guns[0])).toBe(true);
    expect(() => {
      (d.guns[0] as { damage: number }).damage = 999;
    }).toThrow();
  });
});

describe('data validation errors', () => {
  it('reports a missing file', () => {
    expect(problemsAfter((f) => delete f.guns)).toContain('guns.json: file missing');
  });

  it('rejects misspelled keys (strict objects)', () => {
    const p = problemsAfter((f) => {
      f.guns[0].damgae = 5;
    });
    expect(p.some((x) => x.startsWith('guns.json') && x.includes('damgae'))).toBe(true);
  });

  it('rejects wrong types with the file and path in the message', () => {
    const p = problemsAfter((f) => {
      f.enemies[0].hp = 'ten';
    });
    expect(p.some((x) => x.startsWith('enemies.json > 0.hp'))).toBe(true);
  });

  it('rejects mod parameters that do not belong to that mod', () => {
    const p = problemsAfter((f) => {
      f.barrelMods[0].base = { chains: 2, radius: 4, damageFactor: 0.5 };
    });
    expect(p.some((x) => x.startsWith('barrelMods.json'))).toBe(true);
  });

  it('catches a timeline weight for an unknown enemy', () => {
    const p = problemsAfter((f) => {
      f.timeline.segments[0].weights = { kaji: 1, goblin: 1 };
    });
    expect(p).toContainEqual(expect.stringContaining('unknown enemy "goblin" in weights'));
  });

  it('catches a gap between timeline segments', () => {
    const p = problemsAfter((f) => {
      f.timeline.segments[1].from = 65;
    });
    expect(p).toContainEqual(expect.stringContaining('starts at 65, previous ends at 60'));
  });

  it('catches an enemy with no scrap drop', () => {
    const p = problemsAfter((f) => {
      delete f.drops.scrapByEnemy.kaji;
    });
    expect(p).toContain('drops.json > scrapByEnemy: missing enemy "kaji"');
  });

  it('catches a hybrid made of one element twice, and a missing hybrid for a pair', () => {
    const p = problemsAfter((f) => {
      const plasma = f.barrelMods.find((m: Loose) => m.id === 'plasma');
      plasma.parents = ['fire', 'fire'];
    });
    expect(p).toContainEqual(expect.stringContaining('plasma: a hybrid needs two different parent elements'));
    expect(p).toContainEqual(
      expect.stringContaining('elements fire + lightning need exactly one hybrid, found 0'),
    );
  });

  it('catches a support perk placeholder missing from a level', () => {
    const p = problemsAfter((f) => {
      f.supportPerks[0].description = 'Bigger by {nope}';
    });
    expect(p).toContainEqual(expect.stringContaining('extended_mag: description uses {nope}'));
  });

  it('catches a description placeholder missing from the level data', () => {
    const p = problemsAfter((f) => {
      f.barrelMods[0].description = 'Burns for {burnDps}';
    });
    expect(p).toContainEqual(expect.stringContaining('description uses {burnDps}'));
  });

  it('catches a player start inside an obstacle', () => {
    const p = problemsAfter((_f, m) => {
      m.level1.playerStart = { x: 80, y: 45 }; // the tower
    });
    expect(p).toContainEqual(expect.stringContaining('playerStart: inside obstacles.0'));
  });

  it('collects every problem instead of stopping at the first', () => {
    const p = problemsAfter((f) => {
      f.guns[0].damage = -1;
      f.enemies[1].speed = 0;
      f.buffs[0].maxLevel = 0;
    });
    expect(p.length).toBeGreaterThanOrEqual(3);
  });
});

describe('playground.json (Training Ground)', () => {
  it('loads with its map and dummies', () => {
    const d = loadGameData();
    expect(d.maps[d.playground.map]).toBeDefined();
    expect(d.playground.dummies.map((x) => x.id)).toEqual([
      'dummy_plain',
      'dummy_armoured',
      'dummy_pack',
      'dummy_mover',
    ]);
  });

  it('catches an unknown dummy in the layout, a missing map and a dummy id that is an enemy id', () => {
    const problems = problemsAfter((files) => {
      files.playground.layout[0].dummy = 'nobody';
      files.playground.map = 'nowhere';
      files.playground.dummies[0].id = 'kaji';
    });
    expect(problems.some((p) => p.includes('unknown dummy "nobody"'))).toBe(true);
    expect(problems.some((p) => p.includes('unknown map "nowhere"'))).toBe(true);
    expect(problems.some((p) => p.includes('"kaji" is also an enemy id'))).toBe(true);
  });
});
