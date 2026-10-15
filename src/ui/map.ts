// The map: where you are in the escape, how far is left, and your best so far.

import type { Game } from '../game/game';
import { createBoss } from '../game/enemies';
import { BIOMES } from '../game/rooms';
import { esc } from './overlay';

export function mapScreen(g: Game): void {
  const run = g.run;
  // Chambers before each region starts, to place your best on the same track.
  let before = 0;
  const best = g.save.stats.bestDepth;
  const rows = BIOMES.map((b, bi) => {
    const boss = createBoss(b.boss, 0, 0);
    const n = b.combatRooms + 2; // fights, the antechamber, the guardian
    const start = before;
    before += n;
    const here = run && run.biomeIndex === bi;
    const past = run && run.biomeIndex > bi;
    // Index of the chamber you're in within this region.
    const at = !here ? -1 : run!.current.kind === 'boss' ? n - 1 : run!.current.kind === 'antechamber' ? n - 2 : Math.min(run!.depth, b.combatRooms - 1);
    const nodes = Array.from({ length: n }, (_, i) => {
      const kind = i === n - 1 ? 'boss' : i === n - 2 ? 'ante' : 'fight';
      const state = past || (here && i < at) ? 'done' : here && i === at ? 'here' : 'ahead';
      const glyph = kind === 'boss' ? '☠' : kind === 'ante' ? '⌂' : state === 'done' ? '✓' : '';
      const pb = start + i + 1 === best ? '<em title="Your best">★</em>' : '';
      const label = kind === 'boss' ? esc(boss.name) : kind === 'ante' ? 'Antechamber' : `Chamber ${i + 1}`;
      return `<span class="node ${kind} ${state}" title="${label}">${glyph}${pb}</span>`;
    }).join('<i class="link"></i>');
    const status = past ? 'Cleared' : here ? `${run!.current.kind === 'shop' ? "In Charon's shop · " : run!.current.kind === 'fountain' ? 'At a fountain · ' : ''}${at < b.combatRooms ? `Chamber ${at + 1} of ${b.combatRooms}` : at === n - 2 ? 'Antechamber' : 'Facing the guardian'}` : 'Ahead';
    return `<div class="map-row${here ? ' here' : ''}${past ? ' past' : ''}" style="--c:${b.accent}">
      <div class="map-head"><b>${esc(b.name)}</b><small>${esc(status)} · guardian: ${esc(boss.name)}</small></div>
      <div class="map-track">${nodes}</div></div>`;
  }).join('');
  const total = before;
  const done = run ? run.roomsCleared : 0;
  const el = g.ui.push(
    'station',
    `<div class="panel wide map-panel"><h2 class="title">Chart of the Depths</h2>
      <div class="subtitle">${run ? `${done} chambers cleared of about ${total}` : 'No escape in progress'} · your best: ${best} chambers ★ · escapes: ${g.save.stats.escapes}</div>
      <div class="map">${rows}<div class="map-row exit"><div class="map-head"><b>The Living World</b><small>${g.save.stats.escapes ? 'You have seen it.' : 'Freedom lies beyond Threefang.'}</small></div></div></div>
      <button class="btn primary" data-nav data-a="back">Close</button></div>`,
    { onBack: () => g.ui.pop() },
  );
  el.querySelector<HTMLElement>('[data-a]')!.onclick = () => g.ui.pop();
}
