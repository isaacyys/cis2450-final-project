"""Long-running CatBoost predictor subprocess.

Protocol
--------
stdin : one JSON object per line: {"id": <int>, "features": {<name>: <value>, ...}}
stdout: one JSON object per line:
          ready line : {"ready": true, "feature_names": [...], "cat_features": [...]}
          response   : {"id": <int>, "probability": <float 0..1>}
          error      : {"id": <int|null>, "error": "<message>"}

All numeric features are coerced to float (NaN -> 0). Categorical features
are coerced to string. Unknown feature names are ignored; missing required
features fall back to the neutral defaults established in the training query
(e.g. VISIBILITY -> 10, AIR_TEMP -> 20, PRESSURE -> 1013.25). Categorical
values that were never seen by the model are still accepted by CatBoost.
"""

import json
import math
import os
import sys
import traceback

import pandas as pd
from catboost import CatBoostClassifier


# Match the COALESCE defaults used in the training SQL so an unavailable
# feature still lands on the same "neutral" value the model was trained on.
NUMERIC_DEFAULTS = {
    "DAY_OF_MONTH": 15,
    "DISTANCE": 1000.0,
    "MONTH_SIN": 0.0,
    "MONTH_COS": 1.0,
    "DEP_HOUR_SIN": 0.0,
    "DEP_HOUR_COS": 1.0,
    "ORIGIN_HOURLY_TRAFFIC": 10.0,
    "ORIGIN_WIND_SPEED": 0.0,
    "ORIGIN_WIND_GUST": 0.0,
    "ORIGIN_WIND_ANGLE": 0.0,
    "ORIGIN_VISIBILITY": 10.0,
    "ORIGIN_AIR_TEMP": 20.0,
    "ORIGIN_DEW_POINT_TEMP": 20.0,
    "ORIGIN_PRESSURE": 1013.25,
    "ORIGIN_PRECIPITATION": 0.0,
    "ORIGIN_IS_CLEAR_CEILING": 1,
    "ORIGIN_CEILING_HEIGHT": 20000.0,
    "ORIGIN_HAS_THUNDERSTORM": 0,
    "ORIGIN_HAS_GUST": 0,
    "ORIGIN_HAS_CLOUDS": 0,
    "DEST_WIND_SPEED": 0.0,
    "DEST_VISIBILITY": 10.0,
    "DEST_PRECIPITATION": 0.0,
    "DEST_IS_CLEAR_CEILING": 1,
    "DEST_CEILING_HEIGHT": 20000.0,
    "DEST_HAS_THUNDERSTORM": 0,
}


def _emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def _safe_float(value, default: float) -> float:
    if value is None:
        return float(default)
    try:
        f = float(value)
    except (TypeError, ValueError):
        return float(default)
    if math.isnan(f) or math.isinf(f):
        return float(default)
    return f


def _safe_str(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def main() -> None:
    model_path = os.environ.get(
        "CATBOOST_MODEL_PATH",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "catboost_model.bin"),
    )

    model = CatBoostClassifier()
    model.load_model(model_path)

    feature_names = list(model.feature_names_)
    cat_indices = set(model.get_cat_feature_indices())
    cat_features = {feature_names[i] for i in cat_indices}

    _emit({
        "ready": True,
        "feature_names": feature_names,
        "cat_features": sorted(cat_features),
        "model_path": os.path.abspath(model_path),
    })

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            incoming = req.get("features") or {}

            row = {}
            for name in feature_names:
                raw = incoming.get(name)
                if name in cat_features:
                    row[name] = _safe_str(raw)
                else:
                    row[name] = _safe_float(raw, NUMERIC_DEFAULTS.get(name, 0.0))

            df = pd.DataFrame([row], columns=feature_names)
            for name in cat_features:
                df[name] = df[name].astype(str)

            proba = model.predict_proba(df)
            # Binary classifier: probability of class 1 = "delayed".
            positive_class_index = 1 if proba.shape[1] > 1 else 0
            probability = float(proba[0][positive_class_index])

            _emit({
                "id": req_id,
                "probability": probability,
                "features_used": row,
            })
        except Exception as exc:  # pragma: no cover - defensive
            _emit({
                "id": req_id,
                "error": f"{type(exc).__name__}: {exc}",
                "trace": traceback.format_exc(limit=3),
            })


if __name__ == "__main__":
    main()
