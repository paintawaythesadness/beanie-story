import { readFile } from "node:fs/promises";
import path from "node:path";

export interface SyncConfig {
  apiBase: string;
  password: string;
  pageSize: number;
}

export async function loadSyncConfig(): Promise<SyncConfig> {
  await loadEnvFiles();

  const apiBase = process.env.SYNC_API_BASE?.trim();
  const password = process.env.SYNC_PASSWORD?.trim();
  const pageSize = Number.parseInt(process.env.SYNC_PAGE_SIZE || "100", 10);

  if (!apiBase) {
    throw new Error("Missing SYNC_API_BASE. Set it in tweeconversion/.env, tweeconversion/.env.local, or the shell.");
  }

  if (!password) {
    throw new Error("Missing SYNC_PASSWORD. Set it in tweeconversion/.env, tweeconversion/.env.local, or the shell.");
  }

  return {
    apiBase: apiBase.replace(/\/$/, ""),
    password,
    pageSize: Number.isFinite(pageSize) ? Math.min(Math.max(pageSize, 1), 100) : 100,
  };
}

async function loadEnvFiles(): Promise<void> {
  for (const fileName of [".env", ".env.local"]) {
    const filePath = path.resolve(fileName);
    try {
      const content = await readFile(filePath, "utf8");
      applyEnv(content);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }
}

function applyEnv(content: string): void {
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = stripQuotes(rawValue);
  }
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
