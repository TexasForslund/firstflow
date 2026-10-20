# Multi-tenant och rollmodell

**Status:** Implementerad i B1b (PR #7)  
**Påverkar:** Hela systemet. Läs detta innan du skriver någon ny model eller endpoint.

---

## Grundprincip

Firstflow är ett **multi-tenant-system**. Varje skola är en tenant. Data är strikt separerad — en användare på Kramforsskolan ser aldrig data från Umeåskolan. Superadmin (Firstflow-teamet) ser allt.

---

## Rollhierarki

```
superadmin          Firstflow-teamet. Skapar skolor och skoladmins. Ser allt.
└── school_admin    Administrerar sin skola. Skapar lärare, rektor, SYV.
    ├── principal   Rektor. Ser och hanterar sin skolas APL-data. Godkänner avtal.
    ├── syv         Studie- och yrkesvägledare. Ser elever, stödjer APL-val.
    ├── teacher     Lärare. Hanterar klasser, elever och bedömning.
    └── student     Elev. Bjuds in av lärare. Ser sin egen APL.
        supervisor  Handledare (extern). Bjuds in per placering. Tillhör ingen skola.
```

`supervisor` är en extern roll — handledaren tillhör ett företag, inte en skola. De bjuds in per placering och har bara tillgång till sina egna elever.

---

## Kontoskapande — vem skapar vad

| Vem | Kan skapa |
|---|---|
| `superadmin` | Skolor, `school_admin`-konton |
| `school_admin` | `principal`, `syv`, `teacher` inom sin skola |
| `teacher` | Bjuder in `student` till en klass (via inbjudningslänk) |
| `teacher` | Bjuder in `supervisor` i samband med en placering |

**Ingen öppen registrering.** Det går inte att skapa ett konto själv.

---

## Databasmodell

### School (ny tabell)

```python
class School(Base):
    id: UUID
    name: str           # "Kramforsskolan"
    org_number: str     # organisationsnummer (valfritt)
    created_at: datetime
    is_active: bool
```

### User — ändras

Lägg till `school_id` på User:

```python
class User(Base):
    ...
    school_id: UUID | None  # None bara för superadmin och supervisor
    role: UserRole
```

### UserRole — utökas

```python
class UserRole(str, Enum):
    SUPERADMIN = "superadmin"
    SCHOOL_ADMIN = "school_admin"
    PRINCIPAL = "principal"
    SYV = "syv"
    TEACHER = "teacher"
    STUDENT = "student"
    SUPERVISOR = "supervisor"
```

---

## Tenantskydd i endpoints

**Regel:** Varje endpoint som hämtar eller ändrar data måste kontrollera att den inloggade användaren tillhör samma skola som resursen — eller är `superadmin`.

Lägg till en hjälpfunktion i `app/api/deps.py`:

```python
def require_same_school(user: CurrentUser, school_id: UUID) -> None:
    if user.role == UserRole.SUPERADMIN:
        return  # superadmin ser allt
    if user.school_id != school_id:
        raise HTTPException(status_code=404)  # 404, inte 403 — avslöja inte att resursen finns
```

Använd den i varje endpoint som rör en skolas data, utöver rollkontrollen.

---

## Superadmin-endpoints

```
POST /api/superadmin/schools                        # Skapa skola
GET  /api/superadmin/schools                        # Lista alla skolor
POST /api/superadmin/schools/{school_id}/admins     # Skapa school_admin för en skola
```

Dessa endpoints kräver `superadmin`-rollen.

En skolas användare:

```
GET  /api/schools/{school_id}/users?role=           # school_admin, principal, superadmin
POST /api/schools/{school_id}/users                 # school_admin, superadmin: principal, syv, teacher, student
```

Databasen har villkoret `ck_users_school_matches_role`: superadmin och handledare har ingen skola, alla andra roller har en. Villkoret gäller nya och ändrade konton. Konton skapas tills vidare via skript:

```bash
uv run python -m scripts.create_user \
  --email admin@kramforsskolan.se \
  --name "Admin Kramfors" \
  --role school_admin \
  --school-id <uuid>
```

---

## Seed-data

`scripts/seed_demo.py` ska skapa:

- 2 demoskolor: "Kramforsskolan" och "Umeåskolan"
- En `school_admin`, en `principal`, en `syv`, en `teacher` per skola
- Två klasser med fem elever var per skola
- En `supervisor` kopplad till en placering på Kramforsskolan
- En `superadmin`

Lösenord på alla demokonton: `demo-firstflow`  
Skriptet vägrar köra om `ENVIRONMENT=production`.

---

## Migrering

B1 (PR #3) skapade `users`-tabellen utan `school_id`. Det behövs en ny migrering:

1. Skapa `schools`-tabellen
2. Lägg till `school_id UUID NULLABLE` på `users` (nullable för bakåtkompatibilitet med befintliga testkonton)
3. Uppdatera `UserRole`-enum med de nya rollerna

Kör: `uv run alembic revision --autogenerate -m "lägg till skolor och utöka roller"`

---

## Påverkan på befintlig kod

| Fil | Ändring |
|---|---|
| `app/models/user.py` | Lägg till `school_id`, uppdatera `UserRole` |
| `app/api/deps.py` | Lägg till `require_same_school` |
| `app/api/routes/auth.py` | `GET /api/auth/me` returnerar även `school_id` och `school_name` |
| `backend/openapi.json` | Exporteras på nytt efter ändringarna |
| `scripts/create_user.py` | Lägg till `--school-id`-flagga |
| `scripts/seed_demo.py` | Skrivs om med ny struktur |
