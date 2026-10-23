// Always-visible wardrobe settings: overall dimensions, doors and main materials.
// Inputs report their own errors inline; buttons/selects report under their section.
import { appearanceControls } from './appearanceControls.js';
import { actionResult, countField, el, lengthField, section, segmented } from './fields.js';
import { dimensionOps, doorTypeOps } from './opsFromForm.js';

function dimensionsRow(design, run, unit) {
  const { width, height, depth } = design.dimensions;
  return el('div', { className: 'field-row field-row--3' }, [
    lengthField({ label: 'Width', mm: width, unit, testId: 'dim-width', onCommit: (mm) => run(dimensionOps('width', mm)) }),
    lengthField({ label: 'Height', mm: height, unit, testId: 'dim-height', onCommit: (mm) => run(dimensionOps('height', mm)) }),
    lengthField({ label: 'Depth', mm: depth, unit, testId: 'dim-depth', onCommit: (mm) => run(dimensionOps('depth', mm)) }),
  ]);
}

export function wardrobeSection({ design, catalog, unit, run }) {
  const { doors } = design;
  const wardrobe = section('Wardrobe', [dimensionsRow(design, run, unit)]);
  const runDoors = (ops) => actionResult(wardrobe, run(ops));
  wardrobe.append(segmented({
    label: 'Doors',
    testId: 'door-type',
    value: doors.type,
    options: [{ value: 'hinged', label: 'Hinged' }, { value: 'sliding', label: 'Sliding' }, { value: 'none', label: 'None' }],
    onChange: (type) => runDoors(doorTypeOps(type)),
  }));
  if (doors.type === 'sliding') {
    wardrobe.append(countField({
      label: 'Sliding panels', value: doors.items.length, testId: 'sliding-count',
      onCommit: (count) => run(doorTypeOps('sliding', count)),
    }));
  }

  const materials = section('Materials', []);
  const runMaterials = (ops) => actionResult(materials, run(ops));
  materials.append(appearanceControls({ catalog, appearance: design.carcass.appearance, target: 'carcass', run: runMaterials, label: 'Carcass & interior' }));
  if (doors.type !== 'none') {
    materials.append(appearanceControls({ catalog, appearance: doors.appearance, target: 'doors', run: runMaterials, label: 'Doors' }));
  }
  return [wardrobe, materials];
}
