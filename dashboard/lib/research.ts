// Dashboard-side research (mirrors the MCP server's brain) so the Research
// button can auto-fill the trade form. Self-contained for Vercel deploy.
import { fetchHistory, fetchQuote } from "./state";
import { sma, ema, rsi, macdHist, atr } from "./indicators";

export interface ResearchReport {
  symbol: string;
  price: number;
  suggestedAction: "long" | "short" | "flat";
  confidence: number;
  suggestedQty: number;
  stopLoss: number;
  takeProfit: number;
  reasoning: string;
}

export async function research(
  symbol: string,
  equity = 100000,
  riskPct = 1,
): Promise<ResearchReport> {
  const candles = await fetchHistory(symbol, "1y", "1d");
  const quote = await fetchQuote(symbol);
  const closes = candles.map((c) => c.close);

  const s20 = sma(closes, 20), s50 = sma(closes, 50);
  const e20 = ema(closes, 20);
  const r = rsi(closes, 14);
  const mh = macdHist(closes);
  const a = atr(candles, 14);

  const last = closes.length - 1;
  const price = quote.price || closes[last];
  const fast = s20[last], slow = s50[last], rsiNow = r[last], macdH = mh[last];
  const atrNow = a[last] || price * 0.01;

  let trendScore = 0;
  if (!isNaN(fast) && !isNaN(slow)) trendScore += fast > slow ? 1 : fast < slow ? -1 : 0;
  trendScore += price > e20[last] ? 1 : -1;
  const trend = trendScore > 0 ? "up" : trendScore < 0 ? "down" : "sideways";

  let momScore = 0;
  if (!isNaN(rsiNow)) momScore += rsiNow > 55 ? 1 : rsiNow < 45 ? -1 : 0;
  if (!isNaN(macdH)) momScore += macdH > 0 ? 1 : macdH < 0 ? -1 : 0;
  const momentum = momScore > 0 ? "bullish" : momScore < 0 ? "bearish" : "neutral";

  const score = trendScore + momScore;
  let action: ResearchReport["suggestedAction"] = "flat";
  if (score >= 2) action = "long";
  else if (score <= -2) action = "short";

  const confidence = Math.min(
    95,
    Math.round((Math.abs(score) / 3) * 60 + (Math.abs(rsiNow - 50) / 50) * 20 + (trend !== "sideways" ? 15 : 0)),
  );

  const stopDist = 2 * atrNow;
  const qty = action === "flat" ? 0 : Math.max(1, Math.floor((equity * (riskPct / 100)) / stopDist));
  const stopLoss = action === "long" ? price - stopDist : action === "short" ? price + stopDist : 0;
  const takeProfit = action === "long" ? price + 2 * stopDist : action === "short" ? price - 2 * stopDist : 0;

  const reasoning =
    `${symbol} ₹${price.toFixed(2)}: ${trend} trend (20SMA ${!isNaN(fast) ? fast.toFixed(2) : "n/a"} vs 50SMA ${!isNaN(slow) ? slow.toFixed(2) : "n/a"}), ` +
    `${momentum} momentum (RSI ${!isNaN(rsiNow) ? rsiNow.toFixed(1) : "n/a"}). → ${action.toUpperCase()} ${qty}, stop ₹${stopLoss.toFixed(2)}, target ₹${takeProfit.toFixed(2)} (2:1).`;

  return { symbol, price, suggestedAction: action, confidence, suggestedQty: qty, stopLoss, takeProfit, reasoning };
}
