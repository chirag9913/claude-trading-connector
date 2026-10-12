/**
 * Paper / demo trading engine. Simulates order fills against live Yahoo
 * quotes, tracks positions, applies stops/targets on demand, and persists
 * everything. This is what makes the whole system work with zero account.
 */
import { getQuote } from "./marketData.js";
import { loadState, saveState, log, type Position } from "./store.js";

export interface OrderResult {
  ok: boolean;
  message: string;
  position?: Position;
}

export async function placeOrder(opts: {
  symbol: string;
  side: "long" | "short";
  qty: number;
  stopLoss?: number;
  takeProfit?: number;
  strategy?: string;
}): Promise<OrderResult> {
  const s = loadState();
  const q = await getQuote(opts.symbol);

  if (opts.qty <= 0) return { ok: false, message: "Quantity must be > 0" };

  const notional = q.price * opts.qty;
  const existing = s.positions.find(
    (p) => p.symbol === opts.symbol && p.side === opts.side,
  );
  const exposure = s.positions.reduce(
    (acc, p) => acc + p.entryPrice * p.qty,
    0,
  );

  if (!existing && notional > s.cash) {
    return {
      ok: false,
      message: `Insufficient paper cash: need ₹${notional.toFixed(0)}, have ₹${s.cash.toFixed(0)}`,
    };
  }

  if (existing) {
    // Add to / scale existing position (simple average-up model).
    const totalQty = existing.qty + opts.qty;
    existing.entryPrice =
      (existing.entryPrice * existing.qty + q.price * opts.qty) / totalQty;
    existing.qty = totalQty;
    existing.entryTime = new Date().toISOString();
    if (opts.stopLoss) existing.stopLoss = opts.stopLoss;
    if (opts.takeProfit) existing.takeProfit = opts.takeProfit;
    log(s, `ADDED ${opts.qty} ${opts.symbol} @ ₹${q.price.toFixed(2)} → pos ${existing.qty}`);
  } else {
    const pos: Position = {
      symbol: opts.symbol,
      side: opts.side,
      qty: opts.qty,
      entryPrice: q.price,
      entryTime: new Date().toISOString(),
      stopLoss: opts.stopLoss,
      takeProfit: opts.takeProfit,
      strategy: opts.strategy,
    };
    s.positions.push(pos);
    s.cash -= notional;
    log(s, `OPENED ${opts.side.toUpperCase()} ${opts.qty} ${opts.symbol} @ ₹${q.price.toFixed(2)}`);
  }

  saveState(s);
  const pos =
    existing ??
    s.positions[s.positions.length - 1];
  return {
    ok: true,
    message: `Filled (paper): ${opts.side} ${opts.qty} ${opts.symbol} @ ₹${q.price.toFixed(2)}`,
    position: pos,
  };
}

export async function closePosition(
  symbol: string,
  reason = "manual",
): Promise<OrderResult> {
  const s = loadState();
  const idx = s.positions.findIndex((p) => p.symbol === symbol);
  if (idx === -1) return { ok: false, message: `No open position in ${symbol}` };

  const pos = s.positions[idx];
  const q = await getQuote(symbol);
  const fill = q.price;
  const pnl =
    pos.side === "long"
      ? (fill - pos.entryPrice) * pos.qty
      : (pos.entryPrice - fill) * pos.qty;

  s.cash += pos.side === "long" ? fill * pos.qty : pos.entryPrice * pos.qty + pnl;
  s.closedTrades.push({
    id: `${symbol}-${pos.entryTime}`,
    symbol,
    side: pos.side,
    qty: pos.qty,
    entryPrice: pos.entryPrice,
    entryTime: pos.entryTime,
    exitPrice: fill,
    exitTime: new Date().toISOString(),
    pnl,
    reason,
  });
  s.positions.splice(idx, 1);
  log(s, `CLOSED ${symbol} @ ₹${fill.toFixed(2)} → PnL ₹${pnl.toFixed(0)} (${reason})`);
  saveState(s);
  return {
    ok: true,
    message: `Closed ${symbol}: PnL ₹${pnl.toFixed(2)}`,
  };
}

/** Check stops/targets for all open positions against current prices. */
export async function checkStops(): Promise<string[]> {
  const s = loadState();
  const hits: string[] = [];
  for (const pos of [...s.positions]) {
    const q = await getQuote(pos.symbol);
    const price = q.price;
    let reason: string | null = null;
    if (pos.side === "long") {
      if (pos.stopLoss && price <= pos.stopLoss) reason = "stop-loss";
      else if (pos.takeProfit && price >= pos.takeProfit) reason = "take-profit";
    } else {
      if (pos.stopLoss && price >= pos.stopLoss) reason = "stop-loss";
      else if (pos.takeProfit && price <= pos.takeProfit) reason = "take-profit";
    }
    if (reason) {
      await closePosition(pos.symbol, reason);
      hits.push(`${pos.symbol} ${reason} @ ₹${price.toFixed(2)}`);
    }
  }
  if (hits.length) {
    const s2 = loadState();
    recordEquity(s2);
    saveState(s2);
  }
  return hits;
}

/** Snapshot account value (cash + mark-to-market positions) into equity curve. */
export async function snapshotEquity() {
  const s = loadState();
  let mtm = 0;
  for (const p of s.positions) {
    const q = await getQuote(p.symbol);
    mtm += p.side === "long" ? q.price * p.qty : p.entryPrice * p.qty + (p.entryPrice - q.price) * p.qty;
  }
  s.equityCurve.push({ t: new Date().toISOString(), equity: s.cash + mtm });
  if (s.equityCurve.length > 5000) s.equityCurve = s.equityCurve.slice(-5000);
  saveState(s);
  return s.cash + mtm;
}

function recordEquity(s: ReturnType<typeof loadState>) {
  let mtm = 0;
  for (const p of s.positions) {
    mtm += p.side === "long" ? p.entryPrice * p.qty : p.entryPrice * p.qty;
  }
  s.equityCurve.push({ t: new Date().toISOString(), equity: s.cash + mtm });
}
