import type { AbilitySlot, GodPower, HitEffect } from './types';

/** Everything the boon/upgrade layer can tweak about the player. Rebuilt whenever the build changes. */
export interface PlayerStats {
  maxHp: number;
  moveSpeed: number;
  attackSpeed: number;
  dashCharges: number;
  dashRecharge: number;
  castAmmo: number;
  /** Seconds per automatic shard regeneration; 0 disables it. */
  castRegen: number;
  damageTaken: number;
  /** Additive damage bonus per slot (0.3 = +30%). */
  dmgBonus: Record<AbilitySlot, number>;
  globalDmg: number;
  critChance: Record<AbilitySlot, number>;
  critMult: number;
  hitEffects: Partial<Record<'attack' | 'special', HitEffect>>;
  castPower: GodPower | null;
  dashPower: GodPower | null;
  deathDefiance: number;
  goldMult: number;
  healMult: number;
  // --- passives
  holyShield: boolean;
  retaliate: number;
  bloodFrenzy: number;
  afterParty: number;
  lightningBonus: number;
  wallSlam: number;
  quickRecovery: number;
  dashStrikeBonus: number;
  lowHpGuard: number;
  doomBonus: number;
  weakPct: number;
  hangoverStacks: number;
  chillShatter: number;
  armorBonus: number;
  // --- duos & hammer flags
  duos: Set<string>;
  hammers: Set<string>;
  // --- Dungeons-style layer
  /** Enchantment tiers keyed by enchant id. */
  ench: Record<string, number>;
  soulMax: number;
  soulGain: number;
  potionCooldown: number;
  potionHeal: number;
  artifactCdMult: number;
  chestChance: number;
}

export function baseStats(): PlayerStats {
  return {
    maxHp: 50,
    moveSpeed: 1,
    attackSpeed: 1,
    dashCharges: 1,
    dashRecharge: 0.3,
    castAmmo: 1,
    castRegen: 0,
    damageTaken: 1,
    dmgBonus: { attack: 0, special: 0, cast: 0, dash: 0 },
    globalDmg: 0,
    critChance: { attack: 0, special: 0, cast: 0, dash: 0 },
    critMult: 3,
    hitEffects: {},
    castPower: null,
    dashPower: null,
    deathDefiance: 0,
    goldMult: 1,
    healMult: 1,
    holyShield: false,
    retaliate: 0,
    bloodFrenzy: 0,
    afterParty: 0,
    lightningBonus: 0,
    wallSlam: 0,
    quickRecovery: 0,
    dashStrikeBonus: 0,
    lowHpGuard: 0,
    doomBonus: 0,
    weakPct: 0.3,
    hangoverStacks: 5,
    chillShatter: 0,
    armorBonus: 0,
    duos: new Set(),
    hammers: new Set(),
    ench: {},
    soulMax: 100,
    soulGain: 1,
    potionCooldown: 40,
    potionHeal: 0.35,
    artifactCdMult: 1,
    chestChance: 0.25,
  };
}
