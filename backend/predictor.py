"""
Inference layer for the crop-yield model.

Everything a UI needs comes out of this class as plain JSON-friendly dicts, so it
plugs straight into FastAPI / Flask / Streamlit:

    from predictor import YieldPredictor
    yp = YieldPredictor("artifacts")

    yp.schema()                         # -> form definition (fields, ranges, dropdown options)
    yp.predict({...})                   # -> prediction + range + vs-average + warnings
    yp.what_if({...}, "Annual_Rainfall")# -> curve for a line chart
    yp.metrics()  yp.pso_history()  yp.feature_importance()  yp.test_predictions()

Quick check:  python predictor.py
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd


class YieldPredictor:
    def __init__(self, artifacts_dir: str = "artifacts"):
        d = Path(artifacts_dir)
        self.dir = d
        self.meta = json.loads((d / "metadata.json").read_text())
        self.pso_model = joblib.load(d / "pso_ann_model.joblib")
        self.baseline_model = joblib.load(d / "baseline_ann_model.joblib")
        self.selected = self.meta["features"]["selected"]
        self.all_features = self.meta["features"]["all"]
        self.numeric = set(self.meta["features"]["numeric"])
        self.unit = self.meta["unit"]

    # ------------------------------------------------------------------ #
    # Static info for the UI                                             #
    # ------------------------------------------------------------------ #
    def schema(self) -> dict:
        """Describes the input form. 'required' = used by the PSO model."""
        def field(name: str) -> dict:
            label = name.replace("_", " ")
            if name in self.numeric:
                m = self.meta["numeric"][name]
                return {"name": name, "label": label, "type": "number",
                        "min": m["min"], "max": m["max"], "default": m["median"],
                        "step": m["step"], "typical_low": m["p5"], "typical_high": m["p95"]}
            opts = self.meta["categorical"][name]
            return {"name": name, "label": label, "type": "select", "options": opts,
                    "default": self.meta["categorical_defaults"][name]}

        optional = [f for f in self.all_features if f not in self.selected]
        return {"unit": self.unit,
                "required": [field(f) for f in self.selected],
                "optional": [field(f) for f in optional],
                "note": "Optional fields are ignored by the PSO-ANN; provide them only to also get the baseline ANN comparison."}

    def metrics(self) -> dict:
        return json.loads((self.dir / "metrics.json").read_text())

    def pso_history(self) -> list:
        return json.loads((self.dir / "pso_history.json").read_text())

    def feature_importance(self) -> list:
        return json.loads((self.dir / "feature_importance.json").read_text())

    def test_predictions(self) -> dict:
        return json.loads((self.dir / "test_predictions.json").read_text())

    def model_info(self) -> dict:
        m = self.meta
        return {"trained_at": m["trained_at"], "rows": m["rows"], "features": m["features"],
                "hyperparameters": m["hyperparameters"], "pso_settings": m["pso_settings"],
                "interval": m["interval"], "unit": self.unit}

    # ------------------------------------------------------------------ #
    # Validation                                                         #
    # ------------------------------------------------------------------ #
    def _prepare(self, inputs: dict, features: list[str]):
        """Validate + normalise raw inputs. Raises ValueError with a clear message."""
        row, warns, missing = {}, [], []
        for f in features:
            v = inputs.get(f)
            if v is None or (isinstance(v, str) and not v.strip()):
                missing.append(f)
                continue
            if f in self.numeric:
                try:
                    v = float(v)
                except (TypeError, ValueError):
                    raise ValueError(f"'{f}' must be a number, got {v!r}")
                if not np.isfinite(v):
                    raise ValueError(f"'{f}' must be a finite number")
                m = self.meta["numeric"][f]
                if m["non_negative"] and v < 0:
                    raise ValueError(f"'{f}' cannot be negative")
                if v < m["min"] or v > m["max"]:
                    warns.append(f"{f.replace('_', ' ')} = {v:g} is outside the range seen in training "
                                 f"({m['min']:g} to {m['max']:g}); treat this estimate as an extrapolation.")
            else:
                options = self.meta["categorical"][f]
                canon = {o.lower(): o for o in options}.get(str(v).strip().lower())
                if canon is None:
                    warns.append(f"Unknown {f} '{v}' - the model has not seen it, so it is ignored for that field.")
                    canon = str(v).strip()
                v = canon
            row[f] = v
        if missing:
            raise ValueError("Missing required inputs: " + ", ".join(missing))
        return row, warns

    # ------------------------------------------------------------------ #
    # Prediction                                                         #
    # ------------------------------------------------------------------ #
    @staticmethod
    def _to_yield(log_pred) -> np.ndarray:
        return np.clip(np.expm1(np.asarray(log_pred, dtype=float)), 0, None)

    def predict(self, inputs: dict) -> dict:
        row, warns = self._prepare(inputs, self.selected)
        log_pred = float(self.pso_model.predict(pd.DataFrame([row]))[0])
        pred = float(self._to_yield(log_pred))

        iv = self.meta["interval"]
        low = float(self._to_yield(log_pred + iv["log_lower"]))
        high = float(self._to_yield(log_pred + iv["log_upper"]))

        # Baseline ANN needs ALL features; only run it if the caller supplied them.
        baseline = None
        try:
            full_row, _ = self._prepare(inputs, self.all_features)
            baseline = float(self._to_yield(self.baseline_model.predict(pd.DataFrame([full_row]))[0]))
        except ValueError:
            pass

        # Context: how does this compare to typical yields for the crop?
        stats_all = self.meta["crop_stats"]
        crop_name = None
        if "Crop" in inputs and inputs["Crop"]:
            crop_name = {k.lower(): k for k in stats_all}.get(str(inputs["Crop"]).strip().lower())
        ref = stats_all.get(crop_name, stats_all["__overall__"])
        vs_avg = 100 * (pred - ref["mean"]) / ref["mean"] if ref["mean"] else None
        if pred < ref["p25"]:
            rating = "Below typical"
        elif pred > ref["p75"]:
            rating = "Above typical"
        else:
            rating = "Typical"

        return {
            "prediction": round(pred, 3),
            "unit": self.unit,
            "interval": {"low": round(low, 3), "high": round(high, 3), "level": iv["level"]},
            "reference": {"label": crop_name or "All crops", "average": round(ref["mean"], 3),
                          "typical_low": round(ref["p25"], 3), "typical_high": round(ref["p75"], 3)},
            "vs_average_pct": None if vs_avg is None else round(vs_avg, 1),
            "rating": rating,
            "baseline_prediction": None if baseline is None else round(baseline, 3),
            "used_features": self.selected,
            "warnings": warns,
        }

    def what_if(self, inputs: dict, feature: str, values: list | None = None, n: int = 25) -> dict:
        """Vary ONE input, hold the rest fixed -> data for a response curve."""
        if feature not in self.selected:
            raise ValueError(f"'{feature}' is not used by the model. Choose one of: {self.selected}")
        row, warns = self._prepare(inputs, self.selected)
        if feature in self.numeric:
            m = self.meta["numeric"][feature]
            xs = values if values else np.linspace(m["p5"], m["p95"], n).tolist()
            kind = "number"
        else:
            xs = values if values else self.meta["categorical"][feature]
            kind = "category"
        frame = pd.DataFrame([{**row, feature: x} for x in xs])
        ys = self._to_yield(self.pso_model.predict(frame))
        return {"feature": feature, "type": kind, "unit": self.unit, "current": row[feature],
                "points": [{"x": (round(float(x), 3) if kind == "number" else x), "yield": round(float(y), 3)}
                           for x, y in zip(xs, ys)],
                "warnings": warns}


if __name__ == "__main__":
    yp = YieldPredictor("artifacts")
    sample = {f["name"]: f["default"] for f in yp.schema()["required"] + yp.schema()["optional"]}
    print("Sample input:", sample)
    print(json.dumps(yp.predict(sample), indent=2))
    first_numeric = next((f for f in yp.selected if f in yp.numeric), None)
    if first_numeric:
        print(json.dumps(yp.what_if(sample, first_numeric, n=5), indent=2))
