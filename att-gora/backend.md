# Backend – att göra

Ägare: Hannes. Läs [README.md](README.md) först. Konventioner finns i [CLAUDE.md](../CLAUDE.md).

Gäller alla uppgifter:

- Varje endpoint kräver inloggning (`CurrentUser`) och rätt roll (`require_roles`). Endpoints med elevdata kontrollerar också att användaren är kopplad till eleven, till exempel att läraren undervisar klassen. Svara `404` i stället för `403` när resursen tillhör någon annan, så att det inte går att gissa vilka id:n som finns.
- Varje endpoint har tester för rätt roll, fel roll (403), ej inloggad (401) och en annan lärares data (404).
- Ny eller ändrad endpoint: exportera `openapi.json` och kör `npm run gen:api` i `frontend/` så att CI går igenom.
- Samla bara in det som behövs. Inga personnummer.

---

## B1. Inloggning och roller ✅ Klar (PR #3)

Användare med rollerna `teacher`, `student` och `supervisor`. `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`. `CurrentUser` och `require_roles` i `app/api/deps.py`. Konton skapas med `scripts/create_user.py`.

---

## B2. Klasser och elever ⬜

Låser upp: F3 (klassvy och elevvy).

**Mål:** En lärare ser sina klasser, skapar en klass och lägger till elever.

**Gör så här**

1. Modeller i `app/models/school_class.py`:
   - `SchoolClass`: `id` (UUID), `name` (t.ex. "EE22"), `created_at`.
   - Kopplingstabell `class_teachers` (`class_id`, `teacher_id`): vilka lärare som har klassen.
   - Kopplingstabell `class_students` (`class_id`, `student_id`): vilka elever som går i klassen.
   - Importera i `app/db/models.py` och skapa migrering med `alembic revision --autogenerate`.
2. Endpoints i `app/api/routes/classes.py`, alla bara för `teacher`:
   - `GET /api/classes` ger lärarens klasser: `[{id, name, student_count}]`.
   - `POST /api/classes` med `{name}` skapar en klass och kopplar den inloggade läraren.
   - `GET /api/classes/{class_id}` ger `{id, name, students: [{id, name, email}]}`. Svarar 404 om läraren inte har klassen.
   - `POST /api/classes/{class_id}/students` med `{name, email}` skapar ett elevkonto utan lösenord (sätt `password_hash` till `"!"`, som aldrig godkänns av `verify_password`; lösenord sätts via inbjudan i B6) eller kopplar en befintlig elev med samma e-post. Svarar med eleven.
   - `DELETE /api/classes/{class_id}/students/{student_id}` tar bort eleven ur klassen, inte kontot.
3. `scripts/seed_demo.py`: skapar en demolärare, en demohandledare, två klasser med fem elever var och lösenordet `demo-firstflow` på alla demokonton. Skriptet ska vägra köra om `ENVIRONMENT=production`.

**Klart när**

- Tester täcker alla endpoints inklusive en annan lärares klass (404) och en elev som anropar (403).
- `openapi.json` och `schema.d.ts` är uppdaterade.
- Uppgiften är markerad klar här och F3 i `frontend.md` säger att den inte längre väntar.

---

## B3. Praktikperiod och APL-plats ⬜

Låser upp: F4.

**Mål:** Läraren kopplar en elev till en arbetsplats och en handledare under en period.

**Gör så här**

1. Modeller:
   - `Workplace`: `id`, `name`, `address` (valfri).
   - `Placement`: `id`, `student_id`, `workplace_id`, `supervisor_id` (användare med roll `supervisor`), `start_date`, `end_date`.
2. Endpoints:
   - `POST /api/workplaces`, `GET /api/workplaces` (lärare).
   - `POST /api/placements` med `{student_id, workplace_id, supervisor_id, start_date, end_date}` (lärare som har elevens klass).
   - `GET /api/classes/{class_id}/placements` (lärare): alla elevers placeringar i klassen.
   - `GET /api/me/placements` (elev): elevens egna placeringar med arbetsplats och handledarens namn.
   - `GET /api/supervisor/students` (handledare): elever som handledaren har just nu, med period och arbetsplats.
3. Utöka `seed_demo.py` med arbetsplatser och placeringar.

**Klart när:** tester för varje roll och för en handledare som försöker se en annan handledares elev (404).

---

## B4. Närvaro och incheckning ⬜

Låser upp: F5.

**Mål:** Eleven checkar in varje dag på APL-platsen, läraren ser närvaron.

**Gör så här**

1. Modell `Attendance`: `id`, `placement_id`, `date`, `checked_in_at`, `status` (`present`, `absent`, `sick`), `note` (valfri, kort). Unik på (`placement_id`, `date`).
2. Endpoints:
   - `POST /api/attendance/check-in` (elev): checkar in dagens datum på elevens aktiva placering. Tiden sätts av servern. Ett andra anrop samma dag svarar med befintlig incheckning.
   - `POST /api/attendance/absence` (elev) med `{date, status, note}`: anmäl frånvaro.
   - `GET /api/me/attendance` (elev): egen närvaro under aktiv placering.
   - `GET /api/classes/{class_id}/attendance?from=&to=` (lärare): per elev antal dagar närvarande, frånvarande och sjuk.
   - `GET /api/supervisor/attendance?date=` (handledare): dagens incheckningar för handledarens elever.
3. Spara ingen plats (GPS). Det är inte nödvändigt för funktionen.

---

## B5. Frågor och redovisning ⬜

Läraren skapar frågor, tilldelar dem till en klass, eleven svarar och läraren granskar. Detaljeras när B4 är klar.

---

## B6. Inför pilot ⬜

Behövs innan riktiga elever loggar in, men stoppar inte B2–B5:

- Inbjudan och lösenord: läraren bjuder in elev eller handledare, som sätter sitt lösenord via en engångslänk (`POST /api/auth/invite`, `POST /api/auth/set-password`). Samma flöde används för glömt lösenord.
- Begränsning av antal inloggningsförsök per e-post och IP.
- Administratörsroll eller skript för att skapa lärarkonton per skola.
- Loggning av inloggningar och ändringar i elevdata, utan namn eller annan elevdata i loggen.
