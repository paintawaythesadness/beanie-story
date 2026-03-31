import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseTweeWithWarnings } from "../parser.js";

async function main(): Promise<void> {
  const [inputPath, outputPath] = process.argv.slice(2);

  if (!inputPath || !outputPath) {
    printUsageAndExit("Usage: npm run import -- <input.twee> <output.json>");
  }

  const absoluteInputPath = path.resolve(inputPath);
  const absoluteOutputPath = path.resolve(outputPath);
  const inputText = await readFile(absoluteInputPath, "utf8");
  const result = parseTweeWithWarnings(inputText);

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, JSON.stringify(result.passages, null, 2) + "\n", "utf8");

  for (const warning of result.warnings) {
    console.warn(`[warn] ${warning.message}`);
  }

  console.log(`Imported ${result.passages.length} passages to ${absoluteOutputPath}`);
  if (result.warnings.length > 0) {
    console.log(`Completed with ${result.warnings.length} warning(s).`);
  }
}

function printUsageAndExit(message: string): never {
  console.error(message);
  process.exit(1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Import failed: ${message}`);
  process.exit(1);
});
