// The Blacksmith: stars up, reforges, salvages and (with his forge parts
// back) crafts gear, and tempers the selected hero's weapon.
import { audio } from '../engine/audio';
import { Rng } from '../engine/math';
import type { Game } from '../game/game';
import { costText, craftGear, CRAFTS, GEAR_RARITY, GEAR_SLOTS, hasMaterials, INVENTORY_SIZE, MATERIAL_IDS, MATERIALS, SLOT_GLYPH, SLOT_NAME, spendMaterials, type GearSlot } from '../game/gear';
import { nextForge, FORGE } from '../game/progression';
import { hasPart, SMITH_PART_BY_ID, SMITH_PARTS } from '../game/smith';
import { WEAPON_INFO } from '../game/weapons';
import { gearScreen } from './gear';
import { esc } from './overlay';

function bind(el: HTMLElement, sel: string, fn: (b: HTMLElement) => void): void {
  el.querySelectorAll<HTMLElement>(sel).forEach((b) => (b.onclick = () => fn(b)));
}

const SMITH_LINES = [
  'Bring me what the guardians stole, and I’ll make you something worth dying in.',
  'Steel remembers every blow. So should you.',
  'Mind the sparks. They’re the only warm thing down here.',
  'A dull blade is a long escape.',
];

export function smithScreen(g: Game): void {
  const owned = () => g.save.smith.parts;
  const render = () => {
    const parts = SMITH_PARTS.map((p) => {
      const have = hasPart(owned(), p.id);
      return `<div class="smith-part${have ? ' have' : ''}" title="${esc(have ? p.unlocks : `${p.from}. Unlocks: ${p.unlocks}`)}">
        <b>${p.glyph}</b><span>${esc(p.name)}</span><small>${esc(have ? p.unlocks : p.from)}</small></div>`;
    }).join('');
    // The selected hero's weapon, tempered with Ash (needs the Whetstone).
    const hero = g.me.player.hero;
    const wid = hero.weapon;
    const info = WEAPON_INFO[wid];
    const tier = g.save.forge[wid] ?? 1;
    const next = nextForge(tier);
    const cur = FORGE.find((f) => f.tier === tier)!;
    const whet = hasPart(owned(), 'whetstone');
    const forgeOk = whet && next && g.level >= next.level && g.save.ash >= next.cost;
    const forge = !whet
      ? `<p class="small">Without his <b>Whetstone</b> he can’t temper weapons. ${esc(SMITH_PART_BY_ID.whetstone.from)}.</p>`
      : next
        ? `<button class="btn forge${forgeOk ? '' : ' disabled'}" data-nav data-a="forge">Forge ${esc(next.name)} — ${next.cost} ◆${g.level < next.level ? ` · needs level ${next.level}` : ''}<small>${esc(next.desc)}</small></button>`
        : '<div class="forge-max">Mythic: fully forged</div>';
    return `<div class="smith-parts">${parts}</div>
      <div class="mp-grid">
        <section><h3>${esc(hero.name)}’s ${esc(info.name)} <span class="tierpip">${'★'.repeat(tier)}</span></h3>
          <p class="small">${esc(cur.name)}: ${esc(cur.desc)}</p>${forge}</section>
        <section><h3>Gear</h3><p class="small">Star up Rare and better pieces, ${hasPart(owned(), 'tongs') ? 'reforge their bonuses, ' : ''}or melt down what you don’t need for materials.</p>
          <button class="btn" data-nav data-a="gear">Work on gear</button></section>
        <section><h3>Crafting</h3>${
          hasPart(owned(), 'crucible')
            ? '<p class="small">New pieces from materials, of the slot you choose.</p><button class="btn" data-nav data-a="craft">Craft gear</button>'
            : `<p class="small">His <b>Crucible</b> is lost. ${esc(SMITH_PART_BY_ID.crucible.from)} to bring it back.</p>`
        }</section>
      </div>`;
  };
  const el = g.ui.push(
    'station',
    `<div class="panel wide"><h2 class="title" style="color:#ff9a4a">The Blacksmith</h2>
      <div class="subtitle"><i>“${esc(SMITH_LINES[Math.floor(Math.random() * SMITH_LINES.length)])}”</i> · Ash: <b data-ash>${g.save.ash}</b> ◆</div>
      <div data-body>${render()}</div>
      <button class="btn" data-nav data-a="back">Back</button></div>`,
    { onBack: () => g.ui.pop() },
  );
  const refresh = () => {
    el.querySelector('[data-body]')!.innerHTML = render();
    el.querySelector('[data-ash]')!.textContent = `${g.save.ash}`;
    g.ui.refreshItems();
    wire();
  };
  const wire = () => {
    bind(el, '[data-a]', (b) => {
      const a = b.dataset.a;
      if (a === 'back') g.ui.pop();
      else if (a === 'gear') gearScreen(g, true);
      else if (a === 'craft') craftScreen(g, refresh);
      else if (a === 'forge') {
        const wid = g.me.player.hero.weapon;
        const next = nextForge(g.save.forge[wid] ?? 1);
        if (!hasPart(owned(), 'whetstone') || !next || g.level < next.level || g.save.ash < next.cost) {
          audio.play('deny');
          return;
        }
        g.save.ash -= next.cost;
        g.save.forge[wid] = next.tier;
        g.persist();
        g.recomputeStats();
        audio.play('boon');
        g.ui.toast(`${WEAPON_INFO[wid].name} forged to ${next.name}!`);
        refresh();
      }
    });
  };
  wire();
}

/** Crafting at the Blacksmith: recipes his forge parts allow, for a slot of your choice. */
function craftScreen(g: Game, after: () => void): void {
  let slot: GearSlot | 'any' = 'any';
  const render = () => {
    const mats = MATERIAL_IDS.map((k) => `<span class="mat" style="--c:${MATERIALS[k].color}"><b>${MATERIALS[k].glyph}</b>${g.save.materials[k] ?? 0}<small>${esc(MATERIALS[k].name)}</small></span>`).join('');
    const slots = (['any', ...GEAR_SLOTS] as const)
      .map((s) => `<button class="btn${slot === s ? ' primary' : ''}" data-nav data-slot="${s}">${s === 'any' ? 'Any slot' : `${SLOT_GLYPH[s]} ${SLOT_NAME[s]}`}</button>`)
      .join('');
    const full = g.save.gear.items.length >= INVENTORY_SIZE;
    const recipes = CRAFTS.map((c, i) => {
      const part = SMITH_PART_BY_ID[c.part];
      const have = hasPart(g.save.smith.parts, c.part);
      const tier = Object.keys(c.tiers).at(-1) as keyof typeof GEAR_RARITY;
      const color = GEAR_RARITY[tier].color;
      if (!have) return `<div class="recipe locked" style="--c:${color}"><b>${esc(c.name)}</b><small>Needs the ${esc(part.name)}: ${esc(part.from)}</small></div>`;
      const ok = !full && hasMaterials(g.save.materials, c.cost);
      return `<button class="recipe${ok ? '' : ' disabled'}" data-nav data-r="${i}" style="--c:${color}"><b>${esc(c.name)}</b><small>${esc(costText(c.cost))}</small></button>`;
    }).join('');
    return `<div class="mats">${mats}</div><div class="row-btns">${slots}</div><div class="recipes">${recipes}</div>${full ? '<p class="small">Your inventory is full: salvage something first.</p>' : ''}`;
  };
  const el = g.ui.push(
    'station',
    `<div class="panel wide"><h2 class="title" style="color:#ff9a4a">Craft Gear</h2>
      <div class="subtitle">Rare and better pieces come out with one star; star them up afterwards.</div>
      <div data-body>${render()}</div>
      <button class="btn" data-nav data-a="back">Back</button></div>`,
    {
      onBack: () => {
        g.ui.pop();
        after();
      },
    },
  );
  const refresh = () => {
    el.querySelector('[data-body]')!.innerHTML = render();
    g.ui.refreshItems();
    wire();
  };
  const wire = () => {
    bind(el, '[data-slot]', (b) => {
      slot = b.dataset.slot as GearSlot | 'any';
      audio.play('select');
      refresh();
    });
    bind(el, '[data-r]', (b) => {
      const recipe = CRAFTS[Number(b.dataset.r)];
      if (!recipe || !hasPart(g.save.smith.parts, recipe.part) || g.save.gear.items.length >= INVENTORY_SIZE || !spendMaterials(g.save.materials, recipe.cost)) {
        audio.play('deny');
        return;
      }
      const item = craftGear(new Rng(Date.now() & 0x7fffffff), recipe, slot === 'any' ? undefined : slot);
      g.save.gear.items.push(item);
      g.persist();
      audio.play('boon');
      g.ui.toast(`Crafted ${GEAR_RARITY[item.rarity].name} ${SLOT_NAME[item.slot]}: ${item.name}`, 3500);
      refresh();
    });
    bind(el, '[data-a]', () => {
      g.ui.pop();
      after();
    });
  };
  wire();
}
