# Frontend – att göra

Ägare: kollegan. Läs [README.md](README.md) först. Konventioner finns i [CLAUDE.md](../CLAUDE.md).

Gäller alla uppgifter:

- **Mobilen först.** Bygg för 375 px bredd och skala upp. Knappar minst 44 px höga. Elever och handledare använder Firstflow på arbetsplatsen.
- All text i gränssnittet på svenska, all kod på engelska. Sökvägar i webbläsaren på engelska (`/login`, `/classes`).
- Anropa bara backend via `api` i `src/api/client.ts`, med `useQuery` och `useMutation` från TanStack Query. Skriv aldrig egna typer för API-svar. Hämta typer från `components["schemas"]` i `src/api/schema.d.ts`.
- Behöver du ett API som inte finns, skriv det som en ny uppgift sist i `backend.md` i stället för att hitta på det.
- `npm run lint` och `npm run build` ska gå igenom innan PR.

---

## F1. Designsystem och appskal ⬜

Väntar inte på något. Kan börja direkt.

**Mål:** En gemensam grund som alla vyer bygger på.

**Gör så här**

1. Lägg till routing med `react-router` (v7, i "library mode" med `createBrowserRouter`).
2. Färger, typsnitt, avstånd och radier som CSS-variabler i `src/index.css`. Håll det enkelt och lugnt, med bra kontrast.
3. Grundkomponenter i `src/components/`: `Button`, `TextField` (med etikett och felmeddelande), `Card`, `PageHeader`, `EmptyState`, `Spinner`.
4. Ett appskal i `src/components/AppShell.tsx`: rubrik högst upp och en bottennavigering på mobil som visar olika flikar beroende på roll. Lärare: Klasser, Närvaro. Elev: Min APL, Incheckning. Handledare: Mina elever. Flikarna kan leda till tomma sidor tills vidare.

**Klart när:** appen har skalet, navigeringen fungerar på mobil och komponenterna används på minst en sida.

---

## F2. Inloggning ⬜

Väntar på: B1 (✅ klar när PR #3 är mergad).

**Mål:** Användaren loggar in, ser rätt startsida för sin roll och kan logga ut.

**API** (typerna finns i `schema.d.ts`)

- `POST /api/auth/login` med `{email, password}`. Svarar `200` med `UserRead` `{id, email, name, role}` och sätter en cookie. Svarar `401` vid fel e-post eller lösenord.
- `GET /api/auth/me` svarar `200` med `UserRead` eller `401` om ingen är inloggad.
- `POST /api/auth/logout` svarar `204`.
- `role` är `"teacher"`, `"student"` eller `"supervisor"`.

**Gör så här**

1. En hook `useCurrentUser()` i `src/auth/` som kör `useQuery({queryKey: ['me'], ...})` mot `/api/auth/me`. `401` betyder "inte inloggad" och ska ge `null`, inte ett fel. Sätt `retry: false` för just 401.
2. Sidan `/login` med e-post, lösenord och knappen "Logga in". `useMutation` mot `/api/auth/login`. Vid lyckad inloggning, sätt svaret som data för `['me']` och skicka användaren till startsidan för sin roll. Vid 401, visa "Fel e-post eller lösenord".
3. Skydda alla andra sidor: är `useCurrentUser()` `null`, skicka till `/login`.
4. Startsidor per roll: lärare `/classes`, elev `/my-apl`, handledare `/my-students`. Tomma sidor med rubrik räcker tills vidare.
5. "Logga ut" i appskalet: `POST /api/auth/logout`, töm query-cachen med `queryClient.clear()` och gå till `/login`.
6. Får ett anrop `401` senare (sessionen har gått ut), sätt `['me']` till `null` så att användaren hamnar på `/login`.

Cookien är httpOnly. Frontend kan inte och ska inte läsa den. Spara inget om inloggningen i `localStorage`.

**Testa lokalt:** skapa ett konto med `uv run python -m scripts.create_user --email larare@demo.se --name "Demo Lärare" --role teacher` i `backend/` och logga in på http://localhost:5173.

**Klart när:** det går att logga in och ut för alla tre roller och att ladda om sidan behåller inloggningen.

---

## F3. Klassvy och elevvy ⬜

Väntar på: B2.

**Mål:** Läraren ser sina klasser, öppnar en klass och ser eleverna.

**Gör så här**

1. `/classes`: lista från `GET /api/classes` med namn och antal elever, plus en knapp "Ny klass" (`POST /api/classes`).
2. `/classes/:classId`: elevlista från `GET /api/classes/{class_id}`. Formulär "Lägg till elev" med namn och e-post (`POST /api/classes/{class_id}/students`). Invalidera klassens query efter ändring.
3. `/students/:studentId`: en enkel elevvy med namn och klass. Fylls på med APL och närvaro i F4 och F5.

---

## F4. Min APL och handledarvy ⬜

Väntar på: B3.

- Elev, `/my-apl`: arbetsplats, period och handledare från `GET /api/me/placements`.
- Handledare, `/my-students`: elever från `GET /api/supervisor/students`.
- Lärare: på klassvyn visas varje elevs APL-plats från `GET /api/classes/{class_id}/placements`, med möjlighet att koppla elev till plats.

---

## F5. Incheckning och närvaro ⬜

Väntar på: B4.

- Elev: en stor knapp "Checka in" på startsidan (`POST /api/attendance/check-in`) och "Anmäl frånvaro". Visa tydligt när eleven redan är incheckad i dag.
- Lärare, `/attendance`: närvaro per elev i klassen för vald period.
- Handledare: vilka av eleverna som har checkat in i dag.

---

## F6. Demo till fas 0 ⬜

När F1–F5 fungerar mot demodatan från `scripts/seed_demo.py` är det den demo som fas 0 behöver. Lägg då till en dashboard för läraren med överblick: antal elever på APL, dagens incheckningar och frånvaro.
