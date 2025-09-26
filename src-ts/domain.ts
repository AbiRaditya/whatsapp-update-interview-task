// Domain layer abstractions & models
export interface SheetRow {
  lastUpdatedDate: string;
  nik: string;
  name: string;
  rawPhone: string;
}

export interface PatientIdentifier {
  system: string;
  value: string;
}

export interface PatientTelecom {
  system: string;
  use?: string;
  value: string;
  rank?: number;
}

export interface PatientMeta {
  versionId?: string;
  lastUpdated?: string;
  [k: string]: unknown;
}

export interface PatientResource {
  resourceType: "Patient";
  id: string;
  identifier?: PatientIdentifier[];
  telecom?: PatientTelecom[];
  meta?: PatientMeta;
  [k: string]: unknown;
}

export interface UpdateStats {
  totalRows: number;
  validUpdated: number;
  validUnchanged: number;
  invalidFormat: number;
  missingPatient: number;
}

export interface IPatientRepository {
  findByNik(nik: string): PatientResource | undefined;
  allPatients(): PatientResource[]; // for output bundle construction
  applyPhone(patient: PatientResource, phone: string): boolean; // returns true if changed
}

export interface ISheetRowSource {
  loadRows(): SheetRow[];
}

export interface IUpdateReporter {
  recordInvalid(row: SheetRow, reason: string): void;
  buildStats(): UpdateStats;
  writeOutputs(patients: PatientResource[]): void;
  incTotal(): void;
  incUpdated(): void;
  incUnchanged(): void;
}

export const NIK_SYSTEM = "https://fhir.kemkes.go.id/id/nik";
