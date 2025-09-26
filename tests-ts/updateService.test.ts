import {
  InMemoryPatientRepository,
  CsvSheetSource,
  UpdateReporter,
} from "../src-ts/infrastructure";
import { UpdateService } from "../src-ts/updateService";
import { createDefaultPhoneNormalizer } from "../src-ts/phoneNormaliser";
import { writeFileSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// Helper to create a temporary output directory
function tempOutDir() {
  return mkdtempSync(path.join(tmpdir(), "whatsapp-sync-test-"));
}

describe("UpdateService end-to-end core logic", () => {
  it("updates all rows (no date filter), tracks stats and writes outputs", () => {
    const runDate = "23-09-2025";

    // Minimal patient bundle (subset of fields used)
    const patients = [
      {
        resourceType: "Patient",
        id: "patient-001",
        identifier: [
          {
            system: "https://fhir.kemkes.go.id/id/nik",
            value: "3171044203920001",
          },
        ],
        meta: { versionId: "v001" },
      },
      {
        resourceType: "Patient",
        id: "patient-002",
        identifier: [
          {
            system: "https://fhir.kemkes.go.id/id/nik",
            value: "3578106207900002",
          },
        ],
        meta: { versionId: "v010" },
      },
    ];

    // Create a small CSV with: two valid updates (since patient-001 initially has no phone), one additional valid update for patient-002, but only first counts as update then invalid phone, one missing patient, one different date (also processed now)
    const csv =
      `last_updated_date,nik_identifier,name,phone_number\n` +
      `${runDate},3171044203920001,NAME,+6281234567890\n` + // patient-001 gains phone (updated)
      `${runDate},3578106207900002,NAME,081234567890\n` + // patient-002 normalises and updates
      `${runDate},3578106207900002,NAME,62abc123\n` + // invalid format
      `${runDate},0000000000000000,NAME,081234567890\n` + // missing patient
      `22-09-2025,3171044203920001,NAME,081234567890`; // different date ignored

    const sheetPath = path.join(tempOutDir(), "sheet.csv");
    writeFileSync(sheetPath, csv);

    const repo = new InMemoryPatientRepository(patients as any); // cast retained only for construct flexibility; could define a precise type helper later
    const sheet = new CsvSheetSource(sheetPath);
    const normalizer = createDefaultPhoneNormalizer();
    const outDir = tempOutDir();
    const reporter = new UpdateReporter(outDir);
    const service = new UpdateService(repo, sheet, normalizer, reporter);

    service.run();
    const stats = reporter.buildStats();

    expect(stats.totalRows).toBe(5); // all rows scanned
    expect(
      stats.validUpdated +
        stats.validUnchanged +
        stats.invalidFormat +
        stats.missingPatient
    ).toBe(5); // all rows counted now
    expect(stats.validUpdated).toBe(2); // two patients received/changed numbers
    expect(stats.validUnchanged).toBe(1); // duplicate patient-001 later row unchanged
    expect(stats.invalidFormat).toBe(1); // invalid phone
    expect(stats.missingPatient).toBe(1); // unknown NIK

    // Verify patient telecom updated & version bumped for updated patient
    const updatedPatient = repo.findByNik("3578106207900002")!;
    const phoneEntry = updatedPatient.telecom?.find(
      (t) => t.system === "phone"
    );
    expect(phoneEntry?.value).toBe("+6281234567890");
    const updatedMeta = updatedPatient.meta!;
    expect(updatedMeta.versionId).not.toBe("v010");
    expect(typeof updatedMeta.lastUpdated).toBe("string");
    // Basic shape check: YYYY-MM-DDThh:mm:ss.micros+HH:MM
    expect(updatedMeta.lastUpdated).toMatch(
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}[+-]\d{2}:\d{2}/
    );

    // Output artifacts
    const report = JSON.parse(
      readFileSync(path.join(outDir, "report.json"), "utf-8")
    );
    expect(report.validUpdated).toBe(2);
    const patientsOut = JSON.parse(
      readFileSync(path.join(outDir, "patients_updated.json"), "utf-8")
    );
    expect(Array.isArray(patientsOut.patients_after_phone_update)).toBe(true);

    // Cleanup temp dirs
    rmSync(outDir, { recursive: true, force: true });
  });
});
