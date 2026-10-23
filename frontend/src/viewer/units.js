// The domain uses integer millimetres; the scene uses metres (Y up).
export const MM_TO_M = 0.001;
export const toM = (mm) => mm * MM_TO_M;

// ASSUMPTION: visual-only prototype values. They are NOT part of the design model and
// are not manufacturing specifications; they only make the render readable.
export const VISUAL = Object.freeze({
  backThickness: 6,
  doorThickness: 18,
  doorGap: 2,
  drawerGap: 3,
  railRadius: 12,
  slidingTrackGap: 4,
  slidingOverlap: 60,
  slidingRailHeight: 20,
  handleWidth: 14,
  handleDepth: 12,
  handleLength: 400,
  handleHeightFromFloor: 1050,
  handleInset: 40,
});

// ---- Display units -------------------------------------------------------------------------
// The design is always integer millimetres. A display unit changes only how lengths are shown
// and typed: formatting rounds to the unit's decimals, parsing rounds to the nearest millimetre.
// The decimals are chosen so that format -> parse returns the same integer mm (0.01 in = 0.254 mm).
// ASSUMPTION: the default unit is a configurable prototype value, not a business rule.
export const DISPLAY_UNITS = Object.freeze({
  cm: Object.freeze({ id: 'cm', label: 'cm', name: 'cm', mmPerUnit: 10, decimals: 1, example: '64.5' }),
  mm: Object.freeze({ id: 'mm', label: 'mm', name: 'mm', mmPerUnit: 1, decimals: 0, example: '645' }),
  in: Object.freeze({ id: 'in', label: 'in', name: 'inches', mmPerUnit: 25.4, decimals: 2, example: '25.4' }),
});
export const DEFAULT_DISPLAY_UNIT = 'cm';
export const isDisplayUnit = (unit) => Object.prototype.hasOwnProperty.call(DISPLAY_UNITS, unit);

/** Integer millimetres -> number text in the display unit (fixed decimals, no unit suffix). */
export function formatLength(mm, unit = DEFAULT_DISPLAY_UNIT) {
  const { mmPerUnit, decimals } = DISPLAY_UNITS[unit];
  return (mm / mmPerUnit).toFixed(decimals);
}

/** A number in the display unit -> integer millimetres (nearest). */
export function toMm(value, unit = DEFAULT_DISPLAY_UNIT) {
  return Math.round(value * DISPLAY_UNITS[unit].mmPerUnit);
}
