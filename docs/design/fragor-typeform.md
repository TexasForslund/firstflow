# Frågor och veckoredovisning: förebild Typeform

**Status:** Genomgången av B5 är gjord (Texas och Claude, 2026-10-20). Besluten står i avsnitt 3. Inget är byggt än.
**Syfte:** Läraren bygger frågorna för klassen på samma enkla sätt som i Typeform, och eleven svarar på samma sätt: en fråga i taget, med tydliga och mjuka animationer.

Vi tar efter **arbetssättet och interaktionen**, inte Typeforms varumärke, grafik eller kod. Allt ritas i Firstflows designprofil (lila accent, Inter, inga skuggor).

---

## 1. Så skapar man ett formulär i Typeform

### Byggarens layout

| Del | Innehåll |
|---|---|
| **Vänster** | Formulärets sidor i ordning: frågor, meddelanden och slutskärmar. Dra för att ändra ordning. Menyn med tre prickar flyttar, kopierar och tar bort |
| **Mitten** | Frågan som den ser ut för den som svarar. Man skriver frågetexten direkt i förhandsvisningen (WYSIWYG) |
| **Höger** | Inställningar för den valda frågan. Innehållet beror på frågetypen. Här byts också frågetypen |
| **Överst** | Formulärets namn, Förhandsgranska, Design och Dela |

### Arbetsflöde
1. **Lägg till innehåll** öppnar en meny med frågetyper.
2. Skriv frågan och eventuell beskrivning. Med `@` hämtas ett tidigare svar in i texten, t.ex. "Vad gjorde du på @arbetsplats?".
3. Välj inställningar i högerpanelen, t.ex. Obligatorisk, flera val och bild eller video.
4. Lägg till välkomstskärm och en eller flera slutskärmar.
5. **Logik** (fliken Workflow): hoppa till olika frågor beroende på svar.
6. Förhandsgranska i mobil- och datorläge. Allt sparas automatiskt.
7. Publicera. Ändringar efter publicering syns inte förrän man väljer "Publicera ändringar".

### Frågetyper i Typeform

| Grupp | Typer |
|---|---|
| Kontakt | Kontaktuppgifter, e-post, telefon, adress, webbplats |
| Val | Flerval, rullista, bildval, ja/nej, juridisk text, kryssruta |
| Betyg och rangordning | NPS (0–10), åsiktsskala (1–10, valbart antal steg), betyg med ikoner (stjärnor m.m.), rangordning, matris |
| Text och video | Kort text, lång text, video och ljud, AI-följdfrågor |
| Övrigt | Betalning, tal, filuppladdning, datum, bokning, signatur |
| Struktur | Frågegrupp, välkomstskärm, meddelande (utan svar), slutskärm |

Inställningar på de flesta frågor: **obligatorisk**, **bild eller video** och **beskrivning**. På flerval finns dessutom "flera val" (obegränsat, exakt antal eller ett intervall), "Annat" med fritext, "Inget av ovanstående" och slumpad ordning.

---

## 2. Så svarar man i Typeform

### Grundprinciper
- **En fråga i taget**, centrerad, med stor text: cirka 24 px på dator och 16–20 px i mobilen. Inget annat på skärmen tar uppmärksamhet.
- **Som ett samtal.** Frågan ställs, man svarar och nästa fråga kommer. Tidigare svar kan dyka upp i nästa fråga ("Tack Hugo!").
- **Tangentbordet först**:
  - `Enter` bekräftar och går vidare, `Shift+Enter` ger ny rad i lång text.
  - Bokstäverna `A`, `B`, `C` väljer alternativ i flerval, och `Y` och `N` väljer på ja/nej-frågor.
  - Siffrorna väljer på skalor.
  - Pilarna och `Tab` flyttar mellan frågorna.
- **Stora klickytor.** Varje alternativ är en hel ruta med bokstaven i en liten etikett till vänster, så det går att trycka var som helst på den.
- **Mobilen:** en fråga per skärm, och man sveper eller trycker på "OK" för att gå vidare.
- **Navigering:** en förloppsindikator högst upp och pilar upp och ned i hörnet. En obligatorisk fråga stoppar tills den är besvarad, om inte "fri navigering" är påslagen.

### Animationer och mikroanimationer

| När | Vad som händer | Förslag för Firstflow |
|---|---|---|
| **Nästa fråga** | Den besvarade frågan glider uppåt och tonas ut, och nästa glider in underifrån. Vid "tillbaka" går rörelsen åt andra hållet | 350 ms, `ease-out`, 40–60 px förflyttning plus genomskinlighet |
| **Frågan dyker upp** | Rubrik, beskrivning och svarsfält kommer in lite efter varandra | 60 ms fördröjning mellan delarna |
| **Välja ett alternativ** | Rutan blinkar kort som bekräftelse, en bock visas, och vid enkelval går formuläret vidare av sig självt | En mjuk puls i ljuslila (250 ms) i stället för blink, så att vi håller oss under tre blinkningar per sekund. Bocken ritas in, och formuläret går vidare efter cirka 400 ms |
| **Skriva text** | Fältet är en stor linje, och knappen "OK ✓" med tipset "tryck Enter ↵" dyker upp så fort man börjar skriva | Knappen tonas in på 150 ms |
| **Betyg (stjärnor)** | Stjärnorna fylls upp till den man pekar på, och den valda studsar lite | Skala 1 → 1,15 → 1 på 200 ms |
| **Fel och obligatoriskt** | Ett meddelande glider in under fältet ("Fyll i det här") | 200 ms, ingen skakning (stör vid vestibulära besvär) |
| **Förloppsindikator** | Stapeln växer mjukt efter varje svar | 300 ms |
| **Skicka** | Knappen visar laddning och sedan slutskärmen | Slutskärmen tonas in med en bock |
| **Minskad rörelse** | Typeform känner av `prefers-reduced-motion` och slutar låta frågorna glida. "Minska betyder inte ta bort" | Bara toning (150 ms), ingen glidning eller studs |

Källor till beteendet: Typeforms hjälpcenter om frågetyper och byggaren, deras teknikblogg om minskad rörelse, och Smashing Magazines artikel om hur Typeform togs fram. De exakta tiderna i högerkolumnen är våra förslag. Typeform publicerar inga värden.

---

## 3. Firstflow: beslut och förslag

**Grundprincip:** det ska vara enkelt att ställa frågor och enkelt att svara. Vi tar ett urval av det Typeform erbjuder, inte allt.

### Beslut (Texas, 2026-10-20)

| Fråga | Beslut |
|---|---|
| En fråga i taget eller alla på en gång? | **En i taget**, som steg |
| Olika frågor olika redovisningsdagar? | **Nej**, samma frågor alla redovisningsdagar |
| Logik i första versionen? | **Ja**, t.ex. "Om Nej, hoppa över nästa fråga" |
| Gemensamma frågemallar för skolan? | **Ja.** Skoladmin skapar dem och alla lärare på skolan ser dem |
| Får lärare spara egna mallar? | **Ja.** Läraren kan spara klassens frågor som en egen mall och använda den igen, t.ex. nästa år |
| Vad händer med klassens frågor när en mall väljs? | **Mallen tar över.** Läraren erbjuds först att spara de nuvarande frågorna som en egen mall |
| Svarar handledaren på frågor? | **Nej**, bara eleven |
| Får eleven ändra en inskickad redovisning? | **Nej.** Eleven, läraren och handledaren kan i stället skriva kommentarer på inlägget |
| Frågor till enskilda elever? | Möjligheten ska finnas (se förslag nedan) |
| Koppla redovisningen till ett projekt? | **Ja**, eleven väljer vilket projekt redovisningen gäller |
| Svaren som data för andra system (t.ex. Haldor) | **Ja**, svaren sparas som värden som går att hämta ut |

### Läraren bygger frågorna i klassvyn, fliken Frågor
- Samma tre delar som Typeform: **frågelista** till vänster, **förhandsvisning** i mitten som den ser ut i elevens mobil, och **inställningar** till höger. På mobil blir det en lista, och man trycker på en fråga för att redigera den.
- **Lägg till fråga** öppnar en meny med Firstflows frågetyper, **färgkodade per grupp** som i Typeform. Samma färg och ikon visas i frågelistan. Dra för att ändra ordning, och spara automatiskt.
- Frågorna gäller **klassens veckoredovisningar**, på de vardagar som är valda i APL-villkoren.
- **Logik** ställs in på frågan i högerpanelen: "Om svaret är … gå till fråga …".

### Tre sätt att börja
1. **Egna frågor** från början.
2. **En mall**: skolans mallar, som skoladmin har skapat, eller lärarens egna mallar. Läraren kopierar mallen till klassen och kan ändra i kopian.
   - Mallen **ersätter** klassens frågor i utkastet. Har klassen redan frågor erbjuds läraren att spara dem som en egen mall först, så att de går att använda igen.
   - Läraren kan när som helst spara klassens frågor som en egen mall ("Spara som mall").
   - En ändrad mall påverkar inte klasser som redan har använt den, eftersom klassen har en egen kopia.
   - Lärarens egna mallar syns bara för läraren. Skolans mallar syns för alla lärare på skolan.
3. **Förslag utifrån läroplanen.** Läraren väljer program och kurs. Firstflow hämtar kursen från Skolverkets öppna API (`api.skolverket.se/syllabus`), och Claude tar fram ett förslag på frågor. Läraren går alltid igenom, ändrar och godkänner. Inget publiceras automatiskt.
   - Varje fråga kan märkas med kurskod, så att vi senare kan visa vilka delar av kursen eleven har redovisat.
   - Firstflow använder ett eget API-konto hos Anthropic (`ANTHROPIC_API_KEY` på servern), inte någons personliga abonnemang. Kostnaden är per förslag. Förslaget sparas per kurs och återanvänds, så det tas bara fram en gång.
   - **Ingen elevdata skickas**, bara offentlig kursinformation.
   - Kontrollera innan bygget: om Skolverkets API kräver nyckel, och om det innehåller centralt innehåll eller bara kunskapskrav.

### Ändra frågor under terminen
- Frågorna har **versioner**. En ändrad fråga gäller från nästa redovisning.
- Gamla svar behåller frågetexten som den var när eleven svarade.
- Byter man frågetyp på en fråga som redan har svar blir det en ny fråga.

### Frågor till enskilda elever
- Klassens formulär är grunden. Läraren kan lägga till **extra frågor för en enskild elev**, som visas efter klassens frågor.
- Frågor kopplade till ett **projekt** (nedan) täcker de flesta fall där en elev behöver egna frågor. Det blir mindre att administrera än helt separata formulär.

### Projekt
- Första steget i redovisningen: **"Vilket projekt gäller det?"** med elevens projekt och *Inget projekt*.
- Ett projekt skapas av lärare och handledare. Det kan ha egna frågor som visas när eleven väljer projektet.
- Lärare och handledare kan se redovisningarna per projekt.
- **Beroende:** projekten byggs i B12. B5 kan byggas först, och projektvalet kopplas på när B12 finns. Stäms av med Hannes.

### Frågetyper i en första version

Typerna kommer från lärarskissen och från Norrköpings visningsmanus (loggbok, dokumentera arbete, omdömen):

| Firstflow | Typeform-motsvarighet | Kommentar |
|---|---|---|
| Kort text | Short Text | En rad |
| Fritext | Long Text | "Vad har du gjort den här veckan?" |
| Flerval | Multiple Choice | Ett eller flera val, med eller utan "Annat" |
| Bildval | Picture Choice | Alternativ med bild |
| Ja/Nej | Yes/No | "Har du jobbat med HTML?" |
| Betyg | Rating | 1–5, "Hur svårt var det?" |
| Bilder | File Upload | Kameran direkt i mobilen. Kräver fillagring (D5) |
| Meddelande | Statement | Text utan svar, t.ex. en påminnelse om säkerhet |
| Projektval | (finns inte) | Eget steg, se Projekt |

Senare: datum, skala 1–10 och frågegrupper.
Tar vi inte med: kontaktuppgifter, betalning, signatur, NPS, matris, rangordning, video och ljud, AI-följdfrågor, bokning och omdirigering.

### Eleven svarar i mobilen
- En fråga i taget i helskärm, som steg, med stora knappar och animationerna i tabellen ovan.
- Svar sparas efter varje fråga, så att inget försvinner om eleven tappar täckning på arbetsplatsen.
- Förloppsindikator, möjlighet att gå tillbaka före inskick och en slutskärm ("Tack, Ingrid har fått din redovisning").
- Den inskickade redovisningen blir ett **inlägg** i elevens flöde. Den går inte att ändra, men eleven, läraren och handledaren kan skriva kommentarer på den.
- När närvaron (B4, Hannes) finns kan inlägget visa veckans närvaro överst. Registreringen sker inte i formuläret.

### Läraren och handledaren läser svaren
- Som i lärarskissen: veckoredovisningen med alla svar, bilder och elevkortet bredvid. Olästa redovisningar visas på översikten.
- Handledaren ser redovisningarna för sina elever och kan kommentera, men svarar inte på frågor.

### Svaren som data
- Varje svar sparas som ett **typat värde**: text, tal, valt alternativ, ja/nej eller fil.
- Frågor och alternativ har **fasta id:n**, så att svaren går att tolka även efter att en fråga har ändrats.
- Senare kommer ett versionerat export-API för t.ex. Haldor. Fråga Haldor vilket format de vill ha och om de använder SS 12000. Exporten styrs av avtal med skolan, eftersom det är elevdata.

### Datamodellen
Byggd i B5a (backend). Kursivt kommer senare.
```
Klass ──▶ Utkast (frågorna som JSON, bara läraren ser det)
      └─▶ Publicerad version 1, 2, 3 … (frågorna som JSON, ändras aldrig)
                 ▲
Redovisning (elev, klass, dag, status) ──▶ Svar (frågans id, typat värde)
      ├─▶ Kommentar (författare, text)
      └─▶ Läst av (lärare)
Mall (skola), extra fråga (elev), projekt  ← senare
```
- Varje fråga och varje alternativ har ett fast id som följer med mellan versionerna. Svaren pekar på frågans id, och redovisningen på versionen eleven svarade på. Då går ett svar alltid att tolka mot frågan som eleven såg.
- En redovisning startas på den senast publicerade versionen och behåller den, även om läraren publicerar en ny medan eleven svarar.
- Svar sparas i egna kolumner per typ: text, valda alternativ, Annat-text, ja/nej och betyg.

### Tillgänglighet (WCAG 2.1 AA, Ska-krav i upphandlingen)
- Allt fungerar med tangentbord och skärmläsare. Fokus flyttas till nästa fråga och läses upp.
- Minskad rörelse respekteras.
- Ingen automatisk tidsgräns och inga blinkningar över tre gånger per sekund.

---

## Kvar att reda ut

- Skolverkets API: nyckel, villkor och om centralt innehåll finns med.
- Projekt (B12): vem bygger det och när. Stäms av med Hannes.
- Haldor: vilket format de vill ha för svaren.
- Närvaro: väntar på B4 (Hannes). Inget i B5 beror på den.
