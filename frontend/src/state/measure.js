// Measuring tool: the vertical distance between two components, computed from the canonical
// design only (never from meshes). Pure functions in outer millimetres: y = 0 at the floor,
// x = 0 at the outer left face. The picks are VIEW state (ui.measure) and change nothing.
import { compartmentXRanges } from '../domain/geometry.js';
import { locate } from '../domain/lookup.js';

/** The vertical extent { bottom, top } of a component, or null when the id is unknown. */
export function verticalExtent(design, id) {
  const panel = design.carcass.panelThickness;
  const { height } = design.dimensions;
  if (id === 'carcass') return { bottom: 0, top: height };
  const found = typeof id === 'string' ? locate(design, id) : null;
  if (!found) return null;
  const [kind, ci, ii] = found;
  if (kind === 'compartment' || kind === 'partition' || kind === 'door') return { bottom: panel, top: height - panel };
  const item = design.compartments[ci][kind][ii];
  if (kind === 'shelves') return { bottom: panel + item.y, top: panel + item.y + item.thickness };
  if (kind === 'drawers') return { bottom: panel + item.y, top: panel + item.y + item.height };
  return { bottom: panel + item.y, top: panel + item.y }; // a rail measures from its axis
}

/** The horizontal extent [x0, x1] of a component (used to place the measure line), or null. */
export function horizontalExtent(design, id) {
  const panel = design.carcass.panelThickness;
  const { width } = design.dimensions;
  if (id === 'carcass') return [0, width];
  const found = typeof id === 'string' ? locate(design, id) : null;
  if (!found) return null;
  const [kind, index] = found;
  const ranges = compartmentXRanges(design).map(([x0, x1]) => [panel + x0, panel + x1]);
  if (kind === 'partition') return [ranges[index][1], ranges[index][1] + design.partitions[index].thickness];
  if (kind === 'door') {
    const door = design.doors.items[index];
    if (design.doors.type !== 'hinged' || door.compartmentIds.length === 0) return [panel, width - panel];
    const first = design.compartments.findIndex((c) => c.id === door.compartmentIds[0]);
    const last = design.compartments.findIndex((c) => c.id === door.compartmentIds.at(-1));
    return [ranges[first][0], ranges[last][1]];
  }
  return ranges[index];
}

/** A short name for a part, matching the "All parts" list. */
export function partName(design, id) {
  if (id === 'carcass') return 'Wardrobe body';
  const found = locate(design, id);
  if (!found) return id;
  const [kind, ci, ii] = found;
  if (kind === 'compartment') return `Compartment ${ci + 1}`;
  if (kind === 'partition') return `Partition ${ci + 1}`;
  if (kind === 'door') return `Door ${ci + 1}`;
  const name = { shelves: 'Shelf', drawers: 'Drawer', rails: 'Hanging rail' }[kind];
  return `Compartment ${ci + 1} · ${name} ${ii + 1}`;
}

/**
 * Vertical relation of two components: the clear gap between them (0 when they overlap) and the
 * distance between their centres. `lower` and `upper` are ordered by their bottom edge.
 */
export function measureVertical(design, idA, idB) {
  const a = verticalExtent(design, idA);
  const b = verticalExtent(design, idB);
  if (!a || !b) return null;
  const [lower, upper] = a.bottom <= b.bottom ? [{ id: idA, ...a }, { id: idB, ...b }] : [{ id: idB, ...b }, { id: idA, ...a }];
  const gap = Math.max(upper.bottom - lower.top, 0);
  const overlap = upper.bottom < lower.top;
  const centres = Math.abs((a.bottom + a.top) / 2 - (b.bottom + b.top) / 2);
  return { gap, centres, overlap, lower, upper };
}

/** The next picks after choosing `id`: two picks make a measurement, a third starts a new one. */
export function pickMeasure(ids, id) {
  if (id === null) return [];
  if (ids.length >= 2) return [id];
  if (ids.includes(id)) return ids;
  return [...ids, id];
}

/** Drop picks of components that no longer exist (after a design change). */
export function pruneMeasure(design, ids) {
  const kept = ids.filter((id) => verticalExtent(design, id) !== null);
  return kept.length === ids.length ? ids : kept;
}
