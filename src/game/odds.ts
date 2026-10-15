// Every chance roll in the run, in one place, so the probability tables in
// docs/GAME_DATA.md (`npm run docs`) always match the game. Boon rarity odds
// live in boons.ts (BOON_RARITY_BY_REGION), gear tier odds in gear.ts
// (rarityOdds) and enchantment procs in enchants.ts.

/** How many doors a cleared chamber opens: [doors, weight]. */
export const DOOR_COUNT: readonly [number, number][] = [
  [1, 1],
  [2, 5],
  [3, 3],
];

/**
 * Door reward weights. Each door rolls one reward among those allowed right
 * now; a reward shows on at most one door of a set (boons: one door per god).
 */
export const DOOR_WEIGHT = {
  boon: 38,
  pom: 12,
  gold: 9,
  heart: 7,
  ash: 9,
  hammer: 6,
  hermes: 4,
  enchant: 9,
  artifact: 6,
  shop: 7,
  fountain: 4,
} as const;
export type DoorReward = keyof typeof DOOR_WEIGHT;

/** When each door reward may show (for the docs). */
export const DOOR_RULE: Record<DoorReward, string> = {
  boon: 'Always (a god you can still take)',
  pom: 'You own a boon that can level up',
  gold: 'Always',
  heart: 'Always',
  ash: 'Always',
  hammer: 'Anvil unlocked, from chamber 2, once per region',
  hermes: 'From chamber 2, once per region',
  enchant: 'Enchantments unlocked, something left to learn',
  artifact: 'Artifacts unlocked, one left to find',
  shop: 'From chamber 3, once per region',
  fountain: 'From chamber 3, once per region',
};

/** Chance a foe of cost 2+ in a wave carries an elite trait (armored, swift, volatile or regenerating). */
export function eliteChance(depth: number, region: number, eliteRoom: boolean): number {
  return Math.min(0.45, 0.05 + depth * 0.04 + region * 0.08 + (eliteRoom ? 0.3 : 0));
}

export const CHEST = {
  /** Base chance a combat chamber holds a chest (Prospector raises it). */
  spawn: 0.25,
  /** A chest in a combat chamber is a Mimic. */
  mimic: 0.15,
  /** The chest also holds a piece of gear. */
  gear: 0.3,
  /** An artifact pops out (needs artifacts unlocked and one left to find). */
  artifact: 0.35,
  /** Otherwise an enchantment (if unlocked): the next 25% of the roll, or 60% with no artifact to give. */
  enchant: 0.6,
};

/** Drops from slain foes. Elite and guardian foes multiply the material chances. */
export const FOE_DROP = {
  gold: 0.55,
  /** A second soul. */
  extraSoul: 0.4,
  bone: 0.3,
  /** A second bone when bone drops. */
  extraBone: 0.3,
  /** The region's own material. */
  regional: 0.14,
  /** Elite foes drop a Wyrm Scale (guardians always do). */
  eliteScale: 0.25,
  gear: 0.012,
  eliteGear: 0.12,
  eliteMult: 1.6,
  guardianMult: 3,
};

/** Gear luck (0..1) by source: it slides the tier odds toward better tiers (see rarityOdds). */
export const GEAR_LUCK = { perRegion: 0.1, chest: 0.2, guardian: 0.6 };

/** Breaking a pot: gold first, else souls. */
export const POT = { gold: 0.35, souls: 0.2 };

/** A boon offer slips in a Duo boon (when one is eligible). */
export const DUO_CHANCE = 0.4;
/** A Pomegranate levels the boon up by 2 instead of 1. */
export const POM_DOUBLE = 0.2;
/** Soul Siphon enchant: souls on hit. */
export const SIPHON = 0.12;
