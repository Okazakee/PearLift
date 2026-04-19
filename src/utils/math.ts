export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function roundToPrecision(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  if (!Number.isFinite(decimals) || decimals <= 0) return Math.round(value);
  const factor = 10 ** Math.min(8, Math.max(0, Math.floor(decimals)));
  return Math.round(value * factor) / factor;
}
