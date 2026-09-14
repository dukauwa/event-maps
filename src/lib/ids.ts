import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nano = customAlphabet(alphabet, 14);
const nanoShort = customAlphabet(alphabet, 8);

export type IdPrefix =
  | "org" | "usr" | "ses" | "ev" | "lv" | "bo" | "ex" | "ca" | "el" | "se"
  | "wn" | "we" | "tr" | "pr" | "or" | "ba" | "ak" | "wh" | "wd" | "an" | "fv" | "sp" | "md";

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${nano()}`;
}

export function shortId(): string {
  return nanoShort();
}

export function secretToken(bytes = 32): string {
  return customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", bytes)();
}
