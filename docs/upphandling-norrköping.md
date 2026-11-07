# Upphandling – Norrköpings kommun (UN 2026/1145)

**Beslut (Hannes, 2026-11-04):** Firstflow lämnar inget anbud. Kravbilden används i stället som underlag för vad en kommun kräver av ett APL-system.

**Varför:** skakraven i bilaga 02 kräver minst tre års leverans av ett APL-system och två referenser från kommunal gymnasie- eller vuxenutbildning. Det har Firstflow inte. Dessutom måste alla ska-krav i bilaga 09 besvaras Ja, och bilaga 14 (KLASSA) kräver ett dokumenterat ledningssystem för informationssäkerhet.

## Fakta om upphandlingen

- **Systemstöd för administration av APL och lärlingsutbildning** inom gymnasieskola och vuxenutbildning.
- Sista anbudsdag 2026-10-22 via e-Avrop. Demo v. 45–46.
- Avtal i 4 år, preliminärt 2026-12-01 – 2030-11-30. Tjänsten ska vara levererad senast 2027-03-31.
- 11 skolenheter med yrkesprogram (ca 1 200 elever) och 1 lärlingsskola (ca 125 elever). Option: vuxenutbildning (ca 100 elever).
- Utvärdering: kvalitet 60 %, pris 40 %. Användbarheten vid demon väger 70 % av kvaliteten, och under 60 % av maxpoängen diskvalificerar. Uppfyllda bör-krav väger 30 %.
- Integrationer som krävs: IST Administration via Educloud och Alvis, båda med SS 12000:2020 eller senare. Skola24 för närvaro är ett bör-krav.

Hela checklistan per bilaga, alla 213 krav i bilaga 09 och de 68 KLASSA-kraven ligger i projektmappen (`anbud-norrkoping-apl/`), inte i repot.

## Rättelser till den tidigare versionen av det här dokumentet

Några krav var feltolkade. Rätt lydelse enligt bilaga 09:

| Krav | Rätt innebörd |
| --- | --- |
| 1.0.13 | Arbetsuppgifter, observationer och bedömningar kan kopplas till ämnesnivåer. Handlar inte om flera skolor i samma instans. |
| 1.8.1 | Skoladministratören administrerar registrering av Skolverkets **lärlingsersättning** för statsbidrag. Det finns inget krav på lärarkategorier. |
| 1.8.3 | Underlag för utbetalning av **matersättning** (utbetalning sker i ekonomisystemet). Inte materialersättning. |
| 1.8.6 | Excelrapport inför ansökan om statsbidrag, **en rad per företag**: företagsnamn, org.nr, bank, BG/PG, kontonummer med clearing, kostnadsställe, handledarens namn, om handledaren gått Skolverkets handledarutbildning, lärarens kommentar och kontraktets giltighet. Inga personnummer. |
| 4.1.6 | Attribut som ska kunna synkas från IST via Educloud/SS 12000. För elever ingår personnummer, telefon och vårdnadshavares kontaktuppgifter. Handlar inte om IdP. |
| 4.2.1 | "Tjänsten ska kunna fungera som ett mellanarkiv under två års tid." Kravet säger inte uttryckligen att det gäller efter avtalets slut, men 3.14.1 kräver kostnadsfri åtkomst till historiska data även efter avtalet. |
| Bör-poäng | Viktade bör-krav finns bara i IT-kraven: 3 p för OAuth 2.0 (3.10.10), paginering och filtrering (3.10.16), skriv-API (3.10.5), DIGG:s REST-profil (3.10.6) och JSON (3.10.7). 2 p för bl.a. versionshanterat API (3.10.14) och OpenAPI-dokumentation online (3.10.15). UTF-8 (3.10.12), autentiserat API (3.10.9) och utloggning vid inaktivitet (3.8.8) är ska-krav. |

## Vad kommunen kräver som vi inte har i planen

Det här är det värdefulla med upphandlingen: en kommuns egen lista över vad ett APL-system ska klara. Uppgifterna B26–B32 i [att-gora/backend.md](../att-gora/backend.md) kommer härifrån. De är förslag och inte prioriterade.

- **Inloggning via skolans IdP** (3.8.1, 3.8.5, 3.8.7): Entra ID, Google och BankID/Freja via OIDC eller SAML, utan månadskostnad för SSO. Utloggning efter inaktivitet (3.8.8). → B26
- **BankID-signering av utbildningskontrakt** för elev, handledare, rektor och vårdnadshavare, med mallar som bara rektor får ändra (1.0.10, 1.4.14–1.4.16, 1.5.1, 1.6.1–1.6.2). Bygger vidare på B8. → B27
- **Trepartssamtal och besöksjournal** (1.2.5, 1.3.9, 1.4.11–1.4.13): eleven, handledaren och läraren förbereder samtalet i ett strukturerat formulär, och överenskomna uppgifter och mötestider tilldelas eleven. → B28
- **Omdömen från handledaren**, löpande och avslutande, med struktur, fritext och PDF (1.3.11–1.3.14, 1.2.11). → B29
- **Ämnen, nivåer och progression** för Gy11 och Gy25 samtidigt, momentlistor och en portfölj som följer eleven genom alla APL-perioder (1.0.13–1.0.18, 1.2.4, 1.4.1–1.4.2). Steg två av B22. → B30
- **Rapporter och export**: närvaro per skolenhet och period, om eleverna fullföljer sin APL, alla aktuella kontrakt vid inspektion, egna rapporter och export till Excel och PDF (1.9.1–1.9.7, 3.9.1). → B31
- **Handledarutbildning**: handledaren laddar upp intyget på företaget, och lärare och skoladmin ser det (1.3.1–1.3.2, 1.4.4, 1.8.2). Uppgiften behövs också i statsbidragsrapporten. → B32
- **Skoladministratörens ekonomiunderlag**: lärlingsersättning, matersättning och statsbidragsrapport. → B7 (rättad)
- **SS 12000-synk** mot IST/Educloud och Alvis (4.1.3, 4.1.4, 4.1.7). → B9

## Krav som krockar med våra regler

Båda behöver ett beslut innan de byggs:

1. **Personnummer.** 4.1.6 vill synka elevers personnummer från elevregistret, och kommunens PUB-instruktion listar personnummer bland uppgifterna. Vår regel är att inte samla in personnummer, och B20 läser medvetet inte `civicNo`. Statsbidragsrapporten (1.8.6) kräver inte personnummer.
2. **404 när data saknas.** 3.10.21 säger att ett API inte ska svara 404 när det inte hittar data, bara när adressen är fel. Vi svarar 404 när en resurs tillhör någon annan, så att det inte går att gissa vilka id:n som finns.

## KLASSA och leverantörskrav

Gäller oss som leverantör, inte produkten. De behövs i nästa upphandling oavsett kommun:

- Ett dokumenterat ledningssystem för informationssäkerhet baserat på ISO 27001 (behöver inte vara certifierat), med incidenthantering, behörighetsgranskning, bakgrundskontroll, årlig säkerhetsutbildning och oberoende granskning vart tredje år.
- Ett kvalitetsledningssystem i ett dokument som täcker kvalitetspolicy, kvalitetsmål, avvikelsehantering och hur personalen känner till det (bilaga 02, punkt 7).
- Drift som klarar 99 % tillgänglighet, backup med RPO 1 timme på annan plats, separat testmiljö och datahall enligt MSB629 nivå 2. Se [drift.md](../att-gora/drift.md).
- Support med 2 timmars reaktionstid vid kritiskt fel under kontorstid, och e-faktura via Peppol.
