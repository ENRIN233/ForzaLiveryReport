# 版本变体检测 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「版本变体」识别层——同车型同作者、标题仅版本号不同的涂装归为变体组，提供「仅变体」筛选按钮，与现有重复检测并行、互不交叉。

**Architecture:** 变体检测逻辑直接写入 `livery_analyzer.js` 源码（像现有 dup 检测一样是源码固有部分）。`apply_all.js` 只加一个幂等 check-only 步骤（与现有 Step 3 重复检测的处理方式一致）。归一化函数剥离标题中的版本号 token（v/V/ver/ver./version/final/rev + 数字，及小数版本 `\d+\.\d+`），同车型同作者桶内按基础标题二次分组，子组 ≥2 项且原始标题有 ≥2 种不同值才成变体组。

**Tech Stack:** Node.js（纯 JS，零依赖，单文件 `livery_analyzer.js`）；HTML 报告内置 CSS + JS。无测试框架——用独立验证脚本对真实存档跑端到端验证。

**参考 spec:** `docs/superpowers/specs/2026-08-16-version-variant-detection-design.md`

---

## File Structure

| 文件 | 责任 | 改动类型 |
|---|---|---|
| `livery_analyzer.js` | 主工具：扫描 + 检测 + HTML 生成 | 修改（插入变体检测算法 + 行属性 + 统计栏 + 筛选按钮 + toggle 函数 + filterTable 条件） |
| `apply_all.js` | 幂等 patcher | 修改（新增 Step 5 check-only） |
| `更新日志.md` | 版本变更记录 | 修改（追加 v1.4 条目） |
| `CLAUDE.md` | 项目文档 | 修改（追加 Version Variant Detection 小节） |

**无新文件**。验证用临时脚本在 Task 6 创建、用后删除（不进 git）。

---

## Task 1: 插入 normalizeVersion 函数

**Files:**
- Modify: `livery_analyzer.js`（在重复检测的「提取缩略图大小和标题」forEach 之后、`clusterByThumbSize` 函数之前插入）

**锚点说明：** `clusterByThumbSize` 函数定义在 `// ===== 路径 A：缩略图检测 =====` 注释上方。新函数插在 `clusterByThumbSize` 的定义之前，作为独立的工具函数。

- [ ] **Step 1: 插入 normalizeVersion 函数**

在 `livery_analyzer.js` 中找到这段（约 902-905 行，`clusterByThumbSize` 的注释 + 定义开头）：

```js
// 固定锚点聚类：同车型内按缩略图大小排序，以最小文件为锚点，
// 收集所有在 0.5% 容差内的项为一组，移除已分组项后重复。
// 相比滑窗相邻比较，避免了 A-B-C-D-E 链式串组的问题。
function clusterByThumbSize(items, tolerance) {
```

在 `// 固定锚点聚类` 这行注释**之前**插入：

```js
/**
 * 剥离标题中的版本号 token，返回「基础标题」。
 * 识别范围：v/V/ver/ver./version/final/FINAL/rev + 数字；小数版本 \d+\.\d+
 * 不认结尾裸数字（误判风险高）。
 */
function normalizeVersion(title) {
    if (!title) return '';
    return title
        .replace(/(?:v|ver\.?|version)\s?\.?\d+/gi, '')   // v2 / V2 / ver2 / version2 / V.3
        .replace(/(?:final|rev)\s?\d+/gi, '')               // final2 / FINAL2 / rev1
        .replace(/\d+\.\d+/g, '')                            // 3.0 / 2.0 / 1.5
        .replace(/\s+/g, ' ')                                // 塌缩多空格（移除后可能留下多余空格）
        .trim();
}

```

- [ ] **Step 2: 验证函数语法正确**

Run: `node -e "const fs=require('fs');const c=fs.readFileSync('livery_analyzer.js','utf-8');const m=require('module');new m.constructor()(c);console.log('syntax OK')"` 或更简单：

Run: `node -c livery_analyzer.js`
Expected: 无输出（语法正确）

- [ ] **Step 3: 提交**

```bash
git add livery_analyzer.js
git commit -m "feat: 添加 normalizeVersion 标题版本号剥离函数"
```

---

## Task 2: 插入版本变体检测算法

**Files:**
- Modify: `livery_analyzer.js`（在 dup 检测的 `_dupGroup` 标记之后、`carUniqueSets` 计算之前插入）

**锚点说明：** 插入点在 `liveryItems.forEach(d => { d._dupGroup = dupGroupIdx.get(d) || 0; });` 之后、`const dupFileCount = ...` 之前。

- [ ] **Step 1: 插入变体检测算法**

找到这段（约 1025-1030 行）：

```js
liveryItems.forEach(d => {
	d._dupGroup = dupGroupIdx.get(d) || 0;
});

const dupFileCount = dupGroups.reduce((s, g) => s + g.length, 0);
```

在 `});`（_dupGroup 赋值循环结束）和 `const dupFileCount` 之间插入：

```js

// ===== 版本变体检测（与重复检测并行、独立标记）=====
// 同车型 + 同作者 → 桶；桶内按去版本号后的基础标题二次分组；
// 子组 ≥2 项 且 原始标题至少有 2 种不同值 → 变体组。
// 与重复检测互不交叉：一个涂装可同时属于重复组和变体组。
const variantBuckets = new Map();
liveryItems.forEach(d => {
	if (!d._author) return;                       // 变体须有作者
	const key = d.parsed.code + '|' + d._author;
	if (!variantBuckets.has(key)) variantBuckets.set(key, []);
	variantBuckets.get(key).push(d);
});

const variantGroups = [];
variantBuckets.forEach(bucket => {
	if (bucket.length < 2) return;
	const baseMap = new Map();                     // baseTitle -> [items]
	bucket.forEach(d => {
		const base = normalizeVersion(d._title);
		if (!baseMap.has(base)) baseMap.set(base, []);
		baseMap.get(base).push(d);
	});
	baseMap.forEach(subGroup => {
		if (subGroup.length < 2) return;
		// 排除严格重复：原始标题须至少有 2 种不同值
		const distinctTitles = new Set(subGroup.map(d => d._title));
		if (distinctTitles.size < 2) return;
		variantGroups.push(subGroup);
	});
});

// 标记每个涂装所属变体组（1-based，0=无变体）
const variantGroupIdx = new Map();
variantGroups.forEach((group, idx) => {
	group.forEach(d => variantGroupIdx.set(d, idx + 1));
});
liveryItems.forEach(d => {
	d._variantGroup = variantGroupIdx.get(d) || 0;
});

const variantFileCount = variantGroups.reduce((s, g) => s + g.length, 0);
console.log(`版本变体: ${variantGroups.length} 组变体, 涉及 ${variantFileCount} 个涂装文件`);
```

- [ ] **Step 2: 验证语法**

Run: `node -c livery_analyzer.js`
Expected: 无输出

- [ ] **Step 3: 跑脚本确认检测日志输出**

Run: `node livery_analyzer.js`
Expected: 控制台输出包含 `版本变体: 2 组变体, 涉及 4 个涂装文件`（基于真实存档：`Ma koto lim`/`V3` + `NINJIA V1`/`V2` 两组各 2 个文件 = 4 个文件）。
若输出 `0 组变体`，检查 `normalizeVersion` 是否插入正确、`_author`/`_title` 字段名是否一致。

- [ ] **Step 4: 提交**

```bash
git add livery_analyzer.js
git commit -m "feat: 版本变体检测算法（同车型同作者 + 版本号归一化）"
```

---

## Task 3: 行模板新增 data-variant-group 属性

**Files:**
- Modify: `livery_analyzer.js`（行模板 `<tr>` 标签，约 1078 行）

- [ ] **Step 1: 在行模板 tr 标签加 data-variant-group**

找到这行（约 1078 行，整行单行）：

```js
    rowsHtml += `<tr class="${d._dupGroup > 0 ? 'dup-row dup-group-' + d._dupGroup : ''}" data-dup-group="${d._dupGroup}" data-car-unique="${carUniqueSets.get(d.parsed.code).size}" data-sort-default="${curIdx}" data-sort-date="${escapeHtml(p.ts)}" data-sort-car="${escapeHtml(carName)}" data-sort-author="${escapeHtml(cleanAuthor)}">
```

替换为（在 `data-car-unique="..."` 之后插入 ` data-variant-group="${d._variantGroup}"`）：

```js
    rowsHtml += `<tr class="${d._dupGroup > 0 ? 'dup-row dup-group-' + d._dupGroup : ''}" data-dup-group="${d._dupGroup}" data-car-unique="${carUniqueSets.get(d.parsed.code).size}" data-variant-group="${d._variantGroup}" data-sort-default="${curIdx}" data-sort-date="${escapeHtml(p.ts)}" data-sort-car="${escapeHtml(carName)}" data-sort-author="${escapeHtml(cleanAuthor)}">
```

- [ ] **Step 2: 验证属性已写入 HTML**

Run: `node livery_analyzer.js && node -e "const h=require('fs').readFileSync('report.html','utf-8');const m=h.match(/data-variant-group=\"\d+\"/g);console.log('variant attrs:',m?m.length:0)"`
Expected: 输出 `variant attrs:` 后跟一个 ≥4 的数字（185 行各一个属性，变体组成员属性值为 ≥1，其余为 0；匹配 `"\d+"` 计数 = 总行数）。若为 0，说明替换未命中，检查字符串是否完全一致。

- [ ] **Step 3: 提交**

```bash
git add livery_analyzer.js
git commit -m "feat: 行模板新增 data-variant-group 属性"
```

---

## Task 4: 统计栏追加变体计数 + 新增「仅变体」筛选按钮

**Files:**
- Modify: `livery_analyzer.js`（stats-bar 约 1233 行；筛选按钮行约 1242-1244 行）

- [ ] **Step 1: 统计栏追加变体计数**

找到这行（约 1233 行）：

```js
<div class="stats-bar">共计 <strong>${liveryItems.length}</strong> 个涂装${dupGroups.length > 0 ? `，其中 <strong style="color:#e65100;">${dupGroups.length}</strong> 组重复（<strong>${dupFileCount}</strong> 个文件）` : ''}</div>
```

替换为（在重复统计之后追加变体统计，注意变体统计独立于重复，单独判断）：

```js
<div class="stats-bar">共计 <strong>${liveryItems.length}</strong> 个涂装${dupGroups.length > 0 ? `，其中 <strong style="color:#e65100;">${dupGroups.length}</strong> 组重复（<strong>${dupFileCount}</strong> 个文件）` : ''}${variantGroups.length > 0 ? `，其中 <strong style="color:#7b1fa2;">${variantGroups.length}</strong> 组版本变体（<strong>${variantFileCount}</strong> 个文件）` : ''}</div>
```

- [ ] **Step 2: 筛选按钮行追加「仅变体」按钮**

找到这三行（约 1242-1244 行，注意有 tab 缩进）：

```js
    <button id="btn-dup-filter" onclick="toggleDupFilter(this)">仅重复</button>
	    <button id="btn-single-filter" onclick="toggleSingleFilter(this)">仅单涂装</button>
	    <button id="btn-multi-filter" onclick="toggleMultiFilter(this)">多涂装</button>
```

替换为（在 `btn-dup-filter` 之后、`btn-single-filter` 之前插入「仅变体」按钮，保持同样的 tab 缩进风格）：

```js
    <button id="btn-dup-filter" onclick="toggleDupFilter(this)">仅重复</button>
	    <button id="btn-variant-filter" onclick="toggleVariantFilter(this)">仅变体</button>
	    <button id="btn-single-filter" onclick="toggleSingleFilter(this)">仅单涂装</button>
	    <button id="btn-multi-filter" onclick="toggleMultiFilter(this)">多涂装</button>
```

- [ ] **Step 3: 验证统计栏和按钮存在**

Run: `node livery_analyzer.js && node -e "const h=require('fs').readFileSync('report.html','utf-8');console.log('variant count in stats:', /组版本变体/.test(h));console.log('variant btn:', /btn-variant-filter/.test(h))"`
Expected: 两行均为 `true`

- [ ] **Step 4: 提交**

```bash
git add livery_analyzer.js
git commit -m "feat: 统计栏变体计数 + 仅变体筛选按钮"
```

---

## Task 5: JS toggle 函数 + filterTable 条件 + 全局变量

**Files:**
- Modify: `livery_analyzer.js`（全局变量约 1277 行；toggle 函数约 1335-1345 行；filterTable 约 1358-1360 行）

- [ ] **Step 1: 新增 variantFilterActive 全局变量**

找到这行（约 1277 行）：

```js
var dupFilterActive = false;
```

替换为（在其后追加一行）：

```js
var dupFilterActive = false;
var variantFilterActive = false;
```

- [ ] **Step 2: 新增 toggleVariantFilter 函数**

找到 `toggleDupFilter` 函数（约 1335-1345 行）：

```js
function toggleDupFilter(btn) {
    dupFilterActive = !dupFilterActive;
    if (dupFilterActive) {
        btn.classList.add('active');
        btn.textContent = '仅重复 ✓';
    } else {
        btn.classList.remove('active');
        btn.textContent = '仅重复';
    }
    filterTable();
}
```

在其**之后**（`toggleSingleFilter` 之前）插入：

```js
function toggleVariantFilter(btn) {
    variantFilterActive = !variantFilterActive;
    if (variantFilterActive) {
        btn.classList.add('active');
        btn.textContent = '仅变体 ✓';
    } else {
        btn.classList.remove('active');
        btn.textContent = '仅变体';
    }
    filterTable();
}
```

- [ ] **Step 3: filterTable 增加 isVariant 判断与条件**

找到 `filterTable` 内这段（约 1358-1360 行）：

```js
        var isDup = tr[i].getAttribute('data-dup-group') !== '0';
        var uniqueCount = parseInt(tr[i].getAttribute('data-car-unique')) || 0;
        if (matchesSearch && (!dupFilterActive || isDup) && (!singleFilterActive || uniqueCount === 1) && (!multiFilterActive || uniqueCount > 1)) {
```

替换为（在 `isDup` 后加 `isVariant`，条件链加 `(!variantFilterActive || isVariant)`）：

```js
        var isDup = tr[i].getAttribute('data-dup-group') !== '0';
        var isVariant = tr[i].getAttribute('data-variant-group') !== '0';
        var uniqueCount = parseInt(tr[i].getAttribute('data-car-unique')) || 0;
        if (matchesSearch && (!dupFilterActive || isDup) && (!variantFilterActive || isVariant) && (!singleFilterActive || uniqueCount === 1) && (!multiFilterActive || uniqueCount > 1)) {
```

- [ ] **Step 4: 验证语法与全部 JS 函数存在**

Run: `node -c livery_analyzer.js && node livery_analyzer.js && node -e "const h=require('fs').readFileSync('report.html','utf-8');console.log('toggleVariantFilter:',/function toggleVariantFilter/.test(h));console.log('variantFilterActive:',/var variantFilterActive/.test(h));console.log('isVariant in filterTable:',/var isVariant/.test(h))"`
Expected: 无语法错误；三个检查均为 `true`

- [ ] **Step 5: 提交**

```bash
git add livery_analyzer.js
git commit -m "feat: 仅变体筛选 toggle 函数与 filterTable 条件"
```

---

## Task 6: 端到端验证（真实存档）

**Files:**
- Create: `tmp_variant_verify.js`（验证脚本，用后删除，不进 git）

- [ ] **Step 1: 写验证脚本**

创建 `tmp_variant_verify.js`：

```js
const fs = require('fs'), path = require('path');
// 复用主脚本的解析逻辑，从生成的 report.html 中读取 data-variant-group 属性做端到端校验
const h = fs.readFileSync(path.resolve(__dirname, 'report.html'), 'utf-8');
const rows = h.match(/<tr[^>]*data-variant-group="\d+"[^>]*>/g) || [];
console.log('总行数:', rows.length);

// 解析每行的 variant-group 值
const groups = new Map();
rows.forEach(rowHtml => {
    const m = rowHtml.match(/data-variant-group="(\d+)"/);
    const g = parseInt(m[1]);
    if (g === 0) return;
    if (!groups.has(g)) groups.set(g, 0);
    groups.set(g, groups.get(g) + 1);
});
console.log('\n变体组分布（组号: 成员数）:');
groups.forEach((cnt, g) => console.log(`  组 ${g}: ${cnt} 个文件`));
console.log('\n变体组总数:', groups.size, '| 变体文件总数:', [...groups.values()].reduce((a, b) => a + b, 0));

// 断言预期
const expectedGroups = 2;
const expectedFiles = 4;
const ok = groups.size === expectedGroups && [...groups.values()].reduce((a, b) => a + b, 0) === expectedFiles
    && [...groups.values()].every(c => c === 2);
console.log('\n断言（2 组各 2 文件）:', ok ? 'PASS ✓' : 'FAIL ✗');
if (!ok) process.exit(1);
```

- [ ] **Step 2: 跑验证脚本**

Run: `node livery_analyzer.js && node tmp_variant_verify.js`
Expected: 输出 `变体组总数: 2 | 变体文件总数: 4` 与 `断言（2 组各 2 文件）: PASS ✓`，退出码 0。

- [ ] **Step 3: 手动确认 HTML 报告筛选行为**

Run: `node livery_analyzer.js && start report.html`（Windows）或提示用户打开 `report.html`
Expected（人工检查）：
1. 顶部统计栏显示「...其中 2 组版本变体（4 个文件）」
2. 筛选行有「仅变体」按钮
3. 点击「仅变体」→ 表格只剩 4 行（2 组变体成员）；按钮文字变「仅变体 ✓」
4. 在搜索框输入车型名 + 点「仅重复」+ 点「仅变体」可叠加筛选
5. 再次点击「仅变体」取消，恢复全部行

- [ ] **Step 4: 删除验证脚本**

Run: `rm tmp_variant_verify.js`
Expected: 文件已删除，`git status` 中无该文件

- [ ] **Step 5: 提交**（无源码改动，仅验证——此 task 不产生提交。若验证通过则跳过此步）

无需提交（验证脚本已删除，源码无改动）。

---

## Task 7: apply_all.js 新增 Step 5 幂等检查

**Files:**
- Modify: `apply_all.js`（在现有 Step 4 之后、最终 `if(m)` 写入之前插入）

**锚点说明：** Step 4 的 `else {console.log('Single/multi livery filter OK.');}` 之后是最终的 `if(m){fs.writeFileSync...}` 块。Step 5 插在这两者之间。

- [ ] **Step 1: 插入 Step 5 check-only**

找到这段（约 77-80 行，文件末尾附近）：

```js
} else {console.log('Single/multi livery filter OK.');}

if(m){fs.writeFileSync('livery_analyzer.js',la);console.log('HTML patches applied.');}
```

在 `} else {console.log('Single/multi livery filter OK.');}` 和 `if(m){fs.writeFileSync...` 之间插入：

```js

// === Step 5: Version variant detection (check only) ===
if(la.includes('data-variant-group')){console.log('Version variant detection OK.');}
else{console.log('Version variant detection MISSING — update livery_analyzer.js from source.');m=true;}
```

- [ ] **Step 2: 验证 apply_all.js 语法与检查逻辑**

Run: `node -c apply_all.js && node apply_all.js`
Expected: 语法无错；运行时输出包含 `Version variant detection OK.`（因为 Task 1-5 已让 `livery_analyzer.js` 含 `data-variant-group`）。其余步骤输出 `Map OK` / 各 `OK`（源码已含所有特性，apply_all 全部跳过注入）。

- [ ] **Step 3: 提交**

```bash
git add apply_all.js
git commit -m "feat: apply_all.js 新增版本变体检测幂等检查 (Step 5)"
```

---

## Task 8: 更新文档（更新日志 + CLAUDE.md）

**Files:**
- Modify: `更新日志.md`（顶部追加 v1.4 条目）
- Modify: `CLAUDE.md`（重复检测章节后追加版本变体小节）

- [ ] **Step 1: 更新日志追加 v1.4**

在 `更新日志.md` 顶部 `# 更新日志` 之后、`## v1.3.2` 之前插入：

```markdown
## v1.4 - 版本变体检测 (2026-08-16)

### ✨ 新增功能

- **版本变体筛选**：识别同车型、同作者下仅版本号不同的涂装迭代（如 `Ma koto lim` → `Ma koto lim V3`、`...NINJIA V1` → `...NINJIA V2`），新增「仅变体」筛选按钮
- 版本号识别：`v`/`V`/`ver`/`ver.`/`version`/`final`/`FINAL`/`rev` + 数字，及小数版本（`2.0`/`3.0`）
- 与重复检测**互不交叉、独立标记**：一个涂装可同时属于重复组和变体组，两套体系各自筛选、可叠加
- 顶部统计栏显示变体组计数

### 🔧 设计说明

- 仅靠版本号剥离识别（不引入图像 dHash 或模糊匹配——经真实存档 300 涂装验证，同车型下非版本号的相似标题对为 0，dHash/模糊匹配无增量价值且增加复杂度）
- 同车型 + 同作者约束：精确区分「同人作者自己的迭代版本」（变体）与「不同玩家下载同一涂装」（重复）

---
```

- [ ] **Step 2: CLAUDE.md 追加版本变体小节**

在 `CLAUDE.md` 的 `## Duplicate Detection Algorithm` 章节内容结束、下一个 `## Key Technical Details` 之前插入新章节。

找到（`## Duplicate Detection Algorithm` 章节末尾，`Final groups assigned 1-based IDs...` 那行之后、空行 + `## Key Technical Details` 之前）：

```
- Final groups assigned 1-based IDs via `_dupGroup`; non-duplicates get ID 0.

## Key Technical Details
```

替换为：

```
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
```

- [ ] **Step 3: 提交**

```bash
git add 更新日志.md CLAUDE.md
git commit -m "docs: v1.4 版本变体检测更新日志与算法文档"
```

---

## 完成验证（全量回归）

- [ ] **最终回归：clean rebuild + 全特性确认**

Run:
```bash
node -c livery_analyzer.js && node -c apply_all.js && node apply_all.js && node livery_analyzer.js
```
Expected:
- 两个语法检查无输出
- `apply_all.js` 输出 `Map OK`、各特性 `OK`（含 `Version variant detection OK.`）、`HTML patches already applied.`（无改动需写入，因源码已是最新）
- `livery_analyzer.js` 输出含 `版本变体: 2 组变体, 涉及 4 个涂装文件`

- [ ] **确认 git 工作区干净**

Run: `git status --short`
Expected: 无未提交改动（或仅 `report.html` 等被 `.gitignore` 排除的生成物）

---

## Self-Review 记录

**Spec 覆盖检查：**
- 决策1（互不交叉独立标记）→ Task 2 算法 + 注释，Task 5 filterTable 独立条件 ✓
- 决策2（版本号中等识别范围）→ Task 1 normalizeVersion 正则（v/ver/version/final/rev + 小数，无裸数字）✓
- 决策3（同车型+同作者+基础标题相同）→ Task 2 variantBuckets key + baseMap 二次分组 ✓
- 决策4（原始标题须 ≥2 种不同值区分严格重复）→ Task 2 distinctTitles.size < 2 排除 ✓
- 决策5（不单独高亮，仅靠筛选）→ Task 4 仅加按钮无 CSS 高亮，Task 5 独立 filter 条件 ✓
- 实现 spec「实现方式」段：逻辑写源码 + apply_all check-only → Task 1-5 源码 + Task 7 Step 5 ✓
- 统计栏变体计数 → Task 4 Step 1 ✓
- CLAUDE.md 更新 → Task 8 ✓

**Placeholder 扫描：** 无 TBD/TODO；每个代码步骤含完整代码；命令含预期输出。

**类型/命名一致性：** `normalizeVersion`（Task 1 定义，Task 2 调用）；`d._variantGroup`（Task 2 赋值，Task 3 模板读取）；`data-variant-group`（Task 3 属性，Task 5 filterTable 读取，Task 7 检查）；`variantFilterActive`（Task 5 声明 + toggle 使用）；`toggleVariantFilter`（Task 4 按钮引用，Task 5 定义）；`variantGroups`/`variantFileCount`（Task 2 定义，Task 4 统计栏使用）—— 全部一致。
