import { readFileSync, writeFileSync, mkdirSync } from "fs";
import {
  IPatientRepository,
  PatientResource,
  NIK_SYSTEM,
  ISheetRowSource,
  SheetRow,
  IUpdateReporter,
  UpdateStats,
  PatientTelecom,
} from "./domain";

// Patient repository reading from provided JSON file
export class InMemoryPatientRepository implements IPatientRepository {
  private byNik: Map<string, PatientResource> = new Map();
  constructor(private patients: PatientResource[]) {
    for (const p of patients) {
      for (const ident of p.identifier || []) {
        if (ident.system === NIK_SYSTEM) {
          // use only the NIK identifiers
          this.byNik.set(ident.value, p);
        }
      }
    }
  }
  findByNik(nik: string): PatientResource | undefined {
    return this.byNik.get(nik);
  }
  allPatients(): PatientResource[] {
    return this.patients;
  }
  applyPhone(patient: PatientResource, phone: string): boolean {
    const telecom: PatientTelecom[] = patient.telecom || (patient.telecom = []);
    const existing = telecom.find(
      (t) => t.system === "phone" && t.use === "mobile"
    );
    if (existing && existing.value === phone) return false;
    if (existing) {
      existing.value = phone;
      existing.rank = 1;
    } else {
      telecom.push({ system: "phone", use: "mobile", value: phone, rank: 1 });
    }
    updateMetaData(patient);
    return true;
  }
}

function updateMetaData(resource: PatientResource) {
  const meta = resource.meta || (resource.meta = {});
  meta.lastUpdated = buildLastUpdatedTimestamp();

  const vid = meta.versionId;
  if (typeof vid === "string" && vid.startsWith("v")) {
    const suffix = vid.slice(1);
    if (/^\d+$/.test(suffix)) {
      meta.versionId = `v${(parseInt(suffix, 10) + 1)
        .toString()
        .padStart(3, "0")}`;
      return;
    }
  }
  meta.versionId = (vid || "v000") + "-updated";
}

// Build a timestamp with pseudo microsecond precision and local timezone offset.
// Example: 2025-08-22T10:15:30.123456+07:00 (follows the same format as the JSON file)
function buildLastUpdatedTimestamp(date: Date = new Date()): string {
  const now = date;
  const tzMinutes = now.getTimezoneOffset();
  const offsetTotalMinutes = -tzMinutes;
  const sign = offsetTotalMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetTotalMinutes);
  const offHours = Math.floor(absMinutes / 60)
    .toString()
    .padStart(2, "0");
  const offMins = (absMinutes % 60).toString().padStart(2, "0");
  const ms = now.getMilliseconds().toString().padStart(3, "0");
  const pseudoMicros =
    ms +
    Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
  return `${now.getFullYear()}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}T${now
    .getHours()
    .toString()
    .padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now
    .getSeconds()
    .toString()
    .padStart(2, "0")}.${pseudoMicros}${sign}${offHours}:${offMins}`;
}

// Simple CSV sheet source
export class CsvSheetSource implements ISheetRowSource {
  constructor(private path: string) {}
  loadRows(): SheetRow[] {
    const content = readFileSync(this.path, "utf-8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (!lines.length) return [];
    const header = lines[0].split(",").map((h) => h.trim());
    const idx = (h: string) => header.indexOf(h);
    const li = idx("last_updated_date");
    const ni = idx("nik_identifier");
    const na = idx("name");
    const pn = idx("phone_number");
    const rows: SheetRow[] = [];
    for (const line of lines.slice(1)) {
      const cols = line.split(",");
      rows.push({
        lastUpdatedDate: (cols[li] || "").trim(),
        nik: (cols[ni] || "").trim(),
        name: (cols[na] || "").trim(),
        rawPhone: (cols[pn] || "").trim(),
      });
    }
    // Sort oldest -> newest so that later (newer) entries can overwrite earlier ones downstream.
    const parseDate = (d: string): number => {
      if (!d) return 0;
      const m = d.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
      if (!m) return 0;
      const [, dd, mm, yyyy] = m;
      const ts = Date.UTC(
        parseInt(yyyy, 10),
        parseInt(mm, 10) - 1,
        parseInt(dd, 10)
      );
      return isNaN(ts) ? 0 : ts;
    };
    rows.sort(
      (a, b) => parseDate(a.lastUpdatedDate) - parseDate(b.lastUpdatedDate)
    );
    return rows;
  }
}

// Reporter collects stats & outputs artifacts
export class UpdateReporter implements IUpdateReporter {
  private invalid: Array<{ nik: string; raw: string; reason: string }> = [];
  private stats: UpdateStats;
  constructor(private outDir: string) {
    this.stats = {
      totalRows: 0,
      validUpdated: 0,
      validUnchanged: 0,
      invalidFormat: 0,
      missingPatient: 0,
    };
  }
  recordInvalid(row: SheetRow, reason: string): void {
    this.invalid.push({ nik: row.nik, raw: row.rawPhone, reason });
    if (reason === "missing_patient") this.stats.missingPatient++;
    else this.stats.invalidFormat++;
  }
  incTotal(): void {
    this.stats.totalRows++;
  }
  incUpdated(): void {
    this.stats.validUpdated++;
  }
  incUnchanged(): void {
    this.stats.validUnchanged++;
  }
  buildStats(): UpdateStats {
    return this.stats;
  }
  writeOutputs(patients: PatientResource[]): void {
    mkdirSync(this.outDir, { recursive: true });
    const outPatients = patients.map((p) => ({ resource: p }));
    writeFileSync(
      `${this.outDir}/patients_updated.json`,
      JSON.stringify({ patients_after_phone_update: outPatients }, null, 2)
    );
    writeFileSync(
      `${this.outDir}/report.json`,
      JSON.stringify(this.stats, null, 2)
    );
    if (this.invalid.length) {
      const header = "nik,raw_phone,reason\n";
      const body = this.invalid
        .map((r) => `${r.nik},${r.raw},${r.reason}`)
        .join("\n");
      writeFileSync(`${this.outDir}/invalid_rows.csv`, header + body + "\n");
    }
  }
}
