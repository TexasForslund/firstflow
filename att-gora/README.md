# Att göra

Här står vad som är näst på tur i Firstflow, i prioritetsordning. Båda utvecklarna och deras Claude läser och uppdaterar mappen.

| Fil | Vem | Innehåll |
| --- | --- | --- |
| [backend.md](backend.md) | Hannes (B3–B6), Texas (B1b, B2) | Uppgifter i `backend/`: modeller, migreringar, endpoints, tester |
| [frontend.md](frontend.md) | Texas | Uppgifter i `frontend/`: vyer, komponenter, anrop mot API:t |

Ordningen följer fas 1 i [roadmapen](../docs/produktvision-och-roadmap.md): inloggning, klasser och elever, praktikperiod och APL-plats, närvaro, frågor och redovisning.

## Instruktion till Claude

Läs den här filen och din egen uppgiftsfil innan du börjar.

1. Ta den översta uppgiften i din fil som inte är klar. Hoppa inte över en uppgift utan att fråga.
2. Står det **Väntar på** under uppgiften, kontrollera att den uppgiften i den andra filen är markerad som klar och mergad till `main`. Är den inte det, säg det till användaren i stället för att gissa hur API:t ser ut.
3. Bygg det som står under **Gör så här**. **Klart när** är kraven som ska vara uppfyllda innan PR:en öppnas.
4. Ändra status på uppgiften i samma PR (se statusarna nedan). Rör bara den andra partens fil om en uppgift där behöver ändras, och skriv i så fall det i PR-beskrivningen.
5. Hittar du något som behöver göras men som inte står här, lägg till det sist i rätt fil i stället för att bygga det direkt.

Statusar:

- ⬜ Inte påbörjad
- 🚧 Pågår (skriv PR-länken)
- ✅ Klar (skriv PR-numret)

## Så hänger backend och frontend ihop

API-kontraktet är `backend/openapi.json`. Frontend skriver aldrig egna typer för API:t.

1. **Backend** bygger endpoints, kör `uv run python -m scripts.export_openapi` och committar `openapi.json`. Varje backenduppgift beskriver de endpoints som frontend ska använda, så att båda vet vad som kommer innan koden finns.
2. **Frontend** hämtar `main`, kör `npm run gen:api` och använder de nya typerna via `api` i `src/api/client.ts`.
3. Inloggningen är en httpOnly-cookie som webbläsaren skickar automatiskt. Under utveckling går `/api` via Vite-proxyn till `localhost:8000`, så frontend och backend har samma origin och inget extra behövs i anropen.
4. Felkoder: `401` betyder inte inloggad (visa inloggningssidan), `403` betyder inloggad men utan behörighet, `422` betyder fel i indata. Felmeddelandet finns i `detail`.

## Köra hela kedjan lokalt

```
docker compose up -d db
cd backend && uv run alembic upgrade head && uv run python -m scripts.seed_demo   # demodata, när B2 är klar
uv run uvicorn app.main:app --reload
cd ../frontend && npm run dev
```

Tills `scripts.seed_demo` finns skapar du ett konto med `uv run python -m scripts.create_user --email larare@demo.se --name "Demo Lärare" --role teacher`.
