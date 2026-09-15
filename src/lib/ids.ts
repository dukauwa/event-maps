import { customAlphabet } from "nanoid";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const SECRET_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const nano = customAlphabet(ALPHABET, 14);
const nanoShort = customAlphabet(ALPHABET, 8);

export type IdPrefix =
  | "org" | "usr" | "ses" | "ev" | "lv" | "bo" | "ex" | "ca" | "el" | "se"
  | "wn" | "we" | "tr" | "pr" | "or" | "ba" | "ak" | "wh" | "wd" | "an" | "fv" | "sp" | "md";

/**
 * Deterministic mode. The demo seed runs inside `withDeterministicIds` so that every process that
 * seeds a fresh database produces byte-identical ids and tokens. That matters on serverless hosts,
 * where each instance seeds its own copy: without it, an id or a portal link minted on one instance
 * is meaningless on the next.
 */
let rng: (() => number) | null = null;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(alphabet: string, length: number, next: () => number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(next() * alphabet.length)];
  return out;
}

export function withDeterministicIds<T>(seed: number, fn: () => T): T {
  const previous = rng;
  rng = mulberry32(seed);
  try {
    return fn();
  } finally {
    rng = previous;
  }
}

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${rng ? sample(ALPHABET, 14, rng) : nano()}`;
}

export function shortId(): string {
  return rng ? sample(ALPHABET, 8, rng) : nanoShort();
}

export function secretToken(length = 32): string {
  return rng ? sample(SECRET_ALPHABET, length, rng) : customAlphabet(SECRET_ALPHABET, length)();
}
