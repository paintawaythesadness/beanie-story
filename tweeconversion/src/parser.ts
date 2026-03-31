import { ParseTweeOptions, ParseTweeResult, PassageMeta, PassageRecord, TweeWarning } from "./types.js";

interface HeaderParseResult {
  name: string;
  meta: PassageMeta;
  warning?: TweeWarning;
}

interface HeaderMatch {
  index: number;
  lineNumber: number;
  rawLine: string;
}

const HEADER_PATTERN = /^:: .*/gm;

export function parseTwee(text: string, options: ParseTweeOptions = {}): PassageRecord[] {
  return parseTweeWithWarnings(text, options).passages;
}

export function parseTweeWithWarnings(text: string, options: ParseTweeOptions = {}): ParseTweeResult {
  const warnings: TweeWarning[] = [];
  const passages: PassageRecord[] = [];
  const seenIds = new Set<string>();
  const modifiedAt = resolveModifiedAt(options.modifiedAt);
  const headers = collectHeaderMatches(text);

  if (headers.length === 0) {
    return { passages, warnings };
  }

  if (headers[0].index > 0) {
    warnings.push({
      type: "text-before-first-header",
      message: "Found text before the first passage header. It was not imported into a passage.",
      line: 1
    });
  }

  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    const nextHeader = headers[index + 1];
    const bodyStart = skipSingleLineBreak(text, header.index + header.rawLine.length);
    const bodyEnd = nextHeader ? nextHeader.index : text.length;
    const content = text.slice(bodyStart, bodyEnd);

    const parsedHeader = parseHeaderLine(header.rawLine, header.lineNumber);
    if (parsedHeader.warning) {
      warnings.push(parsedHeader.warning);
    }

    if (!parsedHeader.name) {
      warnings.push({
        type: "missing-name",
        message: `Passage header on line ${header.lineNumber} is missing a passage name.`,
        line: header.lineNumber,
        header: header.rawLine
      });
    }

    if (seenIds.has(parsedHeader.name)) {
      warnings.push({
        type: "duplicate-id",
        message: `Duplicate passage id "${parsedHeader.name}" found on line ${header.lineNumber}.`,
        line: header.lineNumber,
        passageName: parsedHeader.name
      });
    } else {
      seenIds.add(parsedHeader.name);
    }

    passages.push({
      id: parsedHeader.name,
      name: parsedHeader.name,
      content,
      meta: parsedHeader.meta,
      modifiedAt
    });
  }

  return { passages, warnings };
}

function resolveModifiedAt(input?: string | (() => string)): string {
  if (typeof input === "function") {
    return input();
  }

  if (typeof input === "string") {
    return input;
  }

  return new Date().toISOString();
}

function collectHeaderMatches(text: string): HeaderMatch[] {
  const matches: HeaderMatch[] = [];
  let match: RegExpExecArray | null;
  let previousIndex = 0;
  let currentLine = 1;

  HEADER_PATTERN.lastIndex = 0;

  while ((match = HEADER_PATTERN.exec(text)) !== null) {
    currentLine += countNewlines(text.slice(previousIndex, match.index));
    matches.push({
      index: match.index,
      lineNumber: currentLine,
      rawLine: match[0]
    });
    previousIndex = match.index;
  }

  return matches;
}

function countNewlines(text: string): number {
  let count = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      count += 1;
    }
  }

  return count;
}

function skipSingleLineBreak(text: string, index: number): number {
  if (text.startsWith("\r\n", index)) {
    return index + 2;
  }

  if (text[index] === "\n" || text[index] === "\r") {
    return index + 1;
  }

  return index;
}

function parseHeaderLine(rawLine: string, lineNumber: number): HeaderParseResult {
  const headerContent = rawLine.slice(3);
  const metadataCandidate = splitHeaderAndMetadata(headerContent);

  if (!metadataCandidate) {
    return {
      name: headerContent,
      meta: {}
    };
  }

  try {
    const parsed = JSON.parse(metadataCandidate.metaText) as unknown;

    if (!isPlainObject(parsed)) {
      return {
        name: headerContent,
        meta: {},
        warning: {
          type: "malformed-metadata",
          message: `Metadata on line ${lineNumber} is not a JSON object. The full header was kept as the passage name.`,
          line: lineNumber,
          header: rawLine
        }
      };
    }

    return {
      name: metadataCandidate.name,
      meta: parsed
    };
  } catch {
    return {
      name: headerContent,
      meta: {},
      warning: {
        type: "malformed-metadata",
        message: `Metadata JSON on line ${lineNumber} could not be parsed. The full header was kept as the passage name.`,
        line: lineNumber,
        header: rawLine
      }
    };
  }
}

function splitHeaderAndMetadata(headerContent: string): { name: string; metaText: string } | null {
  // Metadata is only treated as metadata when the header ends with a valid
  // JSON object suffix separated from the name by whitespace.
  let end = headerContent.length - 1;
  while (end >= 0 && isWhitespace(headerContent[end])) {
    end -= 1;
  }

  if (end < 0 || headerContent[end] !== "}") {
    return null;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = end; index >= 0; index -= 1) {
    const char = headerContent[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === "\\") {
        isEscaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "}") {
      depth += 1;
      continue;
    }

    if (char === "{") {
      depth -= 1;

      if (depth === 0) {
        if (index === 0 || !isWhitespace(headerContent[index - 1])) {
          return null;
        }

        const name = headerContent.slice(0, index).trimEnd();
        const metaText = headerContent.slice(index, end + 1);
        return { name, metaText };
      }

      continue;
    }
  }

  return null;
}

function isWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t";
}

function isPlainObject(value: unknown): value is PassageMeta {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
