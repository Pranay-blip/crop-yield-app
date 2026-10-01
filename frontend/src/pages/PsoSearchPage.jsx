import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, ReferenceLine } from "recharts";
import { BarChart, Bar, Cell } from "recharts";
import { Play, Pause, RotateCcw } from "lucide-react";
import { getPsoHistory, getFeatureImp, getTestPredictions, getModelInfo } from "../api/client";
import { ChartSkeleton } from "../components/shared/Skeleton";
import { ErrorState } from "../components/shared/ErrorState";

const SPEED_MAP = { "0.5×": 1200, "1×": 600, "2×": 300, "4×": 150 };

function ConvergenceChart({ history }) {
  const [frame, setFrame]     = useState(history.length);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed]     = useState("1×");
  const timerRef = useRef(null);

  const stop = useCallback(() => {
    clearInterval(timerRef.current);
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (frame >= history.length) setFrame(0);
    setPlaying(true);
  }, [frame, history.length]);

  useEffect(() => {
    if (!playing) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setFrame(f => {
        if (f >= history.length) { stop(); return history.length; }
        return f + 1;
      });
    }, SPEED_MAP[speed]);
    return () => clearInterval(timerRef.current);
  }, [playing, speed, stop, history.length]);

  const visible = history.slice(0, frame);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "8px 12px", fontSize: ".78rem" }}>
        <div style={{ color: "var(--text-muted)" }}>Iteration {payload[0].payload.iteration}</div>
        {payload.map(p => <div key={p.name} style={{ color: p.color }}>{p.name}: {Number(p.value).toFixed(4)}</div>)}
      </div>
    );
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <span className="card-title">🔄 PSO Convergence</span>
        <div className="playback-bar">
          <select className="speed-select" value={speed} onChange={e => { stop(); setSpeed(e.target.value); }} id="pso-speed-select">
            {Object.keys(SPEED_MAP).map(s => <option key={s}>{s}</option>)}
          </select>
          <button className="btn-icon" id="pso-reset-btn" onClick={() => { stop(); setFrame(0); }} title="Reset"><RotateCcw size={14} /></button>
          {playing
            ? <button className="btn-icon" id="pso-pause-btn" onClick={stop} title="Pause"><Pause size={14} /></button>
            : <button className="btn btn-primary" id="pso-play-btn" onClick={play} style={{ padding: "6px 14px", fontSize: ".8rem" }}><Play size={14} /> Play</button>
          }
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={visible} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="iteration" tick={{ fontSize: 10, fill: "var(--text-muted)" }} label={{ value: "Iteration", position: "insideBottom", offset: -2, fontSize: 10, fill: "var(--text-muted)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} width={52} tickFormatter={v => v.toFixed(3)} label={{ value: "Val RMSE (log)", angle: -90, position: "insideLeft", fontSize: 10, fill: "var(--text-muted)", dx: -4 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: ".75rem", color: "var(--text-muted)" }} />
          <Line type="monotone" dataKey="best"  stroke="var(--accent)"      strokeWidth={2} dot={false} name="Best"  isAnimationActive={false} />
          <Line type="monotone" dataKey="mean"  stroke="var(--accent-warn)" strokeWidth={2} dot={false} name="Mean"  isAnimationActive={false} />
          <Line type="monotone" dataKey="worst" stroke="var(--accent-muted)" strokeWidth={1.5} dot={false} name="Worst" strokeDasharray="4 2" isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="chart-note">15 particles × 20 iterations · Swarm mean has spikes (normal exploration). Click Play to animate.</p>
    </div>
  );
}

function ActualVsPredChart({ testPreds }) {
  const { actual = [], pso_ann = [], crop = [] } = testPreds;
  const pts = actual.map((a, i) => ({
    actual: Math.log10(Math.max(a, 0.001)),
    pso:    Math.log10(Math.max(pso_ann[i], 0.001)),
    crop:   crop[i],
  }));
  const allVals = pts.flatMap(p => [p.actual, p.pso]);
  const lo = Math.min(...allVals) - 0.2;
  const hi = Math.max(...allVals) + 0.2;
  const diagLine = [{ x: lo, y: lo }, { x: hi, y: hi }];

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "8px 12px", fontSize: ".78rem" }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{d.crop}</div>
        <div style={{ color: "var(--text-muted)" }}>Actual: {Math.pow(10, d.actual).toFixed(2)} t/ha</div>
        <div style={{ color: "var(--accent)" }}>Predicted: {Math.pow(10, d.pso).toFixed(2)} t/ha</div>
      </div>
    );
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <span className="card-title">📉 Actual vs Predicted (log₁₀ scale)</span>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" dataKey="actual" name="Actual" tick={{ fontSize: 10, fill: "var(--text-muted)" }} domain={[lo, hi]} label={{ value: "log₁₀(Actual yield)", position: "insideBottom", offset: -12, fontSize: 11, fill: "var(--text-muted)" }} />
          <YAxis type="number" dataKey="pso"    name="PSO-ANN" tick={{ fontSize: 10, fill: "var(--text-muted)" }} domain={[lo, hi]} label={{ value: "log₁₀(Predicted)", angle: -90, position: "insideLeft", fontSize: 11, fill: "var(--text-muted)", dx: 8 }} />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={pts} fill="var(--accent-blue)" fillOpacity={0.6} r={3} />
          {/* y = x diagonal */}
          <Line data={diagLine} type="linear" dataKey="y" stroke="var(--accent)" strokeWidth={1.5} dot={false} strokeDasharray="5 3" isAnimationActive={false} legendType="none" />
        </ScatterChart>
      </ResponsiveContainer>
      <p className="chart-note">Log-log axes avoid distortion from the high-yield outlier. Points on the diagonal line = perfect prediction. R² ≈ 0.928 (log scale).</p>
    </div>
  );
}

function FeatureImportanceChart({ importance }) {
  const sorted = [...importance].sort((a,b) => b.importance_pct - a.importance_pct);
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <span className="card-title">🎯 Feature Importance (PSO-ANN)</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 40, left: 60, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickFormatter={v => `${v.toFixed(0)}%`} />
          <YAxis type="category" dataKey="feature" tick={{ fontSize: 11, fill: "var(--text-primary)" }} width={60} />
          <Tooltip formatter={(v) => [`${v.toFixed(2)}%`, "Importance"]} contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", fontSize: ".78rem" }} />
          <Bar dataKey="importance_pct" radius={[0,4,4,0]}>
            {sorted.map((entry, i) => (
              <Cell key={i} fill={i === 0 ? "var(--accent)" : "var(--accent-blue)"} fillOpacity={i === 0 ? 1 : 0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="chart-note">Crop dominates (~75%) because yield varies enormously by crop type. Sliders for Area, Fertilizer, and Year produce modest changes — this is an inherent property of the data, not a bug.</p>
    </div>
  );
}

export default function PsoSearchPage() {
  const [history, setHistory]  = useState(null);
  const [importance, setImp]   = useState(null);
  const [testPreds, setTest]   = useState(null);
  const [modelInfo, setInfo]   = useState(null);
  const [err, setErr]          = useState(null);

  useEffect(() => {
    Promise.all([getPsoHistory(), getFeatureImp(), getTestPredictions(), getModelInfo()])
      .then(([h, fi, tp, mi]) => {
        setHistory(h.data);
        setImp(fi.data);
        setTest(tp.data);
        setInfo(mi.data);
      })
      .catch(() => setErr("Failed to load PSO data. Is the backend running?"));
  }, []);

  if (err) return <ErrorState message={err} />;
  if (!history) return (
    <>
      <div className="page-heading"><h1>PSO Search</h1></div>
      <ChartSkeleton h={300} />
    </>
  );

  const hp = modelInfo?.hyperparameters?.pso_ann ?? {};
  const psoSettings = modelInfo?.pso_settings ?? {};
  const features = modelInfo?.features ?? {};
  const selected = features.selected ?? [];
  const dropped  = features.dropped_by_pso ?? [];

  return (
    <>
      <div className="page-heading">
        <h1>PSO Search</h1>
        <p>Particle Swarm Optimization jointly searched ANN architecture, training settings, and which features to keep. Search took ~18.5 minutes.</p>
      </div>

      {/* PSO Settings + Best Config */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">⚙️ Best Configuration</span></div>
          <div className="hyperparam-grid">
            {[
              ["Hidden layers", JSON.stringify(hp.hidden_layer_sizes ?? [87,67])],
              ["Activation", hp.activation ?? "relu"],
              ["Learning rate", hp.learning_rate_init?.toFixed(5) ?? "0.00201"],
              ["L2 alpha", hp.alpha?.toExponential(2) ?? "5.31e-6"],
              ["Batch size", hp.batch_size ?? 128],
              ["Features used", `${selected.length} of 8`],
            ].map(([label, val]) => (
              <div key={label} className="hyperparam-cell">
                <div className="hyperparam-label">{label}</div>
                <div className="hyperparam-value">{String(val)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">🔬 PSO Settings</span></div>
          <div className="hyperparam-grid">
            {[
              ["Particles",      psoSettings.n_particles ?? 15],
              ["Iterations",     psoSettings.n_iterations ?? 20],
              ["Inertia (start)", "0.9 → 0.4"],
              ["c1 / c2",        "1.5 / 1.5"],
              ["Velocity clamp", "±0.25"],
              ["Search time",    "~18.5 min"],
            ].map(([label, val]) => (
              <div key={label} className="hyperparam-cell">
                <div className="hyperparam-label">{label}</div>
                <div className="hyperparam-value">{String(val)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Feature selection result */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">🧬 Feature Selection Result</span></div>
        <div className="feature-pills">
          {selected.map(f => (
            <span key={f} className="feature-pill selected">✅ {f}</span>
          ))}
          {dropped.map(f => (
            <span key={f} className="feature-pill dropped">❌ {f}</span>
          ))}
        </div>
        <p style={{ marginTop: 12, fontSize: ".78rem", color: "var(--text-muted)" }}>
          PSO fitness = validation RMSE (log) + 0.004 × fraction of features. The penalty nudged the swarm to drop Annual Rainfall and Pesticide without sacrificing accuracy.
        </p>
      </div>

      {/* Convergence animation */}
      <ConvergenceChart history={history} />

      {/* Actual vs Predicted */}
      <ActualVsPredChart testPreds={testPreds} />

      {/* Feature importance */}
      <FeatureImportanceChart importance={importance} />
    </>
  );
}
