import { TAU } from '../engine/math';
import { ARTIFACT_BY_ID } from './artifacts';
import { BOON_BY_ID, describeBoon, GODS, RARITY_COLOR } from './boons';
import { Boss } from './enemies';
import { ENCHANT_BY_ID } from './enchants';
import { prefs } from './prefs';
import { levelFromXp, tierFor, WRATH_MAX } from './progression';
import type { Run } from './run';
import type { SaveData } from './meta';
import type { World } from './world';

const FONT = '"Cinzel", Georgia, serif';

/** What each HUD icon is, for mouse-over tooltips (HUD coordinates). */
interface Tip {
  x: number;
  y: number;
  r: number;
  title: string;
  body: string;
  color: string;
}
let tips: Tip[] = [];
const tip = (x: number, y: number, r: number, title: string, body: string, color = '#ffd890') => tips.push({ x, y, r, title, body, color });

/** Draws the tooltip for the HUD icon under the mouse, if any (mx, my in HUD coordinates). */
export function drawHudTooltip(ctx: CanvasRenderingContext2D, mx: number, my: number, vw: number): void {
  const t = tips.find((t) => Math.hypot(mx - t.x, my - t.y) <= t.r + 3);
  if (!t) return;
  ctx.save();
  ctx.font = `700 14px ${FONT}`;
  const lines = wrap(ctx, t.body, 260, 'italic 13px "EB Garamond", Georgia, serif');
  const tw = Math.max(ctx.measureText(t.title).width, ...lines.map((l) => l.w)) + 20;
  const th = 30 + lines.length * 16;
  let x = t.x + t.r + 8;
  if (x + tw > vw - 8) x = t.x - t.r - 8 - tw;
  const y = Math.max(8, t.y - 14);
  ctx.fillStyle = 'rgba(10,6,14,0.94)';
  ctx.strokeStyle = t.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, tw, th, 6);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = t.color;
  ctx.font = `700 14px ${FONT}`;
  ctx.fillText(t.title, x + 10, y + 20);
  ctx.fillStyle = '#e0d4cc';
  ctx.font = 'italic 13px "EB Garamond", Georgia, serif';
  lines.forEach((l, i) => ctx.fillText(l.text, x + 10, y + 38 + i * 16));
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, font: string): { text: string; w: number }[] {
  ctx.save();
  ctx.font = font;
  const out: { text: string; w: number }[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > max) {
      out.push({ text: line, w: ctx.measureText(line).width });
      line = word;
    } else line = next;
  }
  if (line) out.push({ text: line, w: ctx.measureText(line).width });
  ctx.restore();
  return out;
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.65): void {
  ctx.fillStyle = `rgba(8,4,12,${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,216,144,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function cooldownPie(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, frac: number): void {
  if (frac <= 0) return;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
  ctx.closePath();
  ctx.fill();
}

export function drawHUD(
  ctx: CanvasRenderingContext2D,
  w: World,
  run: Run | null,
  save: SaveData,
  vw: number,
  vh: number,
  hub: boolean,
  touch = false,
  level = 1,
  lefty = false,
): void {
  const p = w.player;
  const s = w.stats;
  tips = [];
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // ---------------------------------------------------------------- health & resources
  // Bottom-left on desktop; top-left on touch screens (the joystick lives bottom-left,
  // and the potion/artifacts are on-screen buttons there).
  // Left-handed touch layout: the buttons move left, so the panel moves right.
  const mirror = touch && lefty;
  const hx = mirror ? vw - (touch ? 250 : 330) : 24;
  // The panel grows as the potion and artifacts unlock; on desktop it hugs the bottom edge.
  // Touch screens use a narrower, shorter panel so it doesn't crowd small phones.
  const ph = touch ? (s.artifactSlots ? 86 : s.canWrath ? 66 : 58) : s.canPotion || s.artifactSlots ? 104 : s.canWrath ? 70 : 64;
  const pw = touch ? 250 : 330;
  const hy = touch ? 44 : vh + 18 - ph;
  panel(ctx, hx - 10, hy - 34, pw, ph);
  const bw = touch ? 170 : 230;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(hx, hy, bw, 18);
  const frac = Math.max(0, p.hp / p.maxHp);
  const hg = ctx.createLinearGradient(hx, 0, hx + bw, 0);
  hg.addColorStop(0, '#9a1028');
  hg.addColorStop(1, '#ff3a4a');
  ctx.fillStyle = hg;
  ctx.fillRect(hx, hy, bw * frac, 18);
  if (p.recoverPool > 0 && s.quickRecovery > 0) {
    ctx.fillStyle = 'rgba(255,220,220,0.45)';
    ctx.fillRect(hx + bw * frac, hy, bw * Math.min(1 - frac, (p.recoverPool * s.quickRecovery) / p.maxHp), 18);
  }
  ctx.strokeStyle = '#ffd890';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(hx, hy, bw, 18);
  ctx.font = `700 14px ${FONT}`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, hx + 6, hy + 14);
  // Death defiance pips
  const dd = run?.deathDefiance ?? 0;
  for (let i = 0; i < dd; i++) {
    ctx.fillStyle = '#ffcf5a';
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText('✚', hx + bw + 10 + i * 18, hy + 15);
  }
  // Wrath gauge (once unlocked)
  if (s.canWrath) {
    const k = Math.min(1, p.wrath / WRATH_MAX);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(hx, hy + 22, bw, 5);
    ctx.fillStyle = k >= 1 ? `rgba(255,${200 + Math.floor(Math.sin(w.time * 8) * 40)},80,1)` : '#c89a30';
    ctx.fillRect(hx, hy + 22, bw * k, 5);
    if (k >= 1) {
      ctx.font = `700 11px ${FONT}`;
      ctx.fillStyle = '#ffd04a';
      ctx.fillText(touch ? '☄' : '☄ F', hx + bw + 8, hy + 28);
    }
  }
  // Cast shards
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = '#c8b8c0';
  if (s.canCast) ctx.fillText('CAST', hx, hy - 12);
  for (let i = 0; i < (s.canCast ? s.castAmmo : 0); i++) {
    const x = hx + 50 + i * 20;
    const y = hy - 17;
    ctx.fillStyle = i < p.castAmmo ? (s.castPower ? GODS[s.castPower.god].color : '#ff3050') : 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(x, y - 9);
    ctx.lineTo(x + 6, y);
    ctx.lineTo(x, y + 9);
    ctx.lineTo(x - 6, y);
    ctx.fill();
  }
  // Dash charges
  ctx.fillStyle = '#c8b8c0';
  const dx = touch ? 110 : 150;
  ctx.fillText('DASH', hx + dx, hy - 12);
  for (let i = 0; i < s.dashCharges; i++) {
    ctx.fillStyle = i < p.dashCharges ? '#ffd890' : 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(hx + dx + 52 + i * 16, hy - 16, 5, 0, TAU);
    ctx.fill();
  }
  if (touch) {
    if (s.artifactSlots > 0) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#7fe8ff';
      ctx.font = `700 11px ${FONT}`;
      ctx.fillText(`SOULS ${Math.floor(p.souls)}`, hx, hy + 44);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(hx + 80, hy + 37, bw - 80, 8);
      ctx.fillStyle = '#7fe8ff';
      ctx.fillRect(hx + 80, hy + 37, (bw - 80) * (p.souls / s.soulMax), 8);
    }
  } else drawLoadout(ctx, w, hx, hy);

  drawBuild(ctx, run, touch ? ph + 20 : 0, s.canCast, mirror ? vw - 24 - 140 : 24);
  drawTopRight(ctx, w, run, save, mirror ? 70 : vw - (touch ? 70 : 24), hub, level, mirror, touch);
  // On touch the boss bar fits between the health panel and the currency column.
  const bossSpan: [number, number] | null = touch ? (mirror ? [210, vw - pw - 30] : [hx + pw + 6, vw - 210]) : null;
  drawOverlays(ctx, w, vw, vh, run, hub, touch, bossSpan);
  ctx.restore();
}

/** Potion, soul gauge and artifact slots (desktop layout). */
function drawLoadout(ctx: CanvasRenderingContext2D, w: World, hx: number, hy: number): void {
  const p = w.player;
  const s = w.stats;
  const px = hx + 22;
  const py = hy + 46;
  if (s.canPotion) drawPotion(ctx, w, px, py);
  if (s.artifactSlots <= 0) return;
  // Souls gauge
  const sx = hx + 54;
  const sy = py - 4;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7fe8ff';
  ctx.font = `700 11px ${FONT}`;
  ctx.fillText(`SOULS ${Math.floor(p.souls)}`, sx, sy - 6);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(sx, sy, 120, 8);
  ctx.fillStyle = '#7fe8ff';
  ctx.fillRect(sx, sy, 120 * (p.souls / s.soulMax), 8);
  // Artifacts
  for (let i = 0; i < s.artifactSlots; i++) {

    const id = w.artifacts[i];
    const ax = sx + 152 + i * 46;
    const ay = py;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(ax, ay, 18, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,216,144,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (id) {
      const def = ARTIFACT_BY_ID[id];
      tip(ax, ay, 18, def.name, `${def.desc} (key ${i + 1})`, def.color);
      ctx.fillStyle = def.color;
      ctx.font = `700 18px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(def.glyph, ax, ay + 6);
      const cdFrac = p.artifactCd[i] / (def.cooldown * s.artifactCdMult);
      cooldownPie(ctx, ax, ay, 18, cdFrac);
      if (def.souls && p.souls < def.souls) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(ax, ay, 18, 0, TAU);
        ctx.fill();
      }
      if (id === 'void_beacon' && p.beamT > 0) {
        ctx.strokeStyle = '#e0a8ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ax, ay, 20, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#c8b8c0';
    ctx.font = `700 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${i + 1}`, ax, ay + 30);
  }
}

function drawPotion(ctx: CanvasRenderingContext2D, w: World, px: number, py: number): void {
  const p = w.player;
  const s = w.stats;
  tip(px, py, 14, 'Healing Potion', `Restores health. Recharges in ${Math.round(s.potionCooldown)}s. (key R)`, '#5adf6a');
  ctx.fillStyle = p.potionCd > 0 ? '#3a5a3a' : '#5adf6a';
  ctx.beginPath();
  ctx.arc(px, py, 14, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e8ffe8';
  ctx.fillRect(px - 4, py - 22, 8, 8);
  cooldownPie(ctx, px, py, 14, p.potionCd / s.potionCooldown);
  ctx.fillStyle = '#fff';
  ctx.font = `700 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('R', px, py + 30);
  if (p.potionCd > 0) {
    ctx.font = `700 12px ${FONT}`;
    ctx.fillText(`${Math.ceil(p.potionCd)}`, px, py + 4);
  }
}

/** Boon slots, passives and enchantments (top-left). */
function drawBuild(ctx: CanvasRenderingContext2D, run: Run | null, top: number, canCast: boolean, x0: number): void {
  if (run) {
    const slots: ['attack' | 'special' | 'cast' | 'dash', string][] = [
      ['attack', 'A'],
      ['special', 'S'],
      ['cast', 'C'],
      ['dash', 'D'],
    ];
    let bx = x0;
    const by = 30 + top;
    for (const [slot, letter] of slots) {
      const owned = run.boons.find((b) => BOON_BY_ID[b.id]?.slot === slot);
      if (slot === 'cast' && !canCast && !owned) continue;
      const col = owned ? GODS[BOON_BY_ID[owned.id].god].color : 'rgba(255,255,255,0.12)';
      const slotName = { attack: 'Attack', special: 'Special', cast: 'Cast', dash: 'Dash' }[slot];
      if (owned) tip(bx, by, 15, `${BOON_BY_ID[owned.id].name} (${slotName})`, `${owned.rarity} · level ${owned.level}. ${describeBoon(owned)}`, col);
      else tip(bx, by, 15, `${slotName} slot`, `No boon yet. A god's ${slotName.toLowerCase()} boon goes here.`, '#c8b8c0');
      ctx.fillStyle = 'rgba(8,4,12,0.7)';
      ctx.beginPath();
      ctx.arc(bx, by, 15, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = owned ? RARITY_COLOR[owned.rarity] : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.font = `700 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(owned ? GODS[BOON_BY_ID[owned.id].god].glyph : letter, bx, by + 5);
      if (owned && owned.level > 1) {
        ctx.fillStyle = '#fff';
        ctx.font = `700 9px ${FONT}`;
        ctx.fillText(`${owned.level}`, bx + 12, by + 14);
      }
      bx += 36;
    }
    // passives & duos
    let row = 0;
    let col = 0;
    for (const b of run.boons) {
      const def = BOON_BY_ID[b.id];
      if (!def || (def.slot !== 'passive' && def.slot !== 'duo')) continue;
      const x = x0 + col * 26;
      const y = 62 + top + row * 26;
      ctx.fillStyle = def.slot === 'duo' ? RARITY_COLOR.duo : GODS[def.god].color;
      tip(x, y, 9, def.name, `${b.rarity} · level ${b.level}. ${describeBoon(b)}`, def.slot === 'duo' ? RARITY_COLOR.duo : GODS[def.god].color);
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#100810';
      ctx.font = `700 10px ${FONT}`;
      ctx.fillText(GODS[def.god].glyph, x, y + 4);
      col++;
      if (col >= 6) {
        col = 0;
        row++;
      }
    }
    // enchants
    let ex = x0;
    const ey = 62 + top + (row + (col > 0 ? 1 : 0)) * 26 + 4;
    for (const e of run.enchants) {
      const def = ENCHANT_BY_ID[e.id];
      tip(ex, ey, 11, `${def.name} ${'I'.repeat(e.tier)}`, def.desc(e.tier), def.color);
      ctx.fillStyle = 'rgba(8,4,12,0.7)';
      ctx.beginPath();
      ctx.roundRect(ex - 11, ey - 11, 22, 22, 4);
      ctx.fill();
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = def.color;
      ctx.font = `700 12px ${FONT}`;
      ctx.fillText(def.glyph, ex, ey + 4);
      ctx.font = `700 8px ${FONT}`;
      ctx.fillStyle = '#fff';
      ctx.fillText('I'.repeat(e.tier), ex, ey + 19);
      ex += 28;
    }
  }
}

/** Currencies, location and run timer, right-aligned at x = rx. */
function drawTopRight(ctx: CanvasRenderingContext2D, w: World, run: Run | null, save: SaveData, rx: number, hub: boolean, level: number, left = false, compact = false): void {
  ctx.textAlign = left ? 'left' : 'right';
  ctx.font = `700 17px ${FONT}`;
  let ry = 34;
  if (compact) {
    // Phones: obols and Ash share one line to keep clear of the buttons below.
    const ash = `${save.ash} ◆`;
    const gold = run ? `${run.gold} ◎` : '';
    const gap = gold ? 16 : 0;
    const ashW = ctx.measureText(ash).width;
    const goldW = ctx.measureText(gold).width;
    const start = left ? rx : rx - ashW - gap - goldW;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd04a';
    if (gold) ctx.fillText(gold, start, ry);
    ctx.fillStyle = '#c8a8ff';
    ctx.fillText(ash, start + goldW + gap, ry);
    ctx.textAlign = left ? 'left' : 'right';
  } else {
    if (run) {
      ctx.fillStyle = '#ffd04a';
      ctx.fillText(`${run.gold} ◎`, rx, ry);
      ry += 24;
    }
    ctx.fillStyle = '#c8a8ff';
    ctx.fillText(`${save.ash} ◆`, rx, ry);
  }
  ry += 22;
  // Level, rank and experience toward the next level.
  const tier = tierFor(level);
  const prog = levelFromXp(save.xp);
  ctx.font = `700 13px ${FONT}`;
  ctx.fillStyle = tier.color;
  ctx.fillText(`Lv ${level} · ${tier.name}`, rx, ry);
  ry += 6;
  const bx = left ? rx : rx - 110;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(bx, ry, 110, 4);
  ctx.fillStyle = tier.color;
  ctx.fillRect(bx, ry, prog.need ? (110 * prog.into) / prog.need : 110, 4);
  ry += 22;
  ctx.font = `600 13px ${FONT}`;
  ctx.fillStyle = '#c8b8c0';
  if (compact) {
    // Location and timer are left out on phones; banners announce each room.
    if (run && run.heat > 0) {
      ctx.fillStyle = '#ff6a5a';
      ctx.fillText(`Torment ${run.heat}`, rx, ry);
    }
    return;
  }
  if (run) {
    const label = run.current.kind === 'boss' ? 'Guardian' : run.current.kind === 'combat' ? `Chamber ${run.depth + 1}` : run.current.kind === 'antechamber' ? 'Antechamber' : run.current.kind === 'shop' ? 'Wares' : 'Rest';
    ctx.fillText(`${w.biome.name} · ${label}`, rx, ry);
    ry += 18;
    if (run.heat > 0) {
      ctx.fillStyle = '#ff6a5a';
      ctx.fillText(`Torment ${run.heat}`, rx, ry);
      ry += 18;
    }
    const t = Math.floor(run.time);
    ctx.fillStyle = '#8a7a88';
    ctx.fillText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, rx, ry);
  } else if (hub) {
    ctx.fillText('The Hall of Shades', rx, ry);
  }
}

/** Boss bar, room banner and hints. */
function drawOverlays(ctx: CanvasRenderingContext2D, w: World, vw: number, vh: number, run: Run | null, hub: boolean, touch: boolean, span: [number, number] | null): void {
  const p = w.player;
  const boss = w.boss;
  if (boss && !boss.dead && !boss.spawning) {
    const bw2 = span ? Math.max(140, span[1] - span[0]) : Math.min(640, vw - 120);
    const bx2 = span ? span[0] : vw / 2 - bw2 / 2;
    const cx = bx2 + bw2 / 2;
    const by2 = 34;
    ctx.textAlign = 'center';
    ctx.font = `700 ${span ? 15 : 20}px ${FONT}`;
    ctx.fillStyle = '#ffd8d0';
    ctx.fillText(boss.name.toUpperCase(), cx, by2 - 6);
    if (boss instanceof Boss) {
      ctx.font = `600 12px ${FONT}`;
      ctx.fillStyle = '#c8a8a0';
      ctx.fillText(boss.title, cx, by2 + 30);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(bx2, by2, bw2, 12);
    ctx.fillStyle = '#d8283c';
    ctx.fillRect(bx2, by2, bw2 * Math.max(0, boss.hp / boss.maxHp), 12);
    if (boss.maxArmor > 0 && boss.armor > 0) {
      ctx.fillStyle = '#c8a060';
      ctx.fillRect(bx2, by2 + 13, bw2 * (boss.armor / boss.maxArmor), 4);
    }
    ctx.fillStyle = '#ffd890';
    ctx.fillRect(bx2 + bw2 * 0.5 - 1, by2 - 2, 2, 16);
    ctx.strokeStyle = '#ffd890';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx2, by2, bw2, 12);
  }

  // ---------------------------------------------------------------- banner
  // Phones: a little lower so the banner clears the health panel and boss bar.
  const bannerY = touch ? 0.36 : 0.22;
  const bn = w.banner;
  if (bn) {
    const a = Math.min(1, bn.t * 3, (3.2 - bn.t) * 2);
    ctx.globalAlpha = Math.max(0, a);
    ctx.textAlign = 'center';
    const g = ctx.createLinearGradient(vw / 2 - 300, 0, vw / 2 + 300, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(vw / 2 - 300, vh * bannerY - 44, 600, 84);
    ctx.font = `700 36px ${FONT}`;
    ctx.fillStyle = '#ffd890';
    ctx.fillText(bn.title, vw / 2, vh * bannerY);
    ctx.font = `italic 600 16px ${FONT}`;
    ctx.fillStyle = '#d8c8c0';
    ctx.fillText(bn.sub, vw / 2, vh * bannerY + 28);
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- control hint
  if (prefs.hints && !touch && (hub || (run && run.roomsCleared === 0 && run.biomeIndex === 0))) {
    const s = w.stats;
    ctx.textAlign = 'right';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = 'rgba(220,200,200,0.7)';
    // Only what you've unlocked so far.
    const extras = [
      s.artifactSlots > 0 ? `${['1', '1 2', '1 2 3'][s.artifactSlots - 1]} Artifacts` : '',
      s.canPotion ? 'R Potion' : '',
      s.canWrath ? 'F Wrath' : '',
      'E Interact · Esc Pause',
    ].filter(Boolean);
    const lines = [
      'WASD move · Mouse aim',
      `LMB / J Attack · RMB / K Special${s.canCast ? ' · Q Cast' : ''}`,
      `Space Dash${s.canJump ? ' · Shift / C Jump (attack mid-air to Slam)' : ''}`,
      extras.join(' · '),
    ];
    lines.forEach((l, i) => ctx.fillText(l, vw - 20, vh - 80 + i * 17));
  }

  if (p.beamT > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e0a8ff';
    ctx.font = `700 12px ${FONT}`;
    ctx.fillText('Void Prism — press again to stop', vw / 2, vh - 30);
  }
}
