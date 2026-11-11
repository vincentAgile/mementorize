import { describe, expect, it } from 'vitest';
import { arrayObjectReader } from './json-objects.js';

describe('arrayObjectReader (MEM-139)', () => {
  it('gives each entry as soon as it is complete, whatever the cuts', () => {
    const text =
      '{"entries": [{"english": "a {brace}", "french": "une \\"accolade\\""}, {"english": "b", "french": "c", "x": [1, {"y": 2}]},\n {"english": "d"}]}';
    const reader = arrayObjectReader();
    const got: unknown[] = [];
    const counts: number[] = [];
    for (let i = 0; i < text.length; i += 7) {
      got.push(...reader.push(text.slice(i, i + 7)));
      counts.push(got.length);
    }
    expect(got).toEqual([
      { english: 'a {brace}', french: 'une "accolade"' },
      { english: 'b', french: 'c', x: [1, { y: 2 }] },
      { english: 'd' },
    ]);
    expect(counts.indexOf(1)).toBeLessThan(counts.indexOf(2)); // one by one, not at the end
  });

  it('skips what is not an entry', () => {
    expect(arrayObjectReader().push('{"entries": [], "note": {"a": 1}}')).toEqual([]);
  });
});
