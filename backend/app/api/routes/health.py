from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import DbSession

router = APIRouter(tags=["system"])


class HealthResponse(BaseModel):
    status: Literal["ok"]
    database: Literal["ok", "unavailable"]


@router.get("/health", response_model=HealthResponse)
def health(db: DbSession) -> HealthResponse:
    try:
        db.execute(text("SELECT 1"))
        database = "ok"
    except SQLAlchemyError:
        database = "unavailable"
    return HealthResponse(status="ok", database=database)
