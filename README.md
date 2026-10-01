# CropYield AI — Prediction Dashboard

> **Crop Yield Prediction using ANN optimised with Particle Swarm Optimization**  
> College mini-project · Subject: Soft Computing · SDG 2, 12, 13

---

## Project layout

```
crop-yield-app/
├── backend/
│   ├── main.py              # FastAPI app
│   ├── predictor.py         # Inference layer (do not modify)
│   ├── requirements.txt     # Pinned to scikit-learn==1.6.1
│   └── artifacts/           # Trained model files
├── frontend/                # Vite + React dashboard
└── ml/
    └── train.py             # Reference only — do not run
```

---

## Quick start

### 1 — Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API is now at `http://127.0.0.1:8000`  
Swagger docs at `http://127.0.0.1:8000/docs`

### 2 — Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard is now at `http://localhost:5173`

> **Note:** `VITE_API_URL` defaults to `http://127.0.0.1:8000`.  
> To point to a deployed backend, create `frontend/.env.local`:
> ```
> VITE_API_URL=https://your-backend.example.com
> ```

---

## Architecture

```
React (Vite)  ──HTTP/JSON──►  FastAPI  ──imports──►  predictor.py  ──loads──►  artifacts/
  localhost:5173               :8000
```

**Backend constraints:**
- `scikit-learn==1.6.1` is pinned — the `.joblib` models break across versions
- The `YieldPredictor` instance is loaded **once** at startup (not per request)
- CORS is open (`*`); tighten `allow_origins` before deploying to production
- `ValueError` from predictor → HTTP 422 with `{"detail": "…"}`

---

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness check |
| GET | `/schema` | Dynamic form definition |
| POST | `/predict` | Single prediction |
| POST | `/what-if` | Response curve for one feature |
| GET | `/metrics` | Model comparison data |
| GET | `/pso-history` | PSO convergence trace |
| GET | `/feature-importance` | Feature importance |
| GET | `/test-predictions` | Test-set actual vs predicted |
| GET | `/model-info` | Training metadata |

---

## Frontend tabs

| Tab | Content |
|-----|---------|
| **Predict** | Dynamic input form, predicted yield with 80% range, bullet gauge, PSO-ANN vs Baseline comparison, What-If explorer |
| **Model Comparison** | Bar charts for RMSE/R²/MAE, 5-seed study with error bars, honest plain-language takeaway |
| **PSO Search** | Animated convergence chart (Play/Pause/Reset), hyperparameter panel, log-log scatter, feature importance |
| **About / SDG** | Project summary, 4-step explainer, SDG 2/12/13 badges, dataset info, limitations |

---

## Key numbers to know

- R² ≈ 0.928 (log scale, single run)
- Typical error ≈ ±25% (80% empirical interval)
- PSO-ANN and Baseline ANN are **statistically tied** across 5 seeds
- Feature importance: Crop ~75%, State ~12%; others ≤ 3.5% each
- Predictions are historical-pattern estimates — not for real farming decisions

---

## Tech stack

| Layer | Choice |
|-------|--------|
| ML backend | Python, scikit-learn 1.6.1, joblib |
| API | FastAPI + Uvicorn |
| Frontend | React 18 (Vite) |
| Charts | Recharts |
| Icons | Lucide-React |
| Fonts | Inter, DM Serif Display, JetBrains Mono |
| Styling | Vanilla CSS (custom design system, dark/light mode) |
