export interface PassageMeta {
  [key: string]: unknown;
}

export interface PassageRecord {
  id: string;
  name: string;
  displayTitle?: string;
  content: string;
  meta: PassageMeta;
  modifiedAt?: string;
}

export interface TweeWarning {
  type:
    | "duplicate-id"
    | "malformed-metadata"
    | "missing-name"
    | "text-before-first-header";
  message: string;
  line?: number;
  passageName?: string;
  header?: string;
}

export interface ParseTweeOptions {
  modifiedAt?: string | (() => string);
}

export interface ParseTweeResult {
  passages: PassageRecord[];
  warnings: TweeWarning[];
}

export interface ExportTweeOptions {
  newline?: string;
  ensureTrailingNewline?: boolean;
}
