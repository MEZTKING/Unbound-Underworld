// The Codex: the bestiary of foes and guardians, and the achievements.

import { CHARACTERS, characterUnlocked } from './characters';
import { createBoss, createEnemy } from './enemies';
import { HydraHead } from './enemies/bosses';
import type { Enemy } from './enemies/enemy';
import type { SaveData } from './meta';
import { levelFromXp } from './progression';
import { BIOMES } from './rooms';
import type { BossKind, EnemyKind } from './types';

export interface FoeEntry {
  /** The foe's in-game name (kills are recorded under it). */
  name: string;
  guardian: boolean;
  behaviour: string;
  counter: string;
  /** Makes one, for its portrait and numbers. */
  make: () => Enemy;
}

const foe = (kind: EnemyKind, behaviour: string, counter: string): FoeEntry => ({
  name: createEnemy(kind, 0, 0).name,
  guardian: false,
  behaviour,
  counter,
  make: () => createEnemy(kind, 0, 0),
});
const guardian = (kind: BossKind, behaviour: string, counter: string): FoeEntry => ({
  name: createBoss(kind, 0, 0).name,
  guardian: true,
  behaviour,
  counter,
  make: () => createBoss(kind, 0, 0),
});

export const BESTIARY: FoeEntry[] = [
  foe('grunt', 'Chases you and swipes in a wide arc.', 'Dash out of the arc.'),
  foe('skitter', 'Shakes for a moment, then lunges fast.', 'Sidestep the lunge.'),
  foe('brute', 'Slow and heavy. Slams the ground in front of it.', 'Jump the slam or stay behind it.'),
  foe('caster', 'A flying caster that keeps its distance and fires a spread of bolts.', 'Close the gap; dash through the bolts.'),
  foe('bomber', 'Lobs bombs that lead your movement.', 'Change direction when the landing spot appears.'),
  foe('spinner', 'A turret that fires rotating rings of bullets, then rests.', 'Strike while it rests.'),
  foe('charger', 'Charges along a marked lane.', 'Bait it into a wall to stun it.'),
  foe('shield', 'Its shield blocks hits from the front. Thrusts its spear.', 'Flank it, or strike after a thrust.'),
  foe('hissling', 'Lights a fuse up close and explodes, hurting other foes too.', 'Back off. A stun puts the fuse out.'),
  foe('weaver', 'Spits webs that slow you.', 'Avoid the marked landing spots.'),
  foe('bonecaller', 'Summons Numblings, which die with it.', 'Kill the Bonecaller first.'),
  foe('mimic', 'A chest that bites back with hopping slams.', 'Dash or jump out of its landing zone.'),
  foe('dummy', 'The training dummy in the Hall of Shades. Heals when left alone.', 'Practise your combos.'),
  guardian('fury', 'Warden of Chains. Whip lashes, a dashing charge and bullet rings.', 'Step off the dash lane; slip through gaps in the rings.'),
  guardian('hydra', 'Rooted in place. Bites, spits fire and grows extra heads.', 'Clear the heads if overwhelmed, then focus the body.'),
  {
    name: 'Maw Head',
    guardian: true,
    behaviour: "Extra heads the Many-Maw grows. They spit fire bolts and die with the body.",
    counter: 'Strike them down when the fire gets too thick.',
    make: () => new HydraHead(0, 0),
  },
  guardian('talos', 'The Bronze Colossus. Slams, a sweeping laser and bomb barrages.', 'Break his armor: he overheats and takes extra damage.'),
  guardian('cerberus', 'Warden of the Gate. Charges, fire breath, leaps and summons.', 'Bait the charges into walls; jump the shockwaves.'),
];

/** The region(s) a foe appears in. */
export function foeRegions(entry: FoeEntry): string {
  if (entry.name === 'Old Bones') return 'The Hall of Shades';
  if (entry.name === 'Maw Head') return BIOMES[1].name;
  const e = entry.make();
  const where = BIOMES.filter((b) => (entry.guardian ? createBoss(b.boss, 0, 0).name === e.name : b.pool.some(([k]) => createEnemy(k, 0, 0).name === e.name)));
  return where.map((b) => b.name).join(', ') || '—';
}

// ---------------------------------------------------------------- achievements

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  glyph: string;
  done: (save: SaveData) => boolean;
}

const slain = (save: SaveData, name: string) => (save.bestiary[name] ?? 0) > 0;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_blood', name: 'First Blood', glyph: '⚔', desc: 'Slay your first foe.', done: (s) => s.stats.kills >= 1 },
  { id: 'culler', name: 'Culler of Shades', glyph: '☠', desc: 'Slay 500 foes.', done: (s) => s.stats.kills >= 500 },
  { id: 'jailbreak', name: 'Jailbreak', glyph: '⛓', desc: 'Slay Vexa, Warden of Chains.', done: (s) => slain(s, 'Vexa') },
  { id: 'headhunter', name: 'Headhunter', glyph: '🜂', desc: 'Slay the Many-Maw.', done: (s) => slain(s, 'The Many-Maw') },
  { id: 'bronze', name: 'Scrap Metal', glyph: '⚙', desc: 'Slay Aurex, the Gilded Colossus.', done: (s) => slain(s, 'Aurex') },
  { id: 'gatebreaker', name: 'Gatebreaker', glyph: '⛩', desc: 'Slay Threefang, Hound of the Last Gate.', done: (s) => slain(s, 'Threefang') },
  { id: 'escape', name: 'Unbound', glyph: '✦', desc: 'Escape the Underworld.', done: (s) => s.stats.escapes >= 1 },
  { id: 'escape5', name: 'Old Hand', glyph: '✧', desc: 'Escape 5 times.', done: (s) => s.stats.escapes >= 5 },
  { id: 'swift', name: 'Swift as Hermes', glyph: '➶', desc: 'Escape in under 20 minutes.', done: (s) => s.stats.bestTime > 0 && s.stats.bestTime < 20 * 60 },
  { id: 'torment', name: 'Oathbound', glyph: '♆', desc: 'Unlock Torment 3.', done: (s) => s.maxHeat >= 3 },
  { id: 'level10', name: 'Rising Shade', glyph: '▲', desc: 'Reach level 10.', done: (s) => levelFromXp(s.xp).level >= 10 },
  { id: 'level30', name: 'Ascendant', glyph: '♛', desc: 'Reach level 30.', done: (s) => levelFromXp(s.xp).level >= 30 },
  { id: 'patron', name: "Ferryman's Patron", glyph: '⚖', desc: "Buy 10 wares from Charon.", done: (s) => s.stats.shopBuys >= 10 },
  { id: 'arsenal', name: 'Mythic Smith', glyph: '⚒', desc: 'Forge any weapon to Tier V (Mythic).', done: (s) => Object.values(s.forge).some((t) => (t ?? 0) >= 5) },
  {
    id: 'company',
    name: 'Full Company',
    glyph: '☥',
    desc: 'Unlock every hero.',
    done: (s) => CHARACTERS.every((c) => characterUnlocked(c, s, levelFromXp(s.xp).level)),
  },
  { id: 'bestiary', name: 'Naturalist', glyph: '❦', desc: 'Fill in the whole bestiary.', done: (s) => BESTIARY.every((e) => slain(s, e.name)) },
];

/** Achievements newly earned by this save (not yet in save.achievements). */
export function newAchievements(save: SaveData): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !save.achievements.includes(a.id) && a.done(save));
}
