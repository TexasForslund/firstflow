# Frontend – att göra

Ägare: Texas + Claude (se arbetsuppdelningen i [CLAUDE.md](../CLAUDE.md)). Läs [README.md](README.md) först. Konventioner finns i [CLAUDE.md](../CLAUDE.md).

Gäller alla uppgifter:

- **Följ [designprofilen](../docs/design/designprofil.md)** och skisserna i `docs/design/`. Inga skuggor.
- **Lärare och handledare:** byggt för dator först, med sidomeny, men ska fungera på mobil (menyn fälls ut). **Elever:** mobilen först, 375 px bredd. Knappar minst 44 px höga.
- All text i gränssnittet på svenska, all kod på engelska. Sökvägar i webbläsaren på engelska (`/login`, `/classes`).
- Anropa bara backend via `api` i `src/api/client.ts`, med `useQuery` och `useMutation` från TanStack Query. Skriv aldrig egna typer för API-svar. Hämta typer från `components["schemas"]` i `src/api/schema.d.ts`.
- Behöver du ett API som inte finns, skriv det som en ny uppgift sist i `backend.md` i stället för att hitta på det.
- `npm run lint` och `npm run build` ska gå igenom innan PR.

---

## F1. Designsystem och appskal ✅ Klar (PR #6)

Designtokens i `src/index.css` enligt [designprofilen](../docs/design/designprofil.md), Inter självhostat, Lucide-ikoner. Komponenter i `src/components/`: `Avatar`, `Button`/`ButtonLink`, `Card`, `CountBadge`, `Tag`, `InfoChip`, `FilterChip`, `SegmentedBar`, `ChoiceChips`, `StarRating`, `Collapsible`, `Logo`. Appskal med sidomeny i `src/layout/AppShell.tsx`, utfällbar på skärmar under 1024 px.

Lärarens tre vyer från skisserna är byggda med demodata i `src/demo/data.ts`: översikt (`/overview`, flikarna A/B/C), veckoredovisning (`/reports/:id`) och elevhistorik (`/student-history`). Demodatan byts mot API-anrop i F2, F3 och F7.

`VITE_HASH_ROUTER=1 npx vite build --base=./` bygger en statisk demo som kan publiceras utan server.

---

## F2. Inloggning ✅ Klar (PR #8)

`/login` i designprofilen. `useCurrentUser()` i `src/auth/` (`null` = ej inloggad). `RequireAuth` skyddar alla sidor och skickar till `/login`, och efter inloggning kommer användaren tillbaka till sidan hen försökte nå. `RoleRoute` visar en sida bara för vissa roller. Startsida och meny per roll finns i `src/auth/roles.ts`. Utloggning tömmer query-cachen. Svarar API:t 401 senare (sessionen har gått ut) hamnar användaren på `/login` via en middleware i `src/api/client.ts`.

Alla sju roller har en meny. Lärarens sidor visar fortfarande demodata (F3, F11). Övriga rollers sidor är platshållare.

---

## F3. Klassvy och elevvy ✅ Klar (PR #9)

- Lärarens "Dina klasser" i sidomenyn hämtas från `GET /api/classes`.
- `/classes/:classId`: elevlista, "Lägg till elev" via en sökbar rullista (`SearchSelect`) och ta bort ur klassen med bekräftelse på sidan. Läraren väljer bland sina kopplade elever, skoladmin bland skolans. Skoladmin kopplar också lärare.
- `/students`: elevregistret. Skoladmin lägger in elever med lärare och klass och söker bland skolans elever. Läraren ser "Mina elever". Rektor och SYV läser.
- `/students/:studentId`: skoladmin väljer elevens lärare.
- `/classes/new`: skapa klass (lärare och skoladmin).
- `/classes`: skolans alla klasser för skoladmin och rektor (nytt menyval "Klasser").
- `/students/:studentId`: elevens namn, skola, klasser och lärare. Fylls på med APL och närvaro i F4 och F5.
- API-anropen finns i `src/api/classes.ts`. `ApiError` i `src/api/errors.ts` visar API:ts felmeddelande.

**Klassen är navet** (Texas, 2026-10-20). Klassvyn har flikarna Elever, APL-villkor, Frågor och Lärare (bara skoladmin). Läraren styr klassen därifrån: vilka elever som går i den, varje elevs praktikplats (B3) och projekt (B12), klassens APL-villkor (dagar per vecka, incheckning och vilka veckodagar veckoredovisning ska lämnas) och frågorna vid redovisning (B5). Läraren har ingen egen elevlista. `/students` är skoladmins, rektorns och SYV:s elevregister.

Veckoredovisningen har kvar demodata i sin sidopanel tills F11. Översikten har riktig data sedan F6. Elevhistoriken har riktig data sedan F16.

---

## F3b. Användare och skolor ✅ Klar (PR #10)

- `/users`: skolans personal med filter per roll. Skoladmin lägger till lärare, rektor och SYV (`POST /api/schools/{id}/users`). Rektor läser.
- `/admin/schools` och `/admin/schools/:id`: superadmin skapar skolor och deras skoladministratörer, och ser antal konton per roll.
- Ny komponent `SelectField` med etikett kopplad via id. Används för alla rullistor utom elevhistorikens (demodata).

Därmed går en ny skola att sätta upp helt i gränssnittet: skola, skoladmin, personal, klasser, elever och APL-villkor. Nya konton kan inte logga in förrän inbjudan och lösenord finns (B6).

---

## F4. Min APL och handledarvy ✅ Klar ([PR #23](https://github.com/TexasForslund/firstflow/pull/23), Texas + Claude)

Byggd 2026-10-26 mot B3 (PR #22). Ingen ändring i backend.

- **Elev, `/my-apl`:** kortet med pågående APL (arbetsplats, adress, period, vecka X av Y och hur många dagar som är kvar) och handledaren. Utan pågående placering visas den närmaste kommande. Kommande och tidigare placeringar listas under.
- **Handledare, `/my-students`:** dagens elever grupperade per arbetsplats, med period och vecka.
- **Lärare och skoladmin, `/placements`:** skolans arbetsplatser med handledare. Ny arbetsplats och Lägg till handledare. Rektor ser sidan utan att kunna ändra.
- **Klassvyn, fliken Elever:** elevraden visar pågående eller nästa placering. Knappen öppnar en panel med elevens placeringar (Ta bort) och formuläret Ny placering: arbetsplats, handledare på arbetsplatsen, start- och slutdatum. Överlappande period och fel handledare ger tydliga felmeddelanden.
- Elever ser inte längre `/placements`, bara Min APL.

Elevens praktikplats på elevsidan (`/students/:id`) är byggd i F16.

Ursprunglig spec:

- Elev, `/my-apl`: arbetsplats, period och handledare från `GET /api/me/placements`.
- Handledare, `/my-students`: elever från `GET /api/supervisor/students`.
- Lärare: på klassvyn visas varje elevs APL-plats från `GET /api/classes/{class_id}/placements`, med möjlighet att koppla elev till plats.
- Arbetsplatser och handledare finns i `GET/POST /api/workplaces` och `POST /api/workplaces/{id}/supervisors`. Placeringen skapas med `POST /api/placements` och tas bort med `DELETE /api/placements/{id}`. Se B3 i backend.md (Hannes + Claude, 2026-10-21).

---

## F5. Incheckning och närvaro ✅ Klar ([PR #26](https://github.com/TexasForslund/firstflow/pull/26), Texas + Claude)

**Byggd 2026-10-26** mot B4:
- Elev, `/check-in`: stor knapp Checka in, sedan "Incheckad 07:52". Veckans dagar som prickar (grönt incheckad, streckad inte incheckad). Anmäl frånvaro är borttaget (Texas, 2026-10-26).
- Lärare, `/attendance` (ny i menyn, även för skoladmin och rektor via adressen): välj klass och period (den här veckan, senaste fyra veckorna eller egna datum). En rad per elev med närvarostapel och siffror, elever med flest dagar utan incheckning överst och märkta Följ upp.
- Handledare, `/my-students`: dagens status per elev (incheckad med tid, sjuk, frånvarande eller inte incheckad).

Ursprunglig spec:


Väntar på: B4.

- Elev: en stor knapp "Checka in" på startsidan (`POST /api/attendance/check-in`) och "Anmäl frånvaro". Visa tydligt när eleven redan är incheckad i dag.
- Lärare, `/attendance`: närvaro per elev i klassen för vald period.
- Handledare: vilka av eleverna som har checkat in i dag.


**F5b. Bekräftad närvaro 🚧 Granskas (Texas + Claude, 2026-10-29).**
- Handledaren: sidan Närvaro (`/attendance-review`) med "I dag" (Bekräfta, Inte på plats, Var här ändå) och "Tidigare dagar" grupperade per dag, med "Bekräfta valda". Sidomenyn visar hur många som väntar.
- Lärarens översikt: raden överst visar bekräftade, väntar och ej incheckade. "Dagens närvaro" har den stora procentsiffran, en stapel i tre färger och en rad per elev. Om incheckningen och handledaren inte stämmer visas en diskret röd prick.
- Närvarosidan: veckotabell med ett läge per dag (`DayMark`), bläddring mellan veckor, "Påminn handledarna" och förklaring.
- "Behöver uppmärksamhet": fliken Närvaro samlar ej incheckade, dagar som väntar på handledaren och dagar som inte stämmer.

---

## F6. Demo till fas 0: lärarens översikt ✅ Klar ([PR #31](https://github.com/TexasForslund/firstflow/pull/31), Texas + Claude, 2026-10-26)

Översikten (`/overview`) har riktig data från `GET /api/teacher/overview`, enligt skissen `larare-oversikt.png` (flik A). Flikarna B och C och kortet Meddelanden är borttagna (Texas, 2026-10-26). Meddelanden kommer tillbaka när de är byggda.

- Överst: elever på APL i dag, incheckade och ej incheckade.
- **Behöver uppmärksamhet**, viktigast först: minst två missade incheckningar de senaste fyra veckorna, redovisningar som inte är lämnade, och elever utan praktikplats när andra i klassen har en. Varje rad leder till elevsidan. Siffran vid Översikt i menyn är antalet.
- **Veckoredovisningar att läsa:** de tio senaste olästa, med de två första textsvaren och knappen Öppna.
- **Dagens närvaro:** procent incheckade och siffror per klass med APL i dag.

Ursprunglig spec: När F1–F5 fungerar mot demodatan från `scripts/seed_demo.py` är det den demo som fas 0 behöver. Lägg då till en dashboard för läraren med överblick: antal elever på APL, dagens incheckningar och frånvaro.

---

## F7. Skoladministratör – lärarkategorier och rapporter ⬜

Väntar på: B7 (skoladmin-endpoints, backend).

**Mål:** Skoladministratören kan registrera lärarkategorier och exportera rapporter.

**Gör så här**

1. Ny roll `school_admin` i appskalet: navigering med flikarna Lärarkategorier, Rapporter.
2. `/admin/teacher-categories`: lista lärare med nuvarande kategori (Skolverkets kod + beskrivning). Formulär för att ändra kategori.
3. `/admin/reports`: två knappar — "Materialsersättningsunderlag" och "Statsbidragsrapport". Datumväljare för period/läsår. Knapp triggar nedladdning av Excel-fil från backend.

**Klart när:** det går att ändra en lärares kategori och ladda ner båda rapporterna.

---

## F8. WCAG 2.1 AA – tillgänglighetsgenomgång ⬜

Väntar inte på annat. Görs löpande men formellt när F1–F5 är klara.

**Mål:** Publicerat tillgänglighetsutlåtande och uppfyllt WCAG 2.1 AA.

**Gör så här**

1. Kör [axe DevTools](https://www.deque.com/axe/) eller Lighthouse accessibility audit på alla vyer.
2. Säkerställ: fokushantering vid routing, alt-texter på ikoner, kontrast ≥ 4.5:1 för brödtext, formulärfält har `<label>`.
3. Tangentbordsnavigering: alla interaktiva element nåbara med Tab, Enter och Escape.
4. Skriv tillgänglighetsutlåtande i `docs/tillganglighetsutlatande.md` (mall: Diggs mall för DOS-lagen).

**Klart när:** inga kritiska axe-fel, utlåtande publicerat.

---

## F9. Avtalshantering och signeringsflöde ✅ Klar ([PR #37](https://github.com/TexasForslund/firstflow/pull/37), [#38](https://github.com/TexasForslund/firstflow/pull/38), [#42](https://github.com/TexasForslund/firstflow/pull/42), Texas + Claude, 2026-10-29)

Enligt skissen "Firstflow – Kontrakt skiss":
- **Kontraktslistan** (`/contracts`): elev med e-post, företag och handledare, signeringar (E, L, H), status och skickat-datum. Sök, filtret "Skickat från" och Väntar, Klara och Alla.
- **Nytt kontrakt** i en popup som täcker nästan hela skärmen: PDF med förhandsvisning, namn, period, elev, företag och handledare. Period, företag och handledare förväljs från elevens praktikplats. Spara utkast eller Skicka för signering.
- **Kontraktets sida** (`/contracts/:id`): PDF:en, signering per part, detaljer och händelser. Påminn, Ladda ner PDF och Ta bort.
- **Behöver uppmärksamhet** på översikten har flikar per typ (Närvaro, Redovisningar, Kontrakt, Praktikplats) med antal, enligt skiss C (Texas, 2026-10-29). Raderna har Öppna, och kontrakten också Påminn.
- **Eleven och handledaren** signerar på kontraktets sida (testläge). Eleven ser kontraktet överst i Min APL. Sidomenyn visar hur många kontrakt som väntar.
- **Elevens kontrakt** (`/contracts` för elev): egen vy utan sök och filter (Texas, 2026-10-29). Kontrakt som väntar visas som kort med företag, handledare och signeringarna i ord (Du, Lärare, Handledare). När det är elevens tur finns knappen "Läs och signera". Signerade kontrakt ligger i en lista under.

---

## F10. Elevens app ⬜

Väntar på: skisser från Texas.

Elevens vy är byggd för mobilen först och ska kännas som en app i stil med sociala medier: incheckning, veckoredovisning med bilder, meddelanden och den egna APL-platsen. Samma designprofil som lärarvyn.

---

## F11. Koppla lärarvyerna till API:t ⬜

Väntar på: B5, B11 och B12.

Ersätt `src/demo/data.ts` med riktiga anrop: veckoredovisningar, meddelanden, projekt och "Behöver uppmärksamhet". Ta bort demodatan när allt är kopplat.

---

## F12. Klassvyn: praktikplats, projekt och frågor ⬜

Väntar på: B3, B12 och B5.

Koppla in det som redan har en plats i klassvyn: "Tilldela praktikplats" och projekt i varje elevrad under fliken Elever, och valet av frågor under fliken Frågor (byggs i F13).

---

## F13. Frågor och veckoredovisning (B5) ✅

Bygger på B5a (PR #14) och [docs/design/fragor-typeform.md](../docs/design/fragor-typeform.md). Tre delar, en PR var:

1. **Lärarens frågebyggare** ✅ Klar (PR #15): fliken Frågor i klassvyn. Frågelista med dra och släpp, frågan i mitten där läraren skriver direkt, inställningar och logik till höger, menyn Lägg till fråga, autosparning, Publicera ändringar och Kasta ändringar. Rektor och superadmin ser frågorna utan att kunna ändra.
2. **Elevens redovisning** ✅ Klar (PR #17): mobilen först, i stil med Snapchat och Instagram men i Firstflows designprofil (Texas, 2026-10-20). En fråga i taget med Föregående, Nästa och Skicka in, animationerna från fragor-typeform.md och en slutskärm. Inskickad redovisning blir ett inlägg med kommentarer. Elevens startsida har stories med redovisningsdagarna, kortet med nästa redovisning och ett flöde med inlägg, och eleven har en flikrad längst ned i mobilen. Läraren kan förhandsgranska frågorna som eleven ser dem. Ingen skiss än, justeras när Texas skissat.
3. **Läraren läser redovisningarna** ✅ Klar (PR #18): fliken Redovisningar i klassvyn, olästa först, och redovisningen enligt [larare-veckoredovisning.png](../docs/design/larare-veckoredovisning.png) med kommentarer. Redovisningen markeras som läst när läraren öppnar den. Demoskissernas redovisningar (korta id:n) visas som förut tills F11.

---

## F14. Inställningar ✅ Klar (PR #19)

Sidan Inställningar för alla roller (Texas, 2026-10-20):

- **Visning:** fyra lägen (Mindre, Standard, Större, Störst) och fyra inställningar med namn som känns igen från mobilen: Textstorlek, Öka kontrasten, Minska rörelse och Mer luft i texten (WCAG 1.4.12). Sparas på kontot och gäller på alla enheter. Inget mörkt läge (Texas).
- **Konto:** namn, e-post, roll och skola visas men ändras av skolans administratör. Logga ut från andra enheter.
- **Senare:** aviseringar (väntar på e-post i B6 och D4) och fler språk.

---

## Förbättringar efter genomgång med Texas (2026-10-26) ✅ Klar ([PR #27](https://github.com/TexasForslund/firstflow/pull/27))

- Rullistor har vit bakgrund och ram, som datumfälten.
- Sökbara val (`Combobox`) för arbetsplats och handledare, och sökfält för elever i klassvyn och på Närvaro.
- Vänstermenyn kan fällas ihop så att bara ikonerna syns. Valet sparas i webbläsaren.
- Elevraden i klassvyn visar bara ikon och företagsnamn. Handledare och period syns i panelen.
- APL-villkor har förklaringar till vad varje inställning styr.
- Anmäl frånvaro är borttaget helt (Texas, 2026-10-26). Närvaro, elevsidan och handledarens Mina elever visar bara incheckad eller ej incheckad.
- Elevens incheckning: en ruta mitt på skärmen första gången eleven öppnar appen en APL-dag efter 08:30. Stängs den visas en rad högst upp på varje sida tills eleven har checkat in. Animation när eleven checkar in.

---

## F16. Elevsidan och Elevhistorik ✅ Klar ([PR #29](https://github.com/TexasForslund/firstflow/pull/29), Texas + Claude, 2026-10-26)

Strukturen är Översikt (flödet) → Elevhistorik (alla elever) → Elevsida (allt om en elev). Alla klick på en elev leder till elevsidan.

- **Elevsidan** (`/students/:id`): klassen i rubriken, Praktikplats (pågående eller nästa, med adress, period, vecka och handledare, och tidigare placeringar), Närvaro (stapel och siffror för perioden, de senaste dagarna och Visa alla), Redovisningar (bara lärare, länk till varje redovisning) och Lärare. Skoladmin redigerar elevens lärare som förut.
- **Elevhistorik** (`/student-history`): riktig data i stället för demodata. Filter på klass och elev (sökbara), filterchips, grupper per klass och en rad per elev med praktikplats och antal redovisningar.
- **En klass per elev:** läggs en elev som går i en annan klass till i klassvyn visas "X går i EE22. Vill du flytta eleven hit?" med knappen Flytta. Skoladmin väljer en klass (inte flera) när en elev läggs in.
- Veckoredovisningens sidopanel visar elevens riktiga praktikplats.

**Inte byggt:** antal projekt per elev (väntar på B12). Byter eleven klass följer redovisningarna med till den nya läraren (Texas, 2026-10-26). Den nya klassens flik Redovisningar visar bara det som skrevs i klassen, men elevsidan visar allt.

---

## F19. Projekt ✅ Klar ([PR #36](https://github.com/TexasForslund/firstflow/pull/36), [#41](https://github.com/TexasForslund/firstflow/pull/41), Texas + Claude, 2026-10-29)

- **Projektsidan** (`/projects`), version 2 enligt skissen "Firstflow – Projekt skiss" (Texas, 2026-10-29):
  - En tabell med projekt, elever, företag, tidplan och redovisningar (olästa för läraren). Sök och filtren Pågående, Avslutade och Alla.
  - Projektets egen sida `/projects/:id`: faktarutor, redovisningarna i projektet med filter per elev, Om projektet, Elever och Vem kan ändra.
  - Nytt projekt och Ändra projekt i en popup som täcker nästan hela skärmen. Läraren väljer företag, handledare som kan ändra, elever och om projektet är avslutat.
  - Handledaren har Projekt i sidomenyn, ser projekten hen är inbjuden till och ändrar text, slutdatum och taggar. Elevvalet syns inte för handledaren.
- **Elevsidan** har kortet Projekt till höger, projektet på varje redovisning och filtret Projekt.
- **Elevhistorik** visar "Projekt tilldelade" per elev.
- **Översikten** visar projektet på redovisningarna.
- **Projektval i redovisningen** ([PR #41](https://github.com/TexasForslund/firstflow/pull/41)): ett valfritt sista steg med stora projektkort, tre åt gången och "Se fler". Knappen blir "Skicka in till {projekt}".

---

## F20. Handledaren läser och kommenterar redovisningar ✅ Klar ([PR #43](https://github.com/TexasForslund/firstflow/pull/43), Texas + Claude, 2026-10-29)

Enligt skissen "Firstflow – Handledaren läser redovisningar skiss":
- **Redovisningar** (`/student-reports`) i handledarens sidomeny, med antal olästa. Ett flöde med elevernas inlägg från tiden hos handledaren: namn, dag, projekt, första textsvaret och antal kommentarer. Nya inlägg har en prick. Knappar för Alla elever och en per elev.
- **En redovisning** (`/student-reports/:id`): alla svar och kommentarerna. Handledaren skriver en kommentar, och under fältet står att eleven och läraren ser den. Redovisningen markeras som läst när den öppnas.
- `seed_showcase`: handledaren har läst allt utom den senaste veckan.

---

## F22. Privata kommentarer på redovisningar ✅ Klar ([PR #46](https://github.com/TexasForslund/firstflow/pull/46), Texas + Claude, 2026-10-30)

Enligt "Firstflow – Privata kommentarer skiss" (Texas, 2026-10-30). Backend: B17.
- Lärare och handledare väljer **Alla ser** (förvalt) eller **Bara lärare och handledare** ovanför kommentarsfältet. Vid privat blir fältet gult och texten under säger att eleven inte ser kommentaren och inte får någon notis.
- Privata kommentarer har gul streckad ram och märkningen "Bara lärare och handledare" med ett hänglås.
- Eleven ser varken valet eller de privata kommentarerna.

---

## F23. Anteckningar om eleven ✅ Klar ([PR #47](https://github.com/TexasForslund/firstflow/pull/47), Texas + Claude, 2026-10-30)

Enligt "Firstflow – Anteckningar om eleven skiss" (Texas, 2026-10-30). Backend: B18.
- **Handledarens elevsida** (`/my-students/:id`), som nås från Mina elever:
  - Anteckningar om eleven: välj Beröm, Oro eller Övrigt, skriv och spara. Egna anteckningar har Ändra och Ta bort i 24 timmar.
  - Elevens tre senaste redovisningar och länken "Se alla", som öppnar Redovisningar filtrerat på eleven.
- **Lärarens elevsida:** kortet **Från handledaren** med antal per tagg, de tre senaste och "Visa alla". Långa anteckningar kortas av efter fyra rader och läses hela med **Läs hela** i en popup (Texas, 2026-10-30). Läraren skriver inte här.
- Eleven ser inget av det.
- **Inte med än:** närvaro och lärare på handledarens elevsida, som i skissen.

---

## F24. APL-dagar och redovisningsdagar per klass ✅ Klar ([PR #48](https://github.com/TexasForslund/firstflow/pull/48), Texas + Claude, 2026-10-30)

Enligt "Firstflow – APL-dagar och redovisningsdagar skiss" (Texas, 2026-10-30). Backend: B19.
- **APL-villkor i klassvyn:** två rader med måndag–söndag, APL-dagar och redovisningsdagar.
  - Dagar som inte är APL-dagar är gråa och streckade bland redovisningsdagarna och går inte att välja.
  - Tas en APL-dag bort försvinner den också som redovisningsdag.
  - Under varje rad står vad valet betyder, t.ex. "Fre, lör och sön räknas inte som frånvaro".
- **Klassens rubrik** visar t.ex. "4 APL-dagar/vecka".
- **Veckovyerna** (Närvaro, elevsidan och elevens incheckning) visar klassens APL-dagar i stället för måndag–fredag.
- **Eleven** ser "Ingen APL i dag" och nästa APL-dag de dagar klassen inte har APL.

---

## F25. Import av elever och personal ⬜ (från mötet med Haldor, 2026-10-30)

Backend: B20. Skiss först.
- Skoladmin kan fortfarande lägga till en elev eller en ur personalen för hand.
- Skoladmin väljer vilka klasser som har APL i Firstflow, laddar upp en fil (eller startar en synk) och ser en **förhandsvisning** innan något sparas, t.ex. "32 elever, 4 lärare och 1 SYV i 2 klasser läggs in".
- Efter importen: vad som lades till, ändrades och avslutades.

---

## F27. Mål från läroplanen, steg ett ✅ Klar ([PR #50](https://github.com/TexasForslund/firstflow/pull/50), Texas + Claude, 2026-10-30)

Enligt "Firstflow – Mål från läroplanen skiss" (Texas, 2026-10-30). Backend: B22.
- **Frågebyggaren:** avsnittet **Mål** i ja/nej- och flervalsfrågor: välj mål per svar ("När eleven svarar Ja") och lägg till nya mål.
- **Projektets sida:** tabellen **Mål i projektet** med elever × mål. Antalet går att klicka på och visar läroplanstexten och redovisningarna: frågan och svaret som gav målet (t.ex. "Har du haft kundkontakt? **Ja**"), och följdfrågan med elevens svar. Streckad ruta = inget underlag än.
- **Elevsidan:** kortet **Mål** med antal per mål. Ett klick visar underlaget.
- Projektens taggar ser ut som förut men är nu mål.

- **Projektets popup** (Texas, 2026-10-31): fältet heter **Mål** i stället för Taggar, har en förklaring och föreslår skolans mål. Förslagen har större text.
---

## F26. Inriktningar och frågor per inriktning ✅ Klar ([PR #49](https://github.com/TexasForslund/firstflow/pull/49), Texas + Claude, 2026-10-30)

Enligt "Firstflow – Frågor per inriktning skiss" (Texas, 2026-10-30). Backend: B21.
- **Fliken Elever i klassvyn:** kortet **Inriktningar** med antal elever per inriktning, Ny inriktning och Ta bort. I elevlistan väljer läraren inriktning per elev.
- **Fliken Frågor:** avsnittet **Visas för** (Alla elever eller Vissa inriktningar) i frågans inställningar, med hur många elever som får frågan. Frågor för vissa inriktningar har en etikett i frågelistan.
- Eleven märker inget särskilt. Frågor för andra inriktningar hoppas över.

---

## F30. Redovisningar i stället för Elevhistorik ✅ Klar ([PR #54](https://github.com/TexasForslund/firstflow/pull/54), Texas + Claude, 2026-10-31)

Enligt "Firstflow – Redovisningar skiss" (Texas, 2026-10-31). Backend: B23. Menyvalet Elevhistorik heter **Redovisningar** och ligger på `/reports`. `/student-history` leder till Per elev, så gamla länkar fungerar.
- **Alla redovisningar** (visas först): lärarens alla redovisningar, nyaste först och grupperade per dag. Varje rad visar elev, vilken redovisning, klass, början av första svaret, projekt, och om den är oläst, sen, har kommentarer eller en privat kommentar.
- **Filter:** klass, elev och projekt, och snabbval med antal: Olästa, Sena, Med kommentarer, Har privat kommentar och **Saknas**. Saknas visar redovisningsdagar de senaste fyra veckorna där eleven inte har redovisat, samma regler som Översikten. Visa fler hämtar 100 till.
- **Per elev:** en tabell per klass med senaste redovisning, olästa, saknas och projekt. Raden leder till elevsidan.

---

## F29. "Vad är det här?" vid svåra begrepp ✅ Klar ([PR #53](https://github.com/TexasForslund/firstflow/pull/53), Texas + Claude, 2026-10-31)

Enligt "Firstflow – Vad är det här? skiss" (Texas, 2026-10-31). En liten knapp bredvid begreppet öppnar en ruta med två–tre meningar och ett exempel. Stängs med krysset, Esc eller ett klick utanför. På mobilen är rutan lika bred som skärmen.
- **Mål:** projektets popup, frågebyggarens avsnitt Mål och tabellen Mål i projektet.
- **Inriktningar:** kortet Inriktningar och Visas för i frågebyggaren.
- **APL-dagar:** APL-villkor i klassvyn.
- **Privat kommentar:** valet Alla ser / Bara lärare och handledare vid kommentarer.
- Texterna står i `frontend/src/components/helpTexts.ts` och komponenten är `HelpPopover`.
- Inget om GDPR i texten om privata kommentarer än. Det beslutas tillsammans med Haldor senare.

---

## F28. Kom igång för läraren ⬜ (Texas, 2026-10-31: när resten är byggt)

En checklista på lärarens översikt tills allt är klart, så att en ny lärare har en väg att följa i stället för att leta i menyn:
- Skapa klass
- APL-dagar och redovisningsdagar
- Frågor
- Praktikplatser
- Projekt och mål

Varje steg leder till rätt sida och bockas av när det är gjort. Listan försvinner när allt är klart. Skiss först.

---

## F21. Eleven öppnar ett projekt från Min APL ✅ Klar ([PR #44](https://github.com/TexasForslund/firstflow/pull/44), Texas + Claude, 2026-10-29)

Enligt skiss B i "Firstflow – Elevens projekt skiss" (Texas, 2026-10-29):
- **Min APL:** projekten under Mina projekt är klickbara och öppnar `/my-projects/:id`.
- **Projektet:** en topp i projektets färg med namn, företag, slutdatum och antal egna redovisningar. Flikarna **Mina redovisningar** (först) och **Om projektet** (beskrivning, taggar och vilka som är med: lärare, handledare och andra elever, bara namn).
- Redovisningarna öppnar elevens inlägg `/my-reports/:id`.
- API: `GET /api/me/projects/{id}` (elev). Eleven måste vara med i projektet, annars 404. Bara elevens egna redovisningar i projektet.

---

## F18. Ny sidomeny ✅ Klar ([PR #33](https://github.com/TexasForslund/firstflow/pull/33), Texas + Claude, 2026-10-26)

Skissen "Firstflow – Sidomeny skiss", alternativ A, är vald av Texas.

- Menyn är 280 px bred i stället för 380.
- Lärarens val är grupperade:
  - **I dag:** Översikt, Närvaro med dagens "3/5" och Meddelanden.
  - **Elever:** Elevhistorik och Mina klasser, som går att fälla ihop.
  - **APL:** Praktikplatser, Projekt och Kontrakt.
- Siffrorna har färg efter vad de gäller: persika för att följa upp, lila för olästa och gult för att signera.
- "Välkommen tillbaka" och profilrutan är borttagna. Namn, roll och skola ligger längst ned, och ett klick där öppnar Inställningar och Logga ut. Bredvid finns knappen som fäller ihop menyn.
- Andra roller har samma stil utan grupper.

---

## F17. Elevsidan, version 2 ✅ Klar ([PR #32](https://github.com/TexasForslund/firstflow/pull/32), Texas + Claude, 2026-10-26)

Skissen är gjord och godkänd av Texas (Design-ytan "Firstflow – Elevsida skiss").

- **Vänster kolumn: Redovisningar** får mest plats. Där finns sök i svaren, val av period (hela tiden, den här veckan, de senaste fyra veckorna) och fråga, och knappar för Alla, Olästa, Med kommentarer, Sena och Saknas, med antal på varje. Korten visar de två första svaren. Saknade redovisningar visas som gula streckade kort på sitt datum. Bara lärare ser redovisningarna.
- **Höger kolumn:** Behöver uppmärksamhet (bara när det finns något), Närvaro (procent, stapel, veckans dagar och alla incheckningar) och Praktikplats (period, förloppsstapel, handledare och andra placeringar).
- **Exportera** syns men är avstängd tills vi har bestämt vad exporten ska innehålla.
- Lärarkortet är borttaget. Skoladmin ändrar elevens lärare via länken Ändra lärare.
- Elevens avatar och avataren i sidomenyn är mindre.
- Nya mjuka färger i designprofilen: mint (praktikplats), ljusblå (närvaro) och ljusgul (saknade redovisningar).

---

## F15. Inbjudan av handledare, Företag och notiser ✅ Klar ([PR #28](https://github.com/TexasForslund/firstflow/pull/28), Texas + Claude, 2026-10-26)

- **Praktikplatser** (lärare, skoladmin): Bjud in handledare med e-post, listan Skickade inbjudningar (väntar, konto skapat, utgången, återkallad) med Skicka igen och Återkalla, och Dina företag med profil och handledare. Ny arbetsplats och Lägg till handledare är borttagna.
- **`/invite/:token`** (ingen inloggning): handledaren skapar konto och företagsprofil, och hamnar sedan på Mina elever.
- **Företag** (handledare, `/company`): företagsprofilen med Redigera, handledarna och Bjud in en kollega (högst tre).
- **Notiser:** en klocka i menyn (och i mobilens toppfält) med antal olästa. Notiserna markeras som lästa när listan öppnas.
