from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Inställningar läses från miljövariabler eller backend/.env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+psycopg://firstflow:firstflow@localhost:5432/firstflow"
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
