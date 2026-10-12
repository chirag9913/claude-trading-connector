/**
 * Free market data via Yahoo Finance. No API key required.
 * Supports Indian NSE symbols ("RELIANCE.NS") and INR currency pairs
 * ("USDINR=X") — the SEBI-legal way to trade FX from India.
 */
import { config } from "../config.js";

export interface Candle {
  time: number; // unix seconds (bar open)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  price: number;
  changePct: number;
  currency: string;
  marketState: string;
  asOf: number;
}

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
};

async function yahoo(pathname: string): Promise<any> {
  const url = `${config.yahoo.base}${pathname}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) {
    throw new Error(`Yahoo Finance ${res.status} for ${pathname}`);
  }
  return res.json();
}

/** Fetch historical OHLCV candles. */
export async function getHistory(
  symbol: string,
  range = "1y",
  interval = "1d",
): Promise<Candle[]> {
  const data = await yahoo(
    `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,
  );
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);

  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const open = q.open?.[i],
      high = q.high?.[i],
      low = q.low?.[i],
      close = q.close?.[i];
    if (open == null || close == null) continue;
    out.push({
      time: ts[i],
      open,
      high,
      low,
      close,
      volume: q.volume?.[i] ?? 0,
    });
  }
  return out;
}

/**
 * Fetch a lightweight real-time quote. Uses the public chart endpoint (no
 * auth) via its embedded `meta`, which is more reliable than /v7/quote.
 */
export async function getQuote(symbol: string): Promise<Quote> {
  const data = await yahoo(
    `/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`,
  );
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) throw new Error(`No quote data for ${symbol}`);

  const price: number = meta.regularMarketPrice ?? meta.chartPreviousClose;
  const prevClose: number =
    meta.chartPreviousClose ?? meta.previousClose ?? price;
  const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

  return {
    symbol,
    price,
    changePct,
    currency: meta.currency ?? "INR",
    marketState: meta.marketState ?? "REGULAR",
    asOf: meta.regularMarketTime ?? Math.floor(Date.now() / 1000),
  };
}

/** Fetch quotes for several symbols at once. */
export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const results = await Promise.allSettled(symbols.map((s) => getQuote(s)));
  return results
    .filter((r): r is PromiseFulfilledResult<Quote> => r.status === "fulfilled")
    .map((r) => r.value);
}
