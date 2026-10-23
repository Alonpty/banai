// Door panels in front of the carcass (z > 0).
// - Hinged doors span the x-range of the compartments they cover, with a handle on the
//   side opposite the hinge.
// - Sliding panels overlap their neighbours and alternate between two tracks (back, front),
//   between a top and a bottom rail, each with a vertical pull handle.
// Handles and rails are visual hardware only: they are not selectable, and never part of the design.
// Every door part (panel, outline, handle) carries userData.motion, which tells the viewer how the
// door opens: a hinged door swings about its hinge edge, a sliding panel slides one slot along its
// track. Open/closed is view state (see state/openDoors.js); the builder always builds doors closed.
import * as THREE from 'three';
import { slideTargetOf } from '../../state/openDoors.js';
import { VISUAL, toM } from '../units.js';
import { box } from './frame.js';

const noRaycast = () => {};

function hardware(args, part) {
  const mesh = box({ ...args, userData: { kind: 'hardware', part } });
  mesh.raycast = noRaycast; // clicks pass through to the door behind
  return mesh;
}

/** A thin outline around a door panel. Not selectable; only there to separate panels. */
function outline(panel, materials) {
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(panel.geometry), materials.doorEdge);
  lines.position.copy(panel.position);
  lines.userData = { kind: 'hardware', part: 'edge' };
  lines.raycast = noRaycast;
  return lines;
}

/** Tag the parts of one door with how it opens (scene units: metres and radians). */
function withMotion(parts, motion) {
  parts.forEach((part) => { part.userData.motion = motion; });
  return parts;
}

/** A vertical handle with its centre x, on a panel whose front face is at frontZ. */
function handle(x, frontZ, panelY, panelHeight, materials) {
  const length = Math.min(VISUAL.handleLength, panelHeight * 0.4);
  const halfSpan = panelHeight / 2 - length / 2 - 20;
  // Aim for the usual grip height; stay inside the panel for short wardrobes.
  const y = Math.min(Math.max(VISUAL.handleHeightFromFloor, panelY - halfSpan), panelY + halfSpan);
  return hardware({
    size: [VISUAL.handleWidth, length, VISUAL.handleDepth],
    center: [x, y, frontZ + VISUAL.handleDepth / 2],
    material: materials.hardware,
  }, 'handle');
}

function buildHinged(design, frame, materials, { t, gap, y, height, materialOf }) {
  const rangeOf = new Map(design.compartments.map((c, i) => [c.id, frame.ranges[i]]));
  return design.doors.items.flatMap((door) => {
    const x0 = rangeOf.get(door.compartmentIds[0])[0];
    const x1 = rangeOf.get(door.compartmentIds.at(-1))[1];
    const panel = box({
      size: [x1 - x0 - 2 * gap, height, t],
      center: [(x0 + x1) / 2, y, t / 2],
      material: materialOf(door),
      userData: { componentId: door.id, kind: 'door', hingeSide: door.hingeSide },
    });
    // The handle sits on the free edge, opposite the hinge.
    const hingedRight = door.hingeSide === 'right';
    const freeEdgeX = hingedRight ? x0 + gap + VISUAL.handleInset : x1 - gap - VISUAL.handleInset;
    // The door swings outwards (towards +z) about a vertical axis on its hinge edge, at the carcass front.
    const motion = {
      kind: 'hinge',
      doorId: door.id,
      axisX: toM(hingedRight ? x1 - gap : x0 + gap),
      axisZ: 0,
      angle: THREE.MathUtils.degToRad(VISUAL.doorOpenAngleDeg) * (hingedRight ? 1 : -1),
    };
    return withMotion([panel, outline(panel, materials), handle(freeEdgeX, t, y, height, materials)], motion);
  });
}

function buildSliding(design, frame, materials, { t, gap, y, height, materialOf }) {
  const count = design.doors.items.length;
  const overlap = count > 1 ? VISUAL.slidingOverlap : 0;
  const panelWidth = (frame.innerWidth + (count - 1) * overlap) / count;
  const step = panelWidth - overlap;
  const backZ = t / 2;
  const frontZ = t * 1.5 + VISUAL.slidingTrackGap;
  const inset = VISUAL.handleInset;

  const parts = design.doors.items.flatMap((door, i) => {
    const x0 = frame.panel + i * step;
    const onFront = i % 2 === 1;
    const z = onFront ? frontZ : backZ;
    const panel = box({
      size: [panelWidth, height, t],
      center: [x0 + panelWidth / 2, y, z],
      material: materialOf(door),
      userData: { componentId: door.id, kind: 'door' },
    });
    // The handle sits where it is not hidden by a panel in front. The last panel (and, for a
    // single panel, none) has its handle on the side facing the neighbour it slides over.
    const isLast = i === count - 1;
    let handleX;
    if (count === 1) handleX = x0 + panelWidth - inset;
    else if (isLast) handleX = x0 + (onFront ? 0 : overlap) + inset;
    else handleX = x0 + panelWidth - (onFront ? 0 : overlap) - inset;
    // The panel slides along its track into the neighbouring slot (null: a single panel cannot open).
    const target = slideTargetOf(i, count);
    const motion = target === null ? null : { kind: 'slide', doorId: door.id, dx: toM((target - i) * step) };
    return withMotion([panel, outline(panel, materials), handle(handleX, z + t / 2, y, height, materials)], motion);
  });

  // Top and bottom rails span both tracks, like the aluminium frame of a sliding wardrobe.
  const railDepth = frontZ + t / 2 + 4;
  const railHeight = VISUAL.slidingRailHeight;
  const railBox = (railY, part) => hardware({
    size: [frame.innerWidth, railHeight, railDepth],
    center: [frame.panel + frame.innerWidth / 2, railY, railDepth / 2 - 2],
    material: materials.hardware,
  }, part);
  const top = frame.panel + frame.innerHeight - railHeight / 2;
  const bottom = frame.panel + railHeight / 2;
  return [...parts, railBox(top, 'rail-top'), railBox(bottom, 'rail-bottom')];
}

export function buildDoors(design, frame, materials) {
  const { doors } = design;
  const context = {
    t: VISUAL.doorThickness,
    gap: VISUAL.doorGap,
    y: frame.panel + frame.innerHeight / 2,
    height: frame.innerHeight - 2 * VISUAL.doorGap,
    materialOf: (door) => materials.forAppearance(door.appearance ?? doors.appearance),
  };
  if (doors.type === 'hinged') return buildHinged(design, frame, materials, context);
  if (doors.type === 'sliding') return buildSliding(design, frame, materials, context);
  return [];
}
