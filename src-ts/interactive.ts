import { readdirSync, statSync } from "fs";
import path from "path";
import inquirer from "inquirer";
import pc from "picocolors";

export interface RunConfig {
  patients: string;
  sheet: string;
  outdir: string;
  phoneFormat: "e164" | "local0";
}

export async function collectInteractiveConfig(): Promise<RunConfig> {
  const sheetsDir = path.resolve(process.cwd(), "data/sheets");
  const repoDir = path.resolve(process.cwd(), "data/repo");
  const sheetFiles = readdirSync(sheetsDir)
    .map((f) => path.join(sheetsDir, f))
    .filter((p) => statSync(p).isFile());
  const repoFiles = readdirSync(repoDir)
    .map((f) => path.join(repoDir, f))
    .filter((p) => statSync(p).isFile());
  const csvs = sheetFiles.filter((f) => f.toLowerCase().endsWith(".csv"));
  const jsons = repoFiles.filter((f) => f.toLowerCase().endsWith(".json"));
  if (csvs.length === 0 || jsons.length === 0) {
    console.error(
      pc.red(
        "Could not find required .csv in data/sheets and .json in data/repo for interactive mode."
      )
    );
    process.exit(1);
  }
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "sheet",
      message: "Select WhatsApp CSV (data/sheets)",
      choices: csvs,
      loop: false,
    },
    {
      type: "list",
      name: "patients",
      message: "Select patients JSON (data/repo)",
      choices: jsons,
      loop: false,
    },
    {
      type: "input",
      name: "outdir",
      message: "Output directory",
      default: "data/output",
    },
    {
      type: "list",
      name: "phoneFormat",
      message: "Phone normalisation format",
      choices: [
        { name: "Leading 0", value: "local0" },
        { name: "+62", value: "e164" },
      ],
      default: "local0",
      loop: false,
    },
  ]);
  return answers as RunConfig;
}

export function printInteractiveIntro() {
  console.log(
    pc.cyan("\nEntering interactive mode...") +
      "\n" +
      pc.dim(
        "(Tip: Place .csv files in data/sheets and patients JSON files in data/repo; they will appear here next run.)"
      )
  );
}
