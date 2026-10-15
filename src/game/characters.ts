import { audio } from '../engine/audio';
import { fx, TAU } from '../engine/math';
import { applyChill, applyDoom, damageEnemy, playerBlast } from './combat';
import type { Enemy } from './enemies/enemy';
import type { SaveData } from './meta';
import type { PlayerStats } from './stats';
import type { WeaponId } from './types';
import type { World } from './world';

export type CharacterId = 'kael' | 'lyra' | 'doran' | 'gorran' | 'ione' | 'erebos' | 'rook' | 'selene';

export interface Palette {
  cloak: string;
  trim: string;
  tunic: string;
  skin: string;
  hair: string;
  /** Headwear and its glow. */
  crown: 'flame' | 'hood' | 'helm' | 'circlet' | 'horns' | 'halo';
  glow: string;
}

/**
 * How a class guards. `parry`: blades, the widest parry window. `shield`: a
 * tower shield that blocks everything from the front (Attack while guarding
 * bashes). `evade`: ranged classes sidestep instead (a sidestep right before
 * a hit is a Perfect Dodge). `catch`: brawlers catch and counter. `mist`:
 * blocked damage turns to souls.
 */
export type GuardStyle = 'parry' | 'shield' | 'evade' | 'catch' | 'mist';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  title: string;
  /** The class this hero plays, and the signature weapon that comes with it. */
  role: string;
  weapon: WeaponId;
  color: string;
  blurb: string;
  perks: string[];
  guard: GuardStyle;
  palette: Palette;
  /** How the hero is unlocked (`null` for the starting heroes); `or` is a second way in. */
  unlock: { kind: 'level' | 'bosses' | 'escapes'; n: number; text: string; or?: { kind: 'bosses' | 'escapes'; n: number } } | null;
  apply: (s: PlayerStats) => void;
  wrath: { name: string; desc: string; use: (w: World) => void };
}

/** Foes the Wrath of a hero can reach (roughly what's on screen). */
function targets(w: World, r = 900): Enemy[] {
  const p = w.player;
  return w.enemiesInRadius(p.x, p.y, r).filter((e) => !e.dead && !e.spawning);
}

function wrathFlash(w: World, color: string, title: string): void {
  const p = w.player;
  w.slowMotion(0.35, 0.35);
  w.camera.shake(0.6);
  w.flashLight(p.x, p.y, 900, color, 0.6);
  w.particles.ring(p.x, p.y, color, 140, 0.4, 10);
  w.particles.text(p.x, p.y, 100, title, color, 28);
  p.iframes = Math.max(p.iframes, 1);
  audio.play('roar', 0.35);
  audio.play('explode');
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'kael',
    name: 'Kael',
    title: 'Prince of Embers',
    role: 'Warrior',
    weapon: 'sword',
    color: '#ff6a5a',
    blurb: 'The runaway heir of the Underworld. Steady in every fight.',
    perks: ['Balanced: no strengths, no weaknesses', '+10% Wrath gain'],
    guard: 'parry',
    palette: { cloak: '#2b1830', trim: '#c2263a', tunic: '#5b1a26', skin: '#e8c7a8', hair: '#1a0d14', crown: 'flame', glow: '#ff7a3a' },
    unlock: null,
    apply: (s) => (s.wrathGain += 0.1),
    wrath: {
      name: 'Inferno Nova',
      desc: 'A ring of hellfire bursts outward three times, burning everything it touches.',
      use: (w) => {
        const p = w.player;
        wrathFlash(w, '#ff7a3a', 'INFERNO NOVA');
        [0, 0.22, 0.44].forEach((t, i) =>
          w.later(t, () => {
            const r = 170 + i * 110;
            playerBlast(w, p.x, p.y, r, 70, {
              color: i === 1 ? '#ffd04a' : '#ff5a2a',
              knock: 420,
              onEnemy: (e) => (e.status.burn = { t: 4, dps: 20, tick: 0.5 }),
            });
            w.particles.burst(p.x, p.y, '#ffb050', 40, r * 3);
            w.camera.shake(0.3);
          }),
        );
      },
    },
  },
  {
    id: 'lyra',
    name: 'Lyra',
    title: 'Moon Huntress',
    role: 'Ranger',
    weapon: 'bow',
    color: '#9dff9a',
    blurb: 'A huntress who slipped her tether to the stars. Fast and precise, but frail.',
    perks: ['+12% move speed', '+8% critical chance', '−10 max Health'],
    guard: 'evade',
    palette: { cloak: '#1d2a1e', trim: '#9dff9a', tunic: '#2e4a30', skin: '#f0d0b8', hair: '#d8d8f0', crown: 'hood', glow: '#c8f0ff' },
    unlock: null,
    apply: (s) => {
      s.moveSpeed += 0.12;
      s.maxHp -= 10;
      for (const k of Object.keys(s.critChance) as (keyof PlayerStats['critChance'])[]) s.critChance[k] += 0.08;
    },
    wrath: {
      name: 'Moonfall',
      desc: 'Beams of moonlight strike every foe in sight three times.',
      use: (w) => {
        wrathFlash(w, '#c8f0ff', 'MOONFALL');
        const foes = targets(w);
        for (let k = 0; k < 3; k++) {
          for (const e of foes) {
            w.later(0.12 + k * 0.28 + fx.range(0, 0.1), () => {
              if (e.dead) return;
              w.addBolt(e.x + fx.range(-30, 30), e.y, e.x, e.y, '#d8f4ff', 520, 10);
              w.particles.ring(e.x, e.y, '#c8f0ff', 50, 0.25, 4);
              damageEnemy(w, e, 45, { source: 'effect', crit: 0.25, noEffects: true, color: '#d8f4ff' });
            });
          }
        }
      },
    },
  },
  {
    id: 'doran',
    name: 'Doran',
    title: 'The Bronze Wall',
    role: 'Vanguard',
    weapon: 'spear',
    color: '#ffb14a',
    blurb: 'A fallen shield-bearer who still holds the line. Slow, sturdy and hard to kill.',
    perks: ['+30 max Health', 'Take 12% less damage', '−8% move speed'],
    guard: 'shield',
    palette: { cloak: '#2a2016', trim: '#ffb14a', tunic: '#6a4a24', skin: '#d8b090', hair: '#3a2410', crown: 'helm', glow: '#ffd08a' },
    unlock: null,
    apply: (s) => {
      s.maxHp += 30;
      s.damageTaken *= 0.88;
      s.moveSpeed -= 0.08;
    },
    wrath: {
      name: "Titan's Quake",
      desc: 'Three quakes roll out from you, stunning and crushing foes.',
      use: (w) => {
        const p = w.player;
        wrathFlash(w, '#ffb14a', "TITAN'S QUAKE");
        [0, 0.3, 0.6].forEach((t, i) =>
          w.later(t, () => {
            const r = 200 + i * 120;
            playerBlast(w, p.x, p.y, r, 60 + i * 15, {
              color: '#ffb14a',
              knock: 300,
              onEnemy: (e) => (e.status.stun = Math.max(e.status.stun ?? 0, e.isBoss ? 0.6 : 2.5)),
            });
            w.particles.burst(p.x, p.y, '#8a7060', 30, r * 2, { kind: 'smoke', size: 14, gravity: 0, life: 0.8, additive: false });
            w.camera.shake(0.5);
          }),
        );
      },
    },
  },
  {
    id: 'gorran',
    name: 'Gorran',
    title: 'The Unchained Fist',
    role: 'Brawler',
    weapon: 'fists',
    color: '#c8ff5a',
    blurb: 'A pit fighter who broke his own chains. He fights up close and never stops swinging.',
    perks: ['Combo meter builds twice as fast', '+20 max Health'],
    guard: 'catch',
    palette: { cloak: '#2a1a10', trim: '#c8ff5a', tunic: '#4a3a20', skin: '#c89070', hair: '#1a1008', crown: 'circlet', glow: '#c8ff5a' },
    unlock: { kind: 'level', n: 7, text: 'Reach level 7 or slay a guardian', or: { kind: 'bosses', n: 1 } },
    apply: (s) => (s.maxHp += 20),
    wrath: {
      name: 'Hundred Fists',
      desc: 'A storm of punches in front of you, ending in a crushing blast.',
      use: (w) => {
        const p = w.player;
        wrathFlash(w, '#c8ff5a', 'HUNDRED FISTS');
        for (let i = 0; i < 20; i++) {
          w.later(i * 0.05, () => {
            const a = p.aim + (Math.random() - 0.5) * 1.1;
            const d = fx.range(40, 150);
            const x = p.x + Math.cos(a) * d;
            const y = p.y + Math.sin(a) * d;
            for (const e of w.enemiesInRadius(x, y, 50)) damageEnemy(w, e, 15, { source: 'effect', from: p, knock: 80 });
            w.particles.burst(x, y - 20, '#c8ff5a', 5, 180);
          });
        }
        w.later(1.05, () => {
          playerBlast(w, p.x + Math.cos(p.aim) * 60, p.y + Math.sin(p.aim) * 60, 200, 80, { color: '#c8ff5a', knock: 600 });
          w.camera.shake(0.5);
        });
      },
    },
  },
  {
    id: 'ione',
    name: 'Ione',
    title: 'Tidecaller',
    role: 'Monk',
    weapon: 'nunchaku',
    color: '#5ac8ff',
    blurb: 'A nymph of the black river who bends its currents to her will.',
    perks: ['+1 Cast shard (once Cast is unlocked)', '+20% Special damage', '+15% knockback'],
    guard: 'catch',
    palette: { cloak: '#10283a', trim: '#5ac8ff', tunic: '#1c4a66', skin: '#e0d0e8', hair: '#2a6a8a', crown: 'circlet', glow: '#8ae0ff' },
    unlock: { kind: 'level', n: 10, text: 'Reach level 10 or slay 3 guardians', or: { kind: 'bosses', n: 3 } },
    apply: (s) => {
      if (s.canCast) s.castAmmo += 1;
      s.dmgBonus.special += 0.2;
      s.knockMult += 0.15;
    },
    wrath: {
      name: 'Tidal Surge',
      desc: 'A tidal wave hurls every nearby foe away, chilling them to the bone.',
      use: (w) => {
        const p = w.player;
        wrathFlash(w, '#5ac8ff', 'TIDAL SURGE');
        for (let i = 0; i < 4; i++) w.later(i * 0.08, () => w.particles.ring(p.x, p.y, i % 2 ? '#ffffff' : '#5ac8ff', 220 + i * 90, 0.5, 12));
        playerBlast(w, p.x, p.y, 520, 80, { color: '#5ac8ff', knock: 1100, onEnemy: (e) => applyChill(w, e, 10) });
      },
    },
  },
  {
    id: 'erebos',
    name: 'Erebos',
    title: 'The Hollow King',
    role: 'Reaper',
    weapon: 'scythe',
    color: '#c86bff',
    blurb: 'A forgotten king who feeds on the echoes of the slain.',
    perks: ['+10% damage', 'Restore 2 Health per foe slain', '+50% Echoes gathered', '−15 max Health'],
    guard: 'mist',
    palette: { cloak: '#140c1e', trim: '#c86bff', tunic: '#2a1440', skin: '#c8c0d8', hair: '#0a0610', crown: 'horns', glow: '#d090ff' },
    unlock: { kind: 'level', n: 14, text: 'Reach level 14 or slay 6 guardians', or: { kind: 'bosses', n: 6 } },
    apply: (s) => {
      s.globalDmg += 0.1;
      s.lifeOnKill += 2;
      s.soulGain += 0.5;
      s.maxHp -= 15;
    },
    wrath: {
      name: 'Eclipse',
      desc: 'Darkness falls: every foe in sight is stunned and Doomed, and you drink their life.',
      use: (w) => {
        const p = w.player;
        wrathFlash(w, '#c86bff', 'ECLIPSE');
        w.eclipseT = 3;
        for (const e of targets(w)) {
          e.status.stun = Math.max(e.status.stun ?? 0, e.isBoss ? 1 : 3);
          e.status.doom = undefined;
          applyDoom(e, 140);
          w.addBolt(p.x, p.y, e.x, e.y, '#c86bff', 30, 20);
        }
        w.healPlayer(p.maxHp * 0.2, true);
      },
    },
  },
  {
    id: 'rook',
    name: 'Rook',
    title: 'The Powder Ghost',
    role: 'Gunner',
    weapon: 'blunderbuss',
    color: '#ffb060',
    blurb: 'A smuggler of black powder who blew a hole in the Underworld and walked in. Loud, and close.',
    perks: ['Hits on foes close to you deal +30% damage', '+15% knockback'],
    guard: 'evade',
    palette: { cloak: '#241a14', trim: '#ffb060', tunic: '#4a3020', skin: '#e0b898', hair: '#3a2014', crown: 'hood', glow: '#ffb060' },
    unlock: { kind: 'level', n: 18, text: 'Reach level 18 or escape once', or: { kind: 'escapes', n: 1 } },
    apply: (s) => (s.knockMult *= 1.15),
    wrath: {
      name: 'Cannonade',
      desc: 'Cannon shots rain down on the foes around you.',
      use: (w) => {
        const p = w.player;
        wrathFlash(w, '#ffb060', 'CANNONADE');
        const foes = targets(w, 700);
        for (let i = 0; i < 7; i++) {
          const e = foes.length ? foes[i % foes.length] : null;
          const a = Math.random() * TAU;
          const x = e ? e.x : p.x + Math.cos(a) * fx.range(100, 320);
          const y = e ? e.y : p.y + Math.sin(a) * fx.range(80, 260);
          w.telegraphs.push({
            shape: { type: 'circle', x, y, r: 110 },
            t: 0,
            dur: 0.25 + i * 0.14,
            color: 'rgba(255,176,96,1)',
            owner: null,
            onDone: () => {
              playerBlast(w, x, y, 110, 90, { color: '#ffb060', knock: 480 });
              w.camera.shake(0.3);
            },
          });
        }
      },
    },
  },
  {
    id: 'selene',
    name: 'Selene',
    title: 'Starbound',
    role: 'Duelist',
    weapon: 'katana',
    color: '#fff0a0',
    blurb: 'A star that fell into the dark and refuses to go out.',
    perks: ['+1 Dash charge', '+15% Attack damage', 'Dash recharges 20% faster'],
    guard: 'parry',
    palette: { cloak: '#1a1830', trim: '#fff0a0', tunic: '#3a3460', skin: '#f4e0d0', hair: '#fff4d0', crown: 'halo', glow: '#fff0a0' },
    unlock: { kind: 'level', n: 22, text: 'Reach level 22 or escape 3 times', or: { kind: 'escapes', n: 3 } },
    apply: (s) => {
      s.dashCharges += 1;
      s.dmgBonus.attack += 0.15;
      s.dashRecharge *= 0.8;
    },
    wrath: {
      name: 'Starfall',
      desc: 'A storm of falling stars pounds the area around you.',
      use: (w) => {
        const p = w.player;
        wrathFlash(w, '#fff0a0', 'STARFALL');
        const foes = targets(w, 700);
        for (let i = 0; i < 16; i++) {
          const e = foes.length && i % 2 === 0 ? foes[i % foes.length] : null;
          const a = Math.random() * TAU;
          const d = fx.range(60, 380);
          const x = e ? e.x : p.x + Math.cos(a) * d;
          const y = e ? e.y : p.y + Math.sin(a) * d * 0.8;
          const t = 0.1 + i * 0.09;
          w.telegraphs.push({
            shape: { type: 'circle', x, y, r: 80 },
            t: 0,
            dur: t + 0.25,
            color: 'rgba(255,240,160,1)',
            owner: null,
            onDone: () => {
              w.addBolt(x - 120, y, x, y, '#fff0a0', 600, 0);
              playerBlast(w, x, y, 80, 55, { color: '#fff0a0', knock: 250 });
            },
          });
        }
      },
    },
  },
];

export const CHARACTER_BY_ID: Record<CharacterId, CharacterDef> = Object.fromEntries(CHARACTERS.map((c) => [c.id, c])) as Record<CharacterId, CharacterDef>;

export function isCharacterId(id: unknown): id is CharacterId {
  return typeof id === 'string' && id in CHARACTER_BY_ID;
}

/** Whether a hero's unlock condition is met (starting heroes always are). */
export function characterUnlocked(c: CharacterDef, save: SaveData, level: number): boolean {
  const u = c.unlock;
  if (!u) return true;
  const met = (kind: 'level' | 'bosses' | 'escapes', n: number) => (kind === 'level' ? level >= n : kind === 'bosses' ? save.stats.bossesSlain >= n : save.stats.escapes >= n);
  return met(u.kind, u.n) || (!!u.or && met(u.or.kind, u.or.n));
}

/** The hero who wields a weapon. */
export function heroForWeapon(w: WeaponId): CharacterDef {
  return CHARACTERS.find((c) => c.weapon === w) ?? CHARACTERS[0];
}
