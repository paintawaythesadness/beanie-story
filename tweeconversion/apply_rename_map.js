const fs = require("fs");

const inputFile = "beanie-story.twee";
const mapFile = "rename_map.csv";
const outputFile = "beanie-story.cleaned.twee";

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function loadRenameMap(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  const map = new Map();

  for (let i = 1; i < lines.length; i++) {
    const [oldId, newId] = parseCsvLine(lines[i]);
    if (!oldId || !newId) continue;
    map.set(oldId.trim(), newId.trim());
  }

  return map;
}

let content = fs.readFileSync(inputFile, "utf8");
const csvText = fs.readFileSync(mapFile, "utf8");
const renameMap = loadRenameMap(csvText);

// 1. Replace bare links: [[Old Long Text]] -> [[Old Long Text->NewShortId]]
for (const [oldId, newId] of renameMap.entries()) {
  const escapedOld = escapeRegex(oldId);
  const bareLinkPattern = new RegExp(`\\[\\[${escapedOld}\\]\\]`, "g");
  content = content.replace(bareLinkPattern, `[[${oldId}->${newId}]]`);
}

// 2. Replace explicit link targets if any already point to the long old ID
//    [[Visible text->Old Long Text]] -> [[Visible text->NewShortId]]
for (const [oldId, newId] of renameMap.entries()) {
  const escapedOld = escapeRegex(oldId);
  const explicitTargetPattern = new RegExp(`(\\[\\[[^\\]]+->)${escapedOld}(\\]\\])`, "g");
  content = content.replace(explicitTargetPattern, `$1${newId}$2`);
}

// 3. Rename passage headers exactly: :: Old Long Text -> :: NewShortId
for (const [oldId, newId] of renameMap.entries()) {
  const escapedOld = escapeRegex(oldId);
  const headerPattern = new RegExp(`(^::\\s+)${escapedOld}(\\s*$)`, "gm");
  content = content.replace(headerPattern, `$1${newId}$2`);
}

fs.writeFileSync(outputFile, content, "utf8");

console.log(`Created ${outputFile}`);
console.log("Open it in Twine or a text editor and sanity-check links + passage headers.");