/**
 * Research engine. Pulls price history, computes a technical snapshot, and
 * returns a plain-language verdict + a suggested position (respecting risk).
 * This is the tool Claude calls to "do its own analysis".
 */
import { getHistory, getQuote, type Candle } from "./marketData.js";
import { sma, ema, rsi, macd, atr } from "./indicators.js";

export interface ResearchReport {
  symbol: string;
  price: number;
  changePct: number;
  trend: string;
  momentum: string;
  volatility: string;
  support: number;
  resistance: number;
  suggestedAction: "long" | "short" | "flat";
  confidence: number; // 0-100
  suggestedQty: number;
  stopLoss: number;
  takeProfit: number;
  reasoning: string;
  asOf: string;
}

export async function research(
  symbol: string,
  accountEquity = 100_000,
  riskPct = 1,
): Promise<ResearchReport> {
  const candles: Candle[] = await getHistory(symbol, "1y", "1d");
  const quote = await getQuote(symbol);
  const closes = candles.map((c) => c.close);

  const s20 = sma(closes, 20),
    s50 = sma(closes, 50);
  const e20 = ema(closes, 20);
  const r = rsi(closes, 14);
  const { hist } = macd(closes);
  const a = atr(candles, 14);

  const last = closes.length - 1;
  const price = quote.price || closes[last];
  const fast = s20[last],
    slow = s50[last],
    rsiNow = r[last],
    macdH = hist[last],
    atrNow = a[last] || price * 0.01;

  // --- Trend ---
  let trendScore = 0;
  if (!isNaN(fast) && !isNaN(slow)) {
    if (fast > slow) trendScore += 1;
    else if (fast < slow) trendScore -= 1;
  }
  if (price > e20[last]) trendScore += 1;
  else trendScore -= 1;

  const trend =
    trendScore > 0 ? "up" : trendScore < 0 ? "down" : "sideways";

  // --- Momentum ---
  let momScore = 0;
  if (!isNaN(rsiNow)) {
    if (rsiNow > 55) momScore += 1;
    else if (rsiNow < 45) momScore -= 1;
  }
  if (!isNaN(macdH)) {
    if (macdH > 0) momScore += 1;
    else if (macdH < 0) momScore -= 1;
  }
  const momentum = momScore > 0 ? "bullish" : momScore < 0 ? "bearish" : "neutral";

  // --- Volatility + S/R ---
  const recent = candles.slice(-30);
  const support = Math.min(...recent.map((c) => c.low));
  const resistance = Math.max(...recent.map((c) => c.high));
  const volatilityPct = (atrNow / price) * 100;

  // --- Combine into a decision ---
  const score = trendScore + momScore;
  let action: ResearchReport["suggestedAction"] = "flat";
  if (score >= 2) action = "long";
  else if (score <= -2) action = "short";

  const confidence = Math.min(
    95,
    Math.round(
      (Math.abs(score) / 3) * 60 +
        (Math.abs(rsiNow - 50) / 50) * 20 +
        (trend !== "sideways" ? 15 : 0) +
        (volatilityPct > 0.3 ? 10 : 0),
    ),
  );

  // ATR-based position sizing + stops (1R risk = riskPct of equity).
  const stopDist = 2 * atrNow;
  const riskAmt = accountEquity * (riskPct / 100);
  const qty = action === "flat" ? 0 : Math.max(1, Math.floor(riskAmt / stopDist));

  const stopLoss =
    action === "long"
      ? price - stopDist
      : action === "short"
        ? price + stopDist
        : 0;
  const takeProfit =
    action === "long"
      ? price + 2 * stopDist
      : action === "short"
        ? price - 2 * stopDist
        : 0;

  const reasoning =
    `${symbol}: price ₹${price.toFixed(2)} is in a ${trend} trend (20SMA ${
      !isNaN(fast) ? fast.toFixed(2) : "n/a"
    } vs 50SMA ${!isNaN(slow) ? slow.toFixed(2) : "n/a"}), momentum is ${momentum} ` +
    `(RSI ${!isNaN(rsiNow) ? rsiNow.toFixed(1) : "n/a"}, MACD hist ${
      !isNaN(macdH) ? macdH.toFixed(3) : "n/a"
    }). ATR ₹${atrNow.toFixed(2)} (${volatilityPct.toFixed(2)}% / bar). ` +
    `Support ₹${support.toFixed(2)}, resistance ₹${resistance.toFixed(2)}. ` +
    `→ Suggested ${action.toUpperCase()} ${qty} qty, stop ₹${stopLoss.toFixed(
      2,
    )}, target ₹${takeProfit.toFixed(2)} (2:1 reward).`;

  return {
    symbol,
    price,
    changePct: quote.changePct,
    trend,
    momentum,
    volatility: `${volatilityPct.toFixed(2)}% per bar (ATR ₹${atrNow.toFixed(2)})`,
    support,
    resistance,
    suggestedAction: action,
    confidence,
    suggestedQty: qty,
    stopLoss,
    takeProfit,
    reasoning,
    asOf: new Date().toISOString(),
  };
}
