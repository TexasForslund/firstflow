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

## 10. Taggar som kopplar projekt, redovisning och läroplan

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

## 11. Frågor till vissa elever, t.ex. per inriktning

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

