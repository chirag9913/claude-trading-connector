import { NextResponse } from "next/server";
import { research } from "@/lib/research";

export const dynamic = "force-dynamic";

// GET /api/research?symbol=RELIANCE.NS&equity=100000&riskPct=1
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") ?? "";
    if (!symbol) return NextResponse.json({ ok: false, message: "symbol required" }, { status: 400 });
    const equity = Number(searchParams.get("equity") ?? 100000);
    const riskPct = Number(searchParams.get("riskPct") ?? 1);
    const rep = await research(symbol, equity, riskPct);
    return NextResponse.json({ ok: true, report: rep });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message ?? "error" }, { status: 500 });
  }
}
