const MASK_64 = 0xffffffffffffffffn;

/** Process-independent FNV-1a 64-bit hash. */
export function stableHash(value: string): bigint {
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * 1099511628211n) & MASK_64;
  }
  return hash;
}
