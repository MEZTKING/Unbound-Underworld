// Gear & Inventory: equip helmets, armor, leggings and boots; upgrade, salvage
// and craft them with materials. Opens from the Armory (level 10+) and the
// pause menu.

import { audio } from '../engine/audio';
import { Rng } from '../engine/math';
import type { Game } from '../game/game';
import {
  CRAFTS,
  costText,
  describeAffix,
  GEAR_RARITY,
  GEAR_SLOTS,
  hasMaterials,
  INVENTORY_SIZE,
  MATERIAL_IDS,
  MATERIALS,
  MAX_GEAR_LEVEL,
  rollGear,
  salvageValue,
  SLOT_GLYPH,
  SLOT_NAME,
  spendMaterials,
  upgradeCost,
  type GearItem,
  type MaterialId,
} from '../game/gear';
import { esc } from './overlay';

function itemCard(item: GearItem, opts: { equipped?: boolean; selected?: boolean; attr: string }): string {
  const r = GEAR_RARITY[item.rarity];
  return `<button class="gear-item${opts.selected ? ' on' : ''}${opts.equipped ? ' worn' : ''}" data-nav ${opts.attr} style="--c:${r.color}">
    <span class="gear-glyph">${SLOT_GLYPH[item.slot]}</span>
    <span class="gear-text"><b>${esc(item.name)}${item.level > 1 ? ` +${item.level - 1}` : ''}</b>
      <small>${r.name} ${SLOT_NAME[item.slot]}${opts.equipped ? ' · equipped' : ''}</small>
      ${item.affixes.map((_, i) => `<i>${esc(describeAffix(item, i))}</i>`).join('')}</span></button>`;
}

export function gearScreen(g: Game): void {
  const gear = g.save.gear;
  let selected: string | null = null;
  const render = () => {
    const mats = MATERIAL_IDS.map((k) => {
      const m = MATERIALS[k];
      return `<span class="mat" title="${esc(m.name)}: ${esc(m.desc)}" style="--c:${m.color}"><b>${m.glyph}</b>${g.save.materials[k] ?? 0}<small>${esc(m.name)}</small></span>`;
    }).join('');
    const worn = GEAR_SLOTS.map((s) => {
      const item = gear.items.find((i) => i.uid === gear.equipped[s]);
      return item
        ? itemCard(item, { equipped: true, selected: selected === item.uid, attr: `data-item="${item.uid}"` })
        : `<div class="gear-item empty"><span class="gear-glyph">${SLOT_GLYPH[s]}</span><span class="gear-text"><b>${SLOT_NAME[s]}</b><small>Empty</small></span></div>`;
    }).join('');
    const bag = gear.items
      .filter((i) => !Object.values(gear.equipped).includes(i.uid))
      .sort((a, b) => GEAR_SLOTS.indexOf(a.slot) - GEAR_SLOTS.indexOf(b.slot))
      .map((i) => itemCard(i, { selected: selected === i.uid, attr: `data-item="${i.uid}"` }))
      .join('');
    const sel = gear.items.find((i) => i.uid === selected);
    const isWorn = !!sel && gear.equipped[sel.slot] === sel.uid;
    const up = sel && sel.level < MAX_GEAR_LEVEL ? upgradeCost(sel) : null;
    const actions = sel
      ? `<div class="row-btns">
          <button class="btn" data-nav data-act="equip">${isWorn ? 'Unequip' : 'Equip'}</button>
          <button class="btn${up && hasMaterials(g.save.materials, up) ? '' : ' disabled'}" data-nav data-act="upgrade">${up ? `Upgrade (${costText(up)})` : 'Fully upgraded'}</button>
          <button class="btn danger" data-nav data-act="salvage">Salvage (+${costText(salvageValue(sel))})</button></div>`
      : '<p class="small">Select a piece to equip, upgrade or salvage it.</p>';
    return `<div class="mats">${mats}</div>
      <h3 class="section">Equipped</h3><div class="gear-grid">${worn}</div>
      ${actions}
      <h3 class="section">Inventory <small>${gear.items.length}/${INVENTORY_SIZE}</small></h3>
      <div class="gear-grid">${bag || '<p class="small">Nothing yet. Foes, chests and guardians drop gear.</p>'}</div>
      <div class="row-btns">${CRAFTS.map(
        (c, i) => `<button class="btn${hasMaterials(g.save.materials, c.cost) && gear.items.length < INVENTORY_SIZE ? '' : ' disabled'}" data-nav data-act="craft" data-recipe="${i}">${c.name} (${costText(c.cost)})</button>`,
      ).join('')}</div>`;
  };
  const el = g.ui.push(
    'station',
    `<div class="panel wide gear-panel"><h2 class="title">Gear &amp; Inventory</h2>
      <div class="subtitle">Bonuses from equipped gear apply on every escape.</div>
      <div data-body>${render()}</div>
      <button class="btn primary" data-nav data-a="back">Back</button></div>`,
    { onBack: () => g.ui.pop(), cols: 2 },
  );
  const refresh = () => {
    el.querySelector('[data-body]')!.innerHTML = render();
    g.ui.refreshItems();
    wire();
  };
  const changed = () => {
    g.recomputeStats();
    g.persist();
    refresh();
  };
  const wire = () => {
    el.querySelectorAll<HTMLElement>('[data-item]').forEach((b) => {
      b.onclick = () => {
        selected = selected === b.dataset.item ? null : b.dataset.item!;
        audio.play('select');
        refresh();
      };
    });
    el.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => {
      b.onclick = () => {
        const act = b.dataset.act;
        const sel = gear.items.find((i) => i.uid === selected);
        if (act === 'craft') {
          const recipe = CRAFTS[Number(b.dataset.recipe) || 0];
          if (gear.items.length >= INVENTORY_SIZE || !spendMaterials(g.save.materials, recipe.cost)) {
            audio.play('deny');
            return;
          }
          const item = rollGear(new Rng(Date.now() & 0x7fffffff), 0.15, undefined, recipe.min);
          gear.items.push(item);
          selected = item.uid;
          audio.play('boon');
          g.ui.toast(`Crafted ${GEAR_RARITY[item.rarity].name} ${item.name}`);
          changed();
          return;
        }
        if (!sel) return;
        if (act === 'equip') {
          if (gear.equipped[sel.slot] === sel.uid) delete gear.equipped[sel.slot];
          else gear.equipped[sel.slot] = sel.uid;
          audio.play('boon');
        } else if (act === 'upgrade') {
          const cost = upgradeCost(sel);
          if (sel.level >= MAX_GEAR_LEVEL || !spendMaterials(g.save.materials, cost)) {
            audio.play('deny');
            return;
          }
          sel.level++;
          audio.play('boon');
        } else if (act === 'salvage') {
          if (!b.dataset.armed) {
            b.dataset.armed = '1';
            b.textContent = 'Tap again to salvage';
            return;
          }
          for (const [k, v] of Object.entries(salvageValue(sel))) g.save.materials[k as MaterialId] = (g.save.materials[k as MaterialId] ?? 0) + (v ?? 0);
          if (gear.equipped[sel.slot] === sel.uid) delete gear.equipped[sel.slot];
          gear.items = gear.items.filter((i) => i !== sel);
          selected = null;
          audio.play('gold');
        }
        changed();
      };
    });
    el.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => (b.onclick = () => g.ui.pop()));
  };
  wire();
}
