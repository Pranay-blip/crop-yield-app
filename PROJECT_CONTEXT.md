# Project Context: Crop Yield Prediction Using ANN Optimized with PSO

> Handoff document. The machine-learning part is **finished and trained**. Your job is to build the **backend API wrapper and the frontend dashboard** around it. Read this whole file before writing code.

---

## 1. Project at a glance

| Item | Value |
|---|---|
| **Title** | Crop Yield Prediction Using an Artificial Neural Network (ANN) Optimized with Particle Swarm Optimization (PSO) |
| **Context** | College mini project for the subject **Soft Computing** (graded on soft-computing content, novelty, and SDG alignment) |
| **SDGs** | SDG 2 Zero Hunger (primary), SDG 12 Responsible Consumption and Production, SDG 13 Climate Action (optional) |
| **Region / data** | India, state-level crop data, 1997 to 2020 |
| **Status** | Model trained and evaluated. Frontend and API not started. |
| **Owner's wish for the UI** | Must **look and act decent**: a polished, modern, interactive dashboard, not a basic data-app look. A basic Streamlit app was explicitly rejected as not polished enough. |

### Goal of this phase
Build a web app where a user:
1. Enters crop, season, state, year, area, and fertilizer, and gets a **predicted yield** with an uncertainty range and context.
2. Explores **what-if curves** (vary one input, see yield change).
3. Sees the **soft-computing results**: model comparison, PSO convergence, actual-vs-predicted, and feature importance.

---

## 2. What was built so far (the ML part)

### Files already written (Python, scikit-learn)
- `train.py`: trains everything and writes the `artifacts/` folder. **Reference only. Do not run or modify it for the app.**
- `predictor.py`: inference layer. Loads `artifacts/` and returns JSON-friendly dicts. **This is the backend's engine. Wrap it, do not rewrite it.**
- `requirements.txt`

### Artifacts produced by training (inside `artifacts/`)
`pso_ann_model.joblib`, `baseline_ann_model.joblib`, `metadata.json`, `metrics.json`, `pso_history.json`, `feature_importance.json`, `test_predictions.json`

The models were trained in Google Colab and exported as `artifacts.zip` (together with the three Python files).

### Dataset
Kaggle "Crop Yield in Indian States Dataset" (`crop_yield.csv`). Columns: `Crop, Crop_Year, Season, State, Area, Production, Annual_Rainfall, Fertilizer, Pesticide, Yield`.
- Original size: 19,689 rows, 55 crops, 27 states plus 3 Union Territories.
- Units: Area in hectares, Production in metric tons, Rainfall in mm, **Fertilizer and Pesticide in total kilograms (not per hectare)**.
- After cleaning and excluding Coconut: **19,412 rows**, split 70/15/15 into 13,588 train, 2,912 validation, 2,912 test (random seed 42).

### Preprocessing and modeling decisions
- Text columns stripped of trailing spaces.
- `Production` **dropped** (target leakage, since Yield = Production / Area).
- Coconut excluded (its yield is recorded in different units, which distorts everything).
- Rows with yield <= 0 removed.
- **Target is modeled as `log1p(Yield)`**. The predictor converts back with `expm1`.
- `Area`, `Fertilizer`, `Pesticide`: `log1p` then standardized. Other numerics: median impute then standardize. Categoricals: one-hot encoding.
- Model: scikit-learn `MLPRegressor` (Adam optimizer, early stopping) inside a `Pipeline` that includes preprocessing.

### The PSO part (the soft-computing core)
PSO jointly searched **ANN architecture, training settings, and which input features to keep**.
- Particle encoding: 6 hyperparameter genes plus 1 gene per input feature (feature kept if gene >= 0.5), 14 dimensions total.
- Search space: hidden layer 1 (16 to 256 neurons), hidden layer 2 (0 to 128, under 8 means single layer), learning rate (1e-4 to 1e-2, log scale), L2 alpha (1e-6 to 1e-2, log scale), activation (relu or tanh), batch size (64, 128, 256, 512), plus a binary feature mask (at least 3 features kept).
- Fitness (minimize): validation RMSE of log-yield plus 0.004 times (fraction of features used).
- Settings: 15 particles, 20 iterations, inertia decreasing 0.9 to 0.4, c1 = c2 = 1.5, velocity clamp 0.25. Search took about 18.5 minutes.
- **Best configuration found:** hidden layers (87, 67), relu, learning rate 0.00201, alpha 5.31e-6, batch 128.
- **Features selected (6 of 8):** `Crop, Season, State, Crop_Year, Area, Fertilizer`. Dropped: `Annual_Rainfall, Pesticide`.

### Final results (full data, test set, 2,912 rows)

| Model | MAE | RMSE (log) | R² (log) |
|---|---|---|---|
| Crop-average baseline (predict each crop's mean) | 2.380 | 0.4398 | 0.730 |
| Linear Regression | 2.116 | 0.4017 | 0.775 |
| Random Forest | 1.025 | 0.2401 | 0.920 |
| Baseline ANN (default-style settings, all 8 features) | 1.076 | 0.2362 | 0.922 |
| **PSO-ANN** (6 features) | 1.024 | 0.2275 | 0.928 |

Other single-run numbers: original-scale RMSE 10.654 and R² 0.495 for PSO-ANN. **Do not show original-scale RMSE or R² in the UI** (see section 8).

**5-seed repeat (the fair comparison, mean ± std):**

| Metric | Baseline ANN | PSO-ANN |
|---|---|---|
| RMSE (log) | 0.2370 ± 0.0015 | 0.2366 ± 0.0020 |
| R² (log) | 0.9216 ± 0.0010 | 0.9219 ± 0.0013 |
| MAE | 1.051 ± 0.013 | 1.079 ± 0.014 |

### Honest interpretation (the UI copy must respect this)
- The non-linear models beat linear regression clearly, and the ANNs cut error by roughly 46% against the crop-average baseline.
- **PSO-ANN and the baseline ANN are statistically tied** once random seeds vary. The single-run advantage (0.2275 vs 0.2362) came from a lucky seed. **Never claim PSO-ANN clearly beats the baseline.** The defensible claim: PSO matches the tuned baseline's accuracy using 6 of 8 inputs.
- A typical prediction is off by roughly 25% (log RMSE about 0.23).
- Feature importance is dominated by **Crop (about 75%)** and **State (about 12%)**. Fertilizer, Season, Area, and Crop_Year are each about 3%. So what-if sliders on Area, Fertilizer, and Year will move predictions only modestly. This is a real property of the model, not a bug.
- This is a historical-pattern model, not a tool for real farming decisions. The UI should say so.

---

## 3. Architecture to build

```
React frontend  --HTTP/JSON-->  FastAPI backend  --imports-->  predictor.py  --loads-->  artifacts/
```

Suggested layout:
```
crop-yield-app/
├── backend/
│   ├── main.py              # FastAPI app (to write)
│   ├── predictor.py         # provided, do not rewrite
│   ├── requirements.txt
│   └── artifacts/           # unzipped from artifacts.zip
├── frontend/                # Vite + React (to write)
└── ml/
    └── train.py             # reference only
```

### Recommended frontend stack (proposed, owner has not locked it in)
React (Vite) + Tailwind CSS + shadcn/ui for components, Recharts (or Plotly.js) for charts, optional Framer Motion for animation. Backend: FastAPI + Uvicorn. Free hosting idea: frontend on Vercel or Netlify, backend on Render or Railway. If you have a strong reason to propose a different stack, do so, but keep the "polished and interactive" requirement.

### Important backend constraints
- **Pin the same scikit-learn version that trained the models.** `.joblib` files break across versions. The training happened in Google Colab. **Get the version by running `import sklearn; print(sklearn.__version__)` in the Colab notebook** and pin it in `backend/requirements.txt`. The local environment used for testing the code had scikit-learn 1.8.0, pandas 3.0.2, and numpy 2.4.4, but the Colab version is what matters for the saved models.
- Load `YieldPredictor("artifacts")` once at startup, not per request.
- Enable CORS for the frontend origin.
- `predictor.py` raises `ValueError` with clear messages for bad input. Convert these to HTTP 422 with the message in the response body so the UI can show it.

---

## 4. The `predictor.py` interface (the contract)

```python
from predictor import YieldPredictor
yp = YieldPredictor("artifacts")

yp.schema()                                   # form definition
yp.predict(inputs: dict)                      # prediction + context
yp.what_if(inputs, feature, values=None, n=25)# response curve
yp.metrics()                                  # contents of metrics.json
yp.pso_history()                              # contents of pso_history.json
yp.feature_importance()                       # contents of feature_importance.json
yp.test_predictions()                         # contents of test_predictions.json
yp.model_info()                               # trained_at, row counts, features, hyperparameters, PSO settings, interval info
```

### Proposed API endpoints
| Method and path | Calls | Purpose |
|---|---|---|
| `GET /health` | n/a | liveness check |
| `GET /schema` | `schema()` | build the input form dynamically |
| `POST /predict` | `predict(body)` | single prediction |
| `POST /what-if` | `what_if(...)` | body: `{inputs, feature, values?, n?}`. POST because the full input row is needed. |
| `GET /metrics` | `metrics()` | model comparison data |
| `GET /pso-history` | `pso_history()` | convergence chart |
| `GET /feature-importance` | `feature_importance()` | importance chart |
| `GET /test-predictions` | `test_predictions()` | scatter plot |
| `GET /model-info` | `model_info()` | "About the model" panel |

### Response shapes

**`schema()`**
```json
{
  "unit": "t/ha",
  "required": [
    {"name": "Crop", "label": "Crop", "type": "select", "options": ["Arecanut", "..."], "default": "Rice"},
    {"name": "Crop_Year", "label": "Crop Year", "type": "number", "min": 1997, "max": 2020, "default": 2010, "step": 1, "typical_low": 1998, "typical_high": 2019}
  ],
  "optional": [ {"name": "Annual_Rainfall", "...": "..."} ],
  "note": "Optional fields are ignored by the PSO-ANN; provide them only to also get the baseline ANN comparison."
}
```
Required fields are the 6 features the PSO-ANN uses: Crop, Season, State, Crop_Year, Area, Fertilizer. Optional fields: Annual_Rainfall, Pesticide. Always read real min/max/options from `/schema`, never hardcode.

**`predict()`** (real example from the trained model: Rice, Kharif, Karnataka, 2010, Area 9299, Fertilizer 1228930.98, Rainfall 1247, Pesticide 2415.495)
```json
{
  "prediction": 1.609,
  "unit": "t/ha",
  "interval": {"low": 1.242, "high": 2.08, "level": 0.8},
  "reference": {"label": "Rice", "average": 2.218, "typical_low": 1.634, "typical_high": 2.73},
  "vs_average_pct": -27.5,
  "rating": "Below typical",
  "baseline_prediction": 2.199,
  "used_features": ["Crop", "Season", "State", "Crop_Year", "Area", "Fertilizer"],
  "warnings": []
}
```
- `interval` is an empirical 80% band from test-set residuals.
- `rating` is one of `"Below typical"`, `"Typical"`, `"Above typical"` (relative to the crop's 25th to 75th percentile).
- `baseline_prediction` is `null` unless **all 8** fields are sent (the baseline ANN needs all features).
- `warnings` holds strings such as "value outside the range seen in training". Show them visibly.
- Input matching is forgiving (case and whitespace-insensitive for categories). Missing required fields raise `ValueError`.
- Note the two models disagreed by about 27% on this example. The UI should show both numbers and treat large disagreement as a signal of uncertainty.

**`what_if()`**
```json
{
  "feature": "Crop_Year", "type": "number", "unit": "t/ha", "current": 2010.0,
  "points": [{"x": 1998.0, "yield": 1.521}, {"x": 2003.25, "yield": 1.739}],
  "warnings": []
}
```
- Only the 6 selected features are valid. **`Annual_Rainfall` and `Pesticide` raise `ValueError`**, so the UI must not offer them.
- Numeric features sweep the 5th to 95th percentile. Categorical features (`type: "category"`) return one point per option (use a bar chart).
- Curves can be non-monotonic and noisy. That is expected.

**`metrics.json`**
```json
{
  "unit": "t/ha",
  "test": {
    "PSO-ANN": {"rmse": 10.654, "mae": 1.024, "r2": 0.495, "rmse_log": 0.2275, "r2_log": 0.928, "train_seconds": 5.78, "search_seconds": 1106.9},
    "Baseline ANN": {"...": "..."}, "Random Forest": {"...": "..."}, "Linear Regression": {"...": "..."}
  },
  "seed_study": {
    "Baseline ANN": {"rmse_log": {"mean": 0.2370, "std": 0.0015}, "mae": {"mean": 1.051, "std": 0.013}, "r2_log": {"mean": 0.9216, "std": 0.0010}, "rmse": {"mean": 10.747, "std": 0.054}, "r2": {"mean": 0.486, "std": 0.005}},
    "PSO-ANN": {"...": "..."}
  }
}
```
(The crop-average baseline numbers in section 2 are not stored in `metrics.json`. If you want them in the UI, hardcode or add them to the API response as static values.)

**`pso_history.json`**: list of `{"iteration": 0..20, "best": float, "mean": float, "worst": float}`. Best goes from about 0.2487 to 0.2292. The swarm mean starts near 0.54 and settles near 0.24, with spikes (normal exploration).

**`feature_importance.json`**: list of `{"feature": "Crop", "importance_pct": float}` sorted descending, covering only the 6 selected features.

**`test_predictions.json`**: `{"unit", "actual": [...], "pso_ann": [...], "baseline_ann": [...], "crop": [...]}` with up to 400 test points.

### `metadata.json` (used inside `predictor.py`, also useful for the About panel)
Keys: `trained_at`, `target`, `unit`, `target_transform`, `rows {total, train, val, test}`, `features {all, selected, dropped_by_pso, categorical, numeric}`, `numeric {col: {min, max, p5, p95, mean, median, integer, step, non_negative}}`, `categorical {col: [options]}`, `categorical_defaults`, `crop_stats {crop: {mean, median, p25, p75, n}, "__overall__": {...}}`, `hyperparameters {pso_ann, baseline_ann}`, `interval {level, log_lower, log_upper, note}`, `pso_settings`.

---

## 5. Frontend requirements

### Pages or tabs
1. **Predict**
   - Left: dynamic input form built from `/schema` (selects for Crop, Season, State; number inputs for Year, Area, Fertilizer). Rainfall and Pesticide sit in an "advanced / optional" section, used only to unlock the baseline comparison.
   - Right: large predicted yield with unit, the 80% range, a gauge or bullet chart against the crop's typical range and average, a "Below / Typical / Above typical" badge with the percentage versus average, the baseline ANN prediction shown beside the PSO-ANN prediction, and a warnings area.
   - Below: **what-if explorer** with a feature picker (only Crop_Year, Area, Fertilizer, plus categorical Crop, Season, State) and a live line or bar chart. Mark the current value on the chart.
2. **Model Comparison**
   - Bar chart comparing the four models plus the crop-average baseline on **log RMSE** and **R² (log)**, with a toggle for MAE.
   - The 5-seed table with mean ± std (use error bars).
   - Short plain-language takeaway following the honest interpretation in section 2.
3. **PSO Search**
   - Convergence line chart (best vs swarm mean). **Animate it iteration by iteration** with a play button.
   - Panel with the best hyperparameters, selected vs dropped features, PSO settings, and search time.
   - Actual vs predicted scatter plot on **log-log axes** (see section 8).
   - Feature importance bar chart.
4. **About / SDG**: project summary, how it works in 4 steps, SDG 2, 12, and 13 badges, dataset source, and limitations.

### Quality bar (this is a stated requirement)
- Modern design with consistent spacing, typography, and a restrained color palette, plus **dark mode**.
- Responsive (works on a phone).
- Loading skeletons, friendly error messages, and empty states.
- Smooth transitions and animated charts where they add value, with accessible contrast and keyboard-friendly controls.
- Numeric inputs for Area and Fertilizer take very large values (for example 9,299 ha and 1,228,931 kg). Format them with thousands separators, and consider a log-scale slider or helper text.
- Do not leave it looking like a default template.

### Suggested UI headline copy (must stay consistent with the honest numbers)
- "Explains about 93% of yield variation (log scale)."
- "Typical error: about ±25%."
- "Prediction range: 80% of test cases fall inside this band."
- "Uses 6 of 8 inputs, found by Particle Swarm Optimization."

### Required disclaimer (visible in the UI)
"Estimates are based on historical state-level patterns and are not a substitute for local agronomic advice."

---

## 6. Known data caveats to surface or handle

- The `unit` is labelled `t/ha` by assumption (Production / Area). Some crops may use other units. Keep the label but do not over-claim.
- **One test row has an actual yield near 340 with a prediction near 0.** It wrecks linear scatter plots and inflates original-scale RMSE. Use **log-log axes** for the actual-vs-predicted chart.
- Feature selection is data-dependent. An earlier 8,000-row sample run selected a different subset (Crop, Season, State, Crop_Year). Do not assume the selected features are fixed. Always read them from `/schema` and `/model-info`.

---

## 7. Do and don't for the AI agent

**Do**
- Build the FastAPI wrapper and the React dashboard.
- Start the frontend against mock JSON that matches section 4, then switch to the real API.
- Read all form options, ranges, and feature lists from the API.
- Keep the UI text consistent with the honest interpretation in section 2.

**Don't**
- Don't retrain, re-tune, or modify the model, `train.py`, or the saved artifacts.
- Don't rewrite `predictor.py` logic. Small additions (for example a helper to expose static numbers) are fine, but explain them.
- Don't show original-scale RMSE or R² as headline metrics.
- Don't claim PSO-ANN beats the baseline ANN.
- Don't offer Rainfall or Pesticide in the what-if tool.
- Don't use a Streamlit or Gradio app for the final UI.

---

## 8. Definition of done

- [ ] Backend runs locally with the saved artifacts and the pinned scikit-learn version, all endpoints in section 3 working, with CORS and 422 error handling.
- [ ] Predict tab returns and visualizes prediction, range, reference comparison, rating, baseline comparison, and warnings.
- [ ] What-if explorer works for all 6 valid features.
- [ ] Model Comparison and PSO Search tabs show real data with the honest takeaways.
- [ ] Animated convergence chart and log-log scatter plot working.
- [ ] Dark mode, responsive layout, loading and error states.
- [ ] README with run instructions (backend and frontend) and a short architecture note.
- [ ] Optional: deployed (frontend on Vercel or Netlify, backend on Render or Railway) with a public link.

---

## 9. Outside this phase (handled separately by the owner)
College report, presentation slides, and viva preparation. The UI's About tab and screenshots will feed into those.

---

## 10. First prompt to give the AI agent

> Read `PROJECT_CONTEXT.md` fully. The ML model is already trained; do not touch it. First, set up the project layout from section 3, write `backend/main.py` (FastAPI) wrapping `predictor.py` with the endpoints listed, and confirm it runs against the files in `backend/artifacts/`. Then build the React frontend per section 5, starting with mock data that matches the response shapes in section 4. Before coding the UI, show me a short plan: the component list, the chart library you will use, and the visual style (palette, typography, layout). Ask me if anything in the context file is unclear.
