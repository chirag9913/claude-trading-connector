/**
 * Server-side access to the paper-account state written by the MCP server,
 * plus free Yahoo quotes. Used by the dashboard API routes.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface Position {
  symbol: string;
  side: "long" | "short";
  qty: number;
  entryPrice: number;
  entryTime: string;
  stopLoss?: number;
  takeProfit?: number;
  strategy?: string;
}
export interface TradeRecord {
  id: string;
  symbol: string;
  side: "long" | "short";
  qty: number;
  entryPrice: number;
  entryTime: string;
  exitPrice?: number;
  exitTime?: string;
  pnl?: number;
  reason?: string;
}
export interface AccountState {
  cash: number;
  startingBalance: number;
  positions: Position[];
  closedTrades: TradeRecord[];
  equityCurve: { t: string; equity: number }[];
  log: string[];
}

const stateDir =
  process.env.STATE_DIR ?? path.join(os.homedir(), ".claude-trading", "state");

export function loadState(): AccountState {
  try {
    return JSON.parse(fs.readFileSync(path.join(stateDir, "account.json"), "utf8"));
  } catch {
    return {
      cash: 100000,
      startingBalance: 100000,
      positions: [],
      closedTrades: [],
      equityCurve: [],
      log: [],
    };
  }
}

export function saveState(s: AccountState) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, "account.json"), JSON.stringify(s, null, 2));
}

export function logLine(s: AccountState, msg: string) {
  s.log.push(`[${new Date().toISOString()}] ${msg}`);
  if (s.log.length > 200) s.log = s.log.slice(-200);
}

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
};

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchHistory(
  symbol: string,
  range = "1y",
  interval = "1d",
): Promise<Candle[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, { headers: UA, cache: "no-store" });
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);
  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const open = q.open?.[i], high = q.high?.[i], low = q.low?.[i], close = q.close?.[i];
    if (open == null || close == null) continue;
    out.push({ time: ts[i], open, high, low, close, volume: q.volume?.[i] ?? 0 });
  }
  return out;
}

export async function fetchQuote(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`;
  const res = await fetch(url, { headers: UA, cache: "no-store" });
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) return { symbol, price: 0, changePct: 0, currency: "INR" };
  const price = meta.regularMarketPrice ?? meta.chartPreviousClose ?? 0;
  const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
  return {
    symbol,
    price,
    changePct: prev ? ((price - prev) / prev) * 100 : 0,
    currency: meta.currency ?? "INR",
  };
}

export async function fetchQuotes(symbols: string[]) {
  const results = await Promise.allSettled(symbols.map(fetchQuote));
  return results
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchQuote>>> => r.status === "fulfilled")
    .map((r) => r.value);
}
