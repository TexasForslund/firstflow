from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Inställningar läses från miljövariabler eller backend/.env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+psycopg://firstflow:firstflow@localhost:5432/firstflow"
    cors_origins: list[str] = ["http://localhost:5173"]

    # Inloggning. Sätt SESSION_COOKIE_SECURE=true i produktion (kräver https).
    session_cookie_name: str = "firstflow_session"
    session_cookie_secure: bool = False
    session_lifetime_days: int = 14


settings = Settings()
