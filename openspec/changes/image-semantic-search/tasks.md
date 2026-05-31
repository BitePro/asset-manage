## 1. 依赖与打包

- [x] 1.1 在 `package.json` 中新增运行时依赖：`@huggingface/transformers`、`sharp` 及（可选）`tesseract.js`
- [x] 1.2 更新 `.vscodeignore`，确保 worker 编译后的 JS 与 `sharp` 原生二进制被打包，但模型缓存/索引文件永不打包
- [x] 1.3 在 `package.json` 中新增 `assetManage.semanticSearch.*` 配置（`enable`、`ocrEnabled`、`ocrWeight`、`topN`、`minScore`、`concurrency`、`modelCachePath`、`mirror`）
- [x] 1.4 在 `package.json` 中注册新命令（`assetManage.semanticSearch`、`assetManage.buildImageIndex`），并在 `package.nls*.json` 中新增本地化字符串
- [ ] 1.5 打一次 `.vsix` 并核验体积，确认不含权重/索引文件

## 2. 模型管理服务

- [x] 2.1 实现模型缓存路径解析（全局存储 + `modelCachePath`/环境变量覆盖）
- [x] 2.2 实现所需文件清单 + "是否已缓存"检查，覆盖 CLIP（tokenizer/processor/ONNX）、翻译及可选 OCR `tessdata`
- [x] 2.3 实现按需下载器，支持 `huggingface.co` → `hf-mirror.com` 回退及单文件进度回调
- [x] 2.4 通过 `vscode.window.withProgress` 展示下载进度并向 webview 发送 `modelDownloadProgress`；对所有源均失败的情况给出清晰错误
- [x] 2.5 以 `local_files_only: true` 加载 CLIP 视觉/文本与翻译模型；在会话内缓存已加载实例

## 3. 推理 worker（隔离）

- [x] 3.1 创建 Node `worker_thread` 入口，加载模型并暴露基于消息的操作（`index`、`embedText`、`score`、`ocr`）
- [x] 3.2 实现图像向量提取：读取缓冲、用 `sharp` 光栅化 SVG、构造 CLIP processor 输入、运行视觉模型、L2 归一化
- [x] 3.3 实现 OCR 文本提取（Tesseract worker 初始化/识别/释放），对单图失败容错
- [x] 3.4 使用配置的 `concurrency` 上限为批量索引实现并发控制
- [x] 3.5 从插件宿主接入 worker 生命周期（首次搜索时懒启动、复用预热 worker、deactivate/空闲时销毁）

## 4. 索引服务

- [x] 4.1 复用 `fast-glob` 扫描 + `IMAGE_EXT` 枚举工作区图片（遵循 `scanInclude`/`scanExclude`）
- [x] 4.2 定义索引条目类型 `{ filePath, vector, ocrText, mtime }` 及单工作区持久化路径（存于源码树之外的存储中）
- [x] 4.3 实现持久化索引（JSON）的读/写，以绝对路径为键
- [x] 4.4 实现增量构建：`mtime` 一致则复用、变更/新增则重算、删除则剔除
- [x] 4.5 发出 `indexProgress { processed, total }` 并支持取消
- [x] 4.6 确保单文件失败（读取/光栅化/向量/OCR）被捕获并跳过，不中断整批

## 5. 查询与排序

- [x] 5.1 实现中文检测（CJK 比例 > 0.5）与翻译为英文，失败时回退到原始查询
- [x] 5.2 实现 prompt 前缀剥离 + 5 个 prompt 的 ensemble，对查询向量做均值池化 + L2 归一化
- [x] 5.3 实现对索引的余弦 `clipScore` 与关键词覆盖率 `ocrScore`
- [x] 5.4 实现混合分 `(1-ocrWeight)*clipScore + ocrWeight*ocrScore`、`minScore` 过滤、降序排序、取前 N
- [x] 5.5 返回结果对象 `{ path, score, clipScore, ocrScore }`，并补充 webview `uri`/元数据以供渲染

## 6. 插件宿主接线

- [x] 6.1 在 `AssetViewProvider.onDidReceiveMessage` 中新增 `semanticSearch`、`buildIndex`、`cancelSearch` 处理
- [x] 6.2 编排首次使用流程：确保模型 → 确保/更新索引（带进度+取消）→ 运行查询 → 发送 `searchResults`
- [x] 6.3 保持 `activate()` 不含任何模型/索引工作（保留懒激活）；在 `extension.ts` 中注册新命令
- [x] 6.4 失败时发送 `searchError`，确保插件在下载/推理错误下绝不崩溃

## 7. Webview 界面

- [x] 7.1 在 `SearchBar` 附近新增语义搜索模式切换，以及发送 `semanticSearch` 的查询提交路径
- [x] 7.2 渲染排序结果（复用 `ImageSection` 卡片）并带匹配分徽标，按由高到低排序
- [x] 7.3 为模型下载与索引构建新增加载/进度界面（消费 `modelDownloadProgress` / `indexProgress`），支持取消
- [x] 7.4 处理空结果与错误状态；保留结果的定位/预览/拖拽行为
- [x] 7.5 在 `GUI/src/locales/en.ts` 与 `zh.ts` 中新增界面字符串

## 8. 验证

- [ ] 8.1 验证懒激活：打开含大量图片的工作区；确认激活时不下载/不索引且界面保持响应
- [ ] 8.2 验证首次运行模型下载 + 镜像回退到全局存储；第二次运行跳过下载
- [ ] 8.3 验证增量索引（未变更复用、变更重算、删除剔除）及重新打开后的持久化
- [ ] 8.4 验证英文与中文查询（如"箭头图标"）返回合理的由高到低排序结果，包含 SVG 图标
- [ ] 8.5 验证打包后的 `.vsix` 不含权重与索引文件，并能在干净机器上安装/运行
