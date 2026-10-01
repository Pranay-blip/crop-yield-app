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

# ---------------------------------------------------------------------------
# Static crop market prices (India MSP / market averages, 2019-20 season)
# Source: CACP MSP 2019-20; non-MSP crops use published market averages.
# All values in ₹ per metric ton.
# ---------------------------------------------------------------------------
CROP_PRICES: dict[str, int] = {
    "Arecanut":               350000,
    "Bajra":                   20900,
    "Banana":                  20000,
    "Barley":                  16350,
    "Black pepper":           350000,
    "Cardamom":               800000,
    "Cashewnut":              100000,
    "Castor seed":             51000,
    "Coriander":               63100,
    "Cotton(lint)":            55000,
    "Cowpea(Lobia)":           50000,
    "Dry chillies":           120000,
    "Garlic":                  30000,
    "Ginger":                  45000,
    "Gram":                    48750,
    "Groundnut":               50900,
    "Guar seed":               44880,
    "Horse-gram":              40000,
    "Jowar":                   25500,
    "Jute":                    39500,
    "Khesari":                 30000,
    "Linseed":                 46000,
    "Maize":                   17600,
    "Masoor":                  44750,
    "Mesta":                   35000,
    "Moong(Green Gram)":       71960,
    "Moth":                    40000,
    "Niger seed":              57650,
    "Oilseeds total":          50000,
    "Onion":                   20000,
    "Other  Rabi pulses":      40000,
    "Other Cereals":           20000,
    "Other Kharif pulses":     50000,
    "Other Summer Pulses":     50000,
    "Peas & beans (Pulses)":   50000,
    "Potato":                  12000,
    "Ragi":                    32950,
    "Rapeseed &Mustard":       44250,
    "Rice":                    18150,
    "Safflower":               49450,
    "Sannhamp":                35000,
    "Sesamum":                 64850,
    "Small millets":           20000,
    "Soyabean":                37100,
    "Sugarcane":                2850,
    "Sunflower":               58650,
    "Sweet potato":            10000,
    "Tapioca":                  4000,
    "Tobacco":                175000,
    "Turmeric":                85000,
    "Urad":                    60000,
    "Wheat":                   19250,
    "other oilseeds":          50000,
}

DEFAULT_FERTILIZER_COST_PER_KG = 15.0   # ₹/kg blended NPK average
DEFAULT_OTHER_COST_PER_HA      = 12000.0 # ₹/ha  (seed + labour + irrigation)

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


class CompareCropsRequest(BaseModel):
    """Body for POST /compare-crops.
    Send the 5 non-Crop required fields; the endpoint iterates over all crops.
    Optional overrides for cost assumptions.
    """
    inputs: dict[str, Any]                        # must include Season, State, Crop_Year, Area, Fertilizer
    fertilizer_cost_per_kg: float = DEFAULT_FERTILIZER_COST_PER_KG
    other_cost_per_ha:      float = DEFAULT_OTHER_COST_PER_HA
    custom_prices:          dict[str, float] | None = None  # override per-crop price


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


# ---------------------------------------------------------------------------
# Profitability endpoints
# ---------------------------------------------------------------------------
@app.get("/crop-prices", tags=["Economics"])
def crop_prices():
    """Return the static crop market price table (₹/ton, India MSP 2019-20).
    Also returns default cost assumptions used by /compare-crops."""
    return {
        "prices": CROP_PRICES,
        "unit": "INR_per_ton",
        "defaults": {
            "fertilizer_cost_per_kg": DEFAULT_FERTILIZER_COST_PER_KG,
            "other_cost_per_ha":      DEFAULT_OTHER_COST_PER_HA,
        },
        "note": "Prices are indicative MSP / market averages for 2019-20. Override via /compare-crops custom_prices.",
    }


@app.post("/compare-crops", tags=["Economics"])
def compare_crops(body: CompareCropsRequest):
    """Predict yield for EVERY crop under fixed Season/State/Year/Area/Fertilizer,
    then compute gross revenue, costs, and net profit for each.
    Returns results ranked by net profit descending.
    """
    schema = predictor.schema()
    all_crops = next(
        (f["options"] for f in schema["required"] if f["name"] == "Crop"), []
    )

    area       = float(body.inputs.get("Area", 0) or 0)
    fertilizer = float(body.inputs.get("Fertilizer", 0) or 0)
    fert_cost  = body.fertilizer_cost_per_kg
    other_cost = body.other_cost_per_ha
    prices     = {**CROP_PRICES, **(body.custom_prices or {})}

    fertilizer_spend = fertilizer * fert_cost
    other_spend      = area * other_cost
    total_fixed_cost = fertilizer_spend + other_spend

    results = []
    for crop in all_crops:
        try:
            row = {**body.inputs, "Crop": crop}
            pred = predictor.predict(row)
            yield_per_ha       = pred["prediction"]
            total_production   = yield_per_ha * area
            price_per_ton      = prices.get(crop, 20000)
            gross_revenue      = total_production * price_per_ton
            net_profit         = gross_revenue - total_fixed_cost
            roi_pct            = (net_profit / total_fixed_cost * 100) if total_fixed_cost > 0 else 0
            breakeven_yield    = (total_fixed_cost / (area * price_per_ton)) if (area * price_per_ton) > 0 else 0
            results.append({
                "crop":               crop,
                "yield_per_ha":       round(yield_per_ha, 3),
                "total_production":   round(total_production, 1),
                "price_per_ton":      price_per_ton,
                "gross_revenue":      round(gross_revenue, 0),
                "fertilizer_spend":   round(fertilizer_spend, 0),
                "other_spend":        round(other_spend, 0),
                "total_cost":         round(total_fixed_cost, 0),
                "net_profit":         round(net_profit, 0),
                "roi_pct":            round(roi_pct, 1),
                "breakeven_yield":    round(breakeven_yield, 3),
                "interval":           pred["interval"],
                "rating":             pred["rating"],
                "warnings":           pred["warnings"],
            })
        except Exception:
            # Skip crops the model cannot handle
            pass

    results.sort(key=lambda r: r["net_profit"], reverse=True)
    for i, r in enumerate(results):
        r["rank"] = i + 1

    return {
        "results": results,
        "area":              area,
        "fertilizer":        fertilizer,
        "fertilizer_spend":  round(fertilizer_spend, 0),
        "other_spend":       round(other_spend, 0),
        "total_fixed_cost":  round(total_fixed_cost, 0),
        "unit":              "INR",
        "yield_unit":        "t/ha",
    }
