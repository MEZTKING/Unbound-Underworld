// Campaign mode: hand-made missions grouped into chapters, with a story told
// before and after each one. Missions play on the same engine as an escape
// (boons, foes, guardians) but their chambers, foes and goals are fixed.
import type { RoomShape } from './rooms';
import type { EliteMod, EnemyKind, RewardSpec } from './types';

/** One line of a story scene. `{hero}` becomes the name of the hero you play. */
export interface StoryLine {
  who: 'guide' | 'hero' | 'warden' | 'narrator';
  text: string;
}

/** Who speaks in the story (original characters). */
export const SPEAKERS: Record<Exclude<StoryLine['who'], 'hero'>, { name: string; color: string }> = {
  guide: { name: 'Ysolde, the Unchained', color: '#9dd8ff' },
  warden: { name: 'Vexa, Warden of Chains', color: '#ff5a6a' },
  narrator: { name: '', color: '#c8b8c0' },
};

/** A group of foes in a wave: kind, how many, and an enchantment for all of them. */
export type WaveSpec = [EnemyKind, number, EliteMod?];

export interface MissionRoom {
  kind: 'combat' | 'boss';
  /** Fixed layout: the same chamber every time. */
  seed: number;
  shape?: RoomShape;
  /** Waves of foes, in order (combat chambers). */
  waves?: WaveSpec[][];
  /** clear: slay every foe · survive: hold out for `survive` seconds · boss: slay the guardian. */
  goal: 'clear' | 'survive' | 'boss';
  survive?: number;
  /** Dropped when the chamber is won (not after the last one). */
  reward?: RewardSpec | null;
  /** Raised ground (only built when every hero can jump). */
  heights?: number;
  /** Shown under the chamber's banner. */
  line: string;
}

export interface Mission {
  id: string;
  chapter: number;
  title: string;
  blurb: string;
  intro: StoryLine[];
  outro: StoryLine[];
  rooms: MissionRoom[];
  /** Seconds to beat for the time star. */
  par: number;
  /** Ash and experience for the first clear (a quarter of the Ash on replays). */
  ash: number;
  xp: number;
}

export interface Chapter {
  n: number;
  title: string;
  region: number;
  blurb: string;
  /** Not playable yet. */
  soon?: boolean;
}

export const CHAPTERS: Chapter[] = [
  { n: 1, title: 'Chains of the Deep', region: 0, blurb: 'Wake in the Shackled Deep, follow a stranger who remembers, and break the Warden’s hold.' },
  { n: 2, title: 'The Ember Fields', region: 1, blurb: 'Beyond the Deep, the cinder meadows burn. Coming in a later update.', soon: true },
];

export const MISSIONS: Mission[] = [
  {
    id: 'c1m1',
    chapter: 1,
    title: 'Awakening',
    blurb: 'Break free of your cell and fight your way to the first gate.',
    intro: [
      { who: 'narrator', text: 'Chains. Cold stone. A drip of water that has been falling for a thousand years.' },
      { who: 'guide', text: 'Up, shade. Up! The Warden’s chains slacken when the tide of souls turns, and it is turning now.' },
      { who: 'hero', text: 'Who are you? Where is this?' },
      { who: 'guide', text: 'Ysolde. Once a prisoner, like you. This is the Shackled Deep, and its jailers are already coming. Fight first; questions after.' },
    ],
    outro: [
      { who: 'guide', text: 'You fight like someone who remembers being alive. Good. Remembering is how we get out.' },
      { who: 'hero', text: 'And if I don’t want to remember?' },
      { who: 'guide', text: 'Then you’ll stay. Most do.' },
    ],
    rooms: [
      {
        kind: 'combat',
        seed: 1101,
        shape: 'hall',
        goal: 'clear',
        waves: [[['grunt', 3]], [['grunt', 2], ['skitter', 3]]],
        reward: { kind: 'boon', god: 'zeus' },
        line: 'Slay the jailers',
      },
      {
        kind: 'combat',
        seed: 1102,
        shape: 'tee',
        goal: 'clear',
        waves: [[['skitter', 4]], [['grunt', 3], ['caster', 1]]],
        line: 'Reach the first gate',
      },
    ],
    par: 120,
    ash: 40,
    xp: 60,
  },
  {
    id: 'c1m2',
    chapter: 1,
    title: 'The Hounds Below',
    blurb: 'Vexa looses her hounds. Hold the line until the gate turns.',
    intro: [
      { who: 'warden', text: 'A cell stands empty. I do not like empty cells.' },
      { who: 'guide', text: 'She knows. Hear that? Her hounds. We cannot outrun them, so we hold here until the gate turns.' },
    ],
    outro: [
      { who: 'guide', text: 'The gate! Through, quickly. They will be at our heels again soon enough.' },
    ],
    rooms: [
      {
        kind: 'combat',
        seed: 1201,
        shape: 'ring',
        goal: 'clear',
        waves: [[['skitter', 5]], [['skitter', 4], ['hissling', 2]]],
        reward: { kind: 'boon', god: 'artemis' },
        line: 'The pack gathers',
      },
      {
        kind: 'combat',
        seed: 1202,
        shape: 'hall',
        goal: 'survive',
        survive: 40,
        waves: [[['skitter', 4]], [['skitter', 4], ['grunt', 1]], [['skitter', 5]], [['hissling', 3], ['skitter', 3]], [['skitter', 6]], [['grunt', 2], ['skitter', 4]], [['skitter', 6]], [['hissling', 4]]],
        line: 'Hold the line until the gate turns',
      },
    ],
    par: 140,
    ash: 50,
    xp: 80,
  },
  {
    id: 'c1m3',
    chapter: 1,
    title: 'Cinder Cells',
    blurb: 'Cross the cell blocks, where the jailers keep their casters.',
    intro: [
      { who: 'guide', text: 'The cell blocks. Keep low. The casters burn anything that runs.' },
      { who: 'hero', text: 'There are others in these cells.' },
      { who: 'guide', text: 'Some of them were heroes once. Free yourself first; you cannot carry anyone yet.' },
    ],
    outro: [
      { who: 'hero', text: 'One of them called my name. I didn’t know it until I heard it.' },
      { who: 'guide', text: 'Then hold on to it. Names are the first thing the Deep takes.' },
    ],
    rooms: [
      {
        kind: 'combat',
        seed: 1301,
        shape: 'cross',
        goal: 'clear',
        waves: [[['caster', 2], ['grunt', 2]], [['caster', 2], ['hissling', 3]]],
        reward: { kind: 'boon', god: 'athena' },
        line: 'Silence the casters',
      },
      {
        kind: 'combat',
        seed: 1302,
        shape: 'hourglass',
        goal: 'clear',
        waves: [[['grunt', 3], ['caster', 1]], [['hissling', 3], ['caster', 2]], [['brute', 1], ['skitter', 3]]],
        reward: { kind: 'pom' },
        line: 'Cross the narrows',
      },
    ],
    par: 180,
    ash: 60,
    xp: 100,
  },
  {
    id: 'c1m4',
    chapter: 1,
    title: 'The Chain Gang',
    blurb: 'The Warden’s chosen: enchanted jailers bound in her iron.',
    intro: [
      { who: 'warden', text: 'My chain gang will bring you back. They always bring them back.' },
      { who: 'guide', text: 'Enchanted jailers. Each carries a blessing of the Warden. Watch for the glow, and strike the swift ones first.' },
    ],
    outro: [
      { who: 'guide', text: 'Her chosen, broken. She will come herself now. Rest while you can; the stair is next.' },
    ],
    rooms: [
      {
        kind: 'combat',
        seed: 1401,
        shape: 'ell',
        goal: 'clear',
        waves: [[['grunt', 3, 'armored']], [['skitter', 4, 'swift'], ['caster', 1]], [['brute', 1, 'armored'], ['grunt', 2]]],
        reward: { kind: 'heart' },
        line: 'Break the chain gang',
      },
    ],
    par: 150,
    ash: 70,
    xp: 120,
  },
  {
    id: 'c1m5',
    chapter: 1,
    title: 'The Long Stair',
    blurb: 'Climb the prisoners’ stair to the Warden’s hall.',
    intro: [
      { who: 'guide', text: 'The Long Stair. Every step was cut by a prisoner, and every prisoner still remembers the weight of it.' },
      { who: 'hero', text: 'Then let’s give them something better to remember.' },
    ],
    outro: [
      { who: 'guide', text: 'Her hall is beyond that arch. Whatever you were before, be it now.' },
    ],
    rooms: [
      {
        kind: 'combat',
        seed: 1501,
        shape: 'tower',
        goal: 'clear',
        heights: 0.6,
        waves: [[['grunt', 3], ['caster', 1]], [['skitter', 4], ['hissling', 2]]],
        reward: { kind: 'boon', god: 'ares' },
        line: 'Climb the stair',
      },
      {
        kind: 'combat',
        seed: 1502,
        shape: 'gallery',
        goal: 'clear',
        heights: 0.8,
        waves: [[['brute', 1], ['grunt', 2]], [['caster', 2], ['skitter', 3, 'swift']], [['grunt', 3, 'regenerating']]],
        reward: { kind: 'pom' },
        line: 'The landing',
      },
      {
        kind: 'combat',
        seed: 1503,
        shape: 'nook',
        goal: 'survive',
        survive: 35,
        heights: 1,
        waves: [[['skitter', 5]], [['grunt', 3]], [['hissling', 3], ['caster', 1]], [['skitter', 5]], [['brute', 1], ['skitter', 3]], [['grunt', 4]], [['skitter', 6]]],
        line: 'Hold the arch until it opens',
      },
    ],
    par: 260,
    ash: 90,
    xp: 160,
  },
  {
    id: 'c1m6',
    chapter: 1,
    title: 'Vexa, Warden of Chains',
    blurb: 'Face the Warden in her hall and break the chains of the Deep.',
    intro: [
      { who: 'warden', text: 'So. The empty cell walks into my hall on its own feet. How considerate.' },
      { who: 'hero', text: 'I’m not going back.' },
      { who: 'warden', text: 'Everyone goes back. I have never once had to ask twice.' },
    ],
    outro: [
      { who: 'narrator', text: 'The chains of the Deep go slack, all at once, a thousand links ringing on stone.' },
      { who: 'guide', text: 'Listen. Every cell in the Deep just opened. You did that.' },
      { who: 'guide', text: 'Above us lie the Ember Fields, and things far older than Vexa. Rest. We climb again soon.' },
    ],
    rooms: [
      {
        kind: 'boss',
        seed: 1601,
        goal: 'boss',
        line: 'Defeat the Warden',
      },
    ],
    par: 240,
    ash: 150,
    xp: 260,
  },
];

export const MISSION_BY_ID: Record<string, Mission> = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

export function chapterMissions(n: number): Mission[] {
  return MISSIONS.filter((m) => m.chapter === n);
}

/** Campaign progress kept in the save. */
export interface CampaignProgress {
  /** Best result per mission: stars (1–3) and fastest time in seconds. */
  missions: Record<string, { stars: number; best: number }>;
}

export function defaultCampaign(): CampaignProgress {
  return { missions: {} };
}

export function normalizeCampaign(raw: unknown): CampaignProgress {
  const out = defaultCampaign();
  const m = (raw as Partial<CampaignProgress> | null)?.missions;
  if (!m || typeof m !== 'object') return out;
  for (const [id, r] of Object.entries(m)) {
    if (!MISSION_BY_ID[id] || !r || typeof r !== 'object') continue;
    const stars = Math.max(1, Math.min(3, Math.floor(Number((r as { stars: unknown }).stars) || 1)));
    const best = Number((r as { best: unknown }).best);
    out.missions[id] = { stars, best: Number.isFinite(best) && best > 0 ? best : 0 };
  }
  return out;
}

/** A mission is open once the one before it (in the whole campaign) is done. */
export function missionOpen(p: CampaignProgress, id: string): boolean {
  const i = MISSIONS.findIndex((m) => m.id === id);
  if (i < 0) return false;
  const chapter = CHAPTERS.find((c) => c.n === MISSIONS[i].chapter);
  if (!chapter || chapter.soon) return false;
  return i === 0 || !!p.missions[MISSIONS[i - 1].id];
}

/** The next mission to play: the first not yet done (or the last one). */
export function nextMission(p: CampaignProgress): Mission {
  return MISSIONS.find((m) => !p.missions[m.id] && missionOpen(p, m.id)) ?? MISSIONS[MISSIONS.length - 1];
}

export function chapterDone(p: CampaignProgress, n: number): boolean {
  const ms = chapterMissions(n);
  return ms.length > 0 && ms.every((m) => p.missions[m.id]);
}

/** Total stars earned in a chapter, and the most there are. */
export function chapterStars(p: CampaignProgress, n: number): { got: number; max: number } {
  const ms = chapterMissions(n);
  return { got: ms.reduce((s, m) => s + (p.missions[m.id]?.stars ?? 0), 0), max: ms.length * 3 };
}

/** Health lost (as a share of max health) that still earns the third star. */
export const STAR_DAMAGE = 0.5;

/** Stars for a finished mission: one for finishing, one for the par time, one for taking little damage. */
export function missionStars(m: Mission, time: number, damageShare: number): { stars: number; fast: boolean; unhurt: boolean } {
  const fast = time <= m.par;
  const unhurt = damageShare <= STAR_DAMAGE;
  return { stars: 1 + (fast ? 1 : 0) + (unhurt ? 1 : 0), fast, unhurt };
}

/** Ash and experience for finishing a mission: the full amount the first time, a quarter of the Ash after. */
export function missionReward(m: Mission, first: boolean): { ash: number; xp: number } {
  return first ? { ash: m.ash, xp: m.xp } : { ash: Math.round(m.ash / 4), xp: Math.round(m.xp / 3) };
}

/** Records a finished mission (keeps the best stars and time). Returns true if it was the first clear. */
export function recordMission(p: CampaignProgress, id: string, stars: number, time: number): boolean {
  const prev = p.missions[id];
  p.missions[id] = { stars: Math.max(prev?.stars ?? 0, stars), best: prev?.best ? Math.min(prev.best, time) : time };
  return !prev;
}
