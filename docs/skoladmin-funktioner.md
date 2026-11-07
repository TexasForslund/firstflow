# Skoladministratörsfunktioner

**Status:** Planerad, inte prioriterad  
**Källa:** krav 1.8.1–1.8.6 i Norrköpings upphandling (se [upphandling-norrköping.md](upphandling-norrköping.md))

Rollen `school_admin` finns redan (B1b). Det som saknas är de ekonomiska underlagen: lärlingsersättning, matersättning och statsbidrag. Firstflow betalar inte ut något. Underlagen exporteras och utbetalningen sker i kommunens ekonomisystem.

> Den tidigare versionen av dokumentet beskrev Skolverkets "lärarkategorier". Det kravet finns inte i upphandlingen och är borttaget. 1.8.1 handlar om lärlingsersättning.

---

## 1.8.1 – Lärlingsersättning för statsbidrag (Ska)

Skolor med lärlingsutbildning kan söka statsbidrag från Skolverket och betalar ut lärlingsersättning till arbetsplatserna för handledningen. Skoladministratören ska kunna administrera registreringen i Firstflow.

Det som behövs per arbetsplats och period:
- Företagets juridiska namn och eventuellt annat namn, org.nr.
- Bankuppgifter för utbetalning: bank, BG eller PG, kontonummer med clearingnummer och märkning på insättningen.
- Handledarens namn och om handledaren har gått Skolverkets handledarutbildning (vilken version) eller annan godkänd utbildning (se B32).
- Utbildningskontraktets giltighetstid (B8).
- Lärarens kommentar inför utbetalningen, t.ex. om ersättningen delas.

Frågor att stämma av med en pilotskola innan något byggs:
- Vilka uppgifter Skolverket faktiskt kräver i ansökan och om de ändras mellan åren.
- Vem som ska få lägga in och se bankuppgifter. Uppgifterna rör företag, men handledarens namn och elevkopplingen är personuppgifter.

## 1.8.3 – Underlag för matersättning (Ska)

Elever på APL kan ha rätt till ersättning för måltider. Skoladministratören tar fram ett underlag som sedan betalas ut via ekonomisystemet.

Underlaget bör innehålla per elev och period: elev, klass, APL-plats, period och antal APL-dagar (finns via B3, B4 och B19). Exakt vilka fält kommunen behöver är inte angivet i upphandlingen.

## 1.8.2 – Intyg från handledarutbildningen (Ska)

Skoladministratören ser intygen som handledarna har laddat upp. Se B32.

## 1.8.4 – Egen arbetsyta (Bör)

Skoladministratören har en egen startsida.

## 1.8.5 och 1.8.6 – Excelrapporter

- **1.8.5 (Bör):** rapport inför utbetalning till praktikplatsen.
- **1.8.6 (Ska):** rapport inför ansökan om statsbidrag.

Båda har en rad per företag med samma tio kolumner: företagsnamn (juridiskt och annat), org.nr, bank, BG/PG, kontonummer med clearingnummer, märkning eller kostnadsställe, handledarens namn, handledarutbildning, lärarens kommentar och kontraktets giltighet. Inga personnummer.

Excel genereras med `openpyxl`, som redan används i importen (B20).

---

## Rollmodell för school_admin

`school_admin` ska kunna:
- se elever, klasser, lärare och företag på sin skola
- lägga in och ändra uppgifter för lärlingsersättning
- ta ut rapporterna ovan

`school_admin` ska inte kunna:
- redigera elevens redovisningar eller lärarens bedömningar
- läsa meddelanden mellan elev, lärare och handledare
- se andra skolor

## Ordning (förslag)

1. Org.nr och bankuppgifter på företaget, med behörighet för skoladmin.
2. Rapporten för 1.8.6, som också täcker 1.8.5.
3. Matersättning, när en pilotskola har visat vilket underlag de använder i dag.
