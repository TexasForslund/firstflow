# Upphandling – Norrköpings kommun (UN 2026/1145)

**Deadline:** 2026-10-22  
**Kontraktperiod:** 2026-11-30 – 2030-11-29  
**Uppskattad kontraktsvärde:** 1 500 000 SEK  
**Plattform:** e-Avrop  
**Partner:** Haldor (gemensamt anbud)

---

## Kravtyper

| Typ | Innebär |
|---|---|
| **Ska** | Måste uppfyllas. Nej = diskvalificering. |
| **Ska-Beskriv** | Måste uppfyllas + skriftlig beskrivning krävs. |
| **Bör** | Poängsätts 1–3 viktpoäng. Påverkar rangordning. |
| **Bör-Beskriv** | Poängsätts + skriftlig beskrivning. |

---

## Gap-analys: Ska-krav vi är osäkra på eller saknar

Dessa krav är Ska (måste-krav). Att svara Ja på något vi inte har riskerar diskvalificering eller kontraktsbrott.

### 🔴 Troligen saknas idag

| Krav | Beskrivning |
|---|---|
| 1.0.10, 1.3.15, 1.5.1, 1.6.1 | BankID/Freja OrgID-signering av utbildningskontrakt (elev, handledare, rektor, vårdnadshavare) |
| 4.1.3 | Educloud-integration (IST Administration via SS 12000:2020) |
| 4.1.4 | Alvis-integration (SS 12000:2020) |
| 4.1.7 | SS 12000:2020-standard specifikt (inte äldre version) |
| 4.1.6 | Automatisk attributsynkronisering från IdP |
| 1.8.1 | Registrera Skolverkets lärarkategorikoder |
| 1.8.3 | Skapa underlag för materialsersättning |
| 1.8.6 | Generera statsbidragsrapport i Excel (Skolverkets format) |
| 4.2.1 | Mellanarkiv i 2 år efter avtalets slut (PDF/A + strukturerad export) |
| 1.0.14 | Stöd för Gy11 och Gy25 parallellt i samma system |

### 🟡 Osäkert – behöver bekräftas

| Krav | Beskrivning |
|---|---|
| 3.8.5, 3.8.7 | SSO via SAML/OIDC mot Entra ID/Azure AD |
| 3.1.7 | WCAG 2.1 AA + publicerat tillgänglighetsutlåtande |
| 1.0.13 | Stöd för flera skolor i samma instans (multi-tenant) |
| 3.14.x | Data ägs av beställaren, ingen AI-träning på elevdata |

---

## Bör-krav med högst poäng (prioritera dessa)

| Poäng | Krav | Beskrivning |
|---|---|---|
| 3p | 3.10.6 | REST API (DIGG-kompatibelt) |
| 3p | 3.10.7 | JSON som standardformat |
| 3p | 3.10.9 | OAuth 2.0 på API:t |
| 3p | 3.10.12 | Paginering i API-svar |
| 3p | 3.8.6 | MFA-stöd |
| 2p | 3.10.10 | API-versionering |
| 2p | 3.10.11 | Swagger/OpenAPI-dokumentation |
| 2p | 3.8.8 | Lösenordspolicy |

**Total möjlig poäng IT-krav:** ~43p

---

## Nyckelkrav att besvara i anbudet

### 1. BankID/Freja OrgID (Ska)

Krävs för signering av utbildningskontrakt av alla parter. Alternativ:
- Integrera mot [Scrive](https://www.scrive.com/) eller [Verified](https://www.verified.eu/) som hanterar BankID
- Bygg eget BankID-flöde via Nets eID Gateway

Tidplan: måste vara på plats vid driftsättning (2026-11-30) eller med tydlig leveransplan i anbudet.

### 2. SS 12000:2020 / Educloud (Ska)

- Registrera Firstflow som konsument i Educloud (kräver avtal med IST)
- Implementera OAuth 2.0-flöde mot Educloud API
- Hantera synkronisering av elever, klasser, personal
- Alvis har liknande SS 12000-stöd men är enklare — prioritera IST/Educloud

Se: [docs/ss12000-integration.md](ss12000-integration.md) (att skapa)

### 3. Mellanarkiv (Ska)

Vid avtalets slut (2030-11-29) ska data finnas tillgänglig i 2 år.

Krav på implementation:
- Exportfunktion: all data i öppet format (JSON/XML med dokumenterat schema)
- Signerade kontrakt som PDF/A-2b
- Tillgängligt utan aktiv licens under mellanarkivperioden
- Referens: SS-ISO 14721 (OAIS)

### 4. Gy11 + Gy25 parallellt (Ska)

Systemet måste veta vilken läroplan en elev tillhör och visa rätt:
- Kursmål och momentlistor
- Bedömningsstrukturer
- Kopplingar till utbildningsmoment

Elever som börjat före 2025 → Gy11. Elever från 2025 → Gy25.

### 5. Skoladministratörsfunktioner (Ska)

- **Lärarkategorikoder:** Skolverkets kategorier (uppdateras, måste vara konfigurerbara)
- **Materialsersättning:** Rapport per elev/arbetsplats/period
- **Statsbidragsrapport:** Excel-export i Skolverkets format för lärlingsutbildning

---

## Kontakter

| Person | Roll | Kontakt |
|---|---|---|
| Haldor | Anbudspartner | — |
| Norrköpings kommun | Beställare | Via e-Avrop |

---

## Bilagor att läsa

- [x] Bilaga 09: Anbudsformulär med kravspecifikation (`/tmp/upphandling/bilagor/`)
- [ ] Bilaga 02: Ska-krav leverantör (formella kvalifikationskrav)
- [ ] Bilaga 10: Anbudsprisformulär
- [ ] Bilaga 19: Anbudspresentation med systemvisning (demokrav)
