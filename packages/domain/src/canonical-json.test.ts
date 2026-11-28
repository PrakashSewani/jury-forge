import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CanonicalJsonError, canonicalJson } from './canonical-json.ts';

describe('canonicalJson', () => {
  it('sorts keys by UTF-16 code units at every depth and drops whitespace', () => {
    expect(canonicalJson({ b: 1, a: [true, null, { d: 'x', c: -0 }], A: 'up' })).toBe(
      '{"A":"up","a":[true,null,{"c":0,"d":"x"}],"b":1}',
    );
    // U+00E9 (é) sorts after "z"; U+1F600 is a surrogate pair and sorts by its first code unit.
    expect(canonicalJson({ é: 1, z: 2, '😀': 3, '\uFB01': 4 })).toBe('{"z":2,"é":1,"😀":3,"ﬁ":4}');
  });

  it('uses ECMAScript number and string serialization', () => {
    expect(canonicalJson([1e21, 1e-7, 0.1 + 0.2, 123456789012345680000])).toBe(
      '[1e+21,1e-7,0.30000000000000004,123456789012345680000]',
    );
    expect(canonicalJson('line\n"quote"\u0001\u2028')).toBe('"line\\n\\"quote\\"\\u0001\u2028"');
    expect(canonicalJson({})).toBe('{}');
    expect(canonicalJson([])).toBe('[]');
    expect(canonicalJson(Object.create(null))).toBe('{}');
  });

  it('refuses values that are not JSON instead of dropping them', () => {
    const notJson: unknown[] = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      undefined,
      () => 1,
      1n,
      Symbol('s'),
      new Date(0),
      new Map(),
      { nested: { value: undefined } },
      ['\uD800'],
      { '\uDC00': 1 },
    ];
    for (const value of notJson) {
      expect(() => canonicalJson(value)).toThrow(CanonicalJsonError);
    }
  });

  it('keeps a valid surrogate pair', () => {
    expect(canonicalJson('😀')).toBe('"😀"');
  });

  it('round-trips through JSON.parse, ignores key order, and is idempotent (property)', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const text = canonicalJson(value);
        const parsed = JSON.parse(text) as unknown;
        expect(parsed).toEqual(JSON.parse(JSON.stringify(value)));
        expect(canonicalJson(parsed)).toBe(text);
      }),
    );
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.integer()), (record) => {
        const reversed = Object.fromEntries(Object.entries(record).reverse());
        expect(canonicalJson(reversed)).toBe(canonicalJson(record));
      }),
    );
  });
});
