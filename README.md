# Asset Manage

<p align="center">
  <strong>🚀 一站式 VS Code 静态资源管理 · One-Stop Static Asset Management</strong>
</p>

<p align="center">
  <a href="#-中文">中文</a> · <a href="#-english">English</a>
</p>

---

## 演示视频 / Demo

![使用演示](https://github.com/BitePro/asset-manage/raw/HEAD/guide/guide.gif)


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
| **🧠 按描述搜索图片** | 使用自然语言描述搜索图片，例如“箭头图标”“登录背景图”，支持中文查询 |
| **🔤 字体预览** | 右键字体文件 →「字体预览」→ 侧边栏定位并实时预览字形 |
| **⌨️ 快捷入口** | `Ctrl+Alt+A` / `Cmd+Alt+A` 秒开面板 |
| **🌐 多语言** | 支持中文 / English 切换 |

### 使用方式

1. 点击左侧活动栏 **Asset Manage** 图标
2. 或使用快捷键 `Ctrl+Alt+A`（Windows/Linux） / `Cmd+Alt+A`（macOS）
3. 在侧边栏中浏览、搜索、预览工作区内的静态资源
4. 点击 Header 中的语言下拉框切换 中文 / English

### 图片语义搜索

图片 Tab 支持两种搜索模式：

- **文件名**：按文件名或相对路径过滤图片，适合知道资源名称时使用。
- **语义搜索**：输入自然语言描述，插件会按图片内容相似度返回结果，适合只记得图片“长什么样”时使用。

使用方式：

1. 打开 **图片** Tab
2. 在资源类型 Tab 下方切换到 **语义搜索**
3. 输入描述，例如 `箭头图标`、`empty state illustration`、`blue login background`
4. 点击 **搜索** 或按 Enter

首次使用语义搜索时，插件会按需下载本地推理所需的模型文件，并在本机缓存。模型不会打包进插件安装包，也不会写入你的项目目录。

默认模型缓存目录：

```text
<VS Code globalStorage>/zqt.asset-manage/model-cache
```

macOS 上通常类似：

```text
/Users/<you>/Library/Application Support/Code/User/globalStorage/zqt.asset-manage/model-cache
```

可通过配置 `assetManage.semanticSearch.modelCachePath` 或环境变量 `IMAGE_SEARCH_MODEL_CACHE` 覆盖模型缓存目录。

> 注意：语义搜索会在首次使用时构建图片索引。如果项目新增、删除或修改了图片，可以在语义搜索模式下点击 **构建索引** 手动更新索引和图片数量。

### 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `assetManage.scanInclude` | 参与资源扫描的 glob 列表 | `["**/*"]` |
| `assetManage.scanExclude` | 排除扫描的 glob 列表 | `node_modules`、`.git`、`dist`、`build` 等 |
| `assetManage.semanticSearch.enable` | 是否启用图片语义搜索 | `true` |
| `assetManage.semanticSearch.ocrEnabled` | 是否启用 OCR 文本辅助排序（会额外下载语言包） | `false` |
| `assetManage.semanticSearch.ocrWeight` | OCR 得分在最终排序中的权重，范围 `0-1` | `0.3` |
| `assetManage.semanticSearch.topN` | 语义搜索最多返回的图片数量 | `20` |
| `assetManage.semanticSearch.minScore` | 搜索结果最低分阈值，范围 `0-1` | `0.1` |
| `assetManage.semanticSearch.concurrency` | 构建图片索引时的并发数量 | `2` |
| `assetManage.semanticSearch.modelCachePath` | 自定义模型缓存目录，留空使用 VS Code 全局存储 | `""` |
| `assetManage.semanticSearch.mirrors` | 模型下载源，按顺序尝试 | `["huggingface.co", "hf-mirror.com"]` |

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
| **🧠 Image Search by Description** | Search images with natural language, such as “arrow icon” or “login background”; Chinese queries are supported |
| **🔤 Font Preview** | Right-click font file → "Font Preview" → locate and preview in sidebar |
| **⌨️ Quick Access** | `Ctrl+Alt+A` / `Cmd+Alt+A` to open the panel |
| **🌐 Multi-language** | Chinese / English support |

### How to Use

1. Click the **Asset Manage** icon in the activity bar
2. Or use shortcut `Ctrl+Alt+A` (Windows/Linux) / `Cmd+Alt+A` (macOS)
3. Browse, search, and preview static assets in the sidebar
4. Use the language dropdown in the header to switch between 中文 / English

### Image Semantic Search

The Images tab supports two search modes:

- **Filename**: filter images by filename or relative path.
- **Semantic search**: describe what the image looks like, and the extension ranks images by visual similarity.

How to use:

1. Open the **Images** tab
2. Switch to **Semantic search** below the asset type tabs
3. Enter a description, for example `arrow icon`, `empty state illustration`, or `蓝色登录背景图`
4. Click **Search** or press Enter

On first use, the extension downloads the local inference models it needs and caches them on your machine. Model files are not bundled into the extension package and are not written to your workspace.

Default model cache location:

```text
<VS Code globalStorage>/zqt.asset-manage/model-cache
```

On macOS, this is usually similar to:

```text
/Users/<you>/Library/Application Support/Code/User/globalStorage/zqt.asset-manage/model-cache
```

You can override the model cache directory with `assetManage.semanticSearch.modelCachePath` or the `IMAGE_SEARCH_MODEL_CACHE` environment variable.

> Note: semantic search builds a local image index on first use. If images are added, removed, or changed, click **Build index** in semantic search mode to update the index and image counts.

### Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `assetManage.scanInclude` | Glob patterns for files to include in scanning | `["**/*"]` |
| `assetManage.scanExclude` | Glob patterns for files to exclude | `node_modules`, `.git`, `dist`, `build`, etc. |
| `assetManage.semanticSearch.enable` | Enable semantic image search | `true` |
| `assetManage.semanticSearch.ocrEnabled` | Enable OCR-assisted ranking (downloads extra language data) | `false` |
| `assetManage.semanticSearch.ocrWeight` | OCR score weight in final ranking, range `0-1` | `0.3` |
| `assetManage.semanticSearch.topN` | Maximum semantic search results | `20` |
| `assetManage.semanticSearch.minScore` | Minimum score threshold, range `0-1` | `0.1` |
| `assetManage.semanticSearch.concurrency` | Concurrent image indexing workers | `2` |
| `assetManage.semanticSearch.modelCachePath` | Custom model cache directory. Empty uses VS Code global storage | `""` |
| `assetManage.semanticSearch.mirrors` | Model download hosts, tried in order | `["huggingface.co", "hf-mirror.com"]` |

---

## License

MIT
