# 版本变体检测 — 设计文档

**日期**: 2026-08-16
**版本**: v1.4
**状态**: 设计待审

## 背景与动机

现有「重复检测」识别严格相同的涂装（缩略图一致 + 文本一致）。但玩家常对同一涂装做微调迭代，标题仅版本号不同（如 `Ma koto lim` → `Ma koto lim V3`、`...NINJIA V1` → `...NINJIA V2`）。这类「同人作者自己的迭代版本」目前无法识别。

本设计新增「版本变体」识别层，让用户能筛选出某车型某作者下的多个迭代版本。

## 关键决策（已与用户确认）

1. **与重复检测的关系**：互不交叉、独立标记。版本变体与重复是两套并行体系，一个涂装可同时属于两者。不互相影响、不互相吸收。
2. **版本号识别范围**：中等——`v`/`V`/`ver`/`ver.`/`version`/`final`/`FINAL`/`rev` 前缀 + 数字，外加小数版本 `\d+\.\d+`（如 `2.0`、`3.0`）。**不**认结尾裸数字（误判风险高）。
3. **匹配条件**：同车型 + 同作者 + 去版本号后基础标题相同。author 为空时跳过。
4. **与严格重复的区分**：子组内原始标题须至少有 2 种不同值才算变体组。两个完全相同的标题（如 `rice shower 787B` ×2）不算变体（归重复体系）。
5. **UI 呈现**：不单独高亮，仅靠新增「仅变体」筛选按钮。变体组不加边框/背景，表格视觉保持现状（仅重复组高亮）。

## 算法（Node.js 端）

紧接现有 dup 检测（`dupGroupIdx` 标记之后、`carUniqueSets` 计算之前）插入。

### 归一化函数

```js
/**
 * 剥离标题中的版本号 token，返回「基础标题」。
 * 识别范围：v/V/ver/ver./version/final/FINAL/rev + 数字；小数版本 \d+\.\d+
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

**验证用例**（来自真实存档数据）：
- `miku V2 lim` → `miku lim`
- `Ma koto lim V3` → `Ma koto lim`
- `Marin V2 Lim ` → `Marin Lim`（trailing space 被 trim）
- `AZUR LANE SOVETSKY SAYUZ NINJIA V1` → `AZUR LANE SOVETSKY SAYUZ NINJIA`
- `Cartethyia ver2` → `Cartethyia`
- `EW FINAL2` → `EW`
- `KANEKO LUMI 3.0` → `KANEKO LUMI`
- `极限竞速2.0` → `极限竞速`
- `3.0`（孤立）→ ``（空字符串）

### 分组逻辑

```js
// ===== 版本变体检测（与重复检测并行、独立标记）=====
// 同车型 + 同作者 → 桶；桶内按去版本号后的基础标题二次分组；
// 子组 ≥2 项 且 原始标题至少有 2 种不同值 → 变体组。
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

### 数据属性

每行 `<tr>` 新增 `data-variant-group="${d._variantGroup}"`，与现有 `data-dup-group` 并行。

## UI 呈现

### 新增筛选按钮

在现有筛选按钮行追加「仅变体」按钮，与「仅重复」「仅单涂装」「多涂装」并列：

```html
<button id="btn-variant-filter" onclick="toggleVariantFilter(this)">仅变体</button>
```

### 筛选叠加

「仅变体」与搜索 + 「仅重复」+ 「仅单涂装」/「多涂装」全部 composable。`filterTable()` 条件链扩展：

```js
var isVariant = tr[i].getAttribute('data-variant-group') !== '0';
// ...
if (matchesSearch
    && (!dupFilterActive || isDup)
    && (!variantFilterActive || isVariant)
    && (!singleFilterActive || uniqueCount === 1)
    && (!multiFilterActive || uniqueCount > 1)) {
```

`toggleVariantFilter()` 与现有 `toggleDupFilter()` 结构一致。新增全局变量 `var variantFilterActive = false;`。

### 不单独高亮

变体组**不**加 `border-left` / 背景色。表格视觉保持现状——只有重复组有 8 色左边框 + 背景高亮。一个涂装若同时是重复 + 变体，视觉显示为重复高亮，但在「仅变体」筛选下仍可见。这避免了「一个行同时被两种高亮策略覆盖」的视觉冲突，也符合用户「不单独高亮，仅靠筛选」的选择。

### 统计栏

顶部统计栏追加变体计数：

```js
${variantGroups.length > 0 ? `，其中 <strong style="color:#7b1fa2;">${variantGroups.length}</strong> 组版本变体（<strong>${variantFileCount}</strong> 个文件）` : ''}
```

## 实现方式

遵循项目惯例（与重复检测的 Step 3 一致）：

- **变体检测逻辑直接写入 `livery_analyzer.js` 源码**（像现有 dup 检测一样是源码固有部分），而非 `apply_all.js` 注入。
- **`apply_all.js` 只加一个幂等检查**（Step 5）：检测 `data-variant-group` 是否存在于 `livery_analyzer.js`，缺失则提示从源码更新，不注入逻辑。与现有 Step 3 重复检测的「check only」处理方式完全一致。
- **CLAUDE.md 更新**：在「Duplicate Detection Algorithm」章节后追加「Version Variant Detection」小节，记录算法与约定。

## 已知边界 / 风险

- **`3.0` 孤立标题**：归一化为空字符串，单独存在时不会形成子组（baseMap key 为空但子组 1 项，被 `< 2` 过滤）。若多个孤立数字标题同车型同作者，理论上会碰撞成空 key 子组，但需原始标题有 2 种不同值——`3.0` 与 `2.0` 原始标题不同，会成变体组。可接受。
- **版本号在标题中部**：`miku V2 lim` 已正确处理（replace 后塌缩空格 → `miku lim`）。验证用例覆盖。
- **小数版本误判**：`2.0`/`3.0` 在涂装标题中极少是车型号（车型号多为 `86`、`2000GT` 等整数或带引号年份）。已排除结尾裸整数，仅小数形式有风险，实测可接受。
- **裸 `v`+数字的潜在风险（V8/V12 引擎号）**：归一化正则 `(?:v|ver\.?|version)\s?\.?\d+` 理论上会误剥 `V8`/`V12` 等引擎排量标记（如 `BMW V12 LMR` → `BMW LMR`）。但实测全量 300 个涂装标题（真实存档 + 备份）中，所有 `v`+数字 匹配均为真实版本号（V1/V2/V3），**零**引擎号误判——玩家不在涂装标题里写 V8/V12（这些在车型名而非涂装标题中）。当前数据安全；若未来出现含引擎号的标题需加白名单。`Version S`（无数字）等不会被剥离，行为正确。
- **与重复重叠**：按决策 1（互不交叉、独立标记），重叠是预期行为而非 bug。一个涂装可同时被标记 `data-dup-group` 和 `data-variant-group`。

## 测试验证

实现后用真实存档（`C:\XboxGames\GameSave\pgs\u_2535457321886615_16D460\current\ContainersRoot`，185 liveries）验证：
- 应识别 ≥2 组变体：`Ma koto lim`+`Ma koto lim V3`（Kamikaze Lim, code 2154）、`NINJIA V1`+`NINJIA V2`（Leistung9357, code 3761）。
- `rice shower 787B` ×2、`rice shower ACTY` ×2（完全相同标题）不应被算作变体（归重复）。
- 「仅变体」按钮应仅显示变体组成员；与「仅重复」叠加应显示同时属于两者的行。
