/**
 * A `Storage` built on a Map, so a test never has to reach for the ambient `window.localStorage`.
 *
 * Node ≥26 defines a global `localStorage` accessor that is disabled unless `--localstorage-file`
 * is passed (it reads back `undefined`), and vitest's happy-dom environment skips installing any
 * happy-dom global that is already present on the global object — `localStorage` is one of them.
 * Reading `window.localStorage` therefore yields `undefined` on Node ≥26 and 13 tests used to die
 * on `Cannot read properties of undefined (reading 'clear')`. Anything that needs a store in a UI
 * test takes this one.
 */
export function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length(): number {
      return entries.size;
    },
    clear(): void {
      entries.clear();
    },
    getItem(key: string): string | null {
      const value = entries.get(key);
      return value === undefined ? null : value;
    },
    key(index: number): string | null {
      return [...entries.keys()][index] ?? null;
    },
    removeItem(key: string): void {
      entries.delete(key);
    },
    setItem(key: string, value: string): void {
      entries.set(key, String(value));
    },
  };
}
