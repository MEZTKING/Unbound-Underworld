import { Rng } from '../engine/math';
import { ARTIFACTS } from './artifacts';
import { availableGods, computeStats, pomCandidates, rollHammerOffers, type OwnedBoon } from './boons';
import { applyEnchantStats, MAX_ENCHANT_TIER, type OwnedEnchant } from './enchants';
import type { GearRarity, MaterialId } from './gear';
import { applyMetaExtras, heatScale, metaBonuses, rank, type SaveData } from './meta';
import { DOOR_COUNT, DOOR_WEIGHT } from './odds';
import { hasFeature } from './progression';
import { BIOMES, type BiomeInfo } from './rooms';
import type { PlayerStats } from './stats';
import type { GodId, RewardKind, RewardSpec, RoomKind, WeaponId } from './types';

export interface RoomPlan {
  kind: RoomKind;
  reward: RewardSpec | null;
}

/** A saved escape: the run as it stood when its current chamber began. */
export interface RunSnapshot {
  v: 1;
  seed: number;
  rng: number;
  weapon: WeaponId;
  biomeIndex: number;
  depth: number;
  roomsCleared: number;
  boons: OwnedBoon[];
  hammers: string[];
  enchants: OwnedEnchant[];
  artifacts: (string | null)[];
  gold: number;
  ash: number;
  kills: number;
  bonusHp: number;
  deathDefiance: number;
  heat: number;
  time: number;
  current: RoomPlan;
  used: string[];
  /** Player state carried between chambers. */
  hp: number;
  souls: number;
  /** Loot gathered so far (added in v0.7). */
  spoils?: Spoils;
}

/** What an escape has gathered, for the Spoils list at its end. */
export interface Spoils {
  materials: Partial<Record<MaterialId, number>>;
  gear: { name: string; rarity: GearRarity }[];
}

/** Everything that lives for the duration of one escape attempt. */
export class Run {
  readonly seed: number;
  rng: Rng;
  weapon: WeaponId;
  biomeIndex = 0;
  /** Combat rooms cleared in the current biome. */
  depth = 0;
  roomsCleared = 0;
  boons: OwnedBoon[] = [];
  hammers: string[] = [];
  enchants: OwnedEnchant[] = [];
  artifacts: (string | null)[] = [null, null, null];
  gold = 0;
  ash = 0;
  kills = 0;
  bonusHp = 0;
  deathDefiance: number;
  heat: number;
  time = 0;
  /** Your level, which gates enchantments, artifacts and anvils behind doors. */
  level = 99;
  current: RoomPlan = { kind: 'combat', reward: { kind: 'boon' } };
  /** Per-biome once-only rooms and rewards. */
  used = new Set<string>();
  spoils: Spoils = { materials: {}, gear: [] };

  constructor(save: SaveData, seed = (Math.random() * 2 ** 31) | 0) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.weapon = save.weapon;
    this.heat = save.heat;
    this.deathDefiance = rank(save, 'defiance');
    this.gold = rank(save, 'fortune') * 40;
    if (save.startArtifact) this.artifacts[0] = save.startArtifact;
  }

  /** Captures the run (plus the player's health and souls) for saving. */
  snapshot(hp: number, souls: number): RunSnapshot {
    return {
      v: 1,
      seed: this.seed,
      rng: this.rng.state,
      weapon: this.weapon,
      biomeIndex: this.biomeIndex,
      depth: this.depth,
      roomsCleared: this.roomsCleared,
      boons: this.boons.map((b) => ({ ...b })),
      hammers: [...this.hammers],
      enchants: this.enchants.map((e) => ({ ...e })),
      artifacts: [...this.artifacts],
      gold: this.gold,
      ash: this.ash,
      kills: this.kills,
      bonusHp: this.bonusHp,
      deathDefiance: this.deathDefiance,
      heat: this.heat,
      time: this.time,
      current: { kind: this.current.kind, reward: this.current.reward ? { ...this.current.reward } : null },
      used: [...this.used],
      hp,
      souls,
      spoils: { materials: { ...this.spoils.materials }, gear: this.spoils.gear.map((g) => ({ ...g })) },
    };
  }

  /** Rebuilds a run from a snapshot. */
  static restore(save: SaveData, snap: RunSnapshot): Run {
    const run = new Run(save, snap.seed);
    run.rng.state = snap.rng;
    run.weapon = snap.weapon;
    run.biomeIndex = Math.max(0, Math.min(BIOMES.length - 1, snap.biomeIndex));
    run.depth = snap.depth;
    run.roomsCleared = snap.roomsCleared;
    run.boons = snap.boons.map((b) => ({ ...b }));
    run.hammers = [...snap.hammers];
    run.enchants = snap.enchants.map((e) => ({ ...e }));
    run.artifacts = [...snap.artifacts];
    run.gold = snap.gold;
    run.ash = snap.ash;
    run.kills = snap.kills;
    run.bonusHp = snap.bonusHp;
    run.deathDefiance = snap.deathDefiance;
    run.heat = snap.heat;
    run.time = snap.time;
    run.current = snap.current;
    run.used = new Set(snap.used);
    if (snap.spoils) run.spoils = { materials: { ...snap.spoils.materials }, gear: [...(snap.spoils.gear ?? [])] };
    return run;
  }

  get biome(): BiomeInfo {
    return BIOMES[this.biomeIndex];
  }

  get isFinalBiome(): boolean {
    return this.biomeIndex === BIOMES.length - 1;
  }

  favor(save: SaveData): number {
    return rank(save, 'favor');
  }

  computeStats(save: SaveData): PlayerStats {
    const s = computeStats(this.boons, this.hammers, metaBonuses(save));
    s.maxHp += this.bonusHp;
    applyMetaExtras(save, s);
    applyEnchantStats(s, this.enchants);
    return s;
  }

  scales(): { hp: number; dmg: number } {
    const h = heatScale(this.heat);
    return { hp: this.biome.hpScale * h.hp, dmg: this.biome.dmgScale * h.dmg };
  }

  ashMult(): number {
    return heatScale(this.heat).ash;
  }

  private onceKey(k: string): string {
    return `${this.biomeIndex}:${k}`;
  }
  markUsed(k: string): void {
    this.used.add(this.onceKey(k));
  }
  isUsed(k: string): boolean {
    return this.used.has(this.onceKey(k));
  }

  /** First room of the run (or of a new biome). */
  startPlan(): RoomPlan {
    const gods = availableGods(this.boons);
    if (this.biome.combatRooms === 0) return { kind: 'antechamber', reward: null };
    return { kind: 'combat', reward: { kind: 'boon', god: this.rng.pick(gods) } };
  }

  /** Rewards behind the exit doors of the room just cleared. */
  rollDoors(): RoomPlan[] {
    const b = this.biome;
    if (this.current.kind === 'boss') {
      if (this.isFinalBiome) return [];
      const next = BIOMES[this.biomeIndex + 1];
      if (next.combatRooms === 0) return [{ kind: 'antechamber', reward: { kind: 'antechamber' } }];
      return [{ kind: 'combat', reward: { kind: 'boon', god: this.rng.pick(availableGods(this.boons)) } }];
    }
    if (this.current.kind === 'antechamber') return [{ kind: 'boss', reward: { kind: 'boss' } }];
    if (this.depth >= b.combatRooms) return [{ kind: 'antechamber', reward: { kind: 'antechamber' } }];

    const n = this.rng.weighted<number>([...DOOR_COUNT]);
    const plans: RoomPlan[] = [];
    const usedGods = new Set<GodId>();
    const usedKinds = new Set<RewardKind>();
    for (let i = 0; i < n; i++) {
      const plan = this.rollOneDoor(usedKinds, usedGods);
      if (!plan) break;
      plans.push(plan);
    }
    if (plans.length === 0) plans.push({ kind: 'combat', reward: { kind: 'gold' } });
    return plans;
  }

  private rollOneDoor(usedKinds: Set<RewardKind>, usedGods: Set<GodId>): RoomPlan | null {
    const d = this.depth;
    const gods = availableGods(this.boons).filter((g) => !usedGods.has(g));
    const freeArtifacts = hasFeature(this.level, 'artifacts') && ARTIFACTS.filter((a) => !this.artifacts.includes(a.id)).length > 0;
    const enchantRoom = hasFeature(this.level, 'enchants') && (this.enchants.length < 13 || this.enchants.some((e) => e.tier < MAX_ENCHANT_TIER));
    const W = DOOR_WEIGHT;
    const options: [RewardKind, number][] = [
      ['boon', gods.length ? W.boon : 0],
      ['pom', pomCandidates(this.boons).length && !usedKinds.has('pom') ? W.pom : 0],
      ['gold', usedKinds.has('gold') ? 0 : W.gold],
      ['heart', usedKinds.has('heart') ? 0 : W.heart],
      ['ash', usedKinds.has('ash') ? 0 : W.ash],
      ['hammer', hasFeature(this.level, 'anvil') && !this.isUsed('hammer') && rollHammerOffers(this.rng, this.weapon, this.hammers).length && d >= 1 && !usedKinds.has('hammer') ? W.hammer : 0],
      ['hermes', !this.isUsed('hermes') && d >= 1 && !usedKinds.has('hermes') ? W.hermes : 0],
      ['enchant', enchantRoom && !usedKinds.has('enchant') ? W.enchant : 0],
      ['artifact', freeArtifacts && !usedKinds.has('artifact') ? W.artifact : 0],
      ['shop', !this.isUsed('shop') && d >= 2 && !usedKinds.has('shop') ? W.shop : 0],
      ['fountain', !this.isUsed('fountain') && d >= 2 && !usedKinds.has('fountain') ? W.fountain : 0],
    ];
    if (options.every(([, w]) => w <= 0)) return null;
    const kind = this.rng.weighted(options);
    usedKinds.add(kind);
    if (kind === 'boon') {
      const god = this.rng.pick(gods);
      usedGods.add(god);
      return { kind: 'combat', reward: { kind, god } };
    }
    if (kind === 'shop' || kind === 'fountain') return { kind, reward: { kind } };
    return { kind: 'combat', reward: { kind } };
  }

  /** Advances bookkeeping when entering a new room. */
  enter(plan: RoomPlan): void {
    if (this.current.kind === 'boss' && plan.kind !== 'boss') {
      this.biomeIndex = Math.min(BIOMES.length - 1, this.biomeIndex + 1);
      this.depth = 0;
    }
    if (plan.kind === 'shop') this.markUsed('shop');
    if (plan.kind === 'fountain') this.markUsed('fountain');
    this.current = plan;
  }

  /** Total rooms reached, used for "best depth" stats. */
  get progress(): number {
    return this.roomsCleared;
  }
}
