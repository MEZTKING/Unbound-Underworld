// Writes docs/GAME_DATA.md from the game's own definitions, so the reference
// always matches the code. Run with `npm run docs`; CI fails if it's stale.
import { writeFileSync } from 'node:fs';
import { ARTIFACTS } from '../src/game/artifacts';
import { BOON_BY_ID, BOON_RARITY_BY_REGION, boonRarityOdds, BOONS, boonValue, GODS, HAMMERS, RARITY_MULT } from '../src/game/boons';
import { CHARACTERS, heroForWeapon } from '../src/game/characters';
import { createBoss, createEnemy } from '../src/game/enemies';
import { CHAINS, ECHO, ENCHANTS, MAX_ENCHANT_TIER, RADIANCE, RAMPAGING, STUNNING } from '../src/game/enchants';
import { heatScale, WEAPON_IDS } from '../src/game/meta';
import { ALTAR, ALTAR_BY_ID, altarTotal } from '../src/game/altar';
import { HERO_MAX_LEVEL, HERO_TREES, heroPoints, heroXpForLevel, heroXpToNext, ROW_GATE } from '../src/game/herotree';
import { SMITH_PARTS } from '../src/game/smith';
import { CHEST, DOOR_COUNT, DOOR_RULE, DOOR_WEIGHT, DUO_CHANCE, PAINTED, eliteChance, FOE_DROP, GHOST_CHANCE, PLAIN_TIER, POM_DOUBLE, POT, SIPHON, STAR_CHANCE, STARRED_TIER, type DoorReward, type DropSource } from '../src/game/odds';
import { AFFIXES, costText, CRAFTS, GEAR_RARITY, GEAR_SLOTS, INVENTORY_SIZE, levelMult, MATERIAL_IDS, MATERIALS, MAX_GEAR_LEVEL, maxDropStars, minRoll, PERKS, RARITY_ORDER, regionMaterial, SLOT_NAME, starOdds, upgradeCost } from '../src/game/gear';
import { FORGE, levelBonus, levelFromXp, MAX_LEVEL, tierFor, TIERS, UNLOCKS, WEAPON_LEVEL, WRATH_MAX, WRATH_PER_DEALT, WRATH_PER_TAKEN, XP, xpForLevel, xpToNext } from '../src/game/progression';
import { REWARD_INFO } from '../src/game/render';
import { BIOMES, ENEMY_COST } from '../src/game/rooms';
import type { BossKind, EnemyKind, GodId, Rarity } from '../src/game/types';
import { WEAPON_INFO } from '../src/game/weapons';

const out: string[] = [];
const line = (s = '') => out.push(s);
/** Escapes table cells. */
const c = (v: unknown) => String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
/** A chance as a percentage: 1 decimal under 10%, none above. */
const pc = (v: number) => (v <= 0 ? '—' : `${+(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`);
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
  ['Hero skill trees (Ascension)', 'hero-skill-trees-ascension'],
  ['Heroes and Wrath', 'heroes-and-wrath'],
  ['Weapons, forging and anvil upgrades', 'weapons-forging-and-anvil-upgrades'],
  ['Gods and boons', 'gods-and-boons'],
  ['Enchantments', 'enchantments'],
  ['Artifacts', 'artifacts'],
  ['Altar of Ashes (permanent upgrades for every hero)', 'altar-of-ashes-permanent-upgrades-for-every-hero'],
  ['The Blacksmith', 'the-blacksmith'],
  ['Regions and guardians', 'regions-and-guardians'],
  ['Enemies', 'enemies'],
  ['Torment (difficulty)', 'torment-difficulty'],
  ['Door rewards', 'door-rewards'],
  ['Probabilities', 'probabilities'],
]) line(`- [${t}](#${a})`);
line();

// ---------------------------------------------------------------- progression
line('## Progression: levels, ranks and unlocks');
line();
line(`Experience carries over between runs. Max level: **${MAX_LEVEL}**. Every level gives every hero +1 max Health, and every fifth level +1% damage. Levels also open the Altar of Ashes' sections. The same experience raises the hero you play (see *Hero skill trees*).`);
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
line('**Rank names**');
line();
table(['Rank', 'From level'], TIERS.map((t) => [t.name, t.level]));
line('**Levels**');
line();
table(
  ['Level', 'XP to next', 'Total XP', 'Rank', 'Bonus for every hero', 'Unlocks'],
  Array.from({ length: MAX_LEVEL }, (_, i) => {
    const lv = i + 1;
    const un = UNLOCKS.filter((u) => u.level === lv).map((u) => u.title);
    const extra = [
      ...un,
      ...CHARACTERS.filter((ch) => ch.unlock?.kind === 'level' && ch.unlock.n === lv).map((ch) => `Hero: ${ch.name}`),
      ...WEAPON_IDS.filter((w) => WEAPON_LEVEL[w] === lv && lv > 1).map((w) => `Weapon: ${WEAPON_INFO[w].name}`),
      ...FORGE.filter((f) => f.level === lv && f.tier > 1).map((f) => `Forge: ${f.name}`),
      ...ALTAR.flatMap((t) => t.sections.filter((sec) => sec.level === lv && lv > 1).map((sec) => `Altar: ${sec.name} (with ${sec.spend} Ash spent above)`)),
    ];
    const b = levelBonus(lv);
    return [lv, lv < MAX_LEVEL ? xpToNext(lv) : '—', xpForLevel(lv), tierFor(lv).name, `+${b.hp} HP${b.dmg ? `, +${Math.round(b.dmg * 100)}% dmg` : ''}`, extra.join(', ') || ''];
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

// ---------------------------------------------------------------- hero skill trees
line('## Hero skill trees (Ascension)');
line();
line(`Each hero has their own tree at the *Ascension* stone. Experience earned while playing a hero raises their hero level (max ${HERO_MAX_LEVEL}); each level after the first gives one skill point for that hero only (${heroPoints(HERO_MAX_LEVEL)} at most, about ${heroXpForLevel(HERO_MAX_LEVEL)} experience). Rows cost 1, 1, 2 and 3 points per rank; a row opens once ${ROW_GATE.slice(1).join(', ')} points sit in the rows above it in that branch. Resetting is free.`);
line();
table(['Hero level', 'XP to next'], Array.from({ length: HERO_MAX_LEVEL - 1 }, (_, i) => [i + 1, heroXpToNext(i + 1)]));
for (const h of CHARACTERS) {
  const t = HERO_TREES[h.id];
  line(`*${h.name}*: ${t.branches.join(' · ')}`);
  line();
  table(
    ['Branch', 'Row', 'Skill', 'Ranks × points', 'At max rank'],
    t.nodes.map((n) => [t.branches[n.branch], n.row + 1, `${n.glyph} ${n.name}`, `${n.max} × ${n.cost}`, n.desc(n.max)]),
  );
}

// ---------------------------------------------------------------- heroes
line('## Heroes and Wrath');
line();
line(`Choose a hero in the *Hall of Heroes*. Wrath (unlocks at level ${UNLOCKS.find((u) => u.feature === 'wrath')?.level}) fills by ${(WRATH_PER_DEALT * 100).toFixed(2)} per 100 damage dealt and ${WRATH_PER_TAKEN} per damage taken; ${WRATH_MAX} unleashes the hero's ultimate.`);
line();
table(
  ['Hero', 'Class', 'Weapon', 'Guard', 'Unlock', 'Perks', 'Wrath', 'Wrath effect'],
  CHARACTERS.map((h) => [`${h.name}, ${h.title}`, h.role, WEAPON_INFO[h.weapon].name, h.guard, h.unlock?.text ?? 'Start', h.perks.join('; '), h.wrath.name, h.wrath.desc]),
);
line('Guard styles: *parry* (widest parry window), *shield* (blocks all frontal damage; Attack while guarding bashes), *evade* (a sidestep; one right before a hit is a Perfect Dodge), *catch* (wide parry window), *mist* (blocked damage becomes Echoes).');
line();

// ---------------------------------------------------------------- weapons
line('## Weapons, forging and anvil upgrades');
line();
line('Each weapon belongs to one class (hero): picking the hero picks the weapon. Every weapon chains on taps, and holding Attack after a chain hit starts its powered attack.');
line();
table(
  ['Weapon', 'Id', 'Class', 'Hero', 'Description'],
  WEAPON_IDS.map((w) => [WEAPON_INFO[w].name, w, heroForWeapon(w).role, heroForWeapon(w).name, WEAPON_INFO[w].blurb]),
);
line('**Forge tiers** (per weapon, at the Blacksmith once he has his Whetstone)');
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
  ARTIFACTS.map((a) => [`${a.glyph} ${a.name}`, a.souls ? `${a.souls} Echoes` : `${a.cooldown}s cooldown`, a.unlock || 'Owned', a.desc]),
);
line('## Altar of Ashes (permanent upgrades for every hero)');
line();
line(`Bought with Ash. Each table runs from its weakest upgrades (section I) to its strongest; a section opens at its level once enough Ash has been spent on the sections above it. The Deep Altar opens when every upgrade on the Altar of Ashes is complete. Everything costs ${altarTotal()} Ash in all.`);
line();
for (const t of ALTAR) {
  line(`**${t.name}**`);
  line();
  table(
    ['Section', 'Opens at', 'Upgrade', 'Ranks', 'Ash per rank', 'At max rank'],
    t.sections.flatMap((sec, si) => sec.ups.map((u) => [`${['I', 'II', 'III', 'IV', 'V'][si]} ${sec.name}`, `Lv ${sec.level}${sec.spend ? `, ${sec.spend} Ash spent above` : ''}`, `${u.glyph} ${u.name}`, u.costs.length, u.costs.join(' / '), u.desc(u.costs.length)])),
  );
}

line('## The Blacksmith');
line();
line('He stars up, reforges and salvages gear in the Hall from the start of the game (starring up needs only materials). Each forge part he gets back lets him do more:');
line();
table(['Part', 'Found', 'Unlocks'], SMITH_PARTS.map((p) => [`${p.glyph} ${p.name}`, p.from, p.unlocks]));

// ---------------------------------------------------------------- loot & gear
line('## Loot and gear');
line();
line(`The Gear & Inventory screen opens at level ${UNLOCKS.find((u) => u.feature === 'gear')?.level}; loot drops from the first escape. Foes drop materials; gear drops from foes (${pc(FOE_DROP.gear)}), enchanted foes (${pc(FOE_DROP.eliteGear)}), chests (${pc(CHEST.gear)}) and guardians (always). Every drop chance is listed under *Probabilities*. Up to ${INVENTORY_SIZE} pieces are kept; a full inventory salvages new finds.`);
line();
line('**Plain and starred pieces.** Common and Uncommon pieces are *plain*: no stars, and they can\'t be starred up (salvage them for materials). Rare and better pieces drop with stars: one star usually, each extra star half as likely, up to a cap set by your level. Legendary pieces come only from guardians.');
line();
table(
  ['Material', 'Source'],
  MATERIAL_IDS.map((k) => [`${MATERIALS[k].glyph} ${MATERIALS[k].name}`, MATERIALS[k].desc]),
);
const SOURCE_NAME: Record<DropSource, string> = { foe: 'Foes', elite: 'Enchanted foes', chest: 'Chests', guardian: 'Guardians' };
const SOURCES = Object.keys(SOURCE_NAME) as DropSource[];
const whereFrom = (k: (typeof RARITY_ORDER)[number]) =>
  k === 'ghost' ? `Any foe (${pc(GHOST_CHANCE)} a kill)` : PLAIN_TIER[k] ? 'Any drop that rolls no star' : SOURCES.filter((src) => STARRED_TIER[src][k]).map((src) => SOURCE_NAME[src]).join(', ');
table(
  ['Tier', 'Bonuses', 'Bonus strength ×', 'Bonus roll', 'Stars', 'Drops from', 'Perk'],
  RARITY_ORDER.map((k) => [
    GEAR_RARITY[k].name,
    GEAR_RARITY[k].affixes,
    GEAR_RARITY[k].power,
    `${minRoll(k).toFixed(2)}–1.25`,
    PLAIN_TIER[k] ? 'None (plain)' : `1–${MAX_GEAR_LEVEL}`,
    whereFrom(k),
    k === 'unique' ? 'One Unique perk' : k === 'ghost' ? 'One Ghost perk' : '—',
  ]),
);
line(`A bonus is its base value × roll × tier strength × star bonus. Ghost bonuses never roll low: the weakest Ghost bonus (${(minRoll('ghost') * GEAR_RARITY.ghost.power).toFixed(2)}× base) beats the best Legendary one (${(1.25 * GEAR_RARITY.legendary.power).toFixed(2)}×).`);
line();
table(
  ['Perk', 'Tier', 'Effect'],
  (Object.keys(PERKS) as (keyof typeof PERKS)[]).map((k) => [PERKS[k].name, PERKS[k].ghost ? 'Ghost' : 'Unique', PERKS[k].desc]),
);
table(
  ['Bonus', 'Common, level 1 (typical)', 'Slots'],
  (Object.keys(AFFIXES) as (keyof typeof AFFIXES)[]).map((k) => [AFFIXES[k].name(AFFIXES[k].base), AFFIXES[k].flat ? AFFIXES[k].base : `${Math.round(AFFIXES[k].base * 100)}%`, (AFFIXES[k].slots ?? GEAR_SLOTS).map((s) => SLOT_NAME[s]).join(', ')]),
);
line(`Rare and better pieces are starred up from 1 to ${MAX_GEAR_LEVEL} stars. Stars 2–5 are gold and add 15% to every bonus each; stars 6–10 turn the gold stars purple one by one and add 20% each.`);
line();
const sample = (rarity: keyof typeof GEAR_RARITY, level: number) => costText(upgradeCost({ uid: '', slot: 'helmet', rarity, name: '', level, affixes: [] }));
table(
  ['Stars', 'Bonus ×', 'Next star (Rare)', 'Next star (Epic)', 'Next star (Ghost)'],
  Array.from({ length: MAX_GEAR_LEVEL }, (_, i) => i + 1).map((l) => [
    l <= 5 ? `${'★'.repeat(l)} gold` : `${'★'.repeat(l - 5)} purple + ${'★'.repeat(10 - l)} gold`,
    levelMult(l).toFixed(2),
    l < MAX_GEAR_LEVEL ? sample('rare', l) : '—',
    l < MAX_GEAR_LEVEL ? sample('epic', l) : '—',
    l < MAX_GEAR_LEVEL ? sample('ghost', l) : '—',
  ]),
);
table(
  ['Recipe', 'Makes', 'Cost'],
  CRAFTS.map((c) => [c.name, (Object.keys(c.tiers) as (keyof typeof GEAR_RARITY)[]).map((k) => `${GEAR_RARITY[k].name} ${pc(c.tiers[k] ?? 0)}`).join(', '), costText(c.cost)]),
);
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

// ---------------------------------------------------------------- probabilities
line('## Probabilities');
line();
line('Every chance roll in an escape. The weights and chances come from `src/game/odds.ts`, `boons.ts` (boon rarity), `gear.ts` (gear tiers) and `enchants.ts` (enchantment procs).');
line();

line('### Doors');
line();
const doorTotal = DOOR_COUNT.reduce((a, [, wt]) => a + wt, 0);
table(['Doors after a chamber', 'Weight', 'Chance'], DOOR_COUNT.map(([n, wt]) => [n, wt, pc(wt / doorTotal)]));
line('Each door then rolls its reward from the weights below, among the rewards allowed right now. A reward shows on at most one door of a set, and two boon doors never share a god. *Chance* is for one door when every reward is allowed.');
line();
const doorKinds = Object.keys(DOOR_WEIGHT) as DoorReward[];
const weightTotal = doorKinds.reduce((a, k) => a + DOOR_WEIGHT[k], 0);
table(
  ['Reward', 'Weight', 'Chance', 'Allowed when'],
  doorKinds.map((k) => [REWARD_INFO[k] ? `${REWARD_INFO[k].glyph} ${REWARD_INFO[k].label}` : k, DOOR_WEIGHT[k], pc(DOOR_WEIGHT[k] / weightTotal), DOOR_RULE[k]]),
);
line('Fixed doors: after the last chamber of a region comes the antechamber, then the guardian; after a guardian, a boon door into the next region.');
line(`Painted Chambers: in ${BIOMES[PAINTED.region].name}, from its second chamber, each combat door has a ${pc(PAINTED.chance)} chance to lead into a fresco: the chamber is drawn flat (2D), and a boon there is at least Rare (its Common odds go to Rare).`);
line();

line('### Boon rarity');
line();
line('Each boon offered rolls its rarity on its own. The first boon of an escape is held back so a run never opens on a big rarity spike. The odds climb chamber by chamber: from a region\'s first chamber (below) towards the next region\'s, so there is no jump at a region\'s gate. *Favor of the Gods* (Altar of Ashes) adds to Rare and Epic (and a little Heroic past the first region), but never to the first boon. Sacred Ward, Second Step and Extra Shard work the same at any rarity, so they show as *Special* and roll none.');
line();
const rar = (o: { common: number; rare: number; epic: number; heroic: number }) => [pc(o.common), pc(o.rare), pc(o.epic), pc(o.heroic)];
const favorMax = ALTAR_BY_ID.favor.costs.length;
table(
  ['When', 'Common', 'Rare', 'Epic', 'Heroic'],
  [
    ['First boon of an escape', ...rar(boonRarityOdds(0, true))],
    ...BOON_RARITY_BY_REGION.map((_, i) => [`${BIOMES[i]?.name ?? `Region ${i + 1}`}, first chamber`, ...rar(boonRarityOdds(i))]),
    ['End of the last region', ...rar(boonRarityOdds(BOON_RARITY_BY_REGION.length - 1, false, 0, 1))],
    ...BOON_RARITY_BY_REGION.map((_, i) => [`${BIOMES[i]?.name ?? `Region ${i + 1}`}, Favor ${favorMax}`, ...rar(boonRarityOdds(i, false, favorMax))]),
  ],
);
line(`Boon offers: up to 3 of the god's boons you can take, drawn evenly. A Duo boon (when its two gods are both in your build) replaces one of them ${pc(DUO_CHANCE)} of the time. Duo boons have no rarity. Anvil upgrades: 3 drawn evenly from the ones you don't own. A Pomegranate levels a boon by 2 instead of 1 ${pc(POM_DOUBLE)} of the time.`);
line();

line('### Chambers and foes');
line();
line('Chamber 1 of a region has 1 wave, chambers 2–3 have 2 and later chambers 3. Foes are drawn by weight from the region\'s pool until the wave\'s budget is spent. A foe that costs 2 or more may carry an elite trait (Armored, Swift, Volatile or Regenerating, evenly). Chambers behind an Anvil or Artifact door hold *enchanted foes*: +30%, up to 45%.');
line();
const maxRooms = Math.max(...BIOMES.map((b) => b.combatRooms));
const regions = BIOMES.map((b, i) => [b, i] as const).filter(([b]) => b.combatRooms > 0);
table(
  ['Chamber', ...regions.map(([b]) => b.name), ...regions.map(([b]) => `${b.name} (enchanted)`)],
  Array.from({ length: maxRooms }, (_, d) => [d + 1, ...regions.map(([, i]) => pc(eliteChance(d, i, false))), ...regions.map(([, i]) => pc(eliteChance(d, i, true)))]),
);

line('### Foe drops');
line();
const regionMats = [...new Set(BIOMES.map((_, i) => MATERIALS[regionMaterial(i)].name))].join(' / ');
const D = FOE_DROP;
table(
  ['Drop', 'Foe', 'Elite foe', 'Guardian'],
  [
    ['Obols (gold)', pc(D.gold), pc(D.gold), pc(D.gold)],
    ['Echoes', `1, +1 at ${pc(D.extraSoul)}`, '4', '25'],
    [`${MATERIALS.bone.glyph} ${MATERIALS.bone.name}`, `${pc(D.bone)} (×2 at ${pc(D.extraBone)})`, `${pc(D.bone * D.eliteMult)} (×2 at ${pc(D.extraBone)})`, `${pc(Math.min(1, D.bone * D.guardianMult))} (×10)`],
    [`Region material (${regionMats})`, pc(D.regional), pc(D.regional * D.eliteMult), `${pc(Math.min(1, D.regional * D.guardianMult))} (×6)`],
    [`${MATERIALS.scale.glyph} ${MATERIALS.scale.name}`, '—', pc(D.eliteScale), '100% (×3–5)'],
    ['Gear', pc(D.gear), pc(D.eliteGear), '100% (starred)'],
    ['Ghost gear', pc(GHOST_CHANCE), pc(GHOST_CHANCE), pc(GHOST_CHANCE)],
  ],
);
line('Breaking a pot: ' + `${pc(POT.gold)} obols (1–5), else ${pc(POT.souls)} two Echoes: ${pc((1 - POT.gold) * POT.souls)} overall, nothing ${pc((1 - POT.gold) * (1 - POT.souls))}.`);
line();

line('### Treasure chests');
line();
table(
  ['Roll', 'Chance'],
  [
    ['A combat chamber holds a chest', `${pc(CHEST.spawn)} (+10% per Treasure Sense tier)`],
    ['The chest is a Mimic (combat chambers); slaying it always drops a Unique piece', pc(CHEST.mimic)],
    ['Always inside', '15–35 obols, 6 Echoes, 3 Bone Dust'],
    ['Also a piece of gear', pc(CHEST.gear)],
    ['An artifact pops out', `${pc(CHEST.artifact)} (artifacts unlocked, one left to find)`],
    ['Otherwise an enchantment', `${pc(CHEST.enchant - CHEST.artifact)} (${pc(CHEST.enchant)} when no artifact is left)`],
  ],
);

line('### Gear drops');
line();
const KILLS = 80;
const ELITES = 10;
const starredShare = (src: DropSource, lvl: number) => 1 - starOdds(src, lvl)[0];
const perRun = (lvl: number) => (KILLS - ELITES) * FOE_DROP.gear * starredShare('foe', lvl) + ELITES * FOE_DROP.eliteGear * starredShare('elite', lvl) + KILLS * GHOST_CHANCE;
line(`A run of about ${KILLS} kills (${ELITES} of them enchanted) yields about ${perRun(1).toFixed(1)} starred pieces at level 1 and ${perRun(30).toFixed(1)} at level 30, before guardians and chests; the rest of the gear is plain. Every guardian drops one starred piece.`);
line();
table(
  ['Source', 'Drops a piece', 'Plain (Common 70% / Uncommon 30%)', 'Starred', 'Starred tier'],
  SOURCES.map((src) => {
    const chance = src === 'foe' ? FOE_DROP.gear : src === 'elite' ? FOE_DROP.eliteGear : src === 'chest' ? CHEST.gear : 1;
    const tiers = STARRED_TIER[src];
    return [
      SOURCE_NAME[src],
      pc(chance),
      pc(starOdds(src, 30)[0]),
      pc(starredShare(src, 30)),
      (Object.keys(tiers) as (keyof typeof GEAR_RARITY)[]).map((k) => `${GEAR_RARITY[k].name} ${pc(tiers[k] ?? 0)}`).join(', '),
    ];
  }),
);
line(`Plus, on any kill (guardians too): a Ghost piece, ${pc(GHOST_CHANCE)}. *Plain* and *Starred* are at level 30; at low levels the star cap trims the many-star rolls (see below).`);
line();
line(`**Stars on a drop.** The first star has the source's chance (foes ${pc(STAR_CHANCE.foe)}, enchanted foes ${pc(STAR_CHANCE.elite)}, chests ${pc(STAR_CHANCE.chest)}); each further star is half as likely. A drop carries at most 1 star, +1 every 3 player levels (${maxDropStars(1)} at level 1, ${maxDropStars(15)} at level 15, ${maxDropStars(30)} at level 30). Guardian and Ghost pieces always have at least one star, spread the same way.`);
line();
const starCols = [1, 2, 3, 4, 5];
table(
  ['Source (level 30)', ...starCols.map((k) => `${k}★`), '6★ or more'],
  SOURCES.map((src) => {
    const o = starOdds(src, 30);
    return [SOURCE_NAME[src], ...starCols.map((k) => pc(o[k] ?? 0)), pc(o.slice(6).reduce((a, v) => a + v, 0))];
  }),
);
table(
  ['Player level', 'Most stars on a drop'],
  [1, 3, 6, 9, 12, 15, 18, 21, 24, 27].map((l) => [`${l}+`, maxDropStars(l)]),
);

line('### Enchantment procs');
line();
const tiers = Array.from({ length: MAX_ENCHANT_TIER }, (_, i) => i + 1);
const nameOf = (id: string) => ENCHANTS.find((e) => e.id === id)?.name ?? id;
table(
  ['Enchantment', 'Roll', ...tiers.map((t) => `Tier ${t}`)],
  [
    [nameOf('echo'), 'Attack strikes again', ...tiers.map((t) => pc(ECHO[t - 1]))],
    [nameOf('chains'), 'Hit roots nearby foes', ...tiers.map((t) => pc(CHAINS[t - 1]))],
    [nameOf('stunning'), 'Hit stuns for 1.5s', ...tiers.map((t) => pc(STUNNING[t - 1]))],
    [nameOf('radiance'), 'Hit blooms a healing circle', ...tiers.map((t) => pc(RADIANCE[t - 1]))],
    [nameOf('rampaging'), 'Kill grants +50% attack speed', ...tiers.map((t) => pc(RAMPAGING[t - 1]))],
    [nameOf('siphon'), 'Hit grants Echoes', ...tiers.map(() => pc(SIPHON))],
  ],
);
line('Critical hits come only from boons and riposte (a riposte is always critical).');
line();

writeFileSync(new URL('../docs/GAME_DATA.md', import.meta.url), out.join('\n'));
console.log(`docs/GAME_DATA.md: ${out.length} lines`);
