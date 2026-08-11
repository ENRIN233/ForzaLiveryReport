# FH6 Livery Manager · Forza Horizon 6 涂装管理器

一键扫描 Forza Horizon 6 游戏存档，生成可交互的 HTML 涂装分析报告。支持搜索、排序、缩略图放大、文件夹直达、**重复涂装检测与筛选**。

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
| 🔄 **重复涂装检测** | 三轨算法：车型+缩略图大小 & 车型+标题 & 车型+描述，并查集合并重叠组 |
| 🎨 **重复高亮** | 8 色循环标记不同重复组，可一键筛选「仅重复」 |

## 重复检测算法

```
轨道1: 车型代码 + 缩略图文件大小（字节）→ 高置信度
轨道2: 车型代码 + 涂装标题           → 中置信度
轨道3: 车型代码 + 涂装描述           → 中置信度
              ↓
    并查集合并重叠组 → BFS 连通分量 → 最终重复组
```

同一车型上相同标题、描述或缩略图的涂装会被识别为一组重复，每组分配独立颜色高亮。

## 工作原理

```
Data_Car.str  ──→  apply_all.js  ──→  注入 CAR_NAME_MAP (660 车型)
                                           +
                                     注入 HTML 功能 (lightbox, folder link, 重复检测)

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
