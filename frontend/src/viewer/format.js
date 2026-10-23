// Display formatting. The domain is integer mm; the UI shows centimetres (1 decimal).
import { measureVertical, partName } from '../state/measure.js';

export const cm = (mm) => (mm / 10).toFixed(1);

/** Short text for the measure label in the 3D view. */
export function measureLabel(design, ids) {
  if (ids.length < 2) return ids.length === 0 ? 'Measure: pick a part' : 'Pick a second part';
  const result = measureVertical(design, ids[0], ids[1]);
  if (!result) return '';
  return result.overlap ? `Overlap · centres ${cm(result.centres)} cm` : `Gap ${cm(result.gap)} cm`;
}

/** Full sentence for the properties panel (screen readers get the same measurement). */
export function describeMeasure(design, ids) {
  if (ids.length === 0) return 'Pick the first part.';
  if (ids.length === 1) return `${partName(design, ids[0])} → pick a second part.`;
  const result = measureVertical(design, ids[0], ids[1]);
  if (!result) return '';
  const lower = partName(design, result.lower.id);
  const upper = partName(design, result.upper.id);
  if (result.overlap) return `${lower} and ${upper} overlap vertically · centres ${cm(result.centres)} cm apart.`;
  return `${lower} → ${upper}: clear gap ${cm(result.gap)} cm · centres ${cm(result.centres)} cm apart.`;
}

/** One-line description of a selected component, for labels and readouts. */
export function describeSelection(design, selection) {
  if (!selection) return '';
  const { id, kind } = selection;
  const { width, height, depth } = design.dimensions;
  if (kind === 'carcass') return `Wardrobe · ${cm(width)} × ${cm(height)} × ${cm(depth)} cm`;
  for (const [ci, compartment] of design.compartments.entries()) {
    if (compartment.id === id) return `Compartment ${ci + 1} · width ${cm(compartment.width)} cm`;
    const shelf = compartment.shelves.find((s) => s.id === id);
    if (shelf) return `Shelf · ${cm(shelf.y)} cm from base · ${cm(shelf.thickness)} cm thick`;
    const drawer = compartment.drawers.find((d) => d.id === id);
    if (drawer) return `Drawer · ${cm(drawer.y)} cm from base · ${cm(drawer.height)} cm high`;
    const rail = compartment.rails.find((r) => r.id === id);
    if (rail) return `Hanging rail · ${cm(rail.y)} cm from base`;
  }
  const pi = design.partitions.findIndex((p) => p.id === id);
  if (pi >= 0) return `Partition ${pi + 1} · ${cm(design.partitions[pi].thickness)} cm thick`;
  const door = design.doors.items.find((d) => d.id === id);
  if (door) return `${design.doors.type === 'sliding' ? 'Sliding' : 'Hinged'} door${door.hingeSide ? ` · hinge ${door.hingeSide}` : ''}`;
  return kind;
}
