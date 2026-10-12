// Compact technical indicators (dependency-free) for the dashboard's research.
import type { Candle } from "./state";

export function sma(v: number[], p: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i];
    if (i >= p) sum -= v[i - p];
    out.push(i >= p - 1 ? sum / p : NaN);
  }
  return out;
}
export function ema(v: number[], p: number): number[] {
  const out: number[] = [];
  const k = 2 / (p + 1);
  let prev = v[0];
  for (let i = 0; i < v.length; i++) {
    prev = i === 0 ? v[0] : v[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}
export function rsi(v: number[], p = 14): number[] {
  const out: number[] = [NaN];
  let g = 0, l = 0;
  for (let i = 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    const up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= p) {
      g += up; l += dn;
      if (i === p) { g /= p; l /= p; out.push(100 - 100 / (1 + g / (l || 1e-9))); }
      else out.push(NaN);
    } else {
      g = (g * (p - 1) + up) / p; l = (l * (p - 1) + dn) / p;
      out.push(100 - 100 / (1 + g / (l || 1e-9)));
    }
  }
  return out;
}
export function macdHist(v: number[], f = 12, s = 26, sig = 9): number[] {
  const ef = ema(v, f), es = ema(v, s);
  const line = ef.map((x, i) => x - es[i]);
  const signal = ema(line, sig);
  return line.map((x, i) => x - signal[i]);
}
export function atr(c: Candle[], p = 14): number[] {
  const tr: number[] = [c[0].high - c[0].low];
  for (let i = 1; i < c.length; i++) {
    const x = c[i], pr = c[i - 1];
    tr.push(Math.max(x.high - x.low, Math.abs(x.high - pr.close), Math.abs(x.low - pr.close)));
  }
  const out: number[] = [];
  let prev = tr.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = 0; i < tr.length; i++) {
    if (i < p - 1) out.push(NaN);
    else if (i === p - 1) out.push(prev);
    else { prev = (prev * (p - 1) + tr[i]) / p; out.push(prev); }
  }
  return out;
}
