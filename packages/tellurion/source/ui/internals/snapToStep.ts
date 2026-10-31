/** Returns the value rounded to the nearest step counted from `min` and clamped to the range. */
export function snapToStep(
  value: number,
  {min, max, step}: {min: number; max: number; step: number},
): number {
  let stepCount = Math.round((value - min) / step);

  return Math.min(max, Math.max(min, min + stepCount * step));
}
