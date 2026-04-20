export function reorderArray<T>(items: T[], from: number, to: number): T[] {
  const result = items.slice();
  const [removed] = result.splice(from, 1);
  if (removed === undefined) return items;
  result.splice(to, 0, removed);
  return result;
}

export function arraysEqualBy<T>(
  a: T[],
  b: T[],
  key: (item: T) => string,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (key(a[i] as T) !== key(b[i] as T)) return false;
  }
  return true;
}
