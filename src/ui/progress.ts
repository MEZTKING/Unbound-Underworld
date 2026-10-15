// The Altar of Ashes (permanent strength for every hero) and Ascension (each
// hero's own skill tree).
import { audio } from '../engine/audio';
import { ALTAR, canBuyAltar, nextAltarCost, rankOf, sectionState, spentBefore, tableComplete, tableOpen } from '../game/altar';
import { CHARACTER_BY_ID, CHARACTERS, characterUnlocked, type CharacterId } from '../game/characters';
import type { Game } from '../game/game';
import { canRaiseSkill, HERO_MAX_LEVEL, HERO_TREES, heroLevelFromXp, heroPoints, ROW_GATE, rowOpen, spentSkill, branchSpent } from '../game/herotree';
import { levelBonus, levelFromXp, MAX_LEVEL, tierFor } from '../game/progression';
import { esc } from './overlay';

function bind(el: HTMLElement, sel: string, fn: (b: HTMLElement) => void): void {
  el.querySelectorAll<HTMLElement>(sel).forEach((b) => (b.onclick = () => fn(b)));
}

const pips = (n: number, max: number) => Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');

// ---------------------------------------------------------------- Altar of Ashes

export function altar(g: Game): void {
  let table = tableOpen(g.save.upgrades, 1) ? 1 : 0;
  const render = () => {
    const ranks = g.save.upgrades;
    const level = g.level;
    const t = ALTAR[table];
    const lb = levelBonus(level);
    const tabs = ALTAR.map((x, i) => {
      const open = tableOpen(ranks, i);
      return `<button class="btn tab${i === table ? ' primary' : ''}${open ? '' : ' disabled'}" data-nav data-tab="${i}">${esc(x.name)}${open ? '' : ' 🔒'}</button>`;
    }).join('');
    const sections = t.sections
      .map((sec, si) => {
        const st = sectionState(ranks, level, table, si);
        const need = [st.needLevel ? `reach level ${sec.level}` : '', st.needSpend ? `spend ${st.needSpend} more Ash above` : ''].filter(Boolean).join(' and ');
        const ups = sec.ups
          .map((u) => {
            const r = rankOf(ranks, u.id);
            const cost = nextAltarCost(ranks, u.id);
            const can = canBuyAltar(ranks, level, g.save.ash, u.id);
            return `<button class="upg${can ? '' : ' disabled'}${st.open ? '' : ' sealed'}" data-nav data-u="${u.id}">
              <span class="glyph">${u.glyph}</span>
              <span class="uname">${esc(u.name)}<small>${esc(u.desc(Math.max(1, r)))}${r > 0 && cost !== null ? ` → next: ${esc(u.desc(r + 1))}` : ''}</small></span>
              <span class="pips">${pips(r, u.costs.length)}</span>
              <span class="cost">${cost === null ? 'MAX' : `${cost} ◆`}</span></button>`;
          })
          .join('');
        return `<h3 class="section altar-sec${st.open ? '' : ' sealed'}">${['I', 'II', 'III', 'IV', 'V'][si]} · ${esc(sec.name)} <small>${st.open ? `${spentBefore(ranks, table, si + 1) - spentBefore(ranks, table, si)} ◆ spent here` : `Sealed: ${need}`}</small></h3><div class="upgrades">${ups}</div>`;
      })
      .join('');
    const done = tableComplete(ranks, table);
    return `<div class="row-btns tabs">${tabs}</div>
      <div class="subtitle">Ash: <b>${g.save.ash}</b> ◆ · Level ${level}: +${lb.hp} max Health${lb.dmg ? ` and +${Math.round(lb.dmg * 100)}% damage` : ''} for every hero</div>
      <p class="small">${esc(t.blurb)}${table === 0 && !done ? ' Complete every upgrade here to open the Deep Altar.' : ''}</p>
      ${sections}`;
  };
  const el = g.ui.push(
    'station',
    `<div class="panel wide altar"><h2 class="title" style="color:#c8a8ff">Altar of Ashes</h2>
      <div data-list>${render()}</div>
      <button class="btn" data-nav data-a="back">Back</button></div>`,
    { onBack: () => g.ui.pop() },
  );
  const refresh = () => {
    el.querySelector('[data-list]')!.innerHTML = render();
    g.ui.refreshItems();
    wire();
  };
  const wire = () => {
    bind(el, '[data-tab]', (b) => {
      const i = Number(b.dataset.tab);
      if (!tableOpen(g.save.upgrades, i)) {
        audio.play('deny');
        g.ui.toast('Complete every upgrade on the Altar of Ashes to open the Deep Altar.');
        return;
      }
      table = i;
      audio.play('select');
      refresh();
    });
    bind(el, '[data-u]', (b) => {
      const id = b.dataset.u!;
      const cost = nextAltarCost(g.save.upgrades, id);
      if (cost === null || !canBuyAltar(g.save.upgrades, g.level, g.save.ash, id)) {
        audio.play('deny');
        return;
      }
      g.save.ash -= cost;
      g.save.upgrades[id] = rankOf(g.save.upgrades, id) + 1;
      g.persist();
      g.recomputeAll(true);
      audio.play('boon');
      if (table === 0 && tableComplete(g.save.upgrades, 0)) g.ui.toast('The Altar of Ashes is complete: the Deep Altar opens.', 4000);
      refresh();
    });
    bind(el, '[data-a]', () => g.ui.pop());
  };
  wire();
}

// ---------------------------------------------------------------- Ascension

export function ascension(g: Game, start?: CharacterId): void {
  let hero: CharacterId = start ?? g.me.player.hero.id;
  const render = () => {
    const def = CHARACTER_BY_ID[hero];
    const tree = HERO_TREES[hero];
    const xp = g.save.heroXp[hero] ?? 0;
    const lv = heroLevelFromXp(xp);
    const ranks = g.save.skills[hero] ?? {};
    const free = heroPoints(lv.level) - spentSkill(ranks);
    const heads = tree.branches.map((b, i) => `<div class="tree-head">${esc(b)}<small>${branchSpent(hero, ranks, i, 4)} pts</small></div>`).join('');
    const cells: string[] = [];
    for (let row = 0; row < 4; row++) {
      for (let b = 0; b < 3; b++) {
        const node = tree.nodes.find((n) => n.branch === b && n.row === row)!;
        const r = Math.min(ranks[node.id] ?? 0, node.max);
        const open = rowOpen(hero, ranks, b, row);
        const can = canRaiseSkill(hero, lv.level, ranks, node.id);
        const lock = open ? '' : `Needs ${ROW_GATE[row]} points in ${tree.branches[b]}`;
        cells.push(`<button class="skill${can ? '' : ' disabled'}${open ? '' : ' sealed'}${row === 3 ? ' capstone' : ''}${r ? ' taken' : ''}" data-nav data-sk="${node.id}" style="--c:${def.color}">
          <span class="glyph">${node.glyph}</span><b>${esc(node.name)}</b>
          <small>${esc(node.desc(Math.max(1, r)))}</small>
          <span class="pips">${pips(r, node.max)}</span>
          <em>${r >= node.max ? 'MAX' : lock || `${node.cost} pt${node.cost > 1 ? 's' : ''}`}</em></button>`);
      }
    }
    const heroes = CHARACTERS.filter((c) => characterUnlocked(c, g.save, g.level));
    return `<div class="row-btns tabs">${heroes.map((c) => `<button class="btn tab${c.id === hero ? ' primary' : ''}" data-nav data-hero="${c.id}" style="--c:${c.color}">${esc(c.name)}</button>`).join('')}</div>
      <div class="subtitle"><b style="color:${def.color}">${esc(def.name)}</b>, ${esc(def.title)} · hero level <b>${lv.level}</b>${lv.level < HERO_MAX_LEVEL ? ` (${lv.into}/${lv.need} XP)` : ' (max)'} · <b>${free}</b> point${free === 1 ? '' : 's'} to spend</div>
      <p class="small">Skill points come from playing ${esc(def.name)}: every bit of experience you earn as them also raises their hero level. This tree is theirs alone.</p>
      <div class="skill-tree">${heads}${cells.join('')}</div>`;
  };
  const el = g.ui.push(
    'station',
    `<div class="panel wide"><h2 class="title" style="color:#ffe68a">Ascension</h2>
      <div data-list>${render()}</div>
      <div class="row-btns"><button class="btn ghost" data-nav data-a="reset">Reset this tree (free)</button><button class="btn" data-nav data-a="back">Back</button></div></div>`,
    { onBack: () => g.ui.pop(), cols: 3 },
  );
  const refresh = () => {
    el.querySelector('[data-list]')!.innerHTML = render();
    g.recomputeAll();
    g.refreshHubPrompts();
    g.persist();
    g.ui.refreshItems();
    wire();
  };
  const wire = () => {
    bind(el, '[data-hero]', (b) => {
      hero = b.dataset.hero as CharacterId;
      audio.play('select');
      refresh();
    });
    bind(el, '[data-sk]', (b) => {
      const id = b.dataset.sk!;
      const ranks = (g.save.skills[hero] ??= {});
      const lv = heroLevelFromXp(g.save.heroXp[hero] ?? 0).level;
      if (!canRaiseSkill(hero, lv, ranks, id)) {
        audio.play('deny');
        return;
      }
      ranks[id] = (ranks[id] ?? 0) + 1;
      audio.play('boon');
      refresh();
    });
    bind(el, '[data-a]', (b) => {
      if (b.dataset.a === 'reset') {
        g.save.skills[hero] = {};
        audio.play('select');
        refresh();
      } else g.ui.pop();
    });
  };
  wire();
}

/** For the HUD and menus: your level line, e.g. "Level 12 · Revenant". */
export function levelLine(g: Game): string {
  const level = g.level;
  const prog = levelFromXp(g.save.xp);
  return `Level ${level} · ${tierFor(level).name}${level < MAX_LEVEL ? ` · ${prog.into}/${prog.need} XP` : ''}`;
}
