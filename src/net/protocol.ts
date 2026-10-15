// What the host's game and the other players' games say to each other
// (carried inside the relay's "to"/"all"/"from" messages).
import type { CharacterId } from '../game/characters';
import type { Grant } from '../game/game';
import type { Card } from '../ui/overlay';
import type { Fields } from './sync';

/** Snapshots per second from the host. */
export const SNAP_RATE = 20;
/** Controls sent per second by a player who joined. */
export const INPUT_RATE = 30;

/** The actions a player's controls send (bit i = INPUT_ACTIONS[i]). */
export const INPUT_ACTIONS = ['attack', 'special', 'cast', 'dash', 'jump', 'interact', 'potion', 'guard', 'wrath', 'artifact1', 'artifact2', 'artifact3'] as const;
export type InputAction = (typeof INPUT_ACTIONS)[number];

export function packActions(has: (a: InputAction) => boolean): number {
  let bits = 0;
  INPUT_ACTIONS.forEach((a, i) => {
    if (has(a)) bits |= 1 << i;
  });
  return bits;
}

export function unpackActions(bits: number): Set<InputAction> {
  const out = new Set<InputAction>();
  INPUT_ACTIONS.forEach((a, i) => {
    if (bits & (1 << i)) out.add(a);
  });
  return out;
}

// ---------------------------------------------------------------- player → host

/** First message after joining: who you are and what powers your hero (your save). */
export interface HelloMsg {
  k: 'hello';
  name: string;
  character: CharacterId;
  /** The player's save (JSON), for their upgrades, talents, gear and looks. */
  profile: string;
}

/** Controls: held buttons, presses since the last message, movement (world space) and aim. */
export interface InputMsg {
  k: 'in';
  s: number;
  h: number;
  p: number;
  mx: number;
  my: number;
  /** Aim angle (when `as` is 'angle'). */
  a: number;
  as: 'angle' | 'move' | 'auto';
  t: 0 | 1;
}

export interface PickMsg {
  k: 'pick';
  id: number;
  /** Card index, or -1 to skip. */
  i: number;
}

/** The player's save changed (an upgrade bought, a hero chosen, gear equipped). */
export interface ProfileMsg {
  k: 'profile';
  character: CharacterId;
  profile: string;
}

export type ToHost = HelloMsg | InputMsg | PickMsg | ProfileMsg | { k: 'bye' };

// ---------------------------------------------------------------- host → players

export interface MemberInfo {
  id: number;
  name: string;
  color: string;
  peer: number;
  /** -1 = the host's own player(s). */
  kind: 'host' | 'pad' | 'remote';
}

/** A new room: everything needed to build it, then snapshots fill it in. */
export interface WorldMsg {
  k: 'world';
  /** Changes with every new room. */
  wid: number;
  mode: 'hub' | 'run' | 'over' | 'title';
  layout: unknown;
  biome: string;
  members: MemberInfo[];
}

export interface WelcomeMsg {
  k: 'welcome';
  /** Your member id. */
  you: number;
  name: string;
}

/** A card choice for one player (boons, hammers…): answered with a PickMsg. */
export interface ChoiceMsg {
  k: 'choice';
  id: number;
  title: string;
  subtitle?: string;
  color: string;
  cards: Card[];
  quote?: string;
  skip?: string;
  who?: { name: string; color: string };
}

export interface GrantMsg {
  k: 'grant';
  g: Grant;
}

export interface SnapMsg {
  k: 's';
  wid: number;
  n: number;
  t: number;
  /** Last input sequence the host used, per peer. */
  ack?: Record<number, number>;
  /** Tracked objects: enemies, heroes, allies, shots, zones, pickups, telegraphs. */
  E?: unknown;
  H?: unknown;
  A?: unknown;
  R?: unknown;
  Z?: unknown;
  K?: unknown;
  T?: unknown;
  /** New swipes, bolts and flashes. */
  N?: { s?: Fields[]; b?: Fields[]; f?: Fields[] };
  /** Room state that changed. */
  W?: Fields;
  /** Effects to play: particles, sounds, shakes. */
  X?: unknown[];
  /** Per member: stats and build that changed (for the HUD and drawing). */
  M?: Record<number, { S?: Fields; B?: Fields }>;
  /** The escape's shared state that changed (gold, depth…). */
  U?: Fields | null;
}

export interface OverMsg {
  k: 'over';
  victory: boolean;
  summary: unknown;
}

export type ToPlayer =
  | WorldMsg
  | WelcomeMsg
  | ChoiceMsg
  | { k: 'choice-end'; id: number }
  | GrantMsg
  | SnapMsg
  | OverMsg
  | { k: 'toast'; text: string; ms?: number }
  | { k: 'fade' };
