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

**Data flow:** `apply_all.js` reads `Data_Car.str` (ForzaTech format: VALUES/KEYS sections at dynamic offsets from file header at 0x84/0x88, 660 entries linked by hash) and injects a full `CAR_NAME_MAP` object into `livery_analyzer.js`. The map generation does three things per car: (1) detects brand from ModelShort via `mfr()` and prepends to display name if missing, (2) extracts year suffix from ModelShort `'XX` pattern (e.g. `"BMW M3 '97"` → appends `'97`), (3) merges into the map JSON. `apply_all.js` also adds HTML UI features (folder column, lightbox, copyPath, toast, single/multi livery filter) and verifies duplicate detection is present. Patching is idempotent — `apply_all.js` uses guard markers to skip already-applied steps.

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

Runs after livery scan, before HTML generation. **Two-stage cascading: thumbnail fixed-anchor clustering → in-group splitting by title/desc/author.**

```
Stage 1: carCode + thumbnailFileSize (0.5% tolerance, fixed-anchor clustering)
         → candidate groups (≥2 items)
Stage 2: Within each candidate group, split by composite key "title||desc||author"
         → final duplicate groups (sub-group ≥2 items)
```

**Stage 1 — Fixed-anchor clustering (NOT sliding window):**

Group by car code → sort by thumbnail size ascending → pick smallest unassigned item as anchor → collect all items within 0.5% of the anchor → remove assigned items → repeat. This prevents chain amplification: with sliding window, five items at 100KB/100.3KB/100.6KB/100.9KB/101.2KB would all merge into one group (0.3% per step but 1.2% end-to-end); with fixed-anchor, only items within 0.5% of the anchor join, naturally breaking the chain.

Items without thumbnails (`_thumbSize === 0`) are excluded from Stage 1 entirely and will never be marked as duplicates.

**Stage 2 — Text splitting:**

Each candidate group is sub-grouped by `"${title}||${desc}||${author}"`. Only sub-groups with ≥2 items become final duplicate groups.

**Design rationale:**
- Author IS included in the split key: different players downloading the same popular livery should NOT be merged (different save sources). Conversely, the same author creating variant liveries (e.g. "Red v1" vs "Red v2") with different titles/descs should also stay separate.
- Title and description compared exactly (no case folding, no whitespace normalization).
- Items with all-empty title + desc + author share key `"||||"` and will match each other — text-less liveries are judged purely by thumbnail proximity.

Final groups assigned 1-based IDs; non-duplicates get ID 0.

**After duplicate detection**, `carUniqueSets` is computed: for each car code, count unique liveries where same `_dupGroup` → 1 type, `_dupGroup === 0` items each count separately. This feeds the `data-car-unique` attribute on each `<tr>`, which powers the single/multi livery filter buttons in the UI.

## Key Technical Details

- **⚠️ 游戏文件只读原则**：绝对禁止直接操作游戏安装目录下的任何文件（`E:\Application\steamapps\common\ForzaHorizon6\` 及其子目录）。当需要检查或解析游戏文件时，必须先将目标文件复制到项目目录（如 `tmp_strings/` 或项目根目录），再对副本进行操作。这包括但不限于：读取、解析、解压、修改游戏文件。唯一例外是 `Data_Car.str`（已存在于项目根目录）。

- **`Data_Car.str` format**: ForzaTech `.str` file. Header at 0x84: `values_offset`, at 0x88: `keys_offset`. Each section has `{u32 section_size, u32 blob_size, u32 entry_count, {u32 hash, u32 blob_offset}[] entries, null-terminated string blob}`. VALUES section contains display names (660) + ModelShort strings (660); KEYS section contains `IDS_DisplayName_{code}` + `IDS_ModelShort_{code}` keys. `values[i].hash == keys[i].hash` links name to code. Offsets vary between game versions — always read from header, never hardcode.
- **Car manufacturer extraction**: `mfr()` function in `apply_all.js` matches ModelShort strings against a brand list (`BR`), abbreviation map (`FW`), and a manual fallback map (`MM`).
  - `BR`: 100+ full brand names (Ferrari, Porsche, …) matched via regex at start of ModelShort
  - `FW`: abbreviation → full name (e.g. `Chevy→Chevrolet`, `VW→Volkswagen`, `M-B→Mercedes-Benz`, `M-AMG→Mercedes-AMG`, `Lambo→Lamborghini`). **Known edge case**: single-letter dot-abbreviations like `L.`/`P.`/`N.` exist in FW but `replace(/\.$/, '')` turns `"L."` into `"L"` — this breaks lookup. Affected codes use MM entries instead; do NOT add single-letter FW keys (too broad).
  - `MM`: ~170 code→brand manual mappings for cases where brand can't be inferred from ModelShort (model-name-first MS like `"Corvette '67"`, dot-abbreviations like `"L. Countach '21"`, race cars like `"#5 Escort '77"`).
- **ModelShort index**: ModelShort strings follow DisplayName strings in VALUES section. Use dynamic `+dsCount` (actual DisplayName count), never hardcode `+651` — it changes when the game adds cars.
- **Year suffix from ModelShort**: `apply_all.js` extracts the year from ModelShort's trailing `'XX` pattern (e.g. `"BMW M3 '97"` → `'97`). This is Forza's internal year delimiter and is highly reliable — ~250/660 cars have it. Cars without `'XX` in ModelShort (e.g. `"Ferrari F40"`) get no year suffix. The year is appended to the display name as-is (`'97`, `'08`, etc.). For cars with the same display name but different codes (e.g. 7 Honda Civic Type R variants), the year suffix naturally distinguishes them — all but 1 group (GR GT Prototype) are resolved.
- **Title/description/author extraction from `header`**: UTF-16LE ASCII strings extracted by `extractStrings()`. Logic:
  - `strs.length === 1` → single string is the **author** (gamertag), no custom title
  - `strs.length >= 2` → first = title, last = author, middle (after filtering "Forza Livery" sentinels) = description
  - "Forza BaseLivery"/"Forza Livery"/"Forza SoulBoundLivery" strings are cleaned from title and author
- **`apply_all.js` idempotency guards**:
  - Step 1: `existingCount !== dsCount` (entry count changed) **OR** missing `'XX` year pattern **OR** missing brand fix marker (`Porsche 911 Rallye`) — regenerates CAR_NAME_MAP. The three-condition gate catches both new cars being added and structural improvements to the map generation logic.
  - Step 2 (lightbox): `!la.includes('onclick="openLightbox(this)"')` — guards thumbnail onclick injection; CSS/div/JS are nested inside `!la.includes('id="lightbox"')`
  - Step 2 (folder column): `!la.includes('col-folder')`
  - Step 2 (copyPath): `!la.includes('function copyPath')`
  - Step 3 (dup detection): `!la.includes('data-dup-group')` (check only, not injected — update `livery_analyzer.js` from source if missing)
  - Step 4 (single/multi livery filter): `!la.includes('data-car-unique')` — injects carUniqueSets computation, data-car-unique attribute, filter buttons, JS toggle functions, and filterTable condition update
  - When any patch runs, `m=true` is set and the modified `la` is written to `livery_analyzer.js`
- **Column index mapping in HTML JS**: col 0=date, col 1=默认(file order), col 2-4=car, col 5=author. The `filterTable()` function uses `cells[2]` for car, `cells[3]` for title, `cells[5]` for author. Row-level data attributes: `data-dup-group` (0=non-dup), `data-car-unique` (unique livery count for this car). When adding/removing columns, all three (sort attrs, button colIndex args, filterTable cell indices) must be updated together.
- **Lightbox onclick injection**: The pattern in `apply_all.js` must exactly match the template literal in `livery_analyzer.js` — variable names (`thumbBase64`) and attribute structure (`alt="${escapeHtml(...)}"`) must be identical for the `la.replace()` to succeed.
- `.gitignore` excludes `*.html` (all HTML outputs, including `report.html`), `node/`, `node_modules/`, `.claude/`, `*.exe`.
