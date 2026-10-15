// Each hero's own skill tree, raised at Ascension with points from that
// hero's own level (experience earned while playing them). Nothing here is
// shared between heroes: the Altar of Ashes is where strength for everyone
// comes from.
//
// Every tree has three branches of four rows. A row opens once enough points
// sit in the rows above it in that branch, and the last row holds the
// branch's capstone. There are more ranks than points (a hero tops out at
// level 20 with 19 points), so each hero is built one way or another.
import type { CharacterId } from './characters';
import type { PlayerStats } from './stats';
import type { AbilitySlot } from './types';

export const HERO_MAX_LEVEL = 20;

/** Hero experience to go from `level` to `level + 1`. */
export function heroXpToNext(level: number): number {
  return 80 + (level - 1) * 50;
}

export function heroLevelFromXp(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp));
  while (level < HERO_MAX_LEVEL && rest >= heroXpToNext(level)) {
    rest -= heroXpToNext(level);
    level++;
  }
  return { level, into: level >= HERO_MAX_LEVEL ? 0 : rest, need: level >= HERO_MAX_LEVEL ? 0 : heroXpToNext(level) };
}

export function heroXpForLevel(level: number): number {
  let xp = 0;
  for (let l = 1; l < level; l++) xp += heroXpToNext(l);
  return xp;
}

/** Skill points a hero has at a level. */
export function heroPoints(level: number): number {
  return Math.max(0, level - 1);
}

// ---------------------------------------------------------------- effects

type Eff = { desc: (r: number) => string; apply: (s: PlayerStats, r: number) => void };

const slotName: Record<AbilitySlot, string> = { attack: 'Attack', special: 'Special', cast: 'Cast', dash: 'Dash-Strike' };

function allCrit(s: PlayerStats, c: number): void {
  for (const k of Object.keys(s.critChance) as AbilitySlot[]) s.critChance[k] += c;
}

/** The effects tree nodes are made of; `m` is the amount per rank. */
const E = {
  slot: (slot: AbilitySlot, m: number): Eff => ({ desc: (r) => `+${r * m}% ${slotName[slot]} damage`, apply: (s, r) => (slot === 'dash' ? (s.dashStrikeBonus += (r * m) / 100) : (s.dmgBonus[slot] += (r * m) / 100)) }),
  dmg: (m: number): Eff => ({ desc: (r) => `+${r * m}% damage`, apply: (s, r) => (s.globalDmg += (r * m) / 100) }),
  crit: (m: number): Eff => ({ desc: (r) => `+${r * m}% critical chance`, apply: (s, r) => allCrit(s, (r * m) / 100) }),
  slotCrit: (slot: AbilitySlot, m: number): Eff => ({ desc: (r) => `+${r * m}% critical chance with ${slotName[slot]}`, apply: (s, r) => (s.critChance[slot] += (r * m) / 100) }),
  critDmg: (m: number): Eff => ({ desc: (r) => `Critical hits deal +${r * m}% damage`, apply: (s, r) => (s.critMult += (3 * r * m) / 100) }),
  hp: (m: number): Eff => ({ desc: (r) => `+${r * m} max Health`, apply: (s, r) => (s.maxHp += r * m) }),
  guard: (m: number): Eff => ({ desc: (r) => `Take ${r * m}% less damage`, apply: (s, r) => (s.damageTaken *= 1 - (r * m) / 100) }),
  kill: (m: number): Eff => ({ desc: (r) => `Restore ${r * m} Health per foe slain`, apply: (s, r) => (s.lifeOnKill += r * m) }),
  speed: (m: number): Eff => ({ desc: (r) => `+${r * m}% move speed`, apply: (s, r) => (s.moveSpeed += (r * m) / 100) }),
  haste: (m: number): Eff => ({ desc: (r) => `Attack and Special ${r * m}% faster`, apply: (s, r) => (s.attackSpeed += (r * m) / 100) }),
  dashCd: (m: number): Eff => ({ desc: (r) => `Dash recharges ${r * m}% faster`, apply: (s, r) => (s.dashRecharge *= 1 - (r * m) / 100) }),
  dashes: (): Eff => ({ desc: (r) => `+${r} Dash charge${r === 1 ? '' : 's'}`, apply: (s, r) => (s.dashCharges += r) }),
  wrath: (m: number): Eff => ({ desc: (r) => `Wrath fills ${r * m}% faster`, apply: (s, r) => (s.wrathGain += (r * m) / 100) }),
  potion: (m: number): Eff => ({ desc: (r) => `Potion heals +${r * m}% and recharges ${r * m}% faster`, apply: (s, r) => ((s.potionHeal += (r * m) / 100), (s.potionCooldown *= 1 - (r * m) / 100)) }),
  big: (m: number): Eff => ({ desc: (r) => `+${r * m}% damage to guardians and enchanted foes`, apply: (s, r) => (s.bigGameDmg += (r * m) / 100) }),
  knock: (m: number): Eff => ({ desc: (r) => `+${r * m}% knockback`, apply: (s, r) => (s.knockMult += (r * m) / 100) }),
  echoes: (m: number): Eff => ({ desc: (r) => `+${r * m}% Echoes gathered`, apply: (s, r) => (s.soulGain += (r * m) / 100) }),
  relic: (m: number): Eff => ({ desc: (r) => `Artifacts recharge ${r * m}% faster`, apply: (s, r) => (s.artifactCdMult *= 1 - (r * m) / 100) }),
  shards: (): Eff => ({ desc: (r) => `+${r} Cast shard${r === 1 ? '' : 's'}`, apply: (s, r) => (s.castAmmo += r) }),
  heal: (m: number): Eff => ({ desc: (r) => `All healing +${r * m}%`, apply: (s, r) => (s.healMult += (r * m) / 100) }),
  armor: (m: number): Eff => ({ desc: (r) => `+${r * m}% damage to armour`, apply: (s, r) => (s.armorBonus += (r * m) / 100) }),
  /** Two effects in one node (capstones). */
  both: (a: Eff, b: Eff): Eff => ({ desc: (r) => `${a.desc(r)}; ${b.desc(r).replace(/^./, (c) => c.toLowerCase())}`, apply: (s, r) => (a.apply(s, r), b.apply(s, r)) }),
};

// ---------------------------------------------------------------- trees

export interface SkillNode {
  id: string;
  name: string;
  glyph: string;
  branch: number;
  row: number;
  max: number;
  /** Points per rank. */
  cost: number;
  desc: (r: number) => string;
  apply: (s: PlayerStats, r: number) => void;
}

export interface HeroTree {
  hero: CharacterId;
  branches: [string, string, string];
  nodes: SkillNode[];
}

/** Ranks and points per rank for each row: two cheap rows, a pricier one, then the capstone. */
const ROWS: { max: number; cost: number }[] = [
  { max: 3, cost: 1 },
  { max: 3, cost: 1 },
  { max: 2, cost: 2 },
  { max: 1, cost: 3 },
];

/** Points that must sit in a branch's earlier rows before row `row` opens. */
export const ROW_GATE = [0, 2, 4, 7];

type NodeSpec = [name: string, glyph: string, eff: Eff];

function tree(hero: CharacterId, branches: [string, string, string], specs: [NodeSpec[], NodeSpec[], NodeSpec[]]): HeroTree {
  const nodes: SkillNode[] = [];
  specs.forEach((rows, b) =>
    rows.forEach(([name, glyph, eff], row) => {
      nodes.push({ id: `${hero}.${b}${row}`, name, glyph, branch: b, row, max: ROWS[row].max, cost: ROWS[row].cost, desc: eff.desc, apply: eff.apply });
    }),
  );
  return { hero, branches, nodes };
}

export const HERO_TREES: Record<CharacterId, HeroTree> = {
  kael: tree('kael', ['Blade', 'Resolve', 'Ember'], [
    [['Keen Edge', '⚔', E.slot('attack', 5)], ['Riposte Instinct', '✦', E.slotCrit('attack', 3)], ['Flame Arc', '✺', E.slot('special', 12)], ['Ember Lord', '♛', E.both(E.dmg(8), E.critDmg(15))]],
    [['Hardened', '♥', E.hp(6)], ['Steel Skin', '⛨', E.guard(3)], ['Battle Hunger', '✚', E.kill(1)], ['Unyielding', '♜', E.both(E.hp(20), E.potion(15))]],
    [['Kindling', '☄', E.wrath(10)], ['Quickstep', '»', E.dashCd(8)], ['Ember Shard', '◆', E.slot('cast', 15)], ['Phoenix Heart', '✹', E.both(E.dashes(), E.wrath(15))]],
  ]),
  lyra: tree('lyra', ['Marksman', 'Wanderer', 'Moonlight'], [
    [['Steady Draw', '➹', E.slot('attack', 5)], ['Eagle Eye', '✦', E.crit(3)], ['Volley', '✺', E.slot('special', 12)], ['Moonpiercer', '☾', E.both(E.critDmg(25), E.slotCrit('attack', 4))]],
    [['Light Feet', '➶', E.speed(4)], ['Hunter’s Instinct', '✚', E.kill(1)], ['Thick Cloak', '♥', E.hp(8)], ['Untouchable', '❖', E.both(E.dashCd(15), E.guard(6))]],
    [['Lunar Tide', '☄', E.wrath(10)], ['Silver Shard', '◆', E.slot('cast', 15)], ['Star Quiver', '✧', E.shards()], ['Moonfall Mastery', '✹', E.both(E.wrath(20), E.dmg(6))]],
  ]),
  doran: tree('doran', ['Phalanx', 'Bulwark', 'Aegis'], [
    [['Long Reach', '↟', E.slot('attack', 5)], ['Shield Bash', '⛨', E.slot('special', 8)], ['Breaker', '⚒', E.armor(15)], ['Spearhead', '♛', E.both(E.dmg(8), E.big(10))]],
    [['Iron Hide', '♥', E.hp(8)], ['Stalwart', '⛨', E.guard(3)], ['Unbroken', '✚', E.potion(12)], ['Living Fortress', '♜', E.both(E.hp(30), E.guard(5))]],
    [['Rallying Cry', '☄', E.wrath(10)], ['Heavy Blows', '✊', E.knock(10)], ['Guardian’s Mend', '✚', E.heal(10)], ['Aegis Eternal', '✹', E.both(E.wrath(15), E.kill(2))]],
  ]),
  gorran: tree('gorran', ['Fury', 'Grit', 'Rhythm'], [
    [['Hard Knuckles', '✊', E.slot('attack', 5)], ['Haymaker', '✺', E.slot('special', 12)], ['Pressure Points', '✦', E.crit(3)], ['Unstoppable', '♛', E.both(E.haste(10), E.dmg(6))]],
    [['Brawler’s Hide', '♥', E.hp(8)], ['Shrug It Off', '⛨', E.guard(3)], ['Second Wind', '✚', E.kill(1)], ['Last Man Standing', '♜', E.both(E.hp(25), E.heal(15))]],
    [['Footwork', '➶', E.speed(4)], ['Rage', '☄', E.wrath(10)], ['Rolling Punches', '»', E.dashCd(10)], ['Hundred Hands', '✹', E.both(E.haste(8), E.wrath(15))]],
  ]),
  ione: tree('ione', ['Flow', 'Stillness', 'Tide'], [
    [['Whirling Links', '⛓', E.slot('attack', 5)], ['Crashing Wave', '✺', E.slot('special', 10)], ['Pinpoint', '✦', E.slotCrit('special', 4)], ['River’s Wrath', '♛', E.both(E.slot('special', 20), E.knock(15))]],
    [['Centred', '♥', E.hp(6)], ['Calm Mind', '⛨', E.guard(3)], ['Clear Water', '✚', E.potion(12)], ['Unmoved', '♜', E.both(E.guard(6), E.heal(15))]],
    [['Undertow', '☄', E.wrath(10)], ['Tide Shard', '◆', E.slot('cast', 15)], ['Deep Current', '✧', E.shards()], ['Spring Tide', '✹', E.both(E.wrath(15), E.slot('cast', 25))]],
  ]),
  erebos: tree('erebos', ['Reaping', 'Hunger', 'Night'], [
    [['Wide Sweep', '⚰', E.slot('attack', 5)], ['Grim Harvest', '✺', E.slot('special', 12)], ['Executioner', '☠', E.big(8)], ['Lord of the Dead', '♛', E.both(E.dmg(8), E.critDmg(15))]],
    [['Feast', '✚', E.kill(1)], ['Grave Robes', '♥', E.hp(8)], ['Bloodied Mist', '⛨', E.guard(3)], ['Undying King', '♜', E.both(E.kill(2), E.heal(20))]],
    [['Echo Hunger', '✧', E.echoes(15)], ['Dark Relics', '⚙', E.relic(8)], ['Night’s Embrace', '☄', E.wrath(12)], ['Eclipse Eternal', '✹', E.both(E.wrath(20), E.echoes(25))]],
  ]),
  rook: tree('rook', ['Firepower', 'Grit', 'Powder'], [
    [['Heavy Shot', '✹', E.slot('attack', 5)], ['Point Blank', '✦', E.slotCrit('attack', 3)], ['Big Bore', '✺', E.slot('special', 12)], ['Broadside', '♛', E.both(E.dmg(8), E.knock(20))]],
    [['Leather Coat', '♥', E.hp(6)], ['Hard Cover', '⛨', E.guard(3)], ['Field Rations', '✚', E.potion(12)], ['Iron Nerve', '♜', E.both(E.hp(20), E.guard(5))]],
    [['Quick Reload', '»', E.dashCd(8)], ['Powder Keg', '☄', E.wrath(10)], ['Shrapnel', '◆', E.slot('cast', 15)], ['Cannonade Mastery', '✹', E.both(E.wrath(15), E.big(12))]],
  ]),
  selene: tree('selene', ['Edge', 'Poise', 'Starlight'], [
    [['Iaido', '⚔', E.slot('attack', 5)], ['Clean Cut', '✦', E.slotCrit('attack', 4)], ['Crescent', '✺', E.slot('special', 12)], ['Thousand Cuts', '♛', E.both(E.critDmg(25), E.haste(6))]],
    [['Grace', '➶', E.speed(4)], ['Parry Master', '⛨', E.guard(3)], ['Composure', '♥', E.hp(8)], ['Perfect Form', '♜', E.both(E.dashCd(15), E.kill(2))]],
    [['Falling Star', '☄', E.wrath(10)], ['Comet Step', '»', E.slot('dash', 15)], ['Star Shard', '◆', E.slot('cast', 15)], ['Starfall Mastery', '✹', E.both(E.wrath(20), E.dmg(6))]],
  ]),
};

export const SKILL_BY_ID: Record<string, SkillNode> = Object.fromEntries(Object.values(HERO_TREES).flatMap((t) => t.nodes.map((n) => [n.id, n])));

type Ranks = Record<string, number>;

export function spentSkill(ranks: Ranks): number {
  let n = 0;
  for (const [id, r] of Object.entries(ranks)) {
    const node = SKILL_BY_ID[id];
    if (node) n += Math.min(r, node.max) * node.cost;
  }
  return n;
}

/** Points in a branch's rows before `row`. */
export function branchSpent(hero: CharacterId, ranks: Ranks, branch: number, row: number): number {
  let n = 0;
  for (const node of HERO_TREES[hero].nodes) if (node.branch === branch && node.row < row) n += Math.min(ranks[node.id] ?? 0, node.max) * node.cost;
  return n;
}

export function rowOpen(hero: CharacterId, ranks: Ranks, branch: number, row: number): boolean {
  return branchSpent(hero, ranks, branch, row) >= ROW_GATE[row];
}

export function canRaiseSkill(hero: CharacterId, level: number, ranks: Ranks, id: string): boolean {
  const node = SKILL_BY_ID[id];
  if (!node || !id.startsWith(`${hero}.`)) return false;
  if ((ranks[id] ?? 0) >= node.max) return false;
  if (!rowOpen(hero, ranks, node.branch, node.row)) return false;
  return spentSkill(ranks) + node.cost <= heroPoints(level);
}

export function applySkills(hero: CharacterId, ranks: Ranks | undefined, s: PlayerStats): void {
  if (!ranks) return;
  for (const node of HERO_TREES[hero].nodes) {
    const r = Math.min(ranks[node.id] ?? 0, node.max);
    if (r > 0) node.apply(s, r);
  }
}
