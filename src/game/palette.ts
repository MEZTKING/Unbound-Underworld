// Colour-blind friendly colours. Rarity is never shown by colour alone (cards
// and gear always name their tier), but the colours themselves are remapped
// so tiers stay easy to tell apart. Based on the Okabe–Ito palette.
import { RARITY_COLOR } from './boons';
import { GEAR_RARITY, type GearRarity } from './gear';
import type { Rarity } from './types';

export type ColorMode = 'normal' | 'redgreen' | 'blueyellow';

export const COLOR_MODE_NAME: Record<ColorMode, string> = {
  normal: 'Off',
  redgreen: 'Red–green (deuteranopia, protanopia)',
  blueyellow: 'Blue–yellow (tritanopia)',
};

const NORMAL = {
  boon: { ...RARITY_COLOR },
  gear: Object.fromEntries(Object.entries(GEAR_RARITY).map(([k, v]) => [k, v.color])) as Record<GearRarity, string>,
};

const MODES: Record<Exclude<ColorMode, 'normal'>, { boon: Record<Rarity, string>; gear: Record<GearRarity, string> }> = {
  redgreen: {
    boon: { common: '#d8d0c8', rare: '#56b4e9', epic: '#cc79a7', heroic: '#e69f00', duo: '#f0e442' },
    gear: { common: '#cfcac4', uncommon: '#56b4e9', rare: '#f0e442', epic: '#cc79a7', legendary: '#e69f00', unique: '#ff5a1f', ghost: '#eafcff' },
  },
  blueyellow: {
    boon: { common: '#d8d0c8', rare: '#3fd6e8', epic: '#ff6aa8', heroic: '#ff3b30', duo: '#a8ff8a' },
    gear: { common: '#cfcac4', uncommon: '#3fd6e8', rare: '#5ad78a', epic: '#ff6aa8', legendary: '#ff3b30', unique: '#c03cff', ghost: '#eafcff' },
  },
};

/** Recolours rarities everywhere they're drawn (cards, loot, gear frames). */
export function applyColorMode(mode: ColorMode): void {
  const set = mode === 'normal' ? NORMAL : MODES[mode] ?? NORMAL;
  Object.assign(RARITY_COLOR, set.boon);
  for (const k of Object.keys(GEAR_RARITY) as GearRarity[]) GEAR_RARITY[k].color = set.gear[k];
}
