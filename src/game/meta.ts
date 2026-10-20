import type { ColorMode } from './palette';
import { migrateTalents } from './altar';
import { MATERIAL_IDS, normalizeGear, type GearState, type MaterialId, type Materials } from './gear';
import { CHARACTER_BY_ID, CHARACTERS, isCharacterId, type CharacterId, type Palette } from './characters';
import { HERO_MAX_LEVEL, heroXpForLevel } from './herotree';
import { levelFromXp, MAX_LEVEL, xpForLevel } from './progression';
import type { RunSnapshot } from './run';
import { partsFromHistory } from './smith';
import type { RoomKind, WeaponId } from './types';
import { defaultCampaign, normalizeCampaign, type CampaignProgress } from './campaign';

export const WEAPON_IDS: WeaponId[] = ['sword', 'spear', 'bow', 'fists', 'nunchaku', 'scythe', 'blunderbuss', 'katana'];

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
  /** Outline where the next attack will land. */
  attackPreview: boolean;
  /** Touch button scale (0.8..1.3). */
  touchSize: number;
  touchOpacity: number;
  leftHanded: boolean;
  /** 3D voxel view; off draws the classic 2D view. */
  /** HUD, menu and label size multiplier (0.75..1.5). */
  uiSize: number;
  /** Colour-blind friendly rarity colours. */
  colorMode: ColorMode;
  /** A bright ring around every foe. */
  foeOutline: boolean;
  /** Guard: tap to raise, tap again to lower (instead of holding). */
  toggleGuard: boolean;
  /** Game speed for more reaction time: 1, 0.85 or 0.7 (below 1 turns achievements off). */
  speed: number;
  /** Rebound keys: action → key codes (unset actions use the defaults). */
  keys: Record<string, string[]>;
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
    attackPreview: true,
    touchSize: 1,
    touchOpacity: 0.9,
    leftHanded: false,
    uiSize: 1,
    colorMode: 'normal',
    foeOutline: false,
    toggleGuard: false,
    speed: 1,
    keys: {},
  };
}

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
    shopBuys: number;
  };
  settings: Settings;
  seenIntro: boolean;
  /** Total experience; sets your level. */
  xp: number;
  /** Highest level whose unlocks were announced. */
  seenLevel: number;
  /** Talents from before v0.9 (moved onto the Altar; kept empty). */
  talents: Record<string, number>;
  /** Experience earned with each hero (their own level and skill points). */
  heroXp: Partial<Record<CharacterId, number>>;
  /** Each hero's skill tree ranks, by node id. */
  skills: Partial<Record<CharacterId, Record<string, number>>>;
  /** The Blacksmith's forge parts brought back. */
  smith: { parts: string[] };
  /** Save layout version: 2 once talents moved to the Altar and heroes got their own trees (v0.9). */
  progress: number;
  character: CharacterId;
  /** Forge tier per weapon (1..5). */
  forge: Partial<Record<WeaponId, number>>;
  /** Foes slain, by name (the bestiary). */
  bestiary: Record<string, number>;
  /** Achievement ids earned. */
  achievements: string[];
  /** Kinds of Charon's wares bought at least once (their descriptions are revealed). */
  shopSeen: string[];
  /** Each hero's chosen colours and headwear. */
  looks: Partial<Record<CharacterId, HeroLook>>;
  /** When this save was last written (ms since 1970), for the slot picker. */
  lastPlayed: number;
  /** Crafting materials from loot. */
  materials: Materials;
  /** Set once the save has moved to classes (v0.7), when weapons began to come with heroes. */
  classes: number;
  /** A one-time message for the next start (e.g. Ash refunded); cleared once shown. */
  notice: string;
  /** Gear owned and equipped. */
  gear: GearState;
  /** Campaign missions finished (stars and best times). */
  campaign: CampaignProgress;
}

/** A hero's customised appearance; anything unset uses the hero's default. */
export interface HeroLook {
  cloak?: string;
  trim?: string;
  hair?: string;
  crown?: Palette['crown'];
}

const BASE_KEY = 'unbound-underworld-save-v1';
const BASE_RUN_KEY = 'unbound-underworld-run-v1';
const SLOT_KEY = 'unbound-underworld-slot';

/** Four save slots. Slot 1 keeps the original storage keys, so older saves land there. */
export const SLOTS = 4;

export function currentSlot(): number {
  try {
    const n = Number(localStorage.getItem(SLOT_KEY));
    return n >= 1 && n <= SLOTS ? n : 1;
  } catch {
    return 1;
  }
}

/** Picks the slot used from the next load (the game reloads to switch). */
export function setSlot(n: number): void {
  try {
    localStorage.setItem(SLOT_KEY, String(Math.max(1, Math.min(SLOTS, n))));
  } catch {
    /* storage unavailable */
  }
}

const saveKey = (slot = currentSlot()) => (slot === 1 ? BASE_KEY : `${BASE_KEY}-slot${slot}`);
const runKey = (slot = currentSlot()) => (slot === 1 ? BASE_RUN_KEY : `${BASE_RUN_KEY}-slot${slot}`);

/** What a slot holds, for the slot picker (null when empty). */
export function peekSlot(slot: number): SaveData | null {
  try {
    const raw = localStorage.getItem(saveKey(slot));
    return raw ? normalizeSave(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Empties a slot (its progress and any escape in progress). */
export function eraseSlot(slot: number): void {
  try {
    localStorage.removeItem(saveKey(slot));
    localStorage.removeItem(runKey(slot));
  } catch {
    /* nothing stored */
  }
}

/** True when the slot has an escape in progress. */
export function slotHasRun(slot: number): boolean {
  try {
    return !!localStorage.getItem(runKey(slot));
  } catch {
    return false;
  }
}

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
    stats: { runs: 0, escapes: 0, deaths: 0, kills: 0, bestDepth: 0, bestTime: 0, totalAsh: 0, bossesSlain: 0, shopBuys: 0 },
    settings: defaultSettings(),
    seenIntro: false,
    xp: 0,
    seenLevel: 1,
    talents: {},
    character: 'kael',
    forge: {},
    bestiary: {},
    achievements: [],
    shopSeen: [],
    looks: {},
    lastPlayed: 0,
    materials: {},
    gear: { items: [], equipped: {} },
    classes: 1,
    notice: '',
    heroXp: {},
    skills: {},
    smith: { parts: [] },
    progress: 2,
    campaign: defaultCampaign(),
  };
}

/** What weapons cost to unlock before v0.7; refunded when they began to come with heroes. */
const OLD_WEAPON_COST: Partial<Record<WeaponId, number>> = { spear: 40, bow: 60, fists: 90, scythe: 140 };

/** Experience for saves made before levels existed, so veterans keep their unlocks. */
function legacyXp(stats: SaveData['stats']): number {
  if (!stats.runs) return 0;
  const xp = stats.kills * 3 + stats.bestDepth * 12 + stats.bossesSlain * 120 + stats.escapes * 250 + stats.runs * 20;
  return Math.min(xp, xpForLevel(MAX_LEVEL));
}

/** Guardians renamed in 0.6: kills recorded under the old names carry over. */
const RENAMED: Record<string, string> = { Campe: 'Vexa', 'The Hydra': 'The Many-Maw', 'Hydra Head': 'Maw Head', Talos: 'Aurex', Cerberus: 'Threefang' };

function migrateBestiary(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || !raw) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'number') continue;
    const name = RENAMED[k] ?? k;
    out[name] = (out[name] ?? 0) + v;
  }
  return out;
}

/** Merges stored data over defaults so older saves keep working. */
export function normalizeSave(raw: unknown): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<SaveData>;
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const stats = { ...d.stats, ...(typeof r.stats === 'object' && r.stats ? r.stats : {}) };
  const xp = typeof r.xp === 'number' ? Math.max(0, num(r.xp, 0)) : legacyXp(stats);
  const character = isCharacterId(r.character) ? r.character : 'kael';
  // v0.7: each hero wields one weapon, so Ash spent unlocking weapons comes back.
  const oldWeapons = Array.isArray(r.weapons) ? r.weapons.filter(isWeaponId) : [];
  const refund = r.classes ? 0 : oldWeapons.reduce((n, w) => n + (OLD_WEAPON_COST[w] ?? 0), 0);
  const bestiary = migrateBestiary(r.bestiary);
  const maxHeat = Math.max(0, num(r.maxHeat, 0));
  // v0.9: talents move onto the Altar, heroes get their own levels, and the Blacksmith counts guardians already slain.
  let upgrades: Record<string, number> = typeof r.upgrades === 'object' && r.upgrades ? { ...r.upgrades } : {};
  let altarRefund = 0;
  let heroXp: SaveData['heroXp'] = typeof r.heroXp === 'object' && r.heroXp ? { ...r.heroXp } : {};
  let parts = Array.isArray(r.smith?.parts) ? r.smith.parts.filter((x) => typeof x === 'string') : [];
  const old = num(r.progress, 0) < 2;
  if (old) {
    const m = migrateTalents(upgrades, typeof r.talents === 'object' && r.talents ? r.talents : {});
    upgrades = m.upgrades;
    altarRefund = m.refund;
    const seed = Math.min(Math.floor(xp * 0.2), heroXpForLevel(HERO_MAX_LEVEL));
    heroXp = Object.fromEntries(CHARACTERS.map((c) => [c.id, Math.max(heroXp[c.id] ?? 0, seed)]));
    parts = [...new Set([...parts, ...partsFromHistory(bestiary, maxHeat)])];
  }
  const notices = [
    refund > 0 ? `Weapons now come with their heroes: ${refund} Ash spent unlocking weapons was refunded.` : '',
    old && (xp > 0 || Object.keys(upgrades).length) ? `The Altar of Ashes now holds your talents, and each hero has a skill tree at Ascension.${altarRefund > 0 ? ` ${altarRefund} Ash was refunded for ranks that no longer fit.` : ''}` : '',
  ].filter(Boolean);
  return {
    version: 1,
    ash: Math.max(0, num(r.ash, 0)) + refund + altarRefund,
    upgrades,
    weapons: oldWeapons.length ? oldWeapons : d.weapons,
    weapon: CHARACTER_BY_ID[character].weapon,
    artifacts: Array.isArray(r.artifacts) ? [...new Set([...d.artifacts, ...r.artifacts.filter((a) => typeof a === 'string')])] : d.artifacts,
    startArtifact: typeof r.startArtifact === 'string' || r.startArtifact === null ? r.startArtifact : d.startArtifact,
    heat: Math.max(0, num(r.heat, 0)),
    maxHeat,
    stats,
    settings: { ...d.settings, ...(typeof r.settings === 'object' && r.settings ? r.settings : {}) },
    seenIntro: !!r.seenIntro,
    xp,
    seenLevel: Math.max(1, num(r.seenLevel, typeof r.xp === 'number' ? 1 : levelFromXp(xp).level)),
    talents: {},
    character,
    forge: typeof r.forge === 'object' && r.forge ? { ...r.forge } : {},
    bestiary,
    achievements: Array.isArray(r.achievements) ? r.achievements.filter((a) => typeof a === 'string') : [],
    shopSeen: Array.isArray(r.shopSeen) ? r.shopSeen.filter((a) => typeof a === 'string') : [],
    looks: typeof r.looks === 'object' && r.looks ? { ...r.looks } : {},
    lastPlayed: num(r.lastPlayed, 0),
    materials: typeof r.materials === 'object' && r.materials ? Object.fromEntries(Object.entries(r.materials).filter(([k, v]) => MATERIAL_IDS.includes(k as MaterialId) && typeof v === 'number' && v > 0)) : {},
    gear: normalizeGear(r.gear),
    classes: 1,
    notice: notices.length ? notices.join(' ') : typeof r.notice === 'string' ? r.notice : '',
    heroXp,
    skills: typeof r.skills === 'object' && r.skills ? Object.fromEntries(Object.entries(r.skills).filter(([k, v]) => isCharacterId(k) && typeof v === 'object' && v)) : {},
    smith: { parts },
    progress: 2,
    campaign: normalizeCampaign(r.campaign),
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(saveKey());
    return normalizeSave(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultSave();
  }
}

export function writeSave(s: SaveData): void {
  // Kept on the save in memory too: syncing compares it to other devices' copies.
  s.lastPlayed = Date.now();
  try {
    localStorage.setItem(saveKey(), JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode) — progress lasts for this session only */
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(saveKey());
    localStorage.removeItem(runKey());
  } catch {
    /* nothing stored */
  }
}

export function rank(s: SaveData, id: string): number {
  return s.upgrades[id] ?? 0;
}




/** Torment level modifiers: tougher foes for more Ash. */
export function heatScale(heat: number): { hp: number; dmg: number; ash: number } {
  return { hp: 1 + heat * 0.15, dmg: 1 + heat * 0.1, ash: 1 + heat * 0.25 };
}

// ---------------------------------------------------------------- saved escape


/** Saves the escape in progress (or clears it with null). */
export function writeRun(snap: RunSnapshot | null): void {
  try {
    if (snap) localStorage.setItem(runKey(), JSON.stringify(snap));
    else localStorage.removeItem(runKey());
  } catch {
    /* storage unavailable */
  }
}

/** The saved escape, if there is a valid one. */
const ROOM_KINDS: RoomKind[] = ['combat', 'boss', 'shop', 'fountain', 'antechamber'];

export function loadRun(): RunSnapshot | null {
  try {
    const raw = localStorage.getItem(runKey());
    if (!raw) return null;
    const snap = JSON.parse(raw) as RunSnapshot;
    if (snap?.v !== 1 || !ROOM_KINDS.includes(snap.current?.kind) || !Array.isArray(snap.boons) || !isWeaponId(snap.weapon)) return null;
    if (![snap.seed, snap.rng, snap.depth, snap.roomsCleared, snap.biomeIndex].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
    return snap;
  } catch {
    return null;
  }
}
