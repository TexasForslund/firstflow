# Skoladministratörsfunktioner

**Status:** Planerad (krävs för Norrköpingsupphandlingen)  
**Krav:** 1.8.1, 1.8.3, 1.8.6 (alla Ska)

---

## Översikt

Skoladministratören är en separat roll i Firstflow med administrativa funktioner som inte är relevanta för lärare, elever eller handledare. Dessa funktioner krävs primärt för kommunal rapportering och bidragshantering.

Ny roll att lägga till: `school_admin`

---

## 1.8.1 – Skolverkets lärarkategorier

### Vad det är

Skolverket definierar kategorier för hur lärare klassificeras i APL-sammanhang. Kategorierna används för statistikrapportering och påverkar statsbidragsberäkningar.

### Nuvarande kategorier (kan uppdateras av Skolverket)

| Kod | Beskrivning |
|---|---|
| 1 | Lärare med lärarlegitimation och behörighet i ämnet |
| 2 | Lärare med lärarlegitimation men utan behörighet i ämnet |
| 3 | Lärare utan lärarlegitimation |
| 4 | Yrkeslärare med relevant yrkeserfarenhet (APL-specifik) |
| 5 | Annan personal |

> ⚠️ Dessa koder måste vara konfigurerbara i systemet — Skolverket uppdaterar dem vid regeländringar. Hårdkoda dem inte.

### Implementation

- Administrerbar lista i databasen (inte hårdkodad enum)
- Skoladministratör kan se och uppdatera lärares kategoritillhörighet
- Kategorin exporteras i statsbidragsrapporten

```python
# app/models/teacher_category.py
class TeacherCategory(Base):
    id: int
    code: str           # t.ex. "1", "2", "3"
    description: str    # Skolverkets text
    is_active: bool

class TeacherCategoryAssignment(Base):
    user_id: UUID       # läraren
    category_id: int
    school_id: UUID
    valid_from: date
    valid_until: date | None
```

---

## 1.8.3 – Underlag för materialsersättning

### Vad det är

När en elev är på APL kan skolan ha rätt till ersättning för material som används på arbetsplatsen. Skoladministratören behöver ett sammanställt underlag att skicka till kommunen.

### Vad underlaget ska innehålla

Per rad:
- Elevens namn
- Klass och program
- APL-plats (arbetsplatsens namn och adress)
- Period (start- och slutdatum)
- Antal APL-dagar
- Eventuell kommentar

### Exportformat

- Excel (xlsx) med en rad per elev/period
- Filtrerbart per klass, program, period

### Endpoint

```
GET /api/admin/reports/material-compensation?from=&to=&class_id=
  → Excel-fil
```

---

## 1.8.6 – Statsbidragsrapport i Excel

### Vad det är

Skolverket betalar ut statsbidrag för lärlingsutbildning. Skolan rapporterar underlag i ett specifikt Excel-format som Skolverket definierar.

### Skolverkets format (lärlingsutbildning)

Rapporten innehåller typiskt:

| Kolumn | Beskrivning |
|---|---|
| Skolenhetens namn | |
| Skolenhetskod | Skolverkets 8-siffriga kod |
| Elevens personnummer | |
| Elevens namn | |
| Program | Gy11/Gy25-programkod |
| Kurs | Kurskod |
| Lärarens lärarkategori | Skolverkets kod (1–5) |
| APL-period start | |
| APL-period slut | |
| Antal timmar APL | |
| Arbetsplats | |

> ⚠️ Skolverket uppdaterar rapportformatet vid regeländringar. Håll formatet konfigurerbart eller lätt att uppdatera.

### Implementation

Använd `openpyxl` för att generera xlsx med rätt kolumnrubriker och format.

```python
# app/api/routes/admin_reports.py

@router.get("/admin/reports/state-subsidy")
async def state_subsidy_report(
    school_year: str,  # t.ex. "2026/2027"
    db: DbSession,
    user: Annotated[User, Depends(require_roles(UserRole.SCHOOL_ADMIN))]
):
    # Hämta data, generera xlsx, returnera som StreamingResponse
    ...
```

### Endpoint

```
GET /api/admin/reports/state-subsidy?school_year=2026/2027
  → Excel-fil (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
```

---

## Rollmodell för school_admin

`school_admin` ska kunna:
- Se alla elever, klasser och lärare på sin skola
- Registrera och uppdatera lärarkategorier
- Generera alla rapporter
- Hantera exportfunktioner

`school_admin` ska **inte** kunna:
- Redigera elevdokumentation eller bedömningar
- Se kommunikation mellan elev och lärare
- Administrera andra skolor (om multi-tenant används)

---

## Prioriteringsordning

1. Lärarkategorier (databas + admin-UI) — relativt enkelt
2. Materialsersättningsunderlag — Excel-export
3. Statsbidragsrapport — kräver att Skolverkets exakta format är känt
