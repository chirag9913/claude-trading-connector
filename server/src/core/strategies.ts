/**
 * Built-in strategies. Each produces +1 (long), -1 (short) or 0 (flat)
 * for a given bar index. The backtester and live signal generator share these.
 */
import type { Candle } from "./marketData.js";
import { sma, rsi, macd } from "./indicators.js";

export interface StrategyContext {
  closes: number[];
  candles: Candle[];
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  signal: (ctx: StrategyContext, i: number) => number;
}

export const strategies: Record<string, Strategy> = {
  "sma-cross": {
    id: "sma-cross",
    name: "SMA Crossover",
    description:
      "Classic trend follow: long when fast SMA(20) > slow SMA(50), short when it crosses below.",
    signal: (ctx, i) => {
      const fast = sma(ctx.closes.slice(0, i + 1), 20);
      const slow = sma(ctx.closes.slice(0, i + 1), 50);
      const f = fast[i],
        s = slow[i];
      if (isNaN(f) || isNaN(s)) return 0;
      return f > s ? 1 : f < s ? -1 : 0;
    },
  },
  "rsi-reversion": {
    id: "rsi-reversion",
    name: "RSI Mean Reversion",
    description:
      "Long when RSI(14) < 30 (oversold), short when RSI > 70 (overbought), flat in between.",
    signal: (ctx, i) => {
      const r = rsi(ctx.closes.slice(0, i + 1), 14)[i];
      if (isNaN(r)) return 0;
      if (r < 30) return 1;
      if (r > 70) return -1;
      return 0;
    },
  },
  "macd-momentum": {
    id: "macd-momentum",
    name: "MACD Momentum",
    description: "Long when MACD histogram > 0, short when < 0.",
    signal: (ctx, i) => {
      const { hist } = macd(ctx.closes.slice(0, i + 1));
      const h = hist[i];
      if (isNaN(h)) return 0;
      return h > 0 ? 1 : h < 0 ? -1 : 0;
    },
  },
};

export function listStrategies() {
  return Object.values(strategies).map(({ id, name, description }) => ({
    id,
    name,
    description,
  }));
}
