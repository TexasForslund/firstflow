# Firstflow – instruktioner för Claude

Firstflow är en plattform för APL (arbetsplatsförlagt lärande) för skolor, lärare, elever och handledare. Produktvisionen finns i [docs/produktvision-och-roadmap.md](docs/produktvision-och-roadmap.md). Läs den innan du föreslår nya funktioner.

## Språk

- Skriv på **svenska**: commit-meddelanden, PR-beskrivningar, dokumentation, kodkommentarer och all text som användaren ser.
- Kod (variabler, funktioner, filnamn, API-sökvägar) skrivs på **engelska**. Exempel: `Student`, `/api/attendance`, men texten "Närvaro" i gränssnittet.

## Teamet

Två utvecklare med var sitt Claude-konto. Hannes äger `backend/`, kollegan äger `frontend/`. Ändra inte i den andra delen utan att det framgår tydligt i PR:en.

## Struktur

```
backend/    Python 3.12, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL (uv som pakethanterare)
frontend/   TypeScript, React, Vite, TanStack Query, openapi-fetch
docs/       Produktvision och annan dokumentation
```

## API-kontraktet

Backend och frontend hänger ihop via OpenAPI-schemat i `backend/openapi.json`.

1. Ändrar du ett API i backend: kör `uv run python -m scripts.export_openapi` i `backend/` och committa `openapi.json`.
2. Frontend genererar typer med `npm run gen:api` i `frontend/` och committar `src/api/schema.d.ts`.
3. CI stoppar en PR om någon av filerna är inaktuell.

Anropa backend bara via `api` i `frontend/src/api/client.ts`, så att anropen är typade. Skriv aldrig egna typer för API-svar för hand.

## Kommandon

Backend (i `backend/`):

```
uv sync                                  # installera beroenden
uv run uvicorn app.main:app --reload     # starta API:t på http://localhost:8000
uv run pytest                            # tester
uv run ruff check . && uv run ruff format .
uv run alembic revision --autogenerate -m "beskrivning"
uv run alembic upgrade head
```

Frontend (i `frontend/`):

```
npm install
npm run dev        # http://localhost:5173, /api skickas vidare till backend
npm run lint
npm run build      # typkontroll + bygge
npm run gen:api
```

Databas: `docker compose up -d db` i repots rot.

## Konventioner

Backend:
- Nya endpoints läggs i `app/api/routes/<område>.py` och registreras i `app/api/router.py`. Alla ligger under `/api`.
- Varje endpoint har en Pydantic-modell för svar (`response_model`) och för indata.
- Databasmodeller ärver `Base` från `app/db/base.py` och importeras i `app/db/models.py` så att Alembic hittar dem.
- Ändra aldrig databasen utan en Alembic-migrering.
- Varje endpoint får minst ett test i `tests/`.

Frontend:
- Mobilen först. Elever och handledare använder Firstflow ute på arbetsplatsen.
- Datahämtning sker med TanStack Query (`useQuery`, `useMutation`).

## Säkerhet och elevdata

Firstflow hanterar personuppgifter om elever, ofta minderåriga.
- Samla bara in data som funktionen faktiskt behöver.
- Varje endpoint som rör elevdata ska kontrollera att användaren har rätt roll och rätt koppling till eleven.
- Hemligheter ligger i `.env` och committas aldrig. `.env.example` visar vilka variabler som finns.
- Logga aldrig personnummer, namn eller annan elevdata.
