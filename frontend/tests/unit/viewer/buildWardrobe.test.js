import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const build = (design, options = { doorsVisible: true }) => buildWardrobe(design, createMaterials(catalog), options);
const meshes = (group) => group.children.filter((child) => child.isMesh);
const byId = (group, id) => meshes(group).filter((mesh) => mesh.userData.componentId === id);
const size = (mesh) => {
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox.getSize(new THREE.Vector3());
};
const close = (actual, expected) => expect(actual).toBeCloseTo(expected, 6);

describe('buildWardrobe', () => {
  it('creates one mesh per component, tagged with id and kind', () => {
    const group = build(basic);
    const kinds = meshes(group).reduce((counts, m) => ({ ...counts, [m.userData.kind]: (counts[m.userData.kind] ?? 0) + 1 }), {});
    expect(kinds).toEqual({ carcass: 5, partition: 2, shelf: 7, drawer: 2, rail: 1, door: 3 });
    expect(byId(group, 'shf_l1')).toHaveLength(1);
    expect(byId(group, 'carcass')).toHaveLength(5);
  });

  it('places carcass panels from the design dimensions (mm -> m)', () => {
    const [left] = meshes(build(basic)).filter((m) => m.userData.part === 'left');
    close(left.position.x, 0.009);
    close(left.position.y, 1.2);
    close(left.position.z, -0.3);
    const dims = size(left);
    close(dims.x, 0.018);
    close(dims.y, 2.4);
    close(dims.z, 0.6);
  });

  it('places a shelf inside its compartment at its height', () => {
    const [shelf] = byId(build(basic), 'shf_l1');
    close(shelf.position.x, (18 + 643 / 2) / 1000);
    close(shelf.position.y, (18 + 400 + 9) / 1000);
    close(size(shelf).x, 0.643);
    close(size(shelf).y, 0.018);
  });

  it('places partitions between compartments', () => {
    const [partition] = byId(build(basic), 'prt_1');
    close(partition.position.x, (18 + 643 + 9) / 1000);
    close(size(partition).y, 2.364);
  });

  it('follows state changes: moving a shelf moves its mesh', () => {
    const moved = applyOps(basic, [{ op: 'modify_shelf', id: 'shf_l1', y: 1000 }], catalog);
    const [shelf] = byId(build(moved), 'shf_l1');
    close(shelf.position.y, (18 + 1000 + 9) / 1000);
  });

  it('hides doors when requested', () => {
    const group = build(basic, { doorsVisible: false });
    expect(meshes(group).some((m) => m.userData.kind === 'door')).toBe(false);
  });

  it('spans hinged doors over their compartments and splits sliding doors evenly', () => {
    const hinged = applyOps(basic, [{ op: 'configure_doors', type: 'hinged',
      doors: [{ id: 'dr_wide', compartmentIds: ['cmp_left', 'cmp_middle'], hingeSide: 'left' }] }], catalog);
    const [wide] = byId(build(hinged), 'dr_wide');
    expect(size(wide).x).toBeGreaterThan(1.29);

    const sliding = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', ids: ['dr_a', 'dr_b'] }], catalog);
    const [a, b] = [...byId(build(sliding), 'dr_a'), ...byId(build(sliding), 'dr_b')];
    close(size(a).x, size(b).x);
    expect(a.position.z).not.toBeCloseTo(b.position.z, 3);
  });

  it('maps appearance to material colour and finish roughness', () => {
    const custom = applyOps(basic, [
      { op: 'set_material', target: 'carcass', color: { custom: true, name: 'Sage', hex: '#9caf88' }, finish: { catalogId: 'gloss' } },
    ], catalog);
    const [left] = meshes(build(custom)).filter((m) => m.userData.part === 'left');
    expect(left.material.color.getHexString()).toBe('9caf88');
    expect(left.material.roughness).toBeCloseTo(0.15);
    const [shelf] = byId(build(basic), 'shf_l1');
    expect(shelf.material.color.getHexString()).toBe('f2f1ed');
  });

  it('reuses one material per distinct appearance', () => {
    const group = build(basic);
    const shelfMaterials = new Set(meshes(group).filter((m) => m.userData.kind === 'shelf').map((m) => m.material));
    expect(shelfMaterials.size).toBe(1);
  });
});

describe('material cache', () => {
  it('disposes materials that are no longer in use', () => {
    const materials = createMaterials(catalog);
    const custom = { material: { catalogId: 'melamine' }, color: { custom: true, name: 'a', hex: '#111111' }, finish: { catalogId: 'matte' } };
    const first = materials.forAppearance(custom);
    const kept = materials.forAppearance(basic.carcass.appearance);
    materials.retainOnly(new Set([kept]));
    expect(materials.forAppearance(custom)).not.toBe(first);
    expect(materials.forAppearance(basic.carcass.appearance)).toBe(kept);
  });
});
