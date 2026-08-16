# FH6 Livery Manager · Forza Horizon 6 涂装管理器

一键扫描 Forza Horizon 6 游戏存档，生成可交互的 HTML 涂装分析报告。支持搜索、排序、缩略图放大、文件夹直达、**重复涂装检测与筛选**、**版本变体检测与筛选**。

## 快速开始

> 需要 [Node.js](https://nodejs.org/)（或使用 `node/` 目录下自带的便携版）

```bash
# 双击运行（推荐）
AAA双击启动.bat

# 或命令行
node apply_all.js          # 首次运行：注入车型名称映射 + UI 功能
node livery_analyzer.js    # 扫描存档 → 生成 report.html
```

`AAA双击启动.bat` 会自动完成以上两步并在浏览器中打开报告。

## 功能

| 功能 | 说明 |
|---|---|
| 🔍 **搜索** | 按车型、作者、涂装标题实时过滤 |
| 📊 **排序** | 按默认（文件顺序） / 日期 / 车型 / 作者排序 |
| 📍 **游戏内位置** | 显示涂装在游戏内排列位置（每列 2 个，如「1列1个」「1列2个」） |
| 🖼️ **缩略图** | 内嵌 base64，点击放大（Lightbox） |
| 📁 **打开文件夹** | 一键跳转涂装文件夹（或复制路径） |
| 🔄 **重复涂装检测** | 设计 GUID 精确判据：同 GUID = 同设计 = 重复 |
| 🎨 **重复高亮** | 8 色循环标记不同重复组，可一键筛选「仅重复」 |
| 🔁 **版本变体检测** | 同车型同作者下仅版本号不同的涂装迭代（如 `标题` → `标题 V2`），新增「仅变体」筛选，与重复检测并行独立 |

## 重复检测算法

**基于设计 GUID**：`header` 文件末尾 16 字节是游戏分配的设计 ID（GUID）。

```
同 GUID = 同设计 = 重复（精确无歧义）
不同 GUID = 不同设计（即使标题/作者/缩略图巧合相同也不误合并）
```

同一设计被保存多份（GUID 相同）会被识别为一组重复，每组分配独立颜色高亮。v1.5 起用 GUID 替换了此前的缩略图大小 + 文本双路径启发式。

## 版本变体检测算法

**与重复检测并行、互不交叉**（一个涂装可同时属于重复组和变体组）。

```
normalizeVersion(title) 剥离版本号 token：
  v/V/ver/ver./version + 数字（v2、V2、ver2、version2）
  final/FINAL/rev + 数字（final2、FINAL2）
  小数版本 \d+\.\d+（3.0、2.0）
  → 塌缩空格、trim（不认结尾裸数字，误判风险高）

分组：同车型 + 同作者 → 桶 → 桶内按基础标题二次分组
      → 子组 ≥2 项 且 原始标题 ≥2 种不同值 = 变体组
        （原始标题完全相同的归重复，不算变体）
```

识别同车型同作者下仅版本号不同的迭代版本（如 `Ma koto lim` → `Ma koto lim V3`）。变体组不加高亮，仅靠「仅变体」筛选按钮呈现，可与搜索/重复/单涂装筛选叠加。

## 工作原理

```
Data_Car.str  ──→  apply_all.js  ──→  注入 CAR_NAME_MAP (660 车型)
                                           +
                                     注入 HTML 功能 (lightbox, folder link)
                                     + 幂等检查 (重复检测/版本变体已内置于源码)

ContainersRoot ──→  livery_analyzer.js  ──→  report.html
  Livery_*/                                    (自包含: 内嵌 CSS/JS/base64 缩略图)
   ├─ header     → 标题 / 描述 / 作者
   ├─ bigThumb.webp  → 缩略图
   └─ C_livery   → (压缩涂装数据，不解析)
```

- `Data_Car.str` — ForzaTech 二进制字符串表，VALUES/KEYS 双段哈希对齐解析（偏移量动态读取）
- `CAR_NAME_MAP` — 660 条目，覆盖 FH6 全部可驾驶车辆
- 报告为单文件 HTML，体积约 16MB（取决于涂装数量），可直接分享

## 存档路径

脚本自动检测标准 Xbox GameSave 路径：
```
C:\XboxGames\GameSave\pgs\u_*\current\ContainersRoot
```

也可手动指定：

```bash
node livery_analyzer.js "E:/你的存档路径/ContainersRoot" "输出报告.html"
```

## 项目结构

```
ForzaLiveryReport/
├── livery_analyzer.js   # 主脚本：扫描存档 + 生成 HTML 报告
├── apply_all.js         # 初始化脚本：注入车型映射 + UI 补丁
├── Data_Car.str         # FH6 车型字符串表（ForzaTech 二进制格式）
├── AAA双击启动.bat       # 一键启动脚本
├── 更新日志.md           # 版本更新记录
├── package.json         # pkg 编译配置（可选，生成 .exe）
├── node/                # 便携 Node.js 运行时（无需系统安装）
└── CLAUDE.md            # Claude Code 项目指南
```

## License

[MIT](LICENSE.txt) © 2025 ENRIN233

---

*本项目仅解析本地存档文件，不修改游戏数据。Forza Horizon 是 Microsoft / Playground Games 的商标。*
