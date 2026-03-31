import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PassageRecord } from "../types.js";
import { loadSyncConfig } from "../sync.js";

type SyncMode = "dry" | "push" | "pull" | "delete";

interface LoginResponse {
  token: string;
  expiresAt: string;
}

interface NodesPageResponse {
  nodes: PassageRecord[];
  cursor?: string;
  listComplete: boolean;
}

interface DiffSummary {
  newIds: string[];
  changedIds: string[];
  unchangedIds: string[];
  remoteOnlyIds: string[];
  errors: string[];
}

async function main(): Promise<void> {
  const [modeArg, ...rawArgs] = process.argv.slice(2);
  const mode = parseMode(modeArg);
  const targetPath = resolveTargetPath(mode, rawArgs);

  if (!targetPath) {
    printUsageAndExit();
  }

  const config = await loadSyncConfig();
  const client = await createClient(config.apiBase, config.password);

  if (mode === "delete") {
    console.log(`DELETE ${targetPath}`);
    await deleteNode(client, targetPath);
    console.log(`Delete complete: ${targetPath}`);
    return;
  }

  if (mode === "pull") {
    const remoteNodes = await fetchAllNodes(client, config.pageSize);
    await writeJsonFile(targetPath, remoteNodes);
    console.log(`Pulled ${remoteNodes.length} passages to ${path.resolve(targetPath)}`);
    return;
  }

  const localNodes = await readPassageArray(targetPath);
  const remoteNodes = await fetchAllNodes(client, config.pageSize);
  const diff = diffPassages(localNodes, remoteNodes);

  printSummary(mode, diff);

  if (mode === "dry") {
    return;
  }

  let pushed = 0;
  for (const passage of localNodes) {
    if (!diff.newIds.includes(passage.id) && !diff.changedIds.includes(passage.id)) {
      continue;
    }

    await putNode(client, passage);
    pushed += 1;
    console.log(`PUSH ${passage.id}`);
  }

  console.log(`Push complete: ${pushed} written, ${diff.unchangedIds.length} skipped, ${diff.errors.length} errors`);
}

function resolveTargetPath(mode: SyncMode, rawArgs: string[]): string {
  if (mode === "delete") {
    return rawArgs.join(" ").trim();
  }

  return rawArgs[0] || "";
}

function parseMode(value: string | undefined): SyncMode {
  if (value === "dry" || value === "push" || value === "pull" || value === "delete") {
    return value;
  }

  printUsageAndExit();
}

function printUsageAndExit(): never {
  console.error("Usage:");
  console.error("  npm run sync:dry -- <input.json>");
  console.error("  npm run sync:push -- <input.json>");
  console.error("  npm run sync:pull -- <output.json>");
  console.error("  npm run sync:delete -- <passage-id>");
  process.exit(1);
}

async function createClient(apiBase: string, password: string) {
  const login = await fetchJson<LoginResponse>(`${apiBase}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  return {
    apiBase,
    token: login.token,
  };
}

async function fetchAllNodes(
  client: { apiBase: string; token: string },
  pageSize: number,
): Promise<PassageRecord[]> {
  const nodes: PassageRecord[] = [];
  let cursor: string | undefined;

  do {
    const search = new URLSearchParams({ limit: String(pageSize) });
    if (cursor) {
      search.set("cursor", cursor);
    }

    const response = await fetchJson<NodesPageResponse>(`${client.apiBase}/api/nodes?${search.toString()}`, {
      headers: { Authorization: `Bearer ${client.token}` },
    });

    nodes.push(...response.nodes);
    cursor = response.cursor;
  } while (cursor);

  return nodes;
}

async function putNode(client: { apiBase: string; token: string }, passage: PassageRecord): Promise<void> {
  await fetchJson<PassageRecord>(`${client.apiBase}/api/node/${encodeURIComponent(passage.id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${client.token}`,
    },
    body: JSON.stringify(passage),
  });
}

async function deleteNode(client: { apiBase: string; token: string }, id: string): Promise<void> {
  await fetchJson<{ ok: true; id: string }>(`${client.apiBase}/api/node/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${client.token}`,
    },
  });
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => ({ error: "Invalid server response" }))) as
    | T
    | { error?: string };

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed: ${response.status}`;
    throw new Error(`${url}: ${message}`);
  }

  return data as T;
}

async function readPassageArray(filePath: string): Promise<PassageRecord[]> {
  const absolutePath = path.resolve(filePath);
  const raw = await readFile(absolutePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Input JSON must be an array of passage records.");
  }

  return parsed.map((item, index) => validatePassage(item, index));
}

function validatePassage(value: unknown, index: number): PassageRecord {
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

  if (typeof candidate.content !== "string") {
    throw new Error(`Passage at index ${index} is missing a string content.`);
  }

  if (candidate.meta !== undefined && !isPlainObject(candidate.meta)) {
    throw new Error(`Passage at index ${index} has a non-object meta.`);
  }

  if (candidate.displayTitle !== undefined && typeof candidate.displayTitle !== "string") {
    throw new Error(`Passage at index ${index} has a non-string displayTitle.`);
  }

  if (candidate.modifiedAt !== undefined && typeof candidate.modifiedAt !== "string") {
    throw new Error(`Passage at index ${index} has a non-string modifiedAt.`);
  }

  return {
    id: candidate.id,
    name: candidate.name,
    displayTitle: candidate.displayTitle,
    content: candidate.content,
    meta: (candidate.meta as Record<string, unknown>) || {},
    modifiedAt: candidate.modifiedAt,
  };
}

function diffPassages(localNodes: PassageRecord[], remoteNodes: PassageRecord[]): DiffSummary {
  const remoteById = new Map(remoteNodes.map((node) => [node.id, node]));
  const localIds = new Set(localNodes.map((node) => node.id));
  const summary: DiffSummary = {
    newIds: [],
    changedIds: [],
    unchangedIds: [],
    remoteOnlyIds: [],
    errors: [],
  };

  for (const local of localNodes) {
    const remote = remoteById.get(local.id);
    if (!remote) {
      summary.newIds.push(local.id);
      continue;
    }

    if (recordsEqual(local, remote)) {
      summary.unchangedIds.push(local.id);
    } else {
      summary.changedIds.push(local.id);
    }
  }

  for (const remote of remoteNodes) {
    if (!localIds.has(remote.id)) {
      summary.remoteOnlyIds.push(remote.id);
    }
  }

  return summary;
}

function recordsEqual(left: PassageRecord, right: PassageRecord): boolean {
  return stableStringify(comparableRecord(left)) === stableStringify(comparableRecord(right));
}

function comparableRecord(record: PassageRecord) {
  return {
    id: record.id,
    name: record.name,
    displayTitle: record.displayTitle,
    content: record.content,
    meta: record.meta || {},
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

async function writeJsonFile(filePath: string, data: PassageRecord[]): Promise<void> {
  const absolutePath = path.resolve(filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function printSummary(mode: SyncMode, diff: DiffSummary): void {
  console.log(`${mode.toUpperCase()} summary`);
  console.log(`  new: ${diff.newIds.length}`);
  console.log(`  changed: ${diff.changedIds.length}`);
  console.log(`  unchanged: ${diff.unchangedIds.length}`);
  console.log(`  remote-only: ${diff.remoteOnlyIds.length}`);
  console.log(`  errors: ${diff.errors.length}`);

  printSample("NEW", diff.newIds);
  printSample("CHANGED", diff.changedIds);
  printSample("REMOTE-ONLY", diff.remoteOnlyIds);
}

function printSample(label: string, ids: string[]): void {
  if (ids.length === 0) {
    return;
  }

  for (const id of ids.slice(0, 5)) {
    console.log(`  ${label} ${id}`);
  }

  if (ids.length > 5) {
    console.log(`  ${label} ... ${ids.length - 5} more`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Sync failed: ${message}`);
  process.exit(1);
});
