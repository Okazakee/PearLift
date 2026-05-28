export function clearTimer(
  timer: ReturnType<typeof setTimeout> | null,
): ReturnType<typeof setTimeout> | null {
  if (!timer) return null;
  clearTimeout(timer);
  return null;
}

