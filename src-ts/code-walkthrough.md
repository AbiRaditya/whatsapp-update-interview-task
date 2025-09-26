# src-ts Code Walkthrough

This document explains each file in `src-ts/`, the high→low level flow, the design rationale behind key decisions, and additional notes that highlight the solution trade-offs and future extensions.

---

## High-level overview

- Entry point (CLI): `index.ts`
- Interactive UX: `interactive.ts`
- Domain contracts and types: `domain.ts`
- Infrastructure adapters: `infrastructure.ts`
- Business orchestrator: `updateService.ts`
- Phone cleaning/validation: `phoneNormaliser.ts`

Flow (happy path)

1. CLI parses args or launches interactive prompts.
2. Patients JSON is loaded into `InMemoryPatientRepository` and CSV into `CsvSheetSource`.
3. `UpdateService` iterates sorted rows, normalises phones, finds patients, and applies updates idempotently.
4. `UpdateReporter` aggregates counters and writes output artifacts.

---

## File-by-file

### `domain.ts`

Purpose

- Defines the domain model and interfaces used across layers:
  - `SheetRow`, `PatientResource`, `PatientIdentifier`, `PatientTelecom`, `PatientMeta`.
  - Ports: `IPatientRepository`, `ISheetRowSource`, `IUpdateReporter`.
  - `UpdateStats` reporting shape and `NIK_SYSTEM` constant.

Rationale

- Clear contracts decouple the core logic from I/O details.
- Enables testing by substituting in-memory fakes or stubs.

Notes

- `PatientResource` is intentionally permissive with an index signature to allow extra fields without compile errors.

---

### `infrastructure.ts`

Purpose

- Concrete adapters for the domain ports:
  - `InMemoryPatientRepository` holds patients indexed by NIK; applies phone updates and bumps metadata.
  - `CsvSheetSource` reads the CSV, maps headers, and sorts rows by date (oldest → newest).
  - `UpdateReporter` collects counters and writes JSON/CSV outputs.

Rationale

- Keeps I/O and persistence concerns separate from orchestration/business rules.
- Sorting upstream ensures deterministic ‘last write wins’ when multiple rows exist per patient.

Key behaviours

- `applyPhone` is idempotent: if the same canonical phone exists, returns `false` and avoids a version bump.
- `updateMetaData` increments `meta.versionId` and regenerates `meta.lastUpdated` with pseudo-microsecond precision and timezone offset.
- `CsvSheetSource` tolerates missing or malformed dates by pushing them to the oldest position (still processed).

Notes

- Output files: `data/output/patients_updated.json`, `data/output/report.json`, and optionally `data/output/invalid_rows.csv`.
- Repository only touches the `telecom` entry with `system: "phone"` and `use: "mobile"`.

---

### `phoneNormaliser.ts`

Purpose

- Encapsulates all phone number cleaning and canonicalisation to Indonesian formats with selectable output:
  - `e164` → `+62…` (default)
  - `local0` → `0…`

Rationale

- Single Responsibility: isolates parsing/validation rules.
- Open/Closed: new normalisers can implement `IPhoneNormalizer` without changing consumers.
- Testability: deterministic rules (strip formatting, handle +62/62/0/local), strict validation before use.

Key rules (summarised)

- Strip whitespace and punctuation, allow only digits and a leading `+`.
- Accept `+62`, `62`, or national `0` prefixes; also accept local `812…` forms within length bounds by prepending `+62`.
- Enforce length between 10 and 15 digits (E.164 inclusive) after the leading `+`.
- Return `{ valid: false, reason }` on any failure; mask helper for privacy-aware logs.

Notes

- The `masked()` helper reveals only a prefix and last two digits, suitable for logs, and adapts to either format.

---

### `updateService.ts`

Purpose

- The orchestration layer which ties `ISheetRowSource`, `IPatientRepository`, `IPhoneNormalizer`, and `IUpdateReporter` together.

Rationale

- Keeps business flow readable and free from I/O details: iterate → normalise → validate → find → apply → count.
- All side effects (file IO) are delegated to infrastructure classes via interfaces.

Happy-path steps

1. For each sorted `SheetRow`, increment total.
2. Normalise phone; if invalid, classify and record reason.
3. Find patient by NIK; if missing, record as `missing_patient`.
4. Apply idempotent phone update; increment `updated` or `unchanged` accordingly.
5. After the loop, write outputs via reporter.

Notes

- No date filtering is applied here by design; the sheet source already pre-sorts rows.

---

### `interactive.ts`

Purpose

- Provides an optional interactive UX for selecting the CSV, patients JSON, and output directory.

Rationale

- Low-friction demo UX; reduces CLI memorisation for reviewers.

Notes

- Scans `data/sheets/` for `.csv` and `data/repo/` for patients `.json`. Defaults outdir to `data/output`.
- Prompts for phone format selection (`e164` or `local0`).

---

### `index.ts` (CLI entry)

Purpose

- Command-line entry point that parses flags, optionally launches interactive mode, wires dependencies, and runs the service.

Rationale

- Keeps bootstrap separate from domain/infrastructure to preserve testability and modularity.

Behaviour

- Flags: `--patients <file>`, `--sheet <file>`, `--outdir <dir>`, `--phoneFormat e164|local0`, or `--interactive`.
- Loads inputs, constructs adapters (`InMemoryPatientRepository`, `CsvSheetSource`, `UpdateReporter`), and the `PhoneNormalizer`.
- Executes `UpdateService.run()` and prints a summary.

Notes

- Defaults: patients `data/repo/patients-data.json`, sheet `data/sheets/Whatsapp Data - Sheet.csv`, outdir `data/output`, phone format `e164`.
- Shows a JSON summary line for convenient copy/paste or downstream scripting.

---

## Design rationale and principles

- SOLID
  - SRP: normalisation, reporting, persistence adapters, and orchestration are cleanly separated.
  - OCP/DIP: depend on interfaces; swap implementations without touching business flow.
- Determinism
  - Sorting ensures newest sheet entries win when multiple updates exist.
  - Idempotent `applyPhone` avoids false version bumps.
- Observability
  - Reporter provides explicit counters and invalid row capture for auditability.
- Safety
  - Strict normalisation/validation prevents writing garbage into the patient store.

---

## Additional notes and future work

- Streaming CSV for large files to reduce memory usage.
- Pluggable normalisation for multi-country support; rules injected via configuration.
- Replace in-memory repo with FHIR API client; add retry/backoff and partial failure recovery.
- Deterministic timestamps by injecting a clock and monotonic counter for reproducible tests.
- Optional date filter flag could be reintroduced without touching `UpdateService` by adjusting the sheet source.
