// Hosting and finding games on the same Wi-Fi or hotspot. The Windows app
// (electron/main.cjs) and the Android app (LanHostPlugin.java) can run the
// game's relay themselves; a browser can't, but can still join by address.
import { registerPlugin } from '@capacitor/core';
import { IS_NATIVE } from '../platform';

/** A game heard on this network. */
export interface LanGame {
  name: string;
  address: string;
  port: number;
  /** The room code when the host has exactly one game (empty otherwise). */
  code: string;
  players: number;
  version?: string;
  /** A standalone server rather than a player's game. */
  server?: boolean;
}

export interface LanBridge {
  /** Starts this device's relay; returns its port and this device's network addresses. */
  host(name: string): Promise<{ port: number; addresses: string[] }>;
  stopHost(): Promise<void>;
  /** Listens for games announced nearby for `ms` milliseconds. */
  discover(ms: number): Promise<LanGame[]>;
}

interface LanHostPlugin {
  start(o: { name: string }): Promise<{ port: number; addresses: string[] }>;
  stop(): Promise<void>;
  discover(o: { ms: number }): Promise<{ games: LanGame[] }>;
}

let bridge: LanBridge | null | undefined;

/** This device's way to host and find games nearby, or null (the web version). */
export function lanBridge(): LanBridge | null {
  if (bridge !== undefined) return bridge;
  const desktop = (globalThis as unknown as { uuNet?: LanBridge }).uuNet;
  if (desktop) bridge = desktop;
  else if (IS_NATIVE) {
    const p = registerPlugin<LanHostPlugin>('LanHost');
    bridge = {
      host: (name) => p.start({ name }),
      stopHost: () => p.stop(),
      discover: async (ms) => (await p.discover({ ms })).games ?? [],
    };
  } else bridge = null;
  return bridge;
}
