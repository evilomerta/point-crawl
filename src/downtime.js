// ===========================================================================
// EXPANDED DOWNTIME — a side game that shares the backend but NOT the screen.
// All content here is static (no Firebase cost) and easy to edit/extend.
// Tuning knobs live in DT. Add activities/events freely.
// ===========================================================================

export const DT = {
  MAX_FREE: 3,          // rolls held at once (a day's allowance)
  REGEN_MS: 8 * 3600e3, // one roll back every 8 hours → a full set across a day
  BAR_MAX: 100,
  MILESTONES: [33, 66, 100],
  AFFINITY_PER_BOON: 25, // agents grant the party a boon each 25 affinity
};

export const COLLECTIVE_FACTIONS = ["Boughs", "Faithful", "Fliers", "Faithless", "Sunken"];

// rolls available right now, computed from stored {rolls, lastRefill}
export function availableRolls(profile) {
  const base = profile?.rolls ?? DT.MAX_FREE;
  const last = profile?.lastRefill ?? Date.now();
  const regen = Math.floor((Date.now() - last) / DT.REGEN_MS);
  const natural = Math.min(DT.MAX_FREE, base + Math.max(0, regen));
  return Math.max(base, natural); // DM-granted candles above the cap persist until spent
}
