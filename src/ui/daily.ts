// The daily challenge's menu (today's modifiers, your best and streak) and its results.
import { audio } from '../engine/audio';
import { DAILY_MODS, dailyFor, dailyKey, dayBefore, streakAsh, type DailyRun } from '../game/daily';
import type { Game } from '../game/game';
import { esc } from './overlay';

function bind(el: HTMLElement, sel: string, fn: (b: HTMLElement) => void): void {
  el.querySelectorAll<HTMLElement>(sel).forEach((b) => (b.onclick = () => fn(b)));
}

const fmtTime = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Hours and minutes until the next daily (midnight UTC). */
function untilNext(now = new Date()): string {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const mins = Math.max(1, Math.round((next - now.getTime()) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
}

const modsHtml = (d: DailyRun) =>
  d.mods
    .map((id) => {
      const m = DAILY_MODS[id];
      return `<div class="daily-mod"><i>${m.glyph}</i><div><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></div></div>`;
    })
    .join('');

/** Today's challenge: what it holds, your best today, your streak. */
export function dailyMenu(g: Game): void {
  const key = dailyKey();
  const d = dailyFor(key);
  const rec = g.save.daily;
  const best = rec.best[key];
  // The streak is still alive if you played yesterday (or already today).
  const alive = rec.last === key || rec.last === dayBefore(key);
  const streak = alive ? rec.streak : 0;
  const recent = Object.entries(rec.best)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, 7)
    .map(([day, s]) => `<div><span>${day === key ? 'Today' : day}</span><b>${s.toLocaleString()}</b></div>`)
    .join('');
  const el = g.ui.push(
    'station',
    `<div class="panel daily-panel"><h2 class="title" style="color:#ffd04a">Daily Challenge</h2>
      <div class="subtitle">${key} · the same escape for everyone today · next one in ${untilNext()}</div>
      <div class="daily-mods">${modsHtml(d)}</div>
      <p class="small">You play your own hero. Score: 100 a chamber, 600 a guardian, and 2,500 for escaping, plus up to 1,500 for speed. Your best of the day counts; try as often as you like. A daily run never touches your saved escape.</p>
      <div class="stats">
        <div><span>Your best today</span><b>${best !== undefined ? best.toLocaleString() : '—'}</b></div>
        <div><span>Streak</span><b>${streak} day${streak === 1 ? '' : 's'}${rec.longest > 1 ? ` (longest ${rec.longest})` : ''}</b></div>
        <div><span>Today's streak bonus</span><b>${rec.last === key ? 'Earned' : `+${streakAsh(alive ? rec.streak + 1 : 1)} Ash on your first run`}</b></div>
      </div>
      ${recent ? `<h3 class="section">Your recent days</h3><div class="stats daily-days">${recent}</div>` : ''}
      <div class="row-btns"><button class="btn primary" data-nav data-a="go">Begin today's challenge</button><button class="btn" data-nav data-a="back">Back</button></div></div>`,
    { onBack: () => g.ui.pop() },
  );
  bind(el, '[data-a]', (b) => {
    audio.play('select');
    if (b.dataset.a === 'go') g.startDaily();
    else g.ui.pop();
  });
}

export interface DailyOutcome {
  daily: DailyRun;
  score: number;
  newBest: boolean;
  streakBonus: number;
  victory: boolean;
  rooms: number;
  guardians: number;
  time: number;
  kills: number;
}

/** The end of a daily run: its score, and whether it beat the day's best. */
export function dailyResults(g: Game, r: DailyOutcome): void {
  audio.play(r.newBest ? 'boon' : 'select');
  const el = g.ui.push(
    'over',
    `<div class="panel"><h2 class="title ${r.victory ? 'gold' : ''}">${r.victory ? 'Daily escape!' : 'Daily run over'}</h2>
      <div class="subtitle">${r.daily.key} · ${r.daily.mods.map((id) => esc(DAILY_MODS[id].name)).join(' · ')}</div>
      <div class="daily-score">${r.score.toLocaleString()}<small>${r.newBest ? 'A new best for today!' : `Today's best: ${(g.save.daily.best[r.daily.key] ?? r.score).toLocaleString()}`}</small></div>
      <div class="stats">
        <div><span>Chambers cleared</span><b>${r.rooms}</b></div>
        <div><span>Guardians slain</span><b>${r.guardians}</b></div>
        <div><span>Foes slain</span><b>${r.kills}</b></div>
        <div><span>Time</span><b>${fmtTime(r.time)}</b></div>
        ${r.streakBonus > 0 ? `<div><span>Streak: ${g.save.daily.streak} day${g.save.daily.streak === 1 ? '' : 's'}</span><b>+${r.streakBonus} Ash</b></div>` : ''}
      </div>
      <div class="row-btns"><button class="btn primary" data-nav data-a="again">Try again</button><button class="btn" data-nav data-a="hall">Hall of Shades</button></div></div>`,
  );
  bind(el, '[data-a]', (b) => {
    audio.play('select');
    if (b.dataset.a === 'again') g.startDaily();
    else {
      g.ui.closeAll();
      g.transition(() => g.enterHub(), true);
    }
  });
}
