import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ErrorBar, ResponsiveContainer, Cell } from "recharts";
import { getMetrics } from "../api/client";
import { ChartSkeleton } from "../components/shared/Skeleton";
import { ErrorState } from "../components/shared/ErrorState";

const METRIC_OPTS = [
  { key: "rmse_log", label: "RMSE (log)", lower_is_better: true },
  { key: "r2_log",   label: "R² (log)",   lower_is_better: false },
  { key: "mae",      label: "MAE",        lower_is_better: true },
];

// Static crop-average baseline (not in metrics.json — from context section 2)
const STATIC_BASELINE = { rmse_log: 0.4398, r2_log: 0.730, mae: 2.380 };

const MODEL_ORDER = ["Crop-avg Baseline", "Linear Regression", "Random Forest", "Baseline ANN", "PSO-ANN"];
const MODEL_COLORS = {
  "Crop-avg Baseline": "var(--accent-muted)",
  "Linear Regression": "#a78bfa",
  "Random Forest":     "var(--accent-warn)",
  "Baseline ANN":      "var(--accent-blue)",
  "PSO-ANN":           "var(--accent)",
};

const CustomTooltip = ({ active, payload, label, metric }) => {
  if (!active || !payload?.length) return null;
  const m = METRIC_OPTS.find(o => o.key === metric);
  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "8px 14px", fontSize: ".8rem" }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--text-primary)" }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color }}>{m?.label}: {Number(p.value).toFixed(4)}</div>
      ))}
    </div>
  );
};

export default function ModelComparisonPage() {
  const [data, setData]     = useState(null);
  const [err, setErr]       = useState(null);
  const [metric, setMetric] = useState("rmse_log");

  useEffect(() => {
    getMetrics()
      .then(r => setData(r.data))
      .catch(() => setErr("Failed to load metrics. Is the backend running?"));
  }, []);

  if (err)   return <ErrorState message={err} />;
  if (!data) return (
    <>
      <div className="page-heading"><h1>Model Comparison</h1></div>
      <ChartSkeleton h={340} />
    </>
  );

  // Build bar chart data
  const testData = data.test;
  const barData = MODEL_ORDER.map(name => {
    if (name === "Crop-avg Baseline") return { name: "Crop-avg", ...STATIC_BASELINE };
    const key = name; // keys in metrics.json match
    const d = testData[key] ?? {};
    return { name: name === "Linear Regression" ? "Lin Reg" : name === "Random Forest" ? "Rnd Forest" : name, rmse_log: d.rmse_log, r2_log: d.r2_log, mae: d.mae };
  });

  // Seed study bar chart
  const seedModels = Object.keys(data.seed_study);
  const seedData = seedModels.map(name => {
    const s = data.seed_study[name];
    const v = s[metric];
    return { name, value: v?.mean ?? 0, err: v?.std ?? 0 };
  });

  const m = METRIC_OPTS.find(o => o.key === metric);

  return (
    <>
      <div className="page-heading">
        <h1>Model Comparison</h1>
        <p>Single-run and 5-seed-averaged performance across all models. Log-scale metrics only.</p>
      </div>

      {/* Metric toggle */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">📊 Single-Run Test Results</span>
          <div className="toggle-group">
            {METRIC_OPTS.map(o => (
              <button
                key={o.key}
                id={`metric-toggle-${o.key}`}
                className={`btn btn-ghost${metric === o.key ? " active" : ""}`}
                style={{ padding: "6px 14px", fontSize: ".78rem" }}
                onClick={() => setMetric(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={50} tickFormatter={v => v.toFixed(3)} />
            <Tooltip content={<CustomTooltip metric={metric} />} />
            <Bar dataKey={metric} radius={[5,5,0,0]}>
              {barData.map((entry, i) => {
                const modelName = MODEL_ORDER[i];
                return <Cell key={i} fill={MODEL_COLORS[modelName] || "var(--accent-muted)"} fillOpacity={modelName === "PSO-ANN" ? 1 : 0.75} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
          {MODEL_ORDER.map(name => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: ".72rem", color: "var(--text-muted)" }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: MODEL_COLORS[name] }} />
              {name}
            </div>
          ))}
        </div>
      </div>

      {/* 5-seed study */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">🔬 5-Seed Repeat Study ({m?.label})</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={seedData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--text-muted)" }} />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={50} tickFormatter={v => v.toFixed(4)} />
            <Tooltip content={<CustomTooltip metric={metric} />} />
            <Bar dataKey="value" radius={[5,5,0,0]} fill="var(--accent-blue)" fillOpacity={0.8}>
              <ErrorBar dataKey="err" width={8} strokeWidth={2} stroke="var(--accent-warn)" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Numeric table */}
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>
                <th style={{ textAlign: "left", padding: "6px 12px" }}>Model</th>
                {METRIC_OPTS.map(o => <th key={o.key} style={{ textAlign: "right", padding: "6px 12px" }}>{o.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {seedModels.map(name => {
                const s = data.seed_study[name];
                return (
                  <tr key={name} style={{ borderBottom: "1px solid var(--border)", color: name === "PSO-ANN" ? "var(--accent)" : "var(--text-primary)" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{name}</td>
                    {METRIC_OPTS.map(o => {
                      const v = s[o.key];
                      return <td key={o.key} style={{ textAlign: "right", padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: ".78rem" }}>
                        {v ? `${v.mean.toFixed(4)} ± ${v.std.toFixed(4)}` : "—"}
                      </td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Takeaway */}
      <div className="takeaway">
        <p>
          <strong>📌 Honest takeaway:</strong> Non-linear models (ANN and Random Forest) reduce error by roughly <strong>46%</strong> versus the crop-average baseline. 
          Across 5 random seeds, <strong>PSO-ANN and Baseline ANN are statistically tied</strong> — the small single-run advantage (RMSE log 0.2275 vs 0.2362) came from a lucky seed.
          The defensible claim for PSO is: <em>it matched the tuned baseline's accuracy while using only 6 of 8 inputs</em>, demonstrating effective feature selection.
        </p>
      </div>
    </>
  );
}
