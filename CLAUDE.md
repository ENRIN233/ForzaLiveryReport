# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A self-contained Forza Horizon 6 livery analysis tool. Double-click `AAA双击启动.bat` → scans game save → generates an interactive HTML report with search, sort (default/file-order, date, car, author), thumbnail zoom, folder-opening, **game-position column**, and **duplicate livery detection with filtering**. Requires Node.js; no other dependencies.

GitHub: https://github.com/ENRIN233/ForzaLiveryReport

## Commands

```bash
# Normal use (double-click AAA双击启动.bat, or):
node apply_all.js          # injects 660-entry car map + HTML features into livery_analyzer.js
node livery_analyzer.js    # scans save, outputs report.html
node livery_analyzer.js "<path/to/ContainersRoot>" "output.html"  # custom paths
```

## Architecture

```
ForzaLiveryReport/
  Data_Car.str          ← ForzaTech binary string table (660 car names for FH6)
  apply_all.js          ← Setup patcher: reads Data_Car.str, injects CAR_NAME_MAP + UI features
  livery_analyzer.js    ← Main tool: auto-detects save, scans liveries, builds HTML report
  AAA双击启动.bat        ← Double-click launcher (apply_all → livery_analyzer → opens report)
  更新日志.md            ← Version changelog
  package.json          ← Only for pkg compilation (unused at runtime)
  node/                 ← Portable Node.js v18 runtime (bundled for users without Node.js)
```

**Data flow:** `apply_all.js` reads `Data_Car.str` (ForzaTech format: VALUES/KEYS sections at dynamic offsets from file header at 0x84/0x88, 660 entries linked by hash) and injects a full `CAR_NAME_MAP` object into `livery_analyzer.js`. It also adds HTML features (folder column, lightbox, copyPath, toast, duplicate detection). Patching is idempotent — `apply_all.js` uses guard markers to skip already-applied steps.

**Scan flow:** `livery_analyzer.js` auto-detects the save at `C:\XboxGames\GameSave\pgs\u_*\current\ContainersRoot` (selects the profile with the most `Livery_*` folders), reads each `Livery_{code}_{timestamp}/` folder (`header` for title/description/author, `bigThumb.webp` for thumbnail), resolves car names from `CAR_NAME_MAP`, runs duplicate detection, and emits a fully self-contained HTML (inline CSS + JS, base64 thumbnails).

**HTML features (inline CSS + JS):**
- Search filter (car / title / author)
- Sort by 默认 (file order, default) / date / car / author with direction toggle
- 游戏内位置 column between date and car (format: `{N}列{M}个`, 2 items per column)
- Lightbox thumbnail zoom (click to enlarge)
- Folder link with clipboard fallback + toast notification
- Duplicate group highlighting (8-color left border + background)
- "仅重复" toggle button to filter only duplicate rows (composable with search)

## Duplicate Detection Algorithm

Runs after livery scan, before HTML generation. **Three-track parallel grouping → adjacency graph → BFS connected components:**

```
Track 1: carCode + thumbnailFileSize (0.5% tolerance) → WebP encoding non-deterministic
Track 2: carCode + title                              → medium confidence
Track 3: carCode + description                        → medium confidence

Track 1 uses a tolerance-based clustering (group by car code → sort by size → sliding window
with 0.5% relative threshold) because WebP compression produces slightly different byte counts
(20-200 bytes) for identical liveries. Exact byte comparison would yield zero hits.

Tracks 2 & 3 skip items where both title and description are empty.
Each track independently produces groups of ≥2 items.
Groups across tracks are merged via adjacency graph + BFS connected components.
Final groups assigned 1-based IDs; non-duplicates get ID 0.
```

In HTML, each `<tr>` gets `data-dup-group="N"` (0 = no dup) and `class="dup-row dup-group-N"`. CSS cycles 8 colors. JS `toggleDupFilter()` toggles between all rows and duplicate-only, composable with the search filter (`matchesSearch && (!dupFilterActive || isDup)`).

## Key Technical Details

- **`Data_Car.str` format**: ForzaTech `.str` file. Header at 0x84: `values_offset`, at 0x88: `keys_offset`. Each section has `{u32 section_size, u32 blob_size, u32 entry_count, {u32 hash, u32 blob_offset}[] entries, null-terminated string blob}`. VALUES section contains display names (660) + ModelShort strings (660); KEYS section contains `IDS_DisplayName_{code}` + `IDS_ModelShort_{code}` keys. `values[i].hash == keys[i].hash` links name to code. Offsets vary between game versions — always read from header, never hardcode.
- **Car manufacturer extraction**: `mfr()` function in `apply_all.js` matches ModelShort strings against a brand list (`BR`), abbreviation map (`FW`), and a manual fallback map (`MM`) for edge cases (e.g. "Chev." → Chevrolet, "Starion ESI-R" → Mitsubishi). New cars without clear brand patterns need `MM` entries.
- **ModelShort index**: ModelShort strings follow DisplayName strings in VALUES section. Use dynamic `+dsCount` (actual DisplayName count), never hardcode `+651` — it changes when the game adds cars.
- **Title/description/author extraction from `header`**: UTF-16LE ASCII strings extracted by `extractStrings()`. Logic:
  - `strs.length === 1` → single string is the **author** (gamertag), no custom title
  - `strs.length >= 2` → first = title, last = author, middle (after filtering "Forza Livery" sentinels) = description
  - "Forza BaseLivery"/"Forza Livery"/"Forza SoulBoundLivery" strings are cleaned from title and author
- **`apply_all.js` idempotency guards**:
  - Step 1: `existingCount !== dsCount` — regenerates CAR_NAME_MAP only when entry count mismatches Data_Car.str
  - Step 2 (lightbox): `!la.includes('onclick="openLightbox(this)"')` — guards thumbnail onclick injection; CSS/div/JS are nested inside `!la.includes('id="lightbox"')`
  - Step 2 (folder column): `!la.includes('col-folder')`
  - Step 2 (copyPath): `!la.includes('function copyPath')`
  - Step 3 (dup detection): `!la.includes('data-dup-group')`
  - When any patch runs, `m=true` is set and the modified `la` is written to `livery_analyzer.js`
- **Column index mapping in HTML JS**: col 0=date, col 1=默认(file order), col 2-4=car, col 5=author. The `filterTable()` function uses `cells[2]` for car, `cells[3]` for title, `cells[5]` for author. When adding/removing columns, all three (sort attrs, button colIndex args, filterTable cell indices) must be updated together.
- **Lightbox onclick injection**: The pattern in `apply_all.js` must exactly match the template literal in `livery_analyzer.js` — variable names (`thumbBase64`) and attribute structure (`alt="${escapeHtml(...)}"`) must be identical for the `la.replace()` to succeed.
- `.gitignore` excludes `*.html` (all HTML outputs, including `report.html`), `node/`, `node_modules/`, `.claude/`, `*.exe`.
