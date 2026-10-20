/**
 * Live copy of the gameplay and display settings, read by systems deep in the
 * simulation (damage numbers, hit-stop, flashes) without threading the save
 * through them. `Game` keeps it in sync with the saved settings.
 */
export const prefs = {
  damageNumbers: true,
  hitstop: true,
  /** 0..1 strength of screen flashes and bright light bursts. */
  flashes: 1,
  aimAssist: true,
  vibration: true,
  showFps: false,
  hints: true,
  /** Assist mode: take half damage. */
  assist: false,
  /** Show what's behind every door, not only the one you walk up to. */
  doorInfo: true,
  /** Outline where the next attack will land, and the charge meter. */
  attackPreview: true,
  /** High-contrast foes: a bright ring around each one. */
  foeOutline: false,
  /** Guard toggles on a tap instead of being held. */
  toggleGuard: false,
};

export type Prefs = typeof prefs;
