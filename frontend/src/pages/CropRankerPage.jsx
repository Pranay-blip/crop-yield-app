import { useState, useEffect, useMemo } from "react";
import { Play, X, ArrowUpDown, TrendingUp, TrendingDown } from "lucide-react";
import { getSchema, getCropPrices, postCompareCrops } from "../api/client";
import { ChartSkeleton } from "../components/shared/Skeleton";
import { ErrorState } from "../components/shared/ErrorState";

// ── Formatting helpers ────────────────────────────────────────────────────
function fmtINR(n) {
  const abs = Math.abs(n);
  if (abs >= 1e7)  return `${(n/1e7).toFixed(2)} Cr`;
  if (abs >= 1e5)  return `${(n/1e5).toFixed(2)} L`;
  if (abs >= 1e3)  return `${(n/1e3).toFixed(1)} K`;
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtNum(n, d=0) {
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
}

const SORT_KEYS = [
  { key: "net_profit",  label: "Net Profit" },
  { key: "roi_pct",     label: "ROI %" },
  { key: "yield_per_ha",label: "Yield" },
  { key: "gross_revenue",label: "Revenue" },
];

// ── Small form (no Crop selector) ─────────────────────────────────────────
function RankerForm({ schema, onRun, loading, priceDefaults }) {
  const nonCropFields = schema ? schema.required.filter(f => f.name !== "Crop") : [];
  const [values, setValues] = useState({});
  const [fertCost,    setFertCost]    = useState(priceDefaults?.fertilizer_cost_per_kg ?? 15);
  const [otherCostHa, setOtherCostHa] = useState(priceDefaults?.other_cost_per_ha ?? 12000);

  useEffect(() => {
    if (!schema) return;
    const d = {};
    schema.required.forEach(f => { if (f.name !== "Crop") d[f.name] = f.default; });
    setValues(d);
  }, [schema]);

  useEffect(() => {
    if (priceDefaults) {
      setFertCost(priceDefaults.fertilizer_cost_per_kg);
      setOtherCostHa(priceDefaults.other_cost_per_ha);
    }
  }, [priceDefaults]);

  function set(name, val) { setValues(v => ({ ...v, [name]: val })); }

  function handleRun(e) {
    e.preventDefault();
    onRun(values, fertCost, otherCostHa);
  }

  if (!schema) return <ChartSkeleton h={320} />;

  return (
    <form onSubmit={handleRun} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {nonCropFields.map(f => {
        if (f.type === "select") {
          return (
            <div key={f.name} className="form-group">
              <label className="form-label" htmlFor={`ranker-${f.name}`}>{f.label}</label>
              <select id={`ranker-${f.name}`} className="form-control" value={values[f.name] ?? f.default} onChange={e => set(f.name, e.target.value)}>
                {f.options.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          );
        }
        return (
          <div key={f.name} className="form-group">
            <label className="form-label" htmlFor={`ranker-${f.name}`}>{f.label}</label>
            <input
              id={`ranker-${f.name}`}
              type="number"
              className="form-control"
              value={values[f.name] ?? f.default}
              onChange={e => set(f.name, parseFloat(e.target.value) || 0)}
            />
            <span className="form-hint">Typical: {fmtNum(f.typical_low)} – {fmtNum(f.typical_high)}</span>
          </div>
        );
      })}

      <div className="divider" />

      <div className="form-group">
        <label className="form-label" htmlFor="ranker-fert-cost">Fertilizer Cost (₹/kg)</label>
        <input id="ranker-fert-cost" type="number" className="form-control" value={fertCost} min={0} onChange={e => setFertCost(Number(e.target.value))} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="ranker-other-cost">Other Costs (₹/ha)</label>
        <input id="ranker-other-cost" type="number" className="form-control" value={otherCostHa} min={0} onChange={e => setOtherCostHa(Number(e.target.value))} />
        <span className="form-hint">Seed + labour + irrigation per hectare</span>
      </div>

      <button id="ranker-run-btn" type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 4 }}>
        {loading ? <><span className="spinner" /> Ranking all crops…</> : <><Play size={14} /> Compare All Crops</>}
      </button>
    </form>
  );
}

// ── Ranked bar list ────────────────────────────────────────────────────────
function RankerList({ results, sortKey, selectedCrop, onSelect, maxAbsProfit }) {
  const sorted = useMemo(() => {
    return [...results].sort((a,b) => b[sortKey] - a[sortKey]);
  }, [results, sortKey]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {sorted.map((r, idx) => {
        const isProfit = r.net_profit >= 0;
        const barPct   = Math.abs(r[sortKey]) / Math.max(...sorted.map(s => Math.abs(s[sortKey]))) * 100;
        const isSelected = r.crop === selectedCrop;
        const rankLabel =
          idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx+1}`;
        const rankClass =
          idx === 0 ? "gold" : idx === 1 ? "silver" : idx === 2 ? "bronze" : "";

        const displayValue =
          sortKey === "net_profit"   ? `${isProfit ? "+" : ""}₹${fmtINR(r.net_profit)}`
          : sortKey === "roi_pct"    ? `${r.roi_pct >= 0 ? "+" : ""}${r.roi_pct.toFixed(1)}%`
          : sortKey === "yield_per_ha" ? `${r.yield_per_ha} t/ha`
          : `₹${fmtINR(r.gross_revenue)}`;

        const fillColor =
          sortKey === "net_profit" || sortKey === "roi_pct"
            ? (r[sortKey] >= 0 ? "var(--accent)" : "var(--accent-danger)")
            : "var(--accent-blue)";

        return (
          <div
            key={r.crop}
            id={`ranker-row-${r.crop.replace(/[\s()&]/g, "-")}`}
            className={`ranker-bar-row ${isSelected ? "current-crop" : ""}`}
            onClick={() => onSelect(r.crop === selectedCrop ? null : r.crop)}
            style={{ padding: "6px 8px" }}
          >
            <span className={`ranker-rank ${rankClass}`}>{rankLabel}</span>
            <span className="ranker-crop-name" title={r.crop}>{r.crop}</span>
            <div className="ranker-bar-track">
              <div className="ranker-bar-fill" style={{ width: `${barPct}%`, background: fillColor, opacity: isSelected ? 1 : 0.75 }} />
            </div>
            <span className="ranker-profit-label" style={{ color: r[sortKey] >= 0 ? "var(--accent)" : "var(--accent-danger)" }}>
              {displayValue}
            </span>
            <span className="ranker-roi" style={{ color: r.roi_pct >= 0 ? "var(--text-muted)" : "var(--accent-danger)" }}>
              {r.roi_pct.toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Detail drawer ──────────────────────────────────────────────────────────
function DetailDrawer({ crop, onClose }) {
  if (!crop) return null;
  return (
    <div className="detail-drawer">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3>🌾 {crop.crop}</h3>
        <button className="btn-icon" onClick={onClose} id="detail-close-btn"><X size={14} /></button>
      </div>
      <div className="detail-grid">
        {[
          ["Yield", `${crop.yield_per_ha} t/ha`],
          ["Total Production", `${fmtNum(crop.total_production, 0)} tons`],
          ["Market Price", `₹${fmtNum(crop.price_per_ton)}/ton`],
          ["Gross Revenue", `₹${fmtINR(crop.gross_revenue)}`],
          ["Fertilizer Cost", `₹${fmtINR(crop.fertilizer_spend)}`],
          ["Other Costs", `₹${fmtINR(crop.other_spend)}`],
          ["Total Cost", `₹${fmtINR(crop.total_cost)}`],
          ["Net Profit", `${crop.net_profit >= 0 ? "+" : ""}₹${fmtINR(crop.net_profit)}`],
          ["ROI", `${crop.roi_pct.toFixed(1)}%`],
          ["Break-even Yield", `${crop.breakeven_yield.toFixed(2)} t/ha`],
          ["Rating", crop.rating],
          ["Interval (80%)", `${crop.interval.low}–${crop.interval.high} t/ha`],
        ].map(([label, val]) => (
          <div key={label} className="detail-cell">
            <div className="detail-cell-label">{label}</div>
            <div className="detail-cell-value" style={{
              color: label === "Net Profit"
                ? (crop.net_profit >= 0 ? "var(--accent)" : "var(--accent-danger)")
                : "var(--text-primary)"
            }}>{val}</div>
          </div>
        ))}
      </div>
      {crop.warnings?.length > 0 && (
        <p style={{ marginTop: 10, fontSize: ".75rem", color: "var(--accent-warn)" }}>
          ⚠ {crop.warnings.join(" · ")}
        </p>
      )}
    </div>
  );
}

// ── Summary stats strip ────────────────────────────────────────────────────
function SummaryStrip({ data }) {
  const profitable = data.results.filter(r => r.net_profit > 0).length;
  const best = data.results[0];
  const worst = data.results[data.results.length - 1];
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
      {[
        { label: "Total crops ranked", val: data.results.length, color: "var(--text-primary)" },
        { label: "Profitable crops", val: profitable, color: "var(--accent)" },
        { label: "Fixed costs", val: `₹${fmtINR(data.total_fixed_cost)}`, color: "var(--text-primary)" },
        { label: "Best crop", val: best?.crop, color: "var(--accent)" },
        { label: "Worst crop", val: worst?.crop, color: "var(--accent-danger)" },
      ].map(({ label, val, color }) => (
        <div key={label} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "8px 14px", fontSize: ".78rem" }}>
          <span style={{ color: "var(--text-faint)" }}>{label}: </span>
          <span style={{ color, fontWeight: 600 }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function CropRankerPage() {
  const [schema,      setSchema]      = useState(null);
  const [priceData,   setPriceData]   = useState(null);
  const [results,     setResults]     = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [err,         setErr]         = useState(null);
  const [sortKey,     setSortKey]     = useState("net_profit");
  const [selectedCrop, setSelectedCrop] = useState(null);

  useEffect(() => {
    Promise.all([getSchema(), getCropPrices()])
      .then(([s, p]) => { setSchema(s.data); setPriceData(p.data); })
      .catch(() => setErr("Failed to load schema or price data."));
  }, []);

  async function handleRun(inputs, fertCostPerKg, otherCostPerHa) {
    setLoading(true);
    setErr(null);
    setSelectedCrop(null);
    try {
      const r = await postCompareCrops({ inputs, fertilizer_cost_per_kg: fertCostPerKg, other_cost_per_ha: otherCostPerHa });
      setResults(r.data);
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  }

  const selectedDetail = results?.results?.find(r => r.crop === selectedCrop) ?? null;

  if (err && !schema) return <ErrorState message={err} />;

  return (
    <>
      <div className="page-heading">
        <h1>Crop Ranker</h1>
        <p>
          Set your season, state, area, and fertilizer — then rank <strong>all 54 crops</strong> by predicted net profit,
          ROI, yield, or revenue under identical conditions.
        </p>
      </div>

      <div className="ranker-layout">
        {/* ── Left: form ── */}
        <div className="card" style={{ position: "sticky", top: 16 }}>
          <div className="card-header">
            <span className="card-title">⚙️ Conditions</span>
          </div>
          <RankerForm
            schema={schema}
            onRun={handleRun}
            loading={loading}
            priceDefaults={priceData?.defaults}
          />
        </div>

        {/* ── Right: results ── */}
        <div>
          {!results && !loading && (
            <div className="card">
              <div className="state-box" style={{ padding: "40px 24px" }}>
                <span style={{ fontSize: "3rem" }}>🌾</span>
                <h3>Ready to rank</h3>
                <p>Set your conditions on the left and click <strong>Compare All Crops</strong> to see every crop ranked by profitability.</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="card">
              <div className="state-box">
                <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
                <p style={{ color: "var(--text-muted)" }}>Running predictions for all 54 crops…</p>
              </div>
            </div>
          )}

          {err && <ErrorState message={err} />}

          {results && !loading && (
            <>
              <SummaryStrip data={results} />

              {selectedDetail && (
                <DetailDrawer crop={selectedDetail} onClose={() => setSelectedCrop(null)} />
              )}

              <div className="card">
                <div className="card-header">
                  <span className="card-title">📊 Ranked by</span>
                  <div className="ranker-sort-toggle">
                    {SORT_KEYS.map(s => (
                      <button
                        key={s.key}
                        id={`sort-by-${s.key}`}
                        className={`btn btn-ghost${sortKey === s.key ? " active" : ""}`}
                        style={{ padding: "5px 12px", fontSize: ".72rem" }}
                        onClick={() => setSortKey(s.key)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Column headers */}
                <div style={{ display: "flex", gap: 10, padding: "4px 8px 8px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
                  <span style={{ width: 26, fontSize: ".7rem", color: "var(--text-faint)" }}>#</span>
                  <span style={{ width: 130, fontSize: ".7rem", color: "var(--text-faint)" }}>Crop</span>
                  <span style={{ flex: 1, fontSize: ".7rem", color: "var(--text-faint)" }}>Bar</span>
                  <span style={{ width: 90, textAlign: "right", fontSize: ".7rem", color: "var(--text-faint)" }}>Value</span>
                  <span style={{ width: 52, textAlign: "right", fontSize: ".7rem", color: "var(--text-faint)" }}>ROI</span>
                </div>

                <RankerList
                  results={results.results}
                  sortKey={sortKey}
                  selectedCrop={selectedCrop}
                  onSelect={setSelectedCrop}
                  maxAbsProfit={Math.max(...results.results.map(r => Math.abs(r.net_profit)))}
                />

                <p style={{ marginTop: 12, fontSize: ".72rem", color: "var(--text-faint)", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  Click any row to see the full breakdown. ROI = Net Profit ÷ Fixed Costs × 100. Prices: India MSP / market averages 2019-20.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
