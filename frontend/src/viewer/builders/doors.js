// Door panels in front of the carcass (z > 0). Hinged doors span the x-range of the
// compartments they cover; sliding panels split the interior width on two tracks.
import { VISUAL } from '../units.js';
import { box } from './frame.js';

export function buildDoors(design, frame, materials) {
  const { doors } = design;
  const t = VISUAL.doorThickness;
  const gap = VISUAL.doorGap;
  const y = frame.panel + frame.innerHeight / 2;
  const height = frame.innerHeight - 2 * gap;
  const materialOf = (door) => materials.forAppearance(door.appearance ?? doors.appearance);

  if (doors.type === 'hinged') {
    const rangeOf = new Map(design.compartments.map((c, i) => [c.id, frame.ranges[i]]));
    return doors.items.map((door) => {
      const x0 = rangeOf.get(door.compartmentIds[0])[0];
      const x1 = rangeOf.get(door.compartmentIds.at(-1))[1];
      return box({
        size: [x1 - x0 - 2 * gap, height, t],
        center: [(x0 + x1) / 2, y, t / 2],
        material: materialOf(door),
        userData: { componentId: door.id, kind: 'door', doorType: 'hinged', hingeSide: door.hingeSide },
      });
    });
  }

  if (doors.type === 'sliding') {
    const panelWidth = frame.innerWidth / doors.items.length;
    return doors.items.map((door, i) => box({
      size: [panelWidth, height, t],
      center: [frame.panel + panelWidth * (i + 0.5), y, i % 2 === 0 ? t / 2 : t * 1.5 + VISUAL.slidingTrackGap],
      material: materialOf(door),
      // Visual only: which way the panel glides when opened (over its neighbour).
      userData: { componentId: door.id, kind: 'door', doorType: 'sliding', slideDir: i < doors.items.length - 1 ? 1 : -1 },
    }));
  }

  return [];
}
