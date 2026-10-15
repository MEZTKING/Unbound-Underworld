// Developer options: a hidden test menu. Unlocked on a device by tapping the
// version number in Settings seven times (or with ?dev in the address).
// Using it switches achievements off until the game restarts.

import { audio } from '../engine/audio';
import { fx, Rng } from '../engine/math';
import { INVENTORY_SIZE, MATERIAL_IDS, rollGear } from '../game/gear';
import { ARTIFACTS } from '../game/artifacts';
import { availableGods, rollBoonOffers, takeBoon } from '../game/boons';
import { createBoss } from '../game/enemies';
import type { Game } from '../game/game';
import { WEAPON_IDS } from '../game/meta';
import { WRATH_MAX } from '../game/progression';
import { BIOMES, ENEMY_COST } from '../game/rooms';
import type { EnemyKind, RoomKind } from '../game/types';

const ROOMS: [RoomKind, string][] = [
  ['combat', 'Fight'],
  ['boss', 'Guardian'],
  ['shop', 'Shop'],
  ['fountain', 'Fountain'],
  ['antechamber', 'Antechamber'],
];

export function devMenu(g: Game): void {
  const run = g.run;
  const w = g.world;
  const lv = g.debugLevelValue;
  const levelBtn = (n: number) => `<button class="btn mini${lv === n ? ' on' : ''}" data-nav data-lv="${n}">${n || 'Real'}</button>`;
  const foes = (Object.keys(ENEMY_COST) as EnemyKind[]).map((k) => `<button class="btn mini" data-nav data-spawn="${k}">${k}</button>`).join('');
  const bosses = BIOMES.map((b, i) => `<button class="btn mini" data-nav data-boss="${i}">${b.name} guardian</button>`).join('');
  const el = g.ui.push(
    'station',
    `<div class="panel wide dev"><h2 class="title">Developer Options</h2>
      <div class="subtitle">For testing. <b class="blood">Achievements are off until you restart the game.</b></div>
      <h3 class="section">Cheats</h3>
      <div class="swatches"><button class="btn mini${g.godMode ? ' on' : ''}" data-nav data-a="god">God mode: ${g.godMode ? 'On' : 'Off'}</button>
        <button class="btn mini" data-nav data-a="ash">+5000 Ash</button>
        <button class="btn mini" data-nav data-a="unlock">Unlock all weapons, artifacts &amp; heroes</button>
        <button class="btn mini" data-nav data-a="loot">+200 of each material &amp; 8 gear pieces</button></div>
      <h3 class="section">Play at level</h3>
      <div class="swatches">${[0, 1, 5, 10, 20, 30].map(levelBtn).join('')}</div>
      <h3 class="section">Test chambers (starts a new escape)</h3>
      ${BIOMES.map(
        (b, bi) => `<div class="look-row"><span>${b.name}</span><div class="swatches">${ROOMS.map(([k, label]) => `<button class="btn mini" data-nav data-room="${bi}:${k}">${label}</button>`).join('')}</div></div>`,
      ).join('')}
      ${
        run && w
          ? `<h3 class="section">This escape</h3>
      <div class="swatches"><button class="btn mini" data-nav data-a="boons">+5 random boons</button>
        <button class="btn mini" data-nav data-a="artifacts">Fill artifact slots</button>
        <button class="btn mini" data-nav data-a="gold">+1000 obols</button>
        <button class="btn mini" data-nav data-a="wrath">Full Wrath</button>
        <button class="btn mini" data-nav data-a="heal">Full health</button>
        <button class="btn mini" data-nav data-a="clear">Slay all foes</button></div>
      <h3 class="section">Spawn a foe</h3><div class="swatches">${foes}</div>
      <h3 class="section">Spawn a guardian</h3><div class="swatches">${bosses}</div>`
          : '<p class="small">Start an escape for boons, artifacts, obols and spawning foes.</p>'
      }
      <button class="btn primary" data-nav data-a="back">Close</button></div>`,
    { onBack: () => g.ui.pop(), cols: 4 },
  );
  const done = (msg: string, reopen = true) => {
    g.cheated = true;
    audio.play('select');
    g.ui.toast(msg);
    g.persist();
    if (reopen) {
      g.ui.pop();
      devMenu(g);
    }
  };
  el.querySelectorAll<HTMLElement>('[data-lv]').forEach((b) => {
    b.onclick = () => {
      g.setDebugLevel(Number(b.dataset.lv));
      done(Number(b.dataset.lv) ? `Playing at level ${b.dataset.lv}` : 'Back to your real level');
    };
  });
  el.querySelectorAll<HTMLElement>('[data-room]').forEach((b) => {
    b.onclick = () => {
      const [bi, kind] = b.dataset.room!.split(':');
      g.cheated = true;
      g.ui.closeAll();
      g.startRun({ biome: Number(bi), kind: kind as RoomKind });
    };
  });
  el.querySelectorAll<HTMLElement>('[data-spawn]').forEach((b) => {
    b.onclick = () => {
      if (!g.world || !g.run) return;
      const p = g.player;
      const sc = g.run.scales();
      const a = fx.range(0, Math.PI * 2);
      g.world.spawn(b.dataset.spawn as EnemyKind, p.x + Math.cos(a) * 220, p.y + Math.sin(a) * 220, null, sc.hp, sc.dmg);
      if (g.world.cleared) g.world.reseal(sc.hp, sc.dmg);
      done(`Spawned ${b.dataset.spawn}`, false);
    };
  });
  el.querySelectorAll<HTMLElement>('[data-boss]').forEach((b) => {
    b.onclick = () => {
      if (!g.world || !g.run) return;
      const sc = g.run.scales();
      const boss = createBoss(BIOMES[Number(b.dataset.boss)].boss, g.world.room.w / 2, 380, sc.hp);
      g.world.addEnemy(boss);
      if (g.world.cleared) g.world.reseal(sc.hp, sc.dmg);
      g.ui.closeAll();
      g.cheated = true;
    };
  });
  el.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => {
    b.onclick = () => {
      const a = b.dataset.a;
      const r = g.run;
      switch (a) {
        case 'back':
          g.ui.pop();
          return;
        case 'god':
          g.godMode = !g.godMode;
          done(`God mode ${g.godMode ? 'on' : 'off'}`);
          return;
        case 'ash':
          g.save.ash += 5000;
          done('+5000 Ash');
          return;
        case 'unlock':
          g.save.weapons = [...WEAPON_IDS];
          g.save.artifacts = ARTIFACTS.map((x) => x.id);
          // Heroes unlock by escapes and guardians: count one of each.
          g.save.stats.escapes = Math.max(1, g.save.stats.escapes);
          g.save.stats.bossesSlain = Math.max(4, g.save.stats.bossesSlain);
          done('Weapons, artifacts and heroes unlocked');
          return;
        case 'loot': {
          for (const k of MATERIAL_IDS) g.save.materials[k] = (g.save.materials[k] ?? 0) + 200;
          const rng = new Rng(Date.now() & 0x7fffffff);
          for (let i = 0; i < 6 && g.save.gear.items.length < INVENTORY_SIZE; i++) g.save.gear.items.push(rollGear(rng, 0.5));
          // One of each top tier, to try perks and stars.
          for (const min of ['unique', 'ghost'] as const) if (g.save.gear.items.length < INVENTORY_SIZE) g.save.gear.items.push(rollGear(rng, 1, undefined, min));
          done('Materials and gear added (gear needs level 10 to use)');
          return;
        }
      }
      if (!r || !g.world) return;
      switch (a) {
        case 'boons':
          for (let i = 0; i < 5; i++) {
            const god = r.rng.pick(availableGods(r.boons));
            const offer = rollBoonOffers(r.rng, god, r.boons, 0, 1)[0];
            if (offer) r.boons = takeBoon(r.boons, offer);
          }
          g.recomputeStats();
          done('+5 boons');
          return;
        case 'artifacts': {
          const free = ARTIFACTS.filter((x) => !r.artifacts.includes(x.id));
          r.artifacts = r.artifacts.map((x) => x ?? free.shift()?.id ?? null);
          done('Artifact slots filled');
          return;
        }
        case 'gold':
          r.gold += 1000;
          done('+1000 obols');
          return;
        case 'wrath':
          g.player.wrath = WRATH_MAX;
          done('Wrath ready');
          return;
        case 'heal':
          g.player.hp = g.player.maxHp;
          done('Healed');
          return;
        case 'clear':
          for (const e of g.world.enemies) if (!e.dead) g.world.killEnemy(e);
          g.ui.closeAll();
          g.cheated = true;
          return;
      }
    };
  });
}
