// Rebuilding foes on a joined player's screen: the host names each foe, and
// this finds the class that draws it.
import { createBoss, createEnemy } from '../game/enemies';
import { HydraHead } from '../game/enemies/bosses';
import type { Enemy } from '../game/enemies/enemy';
import type { BossKind, EnemyKind } from '../game/types';

const ENEMY_KINDS: EnemyKind[] = ['grunt', 'skitter', 'brute', 'caster', 'bomber', 'spinner', 'charger', 'shield', 'hissling', 'weaver', 'bonecaller', 'mimic', 'dummy'];
const BOSS_KINDS: BossKind[] = ['fury', 'hydra', 'talos', 'cerberus'];

let byName: Map<string, () => Enemy> | null = null;

/** Every foe's display name → a function that makes a fresh one. */
export function foeFactories(): Map<string, () => Enemy> {
  if (byName) return byName;
  const map = new Map<string, () => Enemy>();
  for (const k of ENEMY_KINDS) map.set(createEnemy(k, 0, 0).name, () => createEnemy(k, 0, 0));
  for (const k of BOSS_KINDS) map.set(createBoss(k, 0, 0).name, () => createBoss(k, 0, 0));
  map.set(new HydraHead(0, 0, 1).name, () => new HydraHead(0, 0, 1));
  byName = map;
  return map;
}

/** A foe of the named kind (a plain one if the name is unknown). */
export function makeFoe(name: string): Enemy {
  const make = foeFactories().get(name) ?? foeFactories().get(createEnemy('grunt', 0, 0).name)!;
  return make();
}
