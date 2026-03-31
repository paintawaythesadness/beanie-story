export interface TwineLinkTarget {
  label?: string;
  target: string;
}

const LINK_PATTERN = /\[\[([^[\]]+)\]\]/g;

export function extractTwineLinkTargets(content: string): TwineLinkTarget[] {
  const results: TwineLinkTarget[] = [];
  const seenTargets = new Set<string>();
  let match: RegExpExecArray | null;

  LINK_PATTERN.lastIndex = 0;

  while ((match = LINK_PATTERN.exec(content)) !== null) {
    const parsed = parseLinkBody(match[1]);
    if (!parsed || seenTargets.has(parsed.target)) {
      continue;
    }

    seenTargets.add(parsed.target);
    results.push(parsed);
  }

  return results;
}

function parseLinkBody(rawBody: string): TwineLinkTarget | null {
  const body = rawBody.trim();
  if (!body) {
    return null;
  }

  if (body.includes("->")) {
    const [label, target] = splitOnce(body, "->");
    return normalizeLink(label, target);
  }

  if (body.includes("<-")) {
    const [target, label] = splitOnce(body, "<-");
    return normalizeLink(label, target);
  }

  if (body.includes("|")) {
    const [label, target] = splitOnce(body, "|");
    return normalizeLink(label, target);
  }

  return normalizeLink(undefined, body);
}

function normalizeLink(label: string | undefined, target: string | undefined): TwineLinkTarget | null {
  const normalizedTarget = target?.trim();
  if (!normalizedTarget) {
    return null;
  }

  const normalizedLabel = label?.trim();
  return normalizedLabel && normalizedLabel !== normalizedTarget
    ? { label: normalizedLabel, target: normalizedTarget }
    : { target: normalizedTarget };
}

function splitOnce(value: string, separator: string): [string, string] {
  const index = value.indexOf(separator);
  if (index < 0) {
    return [value, ""];
  }

  return [value.slice(0, index), value.slice(index + separator.length)];
}
