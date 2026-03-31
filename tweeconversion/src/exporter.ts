import { ExportTweeOptions, PassageRecord } from "./types.js";

export function exportTwee(passages: PassageRecord[], options: ExportTweeOptions = {}): string {
  const newline = options.newline ?? "\n";
  const ensureTrailingNewline = options.ensureTrailingNewline ?? true;
  let serialized = "";

  for (let index = 0; index < passages.length; index += 1) {
    const passage = passages[index];
    const isLastPassage = index === passages.length - 1;
    serialized += serializePassage(passage, newline);

    if (!isLastPassage) {
      serialized += separatorAfterPassage(passage.content, newline);
    }
  }

  if (ensureTrailingNewline && serialized.length > 0 && !endsWithLineBreak(serialized)) {
    serialized += newline;
  }

  return serialized;
}

function serializePassage(passage: PassageRecord, newline: string): string {
  const header = buildHeaderLine(passage);
  // Passage content is emitted exactly as stored so links, spacing, and
  // internal line breaks are not rewritten during export.
  const content = passage.content;

  return content.length > 0 ? `${header}${newline}${content}` : header;
}

function buildHeaderLine(passage: PassageRecord): string {
  const meta = passage.meta ?? {};
  const hasMeta = Object.keys(meta).length > 0;

  if (!hasMeta) {
    return `:: ${passage.name}`;
  }

  return `:: ${passage.name} ${JSON.stringify(meta)}`;
}

function separatorAfterPassage(content: string, newline: string): string {
  if (content.length === 0 || !endsWithLineBreak(content)) {
    return newline;
  }

  return "";
}

function endsWithLineBreak(text: string): boolean {
  return text.endsWith("\n") || text.endsWith("\r");
}
