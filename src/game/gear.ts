// Loot and gear (unlocks at level 10). Foes drop materials and, now and then,
// a piece of gear: a helmet, armor, leggings or boots with random bonuses.
// Gear is kept between escapes, equipped at the Armory, and upgraded or
// salvaged with materials.

import type { Rng } from '../engine/math';
import type { PlayerStats } from './stats';

// ---------------------------------------------------------------- materials

export type MaterialId = 'bone' | 'ember' | 'ichor' | 'pearl' | 'scale';

export const MATERIALS: Record<MaterialId, { name: string; glyph: string; color: string; desc: string }> = {
  bone: { name: 'Bone Dust', glyph: '☗', color: '#e8e0d0', desc: 'Dropped by foes everywhere. The basic crafting material.' },
  ember: { name: 'Ember Shard', glyph: '♦', color: '#ff7a2a', desc: 'Dropped by foes in Tartarus and Asphodel.' },
  ichor: { name: 'Golden Ichor', glyph: '✹', color: '#e8c860', desc: 'Dropped by foes in Elysium.' },
  pearl: { name: 'Styx Pearl', glyph: '●', color: '#b0a0ff', desc: 'Dropped by foes at the Gates of the Styx.' },
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

export type GearRarity = 'common' | 'rare' | 'epic' | 'legendary';
export const GEAR_RARITY: Record<GearRarity, { name: string; color: string; affixes: number; power: number }> = {
  common: { name: 'Common', color: '#d8d0c8', affixes: 1, power: 1 },
  rare: { name: 'Rare', color: '#5ac8ff', affixes: 2, power: 1.3 },
  epic: { name: 'Epic', color: '#c86bff', affixes: 3, power: 1.6 },
  legendary: { name: 'Legendary', color: '#ffb14a', affixes: 4, power: 2 },
};

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
  /** Upgrade level (1..MAX_GEAR_LEVEL): each level adds 15% to every bonus. */
  level: number;
  /** Bonuses as multiples of their base value (rolled 0.8–1.25, then scaled by rarity). */
  affixes: { id: AffixId; roll: number }[];
}

export const MAX_GEAR_LEVEL = 5;
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
  return AFFIXES[a.id].base * a.roll * GEAR_RARITY[item.rarity].power * (1 + (item.level - 1) * 0.15);
}

export function describeAffix(item: GearItem, i: number): string {
  return AFFIXES[item.affixes[i].id].name(affixValue(item, i));
}

/** Rolls a piece of gear. `luck` (0..1) raises the chance of better rarities. */
export function rollGear(rng: Rng, luck = 0, slot?: GearSlot, minRarity: GearRarity = 'common'): GearItem {
  const s = slot ?? rng.pick(GEAR_SLOTS);
  const r = rng.next() - luck * 0.25;
  let rarity: GearRarity = r < 0.04 ? 'legendary' : r < 0.16 ? 'epic' : r < 0.45 ? 'rare' : 'common';
  const order: GearRarity[] = ['common', 'rare', 'epic', 'legendary'];
  if (order.indexOf(rarity) < order.indexOf(minRarity)) rarity = minRarity;
  const pool = (Object.keys(AFFIXES) as AffixId[]).filter((id) => !AFFIXES[id].slots || AFFIXES[id].slots!.includes(s));
  const affixes: GearItem['affixes'] = [];
  for (let i = 0; i < GEAR_RARITY[rarity].affixes && pool.length; i++) {
    const id = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    affixes.push({ id, roll: Math.round((0.8 + rng.next() * 0.45) * 100) / 100 });
  }
  return {
    uid: `${Date.now().toString(36)}${Math.floor(rng.next() * 1e9).toString(36)}`,
    slot: s,
    rarity,
    name: `${rng.pick(PREFIX)} ${rng.pick(NAMES[s])}`,
    level: 1,
    affixes,
  };
}

/** Adds the equipped gear's bonuses to the stats. */
export function applyGear(items: (GearItem | undefined)[], s: PlayerStats): void {
  for (const item of items) {
    if (!item) continue;
    item.affixes.forEach((a, i) => AFFIXES[a.id]?.apply(s, affixValue(item, i)));
  }
}

/** Materials to raise an item one level. */
export function upgradeCost(item: GearItem): Materials {
  const k = item.level;
  const extra: Materials =
    item.rarity === 'legendary' ? { pearl: 2 * k, scale: k } : item.rarity === 'epic' ? { ichor: 2 * k, scale: k } : item.rarity === 'rare' ? { ember: 2 * k } : {};
  return { bone: 6 * k, ...extra };
}

/** Materials returned by salvaging an item. */
export function salvageValue(item: GearItem): Materials {
  const order: GearRarity[] = ['common', 'rare', 'epic', 'legendary'];
  const r = order.indexOf(item.rarity);
  return { bone: 3 + r * 3 + item.level * 2, ...(r >= 2 ? { scale: r - 1 } : {}) };
}

/** Crafting recipes: a random piece of at least this rarity. */
export const CRAFTS: { name: string; min: GearRarity; cost: Materials }[] = [
  { name: 'Craft a piece', min: 'common', cost: { bone: 25, ember: 6 } },
  { name: 'Craft a fine piece', min: 'rare', cost: { bone: 40, ichor: 6 } },
  { name: 'Craft a grand piece', min: 'epic', cost: { bone: 60, pearl: 6, scale: 3 } },
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
  const equipped: GearState['equipped'] = {};
  for (const s of GEAR_SLOTS) {
    const uid = r.equipped?.[s];
    if (uid && items.some((i) => i.uid === uid && i.slot === s)) equipped[s] = uid;
  }
  return { items, equipped };
}
