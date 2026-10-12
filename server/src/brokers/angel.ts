/**
 * Angel One SmartAPI adapter — a free, SEBI-registered Indian broker that
 * supports NSE/BSE equities AND currency derivatives (USDINR, EURINR, GBPINR,
 * JPYINR) — the legal way to trade FX from India.
 *
 * Set these env vars to go live:
 *   ANGEL_API_KEY, ANGEL_CLIENT_ID, ANGEL_PASSWORD, ANGEL_TOTP_SECRET
 *
 * Docs: https://smartapi.angelone.in/docs
 */
import crypto from "node:crypto";
import { config } from "../config.js";

const BASE = "https://apiconnect.angelone.in";
let token: string | null = null;
let expiresAt = 0;

function totp(secret: string): string {
  // Minimal TOTP (RFC 6238). Requires base32 secret from your Angel One app.
  const epoch = Math.floor(Date.now() / 1000 / 30);
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(epoch));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[off] & 0x7f) << 24) |
    ((hmac[off + 1] & 0xff) << 16) |
    ((hmac[off + 2] & 0xff) << 8) |
    (hmac[off + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    value = 0;
  const out: number[] = [];
  for (const ch of input.toUpperCase().replace(/=+$/, "")) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function isConfigured(): boolean {
  return Boolean(
    config.angel.apiKey && config.angel.clientId && config.angel.password,
  );
}

async function login(): Promise<string> {
  if (token && Date.now() < expiresAt) return token;
  const a = config.angel;
  if (!isConfigured()) {
    throw new Error(
      "Angel One not configured. Set ANGEL_API_KEY, ANGEL_CLIENT_ID, ANGEL_PASSWORD (free from smartapi.angelone.in).",
    );
  }
  const body: Record<string, string> = {
    clientcode: a.clientId,
    password: a.password,
  };
  if (a.totpSecret) body.totp = totp(a.totpSecret);

  const res = await fetch(`${BASE}/rest/auth/angelbroking/user/v1/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PrivateKey": a.apiKey,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data?.message !== "SUCCESS" || !data?.data?.jwtToken) {
    throw new Error(`Angel One login failed: ${data?.message ?? "unknown"}`);
  }
  const jt: string | undefined = data?.data?.jwtToken;
  if (!jt) {
    throw new Error(`Angel One login failed: ${data?.message ?? "no token"}`);
  }
  token = jt;
  expiresAt = Date.now() + 24 * 3600 * 1000; // conservative
  return jt;
}

async function post(path: string, body: unknown): Promise<any> {
  const jwt = await login();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
      "X-PrivateKey": config.angel.apiKey,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

/** Place a real order. `tradingsymbol` like "SBIN-EQ" or "USDINR25DECFUT". */
export async function placeRealOrder(opts: {
  tradingsymbol: string;
  exchange: "NSE" | "BSE" | "NFO" | "CDS";
  transactiontype: "BUY" | "SELL";
  ordertype: "MARKET" | "LIMIT";
  quantity: number;
  price?: number;
  producttype?: "INTRADAY" | "CNC" | "MIS";
}): Promise<any> {
  return post("/rest/secure/angelbroking/order/v1/placeOrder", {
    tradingsymbol: opts.tradingsymbol,
    exchange: opts.exchange,
    transactiontype: opts.transactiontype,
    ordertype: opts.ordertype,
    producttype: opts.producttype ?? "INTRADAY",
    quantity: String(opts.quantity),
    price: String(opts.price ?? 0),
    triggerprice: "0",
    validity: "DAY",
    squareoff: "0",
    stoploss: "0",
    isamo: false,
  });
}

/** Fetch a live quote for an Angel One instrument token. */
export async function getRealQuote(
  mode: "LTP" | "OHLC" | "QUOTE",
  tokens: string[],
  exchange = "NSE",
): Promise<any> {
  const jwt = await login();
  const res = await fetch(
    `${BASE}/rest/secure/angelbroking/market/v1/quote/${mode}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-PrivateKey": config.angel.apiKey,
        "x-feedType": "RAW",
        Accept: "application/json",
      },
    },
  );
  return res.json();
}
