import { useState, useEffect, useMemo } from "react";
import { TrendingUp, TrendingDown, IndianRupee, Info } from "lucide-react";
import { getCropPrices } from "../../api/client";

// ── Formatting helpers ──────────────────────────────────────────────────────
function fmtINR(n) {
  const abs = Math.abs(n);
  if (abs >= 1e7)  return `${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5)  return `${(n / 1e5).toFixed(2)} L`;
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtNum(n, decimals = 0) {
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function CostInput({ label, value, onChange, prefix = "₹", hint }) {
  return (
    <div className="cost-input-wrap">
      <label className="form-label">{label}</label>
      <div className="cost-input-inner">
        <span className="cost-prefix">{prefix}</span>
        <input
          type="number"
          className="form-control"
          value={value}
          min={0}
          onChange={e => onChange(Number(e.target.value))}
          style={{ paddingLeft: 22 }}
        />
      </div>
      {hint && <span className="form-hint">{hint}</span>}
    </div>
  );
}

function StatCard({ label, value, sub, className = "" }) {
  return (
    <div className={`stat-card ${className}`}>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">₹{fmtINR(value)}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}

export function EconomicsPanel({ result, selectedCrop }) {
  const [priceData,    setPriceData]    = useState(null);
  const [marketPrice,  setMarketPrice]  = useState(null);
  const [fertCost,     setFertCost]     = useState(15);
  const [otherCostHa,  setOtherCostHa]  = useState(12000);

  // Load default prices once
  useEffect(() => {
    getCropPrices().then(r => {
      setPriceData(r.data);
      const defaults = r.data.defaults;
      setFertCost(defaults.fertilizer_cost_per_kg);
      setOtherCostHa(defaults.other_cost_per_ha);
    }).catch(() => {});
  }, []);

  // When crop or price data changes, update market price
  useEffect(() => {
    if (priceData && selectedCrop) {
      setMarketPrice(priceData.prices[selectedCrop] ?? 20000);
    }
  }, [priceData, selectedCrop]);

  const economics = useMemo(() => {
    if (!result || marketPrice == null) return null;
    const { prediction, unit } = result;
    const area       = Number(result.used_features ? 0 : 0); // not used directly
    // We derive area from the result interval approach, but it's not in result.
    // We'll accept area as a prop from parent below.
    return null; // placeholder – see note below
  }, [result, marketPrice]);

  if (!result) return null;

  return null; // stub — see EconomicsPanelFull below
}

// ── Full component (receives area + fertilizer separately) ──────────────────
export function EconomicsPanelFull({ result, selectedCrop, area, fertilizer }) {
  const [priceData,   setPriceData]   = useState(null);
  const [marketPrice, setMarketPrice] = useState(null);
  const [fertCost,    setFertCost]    = useState(15);
  const [otherCostHa, setOtherCostHa] = useState(12000);
  const [showInfo,    setShowInfo]    = useState(false);

  useEffect(() => {
    getCropPrices().then(r => {
      setPriceData(r.data);
      setFertCost(r.data.defaults.fertilizer_cost_per_kg);
      setOtherCostHa(r.data.defaults.other_cost_per_ha);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (priceData && selectedCrop) {
      setMarketPrice(priceData.prices[selectedCrop] ?? 20000);
    }
  }, [priceData, selectedCrop]);

  const econ = useMemo(() => {
    if (!result || marketPrice == null || !area) return null;
    const yieldPerHa       = result.prediction;
    const totalProduction  = yieldPerHa * area;
    const grossRevenue     = totalProduction * marketPrice;
    const fertilizerSpend  = fertilizer * fertCost;
    const otherSpend       = area * otherCostHa;
    const totalCost        = fertilizerSpend + otherSpend;
    const netProfit        = grossRevenue - totalCost;
    const roi              = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;
    const breakevenYield   = (area * marketPrice) > 0 ? totalCost / (area * marketPrice) : 0;
    const isProfit         = netProfit >= 0;
    return { yieldPerHa, totalProduction, grossRevenue, fertilizerSpend, otherSpend, totalCost, netProfit, roi, breakevenYield, isProfit };
  }, [result, marketPrice, area, fertilizer, fertCost, otherCostHa]);

  if (!result) return null;

  const beStatus = econ
    ? (result.prediction >= econ.breakevenYield * 1.2 ? "ok"
       : result.prediction >= econ.breakevenYield      ? "warn"
       : "bad")
    : "warn";

  return (
    <div className="card fade-in" style={{ marginTop: 20 }}>
      <div className="card-header">
        <span className="card-title">
          <IndianRupee size={15} />
          Profitability Analysis
        </span>
        <button className="btn-icon" onClick={() => setShowInfo(v => !v)} title="About these numbers" id="econ-info-btn">
          <Info size={14} />
        </button>
      </div>

      {showInfo && (
        <div className="warning-banner" style={{ marginBottom: 12 }}>
          <Info size={14} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
          <p style={{ color: "var(--text-muted)" }}>
            Market prices are India MSP / market averages for 2019-20. Costs are rough national averages.
            Adjust the inputs below to match your local conditions.
            <strong> These are estimates — actual returns depend on moisture, pest pressure, logistics, and market timing.</strong>
          </p>
        </div>
      )}

      {/* Editable assumptions */}
      <div className="cost-inputs-grid">
        <CostInput
          label="Market Price (₹/ton)"
          value={marketPrice ?? ""}
          onChange={setMarketPrice}
          prefix="₹"
          hint={`${selectedCrop} — MSP/market avg`}
        />
        <CostInput
          label="Fertilizer Cost"
          value={fertCost}
          onChange={setFertCost}
          prefix="₹"
          hint="per kg (blended NPK)"
        />
        <CostInput
          label="Other Costs"
          value={otherCostHa}
          onChange={setOtherCostHa}
          prefix="₹"
          hint="per ha (seed, labour, irrigation)"
        />
      </div>

      {econ ? (
        <>
          {/* Production summary line */}
          <div style={{ fontSize: ".82rem", color: "var(--text-muted)", marginBottom: 12, padding: "8px 12px", background: "var(--bg-elevated)", borderRadius: "var(--r-md)" }}>
            <strong style={{ color: "var(--text-primary)" }}>{fmtNum(area)} ha</strong>
            {" × "}
            <strong style={{ color: "var(--accent)" }}>{result.prediction} t/ha</strong>
            {" = "}
            <strong style={{ color: "var(--text-primary)" }}>{fmtNum(econ.totalProduction, 1)} tons total</strong>
            {" × ₹"}
            <strong style={{ color: "var(--text-primary)" }}>{fmtNum(marketPrice)}/ton</strong>
          </div>

          {/* Stat cards */}
          <div className="stat-cards-row">
            <StatCard label="Gross Revenue" value={econ.grossRevenue} sub={`${fmtNum(econ.totalProduction, 1)} tons`} />
            <StatCard label="Fertilizer Spend" value={econ.fertilizerSpend} sub={`₹${fertCost}/kg`} />
            <StatCard label="Other Costs" value={econ.otherSpend} sub={`₹${fmtNum(otherCostHa)}/ha`} />
            <StatCard
              label={econ.isProfit ? "Net Profit 🟢" : "Net Loss 🔴"}
              value={econ.netProfit}
              sub={`ROI: ${econ.roi.toFixed(1)}%`}
              className={econ.isProfit ? "profit-pos" : "profit-neg"}
            />
          </div>

          {/* Break-even indicator */}
          <div className="breakeven-row">
            <span style={{ color: "var(--text-muted)" }}>Break-even yield:</span>
            <span className={`breakeven-pill ${beStatus}`}>{econ.breakevenYield.toFixed(2)} t/ha</span>
            <span style={{ color: "var(--text-faint)", fontSize: ".78rem" }}>
              {beStatus === "ok"   && `✓ Your predicted yield (${result.prediction} t/ha) comfortably covers costs`}
              {beStatus === "warn" && `⚠ Predicted yield barely meets break-even — high risk`}
              {beStatus === "bad"  && `✗ Predicted yield (${result.prediction} t/ha) does not cover costs at this price`}
            </span>
          </div>
        </>
      ) : (
        <div className="state-box" style={{ padding: "20px 0" }}>
          <span style={{ fontSize: "1.5rem" }}>⏳</span>
          <p>Loading market price data…</p>
        </div>
      )}

      <p className="price-source-note">
        💡 Prices: India CACP MSP 2019-20 for notified crops; market averages for others. Costs are national averages — actual costs vary by region and scale.
      </p>
    </div>
  );
}
