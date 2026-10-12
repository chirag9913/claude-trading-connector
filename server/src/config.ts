/**
 * Central configuration.
 * Everything works out-of-the-box in PAPER mode (free Yahoo Finance data).
 * To go live with real orders, register a free SEBI-broker account (Angel One /
 * Dhan) and set the keys below. Never commit real keys.
 */
import os from "node:os";
import path from "node:path";

const home = os.homedir();

export const config = {
  /** Which broker adapter handles real order execution. */
  broker: (process.env.BROKER ?? "paper") as "paper" | "angel",

  /** Paper account starting balance in INR. */
  paperStartingBalance: Number(process.env.PAPER_BALANCE ?? 100_000),

  /** Directory for persisted state (positions, trades, equity curve). */
  stateDir:
    process.env.STATE_DIR ?? path.join(home, ".claude-trading", "state"),

  /** Angel One SmartAPI credentials (free from https://smartapi.angelone.in). */
  angel: {
    apiKey: process.env.ANGEL_API_KEY ?? "",
    clientId: process.env.ANGEL_CLIENT_ID ?? "",
    password: process.env.ANGEL_PASSWORD ?? "",
    totpSecret: process.env.ANGEL_TOTP_SECRET ?? "", // for 2FA auto-login
  },

  /**
   * Default universe. All symbols are Indian (NSE) — the only legal market for
   * residents. Currency derivatives settle in INR (USDINR etc.), which is the
   * SEBI-regulated way to trade "forex" from India.
   */
  universe: {
    stocks: ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS"],
    currency: ["USDINR=X", "EURINR=X", "GBPINR=X", "JPYINR=X"],
  },

  /** Yahoo Finance base (free, no key). Used for market data + backtests. */
  yahoo: {
    base: "https://query1.finance.yahoo.com",
  },
};
