# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A self-contained Forza Horizon 6 livery analysis tool. Double-click `启动.bat` → scans game save → generates an interactive HTML report with search, sort, folder-opening, click-to-zoom thumbnails, and **duplicate livery detection with filtering**. Requires Node.js; no other dependencies.

GitHub: https://github.com/ENRIN233/ForzaLiveryReport

## Commands

```bash
# Normal use (double-click 启动.bat, or):
node apply_all.js          # one-time: injects 651-entry car map + HTML features into livery_analyzer.js
node livery_analyzer.js    # scans save, outputs report.html
node livery_analyzer.js "<path/to/ContainersRoot>" "output.html"  # custom paths
```

## Architecture

```
ForzaLiveryReport/
  Data_Car.str          ← ForzaTech binary string table (651 car names for FH6)
  apply_all.js          ← Setup patcher: reads Data_Car.str, injects CAR_NAME_MAP + UI features
  livery_analyzer.js    ← Main tool: auto-detects save, scans liveries, builds HTML report
  启动.bat              ← Double-click launcher (runs apply_all → livery_analyzer → opens report)
  package.json          ← Only for pkg compilation (unused at runtime)
  node/                 ← Portable Node.js runtime (bundled for users without Node.js installed)
```

**Data flow:** `apply_all.js` reads `Data_Car.str` (ForzaTech format: VALUES/KEYS sections at offsets 0x8C/0x7358, 651 entries linked by hash) and injects a full `CAR_NAME_MAP` object into `livery_analyzer.js`. It also adds HTML features (folder column, lightbox, copyPath, toast, duplicate detection). Patching is idempotent — `apply_all.js` skips steps already applied.

**Scan flow:** `livery_analyzer.js` auto-detects the save at `C:\XboxGames\GameSave\pgs\u_*\current\ContainersRoot`, reads each `Livery_{code}_{timestamp}/` folder (`header` for title/description/author, `bigThumb.webp` for thumbnail), resolves car names from `CAR_NAME_MAP`, runs duplicate detection, and emits a fully self-contained HTML (inline CSS + JS, base64 thumbnails).

**HTML features (inline CSS + JS):**
- Search filter (car / title / author)
- Sort by date / car / author with direction toggle
- Lightbox thumbnail zoom (click to enlarge)
- Folder link with clipboard fallback + toast notification
- Duplicate group highlighting (8-color left border + background)
- "仅重复" toggle button to filter only duplicate rows (composable with search)

## Duplicate Detection Algorithm

Runs after livery scan, before HTML generation. **Three-track parallel grouping → union-find merge → BFS connected components:**

```
Track 1: carCode + thumbnailFileSize   → high confidence (thumbSize > 0)
Track 2: carCode + title               → medium confidence (title non-empty)
Track 3: carCode + description         → medium confidence (desc non-empty)

Tracks 2 & 3 skip items where both title and description are empty.
Each track independently produces groups of ≥2 items.
Groups across tracks are merged via adjacency graph + BFS connected components.
Final groups assigned 1-based IDs; non-duplicates get ID 0.
```

In HTML, each `<tr>` gets `data-dup-group="N"` (0 = no dup) and `class="dup-row dup-group-N"`. CSS cycles 8 colors. JS `toggleDupFilter()` toggles between all rows and duplicate-only, composable with the search filter (`matchesSearch && (!dupFilterActive || isDup)`).

## Key Technical Details

- `Data_Car.str` is a ForzaTech `.str` file. Header at 0x84: `values_offset`, at 0x88: `keys_offset`. Each section has `{u32 section_size, u32 blob_size, u32 entry_count, {u32 hash, u32 blob_offset}[] entries, null-terminated string blob}`. VALUES section contains display names; KEYS section contains `IDS_DisplayName_{code}` keys. `values[i].hash == keys[i].hash` links name to code.
- Car manufacturer names are extracted from ModelShort entries (index 651+ in VALUES section) via brand pattern matching with abbreviations expanded.
- Title/description/author extraction from `header` file: first UTF-16LE string = title, last = author, middle (after filtering "Forza Livery" sentinels) = description.
- `apply_all.js` Step 1 checks `entryCount < 600` before regenerating CAR_NAME_MAP. Step 2 checks for `col-folder`, `id="lightbox"`, `function copyPath` markers. Step 3 checks for `data-dup-group` marker.
- `.gitignore` excludes `report.html`, `node/`, `node_modules/`, `.claude/`, `*.exe`.
- The `node/` directory contains a portable Node.js v18 runtime; `启动.bat` adds it to PATH so users without Node.js can run the tool.
