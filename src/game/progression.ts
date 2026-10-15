import type { PlayerStats } from './stats';
import type { WeaponId } from './types';

// ---------------------------------------------------------------- levels & tiers

/**
 * Your shade's level. Experience comes from slain foes, cleared chambers and
 * guardians, carries over between runs, and gates both new mechanics (so the
 * first runs start simple) and talent points.
 */
export const MAX_LEVEL = 30;

/** Experience needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(60 + (level - 1) * 45 + (level - 1) ** 2 * 3);
}

/** Level and progress within it for a total amount of experience. */
export function levelFromXp(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp));
  while (level < MAX_LEVEL && rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, into: level >= MAX_LEVEL ? 0 : rest, need: level >= MAX_LEVEL ? 0 : xpToNext(level) };
}

/** Total experience at the start of a level. */
export function xpForLevel(level: number): number {
  let xp = 0;
  for (let l = 1; l < level; l++) xp += xpToNext(l);
  return xp;
}

export interface Tier {
  name: string;
  level: number;
  color: string;
}

/** Rank names shown next to your level. Each one opens a new row of talents. */
export const TIERS: Tier[] = [
  { name: 'Shade', level: 1, color: '#c8b8c0' },
  { name: 'Wraith', level: 5, color: '#7fe8ff' },
  { name: 'Revenant', level: 10, color: '#9dff9a' },
  { name: 'Champion', level: 15, color: '#ffd04a' },
  { name: 'Unbound', level: 20, color: '#ff6a7a' },
];

export function tierFor(level: number): Tier {
  let t = TIERS[0];
  for (const tier of TIERS) if (level >= tier.level) t = tier;
  return t;
}

/** Experience rewards. */
export const XP = {
  kill: 3,
  eliteKill: 8,
  room: 12,
  boss: 120,
  escape: 250,
};

/** Wrath needed for one ultimate, and Wrath per point of damage dealt and taken. */
export const WRATH_MAX = 100;
export const WRATH_PER_DEALT = 1 / 32;
export const WRATH_PER_TAKEN = 0.8;

// ---------------------------------------------------------------- feature unlocks

export type Feature = 'potion' | 'cast' | 'jump' | 'artifacts' | 'enchants' | 'anvil' | 'artifact2' | 'wrath' | 'artifact3' | 'forgeAwaken';

export interface Unlock {
  level: number;
  feature: Feature;
  title: string;
  desc: string;
  /** Short control hint, by input type. */
  keys?: { pc: string; touch: string };
}

/** What each level opens up. The first runs only have Attack, Special and Dash. */
export const UNLOCKS: Unlock[] = [
  { level: 2, feature: 'potion', title: 'Healing Potion', desc: 'Drink to restore health. It refills over time.', keys: { pc: 'R', touch: '⚗' } },
  { level: 3, feature: 'cast', title: 'Cast', desc: 'Hurl a shard that lodges in foes. Walk over it to pick it up again.', keys: { pc: 'Q / Middle mouse', touch: '◆' } },
  { level: 4, feature: 'artifacts', title: 'Artifacts', desc: 'One artifact slot. Find artifacts in the Underworld or pick one at the Artifact Shelf.', keys: { pc: '1', touch: 'the artifact button' } },
  { level: 5, feature: 'jump', title: 'Jump & Slam', desc: 'Leap over lava, chasms and shockwaves. Attack mid-air to Slam the ground.', keys: { pc: 'Shift / C', touch: '⤒' } },
  { level: 6, feature: 'enchants', title: 'Enchantments', desc: 'Enchanting Tomes now appear behind doors and in chests.' },
  { level: 7, feature: 'anvil', title: "Hephaestus' Anvil", desc: 'Anvils that reforge your weapon now appear in the Underworld.' },
  { level: 8, feature: 'artifact2', title: 'Second Artifact Slot', desc: 'Carry two artifacts at once.', keys: { pc: '2', touch: 'the artifact button' } },
  { level: 10, feature: 'wrath', title: 'Wrath', desc: "Fill the golden gauge by dealing and taking damage, then unleash your hero's ultimate.", keys: { pc: 'F', touch: '☄' } },
  { level: 12, feature: 'artifact3', title: 'Third Artifact Slot', desc: 'Carry three artifacts at once.', keys: { pc: '3', touch: 'the artifact button' } },
  { level: 13, feature: 'forgeAwaken', title: 'Awakened Weapons', desc: 'Forge a weapon to Tier III at the Armory to awaken it.' },
];

/**
 * Whether a mechanic is available. Jump also unlocks early for anyone who has
 * already slain the final guardian (`escaped`).
 */
export function hasFeature(level: number, f: Feature, escaped = false): boolean {
  if (f === 'jump' && escaped) return true;
  const u = UNLOCKS.find((x) => x.feature === f);
  return !u || level >= u.level;
}

export function unlocksAt(level: number): Unlock[] {
  return UNLOCKS.filter((u) => u.level === level);
}

export function artifactSlots(level: number): number {
  return hasFeature(level, 'artifact3') ? 3 : hasFeature(level, 'artifact2') ? 2 : hasFeature(level, 'artifacts') ? 1 : 0;
}

/** Turns level-gated features on or off in a stat block. */
export function applyFeatures(level: number, s: PlayerStats, escaped = false): void {
  s.canPotion = hasFeature(level, 'potion');
  s.canCast = hasFeature(level, 'cast');
  s.canJump = hasFeature(level, 'jump', escaped);
  s.canWrath = hasFeature(level, 'wrath');
  s.artifactSlots = artifactSlots(level);
  if (!s.canCast) s.castAmmo = 0;
}

// ---------------------------------------------------------------- talents

export interface TalentDef {
  id: string;
  name: string;
  glyph: string;
  /** Row of the tree; needs the matching tier's level. */
  tier: number;
  max: number;
  desc: (rank: number) => string;
  apply: (s: PlayerStats, rank: number) => void;
}

/** Talents bought with points from levelling up. One point per level. */
export const TALENTS: TalentDef[] = [
  // Shade
  { id: 'toughness', name: 'Toughness', glyph: '♥', tier: 0, max: 5, desc: (r) => `+${r * 6} max Health`, apply: (s, r) => (s.maxHp += r * 6) },
  { id: 'might', name: 'Might', glyph: '⚔', tier: 0, max: 5, desc: (r) => `+${r * 3}% damage`, apply: (s, r) => (s.globalDmg += r * 0.03) },
  { id: 'swiftness', name: 'Swiftness', glyph: '➶', tier: 0, max: 3, desc: (r) => `+${r * 4}% move speed`, apply: (s, r) => (s.moveSpeed += r * 0.04) },
  // Wraith
  { id: 'fortitude', name: 'Second Wind', glyph: '⚗', tier: 1, max: 3, desc: (r) => `Potion heals +${r * 8}% and recharges ${r * 10}% faster`, apply: (s, r) => ((s.potionHeal += r * 0.08), (s.potionCooldown *= 1 - r * 0.1)) },
  { id: 'shardcraft', name: 'Shardcraft', glyph: '◆', tier: 1, max: 3, desc: (r) => `Cast deals +${r * 20}% damage`, apply: (s, r) => (s.dmgBonus.cast += r * 0.2) },
  { id: 'bloodlust', name: 'Bloodlust', glyph: '✚', tier: 1, max: 3, desc: (r) => `Restore ${r} Health per foe slain`, apply: (s, r) => (s.lifeOnKill += r) },
  // Revenant
  { id: 'precision', name: 'Precision', glyph: '✦', tier: 2, max: 3, desc: (r) => `+${r * 3}% critical chance`, apply: (s, r) => addCrit(s, r * 0.03) },
  { id: 'phantom', name: 'Phantom Step', glyph: '»', tier: 2, max: 2, desc: (r) => `Dash recharges ${r * 15}% faster; Dash-Strike +${r * 15}% damage`, apply: (s, r) => ((s.dashRecharge *= 1 - r * 0.15), (s.dashStrikeBonus += r * 0.15)) },
  { id: 'wrathful', name: 'Wrathful', glyph: '☄', tier: 2, max: 3, desc: (r) => `Wrath fills ${r * 15}% faster`, apply: (s, r) => (s.wrathGain += r * 0.15) },
  // Champion
  { id: 'titan', name: "Titan's Blood", glyph: '⛨', tier: 3, max: 3, desc: (r) => `Take ${r * 4}% less damage`, apply: (s, r) => (s.damageTaken *= 1 - r * 0.04) },
  { id: 'slayer', name: 'Giantslayer', glyph: '☠', tier: 3, max: 3, desc: (r) => `+${r * 10}% damage to guardians and enchanted foes`, apply: (s, r) => (s.bigGameDmg += r * 0.1) },
  { id: 'tinker', name: 'Relic Lore', glyph: '⚙', tier: 3, max: 2, desc: (r) => `Artifacts recharge ${r * 10}% faster`, apply: (s, r) => (s.artifactCdMult *= 1 - r * 0.1) },
  // Unbound
  { id: 'undying', name: 'Undying', glyph: '✚', tier: 4, max: 1, desc: () => 'Cheat death one more time per run', apply: (s, r) => (s.deathDefiance += r) },
  { id: 'godslayer', name: 'Godslayer', glyph: '⚡', tier: 4, max: 2, desc: (r) => `+${r * 8}% damage and +${r * 10} max Health`, apply: (s, r) => ((s.globalDmg += r * 0.08), (s.maxHp += r * 10)) },
];

export const TALENT_BY_ID: Record<string, TalentDef> = Object.fromEntries(TALENTS.map((t) => [t.id, t]));

function addCrit(s: PlayerStats, c: number): void {
  for (const k of Object.keys(s.critChance) as (keyof PlayerStats['critChance'])[]) s.critChance[k] += c;
}

export function talentPoints(level: number): number {
  return level - 1;
}

export function spentPoints(talents: Record<string, number>): number {
  return Object.values(talents).reduce((a, b) => a + b, 0);
}

export function canRaiseTalent(level: number, talents: Record<string, number>, id: string): boolean {
  const def = TALENT_BY_ID[id];
  if (!def) return false;
  if (level < TIERS[def.tier].level) return false;
  if ((talents[id] ?? 0) >= def.max) return false;
  return spentPoints(talents) < talentPoints(level);
}

export function applyTalents(talents: Record<string, number>, s: PlayerStats): void {
  for (const [id, r] of Object.entries(talents)) {
    const def = TALENT_BY_ID[id];
    if (def && r > 0) def.apply(s, Math.min(r, def.max));
  }
}

// ---------------------------------------------------------------- weapon forge

export interface ForgeTier {
  tier: number;
  name: string;
  cost: number;
  level: number;
  desc: string;
}

/** Tiers bought with Ash at the Armory, per weapon. */
export const FORGE: ForgeTier[] = [
  { tier: 1, name: 'Tier I', cost: 0, level: 1, desc: 'Base weapon' },
  { tier: 2, name: 'Tier II · Tempered', cost: 30, level: 3, desc: '+10% weapon damage' },
  { tier: 3, name: 'Tier III · Awakened', cost: 80, level: 13, desc: '+20% weapon damage. Every 4th Attack unleashes an arcane wave.' },
  { tier: 4, name: 'Tier IV · Exalted', cost: 150, level: 16, desc: '+30% weapon damage. Waves grow larger.' },
  { tier: 5, name: 'Tier V · Mythic', cost: 260, level: 20, desc: '+45% weapon damage. Waves split in three and the weapon blazes.' },
];

export function forgeDamage(tier: number): number {
  return [0, 0, 0.1, 0.2, 0.3, 0.45][tier] ?? 0;
}

export function applyForge(tier: number, s: PlayerStats): void {
  const bonus = forgeDamage(tier);
  s.dmgBonus.attack += bonus;
  s.dmgBonus.special += bonus;
  s.forgeTier = tier;
}

export function nextForge(tier: number): ForgeTier | null {
  return FORGE.find((f) => f.tier === tier + 1) ?? null;
}

/** Level needed to buy a weapon at the Armory, on top of its Ash price. */
export const WEAPON_LEVEL: Record<WeaponId, number> = { sword: 1, spear: 2, bow: 4, fists: 8, scythe: 14 };
