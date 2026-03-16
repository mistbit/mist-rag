from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from .schemas import RagOverview


REPO_ROOT = Path(__file__).resolve().parents[3]
OVERVIEW_PATH = REPO_ROOT / "packages" / "shared" / "rag-overview.json"


@lru_cache(maxsize=1)
def load_overview() -> RagOverview:
    with OVERVIEW_PATH.open("r", encoding="utf-8") as file:
        payload = json.load(file)
    return RagOverview.model_validate(payload)

