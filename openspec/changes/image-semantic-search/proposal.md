## Why

图片模块目前只支持按文件名 / 路径做子串过滤（`ImageSection` 仅按 `file.name` 与 `relativePath` 过滤）。用户如果只记得图片"长什么样"、却记不住文件名，就无法找到它。我们希望提供自然语言语义搜索——例如输入"箭头图标"即可按匹配度由高到低返回对应图片——复用 `tel.md` 中已验证的 CLIP + OCR 方案，但需适配 VSCode 插件场景：既不能阻塞插件主进程，也不能让 `.vsix` 体积膨胀。

## What Changes

- 在图片面板新增**语义搜索模式**：一个查询框（在现有文件名过滤与新的语义搜索之间切换），返回按匹配度由高到低排序的图片。
- 为工作区构建**本地图片索引**（CLIP 图像向量 + 可选 OCR 文本），并以**增量方式**计算（按文件 `mtime`，与 `tel.md` 一致），且在**插件宿主主线程之外**（worker 线程 / 子进程）执行，确保大量图片永远不会阻塞插件激活或界面。
- 新增**按需的 ML 模型管理**：首次使用时检查所需模型文件是否已存在于插件全局存储中；若不存在则下载（`huggingface.co` → `hf-mirror.com` 回退），并通过 VSCode 进度条展示。模型**绝不打包**进 `.vsix`。
- 支持**中文查询**：在 CLIP 文本编码前先翻译为英文（复用 `Xenova/opus-mt-zh-en` 方案），翻译失败时优雅回退到原始查询。
- **懒激活**：仅当用户打开语义搜索功能时才触发索引与模型下载——普通插件激活时绝不触发——从而为不使用该功能的用户保留现有的启动行为。
- 新增配置项：启用/禁用语义搜索、开关 OCR、模型缓存路径覆盖、镜像源选择、并发上限。
- 新增运行时依赖（`@huggingface/transformers`、可选 `tesseract.js`、用于 SVG 光栅化的 `sharp`），在打包时安装，但不包含模型权重。

## Capabilities

### New Capabilities
- `image-semantic-search`：对工作区图片进行自然语言查询，包含查询预处理（中文检测 + 翻译、prompt ensemble）、CLIP + OCR 混合评分、排序/过滤，以及触发搜索并渲染排序结果的 webview 界面。
- `image-search-index`：以后台、非阻塞方式构建并增量维护单工作区图片索引（图像向量 + OCR 文本），包含 SVG 光栅化、格式支持、持久化与进度上报。
- `ml-model-management`：首次运行检测、按需下载（含镜像回退与进度）、在插件全局存储中缓存，以及加载 CLIP / 翻译 / OCR 模型资源，且不将其打包进插件。

### Modified Capabilities
<!-- 当前未定义任何已有 OpenSpec 规范（openspec/specs/ 为空），所有行为均为全新能力。 -->

## Impact

- **新增插件代码**（`src/`）：搜索服务、索引服务、模型管理服务，以及一个 worker（worker 线程/子进程）负责在与插件宿主事件循环隔离的环境中运行 ONNX 推理与 OCR。
- **修改 `src/sidebar/assetViewProvider.ts`**：新增消息处理（`semanticSearch`、`buildIndex`、`indexProgress`、`modelDownloadProgress`）以及结果到 webview 的传递逻辑。
- **修改 GUI**（`GUI/src/components/ImageSection.tsx`、`SearchBar.tsx`、locales）：语义搜索界面、模式切换、加载/进度展示与匹配分展示。
- **修改 `package.json`**：新增依赖、新增命令、新增 `assetManage.semanticSearch.*` 配置；**更新 `.vscodeignore`**，确保模型缓存与索引文件得到正确处理，同时原生依赖（`sharp`、transformers 运行时）仍被打包。
- **存储**：模型权重存放于 `context.globalStorageUri`；索引文件存放于单工作区存储（如 `globalStorage`/`storageUri`）。两者均排除在版本管理与 `.vsix` 之外。
- **风险**：JS 运行时依赖（非权重）带来的插件体积增加、首次运行下载延迟、大型仓库索引的 CPU 开销——均通过懒激活、worker 隔离、增量索引与并发上限缓解。
