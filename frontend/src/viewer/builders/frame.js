// Derived frame measurements (mm) shared by the builders, plus a box-mesh helper.
// Coordinates: x = 0 at the outer left face, y = 0 at the floor, the front face at
// z = 0 and the back at z = -depth.
import * as THREE from 'three';
import { compartmentXRanges, interiorHeight, interiorWidth } from '../../domain/geometry.js';
import { VISUAL, toM } from '../units.js';

export function frameOf(design) {
  const { width, height, depth } = design.dimensions;
  const panel = design.carcass.panelThickness;
  const innerDepth = depth - VISUAL.backThickness;
  return {
    width, height, depth, panel, innerDepth,
    innerWidth: interiorWidth(design),
    innerHeight: interiorHeight(design),
    // Interior x-range of each compartment, shifted to outer coordinates.
    ranges: compartmentXRanges(design).map(([x0, x1]) => [panel + x0, panel + x1]),
    innerCenterZ: -innerDepth / 2,
  };
}

/** A box mesh from a size and centre given in millimetres. */
export function box({ size: [w, h, d], center: [x, y, z], material, userData }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(toM(w), toM(h), toM(d)), material);
  mesh.position.set(toM(x), toM(y), toM(z));
  mesh.userData = { ...userData };
  return mesh;
}
