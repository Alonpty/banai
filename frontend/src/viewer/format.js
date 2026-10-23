// Display formatting. The domain is integer mm; the UI shows the chosen display unit
// (cm by default, with 1 decimal). See DISPLAY_UNITS in units.js.
import { DEFAULT_DISPLAY_UNIT, DISPLAY_UNITS, formatLength } from './units.js';

/** Centimetre text (1 decimal), kept for callers that always show cm. */
export const cm = (mm) => formatLength(mm, 'cm');

/** A length with its unit suffix, e.g. "64.3 cm", "643 mm", "25.31 in". */
export const lengthText = (mm, unit = DEFAULT_DISPLAY_UNIT) => `${formatLength(mm, unit)} ${DISPLAY_UNITS[unit].label}`;

/** One-line description of a selected component, for labels and readouts. */
export function describeSelection(design, selection, unit = DEFAULT_DISPLAY_UNIT) {
  if (!selection) return '';
  const { id, kind } = selection;
  const { width, height, depth } = design.dimensions;
  const n = (mm) => formatLength(mm, unit);
  const u = DISPLAY_UNITS[unit].label;
  if (kind === 'carcass') return `Wardrobe · ${n(width)} × ${n(height)} × ${n(depth)} ${u}`;
  for (const [ci, compartment] of design.compartments.entries()) {
    if (compartment.id === id) return `Compartment ${ci + 1} · width ${n(compartment.width)} ${u}`;
    const shelf = compartment.shelves.find((s) => s.id === id);
    if (shelf) return `Shelf · ${n(shelf.y)} ${u} from base · ${n(shelf.thickness)} ${u} thick`;
    const drawer = compartment.drawers.find((d) => d.id === id);
    if (drawer) return `Drawer · ${n(drawer.y)} ${u} from base · ${n(drawer.height)} ${u} high`;
    const rail = compartment.rails.find((r) => r.id === id);
    if (rail) return `Hanging rail · ${n(rail.y)} ${u} from base`;
  }
  const pi = design.partitions.findIndex((p) => p.id === id);
  if (pi >= 0) return `Partition ${pi + 1} · ${n(design.partitions[pi].thickness)} ${u} thick`;
  const door = design.doors.items.find((d) => d.id === id);
  if (door) return `${design.doors.type === 'sliding' ? 'Sliding' : 'Hinged'} door${door.hingeSide ? ` · hinge ${door.hingeSide}` : ''}`;
  return kind;
}
