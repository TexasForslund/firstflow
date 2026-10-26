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

    # Länkar i mejl pekar hit, t.ex. https://app.firstflow.se i produktion.
    frontend_url: str = "http://localhost:5173"
    invitation_lifetime_days: int = 14
    # E-post. Utan SMTP_HOST skrivs mejlen till loggen i stället (bara utanför produktion).
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "Firstflow <noreply@firstflow.se>"


settings = Settings()
