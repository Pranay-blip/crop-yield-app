import { useState } from "react";
import { InputForm } from "../components/predict/InputForm";
import { PredictionCard } from "../components/predict/PredictionCard";
import { WhatIfExplorer } from "../components/predict/WhatIfExplorer";
import { EconomicsPanelFull } from "../components/predict/EconomicsPanel";
import { postPredict } from "../api/client";

export default function PredictPage() {
  const [result, setResult]         = useState(null);
  const [loading, setLoading]       = useState(false);
  const [lastInputs, setLastInputs] = useState(null);
  const [selectedCrop, setSelectedCrop] = useState(null);
  const [area, setArea]             = useState(null);
  const [fertilizer, setFertilizer] = useState(null);

  async function handleSubmit(values, showAdvanced) {
    setLoading(true);
    try {
      // If advanced section is hidden, strip optional fields so baseline stays null
      const payload = { ...values };
      if (!showAdvanced) {
        delete payload.Annual_Rainfall;
        delete payload.Pesticide;
      }
      const r = await postPredict(payload);
      setResult(r.data);
      // Store the 6 required fields for what-if (strip optional ones)
      const required = {};
      ["Crop","Season","State","Crop_Year","Area","Fertilizer"].forEach(k => {
        if (payload[k] != null) required[k] = payload[k];
      });
      setLastInputs(required);
      setSelectedCrop(payload.Crop ?? null);
      setArea(Number(payload.Area) || null);
      setFertilizer(Number(payload.Fertilizer) || null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <h1>Crop Yield Prediction</h1>
        <p>Enter crop details to get a predicted yield with uncertainty range and context. Explains about 93% of yield variation (log scale).</p>
      </div>

      <div className="predict-layout">
        {/* Left: form */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">🌿 Input Parameters</span>
          </div>
          <InputForm onSubmit={handleSubmit} loading={loading} />
        </div>

        {/* Right: result */}
        {result ? (
          <PredictionCard result={result} />
        ) : (
          <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 320 }}>
            <span style={{ fontSize: "3.5rem", marginBottom: 16 }}>🌾</span>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem", marginBottom: 8 }}>Ready to predict</h3>
            <p style={{ color: "var(--text-muted)", fontSize: ".85rem", textAlign: "center", maxWidth: 280 }}>
              Fill in the form and click Predict to see the estimated yield with an 80% confidence range.
            </p>
            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 260 }}>
              {["Typical error: about ±25%", "Prediction range: 80% of test cases fall inside this band", "Uses 6 of 8 inputs, found by PSO"].map(t => (
                <div key={t} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: "var(--accent)", marginTop: 2 }}>✓</span>
                  <span style={{ fontSize: ".78rem", color: "var(--text-muted)" }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* What-if always below */}
      <WhatIfExplorer lastInputs={lastInputs} />

      {/* Profitability panel */}
      <EconomicsPanelFull
        result={result}
        selectedCrop={selectedCrop}
        area={area}
        fertilizer={fertilizer}
      />
    </>
  );
}
