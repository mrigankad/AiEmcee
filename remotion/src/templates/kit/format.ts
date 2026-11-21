/**
 * Count-up numbers. A metric counts from 0 to its value; the text at each
 * moment keeps the final number's decimals, so the digits do not jitter in
 * width as they count (pair with font-variant-numeric: tabular-nums).
 */
export type Metric = { value: number; prefix?: string; suffix?: string; decimals?: number };

/** 12345.6 -> "12,345.6" with `decimals` places. */
export function formatNumber(value: number, decimals = 0): string {
  const v = Number.isFinite(value) ? value : 0;
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** The metric's text at count-up progress p (0..1, already eased). */
export function countText(m: Metric, p: number): string {
  const d = m.decimals ?? (Number.isInteger(m.value) ? 0 : 1);
  const k = Math.max(0, Math.min(1, p));
  return `${m.prefix ?? ""}${formatNumber(m.value * k, d)}${m.suffix ?? ""}`;
}

/** The longest text the metric will show (its final value), for fitting. */
export const finalText = (m: Metric) => countText(m, 1);
