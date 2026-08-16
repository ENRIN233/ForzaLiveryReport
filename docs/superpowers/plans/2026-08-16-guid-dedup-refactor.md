# GUID 重复检测重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 `header` 末尾 16 字节设计 GUID 替换双路径启发式，作为重复检测的唯一判据。

**Architecture:** `parseHeader` 顺带返回 `guid` 字段（`h.slice(-16).toString('hex')`），扫描阶段捕获存入 `liveryItems` 项。重复检测整块（缩略图聚类 + 文本桶 + 并查集，约 100 行）替换为极简 GUID 分组。`_title/_author/_desc` 清洗和 `_dupGroup` 标记保留。变体检测不受影响。

**Tech Stack:** Node.js（纯 JS，零依赖，单文件 `livery_analyzer.js`）。无测试框架——用真实存档端到端验证。

**参考 spec:** `docs/superpowers/specs/2026-08-16-guid-dedup-refactor-design.md`

**⚠️ 关键缩进约定：** 重复检测区域（874-1042 行）使用 **tab** 缩进（不是空格）。中文注释是 UTF-8 字节。所有 Edit 的 `old_string` 必须逐字节精确匹配，实施前先用 Read 确认当前内容。

---

## File Structure

| 文件 | 责任 | 改动类型 |
|---|---|---|
| `livery_analyzer.js` | 主工具 | 修改（parseHeader 加 guid、扫描阶段捕获、重复检测块重写） |
| `更新日志.md` | 版本记录 | 修改（追加 v1.5 条目） |
| `CLAUDE.md` | 项目文档 | 修改（重复检测算法章节重写为 GUID 判据） |
| `README.md` | 项目文档 | 修改（重复检测算法描述更新） |

---

## Task 1: parseHeader 返回 guid 字段

**Files:**
- Modify: `livery_analyzer.js`（parseHeader 函数，65-99 行）

- [ ] **Step 1: 修改 parseHeader 的 4 处 return，新增 guid 字段**

parseHeader 当前有 4 处 return，都要加 `guid` 字段。用 Edit 逐处修改。

**return 1**（约 68 行）：
```js
        if (h.length < 8) return { title: '', desc: '', author: '' };
```
改为：
```js
        if (h.length < 8) return { title: '', desc: '', author: '', guid: '' };
```

**return 2**（约 72 行）：
```js
            return { title: '', desc: '', author: '' };
```
改为：
```js
            return { title: '', desc: '', author: '', guid: '' };
```

**return 3**（约 97 行，正常返回）：
```js
        return { title, desc, author };
```
改为：
```js
        const guid = h.length >= 16 ? h.slice(h.length - 16).toString('hex') : '';
        return { title, desc, author, guid };
```

**return 4**（约 98 行，catch 返回）：
```js
    } catch { return { title: '', desc: '', author: '' }; }
```
改为：
```js
    } catch { return { title: '', desc: '', author: '', guid: '' }; }
```

- [ ] **Step 2: 验证语法**

Run: `node -c livery_analyzer.js`
Expected: 无输出

- [ ] **Step 3: 提交**

```bash
git add livery_analyzer.js
git commit -m "feat: parseHeader 返回 guid 字段（header 末尾 16 字节设计 ID）"
```

---

## Task 2: 扫描阶段捕获 guid

**Files:**
- Modify: `livery_analyzer.js`（扫描循环，855-871 行）

- [ ] **Step 1: 扫描阶段捕获 guid**

找到这段（约 855-871 行）：
```js
    let title = '', desc = '', author = '';
    if (hasHeader) {
        const ph = parseHeader(path.join(fullPath, 'header'));
        title = ph.title;
        desc = ph.desc;
        author = ph.author;
    }

    liveryItems.push({
        name: item.name,
        parsed,
        fullPath,
        title,
        desc,
        author,
        hasThumb: files.includes('bigThumb.webp') || files.includes('thumb.webp')
    });
```

改为：
```js
    let title = '', desc = '', author = '', guid = '';
    if (hasHeader) {
        const ph = parseHeader(path.join(fullPath, 'header'));
        title = ph.title;
        desc = ph.desc;
        author = ph.author;
        guid = ph.guid;
    }

    liveryItems.push({
        name: item.name,
        parsed,
        fullPath,
        title,
        desc,
        author,
        guid,
        hasThumb: files.includes('bigThumb.webp') || files.includes('thumb.webp')
    });
```

- [ ] **Step 2: 验证语法**

Run: `node -c livery_analyzer.js`
Expected: 无输出

- [ ] **Step 3: 提交**

```bash
git add livery_analyzer.js
git commit -m "feat: 扫描阶段捕获 guid 存入 liveryItems"
```

---

## Task 3: 重写重复检测块为 GUID 分组

**Files:**
- Modify: `livery_analyzer.js`（874-1042 行，重复检测整块）

这是核心改动。**策略**：把整个重复检测区域（从 874 行 `// ===== 重复涂装检测 =====` 到 1042 行 `_dupGroup` 标记结束）整体替换为新的 GUID 分组结构。`_title/_author/_desc` 清洗逻辑移到新结构内保留。

- [ ] **Step 1: 整体替换重复检测块**

找到从 874 行开始的整个块（到 1042 行 `liveryItems.forEach(d => { d._dupGroup = dupGroupIdx.get(d) || 0; });` 结束），替换为：

```js
// ===== 重复涂装检测 =====
// 同 GUID = 同设计 = 重复。GUID 是游戏分配的设计 ID（header 末尾 16 字节），
// 精确无歧义：同设计必同 GUID，不同设计必不同 GUID（即使标题/作者/缩略图巧合相同）。

// 清洗标题/描述/作者（服务于显示与变体检测）
liveryItems.forEach(d => {
	// 标题/描述/作者已在扫描阶段精确解析（支持中文等多字节字符）
	// 标题原样显示：游戏默认标题 "Forza Livery"（未起名）也保留
	const isSentinel = s => s === 'Forza BaseLivery' || s === 'Forza Livery' || s === 'Forza SoulBoundLivery';
	d._title = (d.title === 'Forza BaseLivery' || d.title === 'Forza SoulBoundLivery') ? '' : d.title;
	d._author = isSentinel(d.author) ? '' : d.author;
	// 描述：哨兵值或与标题/作者重复时不显示
	d._desc = (isSentinel(d.desc) || d.desc === d.title || d.desc === d.author) ? '' : d.desc;
});

// GUID 分组：同 GUID 归一组，组内 ≥2 项即重复
const guidMap = new Map();
liveryItems.forEach(d => {
	if (!d.guid) return;
	if (!guidMap.has(d.guid)) guidMap.set(d.guid, []);
	guidMap.get(d.guid).push(d);
});

const dupGroups = [...guidMap.values()].filter(g => g.length >= 2);

// 标记每个涂装所属重复组（1-based，0=无重复）
const dupGroupIdx = new Map();
dupGroups.forEach((group, idx) => {
	group.forEach(d => dupGroupIdx.set(d, idx + 1));
});
liveryItems.forEach(d => {
	d._dupGroup = dupGroupIdx.get(d) || 0;
});

const dupFileCount = dupGroups.reduce((s, g) => s + g.length, 0);
console.log(`重复检测: ${dupGroups.length} 组重复, 涉及 ${dupFileCount} 个涂装文件`);
```

**被替换掉的旧内容**（874-1042 行）包括：
- 旧的重复检测注释（874-879 行）
- `_thumbSize` 提取（882-892 行）
- `_title/_author/_desc` 清洗（893-900 行，已在新结构保留）
- `normalizeVersion` 函数（902-915 行）—— **⚠️ 注意：这个函数必须保留！** 它在旧块中间，但变体检测（Task 4 之后仍在）依赖它。替换时要把它保留在新块之后、变体检测之前。
- `clusterByThumbSize` 函数（917-949 行）
- 路径 A 缩略图聚类（951-970 行）
- 路径 B 文本桶（972-1009 行）
- 并查集合并（1011-1033 行）
- `_dupGroup` 标记（1035-1042 行，已在新结构保留）

**⚠️ 关键实施要点：`normalizeVersion` 函数（902-915 行）不能删。**

由于 `normalizeVersion` 位于旧重复检测块中间，最安全的实施方式是**分两步**：

**Step 1a：** 先删除 `clusterByThumbSize` 及之后到 `_dupGroup` 标记之间的所有启发式逻辑（917-1042 行），但保留 `normalizeVersion`（902-915 行）和 `_title/_author/_desc` 清洗（882-900 行）。

**Step 1b：** 然后把 874-879 行的旧注释替换为新的 GUID 检测注释 + GUID 分组代码，并删除 882-892 行的 `_thumbSize` 提取。

实施时请先用 Read 读 874-1042 行确认精确内容，再分步 Edit。最终结果应满足：

1. `_thumbSize` 字段不再存在（用 `grep _thumbSize` 验证为 0 匹配）
2. `clusterByThumbSize` 函数不再存在
3. `textBuckets`/`thumbDupGroups`/`textDupGroups` 不再存在
4. `normalizeVersion` 函数仍然存在且完整
5. `_title/_author/_desc` 清洗仍然存在
6. `dupGroups` 由 GUID 分组产生
7. `_dupGroup` 标记逻辑保留

- [ ] **Step 2: 验证无残留引用**

Run: `grep -n "_thumbSize\|clusterByThumbSize\|textBuckets\|thumbDupGroups\|textDupGroups\|candidateGroups" livery_analyzer.js`
Expected: 无输出（全部删除干净）

- [ ] **Step 3: 验证语法**

Run: `node -c livery_analyzer.js`
Expected: 无输出

- [ ] **Step 4: 端到端验证**

Run: `node livery_analyzer.js`
Expected 输出包含：
- `重复检测: 3 组重复, 涉及 6 个涂装文件`（**注意：日志不再有「(缩略图 X 组 + 文本 Y 组)」后缀**）
- `版本变体: 2 组变体, 涉及 4 个涂装文件`（变体检测不受影响）

若 `重复检测: 0 组重复`，说明 GUID 分组失败——检查 `d.guid` 是否正确捕获（Task 1/2 是否成功）。

- [ ] **Step 5: 提交**

```bash
git add livery_analyzer.js
git commit -m "feat: 重复检测重构为 GUID 判据，删除缩略图/文本启发式"
```

---

## Task 4: 端到端验证（真实存档 + 报告）

**Files:**
- Create: `tmp_refactor_verify.js`（验证脚本，用后删除）

- [ ] **Step 1: 写验证脚本**

创建 `tmp_refactor_verify.js`：

```js
const fs = require('fs'), path = require('path');
const h = fs.readFileSync(path.resolve(__dirname, 'report.html'), 'utf-8');
// 验证重复组行数：data-dup-group 非 0 的行
const dupRows = (h.match(/data-dup-group="(\d+)"/g) || []).filter(s => !/data-dup-group="0"/.test(s));
// 验证变体行数
const varRows = (h.match(/data-variant-group="(\d+)"/g) || []).filter(s => !/data-variant-group="0"/.test(s));
console.log('重复组成员行数(应=6):', dupRows.length);
console.log('变体组成员行数(应=4):', varRows.length);
// 验证无设计ID列（不新增列）
console.log('无设计ID列:', !/设计ID|design.?id/i.test(h));
// 验证仅重复/仅变体按钮仍在
console.log('仅重复按钮:', /btn-dup-filter/.test(h));
console.log('仅变体按钮:', /btn-variant-filter/.test(h));
const ok = dupRows.length === 6 && varRows.length === 4 && /btn-dup-filter/.test(h) && /btn-variant-filter/.test(h);
console.log('\n断言:', ok ? 'PASS ✓' : 'FAIL ✗');
if (!ok) process.exit(1);
```

- [ ] **Step 2: 跑验证脚本**

Run: `node livery_analyzer.js > /dev/null 2>&1 && node tmp_refactor_verify.js`
Expected: `重复组成员行数(应=6): 6`、`变体组成员行数(应=4): 4`、`断言: PASS ✓`

- [ ] **Step 3: 手动确认报告**

Run: `node livery_analyzer.js && start report.html`
Expected（人工检查）：
1. 表格列结构不变（无新增「设计 ID」列）
2. `仅重复` 筛选显示 6 行（3 组各 2 个）
3. `仅变体` 筛选显示 4 行（2 组各 2 个）
4. 8 色重复高亮仍正常
5. 统计栏显示「3 组重复（6 个文件）」+「2 组版本变体（4 个文件）」

- [ ] **Step 4: 删除验证脚本**

Run: `rm tmp_refactor_verify.js`
Expected: 文件删除，`git status` 无该文件

---

## Task 5: 更新文档

**Files:**
- Modify: `更新日志.md`
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: 更新日志追加 v1.5**

在 `更新日志.md` 顶部 `# 更新日志` 之后、`## v1.4` 之前插入：

```markdown
## v1.5 - 重复检测重构为设计 GUID (2026-08-16)

### ✨ 重复检测增强

- **GUID 精确判据**：改用 `header` 末尾 16 字节设计 GUID 作为重复检测唯一判据（此前为缩略图大小 + 标题/描述文本双路径启发式）
- 同 GUID = 同设计 = 重复，精确无歧义；不同设计即使标题/作者/缩略图巧合相同也天然不会误合并
- 删除约 100 行启发式逻辑（缩略图固定锚点聚类 + 文本桶匹配 + 并查集合并）
- 经真实存档 203 涂装验证：GUID 覆盖 100%，分组结果与旧启发式完全一致（3 组重复）
- 版本变体检测不受影响，与重复检测仍互不交叉

---
```

- [ ] **Step 2: CLAUDE.md 重复检测章节重写**

找到 CLAUDE.md 的 `## Duplicate Detection Algorithm` 章节（从该标题到 `## Version Variant Detection Algorithm` 之前），整体替换为：

```markdown
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
```

- [ ] **Step 3: README 重复检测章节更新**

找到 README 的 `## 重复检测算法` 章节（含下方的代码块和说明行），替换为：

```markdown
## 重复检测算法

**基于设计 GUID**：`header` 文件末尾 16 字节是游戏分配的设计 ID（GUID）。

```
同 GUID = 同设计 = 重复（精确无歧义）
不同 GUID = 不同设计（即使标题/作者/缩略图巧合相同也不误合并）
```

同一设计被保存多份（GUID 相同）会被识别为一组重复，每组分配独立颜色高亮。v1.5 起用 GUID 替换了此前的缩略图大小 + 文本双路径启发式。
```

同时，README 功能表里的「🔄 **重复涂装检测**」说明行，如果提到「双路径」或「缩略图大小聚类」，改为「设计 GUID 精确判据：同 GUID = 同设计」。

- [ ] **Step 4: 提交**

```bash
git add 更新日志.md CLAUDE.md README.md
git commit -m "docs: v1.5 GUID 重复检测 — 更新日志 + CLAUDE.md + README"
```

---

## 完成验证（全量回归）

- [ ] **最终回归**

Run:
```bash
node -c livery_analyzer.js && node apply_all.js && node livery_analyzer.js
```
Expected:
- 语法无输出
- `apply_all.js` 输出各特性 `OK`（含 `Dup detection OK.`、`Version variant detection OK.`、`HTML patches already applied.`）
- `livery_analyzer.js` 输出 `重复检测: 3 组重复, 涉及 6 个涂装文件` + `版本变体: 2 组变体, 涉及 4 个涂装文件`

- [ ] **确认 git 工作区干净**

Run: `git status --short`
Expected: 无未提交改动（仅 `tmp_agents/`/`tmp_crypto/` 预存在的未跟踪目录）

---

## Self-Review 记录

**Spec 覆盖检查：**
- 决策1（完全替换删除启发式）→ Task 3 删除 clusterByThumbSize/路径A/路径B/并查集 + `_thumbSize` ✓
- 决策2（不展示设计ID列）→ Task 4 验证「无设计ID列」✓
- GUID 提取（header 末尾16字节）→ Task 1 parseHeader ✓
- 扫描阶段捕获 → Task 2 ✓
- 变体检测不受影响 → Task 3 Step 4 验证 `版本变体: 2 组` ✓
- 保留项（_title/_author/_desc 清洗、_dupGroup、data-dup-group、8色高亮、筛选按钮）→ Task 3 新结构保留 ✓

**Placeholder 扫描：** 无 TBD/TODO；每个代码步骤含完整代码；命令含预期输出。

**类型/命名一致性：** `guid`（Task 1 parseHeader 返回、Task 2 捕获、Task 3 分组读取）一致；`d.guid`（Task 3 使用）与 Task 2 push 的 `guid` 字段对应；`dupGroups`/`dupFileCount`（Task 3 定义，后续统计栏/日志使用）一致；`normalizeVersion`（Task 3 保留，变体检测使用）一致。

**关键风险提示（已写入 Task 3）：** `normalizeVersion` 位于旧块中间，替换时必须保留。实施者需先 Read 确认精确内容再分步 Edit，且用 grep 验证 `_thumbSize`/`clusterByThumbSize`/`textBuckets` 等零残留。
