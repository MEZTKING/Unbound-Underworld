import type { Rng } from '../engine/math';
import { baseStats, type PlayerStats } from './stats';
import type { BoonSlot, GodId, Rarity, WeaponId } from './types';
import { DUO_CHANCE } from './odds';

export interface GodInfo {
  id: GodId;
  name: string;
  title: string;
  color: string;
  glyph: string;
  /** Flavour line spoken when offering a boon. */
  greeting: string[];
}

export const GODS: Record<GodId, GodInfo> = {
  zeus: {
    id: 'zeus',
    name: 'Zeus',
    title: 'King of Olympus',
    color: '#ffe45c',
    glyph: 'ϟ',
    greeting: ['The sky itself shall answer your blows.', 'Thunder is a fine argument, little shade.'],
  },
  poseidon: {
    id: 'poseidon',
    name: 'Poseidon',
    title: 'Lord of the Sea',
    color: '#3fa9ff',
    glyph: 'Ψ',
    greeting: ['Make some waves down there!', 'The tide is on your side today.'],
  },
  athena: {
    id: 'athena',
    name: 'Athena',
    title: 'Goddess of Wisdom',
    color: '#f2d38a',
    glyph: '◈',
    greeting: ['Defend yourself with care.', 'Wisdom is the finest armour.'],
  },
  ares: {
    id: 'ares',
    name: 'Ares',
    title: 'God of War',
    color: '#ff3d3d',
    glyph: '⚔',
    greeting: ['Let them bleed.', 'Ruin follows in your wake. Good.'],
  },
  aphrodite: {
    id: 'aphrodite',
    name: 'Aphrodite',
    title: 'Goddess of Love',
    color: '#ff6fcf',
    glyph: '♥',
    greeting: ['Break their hearts, darling.', 'Show them a little tenderness. Then crush them.'],
  },
  artemis: {
    id: 'artemis',
    name: 'Artemis',
    title: 'Goddess of the Hunt',
    color: '#7fe36b',
    glyph: '☾',
    greeting: ['Aim true.', 'Every hunt ends with one clean shot.'],
  },
  dionysus: {
    id: 'dionysus',
    name: 'Dionysus',
    title: 'God of Wine',
    color: '#b26bff',
    glyph: '❦',
    greeting: ['Party in the underworld!', 'Drink deep, friend.'],
  },
  demeter: {
    id: 'demeter',
    name: 'Demeter',
    title: 'Goddess of Seasons',
    color: '#c8f2ff',
    glyph: '❄',
    greeting: ['Let winter take them.', 'Cold endures where all else withers.'],
  },
  hermes: {
    id: 'hermes',
    name: 'Hermes',
    title: 'Messenger of the Gods',
    color: '#e8e8ff',
    glyph: '➶',
    greeting: ['Quick, quick! No time to chat.', 'Speed is its own reward.'],
  },
};

/** Gods that grant regular boons (Hermes is offered separately). */
export const OLYMPIANS: GodId[] = ['zeus', 'poseidon', 'athena', 'ares', 'aphrodite', 'artemis', 'dionysus', 'demeter'];

export const MAX_GODS_PER_RUN = 4;

export const RARITY_MULT: Record<Rarity, number> = { common: 1, rare: 1.3, epic: 1.6, heroic: 2, duo: 1 };
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#d8d0c8',
  rare: '#4aa8ff',
  epic: '#c066ff',
  heroic: '#ff9a3c',
  duo: '#d4ff5a',
};

export interface BoonDef {
  id: string;
  god: GodId;
  name: string;
  slot: BoonSlot;
  /** Magnitude at common rarity, level 1. */
  base: number;
  /** Fraction of base gained per extra level. */
  perLevel?: number;
  /** Boons that do not scale or level (flat effects). */
  fixed?: boolean;
  /** For boons where a smaller number is better (e.g. cooldowns). */
  inverse?: boolean;
  desc: (v: number) => string;
  apply: (s: PlayerStats, v: number) => void;
  /** Needs at least one of these boons owned to be offered. */
  requiresAny?: string[];
  /** Duo boons: needs a boon from each of these gods. */
  duoOf?: [GodId, GodId];
}

export interface OwnedBoon {
  id: string;
  rarity: Rarity;
  level: number;
}

const pct = (v: number) => `${Math.round(v)}%`;
const n = (v: number) => `${Math.round(v)}`;

const KNOCK = 520;

export const BOONS: BoonDef[] = [
  // ---------------------------------------------------------------- Zeus
  {
    id: 'zeus_attack',
    god: 'zeus',
    name: 'Thunder Edge',
    slot: 'attack',
    base: 10,
    desc: (v) => `Your Attack calls down a lightning bolt on foes, dealing ${n(v)} damage.`,
    apply: (s, v) => (s.hitEffects.attack = { kind: 'bolt', dmg: v }),
  },
  {
    id: 'zeus_special',
    god: 'zeus',
    name: 'Forked Wrath',
    slot: 'special',
    base: 20,
    desc: (v) => `Your Special unleashes chain lightning that bounces 4 times, dealing ${n(v)} damage.`,
    apply: (s, v) => (s.hitEffects.special = { kind: 'chain', dmg: v, bounces: 4 }),
  },
  {
    id: 'zeus_cast',
    god: 'zeus',
    name: 'Storm Shard',
    slot: 'cast',
    base: 15,
    desc: (v) => `Your Cast becomes a storm shard that strikes nearby foes with lightning for ${n(v)} damage, repeatedly.`,
    apply: (s, v) => (s.castPower = { god: 'zeus', power: v }),
  },
  {
    id: 'zeus_dash',
    god: 'zeus',
    name: 'Thunder Step',
    slot: 'dash',
    base: 15,
    desc: (v) => `Your Dash calls lightning on nearby foes, dealing ${n(v)} damage.`,
    apply: (s, v) => (s.dashPower = { god: 'zeus', power: v }),
  },
  {
    id: 'zeus_retort',
    god: 'zeus',
    name: "Heaven's Retort",
    slot: 'passive',
    base: 60,
    desc: (v) => `When you are struck, a bolt hits your attacker for ${n(v)} damage.`,
    apply: (s, v) => (s.retaliate = Math.max(s.retaliate, v)),
  },
  {
    id: 'zeus_overcharge',
    god: 'zeus',
    name: 'Overcharge',
    slot: 'passive',
    base: 30,
    requiresAny: ['zeus_attack', 'zeus_special', 'zeus_cast', 'zeus_dash', 'zeus_retort'],
    desc: (v) => `Your lightning effects deal +${pct(v)} damage.`,
    apply: (s, v) => (s.lightningBonus += v / 100),
  },
  // ---------------------------------------------------------------- Poseidon
  {
    id: 'poseidon_attack',
    god: 'poseidon',
    name: 'Tidal Edge',
    slot: 'attack',
    base: 30,
    desc: (v) => `Your Attack deals +${pct(v)} damage and knocks foes away.`,
    apply: (s, v) => {
      s.dmgBonus.attack += v / 100;
      s.hitEffects.attack = { kind: 'knock', force: KNOCK };
    },
  },
  {
    id: 'poseidon_special',
    god: 'poseidon',
    name: 'Riptide Strike',
    slot: 'special',
    base: 50,
    desc: (v) => `Your Special deals +${pct(v)} damage and knocks foes away.`,
    apply: (s, v) => {
      s.dmgBonus.special += v / 100;
      s.hitEffects.special = { kind: 'knock', force: KNOCK * 1.3 };
    },
  },
  {
    id: 'poseidon_cast',
    god: 'poseidon',
    name: 'Breaker Shard',
    slot: 'cast',
    base: 60,
    desc: (v) => `Your Cast bursts into a crashing wave on impact, dealing ${n(v)} damage and knocking foes away.`,
    apply: (s, v) => (s.castPower = { god: 'poseidon', power: v }),
  },
  {
    id: 'poseidon_dash',
    god: 'poseidon',
    name: 'Undertow Dash',
    slot: 'dash',
    base: 25,
    desc: (v) => `Your Dash creates a splash that deals ${n(v)} damage and knocks foes away.`,
    apply: (s, v) => (s.dashPower = { god: 'poseidon', power: v }),
  },
  {
    id: 'poseidon_bounty',
    god: 'poseidon',
    name: 'Sunken Treasure',
    slot: 'passive',
    base: 50,
    desc: (v) => `Obols you find are worth +${pct(v)}.`,
    apply: (s, v) => (s.goldMult += v / 100),
  },
  {
    id: 'poseidon_slam',
    god: 'poseidon',
    name: 'Crashing Surf',
    slot: 'passive',
    base: 60,
    requiresAny: ['poseidon_attack', 'poseidon_special', 'poseidon_cast', 'poseidon_dash'],
    desc: (v) => `Foes knocked into walls take ${n(v)} damage.`,
    apply: (s, v) => (s.wallSlam = Math.max(s.wallSlam, v)),
  },
  // ---------------------------------------------------------------- Athena
  {
    id: 'athena_attack',
    god: 'athena',
    name: 'Aegis Edge',
    slot: 'attack',
    base: 35,
    desc: (v) => `Your Attack deals +${pct(v)} damage and deflects projectiles.`,
    apply: (s, v) => {
      s.dmgBonus.attack += v / 100;
      s.hitEffects.attack = { kind: 'deflect' };
    },
  },
  {
    id: 'athena_special',
    god: 'athena',
    name: 'Bulwark Strike',
    slot: 'special',
    base: 55,
    desc: (v) => `Your Special deals +${pct(v)} damage and deflects projectiles.`,
    apply: (s, v) => {
      s.dmgBonus.special += v / 100;
      s.hitEffects.special = { kind: 'deflect' };
    },
  },
  {
    id: 'athena_cast',
    god: 'athena',
    name: 'Sentinel Shard',
    slot: 'cast',
    base: 70,
    desc: (v) => `Your Cast bursts on impact for ${n(v)} damage, destroying nearby enemy projectiles.`,
    apply: (s, v) => (s.castPower = { god: 'athena', power: v }),
  },
  {
    id: 'athena_dash',
    god: 'athena',
    name: 'Aegis Dash',
    slot: 'dash',
    base: 15,
    desc: (v) => `Your Dash deals ${n(v)} damage and deflects projectiles.`,
    apply: (s, v) => (s.dashPower = { god: 'athena', power: v }),
  },
  {
    id: 'athena_shield',
    god: 'athena',
    name: 'Sacred Ward',
    slot: 'passive',
    base: 0,
    fixed: true,
    desc: () => `The first hit you take in each encounter deals no damage.`,
    apply: (s) => (s.holyShield = true),
  },
  {
    id: 'athena_steadfast',
    god: 'athena',
    name: 'Steadfast',
    slot: 'passive',
    base: 10,
    perLevel: 0.3,
    desc: (v) => `You take ${pct(Math.min(40, v))} less damage.`,
    apply: (s, v) => (s.damageTaken *= 1 - Math.min(40, v) / 100),
  },
  // ---------------------------------------------------------------- Ares
  {
    id: 'ares_attack',
    god: 'ares',
    name: 'Curse of Ruin',
    slot: 'attack',
    base: 50,
    desc: (v) => `Your Attack inflicts Doom: after a moment the foe takes ${n(v)} damage.`,
    apply: (s, v) => (s.hitEffects.attack = { kind: 'doom', dmg: v }),
  },
  {
    id: 'ares_special',
    god: 'ares',
    name: 'Curse of Wrath',
    slot: 'special',
    base: 70,
    desc: (v) => `Your Special inflicts Doom, dealing ${n(v)} damage after a moment.`,
    apply: (s, v) => (s.hitEffects.special = { kind: 'doom', dmg: v }),
  },
  {
    id: 'ares_cast',
    god: 'ares',
    name: 'Blade Rift Shard',
    slot: 'cast',
    base: 12,
    desc: (v) => `Your Cast tears open a spinning blade rift that deals ${n(v)} damage several times per second.`,
    apply: (s, v) => (s.castPower = { god: 'ares', power: v }),
  },
  {
    id: 'ares_dash',
    god: 'ares',
    name: 'Rending Dash',
    slot: 'dash',
    base: 8,
    desc: (v) => `Your Dash leaves behind a blade rift that deals ${n(v)} damage several times per second.`,
    apply: (s, v) => (s.dashPower = { god: 'ares', power: v }),
  },
  {
    id: 'ares_frenzy',
    god: 'ares',
    name: 'Bloodlust',
    slot: 'passive',
    base: 30,
    desc: (v) => `Deal up to +${pct(v)} damage, increasing as your health drops.`,
    apply: (s, v) => (s.bloodFrenzy += v / 100),
  },
  {
    id: 'ares_dire',
    god: 'ares',
    name: 'Dire Ruin',
    slot: 'passive',
    base: 40,
    requiresAny: ['ares_attack', 'ares_special'],
    desc: (v) => `Doom deals +${pct(v)} damage.`,
    apply: (s, v) => (s.doomBonus += v / 100),
  },
  // ---------------------------------------------------------------- Aphrodite
  {
    id: 'aphrodite_attack',
    god: 'aphrodite',
    name: 'Heartbreak Edge',
    slot: 'attack',
    base: 50,
    desc: (v) => `Your Attack deals +${pct(v)} damage and inflicts Weak (foes deal less damage).`,
    apply: (s, v) => {
      s.dmgBonus.attack += v / 100;
      s.hitEffects.attack = { kind: 'weak' };
    },
  },
  {
    id: 'aphrodite_special',
    god: 'aphrodite',
    name: 'Lovesick Strike',
    slot: 'special',
    base: 70,
    desc: (v) => `Your Special deals +${pct(v)} damage and inflicts Weak.`,
    apply: (s, v) => {
      s.dmgBonus.special += v / 100;
      s.hitEffects.special = { kind: 'weak' };
    },
  },
  {
    id: 'aphrodite_cast',
    god: 'aphrodite',
    name: 'Swoon Shard',
    slot: 'cast',
    base: 90,
    desc: (v) => `Your Cast detonates at short range for ${n(v)} damage, inflicting Weak.`,
    apply: (s, v) => (s.castPower = { god: 'aphrodite', power: v }),
  },
  {
    id: 'aphrodite_dash',
    god: 'aphrodite',
    name: 'Rapture Dash',
    slot: 'dash',
    base: 20,
    desc: (v) => `Your Dash ends in a burst of hearts dealing ${n(v)} damage and inflicting Weak.`,
    apply: (s, v) => (s.dashPower = { god: 'aphrodite', power: v }),
  },
  {
    id: 'aphrodite_vigor',
    god: 'aphrodite',
    name: "Lover's Vigor",
    slot: 'passive',
    base: 25,
    desc: (v) => `Gain +${n(v)} max Health.`,
    apply: (s, v) => (s.maxHp += Math.round(v)),
  },
  {
    id: 'aphrodite_resolve',
    god: 'aphrodite',
    name: 'Shattered Will',
    slot: 'passive',
    base: 15,
    perLevel: 0.3,
    requiresAny: ['aphrodite_attack', 'aphrodite_special', 'aphrodite_cast', 'aphrodite_dash'],
    desc: (v) => `Weak foes deal an extra ${pct(v)} less damage.`,
    apply: (s, v) => (s.weakPct = Math.min(0.7, s.weakPct + v / 100)),
  },
  // ---------------------------------------------------------------- Artemis
  {
    id: 'artemis_attack',
    god: 'artemis',
    name: 'Deadly Edge',
    slot: 'attack',
    base: 20,
    desc: (v) => `Your Attack deals +${pct(v)} damage and has +12% critical chance.`,
    apply: (s, v) => {
      s.dmgBonus.attack += v / 100;
      s.hitEffects.attack = { kind: 'crit', chance: 0.12 };
    },
  },
  {
    id: 'artemis_special',
    god: 'artemis',
    name: "Hunter's Strike",
    slot: 'special',
    base: 40,
    desc: (v) => `Your Special deals +${pct(v)} damage and has +18% critical chance.`,
    apply: (s, v) => {
      s.dmgBonus.special += v / 100;
      s.hitEffects.special = { kind: 'crit', chance: 0.18 };
    },
  },
  {
    id: 'artemis_cast',
    god: 'artemis',
    name: 'Seeking Shard',
    slot: 'cast',
    base: 70,
    desc: (v) => `Your Cast seeks foes and pierces through them, dealing ${n(v)} damage with +15% critical chance.`,
    apply: (s, v) => {
      s.castPower = { god: 'artemis', power: v };
      s.critChance.cast += 0.15;
    },
  },
  {
    id: 'artemis_dash',
    god: 'artemis',
    name: 'Stalker\'s Dash',
    slot: 'dash',
    base: 60,
    desc: (v) => `Your Dash-Strike deals +${pct(v)} damage.`,
    apply: (s, v) => {
      s.dashPower = { god: 'artemis', power: v };
      s.dashStrikeBonus += v / 100;
    },
  },
  {
    id: 'artemis_points',
    god: 'artemis',
    name: 'Keen Eye',
    slot: 'passive',
    base: 5,
    perLevel: 0.4,
    desc: (v) => `Everything you do has +${pct(v)} critical chance.`,
    apply: (s, v) => {
      for (const k of ['attack', 'special', 'cast', 'dash'] as const) s.critChance[k] += v / 100;
    },
  },
  {
    id: 'artemis_clean',
    god: 'artemis',
    name: 'Mortal Wound',
    slot: 'passive',
    base: 25,
    requiresAny: ['artemis_attack', 'artemis_special', 'artemis_cast', 'artemis_points'],
    desc: (v) => `Your critical hits deal +${pct(v)} damage.`,
    apply: (s, v) => (s.critMult += 3 * (v / 100)),
  },
  // ---------------------------------------------------------------- Dionysus
  {
    id: 'dionysus_attack',
    god: 'dionysus',
    name: 'Drunken Edge',
    slot: 'attack',
    base: 4,
    desc: (v) => `Your Attack inflicts Hangover: ${n(v)} damage per second per stack.`,
    apply: (s, v) => (s.hitEffects.attack = { kind: 'hangover', dps: v }),
  },
  {
    id: 'dionysus_special',
    god: 'dionysus',
    name: 'Tipsy Strike',
    slot: 'special',
    base: 6,
    desc: (v) => `Your Special inflicts Hangover: ${n(v)} damage per second per stack.`,
    apply: (s, v) => (s.hitEffects.special = { kind: 'hangover', dps: v }),
  },
  {
    id: 'dionysus_cast',
    god: 'dionysus',
    name: 'Revelry Shard',
    slot: 'cast',
    base: 20,
    desc: (v) => `Your Cast bursts into a festive fog that deals ${n(v)} damage per second and inflicts Hangover.`,
    apply: (s, v) => (s.castPower = { god: 'dionysus', power: v }),
  },
  {
    id: 'dionysus_dash',
    god: 'dionysus',
    name: 'Staggering Dash',
    slot: 'dash',
    base: 12,
    desc: (v) => `Your Dash leaves a cloud of fog that deals ${n(v)} damage per second.`,
    apply: (s, v) => (s.dashPower = { god: 'dionysus', power: v }),
  },
  {
    id: 'dionysus_party',
    god: 'dionysus',
    name: 'Last Call',
    slot: 'passive',
    base: 30,
    perLevel: 0.25,
    desc: (v) => `If your Health is below ${pct(Math.min(60, v))} after an encounter, restore it to ${pct(Math.min(60, v))}.`,
    apply: (s, v) => (s.afterParty = Math.max(s.afterParty, Math.min(60, v) / 100)),
  },
  {
    id: 'dionysus_drink',
    god: 'dionysus',
    name: 'Bottomless Cup',
    slot: 'passive',
    base: 2,
    perLevel: 0.5,
    requiresAny: ['dionysus_attack', 'dionysus_special', 'dionysus_cast', 'dionysus_dash'],
    desc: (v) => `Hangover can stack ${n(v)} more times.`,
    apply: (s, v) => (s.hangoverStacks += Math.round(v)),
  },
  // ---------------------------------------------------------------- Demeter
  {
    id: 'demeter_attack',
    god: 'demeter',
    name: 'Frost Edge',
    slot: 'attack',
    base: 40,
    desc: (v) => `Your Attack deals +${pct(v)} damage and inflicts Chill, slowing foes.`,
    apply: (s, v) => {
      s.dmgBonus.attack += v / 100;
      s.hitEffects.attack = { kind: 'chill' };
    },
  },
  {
    id: 'demeter_special',
    god: 'demeter',
    name: 'Rime Strike',
    slot: 'special',
    base: 60,
    desc: (v) => `Your Special deals +${pct(v)} damage and inflicts Chill.`,
    apply: (s, v) => {
      s.dmgBonus.special += v / 100;
      s.hitEffects.special = { kind: 'chill' };
    },
  },
  {
    id: 'demeter_cast',
    god: 'demeter',
    name: 'Winter Shard',
    slot: 'cast',
    base: 50,
    desc: (v) => `Your Cast bursts into a frost nova dealing ${n(v)} damage and heavily Chilling foes.`,
    apply: (s, v) => (s.castPower = { god: 'demeter', power: v }),
  },
  {
    id: 'demeter_dash',
    god: 'demeter',
    name: 'Frost Dash',
    slot: 'dash',
    base: 15,
    desc: (v) => `Your Dash releases a chilling nova dealing ${n(v)} damage.`,
    apply: (s, v) => (s.dashPower = { god: 'demeter', power: v }),
  },
  {
    id: 'demeter_nourish',
    god: 'demeter',
    name: 'Harvest Blessing',
    slot: 'passive',
    base: 30,
    desc: (v) => `Healing effects are +${pct(v)} stronger. Gain +10 max Health.`,
    apply: (s, v) => {
      s.healMult += v / 100;
      s.maxHp += 10;
    },
  },
  {
    id: 'demeter_freeze',
    god: 'demeter',
    name: 'Shattering Frost',
    slot: 'passive',
    base: 80,
    requiresAny: ['demeter_attack', 'demeter_special', 'demeter_cast', 'demeter_dash'],
    desc: (v) => `Foes reaching maximum Chill shatter, taking ${n(v)} damage.`,
    apply: (s, v) => (s.chillShatter = Math.max(s.chillShatter, v)),
  },
  // ---------------------------------------------------------------- Hermes
  {
    id: 'hermes_reflex',
    god: 'hermes',
    name: 'Second Step',
    slot: 'passive',
    base: 0,
    fixed: true,
    desc: () => `Gain +1 Dash charge.`,
    apply: (s) => (s.dashCharges += 1),
  },
  {
    id: 'hermes_speed',
    god: 'hermes',
    name: 'Fleet Foot',
    slot: 'passive',
    base: 15,
    perLevel: 0.3,
    desc: (v) => `You move +${pct(v)} faster.`,
    apply: (s, v) => (s.moveSpeed += v / 100),
  },
  {
    id: 'hermes_swift',
    god: 'hermes',
    name: 'Quicksilver Strikes',
    slot: 'passive',
    base: 10,
    perLevel: 0.3,
    desc: (v) => `Your Attack and Special are +${pct(v)} faster.`,
    apply: (s, v) => (s.attackSpeed += v / 100),
  },
  {
    id: 'hermes_windstep',
    god: 'hermes',
    name: 'Windstep',
    slot: 'passive',
    base: 25,
    perLevel: 0.3,
    desc: (v) => `Your Dash recharges ${pct(Math.min(60, v))} faster.`,
    apply: (s, v) => (s.dashRecharge *= 1 - Math.min(0.6, v / 100)),
  },
  {
    id: 'hermes_recovery',
    god: 'hermes',
    name: 'Rebound',
    slot: 'passive',
    base: 30,
    perLevel: 0.25,
    desc: (v) => `After taking damage, Dash quickly to recover ${pct(Math.min(70, v))} of the Health you lost.`,
    apply: (s, v) => (s.quickRecovery = Math.min(0.7, v / 100)),
  },
  {
    id: 'hermes_reload',
    god: 'hermes',
    name: 'Returning Shards',
    slot: 'passive',
    base: 5,
    inverse: true,
    desc: (v) => `Your Cast shards regenerate on their own every ${v.toFixed(1)}s.`,
    apply: (s, v) => (s.castRegen = s.castRegen > 0 ? Math.min(s.castRegen, v) : v),
  },
  {
    id: 'hermes_shard',
    god: 'hermes',
    name: 'Extra Shard',
    slot: 'passive',
    base: 0,
    fixed: true,
    desc: () => `Gain +1 Cast shard.`,
    apply: (s) => (s.castAmmo += 1),
  },
  // ---------------------------------------------------------------- Duos
  {
    id: 'duo_seastorm',
    god: 'zeus',
    name: 'Tempest Tide',
    slot: 'duo',
    base: 30,
    fixed: true,
    duoOf: ['zeus', 'poseidon'],
    desc: () => `Whenever you knock foes away, they are also struck by lightning for 30 damage.`,
    apply: (s) => s.duos.add('seastorm'),
  },
  {
    id: 'duo_longing',
    god: 'ares',
    name: 'Ruinous Embrace',
    slot: 'duo',
    base: 0,
    fixed: true,
    duoOf: ['ares', 'aphrodite'],
    desc: () => `Doom also inflicts Weak, and you deal +40% damage to Weak foes.`,
    apply: (s) => s.duos.add('longing'),
  },
  {
    id: 'duo_icewine',
    god: 'dionysus',
    name: 'Frostwine',
    slot: 'duo',
    base: 0,
    fixed: true,
    duoOf: ['dionysus', 'demeter'],
    desc: () => `Hangover damage also Chills foes, and Chilled foes take +30% Hangover damage.`,
    apply: (s) => s.duos.add('icewine'),
  },
  {
    id: 'duo_hunting',
    god: 'artemis',
    name: 'Hunter\'s Ruin',
    slot: 'duo',
    base: 0,
    fixed: true,
    duoOf: ['ares', 'artemis'],
    desc: () => `Doom and blade rifts can deal critical damage (+25% chance).`,
    apply: (s) => s.duos.add('hunting'),
  },
  {
    id: 'duo_phalanx',
    god: 'athena',
    name: 'Storm Aegis',
    slot: 'duo',
    base: 0,
    fixed: true,
    duoOf: ['zeus', 'athena'],
    desc: () => `Projectiles you deflect crackle with lightning, striking foes for 40 damage.`,
    apply: (s) => s.duos.add('phalanx'),
  },
  {
    id: 'duo_crush',
    god: 'poseidon',
    name: 'Cold Current',
    slot: 'duo',
    base: 0,
    fixed: true,
    duoOf: ['poseidon', 'demeter'],
    desc: () => `Knocking foes away fully Chills them, and wall slams deal double damage.`,
    apply: (s) => s.duos.add('coldcurrent'),
  },
];

export const BOON_BY_ID: Record<string, BoonDef> = Object.fromEntries(BOONS.map((b) => [b.id, b]));

export function boonValue(def: BoonDef, rarity: Rarity, level: number): number {
  if (def.fixed) return def.base;
  const r = RARITY_MULT[rarity];
  const lvl = 1 + (def.perLevel ?? 0.5) * (level - 1);
  return def.inverse ? def.base / (r * lvl) : def.base * r * lvl;
}

export function describeBoon(b: OwnedBoon): string {
  const def = BOON_BY_ID[b.id];
  return def.desc(boonValue(def, b.rarity, b.level));
}

// ---------------------------------------------------------------- Hammer (weapon upgrades)

export interface HammerDef {
  id: string;
  weapon: WeaponId;
  name: string;
  desc: string;
}

export const HAMMERS: HammerDef[] = [
  { id: 'sword_cursed', weapon: 'sword', name: 'Thirsting Edge', desc: 'Your Attack restores 1 Health per hit.' },
  { id: 'sword_double', weapon: 'sword', name: 'Echoing Nova', desc: 'Your Special strikes twice in quick succession.' },
  { id: 'sword_breach', weapon: 'sword', name: 'Armorbane Edge', desc: 'Your Attack deals +300% damage to Armor.' },
  { id: 'sword_shadow', weapon: 'sword', name: 'Backstabber\'s Edge', desc: 'Your Attack deals +200% damage striking foes from behind.' },
  { id: 'sword_dashnova', weapon: 'sword', name: 'Nova Lunge', desc: 'Your Dash-Strike unleashes a Nova Smash.' },
  { id: 'spear_breach', weapon: 'spear', name: 'Armorpiercer', desc: 'Your Attack deals +400% damage to Armor.' },
  { id: 'spear_reach', weapon: 'spear', name: 'Long Reach', desc: 'Your Attack reaches +40% farther.' },
  { id: 'spear_explode', weapon: 'spear', name: 'Blast Tip', desc: 'Your thrown spear explodes on impact for 50 area damage.' },
  { id: 'spear_spin', weapon: 'spear', name: 'Whirlwind', desc: 'Your Spin Attack charges 50% faster and deals +100% damage.' },
  { id: 'spear_recall', weapon: 'spear', name: 'Vengeful Return', desc: 'Your recalled spear deals +200% damage.' },
  { id: 'bow_twin', weapon: 'bow', name: 'Paired Arrows', desc: 'Your Attack fires 2 arrows side by side.' },
  { id: 'bow_pierce', weapon: 'bow', name: 'Skewering Volley', desc: 'Your Special arrows pierce through foes.' },
  { id: 'bow_power', weapon: 'bow', name: 'Bullseye', desc: 'Your Power Shots deal +150% damage.' },
  { id: 'bow_triple', weapon: 'bow', name: 'Fan of Arrows', desc: 'Your Special fires 4 additional arrows.' },
  { id: 'bow_draw', weapon: 'bow', name: 'Quick Draw', desc: 'Your Attack charges 35% faster.' },
  { id: 'fists_heavy', weapon: 'fists', name: 'Crushing Blows', desc: 'Your Attack deals +40% damage.' },
  { id: 'fists_meteor', weapon: 'fists', name: 'Meteor Crater', desc: 'Your Special shockwave is 60% larger and deals +100% damage.' },
  { id: 'fists_vamp', weapon: 'fists', name: 'Life Tap', desc: 'The final blow of your Attack combo restores 3 Health.' },
  { id: 'fists_quake', weapon: 'fists', name: 'Aftershock', desc: 'Your Dash-Strike also releases a 30-damage shockwave.' },
  { id: 'scythe_wide', weapon: 'scythe', name: 'Wide Arc', desc: 'Your Attack reaches +30% farther.' },
  { id: 'scythe_orbit', weapon: 'scythe', name: 'Twin Specters', desc: 'Your Special summons two spectral scythes.' },
  { id: 'scythe_doom', weapon: 'scythe', name: 'Death Mark', desc: 'Your Attack inflicts Doom: 60 damage after a short delay.' },
  { id: 'scythe_long', weapon: 'scythe', name: 'Lingering Shade', desc: 'Your Special lasts 80% longer.' },
  { id: 'katana_edge', weapon: 'katana', name: 'Moonlit Edge', desc: 'Your Attack deals +30% damage.' },
  { id: 'katana_flurry', weapon: 'katana', name: 'Endless Flurry', desc: 'Thousand Cuts strikes 4 more times.' },
  { id: 'katana_iaido', weapon: 'katana', name: 'Lingering Cut', desc: "Moonlit Iaido's delayed slashes deal +100% damage." },
  { id: 'buss_pellets', weapon: 'blunderbuss', name: 'Packed Charge', desc: 'Your spread shots fire 3 more pellets.' },
  { id: 'buss_slug', weapon: 'blunderbuss', name: 'Heavy Slug', desc: 'Your slug deals +50% damage and passes through 3 more foes.' },
  { id: 'buss_keg', weapon: 'blunderbuss', name: 'Black Powder', desc: "Your Powder Keg's blast is 50% larger." },
  { id: 'chain_flow', weapon: 'nunchaku', name: 'Flowing Current', desc: 'Your Attack deals +25% damage.' },
  { id: 'chain_whirl', weapon: 'nunchaku', name: 'Maelstrom', desc: 'Whirlpool pulls from 50% farther and strikes 3 more times.' },
  { id: 'chain_snap', weapon: 'nunchaku', name: 'Undertow', desc: 'Tidal Snap stuns the foe it pulls for 1.5 s.' },
];

export const HAMMER_BY_ID: Record<string, HammerDef> = Object.fromEntries(HAMMERS.map((h) => [h.id, h]));

// ---------------------------------------------------------------- Stat computation

export interface MetaBonuses {
  maxHp: number;
  deathDefiance: number;
  dmg: number;
  dashCharges: number;
  castAmmo: number;
  damageTaken: number;
}

export const NO_META: MetaBonuses = { maxHp: 0, deathDefiance: 0, dmg: 0, dashCharges: 0, castAmmo: 0, damageTaken: 1 };

export function computeStats(boons: readonly OwnedBoon[], hammers: readonly string[], meta: MetaBonuses = NO_META): PlayerStats {
  const s = baseStats();
  s.maxHp += meta.maxHp;
  s.deathDefiance += meta.deathDefiance;
  s.globalDmg += meta.dmg;
  s.dashCharges += meta.dashCharges;
  s.castAmmo += meta.castAmmo;
  s.damageTaken *= meta.damageTaken;
  for (const b of boons) {
    const def = BOON_BY_ID[b.id];
    if (!def) continue;
    def.apply(s, boonValue(def, b.rarity, b.level));
  }
  for (const h of hammers) s.hammers.add(h);
  return s;
}

// ---------------------------------------------------------------- Offers

export interface BoonOffer {
  id: string;
  rarity: Rarity;
  /** Owned boon this one would replace (same slot). */
  replaces?: string;
}

export function godsInBuild(boons: readonly OwnedBoon[]): GodId[] {
  const gods = new Set<GodId>();
  for (const b of boons) {
    const def = BOON_BY_ID[b.id];
    if (!def || def.god === 'hermes') continue;
    if (def.duoOf) def.duoOf.forEach((g) => gods.add(g));
    else gods.add(def.god);
  }
  return [...gods];
}

export type RarityOdds = Record<'common' | 'rare' | 'epic' | 'heroic', number>;

/**
 * Boon rarity at the start of each region: early boons are mostly Common, and
 * the rarer ones grow more likely the deeper the escape goes. Within a region
 * the odds climb chamber by chamber towards the next region's, so there is no
 * sudden jump at a region's gate. The very first boon of an escape is at most
 * Rare. (tests/boons.test.ts checks real offers against these.)
 */
export const BOON_RARITY_BY_REGION: RarityOdds[] = [
  { common: 0.925, rare: 0.07, epic: 0.005, heroic: 0 },
  { common: 0.85, rare: 0.12, epic: 0.025, heroic: 0.005 },
  { common: 0.775, rare: 0.15, epic: 0.06, heroic: 0.015 },
  { common: 0.71, rare: 0.165, epic: 0.095, heroic: 0.03 },
];
/** Where the last region's odds climb to, by its end. */
export const BOON_RARITY_END: RarityOdds = { common: 0.65, rare: 0.18, epic: 0.125, heroic: 0.045 };
const FIRST_BOON_ODDS: RarityOdds = { common: 0.95, rare: 0.05, epic: 0, heroic: 0 };
/** Per rank of Favor of the Gods. */
export const FAVOR_ODDS = { rare: 0.02, epic: 0.01, heroic: 0.0025 };

/** The base odds `progress` (0–1) of the way through region `region`. */
export function regionRarity(region: number, progress = 0): RarityOdds {
  const last = BOON_RARITY_BY_REGION.length - 1;
  const r = Math.max(0, Math.min(last, region));
  const from = BOON_RARITY_BY_REGION[r];
  const to = BOON_RARITY_BY_REGION[r + 1] ?? BOON_RARITY_END;
  const t = Math.max(0, Math.min(1, progress));
  const mix = (k: keyof RarityOdds) => from[k] + (to[k] - from[k]) * t;
  return { common: mix('common'), rare: mix('rare'), epic: mix('epic'), heroic: mix('heroic') };
}

/**
 * Rarity odds for a boon `progress` (0–1) of the way through region `region`
 * (0–3). Each rank of Favor of the Gods moves 3.25% from Common to the rarer
 * tiers.
 */
export function boonRarityOdds(region: number, first = false, favor = 0, progress = 0): RarityOdds {
  const base = first ? FIRST_BOON_ODDS : regionRarity(region, progress);
  const f = first ? 0 : favor;
  const rare = base.rare + f * FAVOR_ODDS.rare;
  const epic = base.epic + f * FAVOR_ODDS.epic;
  const heroic = base.heroic + (region > 0 ? f * FAVOR_ODDS.heroic : 0);
  return { common: Math.max(0, 1 - rare - epic - heroic), rare, epic, heroic };
}

export function rollRarity(rng: Rng, odds: RarityOdds = boonRarityOdds(0)): Rarity {
  const r = rng.next();
  if (r < odds.heroic) return 'heroic';
  if (r < odds.heroic + odds.epic) return 'epic';
  if (r < odds.heroic + odds.epic + odds.rare) return 'rare';
  return 'common';
}

function isEligible(def: BoonDef, owned: readonly OwnedBoon[]): boolean {
  if (owned.some((b) => b.id === def.id)) return false;
  if (def.requiresAny && !def.requiresAny.some((id) => owned.some((b) => b.id === id))) return false;
  if (def.duoOf) {
    const gods = godsInBuild(owned.filter((b) => !BOON_BY_ID[b.id]?.duoOf));
    if (!def.duoOf.every((g) => gods.includes(g))) return false;
  }
  return true;
}

/**
 * Builds up to `count` boon choices from a god. Duo boons featuring the god
 * may be mixed in once their requirements are met.
 */
/** Boons that only make sense once Cast is unlocked. */
export function needsCast(def: BoonDef): boolean {
  return def.slot === 'cast' || def.id === 'hermes_reload' || def.id === 'hermes_shard';
}

export function rollBoonOffers(rng: Rng, god: GodId, owned: readonly OwnedBoon[], odds: RarityOdds = boonRarityOdds(0), count = 3, allow?: (def: BoonDef) => boolean): BoonOffer[] {
  const ok = (d: BoonDef) => isEligible(d, owned) && (!allow || allow(d));
  const pool = BOONS.filter((d) => d.slot !== 'duo' && d.god === god && ok(d));
  const duos = god === 'hermes' ? [] : BOONS.filter((d) => d.duoOf && d.duoOf.includes(god) && ok(d));
  // Prefer slot boons for empty slots early on.
  const picks: BoonDef[] = [];
  const shuffled = rng.shuffle([...pool]);
  if (duos.length > 0 && rng.chance(DUO_CHANCE)) picks.push(rng.pick(duos));
  for (const d of shuffled) {
    if (picks.length >= count) break;
    picks.push(d);
  }
  return picks.map((def) => {
    const offer: BoonOffer = { id: def.id, rarity: def.slot === 'duo' ? 'duo' : def.fixed ? 'common' : rollRarity(rng, odds) };
    if (def.slot !== 'passive' && def.slot !== 'duo') {
      const clash = owned.find((b) => BOON_BY_ID[b.id]?.slot === def.slot);
      if (clash) offer.replaces = clash.id;
    }
    return offer;
  });
}

/** Adds an offer to the build, replacing any boon in the same ability slot. */
export function takeBoon(owned: OwnedBoon[], offer: BoonOffer): OwnedBoon[] {
  const def = BOON_BY_ID[offer.id];
  const next = owned.filter((b) => {
    const d = BOON_BY_ID[b.id];
    return !(def.slot !== 'passive' && def.slot !== 'duo' && d?.slot === def.slot);
  });
  next.push({ id: offer.id, rarity: offer.rarity, level: 1 });
  return next;
}

/** Boons that can be levelled up with a Pomegranate. */
export function pomCandidates(owned: readonly OwnedBoon[]): OwnedBoon[] {
  return owned.filter((b) => {
    const d = BOON_BY_ID[b.id];
    return d && !d.fixed && d.slot !== 'duo';
  });
}

export function rollHammerOffers(rng: Rng, weapon: WeaponId, owned: readonly string[], count = 3): HammerDef[] {
  const pool = HAMMERS.filter((h) => h.weapon === weapon && !owned.includes(h.id));
  return rng.shuffle([...pool]).slice(0, count);
}

/** Which gods may appear behind doors given the current build. */
export function availableGods(owned: readonly OwnedBoon[]): GodId[] {
  const gods = godsInBuild(owned);
  return gods.length >= MAX_GODS_PER_RUN ? gods : OLYMPIANS;
}
