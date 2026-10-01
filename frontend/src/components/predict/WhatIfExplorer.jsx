import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import { postWhatIf } from "../../api/client";
import { ChartSkeleton } from "../shared/Skeleton";

const VALID_FEATURES = ["Crop_Year", "Area", "Fertilizer", "Crop", "Season", "State"];

const FEATURE_LABELS = {
  Crop_Year: "Crop Year", Area: "Area (ha)", Fertilizer: "Fertilizer (kg)",
  Crop: "Crop", Season: "Season", State: "State",
};

function fmt(n) {
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "8px 12px", fontSize: ".78rem" }}>
      <div style={{ color: "var(--text-muted)" }}>{payload[0].payload.x}</div>
      <div style={{ color: "var(--accent)", fontWeight: 600 }}>{fmt(payload[0].value)} t/ha</div>
    </div>
  );
};

export function WhatIfExplorer({ lastInputs }) {
  const [feature, setFeature] = useState("Crop_Year");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const run = useCallback(async (feat, inputs) => {
    if (!inputs) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await postWhatIf({ inputs, feature: feat, n: 30 });
      setData(r.data);
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (lastInputs) run(feature, lastInputs);
  }, [feature, lastInputs, run]);

  const isCategory = data?.type === "category";
  const points = data?.points ?? [];
  const current = data?.current;

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="card-header">
        <span className="card-title">📈 What-If Explorer</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label htmlFor="whatif-feature-select" style={{ fontSize: ".75rem", color: "var(--text-muted)" }}>Vary:</label>
          <select
            id="whatif-feature-select"
            className="speed-select"
            value={feature}
            onChange={e => setFeature(e.target.value)}
            disabled={loading || !lastInputs}
          >
            {VALID_FEATURES.map(f => (
              <option key={f} value={f}>{FEATURE_LABELS[f]}</option>
            ))}
          </select>
        </div>
      </div>

      {!lastInputs ? (
        <div className="state-box" style={{ padding: "28px 0" }}>
          <span style={{ fontSize: "2rem" }}>📊</span>
          <p style={{ color: "var(--text-muted)", fontSize: ".85rem" }}>Run a prediction first to enable what-if analysis.</p>
        </div>
      ) : loading ? (
        <ChartSkeleton h={240} />
      ) : err ? (
        <p style={{ color: "var(--accent-danger)", fontSize: ".8rem", padding: "16px 0" }}>{err}</p>
      ) : points.length === 0 ? null : isCategory ? (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="x" tick={{ fontSize: 10, fill: "var(--text-muted)" }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} width={44} tickFormatter={v => v.toFixed(1)} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="yield" radius={[4,4,0,0]}>
                {points.map((p, i) => (
                  <Cell key={i} fill={p.x === current ? "var(--accent)" : "var(--accent-blue)"} fillOpacity={p.x === current ? 1 : 0.65} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="chart-note">Highlighted bar = current selection ({current})</p>
        </>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="x" tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickFormatter={v => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} width={44} tickFormatter={v => v.toFixed(1)} />
              <Tooltip content={<CustomTooltip />} />
              {current != null && (
                <ReferenceLine x={current} stroke="var(--accent)" strokeDasharray="4 2" label={{ value: "Current", position: "top", fontSize: 10, fill: "var(--accent)" }} />
              )}
              <Line type="monotone" dataKey="yield" stroke="var(--accent-blue)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "var(--accent)" }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="chart-note">Vertical line marks current value. Curves may be non-monotone — this is expected given crop-feature interactions.</p>
        </>
      )}
    </div>
  );
}
