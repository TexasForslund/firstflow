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
    # Glömt lösenord: hur länge länken i mejlet gäller.
    password_reset_lifetime_minutes: int = 60

    # Begränsning av inloggningsförsök (B6). Bara misslyckade försök räknas. Gränsen per IP är
    # hög, eftersom en hel skola ofta går ut på internet från samma IP.
    login_window_minutes: int = 15
    login_max_failures_per_email: int = 5
    login_max_failures_per_ip: int = 100
    # Glömt lösenord: varje begäran räknas, så att ingen kan fylla någons inkorg.
    password_reset_window_minutes: int = 60
    password_reset_max_per_email: int = 3
    password_reset_max_per_ip: int = 20
    # E-post. Utan SMTP_HOST skrivs mejlen till loggen i stället (bara utanför produktion).
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "Firstflow <noreply@firstflow.se>"


settings = Settings()
