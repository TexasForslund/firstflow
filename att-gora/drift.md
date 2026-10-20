# Drift – att göra

Driftsättning hos Broadview. Hela planen och frågorna till Broadview finns i [docs/driftsattning.md](../docs/driftsattning.md). Ägare bestäms per uppgift.

Statusarna är samma som i [README.md](README.md).

---

## D0. Stäm av med Broadview ⬜

Gå igenom frågorna under "Krav att stämma av med Broadview" i [docs/driftsattning.md](../docs/driftsattning.md): var servrar och backup ligger, personuppgiftsbiträdesavtal, databas, backup, fillagring, e-post, TLS, övervakning, tillgänglighet och hur driftsättning går till. Skriv in svaren i planen.

**Klart när:** alla frågor har svar och planen är uppdaterad.

---

## D1. Produktionskonfiguration ⬜

Väntar på: D0.

- `backend/Dockerfile.prod`: utan `--reload`, utan utvecklingsberoenden, flera workers, kör som icke-root.
- `frontend/Dockerfile.prod`: `npm run build` och statiska filer.
- Proxy (Caddy eller nginx) med TLS, `/` till frontend och `/api` till backend på samma domän, och säkerhetsrubriker.
- `docker-compose.prod.yml` eller motsvarande hos Broadview.
- Migreringar som eget steg vid driftsättning.
- `.env.example` för produktion med alla variabler (utan värden).

**Klart när:** en produktionsbyggd version går att starta lokalt bakom proxyn med https.

---

## D2. Testmiljö ⬜

Väntar på: D1.

Testmiljö hos Broadview med egen databas och demodata från `seed_demo` (`ENVIRONMENT=test`). Används för demo och systemvisningen i Norrköping.

**Klart när:** testmiljön nås på sin domän med https och demokontona fungerar.

---

## D3. Backup och återläsning ⬜

Väntar på: D0.

Daglig krypterad backup av PostgreSQL, sparad inom EU/EES. Dokumentera hur länge den sparas och hur återläsning går till.

**Klart när:** en återläsning till en tom databas har provats och dokumenterats.

---

## D4. E-post ⬜

Väntar på: D0. Behövs för B6.

Leverantör eller SMTP-relä, SPF och DKIM för domänen. Inga elevuppgifter i ämnesrader.

**Klart när:** ett testmejl från testmiljön kommer fram till Gmail och Outlook utan att hamna i skräpposten.

---

## D5. Fillagring ⬜

Väntar på: D0 och B5 (bilder i veckoredovisningar).

Lagring inom EU för uppladdade bilder, inte i containern. Bara inloggade med rätt behörighet ska kunna hämta en fil.

---

## D6. Övervakning och loggar ⬜

Väntar på: D1.

Larm när tjänsten inte svarar (`/api/health`), loggar sparade en bestämd tid och utan personuppgifter.

**Klart när:** ett larm har testats genom att stänga av backend i testmiljön.

---

## D7. Automatisk driftsättning ⬜

Väntar på: D1 och D2.

Från `main` till testmiljön automatiskt när CI är grön. Till produktion efter manuellt godkännande.

---

## D8. Klart för första pilotskolan ⬜

Väntar på: B6, D1–D7.

- Begränsning av inloggningsförsök och loggning av ändringar (B6).
- Konton utan skola flyttade eller borttagna, och `VALIDATE CONSTRAINT ck_users_school_matches_role` körd.
- `SESSION_COOKIE_SECURE=true` och säkerhetsrubriker kontrollerade.
- Personuppgiftsbiträdesavtal med skolan och med Broadview.
- Sårbarhetskontroll av beroenden.
