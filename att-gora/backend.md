# Backend – att göra

Ägare: Se arbetsuppdelningen i [CLAUDE.md](../CLAUDE.md). B1b, B2 och B5 görs av Texas + Claude, B3, B4 och B6 av Hannes + Claude. Läs [README.md](README.md) först. Konventioner finns i [CLAUDE.md](../CLAUDE.md).

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
- `PUT /api/classes/{id}/apl-terms`: klassens APL-villkor (dagar per vecka, incheckning och vilka veckodagar veckoredovisning ska lämnas). Läraren för klassen och skoladmin. Villkoren finns också i `GET /api/classes/{id}` som `apl_terms`.
- `GET /api/students/{id}`: elevsidan, med klasser och lärare. Läraren ser elever som är kopplade till hen eller går i hens klasser.
- **En klass per elev** (Texas, 2026-10-26): unik nyckel på `class_students.student_id` (migreringen tar bort dubbletter först). Går eleven i en annan klass svarar `POST /api/classes/{id}/students` 409, och med `move: true` flyttas eleven. `class_ids` vid `POST /api/students` får ha högst en klass.
- Elevsidan (Texas + Claude, 2026-10-26): `GET /api/students/{id}` har `workplace` (pågående eller nästa placering) och `report_count` (inskickade redovisningar). Nya endpoints med samma behörighet som elevsidan: `GET /api/students/{id}/placements` och `GET /api/students/{id}/attendance` (standard: pågående placering fram till i dag, annars de senaste fyra veckorna). `GET /api/students/{id}/reports` är bara för lärare.
- **Redovisningarna följer eleven** (Texas, 2026-10-26): undervisar läraren klassen som eleven går i nu ser hen alla elevens inskickade redovisningar, även från en tidigare klass, både i listan och i `GET /api/reports/{id}`. Redovisningen behåller klassen den skrevs i. En lärare som bara hade eleven i en tidigare klass ser redovisningarna från sin klass.

Rektor har läsrätt. Allt annat utanför ens behörighet svarar 404. `seed_demo.py` skapar EE22 och EE21 med fem elever var på båda skolorna.

---

## B3. Praktikperiod och APL-plats ✅ Klar (PR #22, Hannes + Claude)

Låser upp: F4 och praktikplatsen i klassvyn (F12).

Läraren lägger in arbetsplatser, lägger till handledare på dem och placerar sina elever där under en period. Endpoints i `app/api/routes/placements.py`, modeller i `app/models/placement.py`:

- `Workplace` (`school_id`, `name`, `address` valfri) hör till skolan. Handledarna kopplas i `workplace_supervisors`. Samma handledare kan finnas på flera arbetsplatser och skolor, eftersom handledaren inte hör till någon skola.
- `Placement` (`student_id`, `workplace_id`, `supervisor_id`, `start_date`, `end_date`). En elevs placeringar får inte överlappa, så det finns högst en aktiv placering per dag (B4 bygger på det).
- `GET /api/workplaces` (lärare, skoladmin, rektor): skolans arbetsplatser med handledare (namn och e-post).
- `POST /api/workplaces` med `{name, address}` (lärare, skoladmin).
- `POST /api/workplaces/{id}/supervisors` med `{name, email}` (lärare, skoladmin): skapar ett handledarkonto utan lösenord, eller kopplar en befintlig handledare med samma e-post. Lösenordet sätts via inbjudan (B6). En annan roll med samma e-post svarar 409.
- `POST /api/placements` med `{student_id, workplace_id, supervisor_id, start_date, end_date}`: läraren placerar elever som går i en klass hen undervisar, skoladmin skolans alla elever. Handledaren måste finnas på arbetsplatsen (422). Överlappande period svarar 409.
- `DELETE /api/placements/{id}`: tar bort en placering som blev fel. Samma behörighet.
- `GET /api/classes/{class_id}/placements`: klassens placeringar med elev, arbetsplats, handledare och period. Samma behörighet som klassvyn. Klassvyns elevrad tar elevens pågående placering härifrån.
- `GET /api/me/placements` (elev): egna placeringar med arbetsplats och handledarens namn.
- `GET /api/supervisor/students` (handledare): elever som handledaren har i dag, med period och arbetsplats. En annan handledares elever syns inte.
- `seed_demo.py`: två arbetsplatser per skola med handledare, och eleverna i EE22 placerade under en pågående period. EE21 har inga placeringar. Gustav Lindahl (`handledare@demo.firstflow.se`) har elever på båda skolorna.

**Inte byggt, att ta senare:**
- Ändra en placering (`PATCH`), t.ex. förlänga perioden. I dag tas den bort och skapas på nytt.
- Ta bort en handledare från en arbetsplats, och ändra eller ta bort arbetsplatser.
- ~~Handledarens åtkomst till redovisningar och kommentarer~~: byggd i B16 (Texas + Claude, 2026-10-29).
- Idéerna i [ideer.md](ideer.md) punkt 4 (platser per lärare och inbjudningslänk) och 7 (schema) är inte inbyggda. Arbetsplatserna hör till skolan, som i specen.

---

## B4. Närvaro och incheckning ✅ Klar ([PR #26](https://github.com/TexasForslund/firstflow/pull/26), Texas + Claude, tagen från Hannes 2026-10-26)

**Byggd 2026-10-26.** Modell `Attendance` i `app/models/attendance.py`, endpoints i `app/api/routes/attendance.py`:
- `POST /api/attendance/check-in` (elev), `GET /api/me/attendance` (elev).
- **Frånvaroanmälan är borttagen** (Texas, 2026-10-26): `POST /api/attendance/absence` finns inte längre, och närvaron visar bara incheckad eller ej incheckad (fälten `absent`, `sick` och `note` är borttagna ur svaren). En migrering tar bort gamla anmälda frånvarodagar. Statusvärdena finns kvar i databasen men sätts inte.
- `GET /api/classes/{class_id}/attendance?from=&to=` (samma behörighet som klassvyn): per elev förväntade dagar, närvarande, frånvarande, sjuk, ej incheckad och dagens status. Standard är de senaste fyra veckorna.
- `GET /api/supervisor/attendance?date=` (handledare): dagens status för handledarens elever.
- Regler (Texas, 2026-10-26): bara vardagar. Frånvaro i dag och framåt inom placeringen, och högst sju dagar bakåt. En incheckning ersätter frånvaro samma dag, men inte tvärtom. "Ej incheckad" = förväntade dagar (från klassens dagar per vecka) minus registrerade, och räknas bara när klassen kräver incheckning.
- En placering med närvaro går inte att ta bort (409).
- `seed_demo`: närvaro för EE22 med en missad dag och en elev som slutat checka in.

Ursprunglig spec:

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
4. Använd klassens APL-villkor (B2): `check_in_required` avgör om incheckning krävs, och `apl_days_per_week` hur många APL-dagar eleven har per vecka.


**B4b. Bekräftad närvaro 🚧 Granskas (Texas + Claude, 2026-10-29).** Skissen "Firstflow – Bekräftad närvaro skiss" är godkänd av Texas.
- `Attendance.review`: tom = väntar på handledaren, `confirmed` eller `not_present`. Dessutom `reviewed_at` och `reviewed_by_id`. En dag som handledaren lade till är närvarande utan incheckningstid.
- `GET/POST /api/supervisor/attendance/review`: handledaren ser i dag och dagar som väntar, och bekräftar, lägger till eller säger "inte på plats". Det går två veckor bakåt (`REVIEW_DAYS`), vardagar, inom placeringen.
- `GET /api/classes/{id}/attendance/week`: veckan per elev med läge per dag, och vilka handledare som har dagar att bekräfta. `POST /api/classes/{id}/attendance/remind` (lärare): notis till de handledarna.
- En dag som väntar räknas som närvaro. En dag där handledaren säger "inte på plats" räknas inte. Inget godkänns automatiskt.
- Översikten: `confirmed`, `pending` och `today_students`. "Behöver uppmärksamhet" får `unconfirmed_days` (dagar före i dag som väntar) och `attendance_conflict` (incheckad men inte på plats enligt handledaren).

---

## B5. Frågor och veckoredovisning 🚧 B5a klar (PR #14), mallar granskas, resten av B5b kvar (Texas + Claude)

**Genomgången är gjord** (Texas och Claude, 2026-10-20). Besluten, frågetyperna och datamodellen står i [docs/design/fragor-typeform.md](../docs/design/fragor-typeform.md). Läs den innan bygget börjar. Veckoredovisning lämnas bara på vardagar.

Viktigast från genomgången:
- En fråga i taget, logik redan i första versionen och samma frågor alla redovisningsdagar.
- Skoladmin skapar mallar för skolan. Läraren kan också börja från egna frågor eller ett förslag utifrån läroplanen (Skolverkets API och Claude).
- Frågorna har versioner, och svaren sparas som typade värden med fasta id:n.
- En inskickad redovisning går inte att ändra. Elev, lärare och handledare kan kommentera den.
- Extra frågor för enskilda elever, och projektval när B12 finns.

**B5a, backend för frågor och redovisning** ✅ Klar (PR #14):
- Klassens formulär: utkast, "Publicera ändringar" och "Kasta ändringar". Varje publicering blir en ny version.
- Frågetyper: kort text, fritext, flerval (med flera val och Annat), ja/nej, betyg 1–5 och meddelande. Logik som hoppar framåt eller till slutet.
- Eleven: redovisningsdagarna fyra veckor bakåt, en redovisning per vald dag, svar sparas vid Nästa, skicka in. Inskickad redovisning är låst.
- Läraren: klassens inskickade redovisningar, oläst och läst, kommentarer från elev och lärare.

**B5b del 1, frågemallar** ✅ Klar ([PR #24](https://github.com/TexasForslund/firstflow/pull/24), Texas + Claude, 2026-10-26):
- `QuestionTemplate` i `app/models/template.py`: skolans mallar (`owner_id` null) och lärarens egna. Endpoints i `app/api/routes/templates.py`.
- `GET /api/templates` (lärare, skoladmin): skolans mallar först, sedan egna. `POST /api/templates` med `{name, class_id}` sparar klassens utkast som mall. Skoladmin skapar skolans mallar, läraren egna.
- `PATCH` och `DELETE /api/templates/{id}`: skoladmin ändrar skolans mallar, läraren sina egna. En lärare som försöker ändra en skolmall får 403. Andras egna mallar och andra skolors mallar ger 404.
- `POST /api/classes/{class_id}/form/apply-template` med `{template_id}`: kopierar mallen till klassens utkast med nya id:n för frågor och alternativ, och logiken pekas om. Mallen ersätter utkastet, och läraren publicerar som vanligt.
- `seed_demo`: skolmallen "Kort veckoredovisning" på varje skola.
- Frontend i fliken Frågor: **Använd mall** (erbjuder att spara nuvarande frågor som mall först) och **Spara som mall**. Byt namn och ta bort görs i dialogen Använd mall. Skoladmin hanterar skolans mallar där.

**B5b, senare:** förslag utifrån läroplanen, extra frågor per elev, bilder och bildval (väntar på D5), projektval (✅ PR #41), handledarens åtkomst (✅ B16) och export.

**Att planera:** redovisningar och kommentarer hindrar att ett elevkonto raderas (`RESTRICT`). Gallring och radering av elevdata planeras tillsammans med mellanarkivet ([mellanarkiv-dataexport.md](../docs/mellanarkiv-dataexport.md)).

Läraren skapar frågor, tilldelar dem till en klass, eleven svarar och läraren granskar.

Skissen [larare-veckoredovisning.png](../docs/design/larare-veckoredovisning.png) visar vad som behövs:

- En veckoredovisning hör till en elev, en vecka och ett projekt (se B12).
- Frågetyperna i första versionen står i [fragor-typeform.md](../docs/design/fragor-typeform.md).
- Läraren ser olästa redovisningar på översikten, så redovisningen behöver statusen läst/oläst per lärare.
- Bilagor räknas per redovisning ("Bilagor (2)").
- **Frågorna sätts per klass** (Texas, 2026-10-20): i klassvyns flik Frågor väljer läraren vilka frågor eleverna i klassen får vid varje redovisningstillfälle. Klassens `report_due_weekdays` (B2) anger vilka veckodagar redovisning ska lämnas.

---

## B6. Inför pilot ⬜

**Inbjudan av handledare togs över av Texas + Claude 2026-10-26** och är byggd (se B14 nedan). Kvar för Hannes: inbjudan och lösenord för elever och personal, glömt lösenord, begränsning av inloggningsförsök och loggning.

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

## B8. Digital avtalshantering 🚧 Granskas (Texas + Claude, 2026-10-29)

Se kraven i [docs/upphandling-norrköping.md](../docs/upphandling-norrköping.md). Skissen "Firstflow – Kontrakt skiss" är godkänd av Texas.

**Beslut (Texas, 2026-10-29):**
- Läraren laddar upp avtalet som PDF. Firstflow fyller inte i mallar än.
- Tre parter signerar: eleven, handledaren och läraren. Rektor och vårdnadshavare är inte med.
- Läraren signerar för skolan när hen skickar kontraktet. Eleven och handledaren signerar i valfri ordning.
- Testläge: signeringen är en knapp. BankID kopplas in när signeringstjänsten är vald.

**Byggt:**
- Modeller `Contract` och `ContractSignature` i `app/models/contract.py`. PDF:en ligger i databasen (laddas bara när den hämtas), högst 10 MB, och måste börja med `%PDF-`.
- Endpoints i `app/api/routes/contracts.py`:
  - `GET /api/contracts`: lärarens kontrakt, eller skickade kontrakt där eleven eller handledaren är part.
  - `POST /api/contracts` (multipart, lärare): PDF, elev, företag och handledare. `send=true` skickar direkt, annars blir det ett utkast.
  - `GET /api/contracts/{id}` och `GET /api/contracts/{id}/pdf` (`?download=true` för nedladdning). Första hämtningen räknas som öppnat.
  - `POST /api/contracts/{id}/send`, `/sign` (`{"confirm": true}`) och `/remind`.
  - `DELETE /api/contracts/{id}`: bara så länge eleven och handledaren inte har signerat.
- Eleven måste vara en elev läraren får se, och företaget ett företag läraren får se (404). Handledaren måste höra till företaget (422).
- Notiser: eleven och handledaren när kontraktet skickas och vid påminnelse, läraren när alla har signerat.
- Ny dependency: `python-multipart`.

**Behöver uppmärksamhet:** skickade kontrakt som eleven eller handledaren inte har signerat syns på lärarens översikt och elevsidan (`unsigned_contract`, med `contract_id` och `waiting_for`). Bara läraren som skickade kontraktet ser dem.

**Inte byggt:** BankID, mallar, PDF/A-arkivering och läsrätt för rektor, skoladmin och SYV.

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

## B12. Projekt ✅ Klar ([PR #36](https://github.com/TexasForslund/firstflow/pull/36), [#41](https://github.com/TexasForslund/firstflow/pull/41), Texas + Claude, 2026-10-29)

Enkel första version, beslutad av Texas 2026-10-26:
- Ett projekt har namn, beskrivning, valfri deadline och taggar i fritext. Det kan ha flera elever.
- Läraren som skapade projektet ändrar och tar bort det. Handledare och SYV kommer in senare.
- Modell `Project` och `project_students` i `app/models/project.py`. `Report.project_id` är valfri och blir tom om projektet tas bort.
- Endpoints i `app/api/routes/projects.py`:
  - `GET` och `POST /api/projects`
  - `PUT` och `DELETE /api/projects/{id}`
  - `GET /api/students/{id}/projects`, med elevsidans behörighet
- Eleverna måste vara elever läraren får se, annars svarar API:t 404.
- `StudentRead.project_count`. Redovisningarna har `project` i elevens lista, i detaljvyn och på översikten.

**Version 2, företag och handledare** (Texas, 2026-10-29, granskas i PR:en för projekt v2, mergas efter mötet med Haldor 30 oktober):
- Projektet kan göras på ett företag (`workplace_id`) och avslutas (`completed_at`).
- Läraren bjuder in företagets handledare (`project_supervisors`). Handledaren får en notis med länk till projektet.
- Handledaren ser projektet och dess redovisningar, och ändrar namn, beskrivning, slutdatum och taggar. Hen ändrar inte elever, företag, handledare eller status och kan inte skapa eller ta bort projekt (403).
- Handledare måste höra till projektets företag (422), och företaget måste vara ett läraren får se (404). Byts företaget följer bara dess handledare med.
- Nya endpoints: `GET /api/projects/{id}` och `GET /api/projects/{id}/reports` (inskickade redovisningar med svar, filter per elev). `GET /api/projects` ger handledaren projekten hen är inbjuden till.
- Detta ersätter beslutet från 2026-10-26 att handledaren skulle skapa egna projekt.

**Inte byggt:** eleven väljer projekt i redovisningen (B5b, projektval) och en sammanställning per projekt. Idéerna står i [ideer.md](ideer.md), punkt 2.

**Nästa steg, beslutat av Texas 2026-10-26:**
- ~~Eleven väljer projekt~~ Byggt (Texas, 2026-10-29): projektet är valfritt. På redovisningens sista steg finns "Koppla till projekt (valfritt)" med elevens pågående projekt. Inget väljs automatiskt. `PUT /api/reports/{id}/project` (eleven, bara utkast) och `GET /api/me/projects`. Eleven ser sina projekt i Min APL och projektet på sina inlägg.
- **Handledaren ser alla redovisningar** som eleven skapar, inte bara de som hör till ett projekt.

**Visningsdata:** `uv run python -m scripts.seed_showcase` ersätter Kramforsskolans demoklasser med klassen EL23. Den har sex elever, tretton veckors APL, närvaro, redovisningar med svar och kommentarer, fyra pågående projekt (tre med företag och inbjuden handledare) och ett avslutat. Logga in som `larare.kramfors@demo.firstflow.se`.

---

## B13. "Behöver uppmärksamhet" ⬜

Ägare: bestäms. Tillagd från lärarskisserna.

Ett endpoint som ger lärarens lista över saker att följa upp, viktigast först: upprepad frånvaro som inte är anmäld, saknade veckoredovisningar, närvaro som handledaren inte bekräftat och kontrakt som saknar underskrift. Bygger på B4, B5 och avtalshanteringen (B8).

---

## B14. Inbjudan av handledare och företagsprofil ✅ Klar ([PR #28](https://github.com/TexasForslund/firstflow/pull/28), Texas + Claude, 2026-10-26)

Ersätter att läraren själv lägger in arbetsplatser och handledare (Texas, 2026-10-26).

- `Invitation` och `Notification` i `app/models/invitation.py`. Endpoints i `app/api/routes/invitations.py`.
- `POST /api/invitations` med `{email}` (lärare, skoladmin): skickar ett mejl med en engångslänk `/invite/<token>`. Token är slumpad, bara hashen sparas och länken gäller i 14 dagar. En ny inbjudan till samma adress ersätter den gamla.
- `GET /api/invitations`, `POST /api/invitations/{id}/resend` (ny länk) och `DELETE /api/invitations/{id}` (återkalla).
- `GET /api/invite/{token}` och `POST /api/invite/{token}/accept` (ingen inloggning): handledaren skapar konto (minst 10 tecken i lösenordet) och företagsprofil (namn, adress, bransch, beskrivning) och blir inloggad. Läraren får en notis.
- Företaget (`Workplace.owner_teacher_id`) syns bara för läraren som bjöd in, och för skoladmin och rektor. Bjöd skoladmin in syns det för skolans alla lärare.
- `GET/PUT /api/supervisor/workplaces` och `POST /api/supervisor/workplaces/{id}/invitations`: handledaren ändrar profilen och bjuder in upp till tre kollegor.
- `GET /api/notifications` och `POST /api/notifications/read`.
- `POST /api/workplaces` och `POST /api/workplaces/{id}/supervisors` får bara skoladmin använda.
- E-post: `app/services/email.py`. Utan `SMTP_HOST` skrivs mejlet och länken till loggen (inte i produktion). SMTP sätts upp senare (D4).

**Inte byggt:** en handledare som redan har ett konto kan inte bjudas in till ett nytt företag eller av en annan lärare (409). Det behövs när samma handledare tar emot elever från flera lärare.

---

## B15. Lärarens översikt ✅ Klar ([PR #31](https://github.com/TexasForslund/firstflow/pull/31), Texas + Claude, 2026-10-26)

`GET /api/teacher/overview` (bara lärare, klasserna hen undervisar) i `app/api/routes/overview.py`:
- `on_apl`, `checked_in` och `classes`: elever med en placering som pågår i dag (bara vardagar) och dagens incheckningar, totalt och per klass.
- `attention`, viktigast först: `missing_check_ins` (minst två de senaste fyra veckorna, samma räkning som klassens närvaro), `missing_reports` (redovisningsdagar före i dag utan inskickad redovisning) och `no_placement` (ingen pågående eller kommande placering, när någon annan i klassen har en).
- `reports` och `unread_reports`: olästa inskickade redovisningar, de tio senaste, med de två första textsvaren förkortade till 300 tecken.
- Närvaroräkningen och redovisningsdagarna är utbrutna till `class_student_attendance` och `due_days` så att översikten räknar likadant som Närvaro och elevens redovisningar.
- **Elevsidan, version 2** (Texas + Claude, 2026-10-26): `GET /api/students/{id}/attention` (samma behörighet som elevsidan) ger elevens uppmärksamhetspunkter med översiktens regler och `missing_report_days`. `GET /api/students/{id}/reports` har nu `answers`, alla textsvar förkortade till 1000 tecken, för sök och filter. `text_answers` i `reports.py` används både här och av översikten.

---

## B16. Handledarens åtkomst till redovisningar ✅ Klar ([PR #43](https://github.com/TexasForslund/firstflow/pull/43), Texas + Claude, 2026-10-29)

Beslut (Texas, 2026-10-29):
- Handledaren ser bara redovisningar för dagar då eleven var placerad hos hen (redovisningens dag inom placeringens period, på en arbetsplats på redovisningens skola). Byter eleven praktikplats ser den nya handledaren inte de gamla redovisningarna.
- Kommenterar handledaren får eleven en notis. Läraren ser kommentaren men får ingen notis.

Byggt i `app/api/routes/reports.py`:
- `GET /api/supervisor/reports` (handledare): inskickade redovisningar från tiden hos handledaren, senast inskickade först, med första textsvaret, projekt, läst och antal kommentarer.
- `GET /api/reports/{id}`, `POST /api/reports/{id}/read` och `POST /api/reports/{id}/comments` släpper in handledaren enligt regeln ovan. Allt annat svarar 404.
- Tester i `tests/test_supervisor_reports.py`.

---

## B17. Privata kommentarer på redovisningar ✅ Klar ([PR #46](https://github.com/TexasForslund/firstflow/pull/46), Texas + Claude, 2026-10-30)

Beslut (Texas, 2026-10-30):
- Handledaren och läraren kan skriva privat på en redovisning, så att bara lärare och handledare ser kommentaren (t.ex. läraren till handledaren: "Ljuger han?").
- På elevsidan skriver läraren inga privata anteckningar. Anteckningarna om eleven (B18) är handledarens.
- "Alla ser" är förvalt varje gång.
- Notiser: en privat kommentar från handledaren går till lärarna för klassen, en från läraren till handledaren för den dagen. Eleven får ingen notis om privata kommentarer.

Byggt:
- `ReportComment.visibility`: `all` eller `staff`, migrering `9214b6a47f9d`. Befintliga kommentarer blir `all`.
- `POST /api/reports/{id}/comments` tar `visibility`. Eleven kan inte skriva privat (422).
- `GET /api/reports/{id}` ger aldrig eleven privata kommentarer, och elevens antal kommentarer i projektet räknar inte med dem.
- Tester i `tests/test_supervisor_reports.py`.
- **Att veta:** "privat" betyder att den inte visas i appen. Eleven kan begära ut sina uppgifter enligt GDPR, och på kommunala skolor kan kommentarerna vara allmänna handlingar.

Frontend: F22.

---

## B18. Anteckningar om eleven ✅ Klar ([PR #47](https://github.com/TexasForslund/firstflow/pull/47), Texas + Claude, 2026-10-30)

Beslut (Texas, 2026-10-30):
- Handledaren skriver anteckningar om eleven i helhet, inte om en enskild redovisning.
- Läraren läser men skriver inte. Eleven ser dem inte.
- Taggarna är Beröm, Oro och Övrigt.
- Handledaren kan ändra och ta bort sina egna anteckningar i 24 timmar.

Byggt:
- `StudentNote` i `app/models/note.py` (`student_id`, `author_id`, `tag`, `body`, `created_at`, `updated_at`), migrering `4acdced5779d`. Anteckningarna tas bort med elevens konto.
- `app/api/routes/notes.py`:
  - `GET /api/students/{id}/notes`: läraren som får se eleven ser alla, handledaren med en pågående placering ser bara sina egna. En tidigare handledare får 404.
  - `POST` (handledare med pågående placering).
  - `PUT` och `DELETE /api/students/{id}/notes/{note_id}`: bara egna, 409 efter 24 timmar.
- `seed_showcase`: tre anteckningar från Gustav om Hugo.
- Tester i `tests/test_notes.py`.
- **Att bestämma senare:** hur länge anteckningarna sparas (gallring, B5), och om läraren ska få en notis när handledaren skriver, t.ex. vid Oro.
- **Att veta:** anteckningarna är integritetskänsliga. Eleven kan begära ut dem enligt GDPR, och på kommunala skolor kan de vara allmänna handlingar. Logga aldrig innehållet.

Frontend: F23.

---

## B19. APL-dagar och redovisningsdagar per klass, även helger 🚧 Granskas (Texas + Claude, 2026-10-30)

Beslut (Texas, 2026-10-30):
- Klassen har **APL-dagar** (fasta veckodagar, t.ex. måndag–torsdag) då eleverna är på APL och checkar in, och **redovisningsdagar** (t.ex. onsdag och torsdag) som väljs bland APL-dagarna.
- Alla sju veckodagar går att välja, så att t.ex. vuxenutbildning kan ha APL fredag–söndag.
- "APL-dagar per vecka" försvinner. Befintliga och nya klasser får måndag–fredag.

Byggt:
- `SchoolClass.apl_weekdays` (0 = måndag … 6 = söndag). `apl_days_per_week` är borttagen. Migrering `0ea35db52ad0`, testad upp och ned. Vid nedgradering tas helgdagar bort.
- Databasen kräver att redovisningsdagarna är APL-dagar, och `PUT /api/classes/{id}/apl-terms` svarar 422 annars.
- `app/services/apl_days.py`: elevens APL-dagar från klassen. En elev utan klass har måndag–fredag.
- Incheckning, förväntade dagar i närvaron, handledarens bekräftelse, klassens vecka och lärarens översikt utgår från klassens APL-dagar i stället för vardagar.
- `GET /api/me/attendance` och elevsidans närvaro har `apl_weekdays`.

Frontend: F24.

---

## B20. Import av elever och personal enligt SS12000 ⬜ (från mötet med Haldor, 2026-10-30)

Skolorna ska kunna lägga in elever, lärare, SYV och rektor utan att skapa varje konto för hand. Vi följer [SS 12000](https://www.sis.se/en/produkter/information-technology-office-machines/applications-of-information-technology/it-applications-in-education/ss-120002024/) (senaste versionen SS 12000:2024), så att samma fält fungerar för CSV-import och för en senare synk mot skolans system (t.ex. IST eller Tieto Edu).

**Hur SS12000 motsvarar Firstflow:**
- **Organisation** (skolenhet) ↔ `School`.
- **Person** ↔ `User`, med SS12000:s UUID som externt id.
- **Duty** med `dutyRole` (Lärare, Rektor, SYV) ↔ rollerna.
- **Group** med `groupType` Klass ↔ `SchoolClass`.
- **Enrolment** med skolform (GY, VUXGY …): saknas i dag och behövs för att skilja vuxenutbildning från gymnasiet.
- Det finns inget eget lärar-anrop i API:t. Lärare hämtas som `duties` med `dutyRole=Lärare` och `expand=person`.

**Bara det som rör APL i Firstflow (Texas, 2026-10-30):**
- **Elever:** bara de som går i en klass eller grupp som skolan har valt ska ha APL i Firstflow. Aldrig alla elever på skolan.
- **Lärare:** bara de som undervisar i de valda klasserna. **SYV och rektor:** bara på skolenheter som använder Firstflow.
- **Handledare** finns inte i skolans system och bjuds in som i dag (B14).
- **Fält som hämtas:** SS12000-id, namn, e-post, roll, klass och skolform.
- **Fält som inte hämtas:** personnummer (`civicNo`), adress, telefon, vårdnadshavare, betyg, frånvaro från skolans system och övriga kurser och grupper.
- **Skyddad identitet:** importeras inte automatiskt. Skolan lägger in eleven för hand om hen ska vara med.
- **En elev som lämnar klassen** i skolans system får kopplingen avslutad. Redovisningar och närvaro sparas enligt gallringen (B5).
- **Förhandsvisning** innan något sparas. Loggen visar bara antal och id:n, aldrig namn eller elevdata.

**Tre sätt att lägga in personer:**
- **För hand:** skoladmin lägger till en elev eller en ur personalen (`create_account`, finns i dag). Behövs alltid, t.ex. för elever med skyddad identitet och för skolor utan system att importera från.
- **CSV-import** med en mall som följer SS12000:s fält.
- **SS12000-synk** direkt från skolans system.

**Ordning (förslag):**
1. Datamodellen följer SS12000: externt id, skolform och roll.
2. CSV-import med en mall som följer SS12000:s fält. Räcker för en pilot.
3. SS12000-synk när en pilotskola har ett system att ansluta till. Kräver avtal och inloggning mellan systemen.

**Att diskutera:**
- Vilket system använder pilotskolan?
- Hur hänger importen ihop med inbjudningar och lösenord i B6 (Hannes)? Stäm av i Discord innan någon börjar.

Frontend: F25.

