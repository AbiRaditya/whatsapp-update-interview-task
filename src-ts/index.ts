#!/usr/bin/env node
import { readFileSync } from "fs";
import pc from "picocolors";
import { createDefaultPhoneNormalizer } from "./phoneNormaliser";
import {
  CsvSheetSource,
  InMemoryPatientRepository,
  UpdateReporter,
} from "./infrastructure";
import { UpdateService } from "./updateService";
import { PatientResource } from "./domain";

interface ParsedArgsBase {
  patients?: string;
  sheet?: string;
  outdir: string;
  interactive?: boolean;
  phoneFormat?: "e164" | "local0";
}

type ParsedArgs = Required<Omit<ParsedArgsBase, "interactive">> & {
  interactive?: boolean;
};

function parseArgsOrNull(): ParsedArgs | null {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) return null;
  const out: Partial<ParsedArgsBase> = {};
  const consumed = new Set<number>();
  for (const [i, token] of argv.entries()) {
    if (consumed.has(i)) continue;
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      (out as any)[key] = next;
      consumed.add(i + 1);
    } else {
      if (key === "interactive") {
        out.interactive = true;
      } else {
        (out as any)[key] = "true";
      }
    }
  }
  if (!out.outdir) out.outdir = "output";
  if (!out.phoneFormat) out.phoneFormat = "e164";
  const isInteractive = !!out.interactive;
  if (!isInteractive) {
    if (!out.patients) out.patients = "data/repo/patients-data.json";
    if (!out.sheet) out.sheet = "data/sheets/Whatsapp Data - Sheet.csv";
  }
  if (isInteractive) {
    return {
      patients: out.patients || "",
      sheet: out.sheet || "",
      outdir: out.outdir!,
      phoneFormat: (out.phoneFormat as "e164" | "local0") || "e164",
      interactive: true,
    };
  }
  return {
    patients: out.patients!,
    sheet: out.sheet!,
    outdir: out.outdir!,
    phoneFormat: out.phoneFormat as "e164" | "local0",
    interactive: out.interactive,
  };
}

import type { RunConfig } from "./interactive";
import { collectInteractiveConfig, printInteractiveIntro } from "./interactive";

function usage() {
  console.log(
    `Usage: whatsapp-sync --patients <path> --sheet <csv> [--outdir dir] [--phoneFormat e164|local0]\n       whatsapp-sync --interactive\n\nDefaults:\n  patients JSON: data/repo/patients-data.json\n  sheet CSV:     data/sheets/Whatsapp Data - Sheet.csv\n  outdir:        data/output\n  phoneFormat:   e164 (+62...)\n\nExamples:\n  whatsapp-sync --patients data/repo/patients-data.json --sheet "data/sheets/Whatsapp Data - Sheet.csv" --outdir data/output --phoneFormat e164\n  whatsapp-sync --interactive`
  );
}

async function main() {
  const parsed = parseArgsOrNull();
  let args: RunConfig;
  if (!parsed || parsed.interactive) {
    usage();
    printInteractiveIntro();
    args = await collectInteractiveConfig();
  } else {
    const required = ["patients", "sheet"] as const;
    for (const k of required) {
      if (!(parsed as any)[k]) {
        console.error(pc.red(`Missing --${k}`));
        usage();
        process.exit(1);
      }
    }
    args = {
      patients: parsed.patients,
      sheet: parsed.sheet,
      outdir: parsed.outdir || "data/output",
      phoneFormat: parsed.phoneFormat || "local0",
    } as RunConfig;
  }
  const bundle = JSON.parse(readFileSync(args.patients, "utf-8")) as {
    patients_before_phone_update: Array<{ resource: PatientResource }>;
  };
  const patientResources = bundle.patients_before_phone_update.map(
    (p) => p.resource
  );
  const repo = new InMemoryPatientRepository(patientResources); // load patients data into memory from json file
  const sheet = new CsvSheetSource(args.sheet); // load sheet rows into memory from csv file
  const normalizer = createDefaultPhoneNormalizer(args.phoneFormat);
  const reporter = new UpdateReporter(args.outdir);
  const service = new UpdateService(repo, sheet, normalizer, reporter);
  service.run();
  const stats = reporter.buildStats();
  console.log(
    pc.green(
      `\nUpdate complete. Rows processed: ${stats.totalRows}, updated: ${stats.validUpdated}, unchanged: ${stats.validUnchanged}, invalid format: ${stats.invalidFormat}, missing patient: ${stats.missingPatient}`
    )
  );
  console.log(pc.dim(`Outputs written to: ${args.outdir}`));
  console.log(
    pc.gray(
      JSON.stringify({ summary: stats, output_dir: args.outdir }, null, 2)
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
