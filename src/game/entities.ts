import type { GearItem, MaterialId } from './gear';
import type { Actor } from './actor';
import type { DamageSource, GodId, RewardSpec, Shape, Team } from './types';
import type { World } from './world';

export type ProjStyle = 'orb' | 'arrow' | 'bolt' | 'glob' | 'shard' | 'spear' | 'fire' | 'needle' | 'bomb' | 'crescent';

export class Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r = 8;
  team: Team;
  damage: number;
  source: DamageSource;
  ttl = 3;
  /** Additional actors it may pass through. */
  pierce = 0;
  hit = new Set<number>();
  color = '#ff5040';
  style: ProjStyle = 'orb';
  dead = false;
  deflectable = true;
  /** Steering rate toward the nearest foe (radians/sec). */
  homing = 0;
  knock = 120;
  z = 18;
  owner: Actor | null = null;
  /** Lobbed projectiles fly in an arc and only interact where they land. */
  lob: { sx: number; sy: number; tx: number; ty: number; t: number; dur: number; h: number } | null = null;
  /** Crackles with lightning after a Lightning Phalanx deflect. */
  charged = false;
  /** Blocked by walls and obstacles. */
  hitsWalls = true;
  crit = 0;
  god: GodId | null = null;
  onHit: ((w: World, target: Actor) => void) | null = null;
  /** Called when the projectile stops (wall, max range, lob landing). */
  onEnd: ((w: World) => void) | null = null;
  age = 0;

  constructor(x: number, y: number, vx: number, vy: number, team: Team, damage: number, source: DamageSource) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.team = team;
    this.damage = damage;
    this.source = source;
  }

  get angle(): number {
    return Math.atan2(this.vy, this.vx);
  }
}

export type ZoneKind = 'bladeRift' | 'fog' | 'fire' | 'storm' | 'frost' | 'poison' | 'heal' | 'web';

export class Zone {
  x: number;
  y: number;
  r: number;
  ttl: number;
  maxTtl: number;
  team: Team;
  kind: ZoneKind;
  interval = 0.25;
  tickT = 0;
  damage: number;
  source: DamageSource;
  dead = false;
  /** Custom per-tick behaviour; when null, damages every opposing actor inside. */
  onTick: ((w: World, z: Zone) => void) | null = null;
  /** Called with each actor hit by the default tick. */
  onActor: ((w: World, a: Actor) => void) | null = null;
  crit = 0;
  age = 0;
  /** The hero who made it (party play: their damage and kills). */
  owner: Actor | null = null;

  constructor(kind: ZoneKind, x: number, y: number, r: number, ttl: number, team: Team, damage: number, source: DamageSource) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.r = r;
    this.ttl = ttl;
    this.maxTtl = ttl;
    this.team = team;
    this.damage = damage;
    this.source = source;
  }
}

export type PickupKind = 'gold' | 'heal' | 'shard' | 'reward' | 'ash' | 'soul' | 'loot';

/** What a 'loot' pickup holds: crafting materials or a piece of gear. */
export interface Loot {
  material?: MaterialId;
  count?: number;
  gear?: GearItem;
}

export class Pickup {
  x: number;
  y: number;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  kind: PickupKind;
  value: number;
  reward: RewardSpec | null = null;
  loot: Loot | null = null;
  collected = false;
  t = 0;
  /** Seconds before it can be collected (lets drops pop out first). */
  delay = 0.35;
  r = 14;
  /** Cast shards stay lodged in a foe until it dies (or a while passes). */
  attached: Actor | null = null;
  /** Rides with the player toward them once in range. */
  magnet = false;
  /** A cast shard goes back to the hero who threw it. */
  owner: Actor | null = null;

  constructor(kind: PickupKind, x: number, y: number, value = 0) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.value = value;
  }
}

export interface Hitbox {
  team: Team;
  shape: Shape;
  damage: number;
  source: DamageSource;
  knock: number;
  /** Seconds remaining while active. */
  ttl: number;
  hit: Set<number>;
  owner: Actor | null;
  deflects?: boolean;
  /** Visual-only flag for weapon trails. */
  tag?: string;
  /** Multiplier applied vs. armour (hammer upgrades). */
  armorMult?: number;
  /** Bonus multiplier when striking from behind. */
  backstabMult?: number;
  /** Heal per hit (Cursed Slash). */
  lifesteal?: number;
  /** Extra crit chance on this hit. */
  crit?: number;
  hitstop?: number;
  /** Ring shapes expand by this many units per second (shockwaves). */
  grow?: number;
  /** Re-centre on the owner every frame. */
  follow?: boolean;
  offset?: { x: number; y: number };
  onHit?: (w: World, target: Actor) => void;
}

export interface Telegraph {
  shape: Shape;
  t: number;
  dur: number;
  color: string;
  owner: Actor | null;
  onDone: (() => void) | null;
  /** Cancelled telegraphs fade without firing. */
  cancelled?: boolean;
}
