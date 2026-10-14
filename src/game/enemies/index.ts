import type { BossKind, EnemyKind } from '../types';
import { Boss, Campe, Cerberus, Hydra, Talos } from './bosses';
import type { Enemy } from './enemy';
import { Bomber, Bonecaller, Brute, Caster, Charger, Dummy, Grunt, Hissling, Mimic, Shield, Skitter, Spinner, Weaver } from './types';

export function createEnemy(kind: EnemyKind, x: number, y: number, hpScale = 1): Enemy {
  switch (kind) {
    case 'grunt':
      return new Grunt(x, y, hpScale);
    case 'skitter':
      return new Skitter(x, y, hpScale);
    case 'brute':
      return new Brute(x, y, hpScale);
    case 'caster':
      return new Caster(x, y, hpScale);
    case 'bomber':
      return new Bomber(x, y, hpScale);
    case 'spinner':
      return new Spinner(x, y, hpScale);
    case 'charger':
      return new Charger(x, y, hpScale);
    case 'shield':
      return new Shield(x, y, hpScale);
    case 'hissling':
      return new Hissling(x, y, hpScale);
    case 'weaver':
      return new Weaver(x, y, hpScale);
    case 'bonecaller':
      return new Bonecaller(x, y, hpScale);
    case 'mimic':
      return new Mimic(x, y, hpScale);
    case 'dummy':
      return new Dummy(x, y);
  }
}

export function createBoss(kind: BossKind, x: number, y: number, scale = 1): Boss {
  switch (kind) {
    case 'fury':
      return new Campe(x, y, scale);
    case 'hydra':
      return new Hydra(x, y, scale);
    case 'talos':
      return new Talos(x, y, scale);
    case 'cerberus':
      return new Cerberus(x, y, scale);
  }
}

export { Boss };
