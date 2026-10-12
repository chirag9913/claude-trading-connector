import { NextResponse } from "next/server";
import { loadState, fetchQuotes } from "@/lib/state";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = loadState();
  const positionSymbols = s.positions.map((p) => p.symbol);
  const quotes = await fetchQuotes(positionSymbols);

  let invested = 0;
  const positions = s.positions.map((p) => {
    const q = quotes.find((x) => x.symbol === p.symbol);
    const mark = q?.price ?? p.entryPrice;
    const unreal =
      p.side === "long" ? (mark - p.entryPrice) * p.qty : (p.entryPrice - mark) * p.qty;
    invested += p.side === "long" ? mark * p.qty : p.entryPrice * p.qty + unreal;
    return { ...p, markPrice: mark, unrealizedPnl: unreal };
  });

  const equity = s.cash + invested;
  return NextResponse.json({
    cash: s.cash,
    invested,
    equity,
    startingBalance: s.startingBalance,
    totalReturnPct: ((equity - s.startingBalance) / s.startingBalance) * 100,
    positions,
    closedTrades: s.closedTrades.slice(-25).reverse(),
    equityCurve: s.equityCurve,
    log: s.log.slice(-20).reverse(),
  });
}
