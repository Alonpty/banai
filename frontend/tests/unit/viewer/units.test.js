import { describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY_UNIT, DISPLAY_UNITS, formatLength, isDisplayUnit, toMm } from '../../../src/viewer/units.js';
import { describeSelection, lengthText } from '../../../src/viewer/format.js';
import { parseLength } from '../../../src/editor/opsFromForm.js';
import { loadDesign } from '../domain/helpers.js';

const UNITS = Object.keys(DISPLAY_UNITS);

describe('display units', () => {
  it('offers cm, mm and inches, with cm as the (configurable) default', () => {
    expect(UNITS).toEqual(['cm', 'mm', 'in']);
    expect(DEFAULT_DISPLAY_UNIT).toBe('cm');
    expect(isDisplayUnit('in')).toBe(true);
    expect(isDisplayUnit('ft')).toBe(false);
    expect(isDisplayUnit('toString')).toBe(false);
    expect(isDisplayUnit(null)).toBe(false);
  });

  it('formats integer millimetres in each unit', () => {
    expect(formatLength(643, 'cm')).toBe('64.3');
    expect(formatLength(643, 'mm')).toBe('643');
    expect(formatLength(643, 'in')).toBe('25.31');
    expect(formatLength(2400, 'in')).toBe('94.49');
    expect(formatLength(2000)).toBe('200.0'); // default unit
    expect(lengthText(2000, 'in')).toBe('78.74 in');
    expect(lengthText(2000, 'mm')).toBe('2000 mm');
  });

  it('converts typed values to the nearest integer millimetre', () => {
    expect(toMm(64.3, 'cm')).toBe(643);
    expect(toMm(643.4, 'mm')).toBe(643);
    expect(toMm(1, 'in')).toBe(25);
    expect(toMm(94.49, 'in')).toBe(2400);
    expect(Number.isInteger(toMm(12.3456, 'in'))).toBe(true);
  });

  it('round-trips every integer millimetre through format -> parse in every unit', () => {
    // 0.01 in = 0.254 mm and 0.1 cm = 1 mm, so the shown text always maps back to the same mm.
    for (const unit of UNITS) {
      for (let mm = 0; mm <= 6000; mm += 1) {
        const parsed = parseLength(formatLength(mm, unit), unit);
        expect(parsed, `${mm} mm via ${unit}`).toEqual({ ok: true, mm });
      }
      for (const mm of [18, 6000, 12_345, 99_999, 250_000]) {
        expect(parseLength(formatLength(mm, unit), unit)).toEqual({ ok: true, mm });
      }
    }
  });
});

describe('parseLength', () => {
  it('accepts . or , decimals and stores integer millimetres', () => {
    expect(parseLength('94.49', 'in')).toEqual({ ok: true, mm: 2400 });
    expect(parseLength('94,49', 'in')).toEqual({ ok: true, mm: 2400 });
    expect(parseLength(' 2400 ', 'mm')).toEqual({ ok: true, mm: 2400 });
    expect(parseLength('240', 'cm')).toEqual({ ok: true, mm: 2400 });
    expect(parseLength('25.5', 'mm')).toEqual({ ok: true, mm: 26 }); // typed finer than mm: rounded
  });

  it('rejects empty, non-numeric and absurd input with fixed messages per unit', () => {
    expect(parseLength('', 'in')).toEqual({ ok: false, message: 'Enter a number in inches, e.g. 25.4' });
    expect(parseLength('abc', 'mm')).toEqual({ ok: false, message: 'Enter a number in mm, e.g. 645' });
    expect(parseLength('1e3', 'cm')).toEqual({ ok: false, message: 'Enter a number in cm, e.g. 64.5' });
    expect(parseLength('99999999', 'in').ok).toBe(false);
    expect(parseLength('<b>1</b>', 'cm').message).not.toContain('<b>'); // never echoes input
  });
});

describe('describeSelection with a unit', () => {
  const basic = loadDesign('basic');
  it('describes the same component in each unit', () => {
    const shelf = { id: 'shf_l2', kind: 'shelf' };
    expect(describeSelection(basic, shelf)).toBe('Shelf · 80.0 cm from base · 1.8 cm thick');
    expect(describeSelection(basic, shelf, 'mm')).toBe('Shelf · 800 mm from base · 18 mm thick');
    expect(describeSelection(basic, shelf, 'in')).toBe('Shelf · 31.50 in from base · 0.71 in thick');
    expect(describeSelection(basic, { id: 'carcass', kind: 'carcass' }, 'in')).toBe('Wardrobe · 78.74 × 94.49 × 23.62 in');
  });
});
