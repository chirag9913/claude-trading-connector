import { NextResponse } from "next/server";
import { loadState, saveState, logLine, fetchQuote, fetchHistory } from "@/lib/state";

export const dynamic = "force-dynamic";

// POST /api/trade  { action, ... }  — open | close | reset
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;
    const s = loadState();

    if (action === "reset") {
      const bal = body.balance ?? 100000;
      s.cash = bal;
      s.startingBalance = bal;
      s.positions = [];
      s.closedTrades = [];
      s.equityCurve = [];
      s.log = [];
      saveState(s);
      return NextResponse.json({ ok: true, message: `Reset demo account to ₹${bal}` });
    }

    if (action === "close") {
      const symbol = String(body.symbol);
      const idx = s.positions.findIndex((p) => p.symbol === symbol);
      if (idx === -1) return NextResponse.json({ ok: false, message: `No open position in ${symbol}` }, { status: 404 });
      const pos = s.positions[idx];
      const q = await fetchQuote(symbol);
      const fill = q.price;
      const pnl = pos.side === "long" ? (fill - pos.entryPrice) * pos.qty : (pos.entryPrice - fill) * pos.qty;
      s.cash += pos.side === "long" ? fill * pos.qty : pos.entryPrice * pos.qty + pnl;
      s.closedTrades.push({
        id: `${symbol}-${pos.entryTime}`,
        symbol, side: pos.side, qty: pos.qty, entryPrice: pos.entryPrice, entryTime: pos.entryTime,
        exitPrice: fill, exitTime: new Date().toISOString(), pnl, reason: body.reason ?? "manual",
      });
      s.positions.splice(idx, 1);
      logLine(s, `CLOSED ${symbol} @ ₹${fill.toFixed(2)} → PnL ₹${pnl.toFixed(0)}`);
      saveState(s);
      return NextResponse.json({ ok: true, message: `Closed ${symbol}: PnL ₹${pnl.toFixed(2)}`, pnl });
    }

    if (action === "open") {
      const symbol = String(body.symbol);
      const side = body.side === "short" ? "short" : "long";
      const qty = Number(body.qty);
      if (!symbol || !(qty > 0)) return NextResponse.json({ ok: false, message: "Symbol and qty>0 required" }, { status: 400 });

      const q = await fetchQuote(symbol);
      if (!q.price) throw new Error(`No price for ${symbol}`);
      const notional = q.price * qty;

      // If a position in the SAME direction exists, we allow only long/short one-way.
      const existing = s.positions.find((p) => p.symbol === symbol && p.side === side);
      if (!existing && notional > s.cash) {
        return NextResponse.json({ ok: false, message: `Insufficient cash: need ₹${notional.toFixed(0)}, have ₹${s.cash.toFixed(0)}` }, { status: 400 });
      }

      if (existing) {
        const total = existing.qty + qty;
        existing.entryPrice = (existing.entryPrice * existing.qty + q.price * qty) / total;
        existing.qty = total;
        existing.entryTime = new Date().toISOString();
        if (body.stopLoss) existing.stopLoss = Number(body.stopLoss);
        if (body.takeProfit) existing.takeProfit = Number(body.takeProfit);
        logLine(s, `ADDED ${qty} ${symbol} @ ₹${q.price.toFixed(2)} → ${existing.qty}`);
        saveState(s);
        return NextResponse.json({ ok: true, message: `Added ${qty} ${symbol} @ ₹${q.price.toFixed(2)}` });
      }

      s.positions.push({
        symbol, side, qty, entryPrice: q.price, entryTime: new Date().toISOString(),
        stopLoss: body.stopLoss ? Number(body.stopLoss) : undefined,
        takeProfit: body.takeProfit ? Number(body.takeProfit) : undefined,
        strategy: body.strategy ?? "manual-ui",
      });
      s.cash -= notional;
      logLine(s, `OPENED ${side.toUpperCase()} ${qty} ${symbol} @ ₹${q.price.toFixed(2)}`);
      saveState(s);
      return NextResponse.json({ ok: true, message: `Opened ${side} ${qty} ${symbol} @ ₹${q.price.toFixed(2)}` });
    }

    return NextResponse.json({ ok: false, message: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message ?? "error" }, { status: 500 });
  }
}
