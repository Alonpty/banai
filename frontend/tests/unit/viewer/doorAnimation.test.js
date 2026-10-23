import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { createDoorAnimator, poseDoorPart } from '../../../src/viewer/doorAnimation.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { VISUAL } from '../../../src/viewer/units.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const build = (design) => buildWardrobe(design, createMaterials(catalog), { doorsVisible: true });
const panelOf = (group, id) => group.children.find((o) => o.userData.componentId === id);
const partsOf = (group, id) => group.children.filter((o) => o.userData.motion?.doorId === id);
const close = (actual, expected) => expect(actual).toBeCloseTo(expected, 6);
const deg = (rad) => (rad * 180) / Math.PI;

describe('door motion tags (builder)', () => {
  it('tags the panel, outline and handle of each hinged door with a hinge on its hinge edge', () => {
    const group = build(basic);
    const parts = partsOf(group, 'dr_left');
    expect(parts).toHaveLength(3); // panel + edge outline + handle
    const { motion } = panelOf(group, 'dr_left').userData;
    expect(motion.kind).toBe('hinge');
    close(motion.axisX, (18 + VISUAL.doorGap) / 1000); // left hinge: inner left edge of the compartment
    close(motion.axisZ, 0);
    expect(motion.angle).toBeLessThan(0); // swings outwards (+z) around a left hinge
    close(Math.abs(deg(motion.angle)), VISUAL.doorOpenAngleDeg);
    // The middle door is hinged on the right: positive angle, axis on its right edge.
    const middle = panelOf(group, 'dr_middle').userData.motion;
    expect(middle.angle).toBeGreaterThan(0);
    close(middle.axisX, (18 + 643 + 18 + 643 - VISUAL.doorGap) / 1000);
  });

  it('tags sliding panels with a slide of one slot (right, the last one left), none for a single panel', () => {
    const two = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', count: 2 }], catalog);
    const group = build(two);
    const [a, b] = two.doors.items.map((d) => panelOf(group, d.id).userData.motion);
    expect(a.kind).toBe('slide');
    expect(a.dx).toBeGreaterThan(0);
    close(b.dx, -a.dx);
    const innerWidth = 2000 - 2 * 18;
    const panelWidth = (innerWidth + VISUAL.slidingOverlap) / 2;
    close(a.dx, (panelWidth - VISUAL.slidingOverlap) / 1000);

    const one = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', count: 1 }], catalog);
    expect(panelOf(build(one), one.doors.items[0].id).userData.motion).toBeNull();
  });

  it('builds doors closed: carcass and interior parts carry no motion', () => {
    const group = build(basic);
    expect(group.children.filter((o) => o.userData.motion && o.userData.kind !== 'door' && o.userData.kind !== 'hardware')).toEqual([]);
  });
});

describe('poseDoorPart', () => {
  it('keeps a hinge edge in place and swings the free edge forwards', () => {
    const group = build(basic);
    const panel = panelOf(group, 'dr_left');
    const closed = panel.position.clone();
    poseDoorPart(panel, 1);
    const { motion } = panel.userData;
    // The centre stays at the same distance from the hinge axis.
    const before = Math.hypot(closed.x - motion.axisX, closed.z - motion.axisZ);
    const after = Math.hypot(panel.position.x - motion.axisX, panel.position.z - motion.axisZ);
    close(after, before);
    expect(panel.position.z).toBeGreaterThan(closed.z + 0.2); // moved out of the wardrobe
    expect(panel.position.y).toBe(closed.y);
    close(panel.rotation.y, motion.angle);
    poseDoorPart(panel, 0);
    close(panel.position.x, closed.x);
    close(panel.position.z, closed.z);
    close(panel.rotation.y, 0);
  });
});

describe('createDoorAnimator', () => {
  it('eases a door open over the duration and reports when it stops moving', () => {
    const group = build(basic);
    const animator = createDoorAnimator({ durationMs: 500 });
    const panel = panelOf(group, 'dr_right');
    expect(animator.update(group, [], 16)).toBe(false);
    expect(animator.update(group, ['dr_right'], 100)).toBe(true);
    close(animator.progressOf('dr_right'), 0.2);
    expect(panel.rotation.y).not.toBe(0);
    const partial = panel.rotation.y;
    expect(animator.update(group, ['dr_right'], 400)).toBe(false); // reached the target this frame
    expect(animator.progressOf('dr_right')).toBe(1);
    expect(Math.abs(panel.rotation.y)).toBeGreaterThan(Math.abs(partial));
    // All three parts of the door moved together.
    partsOf(group, 'dr_right').forEach((part) => close(part.rotation.y, panel.rotation.y));
    // Other doors stayed closed.
    expect(panelOf(group, 'dr_left').rotation.y).toBe(0);
  });

  it('closes again, never overshoots and forgets closed doors', () => {
    const group = build(basic);
    const animator = createDoorAnimator({ durationMs: 100 });
    animator.update(group, ['dr_left'], 1000);
    expect(animator.progressOf('dr_left')).toBe(1);
    animator.update(group, [], 60);
    close(animator.progressOf('dr_left'), 0.4);
    animator.update(group, [], 1000);
    expect(animator.progressOf('dr_left')).toBe(0);
    close(panelOf(group, 'dr_left').rotation.y, 0);
  });

  it('jumps straight to the final pose with reduced motion', () => {
    const group = build(basic);
    const animator = createDoorAnimator({ reducedMotion: true });
    expect(animator.update(group, ['dr_left'], 0)).toBe(false);
    expect(animator.progressOf('dr_left')).toBe(1);
  });

  it('slides a sliding panel along x only', () => {
    const two = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', count: 2 }], catalog);
    const group = build(two);
    const id = two.doors.items[0].id;
    const panel = panelOf(group, id);
    const closed = panel.position.clone();
    createDoorAnimator({ durationMs: 10 }).update(group, [id], 100);
    close(panel.position.x, closed.x + panel.userData.motion.dx);
    close(panel.position.z, closed.z);
    close(panel.rotation.y, 0);
  });

  it('poses a freshly rebuilt scene from the remembered progress (no snap on rebuild)', () => {
    const animator = createDoorAnimator({ durationMs: 10 });
    animator.update(build(basic), ['dr_left'], 100);
    const rebuilt = build(basic);
    expect(animator.update(rebuilt, ['dr_left'], 16)).toBe(false);
    expect(panelOf(rebuilt, 'dr_left').rotation.y).not.toBe(0);
  });
});
