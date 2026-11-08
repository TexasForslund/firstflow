# Idéer att bolla

Anteckningar från Texas (2026-10-20). Saker att diskutera, bygga eller kanske inte ha med. **Inget här är beslutat.** Ta upp en idé med Texas innan den byggs, och flytta den till `backend.md` eller `frontend.md` när den är bestämd.

Nya anteckningar läggs till sist. Står det en fråga under en idé är den inte besvarad än.

Krockar en idé med en uppgift som redan finns står det under **Hänger ihop med**. Hannes äger B3, B4 och B6, så idéer som rör dem stäms av med honom.

---

## 1. Kommentarer på redovisningar från fler roller

Handledare, elever, lärare och SYV ska kunna kommentera elevernas inlägg och redovisningar. Kommentarerna visas under inlägget.

- **I dag (B5a):** eleven och klassens lärare kan kommentera.
- **Kvar:** handledaren, som behöver kopplingen elev–handledare från B3, och SYV.
- **Att bolla:** vilka elever SYV ska se, alla på skolan eller bara vissa.

Hänger ihop med: B3 (Hannes), B5b.

---

## 2. Projekt

Lärare, handledare och SYV skapar tillsammans projekt som kopplas till elever, t.ex. "Bygga hemsida".

- Ett projekt har:
  - ett namn
  - en beskrivning
  - en deadline (valfri)
  - taggar för vad det innehåller, t.ex. JS, HTML och CSS
- Redovisningar kopplas till projekt (se B5: "Vilket projekt gäller det?").
- Lärare, handledare och SYV ser en **sammanställning per projekt** utifrån redovisningarna som är kopplade till det.
- **Att bolla:**
  - Är taggarna fritext eller en lista?
  - Vem får ändra eller ta bort ett projekt?
  - Kan ett projekt ha flera elever?

Hänger ihop med: B12, F12, B5b (projektval).

---

## 3. Elevhistorik

Sidan ska vara mer än historik. Först visas en **överblick** över alla klasser, elever och elevens praktikplats.

Under en enskild elev:

- **Vänster:** alla redovisningar eleven har skapat under terminen.
  - Det ska gå att filtrera, t.ex. på datum.
  - Alla redovisningar visas inte direkt, eftersom sidan ska vara snabb.
  - Förslag: de senaste 10 visas, och "Visa fler" hämtar nästa sida. Backend behöver då sidindelning (`limit` och en markör), filter för datumintervall och projekt, och en kort sammanfattning per redovisning i stället för alla svar.
- **Höger, uppifrån och ned:**
  1. Snittnärvaro, som i dag.
  2. Praktikplatsen och kontaktuppgifter till handledaren.
  3. Elevens projekt, med en knapp för att skapa ett nytt och en länk till alla projekt man har skapat.

Hänger ihop med: F11, B3, B4, B12.

---

## 4. Praktikplatser

Från lärarens vy visas en översikt över alla företag som är kopplade till **läraren**, inte till hela skolan.

- Läraren bjuder in handledare med en länk. Handledaren skapar sitt konto via länken och visas sedan som ett val för läraren, med kontaktuppgifter. Läraren kan därefter tilldela elever till företaget.
- **Viktigt att bolla:** i dag gäller regeln "ingen kan registrera sig själv" (CLAUDE.md). En inbjudningslänk som läraren skapar kan fortfarande följa den regeln, eftersom kontot skapas uppifrån via inbjudan. Men länken måste:
  - gälla en viss praktikplats,
  - gå ut efter en tid,
  - gå att stänga av,
  - bara skapa konton med rollen handledare.
- **Att bolla:** kan flera lärare dela en praktikplats? Det är vanligt att samma företag tar emot elever från flera lärare.

Hänger ihop med: B3 och B6 (inbjudningar), båda Hannes.

---

## 5. Notiser

1. Läraren får en notis eller ett mejl när en handledare har skapat konto via praktikplatsens länk.
2. Läraren får notiser när något hamnar under "Behöver uppmärksamhet".

- **Att bolla:**
  - Notiser i appen, mejl eller båda?
  - Kan man välja bort dem under Inställningar? Där finns redan en plats för aviseringar.

Hänger ihop med: B13, B6, D4 (e-post), F14.

---

## 6. Kontrakt

Tidigare skickade skolan kontrakten med mejl, och de signerades där.

- Enligt upphandlingen är tolkningen att rektor, lärare och skoladmin skapar kontrakten. Läraren ser dem och skickar dem från Firstflow till elev och handledare, som signerar.
- **Att bolla:**
  - Vem skapar kontraktet, och utifrån vilken mall?
  - Hur ska signeringen gå till (BankID, e-legitimation eller enklare)?
  - Vad gäller när eleven är minderårig och vårdnadshavare ska skriva under?

Hänger ihop med: B8, F9 och [upphandling-norrköping.md](../docs/upphandling-norrköping.md).

---

## 7. Kalender och schema

Handledaren och läraren lägger tillsammans upp ett schema för eleven: vilka dagar eleven har APL, när dagen börjar och hur lång den är. Eleven ser det som en översikt.

- **Att bolla:**
  - Ett fast veckoschema eller dag för dag?
  - Ska schemat styra incheckningen (B4) och redovisningsdagarna?

Hänger ihop med: B3, B4 (Hannes), APL-villkoren i B2.

---

## 8. Arkivera och ta bort klasser

Det ska gå att arkivera klasser, t.ex. när terminen är slut, och att ta bort klasser.

- **Att bolla:**
  - En arkiverad klass går att läsa men inte ändra. Var visas den?
  - Ta bort: vad händer med elevernas redovisningar? I dag kan en klass med redovisningar inte tas bort (`RESTRICT`), vilket är avsiktligt. Ta bort bör därför nog bara gå för tomma klasser, och resten arkiveras.

Hänger ihop med: B2, B10 (mellanarkiv).

---

## 9. Elever som har gått ut

Hur hanterar vi elever efter studenten, eller när praktiken är slut?

- **Att bolla:**
  - Stängs kontot av automatiskt, och när?
  - Hur länge sparas redovisningarna innan de gallras?
  - Får eleven exportera sina egna redovisningar innan kontot stängs?
- Hänger ihop med att elevkonton med redovisningar inte kan raderas i dag (se B5 i `backend.md`) och med [mellanarkiv-dataexport.md](../docs/mellanarkiv-dataexport.md).

Hänger ihop med: B10, D8.

---

## 10. Taggar som kopplar projekt, redovisning och läroplan (steg ett byggt i B22 och F27)

Anteckning från Texas (2026-10-30), skriven till Claude att tänka vidare på. **Här måste vi tänka smart.**

Exempel: läraren har frågan "Har du haft kundkontakt i dag?" i redovisningen. Projektet har taggen **Kundkontakt**, eftersom kundkontakt är en del av läroplanen. Svarar eleven ja ska kopplingen synas hela vägen: läroplanen → projektets tagg → frågan → elevens svar.

Tankar att bolla (Claude, inte beslutat):
- **Gemensamma taggar i stället för fritext.** Projektens taggar är fritext i dag (B12). Kopplingen kräver att taggen på projektet och på frågan är *samma* sak. Förslag: skolan eller läraren har en lista med taggar, och varje tagg kan pekas mot en del av läroplanen (kursens centrala innehåll eller kunskapskrav, från Skolverkets API).
- **Frågor och svarsalternativ får taggar.** Ja-svaret på "Har du haft kundkontakt?" eller alternativet "Kundkontakt" i en flervalsfråga bär taggen Kundkontakt. Då vet systemet vilka svar som visar vad, utan att läsa fritext.
- **Underlag per elev.** Läraren ser för varje elev (och projekt) vilka delar av läroplanen eleven har visat, hur ofta och i vilka redovisningar. Det blir ett underlag vid bedömning. Delar som saknas syns också.
- **Fritext senare.** Claude kan föreslå taggar utifrån fritextsvar, men läraren bekräftar. Ingen automatisk bedömning.

Frågor:
- Vilken nivå i läroplanen: kurs, centralt innehåll eller kunskapskrav?
- Vem äger taggarna: skolan, programmet eller läraren?
- Hur visas kopplingen för eleven, om alls?

Hänger ihop med: B12 (projekt och taggar), B5b (förslag utifrån läroplanen), idé 2.

---

## 11. Frågor till vissa elever, t.ex. per inriktning (inriktningar byggda i B21 och F26)

Anteckning från Texas (2026-10-30). Det ska gå att ställa specifika frågor till specifika elever. Exempel: EE-klassen kan ha två inriktningar, en för dator och en för programmering. Då måste frågorna kunna skilja inriktningarna åt.

Tankar att bolla (Claude, inte beslutat):
- **Grupper i klassen.** Läraren delar in klassen i grupper, t.ex. "Dator" och "Programmering". En fråga visas för hela klassen eller för valda grupper.
- **Enskilda elever** går att välja också (B5b har redan "extra frågor per elev").
- **SS12000:** inriktningar kan komma från skolans system som grupper eller programkoder vid import (B20), så att läraren inte behöver lägga in dem själv.
- Logiken i formuläret (hoppa över frågor) finns redan och kan bygga på samma val.

Frågor:
- Räcker grupper i klassen, eller behövs frågor per enskild elev från början?
- Ska grupperna följa med eleverna från importen, eller sätter läraren dem?

Hänger ihop med: B5b (extra frågor per elev), B20 (import), idé 10.


---

## 12. Att gå igenom nästa gång (Texas, 2026-11-06)

Texas vill gå igenom de här punkterna vid nästa arbetspass innan något byggs.

**Handledaren:**
- **Frånvaro med förklaring:** handledaren ska kunna markera att eleven varit borta och välja en förklaring, t.ex. sjukanmäld eller ledig. Det är upp till handledaren att välja. ✅ Byggt i #72 (2026-11-07): Sjuk, Ledig, Annat eller Ingen förklaring, och en valfri kommentar. Läraren ser den, eleven gör det inte.
- **Mål i projekt:** handledaren ska se målen i ett projekt men inte kunna lägga till nya. ✅ Byggt i #74 (2026-11-07): handledaren ser målen i Ändra projekt men ändrar dem inte. Backend svarar 403.
- **Elevens sida:** handledaren ska se elevens sida med elevens information. ✅ Byggt i #76 (2026-11-07): sidan är som lärarens, med redovisningarna som läraren ser dem, men bara tiden hos handledaren.
- **Kalender:** handledaren lägger upp en kalender för när dagen börjar, och kanske mer. Den styr incheckningen. Eleven ska kunna checka in från tio minuter innan dagen börjar, om eleven är tidig. Hänger ihop med idé 7. ✅ Byggt i #75 (2026-11-07): arbetstider per företag i Företagsprofilen, egna tider per elev, incheckning från tio minuter innan. Läraren ser tiderna på elevsidan.
- **Meddelanden:**
  - Handledaren ska bara kunna se och skriva till elever som har praktik hos hen, inte andra elever.
  - Eleven ska kunna skriva till handledare, lärare och SYV, men inte till andra elever (Texas, 2026-11-06). Det fungerar redan så i B11.

**Övrigt:**
- **Sammanfattning av projektet:** ska eleven sammanfatta ett projekt när det är klart? Ett exempel är projektet "Bygga hemsida", där eleven delar filer, länkar och bilder. Sammanfattningen ser olika ut för olika program. Hantverkselever bygger till exempel ingen hemsida.
  - **Beslutat med Texas 2026-11-07** (skissen "Sammanfattning av projekt"). Det ska vara enkelt, eleven ska inte skriva ett gediget arbete.
    - **Projektsidan** får elevval överst ("Elev: Alla, Elsa, Hugo …") och flikarna Översikt, Redovisningar, Bilder och Kommentarer. Elevvalet gäller alla flikar, så att man ser en elevs helhet i projektet. Med bara en elev visas inget elevval. ✅ Steg 1 byggt i #78.
    - **Kommentarer** om en elevs arbete i projektet skrivs av läraren och handledaren under hela projektet, på ett ställe per elev. "Alla ser" eller "Bara lärare och handledare". ✅ #78.
    - **Kedjan läroplan → mål → projekt → redovisning → sammanfattning.** En elevs Översikt visar varje mål med läroplanstexten, antal redovisningar och vilka. Mål utan underlag syns. ✅ #78.
    - **Steg 2, sammanfattningen:**
      - Projektet är klart när läraren eller handledaren markerar det, inte automatiskt vid slutdatumet.
      - Eleven får kortet "Projektet är klart!" med fyra korta frågor: hur det gick (1–5 stjärnor), vad eleven är mest nöjd med (en mening), vilka av projektets mål eleven tycker att den visade (knappar) och bilder på slutresultatet (valfritt, högst 4).
      - Frivilligt: en påminnelse, sedan ligger kortet kvar. I ett grupprojekt svarar varje elev själv.
      - Frågorna är fasta tills vidare. Läraren ändrar dem inte.
      - ✅ Byggt i #85 (2026-11-08): påminnelsen kommer efter tre dagar (Texas). Handledaren kan också markera projektet som klart.
    - **Steg 3:** eleven ser sin egen vy av projektet i Min APL, med samma flikar och utan att kunna ändra något. Där ser eleven också kommentarerna som alla ser.
    - **Väntar:** kopplingen till Skolverket (idé 10).
- **Fråga med bilder:** läraren ska kunna lägga till en fråga där eleven delar bilder. Bilderna komprimeras, t.ex. till WebP. ✅ Byggt i #77 (2026-11-07).

Hänger ihop med: B4 (närvaro), B11 (meddelanden), projekt (idé 2), B5 (frågor), idé 7 (kalender).

---

## 13. Från läroplan till betyg (Texas, 2026-11-08)

Texas skiss på papper: **Läroplanen → (anrop) → mål som läraren skapar → projekt ↔ frågor som läraren skapar. Projekten ger elevens sammanfattning och frågorna ger redovisningar. Båda samlas i historiken och på elevsidan.** På elevsidan sammanfattar Firstflow mål, redovisningar och projekt mot läroplanen, så att läraren får hjälp att sätta betyg. Texas projektleder delen tillsammans med Claude.

**Beslutat 2026-11-08:**
- **Ingen AI i Firstflow än.** Förslagen byggs direkt på läroplanen.
- **Både Gy25 och det gamla systemet.** Gy25 (från hösten 2025) har ämnen med nivåer och betyg per nivå. Elever som började tidigare läser kurser (Gy11). Ett mål ska därför kunna pekas mot ämne och nivå eller mot kurs.
- **Läraren äger sina mål**, inte ämneslaget eller skolan.
- **Firstflow föreslår aldrig ett betyg.** Läraren sätter alltid betyget själv. Firstflow samlar bara underlaget.
- **Läroplanen följer klassen, inte skolan.** Under några år har skolor både Gy25 och Gy11. Skoladministratören kopplar varje lärare till ett program. Klassen får lärarens program, och läroplanen gissas utifrån året i namnet. Läraren kan ändra läroplanen för sina klasser, men bara skoladministratören byter program (Texas 2026-11-08). Undantag för en enskild elev byggs inte från början.
- **Inriktningen hör till eleven** (Texas valde B, 2026-11-08). Läraren kopplar klassens inriktningar till Skolverkets. Läraren får ämnesförslag för klassens alla inriktningar. Senare kan mål gälla bara en inriktning, som frågorna redan kan.
- **Målen pekar på punkter i det centrala innehållet**, inte på betygskriterierna. Läraren kopplar inte målen till ämnets förmågor i första versionen. Betygskriterierna (E, C och A) visas bredvid underlaget som stöd. Om lärarna i piloten saknar underlaget per förmåga lägger vi till det.
- **Piloten börjar med El- och energiprogrammet.**

**Flödet:**
1. **Ämnen och nivåer:** klassen har program och inriktning (finns i dag). Läraren väljer vilka ämnen och nivåer, eller kurser, som APL-perioden ska träna. ✅ Steg 1 byggt i #81 (fliken Läroplan på klassidan).
2. **Anropet:** Firstflow hämtar läroplanen från Skolverkets öppna API (`api.skolverket.se/syllabus`, med ämnen, kurser och läroplaner). ✅ Program och ämnen i #81, det centrala innehållet i #82.
3. **Målförslag:** varje punkt i det centrala innehållet blir ett förslag. Läraren bockar för de som passar och skriver om dem till vanlig svenska. Målet visar alltid vilken del av läroplanen det kommer från. Det ersätter dagens fria text på målet. ✅ Steg 2 byggt i #82: målen hör till klassen (Texas 2026-11-08). Skolans mål utan koppling, till exempel Kundkontakt, finns kvar och används i projekten tills steg 4.
4. **Projekt:** när läraren skapar ett projekt föreslår Firstflow mål genom att söka på orden i beskrivningen. Läraren väljer. ✅ Steg 4 byggt i #83: förslagen kommer från klassens mål för klasserna som projektets elever går i.
5. **Frågor:** till varje mål finns färdiga mallar för frågor, till exempel "Läste du ritningen själv i dag?" som ja/nej där Ja är kopplat till målet. Läraren lägger till med ett klick och ändrar. ✅ Steg 5 byggt i #84: fliken "Från målen" när läraren lägger till en fråga.
6. **Projektets sammanfattning** (idé 12:6, steg 2): när projektet är klart svarar eleven på fyra korta frågor, bland annat vilka av projektets mål eleven tycker att den visade. ✅ Steg 6 byggt i #85.
7. **Elevsidan och historiken:** målen ordnas efter ämne och nivå, eller kurs. Varje del av läroplanen visar redovisningarna och projekten som visar den. Delar utan underlag syns tydligt. Varje avslutat projekt visas med elevens sammanfattning (stjärnor, mening, bilder och de mål eleven valde), bredvid redovisningarna för samma del av läroplanen.
8. **Underlag inför betyg:** en sammanställning per elev och ämne som läraren kan läsa och skriva ut eller exportera.

**Skolverkets API (provat 2026-11-08 med Elteknik ELTE och Elektroteknik ELR):**
- `GET https://api.skolverket.se/syllabus/v1/subjects` ger alla ämnen, med kod, namn, typ och datum. `GRADE_SUBJECT_SYLLABUS` och `reform: GY25` är Gy25 (från 2025-07-01). `SUBJECT_SYLLABUS` och `reform: GY11` är Gy11 (gäller till 2030-06-30). Yrkesämnen är märkta `VOCATIONAL`.
- `GET …/v1/subjects/{kod}` ger ämnet i detalj. Gy25 och Gy11 har samma uppbyggnad. Under `courses` finns nivåerna (Gy25, till exempel `ELTE1000X` "Nivå 1") eller kurserna (Gy11, till exempel `ELRELK0` "Elektromekanik").
- Varje nivå eller kurs har **centralt innehåll** som en HTML-lista. Varje punkt blir ett målförslag.
- **Ämnets syfte** har en lista med förmågor (5 för Elteknik, 7 för Elektroteknik). **Betygskriterierna** har ett stycke per förmåga för E, C och A, och orden som skiljer nivåerna är fetstilta (till exempel "visst", "gott" och "mycket gott" handlag). I Gy25 gäller de för ämnet, i Gy11 per kurs.
- `GET …/v1/programs` ger alla program. Gy11 och Gy25 finns som par: **EE** (Gy11, `PROGRAM`, gäller till 2030-06-30) och **EE25** (Gy25, `PROGRAM25`, från 2025-07-01). Inriktningarna har olika koder i de två, till exempel elteknik `EEELT` och `EEELK`.
- `GET …/v1/programs/EE` och `…/EE25` ger programmet i detalj, med samma uppbyggnad i Gy11 och Gy25 (i Gy25 heter delarna "Nivå 1", "Nivå 2" och så vidare): programgemensamma ämnen, inriktningarnas ämnen och kurser, yrkesutgångar (till exempel Installationselektriker) och programfördjupning. Det räcker för att föreslå kurser utifrån klassens program och inriktning. Kedjan blir: **klass (program och inriktning) → föreslagna kurser eller nivåer → centralt innehåll → målförslag.**
- Firstflow sparar läroplanen själv, hämtad när läraren väljer ett ämne och uppdaterad regelbundet. Målet sparar också texten från när det skapades, eftersom läroplanen kan få nya versioner.

- **El- och energiprogrammet i Gy25 (EE25), inriktning elteknik (EEELK):** programgemensamt Automationsteknik, Dator- och kommunikationsteknik, Elteknik och Energiteknik (nivå 1). Inriktningen: Ellära 1, Installationsteknik 1–2, Kommunikationsnät 1 och Säkerhetssystem 1. Yrkesutgångar finns, till exempel Service- och installationselektriker.

**Öppna frågor:**
- Vilket format ska underlaget inför betyg ha: en sida i Firstflow, en PDF eller båda?
- Ska AI användas senare för förslag på frågor och för att koppla mål till projekt? I så fall utan elevdata och med ett personuppgiftsbiträdesavtal.

**Hänger ihop med:** idé 10 (taggar och läroplan) och idé 12:6 (projektets sammanfattning och elevens mål).
