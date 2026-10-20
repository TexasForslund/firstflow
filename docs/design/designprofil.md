# Designprofil

Firstflow följer konceptet i skisserna i den här mappen. Ändringar i konceptet beslutas av Texas. Förslag är välkomna, men bygg efter profilen tills något annat är bestämt.

| Skiss | Vy |
|---|---|
| [larare-oversikt.png](larare-oversikt.png) | Lärarens översikt ("Det här behöver du titta på i dag") |
| [larare-veckoredovisning.png](larare-veckoredovisning.png) | En elevs veckoredovisning med elevkort till höger |
| [larare-elevhistorik.png](larare-elevhistorik.png) | Elevhistorik med filter per klass och elev |
| [logo.svg](logo.svg) | Logotypen, originalfil. Används via `Logo` i `frontend/src/components/Logo.tsx` |

Handledarens vy byggs på samma sätt som lärarens. Elevens vy skiljer sig: den är byggd för mobilen först och ska kännas som en app i stil med sociala medier, enkel att använda. Skisser för den kommer senare.

## Regler

- **Inga skuggor.** Ingen `box-shadow` någonstans, om inte Texas säger annat. Uppdelningen görs med ramar och bakgrundsfärger.
- **Ramar är alltid 1 px** i `--color-border`. Samma ton överallt.
- **Lila är accentfärgen.** Använd den för aktivt menyval, länkar, taggar, siffermärken och primära knappar. Inte som stor yta.
- **Grönt och rött betyder närvaro.** Grönt för incheckad, rött för frånvaro. Använd dem inte för något annat.
- **Text i gränssnittet på svenska**, utan särskrivningar ("Elevhistorik", inte "Elev historik").
- **Kontrast enligt WCAG 2.1 AA:** minst 4,5:1 för brödtext och 3:1 för stor text och ikoner. Det är ett krav i upphandlingar.
- **Ikoner** från Lucide (`lucide-react`), tunna linjer, 20 px i menyn och 16–18 px i knappar och taggar.
- **Typsnitt** Inter, självhostat via `@fontsource-variable/inter`. Hämta inga typsnitt från Google Fonts, eftersom det skickar besökarens IP-adress till Google.

## Färger

Värdena är uppmätta i skisserna. De finns som CSS-variabler i `frontend/src/index.css`.

| Variabel | Värde | Används till |
|---|---|---|
| `--color-primary` | `#7353ff` | Aktivt menyval, länkar, taggtext, logotyp |
| `--color-primary-hover` | `#5f3ef0` | Hover på primära element |
| `--color-primary-light` | `#eeeaff` | Bakgrund för aktivt menyval, taggar, siffermärken |
| `--color-primary-on-light` | `#6747f5` | Lila text på ljuslila bakgrund (aktivt menyval, taggar, märken) |
| `--color-text` | `#070414` | Rubriker och brödtext |
| `--color-text-secondary` | `#575560` | Datum, metadata, beskrivningar |
| `--color-text-muted` | `#6e6c76` | Etiketter som "se mindre" |
| `--color-bg` | `#ffffff` | Innehållsytan |
| `--color-sidebar` | `#f9f9fb` | Sidomenyn |
| `--color-surface` | `#f6f6f7` | Inre ytor, t.ex. klasslistan i närvarokortet, valknappar |
| `--color-border` | `#d9d9de` | Alla ramar och avdelare |
| `--color-success` | `#13822b` | Text: incheckade |
| `--color-success-bar` | `#1cc440` | Stapel: incheckade |
| `--color-error` | `#cf1b0b` | Text: frånvarande |
| `--color-error-bar` | `#cf2d18` | Stapel: frånvarande |
| `--color-attention-bg` | `#fff1ea` | Rutan "Behöver uppmärksamhet" |
| `--color-attention` | `#b8401f` | Rubrik i rutan "Behöver uppmärksamhet" |
| `--color-choice-selected` | `#ffe1e1` | Valt svar i Ja/Nej/Vet inte |
| `--color-star` | `#f5b21b` | Stjärnbetyg |

Tre färger är något mörkare än i skissen för att klara WCAG AA. Lila text på ljuslila bakgrund var 4,05:1 och är nu 4,7:1 (`#7353ff` → `#6747f5`). Den gröna siffran var 4,41:1 och är nu 4,93:1 (`#158b2e` → `#13822b`). Rubriken i rutan "Behöver uppmärksamhet" var 4,47:1 och är nu 5,02:1 (`#c24829` → `#b8401f`). Den bleka texten i förhandsvisningen av veckoredovisningar är en toning som visar att det finns mer text, inte innehåll som ska läsas, och undantas därför.

Avatarer med initialer får en av fem pastellfärger, vald utifrån namnet så att samma person alltid får samma färg: `#ffefc4` (gul), `#c4d5ff` (blå), `#e4c4ff` (lila), `#c4ffc6` (grön), `#ffcbc4` (rosa).

### Frågetyper

Frågebyggaren färgkodar frågetyperna per grupp, som i Typeform (Texas, 2026-10-20). Färgerna är avatarernas pastellfärger, med mörk ikon och siffra:

| Grupp | Frågetyper | Färg |
|---|---|---|
| Text | Fritext, kort text | `--avatar-blue` |
| Val | Flerval, ja/nej | `--avatar-purple` |
| Betyg | Betyg 1–5 | `--avatar-green` |
| Övrigt | Meddelande | `--color-surface` med ram |

## Former och storlekar

- **Radier:** kort 12 px, menyval och valknappar 8 px, taggar 8 px, knappar med kant och "Öppna"-knappar helt runda.
- **Sidomeny:** 380 px bred på stor skärm, fast till vänster, ljusgrå bakgrund och en ram till höger. Under 1024 px fälls den ut med en menyknapp.
- **Innehåll:** cirka 80 px luft till vänster om innehållet på stor skärm. Huvudkolumnen är upp till 780 px bred och sidokolumnen cirka 510 px.
- **Rubriker:** sidrubrik 40 px fet (700). Kortrubriker 18–20 px med vikt 500–600.
- **Bokstavsavstånd** (variabler `--tracking-*` i `index.css`):

  | Text | Värde |
  |---|---|
  | Brödtext, menyval, knappar, taggar, fält | −0,3 px |
  | Namn, frågor, kortrubriker (18–20 px) | −0,5 px |
  | Sektionsrubriker (20–28 px) | −0,6 px |
  | Sidrubriker (40 px) | −1,2 px |
  | Stora siffror (48 px) | −1,6 px |
  | Små siffror i märken och listor (13 px) | 0 |

  Skriv aldrig ett eget värde för `letter-spacing`. Använd variablerna.
- **Klickytor** minst 44 px höga på mobil.

## Komponenter

| Komponent | Beskrivning |
|---|---|
| `Sidebar` | Logotyp, användare ("Välkommen tillbaka"), meny med siffermärken, "Dina klasser", "Konto" |
| `Avatar` | Initialer i pastellcirkel, eller foto |
| `CountBadge` | Siffra i liten ljuslila cirkel |
| `Tag` | Ljuslila etikett med mappikon, t.ex. projekt |
| `PillButton` | Knapp med kant och helt runda hörn, t.ex. "Se alla ↗" |
| `SoftButton` | Ljuslila knapp med lila text, t.ex. "Öppna ↗" |
| `SegmentedBar` | Närvarostapel i tre delar: grön, röd och grå |
| `AttentionCard` | Persikofärgad ruta med en vit lista över saker att följa upp |
| `ChoiceChips` | Svarsknappar, t.ex. Ja/Nej/Vet inte |
| `StarRating` | Fem stjärnor |
| `Collapsible` | Fråga med "— se mindre" till höger |
