import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { exportTwee } from "../exporter.js";
import { PassageRecord } from "../types.js";

async function main(): Promise<void> {
  const [inputPath, outputPath] = process.argv.slice(2);

  if (!inputPath || !outputPath) {
    printUsageAndExit("Usage: npm run export -- <input.json> <output.twee>");
  }

  const absoluteInputPath = path.resolve(inputPath);
  const absoluteOutputPath = path.resolve(outputPath);
  const jsonText = await readFile(absoluteInputPath, "utf8");
  const parsed = JSON.parse(jsonText) as unknown;
  const passages = validatePassageArray(parsed);
  const tweeText = exportTwee(passages);

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, tweeText, "utf8");

  console.log(`Exported ${passages.length} passages to ${absoluteOutputPath}`);
}

function validatePassageArray(value: unknown): PassageRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("Input JSON must be an array of passage records.");
  }

  return value.map((item, index) => validatePassageRecord(item, index));
}

function validatePassageRecord(value: unknown, index: number): PassageRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Passage at index ${index} must be an object.`);
  }

  const candidate = value as Record<string, unknown>;

  if (typeof candidate.id !== "string") {
    throw new Error(`Passage at index ${index} is missing a string id.`);
  }

  if (typeof candidate.name !== "string") {
    throw new Error(`Passage at index ${index} is missing a string name.`);
  }

  if (candidate.displayTitle !== undefined && typeof candidate.displayTitle !== "string") {
    throw new Error(`Passage at index ${index} has a non-string displayTitle.`);
  }

  if (typeof candidate.content !== "string") {
    throw new Error(`Passage at index ${index} is missing a string content field.`);
  }

  if (typeof candidate.meta !== "object" || candidate.meta === null || Array.isArray(candidate.meta)) {
    throw new Error(`Passage at index ${index} must include a meta object.`);
  }

  if (candidate.modifiedAt !== undefined && typeof candidate.modifiedAt !== "string") {
    throw new Error(`Passage at index ${index} has a non-string modifiedAt.`);
  }

  return {
    id: candidate.id,
    name: candidate.name,
    displayTitle: candidate.displayTitle,
    content: candidate.content,
    meta: candidate.meta as Record<string, unknown>,
    modifiedAt: candidate.modifiedAt
  };
}

function printUsageAndExit(message: string): never {
  console.error(message);
  process.exit(1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Export failed: ${message}`);
  process.exit(1);
});
