# Att göra

Här står vad som är näst på tur i Firstflow, i prioritetsordning. Båda utvecklarna och deras Claude läser och uppdaterar mappen.

| Fil | Vem | Innehåll |
| --- | --- | --- |
| [backend.md](backend.md) | Hannes (B3, B4, B6), Texas (B1b, B2, B5) | Uppgifter i `backend/`: modeller, migreringar, endpoints, tester |
| [frontend.md](frontend.md) | Texas | Uppgifter i `frontend/`: vyer, komponenter, anrop mot API:t |
| [drift.md](drift.md) | Bestäms | Driftsättning hos Broadview: produktion, testmiljö, backup, e-post, övervakning |
| [ideer.md](ideer.md) | Texas | Idéer att bolla. Inget är beslutat, ta upp med Texas innan något byggs |

Ordningen följer fas 1 i [roadmapen](../docs/produktvision-och-roadmap.md): inloggning, klasser och elever, praktikperiod och APL-plats, närvaro, frågor och redovisning.

## Läget just nu (2026-10-26)

Uppdateras när ett arbetspass avslutas, så att båda ser var vi är.

**Klart och mergat (Texas + Claude):**
- **B1b:** skolor och roller, med multi-tenant (#7).
- **B2 och F3:** klasser och elever. Skoladmin lägger in elever och kopplar dem till lärare, och läraren väljer bland sina elever (#9).
- **F3b:** användare för skoladmin och skolor för superadmin (#10).
- **APL-villkor:** dagar per vecka, incheckning, och vilka vardagar veckoredovisningen lämnas. Inga helger (#11, #13).
- **Driftplanen** för Broadview (#12).
- **B5a och F13: frågor och veckoredovisning** (#13–#18):
  - Läraren bygger klassens frågor i fliken Frågor som i Typeform: utkast, publicering, logik och förhandsgranskning.
  - Eleven svarar i mobilen en fråga i taget, som en story. Svaret sparas vid Nästa.
  - En inskickad redovisning blir ett inlägg med kommentarer.
  - Läraren läser i fliken Redovisningar, med olästa först.
  - Underlaget finns i [docs/design/fragor-typeform.md](../docs/design/fragor-typeform.md).
- **F14:** Inställningar med visning i fyra lägen (Mindre, Standard, Större, Störst), kontrast, rörelse, textavstånd och konto. Sparas per konto (#19, #20).
- Demodatan (`seed_demo`) ger varje klass ett publicerat formulär med redovisning tisdag och fredag.

**Klart och mergat (Hannes + Claude):**
- **B3:** arbetsplatser, handledare och placeringar (#22).

**Granskas (Texas + Claude):**
- **F16: elevsidan och Elevhistorik.** En elev går i en klass och flyttas efter bekräftelse. Elevsidan samlar praktikplats, närvaro, redovisningar och lärare. Elevhistorik har riktig data.
- **B14 och F15: inbjudan av handledare.** Läraren bjuder in med e-post, handledaren skapar konto och företagsprofil via länken, läraren får en notis. Handledaren bjuder in upp till tre kollegor. Inbjudan av handledare togs över från Hannes B6.
- **B4 och F5 (#26): närvaro och incheckning.** Eleven checkar in och anmäler frånvaro, läraren ser närvaron per elev på sidan Närvaro, och handledaren ser dagens status.
- **F4 (#23):** Min APL för eleven, Mina elever för handledaren, sidan Praktikplatser och tilldelning av praktikplats i klassvyn.

**Nästa steg:**
- **Texas + Claude:**
  - B5b: mallar (beslut finns i fragor-typeform.md), förslag utifrån läroplanen och extra frågor per elev.
  - F6: lärarens dashboard med riktig närvaro, när B4 och F5 är mergade.
  - Gå igenom [ideer.md](ideer.md) med Texas.
- **Hannes + Claude:** B6 (inbjudningar och lösenord). B4 togs över av Texas + Claude 2026-10-26. Flera idéer i [ideer.md](ideer.md) rör dem: handledarinbjudan via länk, praktikplatser per lärare, kalender och schema, och kommentarer från handledaren.
- **Väntar på B12:**
  - elevkortet i lärarens redovisningsvy (närvaro, praktikplats och projekt)
  - projektval i redovisningen
  - handledarens åtkomst till redovisningar
- **Öppet att planera:** att radera elevkonton som har redovisningar (gallring och mellanarkiv). Se B5 i backend.md och punkt 9 i ideer.md.

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
