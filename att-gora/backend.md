# Backend – att göra

Ägare: Se arbetsuppdelningen i [CLAUDE.md](../CLAUDE.md). B1b och B2 görs av Texas + Claude, B3–B6 av Hannes + Claude. Läs [README.md](README.md) först. Konventioner finns i [CLAUDE.md](../CLAUDE.md).

Gäller alla uppgifter:

- Varje endpoint kräver inloggning (`CurrentUser`) och rätt roll (`require_roles`). Endpoints med elevdata kontrollerar också att användaren är kopplad till eleven, till exempel att läraren undervisar klassen. Svara `404` i stället för `403` när resursen tillhör någon annan, så att det inte går att gissa vilka id:n som finns.
- Varje endpoint har tester för rätt roll, fel roll (403), ej inloggad (401) och en annan lärares data (404).
- Ny eller ändrad endpoint: exportera `openapi.json` och kör `npm run gen:api` i `frontend/` så att CI går igenom.
- Samla bara in det som behövs. Inga personnummer.

---

## B1. Inloggning och roller ✅ Klar (PR #3)

Användare med rollerna `teacher`, `student` och `supervisor`. `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`. `CurrentUser` och `require_roles` i `app/api/deps.py`. Konton skapas med `scripts/create_user.py`.

---

## B1b. Multi-tenant och rollmodell ✅ Klar (PR #7, Texas + Claude)

**Måste göras innan B2.** Läs [docs/multi-tenant-och-roller.md](../docs/multi-tenant-och-roller.md) — det är hela specen.

**Sammanfattning:**

- Ny tabell `schools` (id, name, org_number, is_active)
- `school_id` på `User` (nullable för superadmin/supervisor)
- Utökad `UserRole`: `superadmin`, `school_admin`, `principal`, `syv`, `teacher`, `student`, `supervisor`
- Hjälpfunktion `require_same_school` i `deps.py` — används i alla endpoints som rör skoldata
- Superadmin-endpoints: `POST/GET /api/superadmin/schools`, `POST /api/superadmin/schools/{id}/admins`
- `create_user.py` får `--school-id`-flagga
- `seed_demo.py` skapar 2 demoskolor med full rolluppsättning

**Klart när:** migrering går igenom, tester täcker att en lärare på skola A inte kan se data från skola B (404), och `seed_demo.py` skapar alla roller.

**Byggt utöver specen:** `GET/POST /api/schools/{school_id}/users`. Skoladmin listar och skapar rektor, SYV, lärare och elever på sin egen skola. Rektor kan lista. Används också i testerna för tenantskyddet. Nya konton har inget lösenord förrän inbjudan finns (B6). Lösenord kan sättas med `create_user`.

---

## B2. Klasser och elever ✅ Klar (PR #9, Texas + Claude)

`SchoolClass` hör till en skola (namnet unikt inom skolan), med kopplingstabellerna `class_teachers` och `class_students`. Endpoints i `app/api/routes/classes.py` och `students.py`:

- `GET /api/classes`: läraren får sina klasser, skoladmin och rektor skolans alla, superadmin alla.
- `POST /api/classes`: lärare (kopplas automatiskt) eller skoladmin.
- `GET /api/classes/{id}`: med lärare och elever.
- `POST /api/classes/{id}/students` med `{student_id}`: lägger en befintlig elev i klassen. Läraren kan bara lägga elever som är kopplade till hen, skoladmin alla aktiva elever på skolan.
- **Elevregistret:** skoladmin lägger in elever (`POST /api/students` med namn, e-post, `teacher_ids` och valfria `class_ids`) och sätter elevens lärare (`PUT /api/students/{id}/teachers`). Kopplingen lagras i `teacher_students`, oberoende av klasser. `GET /api/students?q=` ger läraren hens kopplade elever och skolans personal alla elever. Lärare skapar inga elevkonton.
- `DELETE /api/classes/{id}/students/{student_id}`: tar bort ur klassen, inte kontot.
- `POST/DELETE /api/classes/{id}/teachers`: skoladmin kopplar lärare på samma skola.
- `GET /api/students/{id}`: elevsidan, med klasser och lärare. Läraren ser elever som är kopplade till hen eller går i hens klasser.

Rektor har läsrätt. Allt annat utanför ens behörighet svarar 404. `seed_demo.py` skapar EE22 och EE21 med fem elever var på båda skolorna.

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

## B5. Frågor och veckoredovisning ⬜

Läraren skapar frågor, tilldelar dem till en klass, eleven svarar och läraren granskar. Detaljeras när B4 är klar.

Skissen [larare-veckoredovisning.png](../docs/design/larare-veckoredovisning.png) visar vad som behövs:

- En veckoredovisning hör till en elev, en vecka och ett projekt (se B12).
- Fyra frågetyper: bilder (uppladdning), fritext, flerval (t.ex. Ja/Nej/Vet inte) och betyg 1–5.
- Läraren ser olästa redovisningar på översikten, så redovisningen behöver statusen läst/oläst per lärare.
- Bilagor räknas per redovisning ("Bilagor (2)").

---

## B6. Inför pilot ⬜

Behövs innan riktiga elever loggar in, men stoppar inte B2–B5:

- Inbjudan och lösenord: läraren bjuder in elev eller handledare, som sätter sitt lösenord via en engångslänk (`POST /api/auth/invite`, `POST /api/auth/set-password`). Samma flöde används för glömt lösenord.
- Begränsning av antal inloggningsförsök per e-post och IP.
- Administratörsroll eller skript för att skapa lärarkonton per skola.
- Loggning av inloggningar och ändringar i elevdata, utan namn eller annan elevdata i loggen.

---

## B7. Skoladministratör – lärarkategorier och rapporter ⬜

Låser upp: F7.

Se detaljerad spec i [docs/skoladmin-funktioner.md](../docs/skoladmin-funktioner.md).

**Mål:** Ny roll `school_admin` med endpoints för lärarkategorier och Excel-rapporter.

**Gör så här**

1. Lägg till `UserRole.SCHOOL_ADMIN` i rollmodellen. Skapa migrering.
2. Modell `TeacherCategory` och `TeacherCategoryAssignment` (se spec-dokumentet). Skapa migrering.
3. Endpoints (alla kräver `school_admin`-roll):
   - `GET /api/admin/teacher-categories` – Skolverkets kategorilista
   - `PUT /api/admin/teachers/{user_id}/category` – sätt kategori för lärare
   - `GET /api/admin/reports/material-compensation?from=&to=` → Excel-fil
   - `GET /api/admin/reports/state-subsidy?school_year=` → Excel-fil
4. Seeda in Skolverkets aktuella kategorier (1–5) i migreringen som startvärden.

**Klart när:** tester täcker behörighetsskydd och att Excel-filerna genereras utan fel.

---

## B8. Digital avtalshantering ⬜

Väntar inte på annat. Kan parallellköras med B2–B5.

Se detaljerad spec i [docs/upphandling-norrköping.md](../docs/upphandling-norrköping.md).

**Mål:** APL-kontrakt skapas, distribueras och signeras digitalt.

**Gör så här**

1. Modell `Contract`: `id`, `placement_id`, `template_id`, `status` (`draft|sent|partially_signed|fully_signed`), `created_at`, `pdf_path`.
2. Modell `ContractSignature`: `id`, `contract_id`, `user_id`, `role` (`student|supervisor|teacher|guardian`), `signed_at`, `signature_method` (`bankid|manual`).
3. Endpoints:
   - `POST /api/contracts` (lärare): skapa kontrakt från mall för en placering
   - `GET /api/contracts/{id}` – hämta kontrakt med signeringsstatus
   - `POST /api/contracts/{id}/sign` – signera (initialt manuell bekräftelse, BankID i nästa steg)
4. PDF-generering vid skapande (weasyprint). Spara som PDF/A-2b för arkivering.
5. Notifiera berörda parter via e-post när kontrakt skickas och när alla signerat.

**BankID:** integreras i ett separat steg. Välj signeringstjänst (Scrive/Verified/Nets eID) innan implementation.

---

## B9. SS 12000 / Educloud-integration ⬜

Se detaljerad spec i [docs/ss12000-integration.md](../docs/ss12000-integration.md).

**Tidplan:** Kräver partneravtal med IST (2–4 veckor ledtid). Starta ansökan parallellt med övrig utveckling.

**Mål:** Elever, klasser och personal synkroniseras automatiskt från IST Administration.

**Gör så här**

1. Modeller `ExternalSystem` och `SyncLog` (se spec-dokumentet).
2. OAuth 2.0 client credentials-flöde mot Educloud.
3. Synkroniseringslogik: hämta, matcha, skapa/uppdatera användare och klass-kopplingar.
4. Endpoint `POST /api/admin/integrations/{id}/sync` för manuell synkronisering.
5. Cron-jobb för nattlig automatisk synkronisering.
6. Alvis-integration som steg 2 (samma protokoll, annan URL).

---

## B10. Dataexport och mellanarkiv ⬜

Se detaljerad spec i [docs/mellanarkiv-dataexport.md](../docs/mellanarkiv-dataexport.md).

**Mål:** Fullständig dataexport i öppna format (JSON + PDF/A).

**Gör så här**

1. Async export-jobb (Celery eller BackgroundTasks) som samlar all data för en skola.
2. Generera ZIP med struktur enligt spec.
3. Alla signerade kontrakt exporteras som PDF/A-2b.
4. Endpoints:
   - `POST /api/admin/export` → `{job_id}`
   - `GET /api/admin/export/{job_id}/status`
   - `GET /api/admin/export/{job_id}/download` → ZIP-fil

---

## B11. Meddelanden ⬜

Ägare: bestäms. Tillagd från lärarskisserna ([larare-oversikt.png](../docs/design/larare-oversikt.png)).

Trådar mellan lärare och elev, och mellan lärare och handledare. Antal olästa per tråd och totalt (visas i menyn). Senaste meddelandet förhandsvisas på översikten. Detaljeras innan start.

---

## B12. Projekt ⬜

Ägare: bestäms. Tillagd från lärarskisserna.

Läraren skapar projekt och tilldelar dem till elever. En elev kan ha flera projekt. Veckoredovisningar kopplas till ett projekt. Elevhistoriken visar antal tilldelade projekt och antal redovisningar per elev. Detaljeras innan start.

---

## B13. "Behöver uppmärksamhet" ⬜

Ägare: bestäms. Tillagd från lärarskisserna.

Ett endpoint som ger lärarens lista över saker att följa upp, viktigast först: upprepad frånvaro som inte är anmäld, saknade veckoredovisningar, närvaro som handledaren inte bekräftat och kontrakt som saknar underskrift. Bygger på B4, B5 och avtalshanteringen (B8).
