import type { Team } from './types';

let nextId = 1;

export interface Statuses {
  doom?: { t: number; dmg: number };
  weak?: { t: number };
  hangover?: { t: number; stacks: number; dps: number; tick: number };
  chill?: { t: number; stacks: number };
  burn?: { t: number; dps: number; tick: number };
  stun?: number;
}

/** Shared state for anything that can be hit: the player and enemies. */
export abstract class Actor {
  readonly id = nextId++;
  x = 0;
  y = 0;
  /** Self-propelled velocity. */
  vx = 0;
  vy = 0;
  /** Knockback velocity, decays quickly. */
  kx = 0;
  ky = 0;
  r = 16;
  hp = 1;
  maxHp = 1;
  armor = 0;
  maxArmor = 0;
  abstract team: Team;
  dead = false;
  /** White hit-flash timer. */
  flash = 0;
  /** 0 = normal knockback, 1 = immune. */
  knockResist = 0;
  facing = 0;
  status: Statuses = {};
  /** Draw height of the body (for bars, damage numbers, hit sparks). */
  height = 40;
  /** Never takes damage (e.g. while spawning or invulnerable phases). */
  invulnerable = false;
  /** Can be pushed by walls/other actors. */
  solid = true;
  /** Flying actors ignore lava and pits. */
  flying = false;
  /** How high the ground under it is raised (ledges), for drawing. */
  lift = 0;

  get alive(): boolean {
    return !this.dead;
  }

  knock(dx: number, dy: number, force: number): void {
    const l = Math.hypot(dx, dy) || 1;
    const f = force * (1 - this.knockResist);
    this.kx += (dx / l) * f;
    this.ky += (dy / l) * f;
  }
}
