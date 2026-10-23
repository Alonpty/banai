import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import {
  horizontalExtent, measureVertical, partName, pickMeasure, pruneMeasure, verticalExtent,
} from '../../../src/state/measure.js';
import { describeMeasure, measureLabel } from '../../../src/viewer/format.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const PANEL = basic.carcass.panelThickness; // 18

describe('verticalExtent (from the design, outer mm)', () => {
  it('measures shelves, drawers and rails from the inner floor', () => {
    expect(verticalExtent(basic, 'shf_l1')).toEqual({ bottom: PANEL + 400, top: PANEL + 400 + 18 });
    const drawer = basic.compartments[2].drawers[0];
    expect(verticalExtent(basic, drawer.id)).toEqual({ bottom: PANEL + drawer.y, top: PANEL + drawer.y + drawer.height });
    expect(verticalExtent(basic, 'rail_m1')).toEqual({ bottom: PANEL + 1900, top: PANEL + 1900 });
  });

  it('spans the interior for compartments, partitions and doors, the whole height for the body', () => {
    const interior = { bottom: PANEL, top: 2400 - PANEL };
    expect(verticalExtent(basic, 'cmp_left')).toEqual(interior);
    expect(verticalExtent(basic, 'prt_1')).toEqual(interior);
    expect(verticalExtent(basic, 'dr_left')).toEqual(interior);
    expect(verticalExtent(basic, 'carcass')).toEqual({ bottom: 0, top: 2400 });
  });

  it('returns null for unknown ids and non-strings', () => {
    expect(verticalExtent(basic, 'shf_nope')).toBeNull();
    expect(verticalExtent(basic, 42)).toBeNull();
  });
});

describe('horizontalExtent', () => {
  it('places items in their compartment, partitions between, doors over their compartments', () => {
    expect(horizontalExtent(basic, 'shf_l1')).toEqual([PANEL, PANEL + 643]);
    expect(horizontalExtent(basic, 'prt_1')).toEqual([PANEL + 643, PANEL + 643 + 18]);
    expect(horizontalExtent(basic, 'dr_middle')).toEqual([PANEL + 643 + 18, PANEL + 643 + 18 + 643]);
    expect(horizontalExtent(basic, 'carcass')).toEqual([0, 2000]);
    const sliding = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', count: 2 }], catalog);
    expect(horizontalExtent(sliding, sliding.doors.items[0].id)).toEqual([PANEL, 2000 - PANEL]);
  });
});

describe('measureVertical', () => {
  it('gives the clear gap and centre distance between two shelves, in either order', () => {
    const result = measureVertical(basic, 'shf_l1', 'shf_l2');
    expect(result.gap).toBe(382); // 800 - (400 + 18)
    expect(result.centres).toBe(400);
    expect(result.overlap).toBe(false);
    expect(result.lower.id).toBe('shf_l1');
    expect(result.upper.id).toBe('shf_l2');
    const reversed = measureVertical(basic, 'shf_l2', 'shf_l1');
    expect(reversed).toEqual(result);
  });

  it('reports an overlap with a zero gap', () => {
    const result = measureVertical(basic, 'shf_l1', 'cmp_left');
    expect(result.overlap).toBe(true);
    expect(result.gap).toBe(0);
  });

  it('measures from a rail axis to a shelf', () => {
    const result = measureVertical(basic, 'rail_m1', 'shf_m1');
    expect(result.gap).toBe(100); // shelf bottom at 2000, rail axis at 1900
  });

  it('is null when either id is unknown', () => {
    expect(measureVertical(basic, 'shf_l1', 'nope')).toBeNull();
  });
});

describe('pickMeasure / pruneMeasure', () => {
  it('collects two picks, ignores a repeat, restarts on a third, clears on null', () => {
    expect(pickMeasure([], 'a')).toEqual(['a']);
    expect(pickMeasure(['a'], 'b')).toEqual(['a', 'b']);
    const same = ['a'];
    expect(pickMeasure(same, 'a')).toBe(same);
    expect(pickMeasure(['a', 'b'], 'c')).toEqual(['c']);
    expect(pickMeasure(['a', 'b'], null)).toEqual([]);
  });

  it('drops picks that no longer exist and keeps the same array otherwise', () => {
    const ids = ['shf_l1', 'shf_l2'];
    expect(pruneMeasure(basic, ids)).toBe(ids);
    const removed = applyOps(basic, [{ op: 'remove_component', id: 'shf_l2' }], catalog);
    expect(pruneMeasure(removed, ids)).toEqual(['shf_l1']);
  });
});

describe('texts', () => {
  it('names parts like the All parts list', () => {
    expect(partName(basic, 'shf_l2')).toBe('Compartment 1 · Shelf 2');
    expect(partName(basic, 'prt_1')).toBe('Partition 1');
    expect(partName(basic, 'dr_right')).toBe('Door 3');
    expect(partName(basic, 'carcass')).toBe('Wardrobe body');
  });

  it('formats the label and the readout in cm', () => {
    expect(measureLabel(basic, [])).toBe('Measure: pick a part');
    expect(measureLabel(basic, ['shf_l1'])).toBe('Pick a second part');
    expect(measureLabel(basic, ['shf_l1', 'shf_l2'])).toBe('Gap 38.2 cm');
    expect(measureLabel(basic, ['shf_l1', 'cmp_left'])).toMatch(/^Overlap · centres \d+\.\d cm$/);
    expect(describeMeasure(basic, ['shf_l2', 'shf_l1'])).toBe('Compartment 1 · Shelf 1 → Compartment 1 · Shelf 2: clear gap 38.2 cm · centres 40.0 cm apart.');
    expect(describeMeasure(basic, ['shf_l1'])).toBe('Compartment 1 · Shelf 1 → pick a second part.');
  });
});
