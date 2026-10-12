# Claude Trading Connector — India (legal)

An **MCP server** that lets Claude **research, backtest and trade** the Indian market on
its own, plus a **Vercel/Next.js dashboard** to watch it live.

It ships with a **paper/demo engine** that works with **zero account and zero API keys**
(free Yahoo Finance data). Add a free **Angel One SmartAPI** key when you want real orders.

---

## ⚖️ Legal (India · FEMA / RBI / SEBI) — read this first

India's FEMA Act 1999 makes it **illegal for residents to trade forex on offshore
brokers** (OANDA, Exness, IQ Option, Olymp Trade, etc.). Sending money abroad for
margin FX trading is not allowed.

This connector is built to stay **legal**:

| You want | Legal way (what this uses) |
|---|---|
| Forex / currency | **CDS currency derivatives on NSE/BSE** — USD/INR, EUR/INR, GBP/INR, JPY/INR |
| Shares | **NSE / BSE equities** via a SEBI-registered broker |

Offshore forex (EUR/USD, GBP/USD on foreign platforms) is **intentionally not supported**.

> This is educational software, **not financial advice**. Real trading can lose money.
> Only trade with money you can afford to lose, and confirm your own tax/legal position.

---

## What you get

**MCP tools (Claude calls these):**
- `get_quote` / `get_quotes` / `get_market_overview` — live prices (stocks + INR pairs)
- `research_symbol` — full technical analysis → suggested long/short/flat + confidence + position size + stop/target
- `run_backtest` / `list_strategies` — backtest SMA-cross, RSI-reversion, MACD-momentum
- `paper_trade` / `close_position` / `check_stops` / `get_portfolio` / `reset_paper_account` — demo account (real money: none)
- `place_real_order` — real order via Angel One (only when you add keys; otherwise blocked)

**Dashboard (Vercel-ready):** live equity curve, open positions (mark-to-market), closed
trades, activity log, and a market watch for NSE stocks + CDS currency pairs. Auto-refresh.

---

## Project layout

```
trading-connector/
├── .mcp.json                 # auto-discovery for Claude Code
├── server/                   # MCP server + trading engine (Node/TS)
│   ├── src/index.ts          # MCP tools
│   ├── src/core/             # marketData, indicators, research, backtest, paper, store
│   └── src/brokers/angel.ts  # Angel One SmartAPI (free, SEBI) adapter
└── dashboard/                # Next.js app → deploy to Vercel
    └── app/                  # UI + /api/portfolio + /api/overview
```

---

## Quick start (paper mode — no account needed)

```bash
# 1. Build the MCP server
cd server
npm install
npm run build

# 2. Run the dashboard
cd ../dashboard
npm install
npm run dev            # http://localhost:3000
```

State (positions/trades) is written to `~/.claude-trading/state/account.json`, shared by
the MCP server and read by the dashboard.

### Register the MCP server with Claude

**Claude Code** — already auto-loads `.mcp.json` in this folder. Or add explicitly:
```bash
claude mcp add claude-trading -- node "C:\Users\nxsem\trading-connector\server\dist\index.js"
```

**Claude Desktop** — edit `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "claude-trading": {
      "command": "node",
      "args": ["C:\\Users\\nxsem\\trading-connector\\server\\dist\\index.js"],
      "env": { "BROKER": "paper", "PAPER_BALANCE": "100000" }
    }
  }
}
```

Then ask Claude things like:
> "Research RELIANCE, backtest the SMA crossover on it, and if it looks good place a paper trade with a 1% stop."

---

## Going live with real orders (free, SEBI-legal)

1. Open a free **Angel One** account → https://smartapi.angelone.in → get API key.
2. Copy `server/.env.example` → `server/.env` and fill:
   ```
   ANGEL_API_KEY=...
   ANGEL_CLIENT_ID=...
   ANGEL_PASSWORD=...
   ANGEL_TOTP_SECRET=...      # optional, for auto 2FA login
   ```
3. Restart the server. `place_real_order` now works (uses `BUY/SELL`, exchange `NSE/BSE/CDS`).

> Start on the Angel One **demo/practice** segment first. Real trading carries real risk.

---

## Deploy the dashboard to Vercel

```bash
cd dashboard
npx vercel        # follow prompts; it's a standard Next.js app
```

By default the dashboard reads the local state file. On Vercel (serverless), point it at
your state by setting `STATE_DIR` to a shared store, or run the dashboard locally while
the MCP server runs on your machine.

---

## Strategies included

- **sma-cross** — trend follow (fast SMA > slow SMA → long)
- **rsi-reversion** — mean reversion (RSI < 30 long, > 70 short)
- **macd-momentum** — momentum (MACD histogram sign)

Backtests apply ATR-based stops, 2:1 targets, ATR position sizing, and configurable
slippage — so results are realistic, not curve-fit fantasy.
