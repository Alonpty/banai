// Which doors are shown open in the 3D view. This is VIEW state only: it never enters the
// design, a save, or the agent's context. Pure functions, unit-tested in Node.

/** Index of the slot a sliding panel slides into: one step to the right, the last panel to the left. */
export function slideTargetOf(index, count) {
  if (count < 2) return null; // a single panel has nowhere to go
  return index === count - 1 ? index - 1 : index + 1;
}

/** Sliding panels alternate between two tracks (back, front) in builder order. */
export const trackOf = (index) => index % 2;

/** Door ids that exist in this design and can be shown open. */
export function openableDoorIds(design) {
  const { type, items } = design.doors;
  if (type === 'hinged') return items.map((door) => door.id);
  if (type === 'sliding') return items.filter((_, i) => slideTargetOf(i, items.length) !== null).map((door) => door.id);
  return [];
}

/** Drop ids of doors that no longer exist (after a design change). */
export function pruneOpenDoors(design, openIds) {
  const valid = new Set(openableDoorIds(design));
  const kept = openIds.filter((id) => valid.has(id));
  return kept.length === openIds.length ? openIds : kept;
}

/**
 * Toggle one door. Opening a sliding panel pushes back any open panel that would end up in the
 * same slot of the same track, so two panels never occupy one place.
 */
export function toggleOpenDoor(design, openIds, doorId) {
  if (!openableDoorIds(design).includes(doorId)) return openIds;
  if (openIds.includes(doorId)) return openIds.filter((id) => id !== doorId);
  const { type, items } = design.doors;
  if (type !== 'sliding') return [...openIds, doorId];
  const index = items.findIndex((door) => door.id === doorId);
  const slot = slideTargetOf(index, items.length);
  const collides = (id) => {
    const other = items.findIndex((door) => door.id === id);
    return trackOf(other) === trackOf(index) && slideTargetOf(other, items.length) === slot;
  };
  return [...openIds.filter((id) => !collides(id)), doorId];
}
