"""
Crop Yield Prediction using an ANN optimised with Particle Swarm Optimization (PSO)
====================================================================================

What this script does
---------------------
1. Loads + cleans a crop-yield CSV (default schema: Kaggle "Crop Yield in Indian States").
2. Trains a BASELINE ANN (plain backprop, default-ish settings, all features).
3. Runs PSO to jointly search:
      - ANN architecture  (neurons in hidden layer 1 and 2)
      - training settings (learning rate, L2 alpha, activation, batch size)
      - FEATURE SUBSET    (binary mask, one bit per input column)
   Fitness = validation RMSE (log-yield) + small penalty for using many features.
4. Compares PSO-ANN vs baseline ANN vs Linear Regression vs Random Forest.
5. Saves everything a UI/API needs into ./artifacts (models, metadata, metrics,
   PSO history, actual-vs-predicted sample, feature importance).

Run
---
    python train.py --demo                      # synthetic data, quick pipeline test
    python train.py --data crop_yield.csv       # real data
    python train.py --data crop_yield.csv --particles 20 --iters 30

Google Colab:  !python train.py --data crop_yield.csv
"""
from __future__ import annotations

import argparse
import json
import time
import warnings
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from joblib import Parallel, delayed
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler


# --------------------------------------------------------------------------- #
# Configuration                                                               #
# --------------------------------------------------------------------------- #
@dataclass
class Config:
    target: str = "Yield"
    categorical: list = field(default_factory=lambda: ["Crop", "Season", "State"])
    numeric: list = field(default_factory=lambda: [
        "Crop_Year", "Area", "Annual_Rainfall", "Fertilizer", "Pesticide"])
    # Skewed columns -> log1p before scaling
    log_numeric: list = field(default_factory=lambda: ["Area", "Fertilizer", "Pesticide"])
    # Leakage: Yield = Production / Area, so Production must NOT be an input
    drop: list = field(default_factory=lambda: ["Production"])
    unit: str = "t/ha"          # label shown in the UI (check your dataset's real unit)
    min_features: int = 3       # PSO must keep at least this many input columns
    feature_penalty: float = 0.004  # fitness penalty per fraction of features used


BASELINE_HP = dict(h1=100, h2=0, activation="relu", lr=1e-3, alpha=1e-4, batch=128)
BATCH_CHOICES = [64, 128, 256, 512]


# --------------------------------------------------------------------------- #
# Data                                                                        #
# --------------------------------------------------------------------------- #
def make_demo_data(path: Path, n: int = 6000, seed: int = 0) -> Path:
    """Synthetic dataset with the same schema, only for testing the pipeline."""
    rng = np.random.default_rng(seed)
    crops = {"Rice": 2.6, "Wheat": 2.9, "Maize": 2.3, "Cotton": 0.5, "Sugarcane": 60.0, "Groundnut": 1.1}
    seasons = ["Kharif", "Rabi", "Whole Year", "Summer"]
    states = ["Punjab", "Karnataka", "Maharashtra", "Bihar", "Tamil Nadu", "Assam", "Gujarat", "Odisha"]
    crop = rng.choice(list(crops), n)
    base = np.array([crops[c] for c in crop])
    rain = rng.normal(1200, 450, n).clip(250, 3200)
    area = np.exp(rng.normal(9.5, 1.5, n)).clip(50, 3e6)
    fert = area * rng.uniform(60, 160, n)
    pest = area * rng.uniform(0.1, 0.5, n)
    year = rng.integers(1997, 2020, n)
    state = rng.choice(states, n)
    season = rng.choice(seasons, n)
    rain_eff = 1 - ((rain - 1300) / 1500) ** 2
    fert_eff = 0.75 + 0.25 * np.tanh((fert / area - 100) / 40)
    yld = base * rain_eff.clip(0.3, 1.1) * fert_eff * (1 + 0.006 * (year - 1997)) * rng.lognormal(0, 0.12, n)
    df = pd.DataFrame({
        "Crop": crop, "Crop_Year": year, "Season": season, "State": state, "Area": area,
        "Production": yld * area, "Annual_Rainfall": rain, "Fertilizer": fert,
        "Pesticide": pest, "Yield": yld,
    })
    df.to_csv(path, index=False)
    return path


def load_data(path: str, cfg: Config, exclude_crops: list[str]) -> pd.DataFrame:
    df = pd.read_csv(path)
    df.columns = [c.strip() for c in df.columns]
    needed = cfg.categorical + cfg.numeric + [cfg.target]
    missing = [c for c in needed if c not in df.columns]
    if missing:
        raise SystemExit(
            f"Columns {missing} not found in CSV.\nAvailable columns: {list(df.columns)}\n"
            "Edit the Config class at the top of train.py to match your dataset.")
    df = df.drop(columns=[c for c in cfg.drop if c in df.columns])

    # Many public crop datasets have trailing spaces in text columns ("Kharif     ")
    for c in cfg.categorical:
        df[c] = df[c].astype(str).str.strip()
    if exclude_crops:
        df = df[~df["Crop"].str.lower().isin([c.lower() for c in exclude_crops])]

    for c in cfg.numeric + [cfg.target]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.dropna(subset=[cfg.target] + cfg.categorical)
    df = df[df[cfg.target] > 0]
    for c in cfg.log_numeric:           # log1p needs non-negative values
        df[c] = df[c].clip(lower=0)
    return df.reset_index(drop=True)


# --------------------------------------------------------------------------- #
# Model building                                                              #
# --------------------------------------------------------------------------- #
def build_preprocessor(selected: list[str], cfg: Config) -> ColumnTransformer:
    """Only the selected columns are used; everything else is dropped."""
    nums = [c for c in cfg.numeric if c in selected and c not in cfg.log_numeric]
    lognums = [c for c in cfg.numeric if c in selected and c in cfg.log_numeric]
    cats = [c for c in cfg.categorical if c in selected]
    parts = []
    if nums:
        parts.append(("num", Pipeline([("imp", SimpleImputer(strategy="median")),
                                       ("sc", StandardScaler())]), nums))
    if lognums:
        parts.append(("lognum", Pipeline([("imp", SimpleImputer(strategy="median")),
                                          ("log", FunctionTransformer(np.log1p, feature_names_out="one-to-one")),
                                          ("sc", StandardScaler())]), lognums))
    if cats:
        parts.append(("cat", Pipeline([("imp", SimpleImputer(strategy="most_frequent")),
                                       ("oh", OneHotEncoder(handle_unknown="ignore", sparse_output=False))]), cats))
    return ColumnTransformer(parts, remainder="drop")


def make_mlp(hp: dict, seed: int, max_iter: int) -> MLPRegressor:
    layers = (int(hp["h1"]),) + ((int(hp["h2"]),) if hp["h2"] > 0 else ())
    return MLPRegressor(
        hidden_layer_sizes=layers, activation=hp["activation"], solver="adam",
        learning_rate_init=float(hp["lr"]), alpha=float(hp["alpha"]), batch_size=int(hp["batch"]),
        early_stopping=True, validation_fraction=0.1, n_iter_no_change=10,
        max_iter=max_iter, random_state=seed)


def fit_ann(hp, selected, cfg, X, y, seed, max_iter) -> Pipeline:
    pipe = Pipeline([("pre", build_preprocessor(selected, cfg)),
                     ("mlp", make_mlp(hp, seed, max_iter))])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        pipe.fit(X, y)
    return pipe


# --------------------------------------------------------------------------- #
# PSO                                                                         #
# --------------------------------------------------------------------------- #
N_HP = 6  # h1, h2, lr, alpha, activation, batch


def decode(vec: np.ndarray, features: list[str], min_features: int):
    """Particle position in [0,1]^d  ->  (hyper-parameters, selected feature list)."""
    hp = {
        "h1": int(round(16 + vec[0] * (256 - 16))),
        "h2": int(round(vec[1] * 128)),
        "lr": float(10 ** (-4 + vec[2] * 2)),          # 1e-4 .. 1e-2
        "alpha": float(10 ** (-6 + vec[3] * 4)),       # 1e-6 .. 1e-2
        "activation": "relu" if vec[4] < 0.5 else "tanh",
        "batch": BATCH_CHOICES[min(int(vec[5] * 4), 3)],
    }
    if hp["h2"] < 8:
        hp["h2"] = 0                                    # single hidden layer
    mask = vec[N_HP:] >= 0.5
    if mask.sum() < min_features:                       # keep the strongest bits
        mask[np.argsort(-vec[N_HP:])[:min_features]] = True
    return hp, [f for f, m in zip(features, mask) if m]


def run_pso(batch_fitness, dim, n_particles, n_iter, seed,
            w_start=0.9, w_end=0.4, c1=1.5, c2=1.5, vmax=0.25, log=print):
    rng = np.random.default_rng(seed)
    pos = rng.random((n_particles, dim))
    vel = rng.uniform(-vmax, vmax, (n_particles, dim))
    fit = np.asarray(batch_fitness(pos))
    pbest, pbest_f = pos.copy(), fit.copy()
    g = int(np.argmin(pbest_f))
    gbest, gbest_f = pbest[g].copy(), float(pbest_f[g])
    history = [{"iteration": 0, "best": gbest_f, "mean": float(fit.mean()), "worst": float(fit.max())}]
    log(f"  iter  0 | best {gbest_f:.4f} | swarm mean {fit.mean():.4f}")

    for it in range(1, n_iter + 1):
        w = w_start - (w_start - w_end) * it / n_iter      # linearly decreasing inertia
        r1, r2 = rng.random(pos.shape), rng.random(pos.shape)
        vel = w * vel + c1 * r1 * (pbest - pos) + c2 * r2 * (gbest - pos)
        vel = np.clip(vel, -vmax, vmax)
        pos = np.clip(pos + vel, 0.0, 1.0)
        fit = np.asarray(batch_fitness(pos))
        better = fit < pbest_f
        pbest[better], pbest_f[better] = pos[better], fit[better]
        g = int(np.argmin(pbest_f))
        if pbest_f[g] < gbest_f:
            gbest, gbest_f = pbest[g].copy(), float(pbest_f[g])
        history.append({"iteration": it, "best": gbest_f, "mean": float(fit.mean()), "worst": float(fit.max())})
        log(f"  iter {it:2d} | best {gbest_f:.4f} | swarm mean {fit.mean():.4f}")
    return gbest, gbest_f, history


# --------------------------------------------------------------------------- #
# Metrics                                                                     #
# --------------------------------------------------------------------------- #
def rmse(a, b) -> float:
    return float(np.sqrt(mean_squared_error(a, b)))


def metrics(y_log_true, y_log_pred) -> dict:
    yt = np.expm1(y_log_true)
    yp = np.clip(np.expm1(y_log_pred), 0, None)
    return {
        "rmse": rmse(yt, yp), "mae": float(mean_absolute_error(yt, yp)), "r2": float(r2_score(yt, yp)),
        "rmse_log": rmse(y_log_true, y_log_pred), "r2_log": float(r2_score(y_log_true, y_log_pred)),
    }


def _json_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    raise TypeError(type(o))


def save_json(obj, path: Path):
    path.write_text(json.dumps(obj, indent=2, default=_json_default))


# --------------------------------------------------------------------------- #
# Main                                                                        #
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="crop_yield.csv")
    ap.add_argument("--demo", action="store_true", help="use synthetic data (pipeline test)")
    ap.add_argument("--out", default="artifacts")
    ap.add_argument("--particles", type=int, default=15)
    ap.add_argument("--iters", type=int, default=20)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--seeds", type=int, default=5, help="repeat final models over N seeds")
    ap.add_argument("--max-iter", type=int, default=200, help="max epochs per ANN")
    ap.add_argument("--n-jobs", type=int, default=-1)
    ap.add_argument("--sample", type=int, default=0, help="subsample N rows (faster PSO)")
    ap.add_argument("--exclude-crops", nargs="*", default=[],
                    help="drop crops with incompatible units, e.g. --exclude-crops Coconut")
    args, _ = ap.parse_known_args()       # parse_known_args -> also works inside Jupyter/Colab

    cfg = Config()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    data_path = args.data
    if args.demo:
        data_path = str(make_demo_data(out / "demo_crop_yield.csv"))
        print(f"[demo] synthetic data written to {data_path}")

    # ---- data ------------------------------------------------------------- #
    df = load_data(data_path, cfg, args.exclude_crops)
    if args.sample and len(df) > args.sample:
        df = df.sample(args.sample, random_state=args.seed).reset_index(drop=True)
    features = cfg.categorical + cfg.numeric
    X, y = df[features], np.log1p(df[cfg.target].values)   # model the LOG of yield
    print(f"Rows after cleaning: {len(df):,} | features: {features}")

    X_tr, X_tmp, y_tr, y_tmp = train_test_split(X, y, test_size=0.30, random_state=args.seed)
    X_val, X_te, y_val, y_te = train_test_split(X_tmp, y_tmp, test_size=0.50, random_state=args.seed)
    print(f"Split -> train {len(X_tr):,} | val {len(X_val):,} | test {len(X_te):,}")

    # ---- baseline ANN ------------------------------------------------------ #
    t0 = time.time()
    base = fit_ann(BASELINE_HP, features, cfg, X_tr, y_tr, args.seed, args.max_iter)
    base_time = time.time() - t0
    print(f"\nBaseline ANN  val RMSE(log) = {rmse(y_val, base.predict(X_val)):.4f}")

    # ---- PSO --------------------------------------------------------------- #
    def evaluate(vec):
        warnings.simplefilter("ignore")
        hp, sel = decode(vec, features, cfg.min_features)
        try:
            pipe = fit_ann(hp, sel, cfg, X_tr, y_tr, args.seed, args.max_iter)
            err = rmse(y_val, pipe.predict(X_val))
        except Exception:
            return 1e3
        return err + cfg.feature_penalty * len(sel) / len(features)

    def batch_fitness(P):
        return Parallel(n_jobs=args.n_jobs)(delayed(evaluate)(p) for p in P)

    dim = N_HP + len(features)
    print(f"\nPSO: {args.particles} particles x {args.iters} iterations, {dim} dimensions")
    t0 = time.time()
    gbest, gbest_f, history = run_pso(batch_fitness, dim, args.particles, args.iters, args.seed)
    pso_search_time = time.time() - t0
    best_hp, best_sel = decode(gbest, features, cfg.min_features)
    print(f"\nPSO done in {pso_search_time:.0f}s | best fitness {gbest_f:.4f}")
    print(f"Best hyper-parameters: {best_hp}")
    print(f"Selected features ({len(best_sel)}/{len(features)}): {best_sel}")

    # ---- final models ------------------------------------------------------ #
    t0 = time.time()
    pso_model = fit_ann(best_hp, best_sel, cfg, X_tr, y_tr, args.seed, args.max_iter)
    pso_time = time.time() - t0

    lin = Pipeline([("pre", build_preprocessor(features, cfg)), ("lr", LinearRegression())]).fit(X_tr, y_tr)
    rf = Pipeline([("pre", build_preprocessor(features, cfg)),
                   ("rf", RandomForestRegressor(n_estimators=200, min_samples_leaf=2,
                                                n_jobs=-1, random_state=args.seed))]).fit(X_tr, y_tr)

    models = {"Linear Regression": lin, "Random Forest": rf,
              "Baseline ANN": base, "PSO-ANN": pso_model}
    results = {name: metrics(y_te, m.predict(X_te)) for name, m in models.items()}
    results["Baseline ANN"]["train_seconds"] = base_time
    results["PSO-ANN"]["train_seconds"] = pso_time
    results["PSO-ANN"]["search_seconds"] = pso_search_time

    # ---- multi-seed study (is the improvement consistent?) ------------------ #
    seed_rows = {"Baseline ANN": [], "PSO-ANN": []}
    for s in range(args.seeds):
        b = fit_ann(BASELINE_HP, features, cfg, X_tr, y_tr, 100 + s, args.max_iter)
        p = fit_ann(best_hp, best_sel, cfg, X_tr, y_tr, 100 + s, args.max_iter)
        seed_rows["Baseline ANN"].append(metrics(y_te, b.predict(X_te)))
        seed_rows["PSO-ANN"].append(metrics(y_te, p.predict(X_te)))
    seed_study = {}
    for name, rows in seed_rows.items():
        seed_study[name] = {k: {"mean": float(np.mean([r[k] for r in rows])),
                                "std": float(np.std([r[k] for r in rows]))}
                            for k in ("rmse", "mae", "r2", "rmse_log", "r2_log")}

    # ---- summary table ------------------------------------------------------ #
    print("\nTEST SET RESULTS")
    print(f"{'Model':<20}{'RMSE':>10}{'MAE':>10}{'R2':>8}{'RMSE(log)':>12}{'R2(log)':>9}")
    for name, m in results.items():
        print(f"{name:<20}{m['rmse']:>10.3f}{m['mae']:>10.3f}{m['r2']:>8.3f}{m['rmse_log']:>12.4f}{m['r2_log']:>9.3f}")
    print(f"\nMulti-seed RMSE(log): baseline {seed_study['Baseline ANN']['rmse_log']['mean']:.4f} "
          f"± {seed_study['Baseline ANN']['rmse_log']['std']:.4f} | "
          f"PSO-ANN {seed_study['PSO-ANN']['rmse_log']['mean']:.4f} "
          f"± {seed_study['PSO-ANN']['rmse_log']['std']:.4f}")

    # ---- UI artifacts ------------------------------------------------------- #
    pred_log = pso_model.predict(X_te)
    resid = y_te - pred_log
    q_lo, q_hi = float(np.quantile(resid, 0.10)), float(np.quantile(resid, 0.90))

    imp = permutation_importance(pso_model, X_te[best_sel], y_te, scoring="neg_mean_squared_error",
                                 n_repeats=5, random_state=args.seed, n_jobs=1)
    raw = np.clip(imp.importances_mean, 0, None)
    total = raw.sum() if raw.sum() > 0 else 1.0
    importance = sorted(
        [{"feature": f, "importance_pct": float(100 * v / total)} for f, v in zip(best_sel, raw)],
        key=lambda d: -d["importance_pct"])

    n_pts = min(400, len(X_te))
    idx = np.random.default_rng(args.seed).choice(len(X_te), n_pts, replace=False)
    test_sample = {
        "unit": cfg.unit,
        "actual": np.expm1(y_te[idx]).round(4),
        "pso_ann": np.clip(np.expm1(pred_log[idx]), 0, None).round(4),
        "baseline_ann": np.clip(np.expm1(base.predict(X_te.iloc[idx])), 0, None).round(4),
        "crop": X_te.iloc[idx]["Crop"].tolist() if "Crop" in X_te else None,
    }

    def stats(s):
        return {"mean": float(s.mean()), "median": float(s.median()),
                "p25": float(s.quantile(0.25)), "p75": float(s.quantile(0.75)), "n": int(len(s))}

    crop_stats = {"__overall__": stats(df[cfg.target])}
    if "Crop" in df:
        for crop, g in df.groupby("Crop"):
            crop_stats[crop] = stats(g[cfg.target])

    numeric_meta = {}
    for c in cfg.numeric:
        s = df[c].dropna()
        p5, p95 = float(s.quantile(0.05)), float(s.quantile(0.95))
        is_int = bool(np.allclose(s, np.round(s)))
        step = 1 if is_int and (p95 - p5) < 500 else max(float(f"{(p95 - p5) / 100:.2g}"), 1e-3)
        numeric_meta[c] = {"min": float(s.min()), "max": float(s.max()), "p5": p5, "p95": p95,
                           "mean": float(s.mean()), "median": float(s.median()),
                           "integer": is_int, "step": step, "non_negative": bool(s.min() >= 0)}
    categorical_meta = {c: sorted(df[c].unique().tolist()) for c in cfg.categorical}
    defaults = {c: df[c].mode().iloc[0] for c in cfg.categorical}

    metadata = {
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "target": cfg.target, "unit": cfg.unit, "target_transform": "log1p",
        "rows": {"total": len(df), "train": len(X_tr), "val": len(X_val), "test": len(X_te)},
        "features": {"all": features, "selected": best_sel,
                     "dropped_by_pso": [f for f in features if f not in best_sel],
                     "categorical": cfg.categorical, "numeric": cfg.numeric},
        "numeric": numeric_meta, "categorical": categorical_meta, "categorical_defaults": defaults,
        "crop_stats": crop_stats,
        "hyperparameters": {"pso_ann": best_hp, "baseline_ann": BASELINE_HP},
        "interval": {"level": 0.8, "log_lower": q_lo, "log_upper": q_hi,
                     "note": "empirical 10-90% residual band on the held-out test set"},
        "pso_settings": {"particles": args.particles, "iterations": args.iters,
                         "inertia": "0.9 -> 0.4 (linear)", "c1": 1.5, "c2": 1.5,
                         "fitness": "validation RMSE(log yield) + feature-count penalty"},
    }

    joblib.dump(pso_model, out / "pso_ann_model.joblib")
    joblib.dump(base, out / "baseline_ann_model.joblib")
    save_json(metadata, out / "metadata.json")
    save_json({"test": results, "seed_study": seed_study, "unit": cfg.unit}, out / "metrics.json")
    save_json(history, out / "pso_history.json")
    save_json(importance, out / "feature_importance.json")
    save_json(test_sample, out / "test_predictions.json")
    print(f"\nArtifacts saved to ./{out}/  ->  {sorted(p.name for p in out.iterdir())}")


if __name__ == "__main__":
    main()
