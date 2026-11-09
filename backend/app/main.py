from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings

# API-dokumentationen visas inte i produktion. Schemat finns i backend/openapi.json.
_docs: dict[str, None] = (
    {"docs_url": None, "redoc_url": None, "openapi_url": None} if settings.is_production else {}
)
app = FastAPI(title="Firstflow API", version="0.1.0", **_docs)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
