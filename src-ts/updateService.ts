import {
  IPatientRepository,
  ISheetRowSource,
  IUpdateReporter,
  SheetRow,
} from "./domain";
import { IPhoneNormalizer } from "./phoneNormaliser";

export class UpdateService {
  constructor(
    private repo: IPatientRepository,
    private sheet: ISheetRowSource,
    private normalizer: IPhoneNormalizer,
    private reporter: IUpdateReporter
  ) {}

  run(): void {
    // Rows are now provided already sorted (oldest -> newest) by the sheet source.
    const rows = this.sheet.loadRows();
    for (const row of rows) {
      this.reporter.incTotal();
      const norm = this.normalizer.normalise(row.rawPhone);
      if (!norm.valid || !norm.canonical) {
        this.reporter.recordInvalid(row, norm.reason || "invalid");
        continue;
      }
      const patient = this.repo.findByNik(row.nik);
      if (!patient) {
        this.reporter.recordInvalid(row, "missing_patient");
        continue;
      }
      const changed = this.repo.applyPhone(patient, norm.canonical);
      if (changed) this.reporter.incUpdated();
      else this.reporter.incUnchanged();
    }
    this.reporter.writeOutputs(this.repo.allPatients());
  }
}
