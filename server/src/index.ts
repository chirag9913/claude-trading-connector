#!/usr/bin/env node
/**
 * Claude Trading MCP Server
 *
 * Exposes tools so Claude can autonomously research, backtest and trade the
 * Indian market (NSE/BSE shares + SEBI-legal INR currency derivatives).
 * Paper/demo mode works with zero setup. Set Angel One keys to go live.
 *
 * Legal note (India / FEMA): only SEBI-exchange-traded instruments are
 * supported. Offshore forex (EUR/USD on foreign brokers) is intentionally NOT
 * supported — it is illegal for Indian residents.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { config } from "./config.js";
import { getQuote, getQuotes } from "./core/marketData.js";
import { research } from "./core/research.js";
import { runBacktest } from "./core/backtest.js";
import { listStrategies } from "./core/strategies.js";
import { placeOrder, closePosition, checkStops, snapshotEquity } from "./core/paper.js";
import { loadState, saveState } from "./core/store.js";
import { isConfigured as angelReady, placeRealOrder } from "./brokers/angel.js";

const server = new McpServer({ name: "claude-trading", version: "1.0.0" });

function ok(text: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(text, null, 2) }] };
}
function err(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

// ---------------------------------------------------------------- tools ----

server.tool(
  "get_quote",
  "Get a live price quote for one Indian symbol (e.g. RELIANCE.NS, TCS.NS, USDINR=X).",
  { symbol: z.string().describe("Yahoo symbol, e.g. RELIANCE.NS or USDINR=X") },
  async ({ symbol }) => {
    try {
      return ok(await getQuote(symbol));
    } catch (e: any) {
      return err(e.message);
    }
  },
);

server.tool(
  "get_quotes",
  "Get live quotes for several symbols at once.",
  { symbols: z.array(z.string()) },
  async ({ symbols }) => {
    try {
      return ok(await getQuotes(symbols));
    } catch (e: any) {
      return err(e.message);
    }
  },
);

server.tool(
  "research_symbol",
  "Run a full technical analysis on a symbol and get a suggested action (long/short/flat) with confidence, position size, stop-loss and target. Use this to decide trades.",
  {
    symbol: z.string(),
    equity: z.number().optional().describe("Account equity for sizing (default 100000 INR)"),
    riskPct: z.number().optional().describe("Percent of equity to risk (default 1)"),
  },
  async ({ symbol, equity, riskPct }) => {
    try {
      const rep = await research(symbol, equity ?? config.paperStartingBalance, riskPct ?? 1);
      return ok(rep);
    } catch (e: any) {
      return err(e.message);
    }
  },
);

server.tool(
  "run_backtest",
  "Backtest a strategy on historical data. Returns return %, win rate, profit factor, max drawdown, Sharpe and recent trades.",
  {
    symbol: z.string(),
    strategy: z.string().describe("sma-cross | rsi-reversion | macd-momentum"),
    range: z.string().optional().describe("e.g. 1y, 3y, 5y (default 5y)"),
    initial: z.number().optional(),
    riskPerTradePct: z.number().optional(),
    allowShort: z.boolean().optional(),
  },
  async ({ symbol, strategy, range, initial, riskPerTradePct, allowShort }) => {
    try {
      const res = await runBacktest({ symbol, strategy, range, initial, riskPerTradePct, allowShort });
      return ok(res);
    } catch (e: any) {
      return err(e.message);
    }
  },
);

server.tool(
  "list_strategies",
  "List the available built-in trading strategies.",
  {},
  async () => ok(listStrategies()),
);

server.tool(
  "paper_trade",
  "Place a DEMO (paper) order. No real money. Uses live prices. Works with zero account setup.",
  {
    symbol: z.string(),
    side: z.enum(["long", "short"]),
    qty: z.number().positive(),
    stopLoss: z.number().optional(),
    takeProfit: z.number().optional(),
    strategy: z.string().optional(),
  },
  async (args) => {
    try {
      const res = await placeOrder(args);
      await snapshotEquity();
      return ok(res);
    } catch (e: any) {
      return err(e.message);
    }
  },
);

server.tool(
  "close_position",
  "Close an open paper position by symbol and realize its PnL.",
  { symbol: z.string() },
  async ({ symbol }) => {
    try {
      const res = await closePosition(symbol);
      await snapshotEquity();
      return ok(res);
    } catch (e: any) {
      return err(e.message);
    }
  },
);

server.tool(
  "check_stops",
  "Check stop-loss / take-profit for all open paper positions and auto-close any that hit.",
  {},
  async () => {
    try {
      const hits = await checkStops();
      return ok({ hit: hits.length, hits });
    } catch (e: any) {
      return err(e.message);
    }
  },
);

server.tool(
  "get_portfolio",
  "Get the paper account: cash, open positions (mark-to-market), equity, recent trades and equity curve.",
  {},
  async () => {
    try {
      const s = loadState();
      const positions = [];
      let mtm = 0;
      for (const p of s.positions) {
        const q = await getQuote(p.symbol);
        const unreal = p.side === "long" ? (q.price - p.entryPrice) * p.qty : (p.entryPrice - q.price) * p.qty;
        mtm += p.side === "long" ? q.price * p.qty : p.entryPrice * p.qty + unreal;
        positions.push({ ...p, markPrice: q.price, unrealizedPnl: unreal });
      }
      return ok({
        cash: s.cash,
        investedValue: mtm,
        equity: s.cash + mtm,
        startingBalance: s.startingBalance,
        totalReturnPct: ((s.cash + mtm - s.startingBalance) / s.startingBalance) * 100,
        positions,
        closedTrades: s.closedTrades.slice(-15),
        log: s.log.slice(-15),
        equityCurve: s.equityCurve.slice(-120),
      });
    } catch (e: any) {
      return err(e.message);
    }
  },
);

server.tool(
  "reset_paper_account",
  "Reset the paper account to the starting balance. Useful to start a fresh demo.",
  { balance: z.number().optional() },
  async ({ balance }) => {
    try {
      const s = loadState();
      s.cash = balance ?? config.paperStartingBalance;
      s.startingBalance = balance ?? config.paperStartingBalance;
      s.positions = [];
      s.closedTrades = [];
      s.equityCurve = [];
      saveState(s);
      return ok({ reset: true, cash: s.cash });
    } catch (e: any) {
      return err(e.message);
    }
  },
);

server.tool(
  "place_real_order",
  "PLACE A REAL ORDER via Angel One (SEBI broker). Only enabled if Angel One keys are configured. Use with extreme care — real money.",
  {
    tradingsymbol: z.string().describe('Angel symbol e.g. "SBIN-EQ" (NSE) or "USDINR25DECFUT" (CDS)'),
    exchange: z.enum(["NSE", "BSE", "NFO", "CDS"]),
    transactiontype: z.enum(["BUY", "SELL"]),
    ordertype: z.enum(["MARKET", "LIMIT"]),
    quantity: z.number().int().positive(),
    price: z.number().optional(),
    producttype: z.enum(["INTRADAY", "CNC", "MIS"]).optional(),
  },
  async (args) => {
    if (!angelReady()) {
      return err(
        "Angel One not configured. To go live, create a FREE account at https://smartapi.angelone.in and set ANGEL_API_KEY, ANGEL_CLIENT_ID, ANGEL_PASSWORD in the server env.",
      );
    }
    try {
      return ok(await placeRealOrder(args));
    } catch (e: any) {
      return err(e.message);
    }
  },
);

server.tool(
  "get_market_overview",
  "Snapshot of the default watchlist (top Indian stocks + INR currency pairs) with prices and 1-day change.",
  {},
  async () => {
    try {
      const symbols = [...config.universe.stocks, ...config.universe.currency];
      const quotes = await getQuotes(symbols);
      return ok({ marketState: "INDIA (NSE/BSE + CDS)", count: quotes.length, quotes });
    } catch (e: any) {
      return err(e.message);
    }
  },
);

// --------------------------------------------------------------- bootstrap --

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `claude-trading MCP running (broker=${config.broker}, angel=${angelReady() ? "ready" : "not-configured (paper only)"}). Paper starting balance: INR ${config.paperStartingBalance}`,
  );
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
