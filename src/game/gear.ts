// Loot and gear. Foes drop materials and, now and then, a piece of gear: a
// helmet, armor, leggings or boots with random bonuses. Gear comes in seven
// tiers, from Common to the near-mythical Ghost; Unique and Ghost pieces carry
// a perk of their own. Common and Uncommon pieces are plain: no stars, and
// they can't be starred up. Rare and better pieces drop with stars (each star
// half as likely as the one before, capped by your level) and are starred up
// with materials (1–5 gold stars, then 5 more that turn purple). Gear is kept
// between escapes, equipped at the Armory, and salvaged for materials.

import type { Rng } from '../engine/math';
import { GHOST_STARS, PLAIN_TIER, STAR_CHANCE, STARRED_TIER, type DropSource } from './odds';
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
   * Star level (0..MAX_GEAR_LEVEL). 0 = a plain piece (Common, Uncommon).
   * Levels 1–5 show as gold stars; 6–10 turn them purple one by one. Stars
   * past the first add 15% to every bonus (gold) or 20% (purple).
   */
  level: number;
  /** Bonuses as multiples of their base value (rolled 0.8–1.25, Ghost 1–1.25, then scaled by rarity). */
  affixes: { id: AffixId; roll: number }[];
  /** Unique and Ghost pieces only. */
  perk?: PerkId;
}

export const MAX_GEAR_LEVEL = 10;
/** Rare and better pieces carry stars; Common and Uncommon are plain. */
export function isStarredTier(r: GearRarity): boolean {
  return rarityRank(r) >= rarityRank('rare');
}
/** Whether a piece can be starred up (plain pieces never can). */
export function canStarUp(item: GearItem): boolean {
  return isStarredTier(item.rarity) && item.level < MAX_GEAR_LEVEL;
}
/** Stars a piece shows: `gold` and `purple` out of five (none for a plain piece). */
export function gearStars(level: number): { gold: number; purple: number } {
  const l = Math.max(0, Math.min(MAX_GEAR_LEVEL, level));
  return l <= 5 ? { gold: l, purple: 0 } : { gold: 10 - l, purple: l - 5 };
}
/** How much a piece's star level multiplies its bonuses (plain and 1-star pieces: ×1). */
export function levelMult(level: number): number {
  return 1 + Math.max(0, Math.min(4, level - 1)) * 0.15 + Math.max(0, level - 5) * 0.2;
}
/** The most stars a dropped piece can carry at a player level: 1, +1 every 3 levels. */
export function maxDropStars(playerLevel: number): number {
  return Math.max(1, Math.min(MAX_GEAR_LEVEL, 1 + Math.floor(playerLevel / 3)));
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

/**
 * Star odds of a drop: index k = the chance of k stars (index 0 = a plain
 * piece). The first star has STAR_CHANCE[source]; each further star is half
 * as likely; stars stop at the cap your level sets. Sources that always drop
 * starred pieces (guardians) spread the whole chance the same way.
 */
export function starOdds(source: DropSource, playerLevel: number): number[] {
  const cap = maxDropStars(playerLevel);
  const base = STAR_CHANCE[source];
  const w = Array.from({ length: cap }, (_, i) => base * 0.5 ** i);
  const sum = w.reduce((a, b) => a + b, 0);
  const starred = Math.min(1, sum);
  return [1 - starred, ...w.map((v) => (v / sum) * starred)];
}

function pickTier(rng: Rng, odds: Partial<Record<GearRarity, number>>): GearRarity {
  const keys = Object.keys(odds) as GearRarity[];
  let r = rng.next() * keys.reduce((a, k) => a + (odds[k] ?? 0), 0);
  for (const k of keys) {
    r -= odds[k] ?? 0;
    if (r < 0) return k;
  }
  return keys[keys.length - 1];
}

function rollStars(rng: Rng, odds: number[]): number {
  let r = rng.next();
  for (let k = 0; k < odds.length; k++) {
    r -= odds[k];
    if (r < 0) return k;
  }
  return odds.length - 1;
}

/**
 * A piece dropped by a foe, an enchanted foe, a chest or a guardian: plain
 * (Common/Uncommon, no stars) unless it rolls a star; starred pieces take
 * their tier from the source (Legendary only from guardians).
 */
export function rollDrop(rng: Rng, source: DropSource, playerLevel: number, slot?: GearSlot): GearItem {
  const stars = rollStars(rng, starOdds(source, playerLevel));
  const rarity = stars === 0 ? pickTier(rng, PLAIN_TIER) : pickTier(rng, STARRED_TIER[source]);
  return makeGear(rng, rarity, stars, slot);
}

/** A starred piece of a set tier, its stars rolled as a guardian's drop. */
export function rollStarred(rng: Rng, rarity: GearRarity, playerLevel: number): GearItem {
  const stars = Math.max(1, rollStars(rng, starOdds(GHOST_STARS, playerLevel)));
  return makeGear(rng, rarity, stars);
}

/** A Ghost piece (any foe can drop one): always starred, stars as a guardian's. */
export function rollGhost(rng: Rng, playerLevel: number): GearItem {
  return rollStarred(rng, 'ghost', playerLevel);
}

/** A crafted piece: plain recipes give Common/Uncommon, the others a 1-star piece of their tier. */
export function craftGear(rng: Rng, recipe: (typeof CRAFTS)[number]): GearItem {
  const rarity = pickTier(rng, recipe.tiers);
  return makeGear(rng, rarity, isStarredTier(rarity) ? 1 : 0);
}

/**
 * Lowest bonus roll for a tier (rolls run up to 1.25). Ghost bonuses never
 * roll low: its weakest bonus still beats the best a Legendary can roll.
 */
export function minRoll(rarity: GearRarity): number {
  return rarity === 'ghost' ? 1 : 0.8;
}

/** Builds a piece of a given tier and star level. */
export function makeGear(rng: Rng, rarity: GearRarity, stars: number, slot?: GearSlot): GearItem {
  const s = slot ?? rng.pick(GEAR_SLOTS);
  const pool = (Object.keys(AFFIXES) as AffixId[]).filter((id) => !AFFIXES[id].slots || AFFIXES[id].slots!.includes(s));
  const affixes: GearItem['affixes'] = [];
  for (let i = 0; i < GEAR_RARITY[rarity].affixes && pool.length; i++) {
    const id = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    affixes.push({ id, roll: Math.round((minRoll(rarity) + rng.next() * (1.25 - minRoll(rarity))) * 100) / 100 });
  }
  const perk = rarity === 'ghost' ? rng.pick(GHOST_PERKS) : rarity === 'unique' ? rng.pick(UNIQUE_PERKS) : undefined;
  const noun = rng.pick(NAMES[s]);
  const name = rarity === 'ghost' ? `Ghostly ${noun} of ${PERKS[perk!].of}` : rarity === 'unique' ? `${noun} of ${PERKS[perk!].of}` : `${rng.pick(PREFIX)} ${noun}`;
  return {
    uid: `${Date.now().toString(36)}${Math.floor(rng.next() * 1e9).toString(36)}`,
    slot: s,
    rarity,
    name,
    level: isStarredTier(rarity) ? Math.max(1, Math.min(MAX_GEAR_LEVEL, stars)) : 0,
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

/** Crafting recipes: the tiers each can make. Legendary pieces can't be crafted (guardians only). */
export const CRAFTS: { name: string; tiers: Partial<Record<GearRarity, number>>; cost: Materials }[] = [
  { name: 'Craft a plain piece', tiers: { common: 0.7, uncommon: 0.3 }, cost: { bone: 25, ember: 6 } },
  { name: 'Craft a fine piece (1★ Rare)', tiers: { rare: 1 }, cost: { bone: 40, ichor: 6 } },
  { name: 'Craft a grand piece (1★ Epic)', tiers: { epic: 1 }, cost: { bone: 60, pearl: 6, scale: 3 } },
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
    // Plain pieces carry no stars (older saves gave them one); starred ones at least one.
    const lv = Math.round(Number(i.level) || 0);
    i.level = isStarredTier(i.rarity) ? Math.max(1, Math.min(MAX_GEAR_LEVEL, lv)) : Math.max(0, Math.min(MAX_GEAR_LEVEL, lv > 1 ? lv : 0));
    if (i.perk && !(i.perk in PERKS)) delete i.perk;
  }
  const equipped: GearState['equipped'] = {};
  for (const s of GEAR_SLOTS) {
    const uid = r.equipped?.[s];
    if (uid && items.some((i) => i.uid === uid && i.slot === s)) equipped[s] = uid;
  }
  return { items, equipped };
}
