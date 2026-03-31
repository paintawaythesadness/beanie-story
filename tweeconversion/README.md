# Twee Import/Export Utilities

This repository now includes a conservative TypeScript importer and exporter for Twine `.twee` files.

The tooling preserves the current linking invariant:

- `id` stays equal to the exact Twine passage name
- `name` stays equal to the exact Twine passage name
- `displayTitle` is optional UI-only data and is never used for export
- passage bodies are imported as raw text slices between passage headers
- Twine links and passage content are not rewritten

## Install

```bash
npm install
```

## Import a `.twee` file to JSON

```bash
npm run import -- input/beanie-story.twee output/passages.json
```

This reads the Twee file, parses passage headers that begin with `:: `, preserves body content, and writes an array of passage records to JSON.

If Windows PowerShell blocks `npm.ps1`, run the same command through `cmd` instead:

```bash
cmd /c npm run import -- input/beanie-story.twee output/passages.json
```

## Export JSON back to `.twee`

```bash
npm run export -- output/passages.json output/beanie-story-roundtrip.twee
```

This writes headers using each record's `name` field and optional `meta` object. `displayTitle` is ignored during export.

## Sync CLI

Create `tweeconversion/.env` or `tweeconversion/.env.local` with:

```text
SYNC_API_BASE=http://127.0.0.1:8787
SYNC_PASSWORD=your-local-password
SYNC_PAGE_SIZE=100
```

Dry-run compare:

```bash
cmd /c npm run sync:dry -- .\output\passages.json
```

Push changed or new passages:

```bash
cmd /c npm run sync:push -- .\output\passages.json
```

Pull all Worker/KV passages back to JSON (json is in output):

```bash
cmd /c npm run sync:pull -- .\output\passages-from-kv.json
```

## File Layout

```text
src/
  cli/
    export-twee.ts
    import-twee.ts
  exporter.ts
  parser.ts
  types.ts
```
