## Context

`asset-manage` 是一个 VSCode 插件。插件宿主（`src/extension.ts` → `out/extension.js`）使用 `fast-glob` 扫描工作区，一个 React webview（`GUI/`，由 Vite 构建到 `GUI/dist`）渲染分类后的资源。目前图片"搜索"是 `ImageSection.tsx` 中纯客户端的文件名/路径子串匹配。

`tel.md` 记录了一个已验证的离线 CLI，它使用 CLIP（`@huggingface/transformers`，`Xenova/clip-vit-base-patch32`）做语义图片搜索、用 OCR 关键词覆盖（`tesseract.js`）辅助、并做中文→英文翻译（`Xenova/opus-mt-zh-en`），采用目录级 JSON 索引并手动将模型下载到 `.model-cache`。我们将该方案的第 1–5 层（文件扫描、模型资源、索引构建、查询处理、检索/排序）移植进插件，并以现有 webview 界面替换第 6 层（CLI/iTerm2 展示）。

来自需求的硬性约束：
- 工作区图片很多时不得阻塞插件宿主。
- 首次运行必须检测缺失的模型文件并按需下载。
- 模型权重不得打包进 `.vsix`（保持插件体积小）。

## Goals / Non-Goals

**Goals:**
- 在图片面板提供自然语言、按匹配度排序的图片搜索，包含中文查询。
- 索引与推理永不阻塞插件激活或界面，并能扩展到大量图片。
- 按需、抗镜像失败地将模型下载到全局存储；`.vsix` 中不含重型内容。
- 增量、持久化、单工作区的索引，可跨会话复用。

**Non-Goals:**
- 近似最近邻（ANN）向量检索——在预期规模下对索引做线性扫描即可（与 `tel.md` 一致）。
- 多语言 CLIP——保留翻译为英文的方案。
- 全文/BM25 OCR 引擎——OCR 评分保持简单的关键词覆盖。
- 搜索非图片资源（音频/视频/字体/办公文档）——仅限图片模块。
- 通过文件监听自动重建索引——v1 中索引采用懒加载/按需触发。

## Decisions

### D1: 将推理隔离到 worker，而非插件宿主
ONNX 推理（transformers）与 OCR 是 CPU 密集型且足够同步，会拖垮插件宿主事件循环，从而冻结 webview 与其他插件功能。我们在首次语义搜索时**懒启动一个 Node `worker_thread`**（备选：`child_process`）来运行它们。插件宿主保持为薄协调层：负责配置、存储路径、文件扫描、与 webview 的消息传递及生命周期；worker 负责模型加载、嵌入、OCR 与评分。
- *为何选 worker_thread 而非 child_process*：可共享内存以传输图像缓冲/向量，启动开销更低，打包更简单（单一运行时）。*为何不内联运行*：会违反非阻塞约束。
- *为何不在 webview 中跑推理*：webview 是沙箱、受 CSP 限制，且无法访问 Node/原生模块（`sharp`）；在 CSP 下拉取权重也很麻烦。

### D2: 模型存放于 `context.globalStorageUri`，按需下载
首次搜索时插件检查所需文件的明确清单（CLIP 的 tokenizer/processor/ONNX；翻译模型；可选 OCR `tessdata`）是否存在于全局存储缓存目录下（可通过 `assetManage.semanticSearch.modelCachePath` 及/或一个对应 `IMAGE_SEARCH_MODEL_CACHE` 的环境变量覆盖）。缺失文件以 `huggingface.co` → `hf-mirror.com` 回退方式拉取，并通过 `vscode.window.withProgress` 展示。随后以 `local_files_only: true` 加载模型。
- *为何显式下载文件而非让 transformers 自动下载*：可获得确定性进度、镜像回退及干净的"是否已缓存"检查，与 `tel.md` 一致。
- *为何用全局存储而非工作区*：权重在所有工作区间共享，且必须在切换工作区后留存；同时避免进入任何仓库。

### D3: 将权重排除在 `.vsix` 之外，仅随包发布 JS 运行时依赖
`package.json` 新增 `@huggingface/transformers`、`sharp` 及（可选）`tesseract.js` 作为运行时依赖（它们由 `vsce` 在打包时安装并随包发布——它们是代码而非权重）。更新 `.vscodeignore`，确保模型缓存/索引文件永不打包，同时确保 `sharp` 的原生二进制与 worker 编译后的 JS *被*打包。插件体积的代价来自 JS/原生运行时（数十 MB），而非模型权重（数百 MB）——权重在运行时下载。
- *权衡*：`.vsix` 体积相比当前的极小体积仍会增长；可接受，因为权重（主要代价）被排除，且该功能为可选。

### D4: 单工作区增量索引，持久化到存储
索引为 `{ filePath, vector, ocrText, mtime }`（参照 `tel.md`）列表，以绝对路径为键，持久化到全局/工作区存储下的单工作区文件中（不在源码树、不在 `.vsix`）。增量规则：当存储的 `mtime` ≈ 当前 `mtimeMs` 时复用条目；否则重新计算；剔除文件已消失的条目。文件发现复用现有 `fast-glob` 扫描及 `mediaInfo.ts` 中的 `IMAGE_EXT`。
- *为何像 tel.md 一样用 JSON*：最简单且正确的方案；向量（每张图 512 个浮点 × N 张）规模可接受。若体积成为问题，后续可改为紧凑二进制格式（见 OQ2）。
- *为何不把索引存进工作区*：避免污染用户仓库、避免误提交。

### D5: 懒激活保留当前启动行为
`activationEvents` 保持最小。`activate()` 中不运行任何模型/索引相关逻辑。用户首次进入语义搜索模式并提交查询时，插件依次：(1) 确保模型就绪，(2) 确保/更新索引（带进度与取消），(3) 在 worker 中运行查询，(4) 将排序结果流式发送到 webview。后续查询复用预热的 worker、已加载模型与持久化索引。

### D6: 查询流水线对齐 tel.md
中文检测（CJK 比例 > 0.5）→ 中文则翻译为英文 → 去除 "a photo of/…" 前缀 → 构造 5 个 prompt 的 ensemble → 文本向量均值池化 + L2 归一化 → 与每个图像向量做余弦得到 `clipScore` → 关键词覆盖率 `ocrScore` → `finalScore = (1-ocrWeight)*clipScore + ocrWeight*ocrScore` → 过滤 `< minScore` → 降序排序 → 取前 N。`ocrWeight` 与 `topN` 可配置。

### D7: Webview ↔ 插件协议
在 `AssetViewProvider` 现有的 `onDidReceiveMessage` 通道上新增消息：
- webview→ext：`semanticSearch { query, topN }`、`cancelSearch`、`buildIndex`。
- ext→webview：`searchResults { results: [{ path, uri, score, clipScore, ocrScore, ... }] }`、`indexProgress { processed, total }`、`modelDownloadProgress { file, percent }`、`searchError { message }`。
GUI 在 `SearchBar` 附近新增语义搜索模式切换、复用 `ImageSection` 卡片渲染的结果视图（扩展出匹配分徽标）以及加载/进度界面。locales（`GUI/src/locales/*`、`l10n/`）新增字符串。

## Risks / Trade-offs

- **插件宿主阻塞** → 通过 D1（worker 隔离）与 D5（懒加载、按需）缓解。宿主仅做 I/O 与消息传递。
- **首次运行延迟 / 下载体积** → 通过进度界面（D2）、镜像回退、缓存使其只发生一次以及清晰提示来缓解。下载完成前搜索不可用；用户可取消。
- **大型仓库索引慢** → 通过增量索引（D4）、并发上限（配置）及进度+取消来缓解。重跑只处理变更文件。
- **`sharp`/transformers 导致 `.vsix` 增大** → 接受 JS/原生运行时代价；通过 D3 排除权重（主要代价）。需重新核验打包体积；必要时可将 `sharp`/OCR 设为可选。
- **原生模块（`sharp`）跨平台打包** → `vsce` 可能打错平台的二进制。需决策/缓解（OQ1）：按平台分别构建 VSIX，或同样在运行时下载 `sharp`。
- **加载向量+模型的内存** → 限制并发、用完即释放 OCR worker（参照 tel.md）、仅缓存一个模型实例；可考虑空闲后卸载 worker。
- **索引 JSON 体积** → 数千张图片时可能很大；OQ2 覆盖二进制格式的回退方案。
- **图标的翻译/CLIP 准确度** → 图标对 CLIP 的照片类 prompt 属于分布外样本；prompt ensemble + OCR 关键词分可部分弥补。质量为尽力而为，不做保证。

## Migration Plan

1. 在 `package.json` 中新增依赖与配置；更新 `.vscodeignore`；核验打包体积，并确认不含权重/索引。
2. 实现模型管理服务 + worker；核验首次运行下载 + 镜像回退到全局存储。
3. 实现索引服务（复用扫描、SVG 光栅化、增量持久化）并在 worker 中运行；在大量图片上核验非阻塞。
4. 在 worker 中实现查询/排序；接入 `AssetViewProvider` 消息处理。
5. 实现 GUI 语义模式、匹配分展示、进度/取消；新增 locale 字符串。
6. 按 `tel.md` 对齐做人工核验，并在大型仓库上做性能检查。

回滚：该功能为可选且隔离；通过 `assetManage.semanticSearch.enable=false` 禁用，或回退相关的增量提交——现有文件名过滤不受影响。

## Open Questions

- **OQ1**：如何处理 `.vsix` 中 `sharp` 的平台相关原生二进制——按平台定向打 VSIX、运行时下载，还是改用纯 JS 的 SVG 光栅化方案？（影响 D3。）
- **OQ2**：保留 JSON 索引，还是为大型仓库改用紧凑二进制/量化向量格式？（影响 D4。）
- **OQ3**：OCR 默认开启（额外的 `tessdata` 下载 + 每图开销）还是默认关闭由用户开启？当前倾向：默认关闭。
- **OQ4**：v1 用文件监听自动重建索引，还是手动/懒刷新？当前倾向：v1 用懒/手动。
- **OQ5**：编辑器场景下 `topN`、`minScore`、`ocrWeight` 与并发的默认值（相对 tel.md CLI 默认的 10 / 0.1 / 0.3）。
