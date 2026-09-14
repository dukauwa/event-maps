/** Per-event bookmarks + visited state persisted in localStorage. Ids are prefixed by kind ("ex:", "bo:", "se:"). */

export type BookmarkKind = "exhibitor" | "booth" | "session";
export interface BookmarkState { bookmarks: string[]; visited: string[] }

const PREFIX: Record<BookmarkKind, string> = { exhibitor: "ex:", booth: "bo:", session: "se:" };

export function bookmarkKey(kind: BookmarkKind, id: string): string {
  return `${PREFIX[kind]}${id}`;
}

export function splitBookmarkKey(key: string): { kind: BookmarkKind; id: string } | null {
  for (const [kind, p] of Object.entries(PREFIX) as [BookmarkKind, string][]) {
    if (key.startsWith(p)) return { kind, id: key.slice(p.length) };
  }
  return null;
}

function storageKey(eventId: string) {
  return `tessera:plan:${eventId}`;
}

export function loadBookmarkState(eventId: string): BookmarkState {
  if (typeof window === "undefined") return { bookmarks: [], visited: [] };
  try {
    const raw = window.localStorage.getItem(storageKey(eventId));
    if (!raw) return { bookmarks: [], visited: [] };
    const parsed = JSON.parse(raw) as Partial<BookmarkState>;
    return { bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks.filter((x) => typeof x === "string") : [], visited: Array.isArray(parsed.visited) ? parsed.visited.filter((x) => typeof x === "string") : [] };
  } catch {
    return { bookmarks: [], visited: [] };
  }
}

export function saveBookmarkState(eventId: string, state: BookmarkState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(eventId), JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

export function toggleIn(list: string[], key: string, force?: boolean): string[] {
  const has = list.includes(key);
  const want = force ?? !has;
  if (want && !has) return [...list, key];
  if (!want && has) return list.filter((k) => k !== key);
  return list;
}
