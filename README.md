# Asset Manage

<p align="center">
  <strong>🚀 一站式 VS Code 静态资源管理 · One-Stop Static Asset Management</strong>
</p>

<p align="center">
  <a href="#-中文">中文</a> · <a href="#-english">English</a>
</p>

---

## 演示视频 / Demo

![使用演示](resources/guide20260223.gif)

---

## 🇨🇳 中文

### 一句话介绍

**在 VS Code 侧边栏中，一站式浏览、预览、管理工作区内的所有静态资源** —— 图片、音视频、字体、Office 文档，应有尽有。

### ✨ 核心亮点

| 特性 | 说明 |
|------|------|
| **📂 分类侧边栏** | 按类型自动分类：图片、音视频、字体、办公文档、其他文件 |
| **🔍 大文件标记** | 自定义阈值，快速识别占用空间的「大块头」 |
| **🔄 重复检测** | 基于内容哈希，一键发现重复图片 |
| **👁️ 内置预览** | 图片、PDF、Word(docx)、Excel(xlsx) 面板内直接预览，无需跳转 |
| **🔤 字体预览** | 右键字体文件 →「字体预览」→ 侧边栏定位并实时预览字形 |
| **⌨️ 快捷入口** | `Ctrl+Alt+A` / `Cmd+Alt+A` 秒开面板 |
| **🌐 多语言** | 支持中文 / English 切换 |

### 使用方式

1. 点击左侧活动栏 **Asset Manage** 图标
2. 或使用快捷键 `Ctrl+Alt+A`（Windows/Linux） / `Cmd+Alt+A`（macOS）
3. 在侧边栏中浏览、搜索、预览工作区内的静态资源
4. 点击 Header 中的语言下拉框切换 中文 / English

### 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `assetManage.scanInclude` | 参与资源扫描的 glob 列表 | `["**/*"]` |
| `assetManage.scanExclude` | 排除扫描的 glob 列表 | `node_modules`、`.git`、`dist`、`build` 等 |

---

## 🇬🇧 English

### One-Line Intro

**Browse, preview, and manage all static assets in your VS Code workspace** — images, media, fonts, Office documents — all in one sidebar.

### ✨ Key Features

| Feature | Description |
|---------|-------------|
| **📂 Categorized Sidebar** | Auto-categorized by type: images, media, fonts, office docs, others |
| **🔍 Large File Marking** | Custom threshold to quickly spot space hogs |
| **🔄 Duplicate Detection** | Content-based hash to find duplicate images at a glance |
| **👁️ Built-in Preview** | Preview images, PDF, Word(docx), Excel(xlsx) in-panel — no switching |
| **🔤 Font Preview** | Right-click font file → "Font Preview" → locate and preview in sidebar |
| **⌨️ Quick Access** | `Ctrl+Alt+A` / `Cmd+Alt+A` to open the panel |
| **🌐 Multi-language** | Chinese / English support |

### How to Use

1. Click the **Asset Manage** icon in the activity bar
2. Or use shortcut `Ctrl+Alt+A` (Windows/Linux) / `Cmd+Alt+A` (macOS)
3. Browse, search, and preview static assets in the sidebar
4. Use the language dropdown in the header to switch between 中文 / English

### Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `assetManage.scanInclude` | Glob patterns for files to include in scanning | `["**/*"]` |
| `assetManage.scanExclude` | Glob patterns for files to exclude | `node_modules`, `.git`, `dist`, `build`, etc. |

---

## License

MIT
