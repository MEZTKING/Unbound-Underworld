import type { PlayerStats } from './stats';
import type { WeaponId } from './types';

// ---------------------------------------------------------------- levels & tiers

/**
 * Your shade's level. Experience comes from slain foes, cleared chambers and
 * guardians, and carries over between escapes. Levels open new mechanics (so
 * the first escapes start simple) and the Altar's sections, and each one
 * makes every hero a little sturdier (see `applyLevel`).
 */
export const MAX_LEVEL = 50;

/** Experience needed to go from `level` to `level + 1` (the climb flattens after 30). */
export function xpToNext(level: number): number {
  const l = Math.min(level, 30);
  return Math.round(60 + (l - 1) * 45 + (l - 1) ** 2 * 3) + Math.max(0, level - 30) * 100;
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

/** Rank names shown next to your level. */
export const TIERS: Tier[] = [
  { name: 'Shade', level: 1, color: '#c8b8c0' },
  { name: 'Wraith', level: 5, color: '#7fe8ff' },
  { name: 'Revenant', level: 10, color: '#9dff9a' },
  { name: 'Champion', level: 15, color: '#ffd04a' },
  { name: 'Unbound', level: 20, color: '#ff6a7a' },
  { name: 'Ascendant', level: 25, color: '#ff9a4a' },
  { name: 'Exarch', level: 30, color: '#c86bff' },
  { name: 'Eternal', level: 35, color: '#5ac8ff' },
  { name: 'Sovereign', level: 40, color: '#ffe08a' },
  { name: 'Paragon', level: 45, color: '#ff6ad0' },
  { name: 'Deathless', level: 50, color: '#ffffff' },
];

/** What each level adds for every hero: +1 max Health per level, +1% damage every 5 levels. */
export function levelBonus(level: number): { hp: number; dmg: number } {
  const l = Math.max(1, Math.min(MAX_LEVEL, level));
  return { hp: l - 1, dmg: Math.floor(l / 5) * 0.01 };
}

export function applyLevel(level: number, s: PlayerStats): void {
  const b = levelBonus(level);
  s.maxHp += b.hp;
  s.globalDmg += b.dmg;
}

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

export type Feature = 'guard' | 'potion' | 'cast' | 'jump' | 'artifacts' | 'enchants' | 'anvil' | 'artifact2' | 'wrath' | 'gear' | 'artifact3' | 'forgeAwaken';

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
  { level: 2, feature: 'gear', title: 'Gear & Inventory', desc: 'Equip the helmets, armor, leggings and boots foes drop, in the Hall of Heroes or from the pause menu. The Blacksmith stars them up and salvages them.' },
  { level: 2, feature: 'guard', title: 'Guard & Parry', desc: 'Hold Guard to block hits from the front. Tap it just before a hit lands to parry: the foe staggers and your next attack is a sure critical. Ground shockwaves can only be dodged or jumped.', keys: { pc: 'F', touch: '⛨' } },
  { level: 2, feature: 'potion', title: 'Healing Potion', desc: 'Drink to restore health. It refills over time.', keys: { pc: 'R', touch: '⚗' } },
  { level: 3, feature: 'cast', title: 'Cast', desc: 'Hurl a shard that lodges in foes. Walk over it to pick it up again.', keys: { pc: 'Q / Middle mouse', touch: '◆' } },
  { level: 4, feature: 'artifacts', title: 'Artifacts', desc: 'One artifact slot. Find artifacts in the Underworld or pick one at the Artifact Shelf.', keys: { pc: '1', touch: 'the artifact button' } },
  { level: 5, feature: 'jump', title: 'Jump & Slam', desc: 'Leap over lava, chasms and shockwaves. Attack mid-air to Slam the ground.', keys: { pc: 'Space / C', touch: '⤒' } },
  { level: 6, feature: 'enchants', title: 'Enchantments', desc: 'Enchanting Tomes now appear behind doors and in chests.' },
  { level: 7, feature: 'anvil', title: "Hephaestus' Anvil", desc: 'Anvils that reforge your weapon now appear in the Underworld.' },
  { level: 8, feature: 'artifact2', title: 'Second Artifact Slot', desc: 'Carry two artifacts at once.', keys: { pc: '2', touch: 'the artifact button' } },
  { level: 10, feature: 'wrath', title: 'Wrath', desc: "Fill the golden gauge by dealing and taking damage, then unleash your hero's ultimate.", keys: { pc: 'V', touch: '☄' } },

  { level: 12, feature: 'artifact3', title: 'Third Artifact Slot', desc: 'Carry three artifacts at once.', keys: { pc: '3', touch: 'the artifact button' } },
  { level: 13, feature: 'forgeAwaken', title: 'Awakened Weapons', desc: 'Forge a weapon to Tier III at the Blacksmith to awaken it.' },
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
  s.canGuard = hasFeature(level, 'guard');
  s.canPotion = hasFeature(level, 'potion');
  s.canCast = hasFeature(level, 'cast');
  s.canJump = hasFeature(level, 'jump', escaped);
  s.canWrath = hasFeature(level, 'wrath');
  s.artifactSlots = artifactSlots(level);
  if (!s.canCast) s.castAmmo = 0;
}

// ---------------------------------------------------------------- weapon forge

export interface ForgeTier {
  tier: number;
  name: string;
  cost: number;
  level: number;
  desc: string;
}

/** Tiers bought with Ash at the Blacksmith, per weapon. */
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

/** Level at which each weapon's class can first be played. */
export const WEAPON_LEVEL: Record<WeaponId, number> = { sword: 1, spear: 1, bow: 1, fists: 5, nunchaku: 8, scythe: 10, blunderbuss: 12, katana: 15 };
