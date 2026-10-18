// Gear & Inventory: equip helmets, armor, leggings and boots (from the Hall
// of Heroes and the pause menu). At the Blacksmith the same screen also stars
// pieces up, reforges and salvages them.

import { audio } from '../engine/audio';
import { Rng } from '../engine/math';
import type { Game } from '../game/game';
import { hasPart } from '../game/smith';
import {
  canStarUp,
  costText,
  describeAffix,
  GEAR_RARITY,
  gearStars,
  GEAR_SLOTS,
  hasMaterials,
  isStarredTier,
  INVENTORY_SIZE,
  MATERIAL_IDS,
  MATERIALS,
  MAX_GEAR_LEVEL,
  PERKS,
  rarityRank,
  reforgeCost,
  reforgeGear,
  salvageValue,
  slotIcon,
  SLOT_NAME,
  spendMaterials,
  upgradeCost,
  type GearItem,
  type MaterialId,
} from '../game/gear';
import { esc } from './overlay';

/** Five stars: gold up to level 5, then turning purple one by one up to 10. Plain pieces show none. */
export function starsHtml(level: number): string {
  if (level <= 0) return '<span class="stars plain" title="A plain piece: no stars">plain</span>';
  const { gold, purple } = gearStars(level);
  let out = '';
  for (let i = 0; i < 5; i++) out += `<i class="${i < purple ? 'purple' : i < purple + gold ? 'gold' : 'off'}">★</i>`;
  return `<span class="stars" title="${level} star${level > 1 ? 's' : ''} of ${MAX_GEAR_LEVEL}">${out}</span>`;
}

function itemCard(item: GearItem, opts: { equipped?: boolean; selected?: boolean; attr: string }): string {
  const r = GEAR_RARITY[item.rarity];
  const perk = item.perk ? PERKS[item.perk] : null;
  return `<button class="gear-item tier-${item.rarity}${opts.selected ? ' on' : ''}${opts.equipped ? ' worn' : ''}" data-nav ${opts.attr} style="--c:${r.color}">
    <span class="gear-glyph">${slotIcon(item.slot, 30)}</span>
    <span class="gear-text"><b>${esc(item.name)}</b>${starsHtml(item.level)}
      <small>${r.name} ${SLOT_NAME[item.slot]}${opts.equipped ? ' · equipped' : ''}</small>
      ${item.affixes.map((_, i) => `<i>${esc(describeAffix(item, i))}</i>`).join('')}
      ${perk ? `<em>${esc(perk.name)}: ${esc(perk.desc)}</em>` : ''}</span></button>`;
}

/** `smith`: the Blacksmith's version, with starring up, reforging and salvaging. */
export function gearScreen(g: Game, smith = false): void {
  const gear = g.save.gear;
  let selected: string | null = null;
  const tongs = hasPart(g.save.smith.parts, 'tongs');
  const render = () => {
    const mats = MATERIAL_IDS.map((k) => {
      const m = MATERIALS[k];
      return `<span class="mat" title="${esc(m.name)}: ${esc(m.desc)}" style="--c:${m.color}"><b>${m.glyph}</b>${g.save.materials[k] ?? 0}<small>${esc(m.name)}</small></span>`;
    }).join('');
    const worn = GEAR_SLOTS.map((s) => {
      const item = gear.items.find((i) => i.uid === gear.equipped[s]);
      return item
        ? itemCard(item, { equipped: true, selected: selected === item.uid, attr: `data-item="${item.uid}"` })
        : `<div class="gear-item empty"><span class="gear-glyph">${slotIcon(s, 30)}</span><span class="gear-text"><b>${SLOT_NAME[s]}</b><small>Empty</small></span></div>`;
    }).join('');
    const bag = gear.items
      .filter((i) => !Object.values(gear.equipped).includes(i.uid))
      .sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || b.level - a.level || GEAR_SLOTS.indexOf(a.slot) - GEAR_SLOTS.indexOf(b.slot))
      .map((i) => itemCard(i, { selected: selected === i.uid, attr: `data-item="${i.uid}"` }))
      .join('');
    const sel = gear.items.find((i) => i.uid === selected);
    const isWorn = !!sel && gear.equipped[sel.slot] === sel.uid;
    const up = sel && canStarUp(sel) ? upgradeCost(sel) : null;
    const upLabel = !sel ? '' : !isStarredTier(sel.rarity) ? 'Plain pieces can\'t be starred' : up ? `${sel.level >= 5 ? 'Empower' : 'Star up'} (${costText(up)})` : 'All stars purple';
    const plain = gear.items.filter((i) => !isStarredTier(i.rarity) && !Object.values(gear.equipped).includes(i.uid));
    const re = sel ? reforgeCost(sel) : null;
    const actions = sel
      ? `<div class="row-btns">
          <button class="btn" data-nav data-act="equip">${isWorn ? 'Unequip' : 'Equip'}</button>
          ${
            smith
              ? `<button class="btn${up && hasMaterials(g.save.materials, up) ? '' : ' disabled'}" data-nav data-act="upgrade">${upLabel}</button>
          ${tongs && re ? `<button class="btn${hasMaterials(g.save.materials, re) ? '' : ' disabled'}" data-nav data-act="reforge">Reforge bonuses (${costText(re)})</button>` : ''}
          <button class="btn danger" data-nav data-act="salvage">Salvage (+${costText(salvageValue(sel))})</button>`
              : ''
          }</div>`
      : `<p class="small">${smith ? 'Select a piece to star it up, reforge or salvage it.' : 'Select a piece to equip it. Starring up, reforging and salvaging happen at the Blacksmith in the Hall.'}</p>`;
    return `<div class="mats">${mats}</div>
      <h3 class="section">Equipped</h3><div class="gear-grid">${worn}</div>
      ${actions}
      <h3 class="section">Inventory <small>${gear.items.length}/${INVENTORY_SIZE}</small></h3>
      <div class="gear-grid">${bag || '<p class="small">Nothing yet. Foes, chests and guardians drop gear.</p>'}</div>
      ${smith && plain.length ? `<div class="row-btns"><button class="btn danger" data-nav data-act="salvagePlain">Salvage all plain pieces (${plain.length})</button></div>` : ''}`;
  };
  const el = g.ui.push(
    'station',
    `<div class="panel wide gear-panel"><h2 class="title">${smith ? 'The Forge: Gear' : 'Gear &amp; Inventory'}</h2>
      <div class="subtitle">${smith ? 'Star up Rare and better pieces with materials, reforge their bonuses, or melt down what you don\'t need.' : 'Bonuses from equipped gear apply on every escape.'}</div>
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
        if (act === 'salvagePlain') {
          if (!b.dataset.armed) {
            b.dataset.armed = '1';
            b.textContent = 'Tap again to salvage them all';
            return;
          }
          const worn = Object.values(gear.equipped);
          const junk = gear.items.filter((i) => !isStarredTier(i.rarity) && !worn.includes(i.uid));
          for (const i of junk) for (const [k, v] of Object.entries(salvageValue(i))) g.save.materials[k as MaterialId] = (g.save.materials[k as MaterialId] ?? 0) + (v ?? 0);
          gear.items = gear.items.filter((i) => !junk.includes(i));
          if (selected && !gear.items.some((i) => i.uid === selected)) selected = null;
          audio.play('gold');
          g.ui.toast(`Salvaged ${junk.length} plain piece${junk.length === 1 ? '' : 's'}`);
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
          if (!canStarUp(sel) || !spendMaterials(g.save.materials, cost)) {
            audio.play('deny');
            return;
          }
          sel.level++;
          audio.play('boon');
          g.ui.toast(sel.level > 5 ? `${sel.name}: a star turns purple (${sel.level - 5}/5)` : `${sel.name}: ${sel.level} gold stars`);
        } else if (act === 'reforge') {
          const cost = reforgeCost(sel);
          if (!tongs || !spendMaterials(g.save.materials, cost)) {
            audio.play('deny');
            return;
          }
          reforgeGear(new Rng(Date.now() & 0x7fffffff), sel);
          audio.play('boon');
          g.ui.toast(`${sel.name}: bonuses reforged`);
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
