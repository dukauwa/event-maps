/** Joins class names, skipping falsy parts. Plain module so server and client components can both call it. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
