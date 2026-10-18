import { clamp, TAU } from '../engine/math';
import { ARTIFACT_BY_ID } from './artifacts';
import { BOON_BY_ID, describeBoon, GODS, RARITY_COLOR } from './boons';
import { Boss } from './enemies';
import { ENCHANT_BY_ID } from './enchants';
import { prefs } from './prefs';
import { levelFromXp, tierFor, TIERS, WRATH_MAX } from './progression';
import type { Run } from './run';
import type { SaveData } from './meta';
import { LOOT_FEED_TIME, type World } from './world';

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

/** The key shown for an action ("R", "4"…); the game points this at the live bindings. */
let keyOf: (action: string) => string = (a) => ({ potion: 'R', wrath: 'V', guard: 'F', dash: 'Left Shift', jump: 'Space', artifact1: '1', artifact2: '2', artifact3: '3' })[a] ?? '';
export function useKeyLabels(fn: (action: string) => string): void {
  keyOf = fn;
}
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
  // Heights leave room for everything inside, down to the key labels under the
  // potion and artifact slots (which sit 30 below their centres, at hy + 76).
  const ph = touch ? (s.artifactSlots ? 86 : s.canWrath ? 66 : 58) : s.canPotion || s.artifactSlots ? 120 : s.canWrath ? 70 : 64;
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
      ctx.fillText(touch ? '☄' : `☄ ${keyOf('wrath')}`, hx + bw + 8, hy + 28);
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
    const cx = hx + dx + 52 + i * 16;
    ctx.fillStyle = i < p.dashCharges ? '#ffd890' : 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(cx, hy - 16, 5, 0, TAU);
    ctx.fill();
    // The charge coming back fills like a clock.
    if (i === p.dashCharges && s.dashRecharge > 0) {
      const k = clamp(1 - p.dashRechargeT / s.dashRecharge, 0, 1);
      ctx.fillStyle = 'rgba(255,216,144,0.6)';
      ctx.beginPath();
      ctx.moveTo(cx, hy - 16);
      ctx.arc(cx, hy - 16, 5, -Math.PI / 2, -Math.PI / 2 + k * TAU);
      ctx.fill();
    }
  }
  if (touch) {
    if (s.artifactSlots > 0) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#7fe8ff';
      ctx.font = `700 11px ${FONT}`;
      ctx.fillText(`ECHOES ${Math.floor(p.souls)}`, hx, hy + 44);
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

/** Set while a second player's panel takes the bottom-right corner. */
let partnerShown = false;
export function setPartnerShown(on: boolean): void {
  partnerShown = on;
}

/**
 * Local co-op: the second player's own panel, bottom-right in their party
 * colour (health, wrath, cast shards, dash charges, potion and Echoes). Draw
 * it while that hero is the world's active one.
 */
export function drawPartnerHUD(ctx: CanvasRenderingContext2D, w: World, run: Run | null, vw: number, vh: number, name: string, color: string): void {
  const p = w.player;
  const s = w.stats;
  const pw = 270;
  const ph = 92;
  const x = vw - pw - 14;
  const y = vh - ph - 10;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  panel(ctx, x, y, pw, ph, 0.72);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.roundRect(x, y, pw, ph, 6);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const hx = x + 12;
  ctx.font = `700 13px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = color;
  ctx.fillText(p.state === 'dead' ? `${name} — DOWN` : name, hx, y + 18);
  const dd = run?.deathDefiance ?? 0;
  ctx.fillStyle = '#ffcf5a';
  ctx.textAlign = 'right';
  if (dd) ctx.fillText('✚'.repeat(dd), x + pw - 12, y + 18);
  ctx.textAlign = 'left';
  const bw = pw - 24;
  const by = y + 26;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(hx, by, bw, 14);
  const hg = ctx.createLinearGradient(hx, 0, hx + bw, 0);
  hg.addColorStop(0, '#9a1028');
  hg.addColorStop(1, '#ff3a4a');
  ctx.fillStyle = hg;
  ctx.fillRect(hx, by, bw * clamp(p.hp / p.maxHp, 0, 1), 14);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(hx, by, bw, 14);
  ctx.font = `700 11px ${FONT}`;
  ctx.fillStyle = '#fff';
  ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, hx + 5, by + 11);
  if (s.canWrath) {
    const k = Math.min(1, p.wrath / WRATH_MAX);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(hx, by + 17, bw, 4);
    ctx.fillStyle = k >= 1 ? '#ffd04a' : '#c89a30';
    ctx.fillRect(hx, by + 17, bw * k, 4);
  }
  // Shards, dash charges, potion and Echoes on one row.
  const ry = by + 38;
  ctx.font = `700 10px ${FONT}`;
  ctx.fillStyle = '#c8b8c0';
  let cx = hx;
  if (s.canCast) {
    for (let i = 0; i < s.castAmmo; i++) {
      ctx.fillStyle = i < p.castAmmo ? (s.castPower ? GODS[s.castPower.god].color : '#ff3050') : 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.moveTo(cx + 5, ry - 7);
      ctx.lineTo(cx + 10, ry);
      ctx.lineTo(cx + 5, ry + 7);
      ctx.lineTo(cx, ry);
      ctx.fill();
      cx += 13;
    }
    cx += 8;
  }
  for (let i = 0; i < s.dashCharges; i++) {
    ctx.fillStyle = i < p.dashCharges ? '#ffd890' : 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(cx + 4, ry, 4, 0, TAU);
    ctx.fill();
    cx += 12;
  }
  cx += 8;
  if (s.canPotion) {
    ctx.fillStyle = p.potionCd > 0 ? '#3a5a3a' : '#5adf6a';
    ctx.beginPath();
    ctx.arc(cx + 7, ry, 7, 0, TAU);
    ctx.fill();
    cooldownPie(ctx, cx + 7, ry, 7, p.potionCd / s.potionCooldown);
    cx += 22;
  }
  if (s.artifactSlots > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const sw = Math.max(30, x + pw - 12 - cx);
    ctx.fillRect(cx, ry - 3, sw, 6);
    ctx.fillStyle = '#7fe8ff';
    ctx.fillRect(cx, ry - 3, sw * (p.souls / s.soulMax), 6);
  }
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
  ctx.fillText(`ECHOES ${Math.floor(p.souls)}`, sx, sy - 6);
  tip(sx + 60, sy - 4, 62, 'Echoes', `Slain foes leave Echoes behind (up to ${s.soulMax}). They fuel your artifacts: using one costs the Echoes shown on it. The gauge starts empty each escape, so fight to fill it.`, '#7fe8ff');
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
      tip(ax, ay, 18, def.name, `${def.desc} (key ${keyOf(`artifact${i + 1}`)})`, def.color);
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
    ctx.fillText(keyOf(`artifact${i + 1}`), ax, ay + 30);
  }
}

function drawPotion(ctx: CanvasRenderingContext2D, w: World, px: number, py: number): void {
  const p = w.player;
  const s = w.stats;
  tip(px, py, 14, 'Healing Potion', `Restores health. Recharges in ${Math.round(s.potionCooldown)}s. (key ${keyOf('potion')})`, '#5adf6a');
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
  ctx.fillText(keyOf('potion'), px, py + 30);
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
  const rankText = `Lv ${level} · ${tier.name}`;
  ctx.fillText(rankText, rx, ry);
  {
    const tw = ctx.measureText(rankText).width;
    const next = TIERS.find((t) => t.level > level);
    tip(
      ctx.textAlign === 'right' ? rx - tw / 2 : rx + tw / 2,
      ry - 5,
      Math.max(24, tw / 2),
      `Rank: ${tier.name}`,
      `Your level and rank (not a foe). Experience from foes, chambers, guardians and escapes raises your level; every 5 levels you rise a rank: ${TIERS.map((t) => t.name).join(', ')}.${next ? ` ${next.name} at level ${next.level}.` : ''}`,
      tier.color,
    );
  }
  ry += 6;
  const bx = left ? rx : rx - 110;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(bx, ry, 110, 4);
  ctx.fillStyle = tier.color;
  ctx.fillRect(bx, ry, prog.need ? (110 * prog.into) / prog.need : 110, 4);
  ry += 22;
  ctx.font = `600 13px ${FONT}`;
  ctx.fillStyle = '#c8b8c0';
  if (run?.mission?.goal) {
    // Campaign: the mission's goal (a countdown when holding out).
    ctx.fillStyle = '#ffd890';
    ctx.font = `700 ${compact ? 13 : 15}px ${FONT}`;
    ctx.fillText(run.mission.goal, rx, ry);
    ry += 18;
    ctx.font = `600 13px ${FONT}`;
    ctx.fillStyle = '#c8b8c0';
  }
  if (compact) {
    // Location and timer are left out on phones; banners announce each room.
    if (run && run.heat > 0) {
      ctx.fillStyle = '#ff6a5a';
      ctx.fillText(`Torment ${run.heat}`, rx, ry);
    }
    return;
  }
  if (run) {
    const label = run.mission ? `Mission · chamber ${run.mission.step + 1}` : run.current.kind === 'boss' ? 'Guardian' : run.current.kind === 'combat' ? `Chamber ${run.depth + 1}` : run.current.kind === 'antechamber' ? 'Antechamber' : run.current.kind === 'shop' ? 'Wares' : 'Rest';
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
  if (bn) drawBanner(ctx, bn, vw / 2, vh * bannerY, vw);

  // ---------------------------------------------------------------- combo meter
  const pl = w.player;
  if (pl.combo >= 5) {
    const k = Math.max(0, 1 - pl.comboT / 2.5);
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * k;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    const cx = vw - 24;
    const cy = touch ? vh * 0.3 : 196;
    const pop = Math.max(0, 0.15 - pl.comboT) * 4;
    ctx.font = `700 ${Math.round(30 * (1 + pop))}px ${FONT}`;
    ctx.fillStyle = pl.combo >= 50 ? '#ff9aff' : pl.combo >= 25 ? '#ffb04a' : '#ffd890';
    ctx.fillText(`${pl.combo}`, cx, cy);
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = '#e8dcc8';
    ctx.fillText(`HIT COMBO${pl.combo >= 10 ? ` · +${Math.min(10, Math.floor(pl.combo / 10))}% damage` : ''}`, cx, cy + 16);
    // Drains as the timeout nears.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(cx - 110, cy + 22, 110, 3);
    ctx.fillStyle = '#ffd890';
    ctx.fillRect(cx - 110 * k, cy + 22, 110 * k, 3);
    ctx.restore();
  }

  // ---------------------------------------------------------------- loot feed
  if (w.lootFeed.length) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `600 13px ${FONT}`;
    const fx0 = 24;
    let fy = touch ? 168 : 84;
    for (const f of w.lootFeed) {
      const a = Math.min(1, f.t * 6, (LOOT_FEED_TIME - f.t) * 1.5);
      if (a <= 0) continue;
      const slide = Math.max(0, 1 - f.t * 6) * 16;
      ctx.globalAlpha = a * 0.6;
      const tw = ctx.measureText(f.text).width;
      ctx.fillStyle = 'rgba(10,6,14,0.8)';
      ctx.fillRect(fx0 - 8 - slide, fy - 10, tw + 16, 20);
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, fx0 - slide, fy + 1);
      fy += 24;
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- control hint
  if (prefs.hints && !touch && !partnerShown && (hub || (run && run.roomsCleared === 0 && run.biomeIndex === 0))) {
    const s = w.stats;
    ctx.textAlign = 'right';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = 'rgba(220,200,200,0.7)';
    // Only what you've unlocked so far.
    const extras = [
      s.artifactSlots > 0 ? `${[1, 2, 3].slice(0, s.artifactSlots).map((i) => keyOf(`artifact${i}`)).join(' ')} Artifacts` : '',
      s.canGuard ? `${keyOf('guard')} Guard / Parry` : '',
      s.canPotion ? `${keyOf('potion')} Potion` : '',
      s.canWrath ? `${keyOf('wrath')} Wrath` : '',
      `${keyOf('interact')} Interact · Esc Pause`,
    ].filter(Boolean);
    const lines = [
      'WASD move · Mouse aim',
      `LMB / J Attack · RMB / K Special${s.canCast ? ' · Q Cast' : ''}`,
      `${keyOf('dash')} Dash${s.canJump ? ` · ${keyOf('jump')} Jump (attack mid-air to Slam)` : ''}`,
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

/**
 * The region banner: gilded rules unfurl from the centre with diamond
 * ornaments, then the name rises in gold over a smoky band.
 */
function drawBanner(ctx: CanvasRenderingContext2D, bn: { title: string; sub: string; t: number }, cx: number, cy: number, vw: number): void {
  const a = Math.max(0, Math.min(1, bn.t * 3, (3.2 - bn.t) * 2));
  const open = 1 - (1 - Math.min(1, bn.t / 0.7)) ** 3;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.font = `700 36px ${FONT}`;
  const tw = Math.max(ctx.measureText(bn.title).width, 200);
  const half = Math.min(vw / 2 - 12, tw / 2 + 110);
  const g = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
  g.addColorStop(0, 'rgba(10,4,8,0)');
  g.addColorStop(0.5, 'rgba(10,4,8,0.72)');
  g.addColorStop(1, 'rgba(10,4,8,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - half, cy - 46, half * 2, 90);
  // Gilded rules above and below, unfurling from the middle.
  const rw = half * open;
  const gold = ctx.createLinearGradient(cx - rw, 0, cx + rw, 0);
  gold.addColorStop(0, 'rgba(242,211,138,0)');
  gold.addColorStop(0.2, 'rgba(242,211,138,0.85)');
  gold.addColorStop(0.5, '#fff0c0');
  gold.addColorStop(0.8, 'rgba(242,211,138,0.85)');
  gold.addColorStop(1, 'rgba(242,211,138,0)');
  ctx.strokeStyle = gold;
  for (const [y, w] of [
    [cy - 46, 1.6],
    [cy - 41, 0.8],
    [cy + 44, 1.6],
    [cy + 39, 0.8],
  ]) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(cx - rw, y);
    ctx.lineTo(cx + rw, y);
    ctx.stroke();
  }
  const diamond = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.7, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.7, y);
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = '#f2d38a';
  for (const y of [cy - 46, cy + 44]) {
    diamond(cx, y, 7);
    // Little wings either side of the centre diamond.
    for (const s of [-1, 1]) {
      diamond(cx + s * 16, y, 3.5);
      diamond(cx + s * rw * 0.82, y, 3);
    }
  }
  // The name, in gold with an ember glow.
  const tg = ctx.createLinearGradient(0, cy - 30, 0, cy + 4);
  tg.addColorStop(0, '#fff3cc');
  tg.addColorStop(0.55, '#f2c86a');
  tg.addColorStop(1, '#b07a2a');
  ctx.shadowColor = 'rgba(255,120,50,0.55)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = tg;
  ctx.fillText(bn.title, cx, cy + (1 - open) * 8);
  ctx.shadowBlur = 0;
  ctx.font = `italic 600 16px ${FONT}`;
  ctx.fillStyle = '#e0d0c4';
  ctx.globalAlpha = a * Math.min(1, Math.max(0, (bn.t - 0.25) * 3));
  ctx.fillText(bn.sub, cx, cy + 28);
  ctx.restore();
}

/** A small "Saved" mark with a turning ring, shown after an autosave. `k` runs 0→1 over its life. */
export function drawSaveIcon(ctx: CanvasRenderingContext2D, vw: number, k: number, t: number): void {
  const a = Math.min(1, k * 6, (1 - k) * 3);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  const x = vw / 2 - 30;
  const y = 18;
  ctx.strokeStyle = '#f2d38a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 7, t * 6, t * 6 + Math.PI * 1.4);
  ctx.stroke();
  ctx.fillStyle = '#f2d38a';
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `600 13px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8dcc8';
  ctx.fillText('Saved', x + 13, y + 1);
  ctx.restore();
}
