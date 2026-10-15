// Writes docs/GAME_DATA.md from the game's own definitions, so the reference
// always matches the code. Run with `npm run docs`; CI fails if it's stale.
import { writeFileSync } from 'node:fs';
import { ARTIFACTS } from '../src/game/artifacts';
import { BOON_BY_ID, BOONS, boonValue, GODS, HAMMERS, RARITY_MULT } from '../src/game/boons';
import { CHARACTERS } from '../src/game/characters';
import { createBoss, createEnemy } from '../src/game/enemies';
import { ENCHANTS, MAX_ENCHANT_TIER } from '../src/game/enchants';
import { heatScale, UPGRADES, WEAPON_IDS } from '../src/game/meta';
import { AFFIXES, costText, CRAFTS, GEAR_RARITY, GEAR_SLOTS, INVENTORY_SIZE, MATERIAL_IDS, MATERIALS, MAX_GEAR_LEVEL, SLOT_NAME } from '../src/game/gear';
import { FORGE, levelFromXp, MAX_LEVEL, TALENTS, talentPoints, tierFor, TIERS, UNLOCKS, WEAPON_LEVEL, WRATH_MAX, WRATH_PER_DEALT, WRATH_PER_TAKEN, XP, xpForLevel, xpToNext } from '../src/game/progression';
import { REWARD_INFO } from '../src/game/render';
import { BIOMES, ENEMY_COST } from '../src/game/rooms';
import type { BossKind, EnemyKind, GodId, Rarity } from '../src/game/types';
import { WEAPON_INFO } from '../src/game/weapons';

const out: string[] = [];
const line = (s = '') => out.push(s);
/** Escapes table cells. */
const c = (v: unknown) => String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
function table(head: string[], rows: unknown[][]): void {
  line(`| ${head.join(' | ')} |`);
  line(`|${head.map(() => '---').join('|')}|`);
  for (const r of rows) line(`| ${r.map(c).join(' | ')} |`);
  line();
}

line('# Unbound Underworld — Game Data Reference');
line();
line('> **Generated file — do not edit by hand.** Run `npm run docs` after changing game data; CI checks that this file is up to date.');
line('> Numbers are base values: enemies scale with region (see *Regions*) and Torment; boons scale with rarity and level.');
line('> For how the systems fit together, see [DESIGN.md](DESIGN.md).');
line();
line('## Contents');
line();
for (const [t, a] of [
  ['Progression: levels, ranks and unlocks', 'progression-levels-ranks-and-unlocks'],
  ['Talents (Ascension)', 'talents-ascension'],
  ['Heroes and Wrath', 'heroes-and-wrath'],
  ['Weapons, forging and anvil upgrades', 'weapons-forging-and-anvil-upgrades'],
  ['Gods and boons', 'gods-and-boons'],
  ['Enchantments', 'enchantments'],
  ['Artifacts', 'artifacts'],
  ['Altar of Ashes (permanent upgrades)', 'altar-of-ashes-permanent-upgrades'],
  ['Regions and guardians', 'regions-and-guardians'],
  ['Enemies', 'enemies'],
  ['Torment (difficulty)', 'torment-difficulty'],
  ['Door rewards', 'door-rewards'],
]) line(`- [${t}](#${a})`);
line();

// ---------------------------------------------------------------- progression
line('## Progression: levels, ranks and unlocks');
line();
line(`Experience carries over between runs. Max level: **${MAX_LEVEL}**. One talent point per level after the first.`);
line();
line('**Experience sources**');
line();
table(
  ['Source', 'XP'],
  [
    ['Foe slain', XP.kill],
    ['Enchanted (elite) foe slain', XP.eliteKill],
    ['Chamber cleared', XP.room],
    ['Guardian slain', XP.boss],
    ['Escape (final guardian)', XP.escape],
  ],
);
line('**Rank tiers** — each opens a new row of talents.');
line();
table(['Rank', 'From level'], TIERS.map((t) => [t.name, t.level]));
line('**Levels**');
line();
table(
  ['Level', 'XP to next', 'Total XP', 'Rank', 'Talent points', 'Unlocks'],
  Array.from({ length: MAX_LEVEL }, (_, i) => {
    const lv = i + 1;
    const un = UNLOCKS.filter((u) => u.level === lv).map((u) => u.title);
    const extra = [
      ...un,
      ...CHARACTERS.filter((ch) => ch.unlock?.kind === 'level' && ch.unlock.n === lv).map((ch) => `Hero: ${ch.name}`),
      ...WEAPON_IDS.filter((w) => WEAPON_LEVEL[w] === lv && lv > 1).map((w) => `Weapon: ${WEAPON_INFO[w].name}`),
      ...FORGE.filter((f) => f.level === lv && f.tier > 1).map((f) => `Forge: ${f.name}`),
    ];
    return [lv, lv < MAX_LEVEL ? xpToNext(lv) : '—', xpForLevel(lv), tierFor(lv).name, talentPoints(lv), extra.join(', ') || ''];
  }),
);
// Sanity: the table above uses the same functions the game does.
if (levelFromXp(xpForLevel(MAX_LEVEL)).level !== MAX_LEVEL) throw new Error('level table mismatch');
line('**Mechanic unlocks** (hidden from the HUD, buttons and help until unlocked)');
line();
table(
  ['Level', 'Unlock', 'What it does', 'Keys (PC / touch)'],
  UNLOCKS.map((u) => [u.level, u.title, u.desc + (u.feature === 'jump' ? ' Also unlocks after slaying the final guardian.' : ''), u.keys ? `${u.keys.pc} / ${u.keys.touch}` : '']),
);

// ---------------------------------------------------------------- talents
line('## Talents (Ascension)');
line();
line('Spend one point per level at the *Ascension* stone in the Hall of Shades. Resetting is free.');
line();
table(
  ['Row (rank)', 'Talent', 'Max rank', 'Per rank', 'At max rank'],
  TALENTS.map((t) => [`${TIERS[t.tier].name} (Lv ${TIERS[t.tier].level})`, `${t.glyph} ${t.name}`, t.max, t.desc(1), t.desc(t.max)]),
);

// ---------------------------------------------------------------- heroes
line('## Heroes and Wrath');
line();
line(`Choose a hero in the *Hall of Heroes*. Wrath (unlocks at level ${UNLOCKS.find((u) => u.feature === 'wrath')?.level}) fills by ${(WRATH_PER_DEALT * 100).toFixed(2)} per 100 damage dealt and ${WRATH_PER_TAKEN} per damage taken; ${WRATH_MAX} unleashes the hero's ultimate.`);
line();
table(
  ['Hero', 'Title', 'Unlock', 'Perks', 'Wrath', 'Wrath effect'],
  CHARACTERS.map((h) => [h.name, h.title, h.unlock?.text ?? 'Start', h.perks.join('; '), h.wrath.name, h.wrath.desc]),
);

// ---------------------------------------------------------------- weapons
line('## Weapons, forging and anvil upgrades');
line();
table(
  ['Weapon', 'Id', 'Ash to unlock', 'Level needed', 'Description'],
  WEAPON_IDS.map((w) => [WEAPON_INFO[w].name, w, WEAPON_INFO[w].cost || 'Owned', WEAPON_LEVEL[w], WEAPON_INFO[w].blurb]),
);
line('**Forge tiers** (per weapon, at the Armory)');
line();
table(['Tier', 'Ash', 'Level needed', 'Effect'], FORGE.map((f) => [f.name, f.cost || '—', f.level, f.desc]));
line("**Hephaestus' Anvil upgrades** (one per anvil, per run)");
line();
for (const w of WEAPON_IDS) {
  line(`*${WEAPON_INFO[w].name}*`);
  line();
  table(['Upgrade', 'Effect'], HAMMERS.filter((h) => h.weapon === w).map((h) => [h.name, h.desc]));
}

// ---------------------------------------------------------------- boons
line('## Gods and boons');
line();
line('Boons fill four ability slots (Attack, Special, Cast, Dash) plus unlimited passives. A run allows boons from up to 4 Olympians (Hermes is extra).');
line('Values shown are Common, level 1. Rarity multiplies the value; each Pomegranate level adds the boon\'s per-level fraction of the base.');
line();
table(['Rarity', 'Multiplier'], (Object.keys(RARITY_MULT) as Rarity[]).filter((r) => r !== 'duo').map((r) => [r, `×${RARITY_MULT[r]}`]));
for (const id of Object.keys(GODS) as GodId[]) {
  const g = GODS[id];
  line(`### ${g.glyph} ${g.name} — ${g.title}`);
  line();
  table(
    ['Boon', 'Slot', 'Common Lv 1', 'Needs'],
    BOONS.filter((b) => b.god === id && !b.duoOf).map((b) => [
      b.name,
      b.slot,
      b.desc(boonValue(b, 'common', 1)),
      b.requiresAny ? `one of: ${b.requiresAny.map((r) => BOON_BY_ID[r]?.name ?? r).join(', ')}` : '',
    ]),
  );
}
line('### Duo boons');
line();
table(
  ['Boon', 'Gods', 'Effect'],
  BOONS.filter((b) => b.duoOf).map((b) => [b.name, b.duoOf!.map((g) => GODS[g].name).join(' + '), b.desc(boonValue(b, 'duo', 1))]),
);

// ---------------------------------------------------------------- enchants / artifacts / altar
line('## Enchantments');
line();
line(`Found in Enchanting Tomes. Finding one again raises its tier (max ${MAX_ENCHANT_TIER}).`);
line();
table(
  ['Enchantment', 'Tier I', 'Tier II', 'Tier III'],
  ENCHANTS.map((e) => [`${e.glyph} ${e.name}`, e.desc(1), e.desc(2), e.desc(3)]),
);
line('## Artifacts');
line();
table(
  ['Artifact', 'Uses', 'Starting-artifact unlock (Ash)', 'Effect'],
  ARTIFACTS.map((a) => [`${a.glyph} ${a.name}`, a.souls ? `${a.souls} souls` : `${a.cooldown}s cooldown`, a.unlock || 'Owned', a.desc]),
);
line('## Altar of Ashes (permanent upgrades)');
line();
table(
  ['Upgrade', 'Ranks', 'Ash per rank', 'At max rank'],
  UPGRADES.map((u) => [`${u.glyph} ${u.name}`, u.costs.length, u.costs.join(' / '), u.desc(u.costs.length)]),
);

// ---------------------------------------------------------------- loot & gear
line('## Loot and gear');
line();
line(`Unlocks at level ${UNLOCKS.find((u) => u.feature === 'gear')?.level}. Foes drop materials; gear drops from foes (1.2%), enchanted foes (12%), chests (30%) and guardians (always, Rare or better). Up to ${INVENTORY_SIZE} pieces are kept; a full inventory salvages new finds.`);
line();
table(
  ['Material', 'Source'],
  MATERIAL_IDS.map((k) => [`${MATERIALS[k].glyph} ${MATERIALS[k].name}`, MATERIALS[k].desc]),
);
table(
  ['Rarity', 'Bonuses', 'Bonus strength ×'],
  Object.values(GEAR_RARITY).map((r) => [r.name, r.affixes, r.power]),
);
table(
  ['Bonus', 'Common, level 1 (typical)', 'Slots'],
  (Object.keys(AFFIXES) as (keyof typeof AFFIXES)[]).map((k) => [AFFIXES[k].name(AFFIXES[k].base), AFFIXES[k].flat ? AFFIXES[k].base : `${Math.round(AFFIXES[k].base * 100)}%`, (AFFIXES[k].slots ?? GEAR_SLOTS).map((s) => SLOT_NAME[s]).join(', ')]),
);
line(`Each upgrade level adds 15% to every bonus (max level ${MAX_GEAR_LEVEL}). Upgrades cost Bone Dust, plus Ember Shards (Rare), Golden Ichor and Titan Scales (Epic) or Styx Pearls and Titan Scales (Legendary).`);
line();
table(['Recipe', 'Rarity', 'Cost'], CRAFTS.map((c) => [c.name, `${GEAR_RARITY[c.min].name} or better`, costText(c.cost)]));
line();

// ---------------------------------------------------------------- world
const bossKinds = new Map<BossKind, ReturnType<typeof createBoss>>();
line('## Regions and guardians');
line();
table(
  ['#', 'Region', 'Subtitle', 'Combat chambers', 'Hazard', 'Foe Health ×', 'Foe damage ×', 'Guardian'],
  BIOMES.map((b, i) => {
    const boss = bossKinds.get(b.boss) ?? createBoss(b.boss, 0, 0);
    bossKinds.set(b.boss, boss);
    return [i + 1, b.name, b.subtitle, b.combatRooms, b.hazard, b.hpScale, b.dmgScale, `${boss.name}, ${(boss as unknown as { title: string }).title}`];
  }),
);
line('**Enemy pools** (spawn weights per region)');
line();
table(
  ['Region', 'Foes (weight)'],
  BIOMES.map((b) => [b.name, b.pool.map(([k, wgt]) => `${createEnemy(k, 0, 0).name} (${wgt})`).join(', ') || '—']),
);
line('**Guardians** (base values; see DESIGN.md for their attacks)');
line();
table(
  ['Guardian', 'Title', 'Health', 'Armor', 'Contact damage'],
  [...bossKinds.values()].map((b) => [b.name, (b as unknown as { title: string }).title, Math.round(b.maxHp), Math.round(b.maxArmor) || '—', b.dmg]),
);

line('## Enemies');
line();
line('*Cost* is the encounter-budget price: chambers buy foes with a budget that grows with depth and region.');
line();
table(
  ['Foe', 'Id', 'Health', 'Damage', 'Speed', 'Cost', 'Obols dropped'],
  (Object.keys(ENEMY_COST) as EnemyKind[]).map((k) => {
    const e = createEnemy(k, 0, 0);
    return [e.name, k, Math.round(e.maxHp), e.dmg, e.speed, ENEMY_COST[k], `${e.gold[0]}–${e.gold[1]}`];
  }),
);

line('## Torment (difficulty)');
line();
line('Unlocked at the *Oath of Torment* after slaying a guardian; each escape raises the maximum by one.');
line();
table(
  ['Torment', 'Foe Health', 'Foe damage', 'Ash ×'],
  Array.from({ length: 6 }, (_, h) => {
    const s = heatScale(h);
    return [h, `+${Math.round((s.hp - 1) * 100)}%`, `+${Math.round((s.dmg - 1) * 100)}%`, `×${s.ash.toFixed(2)}`];
  }),
);

line('## Door rewards');
line();
table(['Reward', 'Shown on the door'], Object.values(REWARD_INFO).map((r) => [`${r.glyph} ${r.label}`, r.desc]));

writeFileSync(new URL('../docs/GAME_DATA.md', import.meta.url), out.join('\n'));
console.log(`docs/GAME_DATA.md: ${out.length} lines`);
