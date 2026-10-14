import { VISUAL } from '../units.js';
import { box } from './frame.js';

/** Side, top, bottom and back panels. All select as the single `carcass` component. */
export function buildCarcass(frame, material) {
  const { width, height, depth, panel } = frame;
  const userData = (part) => ({ componentId: 'carcass', kind: 'carcass', part });
  const innerW = width - 2 * panel;
  return [
    box({ size: [panel, height, depth], center: [panel / 2, height / 2, -depth / 2], material, userData: userData('left') }),
    box({ size: [panel, height, depth], center: [width - panel / 2, height / 2, -depth / 2], material, userData: userData('right') }),
    box({ size: [innerW, panel, depth], center: [width / 2, panel / 2, -depth / 2], material, userData: userData('bottom') }),
    box({ size: [innerW, panel, depth], center: [width / 2, height - panel / 2, -depth / 2], material, userData: userData('top') }),
    box({
      size: [innerW, height - 2 * panel, VISUAL.backThickness],
      center: [width / 2, height / 2, -depth + VISUAL.backThickness / 2],
      material,
      userData: userData('back'),
    }),
  ];
}
