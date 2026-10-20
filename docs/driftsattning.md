# Driftsättning hos Broadview

**Status:** Plan, inget är byggt än. Uppgifterna finns i [att-gora/drift.md](../att-gora/drift.md).
**Beslut:** Firstflow driftas hos Broadview (Texas, 2026-10-20).

Firstflow hanterar personuppgifter om elever, ofta minderåriga. Kommuner ställer krav på var datan ligger, hur den skyddas och hur länge den sparas, till exempel i KLASSA-bilagan och SLA-bilagan i Norrköpings upphandling (se [upphandling-norrköping.md](upphandling-norrköping.md)). Planen utgår från det.

---

## Miljöer

| Miljö | Syfte | Data |
|---|---|---|
| **Lokal** | Utveckling, `docker compose up` | Demodata (`seed_demo`) |
| **Test** (staging) | Prova en version innan skolorna får den. Används för demo och systemvisning | Bara demodata, aldrig riktiga elever |
| **Produktion** | Pilotskolor och kunder | Riktiga användare |

Test och produktion ska vara helt åtskilda: egna databaser, egna hemligheter, egna domäner (t.ex. `test.firstflow.se` och `app.firstflow.se`). `seed_demo` vägrar redan köra om `ENVIRONMENT` inte är `development` eller `test`.

---

## Arkitektur i produktion

```
Webbläsare ──https──▶ Proxy (TLS, Caddy eller nginx)
                        ├── /        statiska filer från `npm run build`
                        └── /api     backend (uvicorn/gunicorn, flera workers)
                                        ├── PostgreSQL
                                        ├── Fillagring (bilder från veckoredovisningar)
                                        └── E-post (inbjudningar, glömt lösenord)
```

- **Samma domän för frontend och `/api`.** Inloggningen är en httpOnly-cookie (`firstflow_session`) som bara skickas till samma origin. Därför måste proxyn lägga båda under samma adress.
- **Frontend byggs** till statiska filer (`npm run build`) och serveras av proxyn. Ingen Vite-server i produktion.
- **Backend körs utan `--reload`** och utan källkoden monterad. Migreringar (`alembic upgrade head`) körs som ett eget steg vid driftsättning, inte vid varje uppstart.
- **Dagens `docker-compose.yml` och Dockerfiles är för utveckling.** Produktion får egna filer (D1).

### Miljövariabler i produktion

| Variabel | Värde |
|---|---|
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | Produktionsdatabasen. Lösenordet ligger bara på servern |
| `CORS_ORIGINS` | Produktionsdomänen |
| `SESSION_COOKIE_SECURE` | `true` (kräver https) |
| `SESSION_LIFETIME_DAYS` | Bestäms med skolorna, t.ex. 14 |
| `ANTHROPIC_API_KEY` | Firstflows eget API-konto hos Anthropic för frågeförslag utifrån läroplanen (B5). Ingen elevdata skickas |

Hemligheter committas aldrig. De sätts på servern eller i en hemlighetshanterare.

---

## Krav att stämma av med Broadview

| Fråga | Varför |
|---|---|
| Ligger servrar **och backup** i Sverige, eller åtminstone inom EU/EES? | Krav från kommuner och GDPR. Elevdata får inte hamna utanför EU utan särskild utredning |
| Kan Broadview teckna **personuppgiftsbiträdesavtal** som underbiträde till oss? | Skolan är personuppgiftsansvarig, vi är biträde, Broadview blir underbiträde. Skolorna frågar efter det |
| Hanterad **PostgreSQL** (17), eller kör vi den själva på en server? | Avgör vem som sköter uppdateringar, backup och återläsning |
| **Backup:** hur ofta, hur länge sparas den, är den krypterad, och kan vi prova återläsning? | Krav på återställning. Data ska också finnas kvar som mellanarkiv efter avtalets slut ([mellanarkiv-dataexport.md](mellanarkiv-dataexport.md)) |
| **Fillagring** för bilder, t.ex. S3-kompatibel lagring? | Bilder från veckoredovisningar ska inte ligga i containern |
| **E-post:** SMTP-relä eller rekommenderad leverantör, och SPF/DKIM för vår domän? | Inbjudningar och glömt lösenord (B6) måste komma fram |
| **TLS-certifikat** och domän: sköter Broadview det, eller gör proxyn det (Let's Encrypt)? | https krävs för inloggningen |
| **Övervakning** och larm om tjänsten går ned, och vilken **tillgänglighet** kan de lova? | SLA-bilagan i upphandlingen |
| Brandvägg, uppdatering av operativsystem, intrångsskydd och **loggar** | Informationssäkerhetskrav (KLASSA). Vem ansvarar för vad |
| Kan vi få en **testmiljö** och en **produktionsmiljö** åtskilda? | Se Miljöer |
| Hur gör vi **driftsättning**: SSH, container-register eller något de har? | Avgör hur CI levererar nya versioner (D7) |

---

## Säkerhet och dataskydd

- **Loggar** innehåller aldrig namn, e-post, personnummer eller annan elevdata (regel i CLAUDE.md). Loggning av inloggningar och ändringar i elevdata byggs i B6.
- **Begränsning av inloggningsförsök** per e-post och IP (B6) måste finnas innan produktion.
- **Konton utan skola** från före B1b flyttas eller tas bort, och `ALTER TABLE users VALIDATE CONSTRAINT ck_users_school_matches_role` körs innan första pilotskolan (se [multi-tenant-och-roller.md](multi-tenant-och-roller.md)).
- **Säkerhetsrubriker** i proxyn: HSTS, `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`.
- **Sårbarhetskontroll** av beroenden i CI, och en extern säkerhetstest innan första kommunkunden.
- **Radering och export:** när en skola slutar ska datan kunna exporteras och sedan raderas enligt avtal.

---

## Ordning

1. Stäm av frågorna ovan med Broadview.
2. Bygg produktionskonfigurationen (D1) och sätt upp testmiljön (D2). Använd den för demo och systemvisning.
3. Backup och återläsning provad (D3), e-post (D4), fillagring när bilder finns (D5), övervakning (D6).
4. Automatisk driftsättning från `main` till test och manuellt godkänd till produktion (D7).
5. Säkerhetspunkterna ovan och B6 klara innan första pilotskolan (D8).
