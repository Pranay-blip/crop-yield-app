import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { CardSkeleton } from "../shared/Skeleton";
import { ErrorState } from "../shared/ErrorState";
import { getSchema } from "../../api/client";

// Format large numbers with commas
function fmt(n) {
  if (n === undefined || n === null) return "";
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function NumberField({ field, value, onChange }) {
  const [display, setDisplay] = useState(fmt(value));

  function handleChange(e) {
    const raw = e.target.value.replace(/,/g, "");
    setDisplay(e.target.value);
    if (!isNaN(raw) && raw !== "") onChange(field.name, parseFloat(raw));
  }
  function handleBlur() {
    const raw = String(display).replace(/,/g, "");
    if (!isNaN(raw) && raw !== "") {
      setDisplay(fmt(parseFloat(raw)));
      onChange(field.name, parseFloat(raw));
    }
  }

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={`field-${field.name}`}>
        {field.label}
      </label>
      <input
        id={`field-${field.name}`}
        className="form-control"
        type="text"
        inputMode="decimal"
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={fmt(field.default)}
      />
      <span className="form-hint">
        Typical range: {fmt(field.typical_low)} – {fmt(field.typical_high)}
      </span>
    </div>
  );
}

function SelectField({ field, value, onChange }) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={`field-${field.name}`}>
        {field.label}
      </label>
      <select
        id={`field-${field.name}`}
        className="form-control"
        value={value}
        onChange={e => onChange(field.name, e.target.value)}
      >
        {field.options.map(o => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

export function InputForm({ onSubmit, loading }) {
  const [schema, setSchema] = useState(null);
  const [fetchErr, setFetchErr] = useState(null);
  const [values, setValues] = useState({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitErr, setSubmitErr] = useState(null);

  useEffect(() => {
    getSchema()
      .then(r => {
        const s = r.data;
        setSchema(s);
        // Initialise defaults
        const defaults = {};
        [...s.required, ...s.optional].forEach(f => {
          defaults[f.name] = f.default;
        });
        setValues(defaults);
      })
      .catch(() => setFetchErr("Failed to load form schema. Is the backend running?"));
  }, []);

  function set(name, val) {
    setValues(v => ({ ...v, [name]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitErr(null);
    try {
      await onSubmit(values, showAdvanced);
    } catch (err) {
      setSubmitErr(err?.response?.data?.detail || err.message);
    }
  }

  if (fetchErr) return <ErrorState message={fetchErr} />;
  if (!schema)  return <CardSkeleton />;

  const renderField = f =>
    f.type === "select"
      ? <SelectField key={f.name} field={f} value={values[f.name] ?? f.default} onChange={set} />
      : <NumberField key={f.name} field={f} value={values[f.name] ?? f.default} onChange={set} />;

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {schema.required.map(renderField)}

      {/* Advanced / optional section */}
      <button
        type="button"
        className="advanced-toggle"
        onClick={() => setShowAdvanced(v => !v)}
        aria-expanded={showAdvanced}
        id="advanced-toggle-btn"
      >
        {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {showAdvanced ? "Hide" : "Show"} optional fields (unlocks baseline ANN comparison)
      </button>

      {showAdvanced && (
        <div className="advanced-section fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: ".75rem", color: "var(--text-faint)" }}>{schema.note}</p>
          {schema.optional.map(renderField)}
        </div>
      )}

      {submitErr && (
        <div className="warning-banner" role="alert">
          <AlertTriangle size={16} color="var(--accent-warn)" style={{ flexShrink: 0, marginTop: 2 }} />
          <p>{submitErr}</p>
        </div>
      )}

      <button
        id="predict-submit-btn"
        type="submit"
        className="btn btn-primary"
        disabled={loading}
        style={{ marginTop: 4 }}
      >
        {loading ? <><span className="spinner" /> Predicting…</> : "Predict →"}
      </button>
    </form>
  );
}
