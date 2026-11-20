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
    expect(d.barrelMods).toHaveLength(13); // 9 mods + 4 operators
    expect(d.magazineMods).toHaveLength(6);
    expect(d.enemies).toHaveLength(5);
    expect(d.buffs).toHaveLength(12);
    // Every slot is open from the start, so the barrel order is the player's plan, not the level's.
    expect(d.config.slots.barrelUnlockLevels).toEqual([1]);
    expect(d.config.slots.magazineUnlockLevels).toEqual([1]);
    for (const g of d.guns) expect(g.barrel.slots + g.magazineSlots).toBeLessThanOrEqual(12);
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
      f.barrelMods[0].levels[0] = { chains: 2, radius: 4, damageFactor: 0.5 };
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

  it('catches a mod with the wrong number of levels', () => {
    const p = problemsAfter((f) => {
      f.magazineMods[0].levels.pop();
    });
    expect(p).toContainEqual(expect.stringContaining('extended_mag: has 2 levels'));
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
