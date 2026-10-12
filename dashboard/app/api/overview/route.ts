import { NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/state";

export const dynamic = "force-dynamic";

const STOCKS = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS", "SBIN.NS", "TATAMOTORS.NS"];
const CURRENCY = ["USDINR=X", "EURINR=X", "GBPINR=X", "JPYINR=X"];

export async function GET() {
  const [stocks, currency] = await Promise.all([
    fetchQuotes(STOCKS),
    fetchQuotes(CURRENCY),
  ]);
  return NextResponse.json({ market: "INDIA (NSE/BSE + CDS)", stocks, currency });
}
