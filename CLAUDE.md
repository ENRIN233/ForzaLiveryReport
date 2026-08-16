# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A self-contained Forza Horizon 6 livery analysis tool. Double-click `AAA双击启动.bat` → scans game save → generates an interactive HTML report with search, sort (default/file-order, date, car, author), thumbnail zoom, folder-opening, **game-position column**, and **duplicate livery detection with filtering**. Requires Node.js; no other dependencies.

GitHub: https://github.com/ENRIN233/ForzaLiveryReport

## Commands

```bash
# Normal use (double-click AAA双击启动.bat, or):
node apply_all.js          # injects 660-entry car map (brand prefix + year suffix) + UI features
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

**Data flow:** `apply_all.js` reads `Data_Car.str` (ForzaTech format: VALUES/KEYS sections at dynamic offsets from file header at 0x84/0x88, 660 entries linked by hash) and injects a full `CAR_NAME_MAP` object into `livery_analyzer.js`. The map generation does three things per car: (1) detects brand from ModelShort via `mfr()` and prepends to display name if missing, (2) extracts year suffix from ModelShort (`'XX` or ` XX` format, with false-positive exclusion), (3) merges into the map JSON. `apply_all.js` also adds HTML UI features (folder column, lightbox, copyPath, toast, single/multi livery filter) and verifies duplicate detection is present. Patching is idempotent — `apply_all.js` uses guard markers to skip already-applied steps.

**Scan flow:** `livery_analyzer.js` auto-detects the save at `C:\XboxGames\GameSave\pgs\u_*\current\ContainersRoot` (selects the profile with the most `Livery_*` folders), reads each `Livery_{code}_{timestamp}/` folder (`header` for title/description/author, `bigThumb.webp` for thumbnail), resolves car names from `CAR_NAME_MAP`, runs duplicate detection, and emits a fully self-contained HTML (inline CSS + JS, base64 thumbnails).

**HTML features (inline CSS + JS):**
- Search filter (car / title / author)
- Sort by 默认 (file order, default) / date / car / author with direction toggle
- 游戏内位置 column between date and car (format: `{N}列{M}个`, 2 items per column)
- Lightbox thumbnail zoom (click to enlarge)
- Folder link with clipboard fallback + toast notification
- Duplicate group highlighting (8-color left border + background)
- "仅重复" toggle button to filter only duplicate rows (composable with search)
- "仅单涂装" / "多涂装" toggle buttons — filter cars with exactly 1 vs. 2+ unique liveries (duplicates count as 1 type); mutually exclusive, composable with search + dup filter

## Duplicate Detection Algorithm

**GUID-based. Single criterion: same design GUID = duplicate.**

The `header` file's last 16 bytes are the game-assigned design GUID (128-bit design ID). `parseHeader()` returns it as `guid`; the scan phase stores it as `d.guid` on each livery item.

```
Group by d.guid → groups with ≥2 items = duplicate groups
```

- Same GUID = same design = duplicate (exact, unambiguous). Different designs always have different GUIDs, even if title/author/thumbnail coincidentally match.
- The old dual-path heuristic (thumbnail-size clustering + text matching + union-find) was removed in v1.5 — GUID replaces it entirely.
- Items with missing header or header <16 bytes have empty `guid` and are excluded from duplicate detection (defensive; empirically 100% coverage).
- Final groups assigned 1-based IDs via `_dupGroup`; non-duplicates get ID 0.

## Version Variant Detection Algorithm

**Parallel to duplicate detection, independent (non-crossing) marking.** A livery can belong to both a dup group and a variant group simultaneously.

```
normalizeVersion(title) strips version tokens:
  - v/V/ver/ver./version + digits (v2, V2, ver2, version2, V.3)
  - final/FINAL/rev + digits (final2, FINAL2, rev1)
  - decimal versions \d+\.\d+ (3.0, 2.0, 1.5)
  → collapse whitespace, trim. Does NOT match trailing bare digits (high false-positive risk).

Grouping:
  bucket = carCode + '|' + author (author empty → skip)
  → sub-group by normalizeVersion(title) (base title)
  → sub-group ≥2 items AND ≥2 distinct raw titles → variant group
     (the distinct-titles gate excludes exact duplicates from variant groups)

Row attribute: data-variant-group (1-based, 0=none), parallel to data-dup-group.
```

Key details:
- Version token can be mid-title (`miku V2 lim` → `miku lim`); whitespace collapse handles it.
- Bare `v`+digit regex theoretically strips engine designations (V8/V12), but empirically zero such titles exist in livery titles (300 scanned) — all `v`+digit matches are real versions. Documented as latent risk.
- Variant groups are NOT visually highlighted (no border/background) — only the "仅变体" filter button surfaces them. Visual highlighting remains dup-only to avoid one row carrying two highlight schemes. Variant filtering composes with search + dup + single/multi filters in `filterTable()`.
- `apply_all.js` Step 5 is check-only (like Step 3): detects `data-variant-group` presence, does not inject logic. Variant detection lives in `livery_analyzer.js` source.

## Key Technical Details

- **⚠️ 游戏文件只读原则**：绝对禁止直接操作游戏安装目录下的任何文件（`E:\Application\steamapps\common\ForzaHorizon6\` 及其子目录）。当需要检查或解析游戏文件时，必须先将目标文件复制到项目目录（如 `tmp_strings/` 或项目根目录），再对副本进行操作。这包括但不限于：读取、解析、解压、修改游戏文件。唯一例外是 `Data_Car.str`（已存在于项目根目录）。

- **`Data_Car.str` format**: ForzaTech `.str` file. Header at 0x84: `values_offset`, at 0x88: `keys_offset`. Each section has `{u32 section_size, u32 blob_size, u32 entry_count, {u32 hash, u32 blob_offset}[] entries, null-terminated string blob}`. VALUES section contains display names (660) + ModelShort strings (660); KEYS section contains `IDS_DisplayName_{code}` + `IDS_ModelShort_{code}` keys. `values[i].hash == keys[i].hash` links name to code. Offsets vary between game versions — always read from header, never hardcode.
- **Car manufacturer extraction**: `mfr()` function in `apply_all.js` matches ModelShort strings against a brand list (`BR`), abbreviation map (`FW`), and a manual fallback map (`MM`).
  - `BR`: 100+ full brand names (Ferrari, Porsche, …) matched via regex at start of ModelShort. Does NOT match ModelShorts that start with `#` (race-number cars).
  - `FW`: abbreviation → full name (e.g. `Chevy→Chevrolet`, `VW→Volkswagen`, `M-B→Mercedes-Benz`, `M-AMG→Mercedes-AMG`, `Lambo→Lamborghini`). **Known edge case**: single-letter dot-abbreviations like `L.`/`P.`/`N.` exist in FW but `replace(/\.$/, '')` turns `"L."` into `"L"` — this breaks lookup. Affected codes use MM entries instead; do NOT add single-letter FW keys (too broad).
  - `MM`: manual code→brand mappings for cases where brand can't be inferred from ModelShort. This covers: model-name-first MS like `"Corvette '67"`, dot-abbreviations like `"L. Countach '21"`, race cars like `"#5 Escort '77"`, **all Formula Drift cars** (13 codes, brand = `Formula Drift`), **all #-prefixed race-number cars** (25 codes for brands like Alumicraft, RJ Anderson, Casey Currie Motorsports, Jimco, etc.), and other edge cases. Total ~200 MM entries.
- **ModelShort index**: ModelShort strings follow DisplayName strings in VALUES section. Use dynamic `+dsCount` (actual DisplayName count), never hardcode `+651` — it changes when the game adds cars.
- **Year suffix from ModelShort**: `apply_all.js` extracts the year from ModelShort using two patterns: (1) `'XX` trailing single-quote format (e.g. `"BMW M3 '97"` → `'97`), the most common; (2) ` XX` trailing space+digits format without single quote (e.g. `"P. 911 GT3 RS 23"` → `'23`). The second pattern is only applied if the two-digit number does NOT already appear in the DisplayName (word-boundary check), which excludes false positives like `"TVR Speed 12"` (V12 engine), `"M-B G 65"` (AMG 6.5L), `"Toyota 86"` (model name). Both formats produce the same output: `'XX` appended to the name.
- **Title/description/author extraction from `header`**: `header` is a ForzaTech binary container; strings are stored as **u32 length prefix + UTF-16LE code units** (NOT null-terminated ASCII). `parseHeader()` decodes three fields:
  - **Title** — u32 length at byte offset 4, chars at offset 8. Every livery has a title field; the game writes the `"Forza Livery"` sentinel when there is no custom title.
  - **Description** — u32 length immediately following the title chars (length 0 = no description).
  - **Author** — located in the trailing binary area via anchor `u16 == 9`, then u32 length, then `len` UTF-16 units that are all "plausible text" (`isTextUnit` = ASCII/Latin/CJK flags/kana/Hangul ranges). Empirically verified on the whole save (found on 115/115 headers).
  - Sentinel cleaning: the **title is shown as-is** — the game's default title `"Forza Livery"` (written when a livery has no custom name) is displayed, not blanked; only `"Forza BaseLivery"` / `"Forza SoulBoundLivery"` are still blanked from title (they never occur in `Livery_` folders, kept as a safety net). The author and description are still cleaned: sentinels are blanked from author, and a description equal to the title/author or a sentinel is blanked.
  - The previous `extractStrings()` (scan for high-byte-zero ASCII runs) was replaced: it dropped non-ASCII (Chinese/Japanese) titles & descriptions (each multi-byte char has a non-zero high byte, terminating the scan) and could bleed the next length-prefix byte into a string's tail (e.g. `"Hatsune Miku%"`, `"AMIYA "`).
- **`apply_all.js` idempotency guards**:
  - Step 1: `existingCount !== dsCount` (entry count changed) **OR** missing `'XX` year pattern in map **OR** missing brand fix marker (`Porsche 911 Rallye`) **OR** missing year fix marker (`911 GT3 RS '23`) **OR** missing Formula Drift marker (`Formula Drift #98 BMW`) **OR** missing #-car brand marker (`Alumicraft #122 Class 1`) — regenerates CAR_NAME_MAP. The multi-condition gate catches new car additions and structural improvements to the map generation logic.
  - Step 2 (lightbox): `!la.includes('onclick="openLightbox(this)"')` — guards thumbnail onclick injection; CSS/div/JS are nested inside `!la.includes('id="lightbox"')`
  - Step 2 (folder column): `!la.includes('col-folder')`
  - Step 2 (copyPath): `!la.includes('function copyPath')`
  - Step 3 (dup detection): `!la.includes('data-dup-group')` (check only, not injected — update `livery_analyzer.js` from source if missing)
  - Step 4 (single/multi livery filter): `!la.includes('data-car-unique')` — injects carUniqueSets computation, data-car-unique attribute, filter buttons, JS toggle functions, and filterTable condition update
  - When any patch runs, `m=true` is set and the modified `la` is written to `livery_analyzer.js`
- **Column index mapping in HTML JS**: col 0=date, col 1=默认(file order), col 2-4=car, col 5=author. The `filterTable()` function uses `cells[2]` for car, `cells[3]` for title, `cells[5]` for author. Row-level data attributes: `data-dup-group` (0=non-dup), `data-car-unique` (unique livery count for this car). When adding/removing columns, all three (sort attrs, button colIndex args, filterTable cell indices) must be updated together.
- **Lightbox onclick injection**: The pattern in `apply_all.js` must exactly match the template literal in `livery_analyzer.js` — variable names (`thumbBase64`) and attribute structure (`alt="${escapeHtml(...)}"`) must be identical for the `la.replace()` to succeed.
- `.gitignore` excludes `*.html` (all HTML outputs, including `report.html`), `node/`, `node_modules/`, `.claude/`, `*.exe`.
