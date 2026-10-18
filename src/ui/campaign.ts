// Campaign menus: chapters and missions, story scenes, and a mission's results.
import { audio } from '../engine/audio';
import { CHAPTERS, chapterDone, chapterMissions, chapterStars, MISSIONS, missionOpen, SPEAKERS, STAR_DAMAGE, type Mission, type StoryLine } from '../game/campaign';
import type { Game } from '../game/game';
import type { Spoils } from '../game/run';
import { esc } from './overlay';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

function bind(el: HTMLElement, sel: string, fn: (b: HTMLElement) => void): void {
  el.querySelectorAll<HTMLElement>(sel).forEach((b) => (b.onclick = () => fn(b)));
}

function fmtTime(t: number): string {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function starRow(n: number, max = 3): string {
  return `<span class="mstars">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('')}</span>`;
}

/** The campaign: each chapter and its missions, played in order. */
export function campaign(g: Game): void {
  const p = g.save.campaign;
  const render = () =>
    CHAPTERS.map((c) => {
      const st = chapterStars(p, c.n);
      const missions = chapterMissions(c.n);
      const head = `<div class="chapter-head"><h3>Chapter ${ROMAN[c.n] ?? c.n} · ${esc(c.title)}</h3>${c.soon ? '<em>Coming soon</em>' : `<small>${st.got}/${st.max} ★${chapterDone(p, c.n) ? ' · complete' : ''}</small>`}</div><p class="small">${esc(c.blurb)}</p>`;
      if (c.soon || !missions.length) return `<section class="chapter soon">${head}</section>`;
      const cards = missions
        .map((m, i) => {
          const open = missionOpen(p, m.id);
          const done = p.missions[m.id];
          return `<button class="mission${open ? '' : ' disabled'}${done ? ' done' : ''}" data-nav data-m="${m.id}">
            <span class="mnum">${i + 1}</span>
            <span class="mtext"><b>${esc(m.title)}</b><small>${esc(open ? m.blurb : 'Finish the mission before it to open this one.')}</small></span>
            <span class="mres">${done ? `${starRow(done.stars)}<small>Best ${fmtTime(done.best)}</small>` : open ? '<small>New</small>' : '<small>🔒</small>'}</span></button>`;
        })
        .join('');
      return `<section class="chapter">${head}<div class="missions">${cards}</div></section>`;
    }).join('');
  const el = g.ui.push(
    'campaign-screen',
    `<div class="panel wide"><h2 class="title">Campaign</h2>
      <div class="subtitle">Hand-made missions with a story. Your hero, gear, skills and Altar come with you; Ash and experience come back.</div>
      <div data-list>${render()}</div>
      <p class="small">Stars: finish the mission · beat its par time · lose no more than ${Math.round(STAR_DAMAGE * 100)}% of your health. Missions aren't saved part-way, and they never touch a saved escape.</p>
      <button class="btn" data-nav data-a="back">Back</button></div>`,
    { onBack: () => g.ui.pop() },
  );
  bind(el, '[data-m]', (b) => {
    const m = MISSIONS.find((x) => x.id === b.dataset.m);
    if (!m || !missionOpen(p, m.id)) {
      audio.play('deny');
      return;
    }
    audio.play('select');
    briefing(g, m);
  });
  bind(el, '[data-a]', () => g.ui.pop());
}

/** A mission's card before it starts: the goals and rewards, then its opening scene. */
function briefing(g: Game, m: Mission): void {
  const done = g.save.campaign.missions[m.id];
  const goals = m.rooms
    .map((r, i) => `<li><b>${i + 1}.</b> ${esc(r.line)}${r.goal === 'survive' ? ` (${r.survive ?? 30}s)` : ''}</li>`)
    .join('');
  const el = g.ui.push(
    'station',
    `<div class="panel"><h2 class="title">${esc(m.title)}</h2>
      <div class="subtitle">Chapter ${ROMAN[m.chapter] ?? m.chapter} · ${esc(m.blurb)}</div>
      <ul class="mgoals">${goals}</ul>
      <div class="stats">
        <div><span>Par time</span><b>${fmtTime(m.par)}</b></div>
        <div><span>${done ? 'Replay reward' : 'First clear'}</span><b>${done ? Math.round(m.ash / 4) : m.ash} ◆ · ${done ? Math.round(m.xp / 3) : m.xp} XP</b></div>
        ${done ? `<div><span>Your best</span><b>${starRow(done.stars)} ${fmtTime(done.best)}</b></div>` : ''}
      </div>
      <div class="row-btns"><button class="btn primary" data-nav data-a="go">Begin</button><button class="btn" data-nav data-a="back">Back</button></div></div>`,
    { onBack: () => g.ui.pop() },
  );
  bind(el, '[data-a]', (b) => {
    if (b.dataset.a !== 'go') {
      g.ui.pop();
      return;
    }
    audio.play('select');
    story(g, m.intro, () => g.startMission(m.id), m.title);
  });
}

/** A story scene: one line at a time, with who says it. */
export function story(g: Game, lines: StoryLine[], done: () => void, heading = ''): void {
  let i = 0;
  const heroName = g.me.player.hero.name;
  const speaker = (l: StoryLine) => (l.who === 'hero' ? { name: heroName, color: g.me.player.hero.color } : SPEAKERS[l.who]);
  const render = () => {
    const l = lines[i];
    const s = speaker(l);
    return `<div class="story-line${l.who === 'narrator' ? ' narrator' : ''}" style="--c:${s.color}">
      ${s.name ? `<b class="speaker">${esc(s.name)}</b>` : ''}
      <p>${esc(l.text.replace(/\{hero\}/g, heroName))}</p></div>
      <div class="story-dots">${lines.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>`;
  };
  const finish = () => {
    g.ui.pop();
    done();
  };
  const next = () => {
    audio.play('select');
    if (i >= lines.length - 1) finish();
    else {
      i++;
      el.querySelector('[data-line]')!.innerHTML = render();
    }
  };
  if (!lines.length) {
    done();
    return;
  }
  const el = g.ui.push(
    'story',
    `<div class="panel story-panel">${heading ? `<div class="story-head">${esc(heading)}</div>` : ''}
      <div data-line>${render()}</div>
      <div class="row-btns"><button class="btn primary" data-nav data-a="next">Continue</button><button class="btn ghost" data-nav data-a="skip">Skip</button></div></div>`,
    { onBack: finish },
  );
  bind(el, '[data-a]', (b) => (b.dataset.a === 'skip' ? finish() : next()));
}

export interface MissionResult {
  mission: Mission;
  time: number;
  stars: number;
  fast: boolean;
  unhurt: boolean;
  first: boolean;
  ash: number;
  xp: number;
  kills: number;
  spoils: Spoils;
}

/** The mission is won: its closing scene, then the results and what's next. */
export function missionComplete(g: Game, r: MissionResult): void {
  story(
    g,
    r.mission.outro,
    () => {
      const m = r.mission;
      const i = MISSIONS.indexOf(m);
      const next = MISSIONS[i + 1];
      const nextOpen = next && missionOpen(g.save.campaign, next.id);
      const chapterEnd = !next || next.chapter !== m.chapter;
      const el = g.ui.push(
        'over',
        `<div class="panel"><h2 class="title gold">Mission complete</h2>
          <div class="subtitle">${esc(m.title)} · Chapter ${ROMAN[m.chapter] ?? m.chapter}</div>
          <div class="result-stars">${starRow(r.stars)}</div>
          <div class="stats">
            <div><span>Mission finished</span><b>★</b></div>
            <div><span>Time ${fmtTime(r.time)} (par ${fmtTime(m.par)})</span><b>${r.fast ? '★' : '—'}</b></div>
            <div><span>Health lost ${r.unhurt ? 'kept low' : 'too high'}</span><b>${r.unhurt ? '★' : '—'}</b></div>
            <div><span>Foes slain</span><b>${r.kills}</b></div>
            <div><span>${r.first ? 'First clear' : 'Replay'}</span><b>+${r.ash} ◆ · +${r.xp} XP</b></div>
          </div>
          ${chapterEnd ? `<p class="small chapter-end">Chapter ${ROMAN[m.chapter] ?? m.chapter} complete.${next ? '' : ' The story continues in a later update.'}</p>` : ''}
          <div class="row-btns">
            ${nextOpen ? `<button class="btn primary" data-nav data-a="next">Next: ${esc(next.title)}</button>` : ''}
            <button class="btn${nextOpen ? '' : ' primary'}" data-nav data-a="campaign">Campaign</button>
            <button class="btn" data-nav data-a="hall">Hall of Shades</button>
          </div></div>`,
      );
      bind(el, '[data-a]', (b) => {
        audio.play('select');
        const a = b.dataset.a;
        if (a === 'next' && next) {
          g.ui.closeAll();
          story(g, next.intro, () => g.startMission(next.id), next.title);
        } else if (a === 'campaign') g.toCampaign();
        else {
          g.ui.closeAll();
          g.transition(() => g.enterHub(), true);
        }
      });
    },
    r.mission.title,
  );
}

/** Fallen in a mission: try again, or back to the campaign. */
export function missionFailed(g: Game, m: Mission): void {
  const el = g.ui.push(
    'over',
    `<div class="panel"><h2 class="title blood">Mission failed</h2>
      <div class="subtitle">${esc(m.title)}: the Deep holds you, for now. Ysolde will drag you back to your feet.</div>
      <p class="small">Experience and Ash you gathered are kept. Missions start again from their first chamber.</p>
      <div class="row-btns"><button class="btn primary" data-nav data-a="retry">Try again</button><button class="btn" data-nav data-a="campaign">Campaign</button><button class="btn" data-nav data-a="hall">Hall of Shades</button></div></div>`,
  );
  bind(el, '[data-a]', (b) => {
    audio.play('select');
    const a = b.dataset.a;
    if (a === 'retry') g.startMission(m.id);
    else if (a === 'campaign') g.toCampaign();
    else {
      g.ui.closeAll();
      g.transition(() => g.enterHub(), true);
    }
  });
}
