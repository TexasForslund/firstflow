"""Skriver API:ets OpenAPI-schema till backend/openapi.json.

Frontend genererar sina TypeScript-typer från den filen (npm run gen:api).
Kör från backend/: uv run python -m scripts.export_openapi
"""

import json
from pathlib import Path

from app.main import app

OUTPUT = Path(__file__).resolve().parent.parent / "openapi.json"

OUTPUT.write_text(json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"Skrev {OUTPUT}")
