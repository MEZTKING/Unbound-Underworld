// The party: the heroes in one game. Offline it is just you, or you and a
// friend on a second gamepad (local co-op); online, the host's game also
// carries a member for each player who joined over the network.
import type { CharacterId } from './characters';
import type { SaveData } from './meta';
import type { Player } from './player';
import type { PlayerStats } from './stats';

/** 'local' = this device's own controls; 'pad' = a second gamepad on this device; 'remote' = a player over the network. */
export type MemberKind = 'local' | 'pad' | 'remote';

export interface Member {
  /** Stable for the session (0 = this device's first player). */
  id: number;
  kind: MemberKind;
  name: string;
  /** Whose progress powers this hero: this device's save, or the remote player's. */
  profile: SaveData;
  character: CharacterId;
  player: Player;
  stats: PlayerStats;
  /** Local co-op: the gamepad it plays with. */
  pad?: number;
  /** Online: the network peer it plays for. */
  peer?: number;
  /** Artifacts carried in the hub (outside an escape). */
  hubArtifacts: (string | null)[];
}

/** Each party slot's colour: name tags, rings and HUD frames. */
export const MEMBER_COLORS = ['#ffd890', '#7fe8ff', '#9dff9a', '#ff9ad8'];

/** At most this many heroes in one game. */
export const MAX_PARTY = 4;

/** Party play: each extra hero adds this share to a wave's foes, and to foe health. */
export const PARTY_FOES = 0.35;
export const PARTY_HP = 0.4;

/** Foe health multiplier for a party of `n`. */
export function partyHp(n: number): number {
  return 1 + PARTY_HP * Math.max(0, n - 1);
}
