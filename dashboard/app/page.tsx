"use client";

import { useEffect, useState } from "react";

interface Portfolio {
  cash: number;
  invested: number;
  equity: number;
  startingBalance: number;
  totalReturnPct: number;
  positions: any[];
  closedTrades: any[];
  equityCurve: { t: string; equity: number }[];
  log: string[];
}
interface Overview {
  stocks: any[];
  currency: any[];
}

const inr = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const inr2 = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function EquityCurve({ data }: { data: { t: string; equity: number }[] }) {
  if (!data || data.length < 2) {
    return <div className="empty">No equity data yet — place a paper trade to start the curve.</div>;
  }
  const w = 640, h = 220, pad = 20;
  const vals = data.map((d) => d.equity);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const x = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.equity).toFixed(1)}`).join(" ");
  const area = `${pad},${h - pad} ${pts} ${x(data.length - 1).toFixed(1)},${h - pad}`;
  const up = vals[vals.length - 1] >= vals[0];
  const color = up ? "var(--green)" : "var(--red)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="220" preserveAspectRatio="none">
      <polygon points={area} fill={color} opacity="0.08" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
      <line x1={pad} y1={y(vals[0])} x2={w - pad} y2={y(vals[0])} stroke="var(--border)" strokeDasharray="3 3" />
    </svg>
  );
}

export default function Page() {
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [ov, setOv] = useState<Overview | null>(null);

  const load = async () => {
    try {
      const [p, o] = await Promise.all([
        fetch("/api/portfolio").then((r) => r.json()),
        fetch("/api/overview").then((r) => r.json()),
      ]);
      setPf(p);
      setOv(o);
    } catch {}
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(id);
  }, []);

  const ret = pf?.totalReturnPct ?? 0;

  // ---- trade panel state ----
  const [form, setForm] = useState({
    symbol: "RELIANCE.NS",
    side: "long",
    qty: "",
    stopLoss: "",
    takeProfit: "",
  });
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const doResearch = async () => {
    if (!form.symbol) return;
    setBusy(true);
    setFlash(null);
    try {
      const r = await fetch(`/api/research?symbol=${encodeURIComponent(form.symbol)}&equity=${pf?.equity ?? 100000}&riskPct=1`).then((x) => x.json());
      if (!r.ok) throw new Error(r.message);
      const rep = r.report;
      setForm((f) => ({
        ...f,
        side: rep.suggestedAction === "flat" ? f.side : rep.suggestedAction,
        qty: rep.suggestedQty ? String(rep.suggestedQty) : f.qty,
        stopLoss: rep.stopLoss ? rep.stopLoss.toFixed(2) : "",
        takeProfit: rep.takeProfit ? rep.takeProfit.toFixed(2) : "",
      }));
      setFlash({ ok: rep.suggestedAction !== "flat", msg: rep.reasoning });
    } catch (e: any) {
      setFlash({ ok: false, msg: e.message });
    }
    setBusy(false);
  };

  const doTrade = async (action: "open" | "reset", extra: any = {}) => {
    setBusy(true);
    setFlash(null);
    try {
      const payload =
        action === "open"
          ? { action: "open", symbol: form.symbol, side: form.side, qty: Number(form.qty), stopLoss: Number(form.stopLoss) || undefined, takeProfit: Number(form.takeProfit) || undefined, strategy: "manual-ui" }
          : { action: "reset", ...extra };
      const r = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((x) => x.json());
      setFlash({ ok: r.ok, msg: r.message });
      if (r.ok) await load();
    } catch (e: any) {
      setFlash({ ok: false, msg: e.message });
    }
    setBusy(false);
  };

  const closePos = async (symbol: string) => {
    setBusy(true);
    const r = await fetch("/api/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close", symbol }),
    }).then((x) => x.json());
    setFlash({ ok: r.ok, msg: r.message });
    setBusy(false);
    await load();
  };

  return (
    <div className="container">
      <div className="grid stats">
        <div className="card stat">
          <div className="label">Total Equity</div>
          <div className="value">{pf ? inr(pf.equity) : "—"}</div>
          <div className={`sub ${ret >= 0 ? "up" : "down"}`}>
            {ret >= 0 ? "▲" : "▼"} {Math.abs(ret).toFixed(2)}% all time
          </div>
        </div>
        <div className="card stat">
          <div className="label">Cash</div>
          <div className="value">{pf ? inr(pf.cash) : "—"}</div>
          <div className="sub" style={{ color: "var(--muted)" }}>Free margin</div>
        </div>
        <div className="card stat">
          <div className="label">Invested (MtM)</div>
          <div className="value">{pf ? inr(pf.invested) : "—"}</div>
          <div className="sub" style={{ color: "var(--muted)" }}>{pf?.positions.length ?? 0} open</div>
        </div>
        <div className="card stat">
          <div className="label">Realized P&L (recent)</div>
          <div
            className="value"
          >
            {(() => {
              const sum = (pf?.closedTrades ?? []).reduce((a, t) => a + (t.pnl ?? 0), 0);
              return <span className={sum >= 0 ? "up" : "down"}>{inr2(sum)}</span>;
            })()}
          </div>
          <div className="sub" style={{ color: "var(--muted)" }}>{pf?.closedTrades.length ?? 0} closed trades</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Paper Trade · demo (no real money)</h2>
        <div className="trade-row">
          <div className="field">
            <label>Symbol</label>
            <input value={form.symbol} onChange={(e) => set("symbol", e.target.value.toUpperCase())} placeholder="RELIANCE.NS or USDINR=X" />
          </div>
          <div className="field">
            <label>Side</label>
            <div className="seg">
              <button className={form.side === "long" ? "seg-btn active long" : "seg-btn"} onClick={() => set("side", "long")}>LONG</button>
              <button className={form.side === "short" ? "seg-btn active short" : "seg-btn"} onClick={() => set("side", "short")}>SHORT</button>
            </div>
          </div>
          <div className="field">
            <label>Qty</label>
            <input value={form.qty} onChange={(e) => set("qty", e.target.value)} placeholder="0" inputMode="numeric" />
          </div>
          <div className="field">
            <label>Stop-loss</label>
            <input value={form.stopLoss} onChange={(e) => set("stopLoss", e.target.value)} placeholder="optional" inputMode="decimal" />
          </div>
          <div className="field">
            <label>Take-profit</label>
            <input value={form.takeProfit} onChange={(e) => set("takeProfit", e.target.value)} placeholder="optional" inputMode="decimal" />
          </div>
          <div className="field field-btn">
            <button className="btn ghost" onClick={doResearch} disabled={busy}>🔬 Research</button>
            <button className="btn primary" onClick={() => doTrade("open")} disabled={busy || !form.qty}>Place trade</button>
          </div>
        </div>
        <div className="trade-actions">
          <button className="btn danger" onClick={() => doTrade("reset", { balance: 100000 })} disabled={busy}>↺ Reset demo (₹1,00,000)</button>
        </div>
        {flash && <div className={`flash ${flash.ok ? "ok" : "bad"}`}>{flash.msg}</div>}
      </div>

      <div className="grid two">
        <div className="card chart-wrap">
          <h2>Equity Curve</h2>
          <EquityCurve data={pf?.equityCurve ?? []} />
        </div>

        <div className="card">
          <h2>Activity Log</h2>
          {(pf?.log ?? []).length === 0 ? (
            <div className="empty">No activity yet.</div>
          ) : (
            <div style={{ fontSize: 12, lineHeight: 1.9, color: "var(--muted)" }}>
              {pf?.log.slice(0, 12).map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Open Positions</h2>
        {(pf?.positions ?? []).length === 0 ? (
          <div className="empty">No open positions. Ask Claude to research & paper-trade a symbol.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Symbol</th><th>Side</th><th className="num">Qty</th>
                <th className="num">Entry</th><th className="num">Mark</th>
                <th className="num">Unrealized</th><th>Strategy</th><th></th>
              </tr>
            </thead>
            <tbody>
              {pf?.positions.map((p) => (
                <tr key={p.symbol}>
                  <td>{p.symbol}</td>
                  <td><span className={`pill ${p.side}`}>{p.side.toUpperCase()}</span></td>
                  <td className="num">{p.qty}</td>
                  <td className="num">{inr2(p.entryPrice)}</td>
                  <td className="num">{inr2(p.markPrice)}</td>
                  <td className={`num ${p.unrealizedPnl >= 0 ? "up" : "down"}`}>{inr2(p.unrealizedPnl)}</td>
                  <td style={{ color: "var(--muted)" }}>{p.strategy ?? "—"}</td>
                  <td><button className="btn mini" onClick={() => closePos(p.symbol)} disabled={busy}>Close</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Closed Trades</h2>
        {(pf?.closedTrades ?? []).length === 0 ? (
          <div className="empty">No closed trades yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Symbol</th><th>Side</th><th className="num">Qty</th>
                <th className="num">Entry</th><th className="num">Exit</th>
                <th className="num">P&L</th><th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {pf?.closedTrades.map((t) => (
                <tr key={t.id}>
                  <td>{t.symbol}</td>
                  <td><span className={`pill ${t.side}`}>{t.side.toUpperCase()}</span></td>
                  <td className="num">{t.qty}</td>
                  <td className="num">{inr2(t.entryPrice)}</td>
                  <td className="num">{t.exitPrice ? inr2(t.exitPrice) : "—"}</td>
                  <td className={`num ${(t.pnl ?? 0) >= 0 ? "up" : "down"}`}>{inr2(t.pnl ?? 0)}</td>
                  <td style={{ color: "var(--muted)" }}>{t.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Market Watch · Stocks (NSE)</h2>
          <table>
            <thead><tr><th>Symbol</th><th className="num">Price</th><th className="num">1D %</th></tr></thead>
            <tbody>
              {(ov?.stocks ?? []).map((s) => (
                <tr key={s.symbol}>
                  <td>{s.symbol.replace(".NS", "")}</td>
                  <td className="num">{inr2(s.price)}</td>
                  <td className={`num ${s.changePct >= 0 ? "up" : "down"}`}>{s.changePct.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Market Watch · Currency (CDS · legal FX)</h2>
          <table>
            <thead><tr><th>Pair</th><th className="num">Rate</th><th className="num">1D %</th></tr></thead>
            <tbody>
              {(ov?.currency ?? []).map((s) => (
                <tr key={s.symbol}>
                  <td>{s.symbol.replace("=X", "")}</td>
                  <td className="num">{s.price.toFixed(2)}</td>
                  <td className={`num ${s.changePct >= 0 ? "up" : "down"}`}>{s.changePct.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="footer">
        <strong>Legal (India · FEMA/RBI):</strong> this connector only trades SEBI-exchange instruments — NSE/BSE
        shares and CDS currency derivatives (USD/INR, EUR/INR, GBP/INR, JPY/INR). Offshore forex brokers are not
        supported as they are illegal for Indian residents. Data: Yahoo Finance (free). Broker for real orders:
        Angel One SmartAPI (free, SEBI-registered). ⚠️ Nothing here is financial advice.
      </div>
    </div>
  );
}
