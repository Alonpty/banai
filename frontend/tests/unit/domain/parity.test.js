import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { DomainError } from '../../../src/domain/errors.js';
import { expectSubset, loadCatalog, loadDesign, loadOpCases } from './helpers.js';

const catalog = loadCatalog();

// Test-only: set values at key paths on a copy of a base design.
function withMutations(design, mutations) {
  const result = structuredClone(design);
  for (const { path, value } of mutations) {
    const target = path.slice(0, -1).reduce((node, key) => node[key], result);
    target[path.at(-1)] = value;
  }
  return result;
}
const cases = loadOpCases();

describe('shared golden fixtures (parity with the Python engine)', () => {
  it('loads fixtures', () => {
    expect(cases.length).toBeGreaterThan(40);
  });

  it.each(cases.map((c) => [`${c.file}::${c.name}`, c]))('%s', (_label, testCase) => {
    const loaded = typeof testCase.base === 'string' ? loadDesign(testCase.base) : testCase.base;
    const base = testCase.mutate ? withMutations(loaded, testCase.mutate) : loaded;
    const snapshot = structuredClone(base);
    const { expect: expected } = testCase;

    if (expected.error) {
      let thrown;
      try {
        applyOps(base, testCase.ops, catalog);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, 'expected a DomainError').toBeInstanceOf(DomainError);
      expect(thrown.code).toBe(expected.error.code);
      if (expected.error.path !== undefined) expect(thrown.path).toBe(expected.error.path);
    } else {
      const result = applyOps(base, testCase.ops, catalog);
      if (expected.design) expect(result).toEqual(expected.design);
      if (expected.match) expectSubset(result, expected.match);
    }

    expect(base).toEqual(snapshot);
  });
});
