/** Map in order, one at a time: for callbacks that write (parallel writes could race, e.g. creating the same category twice). */
export async function mapSeq<T, R>(items: readonly T[], fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i++) out.push(await fn(items[i], i));
  return out;
}
