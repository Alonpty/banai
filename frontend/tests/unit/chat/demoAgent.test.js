import { describe, expect, it } from 'vitest';
import { respond } from '../../../src/chat/demoAgent.js';
import { createStore } from '../../../src/state/store.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const design = loadDesign('basic');
const ask = (message, selection = null, mode = 'edit') => respond({ message, design, selection, catalog, mode });

/** Every proposal must be valid for the domain engine (proposeChanges dry-runs it). */
function expectValid(result) {
  expect(result.kind).toBe('proposal');
  const store = createStore({ design, revision: 1, catalog });
  const outcome = store.proposeChanges({ ops: result.ops, summary: result.summary });
  expect(outcome.ok, JSON.stringify(outcome.error)).toBe(true);
  return store.getState().proposal;
}

describe('demo assistant', () => {
  it('turns a free-text brief into a valid new-wardrobe proposal', () => {
    const result = ask('240 cm wide, 260 cm tall white wardrobe, three compartments, four shelves left, hanging middle, three drawers right', null, 'create');
    const proposal = expectValid(result);
    const preview = proposal.previewDesign;
    expect(preview.dimensions).toMatchObject({ width: 2400, height: 2600 });
    expect(preview.compartments.map((c) => [c.shelves.length, c.rails.length, c.drawers.length])).toEqual([[4, 0, 0], [0, 1, 0], [0, 0, 3]]);
    expect(preview.doors.type).toBe('hinged');
    expect(result.summary[0]).toBe('New wardrobe 240 × 260 × 60 cm, 3 sections');
  });

  it('understands the start-screen example phrasing', () => {
    const result = ask('240 cm wide white wardrobe, 3 sections, hanging clothes on the left, drawers in the middle and shelves on the right', null, 'create');
    const { previewDesign } = expectValid(result);
    expect(previewDesign.compartments[0].rails).toHaveLength(1);
    expect(previewDesign.compartments[1].drawers.length).toBeGreaterThan(0);
    expect(previewDesign.compartments[2].shelves.length).toBeGreaterThan(0);
  });

  it('moves the selected item: "this" refers to the selection', () => {
    const result = ask('Move this 15 cm higher', { id: 'shf_l2', kind: 'shelf' });
    expect(result.ops).toEqual([{ op: 'modify_shelf', id: 'shf_l2', y: 950 }]);
    expect(result.text).toContain('Shelf 2 · Left section');
    expectValid(result);
  });

  it('asks which component when nothing is selected', () => {
    expect(ask('Move this 15 cm higher').kind).toBe('clarification');
  });

  it('adds items to a named section', () => {
    const result = ask('Add 2 drawers to the middle section');
    expect(result.summary).toEqual(['Add 2 drawers to Middle section']);
    expect(expectValid(result).diff.added).toHaveLength(2);
  });

  it('adds items to the selected section and asks when no section is known', () => {
    expect(ask('add a shelf', { id: 'cmp_right', kind: 'compartment' }).ops[0].compartmentId).toBe('cmp_right');
    expect(ask('add a shelf').kind).toBe('clarification');
  });

  it('resizes a named section, or the whole wardrobe', () => {
    expect(ask('make the middle section 80 cm wide').ops).toEqual([{ op: 'modify_compartment', compartmentId: 'cmp_middle', width: 800 }]);
    expect(ask('make the wardrobe 240 cm wide').ops).toEqual([{ op: 'update_dimensions', width: 2400 }]);
    expectValid(ask('make the middle section wider by 10 cm'));
  });

  it('changes doors and colours', () => {
    expect(ask('sliding doors please').ops).toEqual([{ op: 'configure_doors', type: 'sliding' }]);
    expect(ask('walnut doors').ops).toEqual([{ op: 'set_material', target: 'doors', color: { catalogId: 'walnut' } }]);
    expectValid(ask('make the body natural oak, satin'));
  });

  it('removes the selected component', () => {
    expect(ask('remove this', { id: 'drw_r1', kind: 'drawer' }).ops).toEqual([{ op: 'remove_component', id: 'drw_r1' }]);
    expect(ask('remove this').kind).toBe('clarification');
    const combined = ask('add 2 drawers and remove the left section', { id: 'cmp_right', kind: 'compartment' });
    expect(combined.ops[0]).toEqual({ op: 'remove_component', id: 'cmp_left' });
    expectValid(combined);
  });

  it('handles every quick-action chip with a valid proposal', () => {
    const cases = [
      ['Add a drawer to the right section', null],
      ['Make the wardrobe 240 cm wide', null],
      ['Sliding doors', null],
      ['Oak finish', null],
      ['Add a drawer', { id: 'cmp_middle', kind: 'compartment' }],
      ['Add 2 shelves', { id: 'cmp_middle', kind: 'compartment' }],
      ['Add a hanging rail', { id: 'cmp_left', kind: 'compartment' }],
      ['Make this section 10 cm wider', { id: 'cmp_middle', kind: 'compartment' }],
      ['Move this 10 cm higher', { id: 'shf_l2', kind: 'shelf' }],
      ['Move this 10 cm lower', { id: 'rail_m1', kind: 'rail' }],
      ['Make this walnut', { id: 'drw_r1', kind: 'drawer' }],
      ['Make this walnut', { id: 'dr_left', kind: 'door' }],
      ['Remove this', { id: 'prt_1', kind: 'partition' }],
    ];
    cases.forEach(([message, selection]) => expectValid(ask(message, selection)));
    expect(ask('Make this section 10 cm wider', { id: 'cmp_middle', kind: 'compartment' }).ops)
      .toEqual([{ op: 'modify_compartment', compartmentId: 'cmp_middle', width: 743 }]);
    expect(ask('Make this walnut', { id: 'drw_r1', kind: 'drawer' }).ops)
      .toEqual([{ op: 'set_material', target: 'drw_r1', color: { catalogId: 'walnut' } }]);
  });

  it('makes the selected door, or all doors, a mirror', () => {
    const one = ask('Make this a mirror door', { id: 'dr_middle', kind: 'door' });
    expect(one.ops).toEqual([{ op: 'set_material', target: 'dr_middle', material: { catalogId: 'mirror' } }]);
    expect(one.summary).toEqual(['Mirror front on Door 2']);
    expect(expectValid(one).previewDesign.doors.items[1].appearance.material).toEqual({ catalogId: 'mirror' });
    const all = ask('Mirror doors');
    expect(all.ops).toEqual([{ op: 'set_material', target: 'doors', material: { catalogId: 'mirror' } }]);
    expect(all.summary).toEqual(['Mirror front on all doors']);
    expectValid(all);
  });

  it('falls back to help for requests it does not understand', () => {
    const result = ask('what do you think about feng shui?');
    expect(result.kind).toBe('clarification');
    expect(result.text).toContain('demo');
  });
});
