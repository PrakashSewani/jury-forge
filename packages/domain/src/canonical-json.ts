// Canonical JSON in the manner of RFC 8785 (JCS): object keys sorted by UTF-16 code units, no
// whitespace, and ECMAScript number and string serialization (which JCS adopts). Used for the
// `input_hash` of a turn step and, in v1, for signed receipts. Input must be the JSON data model:
// anything else is refused rather than silently dropped, so two values hash alike only when they are
// the same data.

export class CanonicalJsonError extends Error {
  override name = 'CanonicalJsonError';
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function checkString(value: string, where: string): string {
  if (LONE_SURROGATE.test(value)) {
    throw new CanonicalJsonError(`A lone surrogate is not valid JSON text (${where}).`);
  }
  return JSON.stringify(value);
}

function serialize(value: unknown, path: string): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new CanonicalJsonError(`A number must be finite (${path}).`);
      }
      return JSON.stringify(value);
    case 'string':
      return checkString(value, path);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((item, i) => serialize(item, `${path}[${i}]`)).join(',')}]`;
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new CanonicalJsonError(`Only plain objects and arrays are JSON (${path}).`);
      }
      const record = value as Record<string, unknown>;
      const members = Object.keys(record)
        .sort()
        .map(
          (key) => `${checkString(key, `${path} key`)}:${serialize(record[key], `${path}.${key}`)}`,
        );
      return `{${members.join(',')}}`;
    }
    default:
      throw new CanonicalJsonError(`A ${typeof value} is not JSON (${path}).`);
  }
}

/** Serializes a JSON value canonically. Throws CanonicalJsonError for anything that is not JSON. */
export function canonicalJson(value: unknown): string {
  return serialize(value, '$');
}
