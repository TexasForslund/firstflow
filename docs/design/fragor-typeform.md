# Frågor och veckoredovisning: förebild Typeform

**Status:** Underlag inför genomgången av B5 (Texas och Claude). Inget är beslutat eller byggt.
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

## 3. Hur det kan se ut i Firstflow (förslag att diskutera)

### Läraren bygger frågorna i klassvyn, fliken Frågor
- Samma tre delar som Typeform: **frågelista** till vänster, **förhandsvisning** i mitten som den ser ut i elevens mobil, och **inställningar** till höger. På mobil blir det en lista, och man trycker på en fråga för att redigera den.
- **Lägg till fråga** öppnar en meny med Firstflows frågetyper (se nedan). Dra för att ändra ordning, och spara automatiskt.
- Frågorna gäller **klassens veckoredovisningar**, på de veckodagar som är valda i APL-villkoren.
- **Mallar:** ett startpaket ("Vad har du gjort den här veckan?", bilder, svårighetsgrad) så att läraren inte börjar från noll.

### Frågetyper i en första version

Typerna kommer från lärarskissen och från Norrköpings visningsmanus (loggbok, dokumentera arbete, omdömen):

| Firstflow | Typeform-motsvarighet | Kommentar |
|---|---|---|
| Fritext | Lång text | "Vad har du gjort den här veckan?" |
| Bilder | Filuppladdning | Kameran direkt i mobilen. Kräver fillagring (D5) |
| Flerval | Flerval | Ett eller flera val, med eller utan "Annat" |
| Ja/Nej | Ja/Nej | "Har du jobbat med HTML?" |
| Betyg | Betyg (stjärnor) | 1–5, "Hur svårt var det?" |
| Meddelande | Statement | Text utan svar, t.ex. en påminnelse om säkerhet |

Senare: skala 1–10, datum, frågegrupper och logik (hoppa till olika frågor beroende på svar).

### Eleven svarar i mobilen
- En fråga i taget i helskärm, stora knappar och animationerna i tabellen ovan.
- Svar sparas efter varje fråga, så att inget försvinner om eleven tappar täckning på arbetsplatsen.
- Förloppsindikator, möjlighet att gå tillbaka och en slutskärm ("Tack, Ingrid har fått din redovisning").

### Läraren läser svaren
- Som i lärarskissen: veckoredovisningen med alla svar, bilder och elevkortet bredvid. Olästa redovisningar visas på översikten.

### Tillgänglighet (WCAG 2.1 AA, Ska-krav i upphandlingen)
- Allt fungerar med tangentbord och skärmläsare. Fokus flyttas till nästa fråga och läses upp.
- Minskad rörelse respekteras.
- Ingen automatisk tidsgräns och inga blinkningar över tre gånger per sekund.

---

## Frågor till genomgången

1. Ska eleven se alla frågor på en gång någon gång (t.ex. för att granska innan skicka), eller alltid en i taget?
2. Ska samma frågor gälla alla redovisningsdagar, eller kan måndag och fredag ha olika frågor?
3. Behövs logik i första versionen, t.ex. "Om Nej, hoppa över nästa fråga"?
4. Ska skolan kunna ha gemensamma frågemallar som alla lärare utgår från?
5. Ska handledaren också svara på frågor (omdömen), eller bara eleven?
6. Får eleven ändra ett svar efter att redovisningen är inskickad?
