// What the game needs from an online session, whether it hosts or joined.
import type { RunSummary } from '../game/game';
import type { RelayLink } from './link';

export interface NetSession {
  readonly role: 'host' | 'client';
  readonly link: RelayLink;
  /** The room code others join with. */
  readonly code: string;
  /** Host: around each world update (effects made inside it are sent to the others). */
  beginStep?(): void;
  afterStep?(dt: number): void;
  /** Joined: replaces the world update (the host runs the room). */
  clientStep?(dt: number): void;
  /** Host: the escape ended. */
  over?(victory: boolean, summary: RunSummary): void;
  /** Joined: this device's save changed (sent to the host for the hero's stats). */
  profileChanged?(): void;
  /** One line for menus: who's here, the code, the ping. */
  status(): string;
  leave(): void;
}
