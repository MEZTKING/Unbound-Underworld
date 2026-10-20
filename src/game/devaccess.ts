// Developer access: the hidden Developer Options (test chambers, god mode,
// spawning…) and the debug address parameters (?god, ?seed, ?biome, ?room,
// ?level, ?weapon) only work on a device where the owner's passphrase was
// entered once. The game keeps only a hash of a hash of it, so the passphrase
// can't be read out of the published code. (A determined player could still
// patch their own copy of the game; this keeps everyone else out.)
import { sha256 } from '../engine/sha256';

/** sha256(token), where token = sha256('unbound-dev-token:' + passphrase). */
const DEV_CHECK = 'e99132814aa62e5f0fc2ff413ae78b883b07a4146964ca436e2b579a417ce743';
const KEY = 'unbound-underworld-dev';

/** The device token a passphrase gives. */
export const devToken = (passphrase: string) => sha256(`unbound-dev-token:${passphrase.trim()}`);

/** True when this device holds the owner's token. */
export function devAllowed(): boolean {
  try {
    const t = localStorage.getItem(KEY);
    return !!t && sha256(t) === DEV_CHECK;
  } catch {
    return false;
  }
}

/** Checks a passphrase; when right, remembers this device. */
export function tryDevPassphrase(passphrase: string): boolean {
  const t = devToken(passphrase);
  if (sha256(t) !== DEV_CHECK) return false;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode: unlocked until the game closes */
  }
  return true;
}

/** Forgets developer access on this device. */
export function lockDev(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing kept */
  }
}

/** Address parameters anyone may use: they only change how the game is drawn. */
const PUBLIC_PARAMS = new Set(['view', 'quality']);

/** The page's address parameters, keeping the debug ones only with developer access. */
export function gameParams(search: string, allowed = devAllowed()): URLSearchParams {
  const all = new URLSearchParams(search);
  if (allowed) return all;
  const out = new URLSearchParams();
  for (const [k, v] of all) if (PUBLIC_PARAMS.has(k)) out.append(k, v);
  return out;
}
