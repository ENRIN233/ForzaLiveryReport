# 重复检测重构:设计 GUID 替换启发式 — 设计文档

**日期**: 2026-08-16
**版本**: v1.5
**状态**: 设计待审

## 背景与动机

现有重复检测(v1.3 起)用**双路径启发式**识别重复涂装:

- **路径 A(缩略图)**:同车型缩略图大小固定锚点聚类(0.5% 容差)→ 组内 `title||desc||author` 拆分
- **路径 B(文本)**:同车型 + 同作者桶内,标题匹配(描述非空时也须匹配)
- 并查集取并集

这些启发式是为了在没有「官方设计身份」的情况下近似判断「两个涂装是否是同一个设计」。

深挖发现:每个 `Livery_` 文件夹的 `header` 文件**末尾 16 字节**就是游戏内分配的设计 GUID(128-bit 设计 ID)。这是官方身份标识:

- 同 GUID = 同一设计 = 重复(精确、无歧义)
- 不同 GUID = 不同设计(即使标题/作者/缩略图巧合相同,也天然不会误合并)

**决定性验证**(真实存档 203 涂装):
- GUID 覆盖率 **203/203**(0 个 header 缺失)
- GUID 分组出的重复组与现有启发式出的重复组**完全一致**(都是 3 组:`rice shower 787B`、`SCHWARZ`、`rice shower ACTY`)
- 即:重构不改变任何现有检测结果,只是把约 100 行脆弱启发式换成一行精确判断

## 关键决策(已与用户确认)

1. **完全替换,删除启发式**:GUID 是重复检测的唯一判据。删除 `clusterByThumbSize`、路径 A 缩略图聚类、路径 B 文本桶、并查集合并,以及 `_thumbSize` 字段(它仅服务于重复检测,无其他用途)。
2. **不展示设计 ID 列**:GUID 仅内部用于重复检测,报告中不新增列。表格列结构保持不变。
3. **变体检测不受影响**:版本变体检测基于标题归一化 + 同车型同作者,与 GUID 完全独立,继续正常工作。互不交叉原则保持(一个涂装可同时属于重复组和变体组)。

## 算法(重构后)

### GUID 提取

在 `parseHeader` 函数内部顺带返回(它已读取整个 header buffer):

```js
// parseHeader 返回对象新增 guid 字段
const guid = h.length >= 16 ? h.slice(h.length - 16).toString('hex') : '';
```

`parseHeader` 的返回从 `{ title, desc, author }` 变为 `{ title, desc, author, guid }`。

扫描阶段捕获:`guid = ph.guid`,存入 `liveryItems` 项的 `guid` 字段。

### 重复分组

用一段极简的 GUID 分组替换现有 ~100 行(874-1042 行的双路径 + 并查集):

```js
// ===== 重复涂装检测 =====
// 同 GUID = 同设计 = 重复。GUID 是游戏分配的设计 ID（header 末尾 16 字节），
// 精确无歧义：同设计必同 GUID，不同设计必不同 GUID（即使标题/作者/缩略图巧合相同）。
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

### 删除的内容

- `clusterByThumbSize` 函数(917-949 行)
- 路径 A 缩略图聚类(951-970 行)
- 路径 B 文本桶 + 桶内并查集(972-1009 行)
- 两路径并查集合并(1011-1033 行)
- 日志字符串中的 `(缩略图 X 组 + 文本 Y 组)` 部分(1087 行)
- 重复检测块开头(874-892 行)中**仅缩略图大小读取部分**:`let thumbSize = 0; ... d._thumbSize = thumbSize;` 这段。**注意**:同一 forEach 里的 `_title`/`_author`/`_desc` 清洗逻辑(893-900 行)必须保留——它服务于显示与变体检测,与缩略图大小无关。

### 保留的内容(不变)

- `d._title` / `d._author` / `d._desc` 的清洗逻辑(893-900 行)——仍服务于显示和变体检测
- `data-dup-group` 行属性、`仅重复` 筛选按钮、8 色高亮、统计栏
- `carUniqueSets`(单/多涂装筛选依赖 `_dupGroup`)
- 版本变体检测(1044 行起)及其 `data-variant-group`、`仅变体` 筛选

## 已知边界 / 风险

- **GUID 提取失败(header 缺失或 <16 字节)**:该涂装不参与重复检测(`if (!d.guid) return`)。实测覆盖 100%,此分支仅为防御。与旧逻辑「无缩略图则被排除出路径 A」语义等价。
- **游戏更新改变 header 格式**:若未来游戏版本移动了 GUID 位置,重复检测会失效(而非误判)。这是「完全替换、删启发式」的固有取舍,用户已确认接受。检测失效的信号是重复组数突降为 0,可在日志里一眼看出。
- **同设计但 GUID 因游戏机制改变**:理论上游戏可能在重新保存时重新分配 GUID。实测「严格重复」3 组 GUID 均相同,说明重复保存保留 GUID。若未来游戏改为重分配,GUID 重复检测会漏——但这是游戏行为假设,当前证据充分支持。

## 测试验证

重构后跑真实存档(203 涂装)验证:
- 控制台输出 `重复检测: 3 组重复, 涉及 6 个涂装文件`(与重构前一致)
- 3 组重复 = `rice shower 787B`、`SCHWARZ`、`rice shower ACTY`
- `版本变体: 2 组变体, 涉及 4 个涂装文件`(变体检测不受影响)
- `仅重复` 筛选仍显示 6 行;`仅变体` 筛选仍显示 4 行
- 报告不含「设计 ID」列(表格列结构不变)
