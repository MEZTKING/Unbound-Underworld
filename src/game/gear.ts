// Loot and gear (unlocks at level 10). Foes drop materials and, now and then,
// a piece of gear: a helmet, armor, leggings or boots with random bonuses.
// Gear comes in seven tiers, from Common to the near-mythical Ghost; Unique
// and Ghost pieces carry a perk of their own. Gear is kept between escapes,
// equipped at the Armory, and starred up (1–5 gold stars, then 5 more that
// turn purple) or salvaged with materials.

import type { Rng } from '../engine/math';
import type { PlayerStats } from './stats';

// ---------------------------------------------------------------- materials

export type MaterialId = 'bone' | 'ember' | 'ichor' | 'pearl' | 'scale';

export const MATERIALS: Record<MaterialId, { name: string; glyph: string; color: string; desc: string }> = {
  bone: { name: 'Bone Dust', glyph: '☗', color: '#e8e0d0', desc: 'Dropped by foes everywhere. The basic crafting material.' },
  ember: { name: 'Ember Shard', glyph: '♦', color: '#ff7a2a', desc: 'Dropped by foes in the Shackled Deep and the Ember Fields.' },
  ichor: { name: 'Golden Ichor', glyph: '✹', color: '#e8c860', desc: 'Dropped by foes in the Gilded Groves.' },
  pearl: { name: 'Gate Pearl', glyph: '●', color: '#b0a0ff', desc: 'Dropped by foes at the Last Gate.' },
  scale: { name: 'Titan Scale', glyph: '⬢', color: '#ff4a5a', desc: 'Dropped by guardians and enchanted foes. Rare.' },
};

export const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[];

/** The material a region's foes drop besides Bone Dust. */
export function regionMaterial(biomeIndex: number): MaterialId {
  return (['ember', 'ember', 'ichor', 'pearl'] as const)[Math.max(0, Math.min(3, biomeIndex))];
}

export type Materials = Partial<Record<MaterialId, number>>;

export function hasMaterials(have: Materials, cost: Materials): boolean {
  return (Object.keys(cost) as MaterialId[]).every((k) => (have[k] ?? 0) >= (cost[k] ?? 0));
}

export function spendMaterials(have: Materials, cost: Materials): boolean {
  if (!hasMaterials(have, cost)) return false;
  for (const k of Object.keys(cost) as MaterialId[]) have[k] = (have[k] ?? 0) - (cost[k] ?? 0);
  return true;
}

export function costText(cost: Materials): string {
  return (Object.keys(cost) as MaterialId[])
    .filter((k) => cost[k])
    .map((k) => `${cost[k]} ${MATERIALS[k].glyph}`)
    .join(' · ');
}

// ---------------------------------------------------------------- gear

export type GearSlot = 'helmet' | 'armor' | 'legs' | 'boots';
export const GEAR_SLOTS: GearSlot[] = ['helmet', 'armor', 'legs', 'boots'];
export const SLOT_NAME: Record<GearSlot, string> = { helmet: 'Helmet', armor: 'Armor', legs: 'Leggings', boots: 'Boots' };
export const SLOT_GLYPH: Record<GearSlot, string> = { helmet: '⛑', armor: '⛨', legs: '⧉', boots: '⚶' };

export type GearRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'unique' | 'ghost';
export const GEAR_RARITY: Record<GearRarity, { name: string; color: string; affixes: number; power: number }> = {
  common: { name: 'Common', color: '#d8d0c8', affixes: 1, power: 1 },
  uncommon: { name: 'Uncommon', color: '#7ad87a', affixes: 2, power: 1.15 },
  rare: { name: 'Rare', color: '#5ac8ff', affixes: 2, power: 1.3 },
  epic: { name: 'Epic', color: '#c86bff', affixes: 3, power: 1.55 },
  legendary: { name: 'Legendary', color: '#ffb14a', affixes: 4, power: 1.85 },
  unique: { name: 'Unique', color: '#ff5a7a', affixes: 4, power: 2.1 },
  ghost: { name: 'Ghost', color: '#9ff7ff', affixes: 5, power: 2.5 },
};
/** Tiers from worst to best. */
export const RARITY_ORDER = Object.keys(GEAR_RARITY) as GearRarity[];
export const rarityRank = (r: GearRarity) => RARITY_ORDER.indexOf(r);

// ---------------------------------------------------------------- perks

export type PerkId = 'breath' | 'fleet' | 'leech' | 'giantbane' | 'quiver' | 'keen' | 'artificer' | 'phantom' | 'wraith' | 'revenant' | 'ward';

interface PerkDef {
  name: string;
  /** Goes after the item's name: "Helm of …". */
  of: string;
  desc: string;
  ghost?: boolean;
  /** Extra Death Defiance granted at the start of each escape. */
  defiance?: number;
  apply: (s: PlayerStats) => void;
}

/** Unique pieces carry one of the first seven perks; Ghost pieces one of the last four. */
export const PERKS: Record<PerkId, PerkDef> = {
  breath: { name: 'Second Breath', of: 'Second Breath', desc: '+1 Death Defiance each escape.', defiance: 1, apply: () => {} },
  fleet: { name: 'Fleetfoot', of: 'the Fleetfoot', desc: '+1 dash charge.', apply: (s) => (s.dashCharges += 1) },
  leech: { name: 'Leech', of: 'the Leech', desc: 'Heal 2 health for every foe slain.', apply: (s) => (s.lifeOnKill += 2) },
  giantbane: { name: 'Giantbane', of: 'Giantbane', desc: '+25% damage to guardians and enchanted foes.', apply: (s) => (s.bigGameDmg += 0.25) },
  quiver: { name: 'Deep Quiver', of: 'the Deep Quiver', desc: '+1 cast shard.', apply: (s) => (s.castAmmo += 1) },
  keen: { name: 'Keen Edge', of: 'Keen Edges', desc: 'Critical hits deal +50% more damage.', apply: (s) => (s.critMult += 0.5) },
  artificer: { name: 'Artificer', of: 'the Artificer', desc: 'Artifacts recharge 20% faster.', apply: (s) => (s.artifactCdMult *= 0.8) },
  phantom: {
    name: 'Phantom Step',
    of: 'the Phantom Step',
    desc: '+1 dash charge and dashes recharge 25% faster.',
    ghost: true,
    apply: (s) => {
      s.dashCharges += 1;
      s.dashRecharge *= 0.75;
    },
  },
  wraith: {
    name: 'Wraithblood',
    of: 'Wraithblood',
    desc: 'Heal 4 health for every foe slain, and +15% damage.',
    ghost: true,
    apply: (s) => {
      s.lifeOnKill += 4;
      s.globalDmg += 0.15;
    },
  },
  revenant: {
    name: 'Revenant',
    of: 'the Revenant',
    desc: '+1 Death Defiance and +20 max health.',
    ghost: true,
    defiance: 1,
    apply: (s) => (s.maxHp += 20),
  },
  ward: {
    name: 'Spectral Ward',
    of: 'the Spectral Ward',
    desc: 'Take 15% less damage and move 10% faster.',
    ghost: true,
    apply: (s) => {
      s.damageTaken *= 0.85;
      s.moveSpeed += 0.1;
    },
  },
};
const UNIQUE_PERKS = (Object.keys(PERKS) as PerkId[]).filter((k) => !PERKS[k].ghost);
const GHOST_PERKS = (Object.keys(PERKS) as PerkId[]).filter((k) => PERKS[k].ghost);

export type AffixId = 'health' | 'damage' | 'speed' | 'crit' | 'guard' | 'dash' | 'gold' | 'souls' | 'wrath' | 'potion';

interface AffixDef {
  name: (v: number) => string;
  /** Value of a common, level-1 roll. */
  base: number;
  /** Slots it can roll on (all when omitted). */
  slots?: GearSlot[];
  apply: (s: PlayerStats, v: number) => void;
  /** Values are shown as whole numbers (health) rather than percentages. */
  flat?: boolean;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const AFFIXES: Record<AffixId, AffixDef> = {
  health: { name: (v) => `+${Math.round(v)} max health`, base: 8, flat: true, apply: (s, v) => (s.maxHp += Math.round(v)) },
  damage: { name: (v) => `+${pct(v)} damage`, base: 0.04, apply: (s, v) => (s.globalDmg += v) },
  speed: { name: (v) => `+${pct(v)} move speed`, base: 0.03, slots: ['legs', 'boots'], apply: (s, v) => (s.moveSpeed += v) },
  crit: {
    name: (v) => `+${pct(v)} critical chance`,
    base: 0.02,
    slots: ['helmet', 'armor'],
    apply: (s, v) => {
      for (const k of ['attack', 'special', 'cast', 'dash'] as const) s.critChance[k] += v;
    },
  },
  guard: { name: (v) => `−${pct(v)} damage taken`, base: 0.03, slots: ['armor', 'legs', 'helmet'], apply: (s, v) => (s.damageTaken *= 1 - v) },
  dash: { name: (v) => `−${pct(v)} dash recharge`, base: 0.06, slots: ['boots'], apply: (s, v) => (s.dashRecharge *= 1 - v) },
  gold: { name: (v) => `+${pct(v)} obols found`, base: 0.06, apply: (s, v) => (s.goldMult += v) },
  souls: { name: (v) => `+${pct(v)} souls gathered`, base: 0.08, slots: ['helmet', 'armor'], apply: (s, v) => (s.soulGain += v) },
  wrath: { name: (v) => `+${pct(v)} Wrath gain`, base: 0.06, slots: ['helmet'], apply: (s, v) => (s.wrathGain += v) },
  potion: { name: (v) => `+${pct(v)} potion healing`, base: 0.06, slots: ['armor'], apply: (s, v) => (s.potionHeal += v) },
};

export interface GearItem {
  uid: string;
  slot: GearSlot;
  rarity: GearRarity;
  name: string;
  /**
   * Star level (1..MAX_GEAR_LEVEL). Levels 1–5 show as gold stars; 6–10 turn
   * them purple one by one. Gold stars add 15% to every bonus, purple 20%.
   */
  level: number;
  /** Bonuses as multiples of their base value (rolled 0.8–1.25, then scaled by rarity). */
  affixes: { id: AffixId; roll: number }[];
  /** Unique and Ghost pieces only. */
  perk?: PerkId;
}

export const MAX_GEAR_LEVEL = 10;
/** Stars a piece shows: `gold` and `purple` out of five. */
export function gearStars(level: number): { gold: number; purple: number } {
  const l = Math.max(1, Math.min(MAX_GEAR_LEVEL, level));
  return l <= 5 ? { gold: l, purple: 0 } : { gold: 10 - l, purple: l - 5 };
}
/** How much a piece's star level multiplies its bonuses. */
export function levelMult(level: number): number {
  return 1 + Math.min(4, level - 1) * 0.15 + Math.max(0, level - 5) * 0.2;
}
export const INVENTORY_SIZE = 40;

const NAMES: Record<GearSlot, string[]> = {
  helmet: ['Hood', 'Helm', 'Circlet', 'Crown', 'Visor', 'Cowl'],
  armor: ['Cuirass', 'Robe', 'Hauberk', 'Breastplate', 'Mantle', 'Vest'],
  legs: ['Greaves', 'Leggings', 'Tassets', 'Breeches', 'Chausses'],
  boots: ['Sandals', 'Boots', 'Sabatons', 'Treads', 'Striders'],
};
const PREFIX = ['Ashen', 'Bronze', 'Gilded', 'Ember', 'Shade', 'Bone', 'Starlit', 'Titan', 'Stygian', 'Thorned', 'Hallowed', 'Grim'];

export function affixValue(item: GearItem, i: number): number {
  const a = item.affixes[i];
  return AFFIXES[a.id].base * a.roll * GEAR_RARITY[item.rarity].power * levelMult(item.level);
}

export function describeAffix(item: GearItem, i: number): string {
  return AFFIXES[item.affixes[i].id].name(affixValue(item, i));
}

/** Tier weights with no luck, and how much full luck multiplies each (×1 + luck × boost). */
const TIER_WEIGHT = { common: 0.5, uncommon: 0.28, rare: 0.14, epic: 0.055, legendary: 0.025 };
const TIER_LUCK = { common: 0, uncommon: 0.5, rare: 1.5, epic: 3, legendary: 5 };

/**
 * The chance of each tier for a given luck (0..1). Each tier is rarer than
 * the one below it whatever the luck; luck moves odds from Common to the
 * better tiers, the best ones most. Ghost stays the hardest to find: 0.3%,
 * 1% at best.
 */
export function rarityOdds(luck = 0): Record<GearRarity, number> {
  const ghost = 0.003 + luck * 0.007;
  const unique = 0.015 + luck * 0.02;
  const rest = 1 - ghost - unique;
  const tiers = Object.keys(TIER_WEIGHT) as (keyof typeof TIER_WEIGHT)[];
  const w = tiers.map((k) => TIER_WEIGHT[k] * (1 + luck * TIER_LUCK[k]));
  const sum = w.reduce((a, b) => a + b, 0);
  const odds = { unique, ghost } as Record<GearRarity, number>;
  tiers.forEach((k, i) => (odds[k] = (w[i] / sum) * rest));
  return odds;
}

/** Rolls a piece of gear. `luck` (0..1) raises the chance of better rarities. */
export function rollGear(rng: Rng, luck = 0, slot?: GearSlot, minRarity: GearRarity = 'common'): GearItem {
  const s = slot ?? rng.pick(GEAR_SLOTS);
  const odds = rarityOdds(luck);
  let r = rng.next();
  let rarity: GearRarity = 'common';
  for (const k of [...RARITY_ORDER].reverse()) {
    if (r < odds[k]) {
      rarity = k;
      break;
    }
    r -= odds[k];
  }
  if (rarityRank(rarity) < rarityRank(minRarity)) rarity = minRarity;
  const pool = (Object.keys(AFFIXES) as AffixId[]).filter((id) => !AFFIXES[id].slots || AFFIXES[id].slots!.includes(s));
  const affixes: GearItem['affixes'] = [];
  for (let i = 0; i < GEAR_RARITY[rarity].affixes && pool.length; i++) {
    const id = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    affixes.push({ id, roll: Math.round((0.8 + rng.next() * 0.45) * 100) / 100 });
  }
  const perk = rarity === 'ghost' ? rng.pick(GHOST_PERKS) : rarity === 'unique' ? rng.pick(UNIQUE_PERKS) : undefined;
  const noun = rng.pick(NAMES[s]);
  const name = rarity === 'ghost' ? `Ghostly ${noun} of ${PERKS[perk!].of}` : rarity === 'unique' ? `${noun} of ${PERKS[perk!].of}` : `${rng.pick(PREFIX)} ${noun}`;
  return {
    uid: `${Date.now().toString(36)}${Math.floor(rng.next() * 1e9).toString(36)}`,
    slot: s,
    rarity,
    name,
    level: 1,
    affixes,
    ...(perk ? { perk } : {}),
  };
}

/** Adds the equipped gear's bonuses to the stats. */
export function applyGear(items: (GearItem | undefined)[], s: PlayerStats): void {
  for (const item of items) {
    if (!item) continue;
    item.affixes.forEach((a, i) => AFFIXES[a.id]?.apply(s, affixValue(item, i)));
    if (item.perk) PERKS[item.perk]?.apply(s);
  }
}

/** Death Defiance that equipped perks add to each escape. */
export function gearDefiance(items: (GearItem | undefined)[]): number {
  return items.reduce((n, i) => n + ((i?.perk && PERKS[i.perk]?.defiance) || 0), 0);
}

/** Materials to raise an item one star. Purple stars (6–10) also take Titan Scales. */
export function upgradeCost(item: GearItem): Materials {
  const k = item.level;
  const t = rarityRank(item.rarity);
  const cost: Materials = { bone: 6 * k };
  if (t === 1) cost.ember = k;
  else if (t === 2) cost.ember = 2 * k;
  else if (t === 3) (cost.ichor = 2 * k), (cost.scale = k);
  else if (t >= 4) (cost.pearl = 2 * k), (cost.scale = k);
  if (k >= 5) cost.scale = (cost.scale ?? 0) + (k - 4);
  return cost;
}

/** Materials returned by salvaging an item. */
export function salvageValue(item: GearItem): Materials {
  const r = rarityRank(item.rarity);
  return { bone: 3 + r * 3 + item.level * 2, ...(r >= 3 ? { scale: r - 2 + (item.level > 5 ? item.level - 5 : 0) } : {}) };
}

/** Crafting recipes: a random piece of at least this rarity. */
export const CRAFTS: { name: string; min: GearRarity; cost: Materials }[] = [
  { name: 'Craft a piece', min: 'common', cost: { bone: 25, ember: 6 } },
  { name: 'Craft a fine piece', min: 'rare', cost: { bone: 40, ichor: 6 } },
  { name: 'Craft a grand piece', min: 'epic', cost: { bone: 60, pearl: 6, scale: 3 } },
  { name: 'Craft a masterwork', min: 'legendary', cost: { bone: 120, pearl: 14, scale: 10 } },
];
export const CRAFT_COST = CRAFTS[0].cost;

/** A save's gear: what's owned and what's equipped (by uid). */
export interface GearState {
  items: GearItem[];
  equipped: Partial<Record<GearSlot, string>>;
}

export function equippedItems(g: GearState): GearItem[] {
  return GEAR_SLOTS.map((s) => g.items.find((i) => i.uid === g.equipped[s])).filter((i): i is GearItem => !!i);
}

/** Validates gear loaded from a save. */
export function normalizeGear(raw: unknown): GearState {
  const r = (raw ?? {}) as Partial<GearState>;
  const items = Array.isArray(r.items)
    ? r.items.filter(
        (i): i is GearItem =>
          !!i && typeof i.uid === 'string' && GEAR_SLOTS.includes(i.slot) && i.rarity in GEAR_RARITY && Array.isArray(i.affixes) && i.affixes.every((a) => a.id in AFFIXES),
      )
    : [];
  for (const i of items) {
    i.level = Math.max(1, Math.min(MAX_GEAR_LEVEL, Math.round(Number(i.level) || 1)));
    if (i.perk && !(i.perk in PERKS)) delete i.perk;
  }
  const equipped: GearState['equipped'] = {};
  for (const s of GEAR_SLOTS) {
    const uid = r.equipped?.[s];
    if (uid && items.some((i) => i.uid === uid && i.slot === s)) equipped[s] = uid;
  }
  return { items, equipped };
}
