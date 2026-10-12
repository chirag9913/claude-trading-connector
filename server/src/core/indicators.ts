/**
 * Technical indicators — dependency-free, works on any Candle[] series.
 */
import type { Candle } from "./marketData.js";

export function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : NaN);
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** Relative Strength Index (Wilder smoothing). */
export function rsi(values: number[], period = 14): number[] {
  const out: number[] = [NaN];
  let gain = 0,
    loss = 0;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const g = Math.max(diff, 0);
    const l = Math.max(-diff, 0);
    if (i <= period) {
      gain += g;
      loss += l;
      if (i === period) {
        gain /= period;
        loss /= period;
        out.push(100 - 100 / (1 + gain / (loss || 1e-9)));
      } else out.push(NaN);
    } else {
      gain = (gain * (period - 1) + g) / period;
      loss = (loss * (period - 1) + l) / period;
      out.push(100 - 100 / (1 + gain / (loss || 1e-9)));
    }
  }
  return out;
}

/** MACD: returns { macd, signal, hist } line arrays. */
export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): { macd: number[]; signal: number[]; hist: number[] } {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  const hist = macdLine.map((v, i) => v - signalLine[i]);
  return { macd: macdLine, signal: signalLine, hist };
}

/** Average True Range (volatility, absolute price units). */
export function atr(candles: Candle[], period = 14): number[] {
  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i],
      p = candles[i - 1];
    tr.push(
      Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)),
    );
  }
  const out: number[] = [];
  let prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) out.push(NaN);
    else if (i === period - 1) out.push(prev);
    else {
      prev = (prev * (period - 1) + tr[i]) / period;
      out.push(prev);
    }
  }
  return out;
}
