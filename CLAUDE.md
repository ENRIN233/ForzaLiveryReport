# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A self-contained Forza Horizon 6 livery analysis tool. Double-click `启动.bat` → scans game save → generates an interactive HTML report with search, sort, folder-opening, and click-to-zoom thumbnails. Requires Node.js; no other dependencies.

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
```

**Data flow:** `apply_all.js` reads `Data_Car.str` (ForzaTech format: VALUES/KEYS sections at offsets 0x8C/0x7358, 651 entries linked by hash) and injects a full `CAR_NAME_MAP` object into `livery_analyzer.js`. It also adds HTML features (folder column, lightbox, copyPath, toast). This patching is idempotent — `apply_all.js` skips steps already applied.

**Scan flow:** `livery_analyzer.js` auto-detects the save at `C:\XboxGames\GameSave\pgs\u_*\current\ContainersRoot`, reads each `Livery_{code}_{timestamp}/` folder (`header` for title/author, `bigThumb.webp` for thumbnail), resolves car names from `CAR_NAME_MAP`, and emits a fully self-contained HTML (inline CSS + JS, base64 thumbnails).

**Key technical details:**
- `Data_Car.str` is a ForzaTech `.str` file. Header at 0x84: `values_offset`, at 0x88: `keys_offset`. Each section has `{u32 section_size, u32 blob_size, u32 entry_count, {u32 hash, u32 blob_offset}[] entries, null-terminated string blob}`. VALUES section contains display names; KEYS section contains `IDS_DisplayName_{code}` keys. `values[i].hash == keys[i].hash` links name to code.
- Car manufacturer names are extracted from ModelShort entries (index 651+ in VALUES section) via brand pattern matching with abbreviations expanded.
- The HTML report uses `data-sort-*` attributes on `<tr>` for sortable columns, `file:///` links for folder opening with clipboard fallback, and a CSS lightbox for thumbnail zoom.
