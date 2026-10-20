# Mellanarkiv och dataexport

**Status:** Planerad (krävs för Norrköpingsupphandlingen)  
**Krav:** 4.2.1 (Ska) – data tillgänglig i 2 år efter avtalets slut

---

## Vad är mellanarkiv?

Mellanarkiv är ett mellanlager för data efter att ett avtal har avslutats. Det innebär att kommunen måste kunna komma åt all historisk APL-data (kontrakt, bedömningar, närvaro) i minst 2 år efter att avtalet med Firstflow löpt ut — även om de inte längre betalar för tjänsten.

Referensstandard: **SS-ISO 14721 (OAIS)** — Open Archival Information System.

---

## Krav på implementation

### Vad ska exporteras

| Datatyp | Format | Prioritet |
|---|---|---|
| Signerade kontrakt | PDF/A-2b | Kritisk |
| Bedömningsunderlag per elev | JSON + PDF | Kritisk |
| Närvaro och incheckning | JSON/CSV | Hög |
| Användarkonton (anonymiserade) | JSON | Hög |
| Frågor och elevsvar | JSON | Hög |
| Projekt och aktiviteter | JSON | Medium |
| Kommunikationsloggar | JSON | Medium |
| Revisionslogg (vem gjorde vad när) | JSON | Hög |

### Format

- **PDF/A-2b** för alla dokument som ska vara läsbara om 20+ år (ISO 19005-2)
- **JSON med dokumenterat schema** för strukturerad data — inkludera en `schema.json` som beskriver datafältens struktur och typer
- **Ingen proprietär kod** — exporten ska kunna öppnas utan Firstflow installerat

### Tillgänglighet

- Exportfunktionen måste fungera från dag ett (inte bara vid avtalets slut)
- Kommunen ska kunna ta ut fullständig export när som helst
- Under mellanarkivperioden (2 år efter avtalets slut): läs-access till exporterade filer utan aktiv licens

---

## Teknisk implementation

### Exportendpoint (backend)

```
POST /api/admin/export
  → Triggar async export-jobb
  → Svarar med jobb-id

GET /api/admin/export/{job_id}/status
  → running | complete | error

GET /api/admin/export/{job_id}/download
  → Returnerar ZIP-fil med hela exporten
```

### ZIP-struktur

```
firstflow-export-{datum}/
├── README.txt              # Förklaring av innehållet
├── schema.json             # Datafältbeskrivning
├── kontrakt/
│   ├── {contract_id}.pdf   # PDF/A-2b, ett per kontrakt
│   └── ...
├── elever/
│   └── elever.json         # Alla elever med klass/program
├── narvaro/
│   └── narvaro.json
├── bedomningar/
│   └── bedomningar.json
├── fragor-svar/
│   └── fragor-svar.json
└── revisionslogg/
    └── revisionslogg.json
```

### PDF/A-generering

Använd `weasyprint` eller `reportlab` för att generera PDF/A-2b från HTML-mallar.

```python
# Exempel med weasyprint
from weasyprint import HTML, CSS

def generate_pdfa(html_content: str, output_path: str):
    HTML(string=html_content).write_pdf(
        output_path,
        presentational_hints=True,
        # PDF/A-2b kräver inbäddade fonter och metadata
    )
```

### Anonymisering

- Exportera aldrig personnummer i klartext
- Använd interna UUID:n som pseudonymiserade identifierare
- Inkludera en separat krypterad nyckelfil om kommunen behöver återkoppla UUID → personnummer

---

## Mellanarkivperiod

När avtalet löper ut (2030-11-29):

1. Firstflow genererar automatiskt en fullständig export
2. Exporten levereras till kommunen (SFTP eller nedladdningslänk)
3. Kommunen laddar ner och lagrar i eget system
4. Data i Firstflow gallras efter 2 år (2032-11-29) om inte annat överenskommits

---

## Resursreferenser

- [Riksarkivets vägledning för e-arkiv](https://www.riksarkivet.se/e-arkiv)
- [PDF/A-standarden (ISO 19005)](https://www.pdfa.org/pdfa/)
- [SS-ISO 14721 (OAIS)](https://www.sis.se/)
