export interface RecordedCall {
  name: string;
  args: readonly unknown[];
}

/** Minimal recording stand-in for CanvasRenderingContext2D. Every method call
 *  and property assignment is appended to `calls`, so tests can assert that
 *  drawing code runs, balances save/restore, and is deterministic — without a
 *  real canvas. Gradient factories return an object accepting color stops. */
export function fakeCanvasContext(): CanvasRenderingContext2D & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const gradient = { addColorStop: () => {} };
  const target: Record<string | symbol, unknown> = {};
  return new Proxy(target, {
    get(object, property) {
      if (property === 'calls') return calls;
      if (!(property in object)) {
        object[property] = (...args: unknown[]) => {
          calls.push({ name: String(property), args });
          return property === 'createRadialGradient' || property === 'createLinearGradient'
            ? gradient
            : undefined;
        };
      }
      return object[property];
    },
    set(object, property, value) {
      calls.push({ name: `set ${String(property)}`, args: [value] });
      object[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D & { calls: RecordedCall[] };
}
