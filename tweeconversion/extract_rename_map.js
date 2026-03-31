const fs = require("fs");

const inputFile = "beanie-story.twee";
const outputCsv = "rename_map.csv";

// Finds links like [[Some long target]]
// but skips links already using [[text->target]]
// and skips simple short targets that already look manageable.

function looksManageable(text) {
  return /^[A-Za-z0-9_-]{1,40}$/.test(text);
}

function makeSuggestion(text) {
  // Remove smart quotes and punctuation, keep words
  const cleaned = text
    .replace(/[“”‘’"'`]/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = cleaned.split(" ").filter(Boolean);

  // Keep first 3–5 useful words
  const suggestion = words
    .slice(0, 5)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

  return suggestion || "RenameMe";
}

const content = fs.readFileSync(inputFile, "utf8");
const linkRegex = /\[\[([^\]]+)\]\]/g;

const found = new Map();
let match;

while ((match = linkRegex.exec(content)) !== null) {
  const raw = match[1].trim();

  // Skip already explicit links like [[text->target]]
  if (raw.includes("->")) continue;

  // Skip already-manageable bare targets
  if (looksManageable(raw)) continue;

  if (!found.has(raw)) {
    found.set(raw, makeSuggestion(raw));
  }
}

let csv = "old_id,new_id\n";
for (const [oldId, newId] of found.entries()) {
  // Escape double quotes for CSV
  const escapedOld = `"${oldId.replace(/"/g, '""')}"`;
  const escapedNew = `"${newId.replace(/"/g, '""')}"`;
  csv += `${escapedOld},${escapedNew}\n`;
}

fs.writeFileSync(outputCsv, csv, "utf8");

console.log(`Created ${outputCsv} with ${found.size} entries.`);
console.log("Review the new_id column, then run apply_rename_map.js");