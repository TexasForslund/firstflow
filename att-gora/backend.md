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
- Handledarens åtkomst till redovisningar och kommentarer (B5b, idé 1).
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

**B5b, senare:** förslag utifrån läroplanen, extra frågor per elev, bilder och bildval (väntar på D5), projektval (väntar på B12), handledarens åtkomst (väntar på B3) och export.

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

## B12. Projekt 🚧 Granskas (Texas + Claude, 2026-10-26)

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

**Inte byggt:** eleven väljer projekt i redovisningen (B5b, projektval) och en sammanställning per projekt. Idéerna står i [ideer.md](ideer.md), punkt 2.

**Nästa steg, beslutat av Texas 2026-10-26:**
- **Eleven väljer projekt** i redovisningen. Det blir ett första steg, "Vilket projekt gäller det?", som hoppas över om eleven bara har ett projekt. Eleven ser sina projekt i Min APL.
- **Gemensamma projekt** för lärare, handledare och elev:
  - Handledaren får sidan Projekt och kan skapa och ändra projekt för sina elever. Ett sådant projekt kopplas till företaget.
  - Båda kan ändra ett projekt, men bara den som skapade det kan ta bort det.
  - Var och en lägger bara till och tar bort sina egna elever.
- **Handledaren ser alla redovisningar** som eleven skapar, inte bara de som hör till ett projekt.

**Visningsdata:** `uv run python -m scripts.seed_showcase` ersätter Kramforsskolans demoklasser med klassen EL23. Den har sex elever, tretton veckors APL, närvaro, redovisningar med svar och kommentarer, och fyra projekt. Logga in som `larare.kramfors@demo.firstflow.se`.

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

