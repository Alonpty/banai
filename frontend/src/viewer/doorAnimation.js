// Door open/close animation. Reads userData.motion from the door parts the builder made and
// poses them from a per-door progress (0 = closed, 1 = open) that eases towards the store's
// ui.openDoors. The scene is still built closed: this only moves existing parts, never state.
// No DOM, no WebGL, so it is unit-tested in Node with a fake clock.
import * as THREE from 'three';
import { VISUAL } from './units.js';

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const CLOSED = 'closedPosition';

/** Place one part for an eased progress, relative to the closed pose the builder gave it. */
export function poseDoorPart(part, eased) {
  const { motion } = part.userData;
  if (!motion) return;
  const closed = part.userData[CLOSED] ??= part.position.clone();
  if (motion.kind === 'slide') {
    part.position.set(closed.x + motion.dx * eased, closed.y, closed.z);
    return;
  }
  const angle = motion.angle * eased;
  const dx = closed.x - motion.axisX;
  const dz = closed.z - motion.axisZ;
  // Rotate the closed centre about the hinge axis (vertical, through axisX/axisZ), then turn the part.
  part.position.set(
    motion.axisX + dx * Math.cos(angle) + dz * Math.sin(angle),
    closed.y,
    motion.axisZ - dx * Math.sin(angle) + dz * Math.cos(angle),
  );
  part.rotation.y = angle || 0; // never -0: a closed door reads as exactly 0
}

/**
 * @param {{ durationMs?: number, reducedMotion?: boolean }} options
 *   reducedMotion jumps straight to the final pose (prefers-reduced-motion).
 */
export function createDoorAnimator({ durationMs = VISUAL.doorAnimationMs, reducedMotion = false } = {}) {
  const progress = new Map(); // doorId -> 0..1 (linear)
  const step = reducedMotion || durationMs <= 0 ? Infinity : 1 / durationMs;

  return {
    /**
     * Advance by dtMs towards `openIds` and pose every door part in `group`.
     * Returns true while something is still moving (callers refresh followers then).
     */
    update(group, openIds, dtMs) {
      const open = new Set(openIds);
      let moving = false;
      if (group) {
        const parts = group.children.filter((part) => part.userData.motion);
        // Advance each door once (a door has several parts), then pose every part.
        for (const doorId of new Set(parts.map((part) => part.userData.motion.doorId))) {
          const target = open.has(doorId) ? 1 : 0;
          const current = progress.get(doorId) ?? 0;
          if (current === target) continue;
          const next = step === Infinity ? target : THREE.MathUtils.clamp(current + Math.sign(target - current) * step * dtMs, 0, 1);
          progress.set(doorId, next);
          if (next !== target) moving = true;
        }
        parts.forEach((part) => poseDoorPart(part, easeInOut(progress.get(part.userData.motion.doorId) ?? 0)));
      }
      // Forget doors that are closed and no longer in the scene, so the map stays bounded.
      for (const [doorId, value] of progress) {
        if (value === 0 && !open.has(doorId)) progress.delete(doorId);
      }
      return moving;
    },
    /** Linear progress of a door, for tests and tooling. */
    progressOf: (doorId) => progress.get(doorId) ?? 0,
  };
}
