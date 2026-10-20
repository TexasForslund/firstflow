# Firstflow – instruktioner för Claude

Firstflow är en plattform för APL (arbetsplatsförlagt lärande) för skolor, lärare, elever och handledare. Produktvisionen finns i [docs/produktvision-och-roadmap.md](docs/produktvision-och-roadmap.md). Läs den innan du föreslår nya funktioner.

## Språk

- Skriv på **svenska**: commit-meddelanden, PR-beskrivningar, dokumentation, kodkommentarer och all text som användaren ser.
- Kod (variabler, funktioner, filnamn, API-sökvägar) skrivs på **engelska**. Exempel: `Student`, `/api/attendance`, men texten "Närvaro" i gränssnittet.

## Teamet

Två utvecklarpar: **Texas + Claude** och **Hannes + Claude**.

| Texas + Claude | Hannes + Claude |
|---|---|
| B1b (multi-tenant + roller) | B3 (praktikperiod och APL-plats) |
| B2 (klasser och elever) | B4 (närvaro och incheckning) |
| F1–F3 (designsystem, inloggning, klassvy) | B5 (frågor och redovisning) |
| F4–F6 (APL-vy, incheckning, demo) | B6 (inbjudningar, pilot-prep) |

Ändra inte i den andres pågående feature-branch utan att det framgår tydligt i PR:en. Vid konflikt: prata i Discord innan du mergar.

Vad som är näst på tur står i [att-gora/](att-gora/README.md): `backend.md` och `frontend.md`. Läs mappen innan du börjar en ny uppgift och uppdatera uppgiftens status i samma PR.

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
- Databassession i en endpoint: ta emot `db: DbSession` från `app/db/session.py`.
- Varje endpoint får minst ett test i `tests/`. Använd fixturen `client` (och `db` vid behov) från `tests/conftest.py`. Testerna körs mot databasen `firstflow_test` och varje test rullas tillbaka.
- CI kör `alembic check`, så en ändrad modell utan migrering stoppar PR:en.

Frontend:
- Följ [docs/design/designprofil.md](docs/design/designprofil.md) och skisserna i `docs/design/`. **Inga skuggor**, om inte Texas säger annat. Ändringar i designkonceptet beslutas av Texas.
- Lärare och handledare: dator först med sidomeny. Elever: mobilen först, i stil med sociala medier.
- Datahämtning sker med TanStack Query (`useQuery`, `useMutation`).

## Säkerhet och elevdata

Firstflow hanterar personuppgifter om elever, ofta minderåriga.
- Samla bara in data som funktionen faktiskt behöver.
- Varje endpoint som rör elevdata ska kontrollera att användaren har rätt roll och rätt koppling till eleven.
- Inloggad användare: `user: CurrentUser` från `app/api/deps.py`. Rollkrav: `Annotated[User, Depends(require_roles(UserRole.TEACHER))]`. Rollen räcker inte för elevdata, kopplingen till eleven måste också kontrolleras.
- Inloggningen är en httpOnly-cookie (`firstflow_session`). Frontend skickar den automatiskt eftersom `/api` går via samma origin.
- **Multi-tenant:** varje skola är en tenant. Varje endpoint som rör en skolas data anropar `require_same_school(user, school_id)` från `app/api/deps.py` utöver rollkontrollen. Se [docs/multi-tenant-och-roller.md](docs/multi-tenant-och-roller.md).
- Ingen kan registrera sig själv. Konton skapas uppifrån: superadmin skapar skolor och skoladmins, skoladmin skapar personal och elever. Använd `create_account` i `app/services/accounts.py`.
- Konton kan skapas med `uv run python -m scripts.create_user --email ... --name ... --role <roll> --school-id <uuid>` (`--list-schools` visar id:n). Demodata: `uv run python -m scripts.seed_demo`.
- Hemligheter ligger i `.env` och committas aldrig. `.env.example` visar vilka variabler som finns.
- Logga aldrig personnummer, namn eller annan elevdata.
