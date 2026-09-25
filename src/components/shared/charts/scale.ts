/** Axis helpers for the chart components: clean tick steps (1, 2, 2.5, 5 × 10ⁿ) from zero. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ??
    10 * magnitude;
  const ticks: number[] = [];
  for (let value = 0; value < max + step * 0.999; value += step)
    ticks.push(Number(value.toFixed(6)));
  if (ticks.length < 2) ticks.push(step);
  return ticks;
}

/** 1,284 · 12.9K · 4.2M (compact, for axis ticks and tight labels). */
export function compactNumber(value: number, locale = "en-IN"): string {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

/** Categorical colour for a series slot (fixed order, never cycled — callers fold extra series into "Other"). */
export const seriesColor = (slot: number) => `var(--series-${Math.min(Math.max(slot, 1), 8)})`;
