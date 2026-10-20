# SS 12000:2020 – Integration mot IST/Educloud och Alvis

**Status:** Planerad (krävs för Norrköpingsupphandlingen)  
**Krav:** 4.1.3 (Educloud, Ska), 4.1.4 (Alvis, Ska), 4.1.7 (SS 12000:2020, Ska)

---

## Vad är SS 12000:2020?

SS 12000:2020 är en svensk standard (SIS) för datautbyte mellan skolsystem. Den definierar ett gemensamt API-format för:

- Elever (namn, personnummer-hash, klass, program, kurser)
- Personal (lärare, roller, kopplingar till klasser)
- Klasser och grupper
- Organisationsenheter (skolor, program)

Standarden är byggd på REST + JSON och använder OAuth 2.0 för autentisering.

---

## IST Administration / Educloud

IST är den vanligaste skoladministrationsplattformen i Sverige. Educloud är ISTs API-plattform som exponerar SS 12000-kompatibla endpoints.

### Komma igång med Educloud

1. **Partneravtal med IST** – Firstflow behöver registreras som konsument. Kontakta IST på [ist.com](https://www.ist.com/sv/) för partneransökan.
2. **Sandbox-miljö** – IST erbjuder en testmiljö för utveckling. Begär tillgång i samband med partneransökan.
3. **OAuth 2.0 Client Credentials** – Firstflow autentiserar sig som ett system (inte som en användare) mot Educclouds token-endpoint.

### Dataflöde

```
IST Administration → Educloud API → Firstflow backend
```

Firstflow hämtar (polling eller webhook):
- Lista på elever per skola/program
- Klass- och grupptillhörighet
- Lärare och deras kopplingar
- Kursregistreringar (relevant för Gy11/Gy25-hantering)

### Endpoints att implementera (konsument)

```
GET /organisations                    # Hämta skolor
GET /organisations/{id}/groups        # Klasser/grupper
GET /persons?role=student             # Elever
GET /persons?role=staff               # Personal
GET /duties                           # Tjänster (lärare ↔ klass-kopplingar)
```

---

## Alvis

Alvis är ett mindre skoladministrationssystem med SS 12000-stöd. Används av färre kommuner men är ett Ska-krav i Norrköpingsupphandlingen.

Implementationen är i princip identisk med Educloud-integrationen — samma SS 12000-protokoll, annan bas-URL och autentiseringsuppgifter.

Prioriteringsordning: **IST/Educloud först**, Alvis som steg 2.

---

## Teknisk implementation

### Databasmodeller att lägga till

```python
# app/models/integration.py

class ExternalSystem(Base):
    """Registrerad extern skolplattform (IST, Alvis)"""
    id: UUID
    school_id: UUID         # kopplad skola i Firstflow
    system_type: str        # "ist_educloud" | "alvis"
    base_url: str
    client_id: str
    client_secret: str      # krypterat
    last_synced_at: datetime | None

class SyncLog(Base):
    """Logg per synkroniseringskörning"""
    id: UUID
    external_system_id: UUID
    started_at: datetime
    finished_at: datetime | None
    status: str             # "running" | "success" | "error"
    records_synced: int
    error_message: str | None
```

### Synkroniseringslogik

```
1. Hämta OAuth 2.0-token från systemets token-endpoint
2. Hämta elever, personal och klasser
3. Matcha mot befintliga Firstflow-användare (på e-post eller extern-id)
4. Skapa nya användarkonton för okända elever/lärare
5. Uppdatera klass- och kurskopplingar
6. Logga resultatet i SyncLog
```

Synkronisering körs:
- Manuellt av skoladministratör
- Automatiskt en gång per natt (cron)
- Via webhook om IST/Alvis stödjer push-notifieringar

### Attributsynkronisering (krav 4.1.6)

Följande attribut hålls synkroniserade:
- Namn
- E-post
- Roll (elev/lärare)
- Klass/grupptillhörighet
- Program (Gy11 eller Gy25)
- Aktiv/inaktiv status

---

## Gy11 / Gy25 via SS 12000

SS 12000 innehåller information om vilket program och vilka kurser en elev är registrerad på. Gy25-kurser har nya kurskoder jämfört med Gy11.

Firstflow kan använda detta för att automatiskt avgöra vilken läroplan en elev tillhör och visa rätt bedömningsstruktur (krav 1.0.14).

---

## Tidplan (estimat)

| Steg | Estimat |
|---|---|
| Partneravtal IST + sandbox-tillgång | 2–4 veckor |
| Implementera OAuth 2.0-flöde | 3 dagar |
| Implementera databasmodeller + migrering | 2 dagar |
| Implementera synkroniseringslogik (IST) | 1–2 veckor |
| Tester + felhantering | 3 dagar |
| Alvis-integration | 1 vecka |
| **Totalt** | **ca 6–8 veckor** |

---

## Resurser

- [SS 12000:2020 på SIS](https://www.sis.se/produkter/informationsteknik-kontorsutrustning/ittillampningar/ss-120002020/)
- [Educloud API-dokumentation](https://api.educloud.nu/) (kräver IST-partneravtal för full tillgång)
- [SKR:s vägledning för SS 12000](https://skr.se/skr/tjanster/programverksamhet/digitalisering/arkitekturochreferensarkitektur/ss12000.html)
