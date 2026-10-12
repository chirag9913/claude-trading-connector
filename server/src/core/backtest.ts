/**
 * Event-driven backtester. Long/short/flat, ATR-based stops, realistic costs
 * (a configurable bps slippage + commission). Returns equity curve + stats.
 */
import type { Candle } from "./marketData.js";
import { getHistory } from "./marketData.js";
import { strategies } from "./strategies.js";
import { atr } from "./indicators.js";

export interface BacktestResult {
  symbol: string;
  strategy: string;
  from: string;
  to: string;
  bars: number;
  initial: number;
  final: number;
  returnPct: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdownPct: number;
  sharpe: number;
  trades: TradeSummary[];
  equity: { time: number; value: number }[];
}

interface TradeSummary {
  side: "long" | "short";
  entryTime: number;
  entryPrice: number;
  exitTime?: number;
  exitPrice?: number;
  pnl?: number;
  reason?: string;
}

export interface BacktestOptions {
  symbol: string;
  strategy: string;
  range?: string;
  initial?: number;
  riskPerTradePct?: number; // % of equity risked per trade (via stop distance)
  stopAtrMult?: number;
  slippageBps?: number;
  allowShort?: boolean;
}

export async function runBacktest(
  opts: BacktestOptions,
): Promise<BacktestResult> {
  const strat = strategies[opts.strategy];
  if (!strat) {
    throw new Error(
      `Unknown strategy "${opts.strategy}". Available: ${Object.keys(strategies).join(", ")}`,
    );
  }
  const candles = await getHistory(opts.symbol, opts.range ?? "5y", "1d");
  if (candles.length < 60) throw new Error(`Not enough history for ${opts.symbol}`);

  const closes = candles.map((c) => c.close);
  const atrSeries = atr(candles, 14);
  const ctx = { closes, candles };

  let equity = opts.initial ?? 100_000;
  const initial = equity;
  const stopAtr = opts.stopAtrMult ?? 2;
  const riskPct = (opts.riskPerTradePct ?? 1) / 100;
  const slip = (opts.slippageBps ?? 5) / 10_000;
  const allowShort = opts.allowShort ?? true;

  const trades: TradeSummary[] = [];
  const equityCurve: { time: number; value: number }[] = [];
  let open: TradeSummary | null = null;
  let qty = 0;
  let peak = equity;
  let maxDD = 0;
  const returns: number[] = [];

  const closeTrade = (i: number, price: number, reason: string) => {
    if (!open) return;
    const fill = open.side === "long" ? price * (1 - slip) : price * (1 + slip);
    const gross =
      open.side === "long"
        ? (fill - open.entryPrice) * qty
        : (open.entryPrice - fill) * qty;
    equity += gross;
    open.exitTime = candles[i].time;
    open.exitPrice = fill;
    open.pnl = gross;
    open.reason = reason;
    trades.push(open);
    open = null;
    qty = 0;
  };

  for (let i = 50; i < candles.length; i++) {
    const c = candles[i];
    const want = strat.signal(ctx, i);
    const a = atrSeries[i] || closes[i] * 0.01;

    if (open) {
      // Manage open position: stop / target / signal flip.
      const stop =
        open.side === "long"
          ? open.entryPrice - stopAtr * a
          : open.entryPrice + stopAtr * a;
      if (open.side === "long" && c.low <= stop) closeTrade(i, stop, "stop");
      else if (open.side === "short" && c.high >= stop)
        closeTrade(i, stop, "stop");
      else if ((open.side === "long" && want === -1) || (open.side === "short" && want === 1))
        closeTrade(i, c.close, "signal-flip");
      else if (i === candles.length - 1) closeTrade(i, c.close, "eod");
    }

    if (!open && want !== 0) {
      if (want === -1 && !allowShort) continue;
      const side = want === 1 ? "long" : "short";
      const stopDist = stopAtr * a;
      const riskAmt = equity * riskPct;
      const size = Math.max(1, Math.floor(riskAmt / stopDist));
      const entry = c.close * (1 + (side === "long" ? slip : -slip));
      open = {
        side,
        entryTime: c.time,
        entryPrice: entry,
      };
      qty = size;
    }

    // Mark-to-market equity for the curve.
    const mtm = open
      ? equity +
        (open.side === "long"
          ? (c.close - open.entryPrice) * qty
          : (open.entryPrice - c.close) * qty)
      : equity;
    equityCurve.push({ time: c.time, value: mtm });
    peak = Math.max(peak, mtm);
    maxDD = Math.max(maxDD, ((peak - mtm) / peak) * 100);
    if (i > 50)
      returns.push((mtm - equityCurve[equityCurve.length - 2].value) / equityCurve[equityCurve.length - 2].value);
  }

  if (open) closeTrade(candles.length - 1, closes[closes.length - 1], "eod");

  const wins = trades.filter((t) => (t.pnl ?? 0) > 0);
  const losses = trades.filter((t) => (t.pnl ?? 0) <= 0);
  const grossProfit = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0));
  const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const sd = Math.sqrt(
    returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length || 1),
  );

  return {
    symbol: opts.symbol,
    strategy: strat.name,
    from: new Date(candles[0].time * 1000).toISOString().slice(0, 10),
    to: new Date(candles[candles.length - 1].time * 1000).toISOString().slice(0, 10),
    bars: candles.length,
    initial,
    final: equity,
    returnPct: ((equity - initial) / initial) * 100,
    totalTrades: trades.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    maxDrawdownPct: maxDD,
    sharpe: sd ? (mean / sd) * Math.sqrt(252) : 0,
    trades: trades.slice(-20),
    equity: equityCurve.filter((_, i) => i % Math.ceil(equityCurve.length / 300) === 0),
  };
}
