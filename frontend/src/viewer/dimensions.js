// Dimension indicators: overall W/H/D lines with labels, plus a label for the selected
// component and the measuring tool's line between two picked components. Everything is
// placed from the design (state), never from mesh positions; meshes are only outlined.
// Labels are CSS2D DOM nodes written with textContent only (never HTML).
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { horizontalExtent, measureVertical, verticalExtent } from '../state/measure.js';
import { cm, describeSelection, measureLabel } from './format.js';
import { toM } from './units.js';

const OFFSET = 80; // mm, distance of dimension lines from the carcass (visual only)
const MEASURE_Z = 60; // mm in front of the carcass, so the measure line is never inside a panel
const TICK = 50; // mm, half-length of the end ticks of the measure line
export const MEASURE_COLOR = '#6b5e2f';
const NO_MEASURE = Object.freeze({ on: false, ids: [] });

function label(text, className) {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return new CSS2DObject(element);
}

export function createDimensions(scene) {
  const layer = new THREE.Group();
  layer.name = 'dimensions';
  scene.add(layer);
  const lineMaterial = new THREE.LineBasicMaterial({ color: '#5b6470' });
  const measureMaterial = new THREE.LineBasicMaterial({ color: MEASURE_COLOR, depthTest: false, transparent: true });

  const line = (from, to, material = lineMaterial) => {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to].map(([x, y, z]) => new THREE.Vector3(toM(x), toM(y), toM(z))));
    const object = new THREE.Line(geometry, material);
    if (material === measureMaterial) object.renderOrder = 11;
    layer.add(object);
  };

  /** Outline the meshes of a picked component (drawing only; the numbers come from the design). */
  const mark = (group, id) => {
    group?.children.filter((mesh) => mesh.userData.componentId === id).forEach((mesh) => {
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), measureMaterial);
      lines.position.copy(mesh.position);
      lines.rotation.copy(mesh.rotation);
      lines.renderOrder = 11;
      layer.add(lines);
    });
  };

  /** The measuring tool: picks are outlined, and two picks get a vertical line with the gap. */
  const drawMeasure = (group, design, measure) => {
    measure.ids.forEach((id) => mark(group, id));
    const text = measureLabel(design, measure.ids);
    if (measure.ids.length < 2) {
      const { width, height } = design.dimensions;
      const hint = label(text, 'dim-label dim-label--measure');
      hint.position.set(toM(width / 2), toM(height + OFFSET * 2), 0);
      layer.add(hint);
      return;
    }
    const [idA, idB] = measure.ids;
    const result = measureVertical(design, idA, idB);
    if (!result) return;
    // The line stands where the two parts overlap horizontally, else over the first pick.
    const [a0, a1] = horizontalExtent(design, idA);
    const [b0, b1] = horizontalExtent(design, idB);
    const overlapX = [Math.max(a0, b0), Math.min(a1, b1)];
    const x = overlapX[0] < overlapX[1] ? (overlapX[0] + overlapX[1]) / 2 : (a0 + a1) / 2;
    const y0 = result.overlap ? verticalExtent(design, idA).top : result.lower.top;
    const y1 = result.overlap ? verticalExtent(design, idB).top : result.upper.bottom;
    line([x, y0, MEASURE_Z], [x, y1, MEASURE_Z], measureMaterial);
    line([x - TICK, y0, MEASURE_Z], [x + TICK, y0, MEASURE_Z], measureMaterial);
    line([x - TICK, y1, MEASURE_Z], [x + TICK, y1, MEASURE_Z], measureMaterial);
    const readout = label(text, 'dim-label dim-label--measure');
    readout.position.set(toM(x), toM((y0 + y1) / 2), toM(MEASURE_Z));
    readout.center.set(-0.1, 0.5); // beside the line, not over it
    layer.add(readout);
  };

  const place = (object, [x, y, z]) => {
    object.position.set(toM(x), toM(y), toM(z));
    layer.add(object);
  };

  const clear = () => {
    layer.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.element) child.element.remove();
    });
    layer.clear();
  };

  return {
    update(group, design, selection, measure = NO_MEASURE) {
      clear();
      if (measure.on) drawMeasure(group, design, measure);
      const { width: w, height: h, depth: d } = design.dimensions;
      line([0, h + OFFSET, 0], [w, h + OFFSET, 0]);
      place(label(`W ${cm(w)} cm`, 'dim-label'), [w / 2, h + OFFSET, 0]);
      line([-OFFSET, 0, 0], [-OFFSET, h, 0]);
      place(label(`H ${cm(h)} cm`, 'dim-label'), [-OFFSET, h / 2, 0]);
      line([w + OFFSET, 0, 0], [w + OFFSET, 0, -d]);
      place(label(`D ${cm(d)} cm`, 'dim-label'), [w + OFFSET, 0, -d / 2]);

      if (!selection || !group) return;
      const target = group.children.find((mesh) => mesh.userData.componentId === selection.id);
      const anchor = target ? target.position : new THREE.Vector3(toM(w / 2), toM(h / 2), 0);
      const selected = label(describeSelection(design, selection), 'dim-label dim-label--selected');
      selected.position.copy(anchor);
      selected.center.set(0.5, 1.6); // sit above the component instead of covering it
      layer.add(selected);
    },
    dispose() {
      clear();
      lineMaterial.dispose();
      measureMaterial.dispose();
    },
  };
}
