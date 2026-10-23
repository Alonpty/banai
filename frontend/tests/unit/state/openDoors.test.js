import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { openableDoorIds, pruneOpenDoors, slideTargetOf, toggleOpenDoor, trackOf } from '../../../src/state/openDoors.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const hinged = loadDesign('basic');
const sliding = (count) => applyOps(hinged, [{ op: 'configure_doors', type: 'sliding', count }], catalog);
const noDoors = applyOps(hinged, [{ op: 'configure_doors', type: 'none' }], catalog);

describe('slideTargetOf / trackOf', () => {
  it('slides one slot to the right, the last panel to the left, a single panel nowhere', () => {
    expect([0, 1, 2].map((i) => slideTargetOf(i, 3))).toEqual([1, 2, 1]);
    expect([0, 1].map((i) => slideTargetOf(i, 2))).toEqual([1, 0]);
    expect(slideTargetOf(0, 1)).toBeNull();
    expect([0, 1, 2, 3].map(trackOf)).toEqual([0, 1, 0, 1]);
  });
});

describe('openableDoorIds', () => {
  it('lists hinged doors, sliding panels that can move, and nothing without doors', () => {
    expect(openableDoorIds(hinged)).toEqual(['dr_left', 'dr_middle', 'dr_right']);
    expect(openableDoorIds(sliding(2))).toHaveLength(2);
    expect(openableDoorIds(sliding(1))).toEqual([]);
    expect(openableDoorIds(noDoors)).toEqual([]);
  });
});

describe('toggleOpenDoor', () => {
  it('opens and closes a hinged door without touching the others', () => {
    const opened = toggleOpenDoor(hinged, [], 'dr_left');
    expect(opened).toEqual(['dr_left']);
    expect(toggleOpenDoor(hinged, opened, 'dr_right')).toEqual(['dr_left', 'dr_right']);
    expect(toggleOpenDoor(hinged, ['dr_left', 'dr_right'], 'dr_left')).toEqual(['dr_right']);
  });

  it('ignores ids that are not openable doors and returns the same array', () => {
    const open = ['dr_left'];
    expect(toggleOpenDoor(hinged, open, 'shf_l1')).toBe(open);
    expect(toggleOpenDoor(hinged, open, 'dr_nope')).toBe(open);
    expect(toggleOpenDoor(sliding(1), [], sliding(1).doors.items[0].id)).toEqual([]);
  });

  it('lets both panels of a two-panel sliding door open (different tracks)', () => {
    const design = sliding(2);
    const [a, b] = design.doors.items.map((d) => d.id);
    expect(toggleOpenDoor(design, [a], b)).toEqual([a, b]);
  });

  it('pushes back a panel that would end up in the same slot of the same track', () => {
    const design = sliding(3);
    const [a, b, c] = design.doors.items.map((d) => d.id);
    // a (back track) slides right into slot 1; c (back track) slides left into slot 1 too.
    expect(toggleOpenDoor(design, [a], c)).toEqual([c]);
    // b is on the front track, so it stays open.
    expect(toggleOpenDoor(design, [a, b], c)).toEqual([b, c]);
  });
});

describe('pruneOpenDoors', () => {
  it('keeps the same array when nothing changed, drops doors that no longer exist', () => {
    const open = ['dr_left'];
    expect(pruneOpenDoors(hinged, open)).toBe(open);
    expect(pruneOpenDoors(noDoors, open)).toEqual([]);
    expect(pruneOpenDoors(sliding(2), open)).toEqual([]);
  });
});
