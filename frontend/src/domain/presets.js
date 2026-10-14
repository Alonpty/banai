// Predefined starting designs. Mirrors BASIC_WARDROBE_OPS / basic_wardrobe in
// backend/app/domain/defaults.py (configurable prototype values).

import { applyOps } from './apply.js';
import { deepFreeze } from './util.js';

export const BASIC_WARDROBE_OPS = deepFreeze([
  { op: 'create_wardrobe', width: 2000, height: 2400, depth: 600, compartmentCount: 3,
    compartmentIds: ['cmp_left', 'cmp_middle', 'cmp_right'], partitionIds: ['prt_1', 'prt_2'] },
  { op: 'add_shelf', compartmentId: 'cmp_left', y: 400, id: 'shf_l1' },
  { op: 'add_shelf', compartmentId: 'cmp_left', y: 800, id: 'shf_l2' },
  { op: 'add_shelf', compartmentId: 'cmp_left', y: 1200, id: 'shf_l3' },
  { op: 'add_shelf', compartmentId: 'cmp_left', y: 1600, id: 'shf_l4' },
  { op: 'add_shelf', compartmentId: 'cmp_middle', y: 2000, id: 'shf_m1' },
  { op: 'add_rail', compartmentId: 'cmp_middle', y: 1900, id: 'rail_m1' },
  { op: 'add_shelf', compartmentId: 'cmp_right', y: 800, id: 'shf_r1' },
  { op: 'add_shelf', compartmentId: 'cmp_right', y: 1400, id: 'shf_r2' },
  { op: 'add_drawer', compartmentId: 'cmp_right', y: 0, height: 200, id: 'drw_r1' },
  { op: 'add_drawer', compartmentId: 'cmp_right', y: 200, height: 200, id: 'drw_r2' },
  { op: 'configure_doors', type: 'hinged', ids: ['dr_left', 'dr_middle', 'dr_right'] },
]);

/** The predefined starting wardrobe (entry option 3), built through the op protocol. */
export const basicWardrobe = (catalog) => applyOps(null, BASIC_WARDROBE_OPS, catalog);
