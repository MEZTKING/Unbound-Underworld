// The Blacksmith in the Hall. He can star up and salvage gear from the
// start, but his forge is in pieces: each guardian guards one of its lost
// parts, and every part he gets back lets him do more, up to crafting
// Legendary gear.

export type SmithPartId = 'whetstone' | 'tongs' | 'crucible' | 'bellows' | 'heart';

export interface SmithPart {
  id: SmithPartId;
  name: string;
  glyph: string;
  /** Where it's found. */
  from: string;
  /** What he can do with it. */
  unlocks: string;
}

export const SMITH_PARTS: SmithPart[] = [
  { id: 'whetstone', name: 'Whetstone', glyph: '◇', from: 'Slay Vexa, guardian of the Shackled Deep', unlocks: 'Weapon forging: temper your hero’s weapon with Ash' },
  { id: 'tongs', name: 'Ember Tongs', glyph: '⟟', from: 'Slay the Many-Maw', unlocks: 'Reforging: roll a piece’s bonuses anew' },
  { id: 'crucible', name: 'Crucible', glyph: '◒', from: 'Slay Aurex', unlocks: 'Crafting: plain and Rare gear, of the slot you choose' },
  { id: 'bellows', name: 'Great Bellows', glyph: '♒', from: 'Slay Threefang', unlocks: 'Crafting: Epic gear' },
  { id: 'heart', name: 'Anvil Heart', glyph: '♦', from: 'Slay any guardian under the Oath of Torment', unlocks: 'Crafting: Legendary gear' },
];

export const SMITH_PART_BY_ID = Object.fromEntries(SMITH_PARTS.map((p) => [p.id, p])) as Record<SmithPartId, SmithPart>;

/** Which part each guardian carries. */
export const GUARDIAN_PART: Record<string, SmithPartId> = {
  Vexa: 'whetstone',
  'The Many-Maw': 'tongs',
  Aurex: 'crucible',
  Threefang: 'bellows',
};

/** The part a guardian's fall yields for a save that lacks it (null if none). */
export function partFor(guardian: string, heat: number, owned: readonly string[]): SmithPartId | null {
  const p = GUARDIAN_PART[guardian];
  if (p && !owned.includes(p)) return p;
  if (heat >= 1 && GUARDIAN_PART[guardian] && !owned.includes('heart')) return 'heart';
  return null;
}

export function hasPart(owned: readonly string[], id: SmithPartId): boolean {
  return owned.includes(id);
}

/** Parts for saves from before the Blacksmith: guardians already slain count, and so does an escape under Torment. */
export function partsFromHistory(bestiary: Record<string, number>, maxHeat: number): SmithPartId[] {
  const out: SmithPartId[] = [];
  for (const [name, part] of Object.entries(GUARDIAN_PART)) if ((bestiary[name] ?? 0) > 0) out.push(part);
  if (maxHeat >= 2) out.push('heart');
  return out;
}
