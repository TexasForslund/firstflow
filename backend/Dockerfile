# Backend för lokal utveckling. Startas via docker compose i repots rot.
FROM python:3.12-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

# Beroenden först, så att de cachas mellan byggen
ENV UV_PROJECT_ENVIRONMENT=/opt/venv UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

COPY . .

EXPOSE 8000

# Kör migreringar och starta API:t med automatisk omladdning vid kodändringar
CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]
