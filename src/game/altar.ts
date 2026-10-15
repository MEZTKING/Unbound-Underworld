// The Altar of Ashes: permanent strength for every hero, bought with Ash.
//
// Two tables. Each is split into sections running from the weakest upgrades
// (top) to the strongest (bottom). A section opens once you reach its level
// AND have spent enough Ash on the sections above it, so the big upgrades
// (Death's Reprieve above all) come late. The second table opens when every
// upgrade on the first is complete. Prices are tuned so a dedicated player
// finishes both around level 50.
import type { PlayerStats } from './stats';

export interface AltarUpgrade {
  id: string;
  name: string;
  glyph: string;
  desc: (rank: number) => string;
  /** Ash for each rank. */
  costs: number[];
  /** Its effect on a stat block at `rank` (some upgrades work elsewhere: obols, boon odds, Death's Reprieve). */
  apply?: (s: PlayerStats, rank: number) => void;
}

export interface AltarSection {
  name: string;
  /** Player level needed. */
  level: number;
  /** Ash that must already be spent on this table's earlier sections. */
  spend: number;
  ups: AltarUpgrade[];
}

export interface AltarTable {
  name: string;
  blurb: string;
  sections: AltarSection[];
}

function addCrit(s: PlayerStats, c: number): void {
  for (const k of Object.keys(s.critChance) as (keyof PlayerStats['critChance'])[]) s.critChance[k] += c;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const ALTAR: AltarTable[] = [
  {
    name: 'Altar of Ashes',
    blurb: 'Permanent strength for every hero. Each section opens with your level and the Ash spent above it.',
    sections: [
      {
        name: 'Embers',
        level: 1,
        spend: 0,
        ups: [
          { id: 'vitality', name: 'Vitality', glyph: '♥', desc: (r) => `+${r * 8} max Health`, costs: [13, 26, 45, 70], apply: (s, r) => (s.maxHp += r * 8) },
          { id: 'fortune', name: 'Ferryman’s Purse', glyph: '◎', desc: (r) => `Begin each escape with ${r * 40} obols`, costs: [13, 33, 59] },
          { id: 'swiftness', name: 'Swiftness', glyph: '➶', desc: (r) => `+${r * 4}% move speed`, costs: [20, 40, 65], apply: (s, r) => (s.moveSpeed += r * 0.04) },
        ],
      },
      {
        name: 'Cinders',
        level: 4,
        spend: 120,
        ups: [
          { id: 'fury', name: 'Fury', glyph: '⚔', desc: (r) => `+${r * 4}% damage`, costs: [20, 39, 65, 104], apply: (s, r) => (s.globalDmg += r * 0.04) },
          { id: 'brewing', name: 'Alchemy', glyph: '⚗', desc: (r) => `Potion recharges ${r * 20}% faster and heals +${r * 10}%`, costs: [33, 78], apply: (s, r) => ((s.potionCooldown *= 1 - r * 0.2), (s.potionHeal += r * 0.1)) },
          { id: 'soulcraft', name: 'Echocraft', glyph: '✧', desc: (r) => `+${r * 25} max Echoes, +${r * 20}% Echoes gathered`, costs: [26, 65], apply: (s, r) => ((s.soulMax += r * 25), (s.soulGain += r * 0.2)) },
          { id: 'bloodlust', name: 'Bloodlust', glyph: '✚', desc: (r) => `Restore ${r} Health per foe slain`, costs: [40, 90], apply: (s, r) => (s.lifeOnKill += r) },
        ],
      },
      {
        name: 'Flames',
        level: 10,
        spend: 500,
        ups: [
          { id: 'resilience', name: 'Iron Will', glyph: '⛨', desc: (r) => `Take ${r * 4}% less damage`, costs: [26, 59, 104], apply: (s, r) => (s.damageTaken *= 1 - r * 0.04) },
          { id: 'shards', name: 'Shard Keeper', glyph: '◆', desc: (r) => `+${plural(r, 'Cast shard')}`, costs: [33, 98], apply: (s, r) => (s.castAmmo += r) },
          { id: 'tinkerer', name: 'Tinkerer', glyph: '⚙', desc: (r) => `Artifacts recharge ${r * 10}% faster`, costs: [26, 59, 104], apply: (s, r) => (s.artifactCdMult *= 1 - r * 0.1) },
          { id: 'precision', name: 'Precision', glyph: '✦', desc: (r) => `+${r * 3}% critical chance`, costs: [45, 90, 150], apply: (s, r) => addCrit(s, r * 0.03) },
        ],
      },
      {
        name: 'Blaze',
        level: 18,
        spend: 1300,
        ups: [
          { id: 'reflex', name: 'Fleet Shadow', glyph: '»', desc: (r) => `+${plural(r, 'Dash charge')}`, costs: [260], apply: (s, r) => (s.dashCharges += r) },
          { id: 'favor', name: 'Favor of the Gods', glyph: '✧', desc: (r) => `Boons are more often Rare or better: +${+(r * 3.25).toFixed(2)}% (not an escape's first boon)`, costs: [60, 120, 230] },
          { id: 'wrathful', name: 'Wrathful', glyph: '☄', desc: (r) => `Wrath fills ${r * 15}% faster`, costs: [70, 140, 230], apply: (s, r) => (s.wrathGain += r * 0.15) },
          { id: 'slayer', name: 'Giantslayer', glyph: '☠', desc: (r) => `+${r * 10}% damage to guardians and enchanted foes`, costs: [110, 220], apply: (s, r) => (s.bigGameDmg += r * 0.1) },
        ],
      },
      {
        name: 'Inferno',
        level: 26,
        spend: 2600,
        ups: [
          { id: 'godslayer', name: 'Godslayer', glyph: '⚡', desc: (r) => `+${r * 6}% damage and +${r * 10} max Health`, costs: [350, 700], apply: (s, r) => ((s.globalDmg += r * 0.06), (s.maxHp += r * 10)) },
          { id: 'defiance', name: 'Death’s Reprieve', glyph: '✚', desc: (r) => `Cheat death ${plural(r, 'time')} per escape`, costs: [900, 2000] },
        ],
      },
    ],
  },
  {
    name: 'The Deep Altar',
    blurb: 'Opened by completing the Altar of Ashes. Fewer upgrades, far stronger, far dearer.',
    sections: [
      {
        name: 'Smoulder',
        level: 30,
        spend: 0,
        ups: [
          { id: 'colossus', name: 'Colossus', glyph: '♥', desc: (r) => `+${r * 12} max Health`, costs: [400, 600, 850], apply: (s, r) => (s.maxHp += r * 12) },
          { id: 'warlord', name: 'Warlord', glyph: '⚔', desc: (r) => `+${r * 5}% damage`, costs: [450, 700, 1000], apply: (s, r) => (s.globalDmg += r * 0.05) },
          { id: 'midas', name: 'Ferryman’s Tithe', glyph: '◎', desc: (r) => `+${r * 20}% obols found`, costs: [300, 600], apply: (s, r) => (s.goldMult += r * 0.2) },
        ],
      },
      {
        name: 'Pyre',
        level: 36,
        spend: 3000,
        ups: [
          { id: 'echowell', name: 'Echo Well', glyph: '✧', desc: (r) => `Begin each escape with ${r * 40}% Echoes`, costs: [700, 1200], apply: (s, r) => (s.soulStart += r * 0.4) },
          { id: 'phantom', name: 'Phantom Step', glyph: '»', desc: (r) => `Dash recharges ${r * 15}% faster; Dash-Strike +${r * 15}% damage`, costs: [600, 1000], apply: (s, r) => ((s.dashRecharge *= 1 - r * 0.15), (s.dashStrikeBonus += r * 0.15)) },
          { id: 'titan', name: 'Titan’s Blood', glyph: '⛨', desc: (r) => `Take ${r * 4}% less damage`, costs: [600, 900, 1300], apply: (s, r) => (s.damageTaken *= 1 - r * 0.04) },
        ],
      },
      {
        name: 'Furnace',
        level: 42,
        spend: 7000,
        ups: [
          { id: 'ruin', name: 'Ruin', glyph: '✦', desc: (r) => `Critical hits deal +${r * 20}% damage`, costs: [1000, 1600], apply: (s, r) => (s.critMult += r * 0.2 * 3) },
          { id: 'arsenal', name: 'Deep Quiver', glyph: '◆', desc: (r) => `+${plural(r, 'Cast shard')}`, costs: [1400], apply: (s, r) => (s.castAmmo += r) },
          { id: 'exalted', name: 'Exalted Favor', glyph: '✧', desc: (r) => `Boons are more often Rare or better: a further +${+(r * 3.25).toFixed(2)}%`, costs: [900, 1400] },
        ],
      },
      {
        name: 'Heart of the Pyre',
        level: 48,
        spend: 12000,
        ups: [
          { id: 'ascendant', name: 'Ascendant', glyph: '⚡', desc: (r) => `+${r * 8}% damage and +${r * 15} max Health`, costs: [2500, 4000], apply: (s, r) => ((s.globalDmg += r * 0.08), (s.maxHp += r * 15)) },
          { id: 'undying', name: 'Undying', glyph: '✚', desc: (r) => `Cheat death ${plural(r, 'more time')} per escape`, costs: [5000] },
        ],
      },
    ],
  },
];

export const ALTAR_UPGRADES: AltarUpgrade[] = ALTAR.flatMap((t) => t.sections.flatMap((s) => s.ups));
export const ALTAR_BY_ID: Record<string, AltarUpgrade> = Object.fromEntries(ALTAR_UPGRADES.map((u) => [u.id, u]));

/** Where an upgrade sits: table and section index. */
export function altarPlace(id: string): { table: number; section: number } | null {
  for (let t = 0; t < ALTAR.length; t++) {
    for (let s = 0; s < ALTAR[t].sections.length; s++) if (ALTAR[t].sections[s].ups.some((u) => u.id === id)) return { table: t, section: s };
  }
  return null;
}

type Ranks = Record<string, number>;

export function rankOf(ranks: Ranks, id: string): number {
  return Math.min(ranks[id] ?? 0, ALTAR_BY_ID[id]?.costs.length ?? 0);
}

/** Ash spent on a section so far. */
export function spentOnSection(ranks: Ranks, table: number, section: number): number {
  let n = 0;
  for (const u of ALTAR[table].sections[section].ups) for (let i = 0; i < rankOf(ranks, u.id); i++) n += u.costs[i];
  return n;
}

/** Ash spent on a table's sections before `section`. */
export function spentBefore(ranks: Ranks, table: number, section: number): number {
  let n = 0;
  for (let s = 0; s < section; s++) n += spentOnSection(ranks, table, s);
  return n;
}

/** Every upgrade on a table at its last rank. */
export function tableComplete(ranks: Ranks, table: number): boolean {
  return ALTAR[table].sections.every((s) => s.ups.every((u) => rankOf(ranks, u.id) >= u.costs.length));
}

/** Whether a table can be used (the second opens once the first is complete). */
export function tableOpen(ranks: Ranks, table: number): boolean {
  return table === 0 || tableComplete(ranks, table - 1);
}

/** Whether a section is open, and if not, what it still needs. */
export function sectionState(ranks: Ranks, level: number, table: number, section: number): { open: boolean; needLevel: number; needSpend: number } {
  const sec = ALTAR[table].sections[section];
  const spent = spentBefore(ranks, table, section);
  const needLevel = Math.max(0, sec.level - level);
  const needSpend = Math.max(0, sec.spend - spent);
  return { open: tableOpen(ranks, table) && needLevel === 0 && needSpend === 0, needLevel, needSpend };
}

/** The Ash for an upgrade's next rank, or null when it's complete. */
export function nextAltarCost(ranks: Ranks, id: string): number | null {
  const u = ALTAR_BY_ID[id];
  if (!u) return null;
  const r = rankOf(ranks, id);
  return r < u.costs.length ? u.costs[r] : null;
}

/** Whether the next rank can be bought now (section open and Ash enough). */
export function canBuyAltar(ranks: Ranks, level: number, ash: number, id: string): boolean {
  const place = altarPlace(id);
  const cost = nextAltarCost(ranks, id);
  if (!place || cost === null || ash < cost) return false;
  return sectionState(ranks, level, place.table, place.section).open;
}

/** Applies every Altar upgrade to a stat block. */
export function applyAltar(ranks: Ranks, s: PlayerStats): void {
  for (const u of ALTAR_UPGRADES) {
    const r = rankOf(ranks, u.id);
    if (r > 0) u.apply?.(s, r);
  }
}

/** Extra lives per escape from the Altar. */
export function altarDefiance(ranks: Ranks): number {
  return rankOf(ranks, 'defiance') + rankOf(ranks, 'undying');
}

/** Ranks of better boon odds. */
export function altarFavor(ranks: Ranks): number {
  return rankOf(ranks, 'favor') + rankOf(ranks, 'exalted');
}

/** Total Ash for everything on the Altar. */
export function altarTotal(): number {
  return ALTAR_UPGRADES.reduce((n, u) => n + u.costs.reduce((a, b) => a + b, 0), 0);
}

/**
 * Before v0.9 levels gave talent points for a separate talent tree. Those
 * talents now live on the Altar: each rank carries over (free) where the
 * Altar has the same upgrade with room left; anything else comes back as Ash.
 * Upgrades above their new maximum are refunded too.
 */
export const TALENT_TO_ALTAR: Record<string, string> = {
  toughness: 'vitality',
  might: 'fury',
  swiftness: 'swiftness',
  fortitude: 'brewing',
  bloodlust: 'bloodlust',
  precision: 'precision',
  wrathful: 'wrathful',
  slayer: 'slayer',
  tinker: 'tinkerer',
  godslayer: 'godslayer',
  titan: 'titan',
  phantom: 'phantom',
  undying: 'undying',
};
const TALENT_REFUND = 40;
/** Old Altar prices, for refunding ranks above the new maximum. */
const OLD_COSTS: Record<string, number[]> = { defiance: [30, 70, 140], reflex: [60], vitality: [10, 20, 35, 55], fury: [15, 30, 50, 80] };

export function migrateTalents(upgrades: Ranks, talents: Ranks): { upgrades: Ranks; refund: number } {
  const out: Ranks = { ...upgrades };
  let refund = 0;
  // Ranks above the new maximum.
  for (const [id, r] of Object.entries(out)) {
    const u = ALTAR_BY_ID[id];
    if (!u) continue;
    if (r > u.costs.length) {
      const old = OLD_COSTS[id] ?? u.costs;
      for (let i = u.costs.length; i < r; i++) refund += old[i] ?? old[old.length - 1] ?? 0;
      out[id] = u.costs.length;
    }
  }
  for (const [tid, r] of Object.entries(talents)) {
    const target = TALENT_TO_ALTAR[tid];
    for (let i = 0; i < r; i++) {
      const u = target ? ALTAR_BY_ID[target] : undefined;
      if (u && (out[u.id] ?? 0) < u.costs.length) out[u.id] = (out[u.id] ?? 0) + 1;
      else refund += TALENT_REFUND;
    }
  }
  return { upgrades: out, refund };
}
