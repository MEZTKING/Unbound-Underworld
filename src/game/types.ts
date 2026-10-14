export type Team = 'player' | 'enemy';

export type DamageSource =
  | 'attack'
  | 'special'
  | 'cast'
  | 'dash'
  | 'effect'
  | 'hazard'
  | 'enemy'
  | 'retaliate';

/** Player-side ability slots that boons can occupy. */
export type AbilitySlot = 'attack' | 'special' | 'cast' | 'dash';
export type BoonSlot = AbilitySlot | 'passive' | 'duo';

export type GodId =
  | 'zeus'
  | 'poseidon'
  | 'athena'
  | 'ares'
  | 'aphrodite'
  | 'artemis'
  | 'dionysus'
  | 'demeter'
  | 'hermes';

export type Rarity = 'common' | 'rare' | 'epic' | 'heroic' | 'duo';

export type WeaponId = 'sword' | 'spear' | 'bow';

export type BiomeId = 'tartarus' | 'asphodel' | 'elysium' | 'styx';

export type RewardKind =
  | 'boon'
  | 'pom'
  | 'gold'
  | 'heart'
  | 'ash'
  | 'hammer'
  | 'hermes'
  | 'shop'
  | 'fountain'
  | 'boss'
  | 'antechamber'
  | 'enchant'
  | 'artifact';

export interface RewardSpec {
  kind: RewardKind;
  god?: GodId;
  /** Extra loot (chests, shop) that doesn't unlock the exits. */
  bonus?: boolean;
}

export type Shape =
  | { type: 'circle'; x: number; y: number; r: number }
  | { type: 'arc'; x: number; y: number; r: number; angle: number; half: number }
  | { type: 'capsule'; x1: number; y1: number; x2: number; y2: number; r: number }
  | { type: 'ring'; x: number; y: number; r1: number; r2: number };

/** A god's on-hit curse attached to an attack or special. */
export type HitEffect =
  | { kind: 'bolt'; dmg: number }
  | { kind: 'chain'; dmg: number; bounces: number }
  | { kind: 'knock'; force: number }
  | { kind: 'deflect' }
  | { kind: 'doom'; dmg: number }
  | { kind: 'weak' }
  | { kind: 'crit'; chance: number }
  | { kind: 'hangover'; dps: number }
  | { kind: 'chill' };

/** God-flavoured behaviour for the cast or dash. */
export interface GodPower {
  god: GodId;
  power: number;
}

export type EnemyKind =
  | 'grunt'
  | 'skitter'
  | 'brute'
  | 'caster'
  | 'bomber'
  | 'spinner'
  | 'charger'
  | 'shield'
  | 'hissling'
  | 'weaver'
  | 'bonecaller'
  | 'mimic'
  | 'dummy';

export type BossKind = 'fury' | 'hydra' | 'talos' | 'cerberus';

/** Enchanted-foe modifiers (elite variants). */
export type EliteMod = 'armored' | 'swift' | 'volatile' | 'regenerating';

export type RoomKind = 'hub' | 'combat' | 'shop' | 'fountain' | 'antechamber' | 'boss' | 'reward';
