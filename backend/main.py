"""
FastAPI backend for the Crop Yield Prediction app.

Wraps predictor.YieldPredictor with REST endpoints.  The predictor is
loaded once at startup to avoid re-reading disk on every request.

Run:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from predictor import YieldPredictor

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lifespan – load the predictor once at startup
# ---------------------------------------------------------------------------
predictor: YieldPredictor | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global predictor
    logger.info("Loading YieldPredictor from 'artifacts/'...")
    predictor = YieldPredictor("artifacts")
    logger.info("YieldPredictor ready.")
    yield
    predictor = None


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Crop Yield Prediction API",
    description=(
        "FastAPI wrapper around a scikit-learn ANN optimised with PSO. "
        "Endpoints match the predictor.YieldPredictor interface."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Allow the Vite dev server and any future deployed origin.
# In production restrict to the exact frontend URL.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten before deploying
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Global ValueError -> 422
# ---------------------------------------------------------------------------
@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=422,
        content={"detail": str(exc)},
    )

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
class PredictRequest(BaseModel):
    """Body for POST /predict.  Keys must match predictor field names."""
    inputs: dict[str, Any]


class WhatIfRequest(BaseModel):
    """Body for POST /what-if."""
    inputs: dict[str, Any]
    feature: str
    values: list[Any] | None = None
    n: int = 25


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health", tags=["Utility"])
def health():
    """Liveness probe."""
    return {"status": "ok"}


@app.get("/schema", tags=["Form"])
def schema():
    """Return the input-form definition: required fields (PSO model) and
    optional fields (baseline ANN only).  Includes types, ranges, defaults,
    and dropdown options – the frontend must NOT hardcode these."""
    return predictor.schema()


@app.post("/predict", tags=["Inference"])
def predict(body: PredictRequest):
    """Single prediction.  Send the 6 required fields (from /schema) and
    optionally the 2 optional fields to also receive a baseline ANN prediction.

    Returns prediction, 80 % interval, crop reference stats, rating,
    baseline_prediction (null unless all 8 fields sent), and warnings.
    """
    try:
        return predictor.predict(body.inputs)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@app.post("/what-if", tags=["Inference"])
def what_if(body: WhatIfRequest):
    """Response curve: vary one feature over its training range while holding
    the rest fixed.  Only the 6 PSO-selected features are accepted; passing
    Annual_Rainfall or Pesticide will raise a 422.
    """
    try:
        return predictor.what_if(
            body.inputs,
            body.feature,
            values=body.values,
            n=body.n,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@app.get("/metrics", tags=["Model data"])
def metrics():
    """Return metrics.json: single-run and 5-seed-study results for all models.
    Note: original-scale RMSE and R² are present in the raw data but the UI
    must NOT surface them as headline metrics (log-scale metrics only)."""
    return predictor.metrics()


@app.get("/pso-history", tags=["Model data"])
def pso_history():
    """PSO convergence trace: list of {iteration, best, mean, worst}."""
    return predictor.pso_history()


@app.get("/feature-importance", tags=["Model data"])
def feature_importance():
    """Permutation-based feature importances for the 6 selected features."""
    return predictor.feature_importance()


@app.get("/test-predictions", tags=["Model data"])
def test_predictions():
    """Up to 400 test-set rows: actual, pso_ann prediction, baseline_ann
    prediction, and crop label.  Use log-log axes when plotting."""
    return predictor.test_predictions()


@app.get("/model-info", tags=["Model data"])
def model_info():
    """Summary of training config: trained_at, row counts, selected features,
    hyperparameters, PSO settings, and interval metadata."""
    return predictor.model_info()
