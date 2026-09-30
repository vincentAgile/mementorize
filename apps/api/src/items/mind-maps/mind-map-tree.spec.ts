import { describe, expect, it } from 'vitest';
import { validateMindMap } from './mind-map-tree.js';

const node = (id: string, parentId: string | null) => ({ id, parentId });

describe('validateMindMap', () => {
  it('accepts a tree', () => {
    expect(validateMindMap([node('root', null), node('a', 'root'), node('b', 'root'), node('a1', 'a')])).toBeNull();
  });

  it('accepts a lone root', () => {
    expect(validateMindMap([node('root', null)])).toBeNull();
  });

  it('refuses duplicate ids', () => {
    expect(validateMindMap([node('root', null), node('a', 'root'), node('a', 'root')])).toMatch(/Duplicate/);
  });

  it('refuses zero or several roots', () => {
    expect(validateMindMap([node('a', 'b'), node('b', 'a')])).toMatch(/exactly one root \(found 0\)/);
    expect(validateMindMap([node('r1', null), node('r2', null)])).toMatch(/exactly one root \(found 2\)/);
  });

  it('refuses a parent that is not in the map', () => {
    expect(validateMindMap([node('root', null), node('a', 'ghost')])).toMatch(/unknown parent/);
  });

  it('refuses a cycle cut off from the root', () => {
    expect(validateMindMap([node('root', null), node('a', 'b'), node('b', 'a')])).toMatch(/cycle/);
  });

  it('refuses a node that is its own parent', () => {
    expect(validateMindMap([node('root', null), node('a', 'a')])).toMatch(/cycle/);
  });
});
