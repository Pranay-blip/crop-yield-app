import { useState, useEffect } from "react";
import { getModelInfo } from "../api/client";

export default function AboutPage() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    getModelInfo().then(r => setInfo(r.data)).catch(() => {});
  }, []);

  const rows = info?.rows ?? { total: 19412, train: 13588, val: 2912, test: 2912 };
  const trainedAt = info?.trained_at ?? "2026-09-30";

  return (
    <>
      <div className="page-heading">
        <h1>About the Project</h1>
        <p>Crop yield prediction using a soft-computing approach aligned with UN Sustainable Development Goals.</p>
      </div>

      {/* Hero card */}
      <div className="card" style={{ marginBottom: 20, background: "linear-gradient(135deg, rgba(34,197,94,.07), rgba(59,130,246,.07))", border: "1px solid rgba(34,197,94,.2)" }}>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ fontSize: "3.5rem" }}>🌾</div>
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", marginBottom: 8 }}>
              Crop Yield Prediction Using ANN Optimized with PSO
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: ".88rem", lineHeight: 1.7, maxWidth: 700 }}>
              A college mini-project for the subject <strong>Soft Computing</strong>. An Artificial Neural Network is tuned by Particle Swarm Optimization to predict per-hectare crop yield across Indian states from 1997 to 2020. The model explains about 93% of yield variation (log scale) with a typical error of ±25%.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
              {[
                ["Region", "India, 30 states"],
                ["Period",  "1997–2020"],
                ["Crops",   "54 varieties"],
                ["Dataset",  `${(rows.total).toLocaleString()} rows`],
                ["Trained",  trainedAt.slice(0,10)],
              ].map(([k,v]) => (
                <div key={k} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "6px 12px", fontSize: ".75rem" }}>
                  <span style={{ color: "var(--text-faint)" }}>{k}: </span>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 14, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
          ⚙️ How It Works
        </h2>
        <div className="steps-grid">
          {[
            ["1", "Data Preparation", "19,412 Indian state-level crop records (1997–2020). Log-transform yield, one-hot encode categories, standardize numerics."],
            ["2", "PSO Feature & Hyperparameter Search", "15-particle swarm runs for 20 iterations. Each particle encodes 6 hyperparameters + 8 binary feature genes. Fitness = val RMSE (log) + feature-use penalty."],
            ["3", "ANN Training", "scikit-learn MLPRegressor with Adam optimizer and early stopping. Architecture (87, 67 neurons, ReLU) and 6 features were chosen by PSO."],
            ["4", "Prediction & Uncertainty", "Input → trained pipeline → log-yield → expm1 → t/ha. An empirical 80% interval from test-set residuals wraps every prediction."],
          ].map(([n, title, desc]) => (
            <div key={n} className="step-card">
              <div className="step-number">{n}</div>
              <div className="step-title">{title}</div>
              <div className="step-desc">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* SDG badges */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 14, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
          🌍 SDG Alignment
        </h2>
        <div className="sdg-grid">
          <div className="sdg-badge sdg2">
            <div className="sdg-number" style={{ color: "#e98c2a" }}>2</div>
            <div className="sdg-info">
              <h3 style={{ color: "#e98c2a" }}>Zero Hunger</h3>
              <p>Accurate yield forecasts help governments and NGOs plan food distribution, identify low-yield regions early, and prioritize agricultural interventions.</p>
            </div>
          </div>
          <div className="sdg-badge sdg12">
            <div className="sdg-number" style={{ color: "#bf9400" }}>12</div>
            <div className="sdg-info">
              <h3 style={{ color: "#bf9400" }}>Responsible Production</h3>
              <p>PSO feature selection found that Annual Rainfall and Pesticide add little predictive value. This promotes efficient resource use by focusing on the most informative inputs.</p>
            </div>
          </div>
          <div className="sdg-badge sdg13">
            <div className="sdg-number" style={{ color: "#48a039" }}>13</div>
            <div className="sdg-info">
              <h3 style={{ color: "#48a039" }}>Climate Action</h3>
              <p>Year-over-year trend analysis in the what-if tool can surface climate-driven shifts in crop productivity over the study period.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Dataset & model key numbers */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">📦 Dataset</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: ".85rem" }}>
            {[
              ["Source",   "Kaggle — Crop Yield in Indian States"],
              ["Columns",  "Crop, Season, State, Year, Area, Rainfall, Fertilizer, Pesticide, Yield"],
              ["Target",   "Yield = Production ÷ Area (t/ha, approximate)"],
              ["Split",    `${rows.train.toLocaleString()} train / ${rows.val.toLocaleString()} val / ${rows.test.toLocaleString()} test (70/15/15, seed 42)`],
              ["Excluded", "Coconut (different yield units)"],
            ].map(([k,v]) => (
              <div key={k} style={{ display: "flex", gap: 10 }}>
                <span style={{ color: "var(--text-faint)", minWidth: 70, flexShrink: 0 }}>{k}</span>
                <span style={{ color: "var(--text-secondary)" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">📏 Key Numbers</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: ".85rem" }}>
            {[
              ["R² (log)",   "0.928 (PSO-ANN, single run)"],
              ["RMSE (log)", "0.2275 (PSO-ANN, single run)"],
              ["MAE",        "1.024 t/ha (PSO-ANN)"],
              ["Typical err","~±25% (80% interval)"],
              ["Seed study", "Tied: PSO-ANN 0.2366±0.0020 vs Baseline 0.2370±0.0015"],
            ].map(([k,v]) => (
              <div key={k} style={{ display: "flex", gap: 10 }}>
                <span style={{ color: "var(--text-faint)", minWidth: 90, flexShrink: 0 }}>{k}</span>
                <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: ".8rem" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </>
  );
}
