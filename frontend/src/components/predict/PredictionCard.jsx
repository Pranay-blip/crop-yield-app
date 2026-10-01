import { AlertTriangle } from "lucide-react";

function fmt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function YieldGauge({ value, low, high, refLow, refHigh, refAvg }) {
  // Draw a horizontal bullet chart:
  // Below zone | Typical zone | Above zone
  // with three markers: low interval, prediction, high interval
  const minVal = Math.min(0, refLow * 0.5);
  const maxVal = Math.max(refHigh * 1.5, high * 1.2, value * 1.2);
  const range = maxVal - minVal;
  const pct = v => `${Math.min(100, Math.max(0, ((v - minVal) / range) * 100)).toFixed(1)}%`;

  return (
    <div className="gauge-wrap" role="img" aria-label={`Yield gauge: ${value} t/ha`}>
      <div style={{ position: "relative", height: 36, borderRadius: 6, background: "var(--bg-elevated)", overflow: "hidden" }}>
        {/* typical zone highlight */}
        <div style={{
          position: "absolute", top: 0, bottom: 0,
          left: pct(refLow), width: `calc(${pct(refHigh)} - ${pct(refLow)})`,
          background: "rgba(59,130,246,.18)",
        }} />
        {/* average line */}
        <div style={{
          position: "absolute", top: 0, bottom: 0, width: 2,
          left: pct(refAvg), background: "var(--accent-blue)", opacity: .6,
        }} />
        {/* interval bar */}
        <div style={{
          position: "absolute", top: "30%", bottom: "30%",
          left: pct(low), width: `calc(${pct(high)} - ${pct(low)})`,
          background: "rgba(34,197,94,.25)", borderRadius: 3,
        }} />
        {/* prediction marker */}
        <div style={{
          position: "absolute", top: "15%", bottom: "15%", width: 4,
          left: `calc(${pct(value)} - 2px)`,
          background: "var(--accent)", borderRadius: 2,
          boxShadow: "0 0 8px var(--accent)",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: ".7rem", color: "var(--text-faint)" }}>
        <span>Below typical</span>
        <span>Typical range ({fmt(refLow)}–{fmt(refHigh)})</span>
        <span>Above typical</span>
      </div>
    </div>
  );
}

export function PredictionCard({ result }) {
  if (!result) return null;
  const { prediction, unit, interval, reference, vs_average_pct, rating, baseline_prediction, warnings } = result;

  const ratingClass =
    rating === "Above typical" ? "badge-above"
    : rating === "Typical"     ? "badge-typical"
    : "badge-below";

  const disagree =
    baseline_prediction != null
      ? Math.abs(((baseline_prediction - prediction) / Math.max(prediction, 0.001)) * 100).toFixed(0)
      : null;

  return (
    <div className="card fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card-header">
        <span className="card-title">🌾 Predicted Yield (PSO-ANN)</span>
        <span className={`badge ${ratingClass}`}>{rating}</span>
      </div>

      {/* Big number */}
      <div>
        <div className="yield-number">{fmt(prediction)}</div>
        <div className="yield-unit">{unit} &nbsp;|&nbsp; 80% range: {fmt(interval.low)} – {fmt(interval.high)}</div>
      </div>

      {/* Gauge */}
      <YieldGauge
        value={prediction}
        low={interval.low}
        high={interval.high}
        refLow={reference.typical_low}
        refHigh={reference.typical_high}
        refAvg={reference.average}
      />

      {/* vs average */}
      {vs_average_pct != null && (
        <div style={{ fontSize: ".85rem", color: "var(--text-muted)" }}>
          {vs_average_pct >= 0 ? "+" : ""}{vs_average_pct}% vs {reference.label} average ({fmt(reference.average)} {unit})
        </div>
      )}

      <div className="divider" style={{ margin: "4px 0" }} />

      {/* Model comparison row */}
      <div className="model-compare-row">
        <div className="model-cell pso">
          <div className="model-cell-label">PSO-ANN</div>
          <div className="model-cell-value">{fmt(prediction)} <small style={{ fontSize: ".7rem", color: "var(--text-muted)" }}>{unit}</small></div>
          <div style={{ fontSize: ".7rem", color: "var(--text-faint)", marginTop: 2 }}>6 of 8 features</div>
        </div>
        <div className="model-cell baseline">
          <div className="model-cell-label">Baseline ANN</div>
          <div className="model-cell-value" style={{ color: baseline_prediction != null ? "var(--text-primary)" : "var(--text-faint)" }}>
            {baseline_prediction != null ? fmt(baseline_prediction) : "—"} <small style={{ fontSize: ".7rem", color: "var(--text-muted)" }}>{baseline_prediction != null ? unit : ""}</small>
          </div>
          <div style={{ fontSize: ".7rem", color: "var(--text-faint)", marginTop: 2 }}>
            {baseline_prediction != null ? "8 of 8 features" : "Add Rainfall & Pesticide"}
          </div>
        </div>
      </div>

      {/* Disagreement notice */}
      {disagree != null && Number(disagree) >= 20 && (
        <div className="warning-banner">
          <AlertTriangle size={14} color="var(--accent-warn)" style={{ flexShrink: 0, marginTop: 2 }} />
          <p>The two models disagree by <strong>{disagree}%</strong>. A large gap signals higher uncertainty — treat this estimate with extra caution.</p>
        </div>
      )}

      {/* Warnings */}
      {warnings && warnings.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {warnings.map((w, i) => (
            <div key={i} className="warning-banner" role="alert">
              <AlertTriangle size={14} color="var(--accent-warn)" style={{ flexShrink: 0, marginTop: 2 }} />
              <p>{w}</p>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: ".72rem", color: "var(--text-faint)", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        Used features: {result.used_features.join(", ")} &nbsp;·&nbsp; R² ≈ 0.928 (log scale)
      </div>
    </div>
  );
}
