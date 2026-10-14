// Small shared helpers for the domain engine.

export const ITEM_KINDS = Object.freeze(['shelves', 'drawers', 'rails']);

export const sum = (values) => values.reduce((total, v) => total + v, 0);

export const isSet = (value) => value !== undefined && value !== null;

export const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
