import { audio } from '../engine/audio';
import type { Rng } from '../engine/math';
import { damageEnemy, type DamageOpts, playerBlast } from './combat';
import type { Enemy } from './enemies/enemy';
import { Zone } from './entities';
import type { PlayerStats } from './stats';
import type { World } from './world';

/**
 * Enchantments are a third, god-independent build layer inspired by
 * dungeon-crawler gear: each can be raised to tier III by finding it again.
 */
export interface EnchantDef {
  id: string;
  name: string;
  glyph: string;
  color: string;
  desc: (tier: number) => string;
}

export interface OwnedEnchant {
  id: string;
  tier: number;
}

export const MAX_ENCHANT_TIER = 3;

const T = <V>(tier: number, values: readonly V[]): V => values[Math.max(0, Math.min(values.length - 1, tier - 1))];
const pct = (v: number) => `${Math.round(v * 100)}%`;

export const ECHO = [0.15, 0.25, 0.35];
export const CHAINS = [0.1, 0.18, 0.26];
export const EXPLODING = [0.2, 0.35, 0.5];
export const LEECHING = [2, 3, 4];
export const RAMPAGING = [0.1, 0.15, 0.2];
export const COMMITTED = [0.3, 0.5, 0.7];
export const STUNNING = [0.05, 0.09, 0.13];
export const RADIANCE = [0.06, 0.1, 0.14];
export const BURNING = [3, 5, 7];

export const ENCHANTS: EnchantDef[] = [
  { id: 'echo', name: 'Reverberation', glyph: '≋', color: '#c9b8ff', desc: (t) => `Your Attack has a ${pct(T(t, ECHO))} chance to strike again a moment later.` },
  { id: 'chains', name: 'Shackling', glyph: '⛓', color: '#b0b8c8', desc: (t) => `Hits have a ${pct(T(t, CHAINS))} chance to chain nearby foes to your target, rooting them.` },
  { id: 'exploding', name: 'Combustion', glyph: '✹', color: '#ff9a4a', desc: (t) => `Slain foes explode, dealing ${pct(T(t, EXPLODING))} of their max Health to foes nearby.` },
  { id: 'leeching', name: 'Bloodthirst', glyph: '✚', color: '#ff5a7a', desc: (t) => `Slaying a foe restores ${T(t, LEECHING)} Health.` },
  { id: 'rampaging', name: 'Frenzy', glyph: '⚡', color: '#ffd04a', desc: (t) => `Slaying a foe has a ${pct(T(t, RAMPAGING))} chance to grant +50% attack speed for 5s.` },
  { id: 'committed', name: 'Executioner', glyph: '⚔', color: '#ff6a5a', desc: (t) => `Deal up to +${pct(T(t, COMMITTED))} damage to wounded foes.` },
  { id: 'gravity', name: 'Singularity', glyph: '◎', color: '#9b7bff', desc: (t) => `Your Special and Jump Slam pull foes toward the impact (radius +${40 * t}).` },
  { id: 'stunning', name: 'Concussive', glyph: '✦', color: '#ffe680', desc: (t) => `Hits have a ${pct(T(t, STUNNING))} chance to stun foes for 1.5s.` },
  { id: 'radiance', name: 'Bloom', glyph: '☀', color: '#9dff9a', desc: (t) => `Hits have a ${pct(T(t, RADIANCE))} chance to bloom a healing circle around you.` },
  { id: 'prospector', name: 'Treasure Sense', glyph: '◆', color: '#ffd76a', desc: (t) => `Find +${30 * t}% more obols and more treasure chests.` },
  { id: 'siphon', name: 'Soul Harvest', glyph: '✧', color: '#7fe8ff', desc: (t) => `Hits have a 12% chance to grant ${2 + t} souls for your artifacts.` },
  { id: 'swirling', name: 'Whirling', glyph: '✺', color: '#d8c8ff', desc: (t) => `Your Dash-Strike and Jump Slam release a spinning strike dealing ${10 + 15 * t} damage around you.` },
  { id: 'burning', name: 'Searing', glyph: '♨', color: '#ff7a3a', desc: (t) => `Hits set foes ablaze for ${T(t, BURNING)} damage per second.` },
];

export const ENCHANT_BY_ID: Record<string, EnchantDef> = Object.fromEntries(ENCHANTS.map((e) => [e.id, e]));

export function applyEnchantStats(s: PlayerStats, owned: readonly OwnedEnchant[]): void {
  for (const e of owned) s.ench[e.id] = e.tier;
  const prospect = s.ench.prospector ?? 0;
  s.goldMult += prospect * 0.3;
  s.chestChance += prospect * 0.1;
}

export interface EnchantOffer {
  id: string;
  tier: number;
}

export function rollEnchantOffers(rng: Rng, owned: readonly OwnedEnchant[], count = 3): EnchantOffer[] {
  const pool = ENCHANTS.filter((e) => (owned.find((o) => o.id === e.id)?.tier ?? 0) < MAX_ENCHANT_TIER);
  return rng
    .shuffle([...pool])
    .slice(0, count)
    .map((e) => ({ id: e.id, tier: (owned.find((o) => o.id === e.id)?.tier ?? 0) + 1 }));
}

export function takeEnchant(owned: OwnedEnchant[], offer: EnchantOffer): OwnedEnchant[] {
  const next = owned.filter((o) => o.id !== offer.id);
  next.push({ id: offer.id, tier: Math.min(MAX_ENCHANT_TIER, offer.tier) });
  return next;
}

/** Extra multiplier from Committed. */
export function committedBonus(s: PlayerStats, e: Enemy): number {
  const t = s.ench.committed ?? 0;
  if (!t) return 0;
  return T(t, COMMITTED) * (1 - Math.max(0, e.hp) / e.maxHp);
}

/** Enchant triggers when a player ability lands. */
export function onAbilityHit(w: World, e: Enemy, base: number, o: DamageOpts): void {
  const s = w.stats;
  const ench = s.ench;
  if (ench.echo && o.source === 'attack' && !o.echo && Math.random() < T(ench.echo, ECHO)) {
    w.later(0.22, () => {
      if (e.dead) return;
      w.particles.ring(e.x, e.y, '#c9b8ff', 40, 0.25, 3);
      damageEnemy(w, e, base, { ...o, echo: true, hitstop: 0 });
    });
  }
  if (ench.chains && Math.random() < T(ench.chains, CHAINS)) {
    for (const other of w.enemiesInRadius(e.x, e.y, 230)) {
      if (other === e || other.isBoss) continue;
      other.knock(e.x - other.x, e.y - other.y, 520);
      other.status.stun = Math.max(other.status.stun ?? 0, 1);
      w.addBolt(e.x, e.y, other.x, other.y, '#b0b8c8', 20, 20);
    }
    e.status.stun = Math.max(e.status.stun ?? 0, e.isBoss ? 0.2 : 1);
  }
  if (ench.stunning && Math.random() < T(ench.stunning, STUNNING)) {
    e.status.stun = Math.max(e.status.stun ?? 0, e.isBoss ? 0.3 : 1.5);
    w.particles.text(e.x, e.y, e.height + 24, 'STUN', '#ffe680', 13);
  }
  if (ench.radiance && Math.random() < T(ench.radiance, RADIANCE)) {
    const p = w.player;
    const z = new Zone('heal', p.x, p.y, 95, 2.5, 'player', 0, 'effect');
    z.interval = 0.5;
    const heal = 1 + ench.radiance * 0.5;
    z.onTick = (ww, zone) => {
      const pl = ww.player;
      if (Math.hypot(pl.x - zone.x, pl.y - zone.y) < zone.r) ww.healPlayer(heal, false);
    };
    w.zones.push(z);
  }
  if (ench.siphon && Math.random() < 0.12) w.gainSouls(2 + ench.siphon);
  if (ench.burning) {
    const dps = T(ench.burning, BURNING);
    const b = e.status.burn;
    if (b) {
      b.t = 3;
      b.dps = Math.max(b.dps, dps);
    } else e.status.burn = { t: 3, dps, tick: 0.5 };
  }
}

/** Enchant triggers when a foe dies. */
export function onEnemyKilled(w: World, e: Enemy): void {
  const ench = w.stats.ench;
  if (e.isDummy) return;
  if (ench.exploding) {
    const dmg = Math.min(160, e.maxHp * T(ench.exploding, EXPLODING));
    audio.play('explode');
    playerBlast(w, e.x, e.y, 120, dmg, { color: '#ff9a4a', knock: 260 });
  }
  if (ench.leeching) w.healPlayer(T(ench.leeching, LEECHING), false);
  if (ench.rampaging && Math.random() < T(ench.rampaging, RAMPAGING)) {
    w.player.rampageT = 5;
    w.particles.text(w.player.x, w.player.y, 80, 'RAMPAGE', '#ffd04a', 16);
  }
}
