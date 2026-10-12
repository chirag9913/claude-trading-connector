/**
 * JSON-file persistence for the paper account (positions, trades, equity curve,
 * cash). Shared by the paper engine and readable by the dashboard API.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

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

const file = () => path.join(config.stateDir, "account.json");

export function loadState(): AccountState {
  try {
    return JSON.parse(fs.readFileSync(file(), "utf8"));
  } catch {
    const s: AccountState = {
      cash: config.paperStartingBalance,
      startingBalance: config.paperStartingBalance,
      positions: [],
      closedTrades: [],
      equityCurve: [],
      log: [],
    };
    saveState(s);
    return s;
  }
}

export function saveState(s: AccountState) {
  fs.mkdirSync(config.stateDir, { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(s, null, 2));
}

export function log(s: AccountState, msg: string) {
  s.log.push(`[${new Date().toISOString()}] ${msg}`);
  if (s.log.length > 200) s.log = s.log.slice(-200);
}
