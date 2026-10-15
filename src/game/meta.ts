import type { MetaBonuses } from './boons';
import { isCharacterId, type CharacterId } from './characters';
import { levelFromXp, MAX_LEVEL, xpForLevel } from './progression';
import type { RunSnapshot } from './run';
import type { PlayerStats } from './stats';
import type { WeaponId } from './types';

export const WEAPON_IDS: WeaponId[] = ['sword', 'spear', 'bow', 'fists', 'scythe'];

const isWeaponId = (v: unknown): v is WeaponId => typeof v === 'string' && (WEAPON_IDS as string[]).includes(v);

export interface Settings {
  volume: number;
  music: number;
  muted: boolean;
  shake: number;
  damageNumbers: boolean;
  hitstop: boolean;
  /** 0..1 strength of flashes. */
  flashes: number;
  aimAssist: boolean;
  vibration: boolean;
  showFps: boolean;
  hints: boolean;
  assist: boolean;
  doorInfo: boolean;
  /** Touch button scale (0.8..1.3). */
  touchSize: number;
  touchOpacity: number;
  leftHanded: boolean;
}

export function defaultSettings(): Settings {
  return {
    volume: 0.7,
    music: 0.5,
    muted: false,
    shake: 1,
    damageNumbers: true,
    hitstop: true,
    flashes: 1,
    aimAssist: true,
    vibration: true,
    showFps: false,
    hints: true,
    assist: false,
    doorInfo: true,
    touchSize: 1,
    touchOpacity: 0.9,
    leftHanded: false,
  };
}

/** Permanent upgrades bought with Ash at the Altar in the hub. */
export interface UpgradeDef {
  id: string;
  name: string;
  glyph: string;
  desc: (rank: number) => string;
  costs: number[];
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'vitality', name: 'Vitality', glyph: '♥', desc: (r) => `+${r * 10} max Health`, costs: [10, 20, 35, 55] },
  { id: 'defiance', name: 'Death\'s Reprieve', glyph: '✚', desc: (r) => `Cheat death ${r} time${r === 1 ? '' : 's'} per run`, costs: [30, 70, 140] },
  { id: 'fury', name: 'Fury', glyph: '⚔', desc: (r) => `+${r * 5}% damage`, costs: [15, 30, 50, 80] },
  { id: 'reflex', name: 'Fleet Shadow', glyph: '➶', desc: (r) => `+${r} Dash charge`, costs: [60] },
  { id: 'shards', name: 'Shard Keeper', glyph: '◆', desc: (r) => `+${r} Cast shard${r === 1 ? '' : 's'}`, costs: [25, 75] },
  { id: 'fortune', name: 'Ferryman’s Purse', glyph: '◎', desc: (r) => `Begin each run with ${r * 40} obols`, costs: [10, 25, 45] },
  { id: 'favor', name: 'Favor of the Gods', glyph: '✦', desc: (r) => `Boons are more often Rare or better (+${r})`, costs: [20, 45, 90] },
  { id: 'resilience', name: 'Iron Will', glyph: '⛨', desc: (r) => `Take ${r * 5}% less damage`, costs: [20, 45, 80] },
  { id: 'brewing', name: 'Alchemy', glyph: '⚗', desc: (r) => `Potion recharges ${r * 20}% faster and heals +${r * 10}%`, costs: [25, 60] },
  { id: 'soulcraft', name: 'Soulcraft', glyph: '✧', desc: (r) => `+${r * 25} max souls, +${r * 20}% souls gathered`, costs: [20, 50] },
  { id: 'tinkerer', name: 'Tinkerer', glyph: '⚙', desc: (r) => `Artifacts recharge ${r * 10}% faster`, costs: [20, 45, 80] },
];

export interface SaveData {
  version: 1;
  ash: number;
  upgrades: Record<string, number>;
  weapons: WeaponId[];
  weapon: WeaponId;
  artifacts: string[];
  startArtifact: string | null;
  heat: number;
  maxHeat: number;
  stats: {
    runs: number;
    escapes: number;
    deaths: number;
    kills: number;
    bestDepth: number;
    bestTime: number;
    totalAsh: number;
    bossesSlain: number;
  };
  settings: Settings;
  seenIntro: boolean;
  /** Total experience; sets your level. */
  xp: number;
  /** Highest level whose unlocks were announced. */
  seenLevel: number;
  talents: Record<string, number>;
  character: CharacterId;
  /** Forge tier per weapon (1..5). */
  forge: Partial<Record<WeaponId, number>>;
}

const KEY = 'unbound-underworld-save-v1';

export function defaultSave(): SaveData {
  return {
    version: 1,
    ash: 0,
    upgrades: {},
    weapons: ['sword'],
    weapon: 'sword',
    artifacts: ['mending_totem', 'thunder_rod'],
    startArtifact: 'mending_totem',
    heat: 0,
    maxHeat: 0,
    stats: { runs: 0, escapes: 0, deaths: 0, kills: 0, bestDepth: 0, bestTime: 0, totalAsh: 0, bossesSlain: 0 },
    settings: defaultSettings(),
    seenIntro: false,
    xp: 0,
    seenLevel: 1,
    talents: {},
    character: 'kael',
    forge: {},
  };
}

/** Experience for saves made before levels existed, so veterans keep their unlocks. */
function legacyXp(stats: SaveData['stats']): number {
  if (!stats.runs) return 0;
  const xp = stats.kills * 3 + stats.bestDepth * 12 + stats.bossesSlain * 120 + stats.escapes * 250 + stats.runs * 20;
  return Math.min(xp, xpForLevel(MAX_LEVEL));
}

/** Merges stored data over defaults so older saves keep working. */
export function normalizeSave(raw: unknown): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<SaveData>;
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const stats = { ...d.stats, ...(typeof r.stats === 'object' && r.stats ? r.stats : {}) };
  const xp = typeof r.xp === 'number' ? Math.max(0, num(r.xp, 0)) : legacyXp(stats);
  return {
    version: 1,
    ash: Math.max(0, num(r.ash, 0)),
    upgrades: typeof r.upgrades === 'object' && r.upgrades ? { ...r.upgrades } : {},
    weapons: Array.isArray(r.weapons) && r.weapons.filter(isWeaponId).length ? r.weapons.filter(isWeaponId) : d.weapons,
    weapon: isWeaponId(r.weapon) ? r.weapon : 'sword',
    artifacts: Array.isArray(r.artifacts) ? [...new Set([...d.artifacts, ...r.artifacts.filter((a) => typeof a === 'string')])] : d.artifacts,
    startArtifact: typeof r.startArtifact === 'string' || r.startArtifact === null ? r.startArtifact : d.startArtifact,
    heat: Math.max(0, num(r.heat, 0)),
    maxHeat: Math.max(0, num(r.maxHeat, 0)),
    stats,
    settings: { ...d.settings, ...(typeof r.settings === 'object' && r.settings ? r.settings : {}) },
    seenIntro: !!r.seenIntro,
    xp,
    seenLevel: Math.max(1, num(r.seenLevel, typeof r.xp === 'number' ? 1 : levelFromXp(xp).level)),
    talents: typeof r.talents === 'object' && r.talents ? { ...r.talents } : {},
    character: isCharacterId(r.character) ? r.character : 'kael',
    forge: typeof r.forge === 'object' && r.forge ? { ...r.forge } : {},
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    return normalizeSave(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultSave();
  }
}

export function writeSave(s: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode) — progress lasts for this session only */
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* nothing stored */
  }
}

export function rank(s: SaveData, id: string): number {
  return s.upgrades[id] ?? 0;
}

export function nextCost(s: SaveData, def: UpgradeDef): number | null {
  const r = rank(s, def.id);
  return r < def.costs.length ? def.costs[r] : null;
}

export function metaBonuses(s: SaveData): MetaBonuses {
  return {
    maxHp: rank(s, 'vitality') * 10,
    deathDefiance: rank(s, 'defiance'),
    dmg: rank(s, 'fury') * 0.05,
    dashCharges: rank(s, 'reflex'),
    castAmmo: rank(s, 'shards'),
    damageTaken: 1 - rank(s, 'resilience') * 0.05,
  };
}

/** Meta upgrades that touch the dungeon-crawler systems. */
export function applyMetaExtras(s: SaveData, st: PlayerStats): void {
  const brew = rank(s, 'brewing');
  st.potionCooldown *= 1 - brew * 0.2;
  st.potionHeal += brew * 0.1;
  const soul = rank(s, 'soulcraft');
  st.soulMax += soul * 25;
  st.soulGain += soul * 0.2;
  st.artifactCdMult *= 1 - rank(s, 'tinkerer') * 0.1;
}

/** Torment level modifiers: tougher foes for more Ash. */
export function heatScale(heat: number): { hp: number; dmg: number; ash: number } {
  return { hp: 1 + heat * 0.15, dmg: 1 + heat * 0.1, ash: 1 + heat * 0.25 };
}

// ---------------------------------------------------------------- saved escape

const RUN_KEY = 'unbound-underworld-run-v1';

/** Saves the escape in progress (or clears it with null). */
export function writeRun(snap: RunSnapshot | null): void {
  try {
    if (snap) localStorage.setItem(RUN_KEY, JSON.stringify(snap));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** The saved escape, if there is a valid one. */
export function loadRun(): RunSnapshot | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as RunSnapshot;
    if (snap?.v !== 1 || !snap.current || !Array.isArray(snap.boons) || !isWeaponId(snap.weapon)) return null;
    return snap;
  } catch {
    return null;
  }
}
