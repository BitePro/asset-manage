# image-search-desc 技术方案总结

本文档只总结当前项目已经落地的技术实现，供其他项目复用同一方案时参考。内容以当前代码为准，不包含未实现设想。

## 1. 项目定位

这是一个本地离线运行的图片搜索 CLI。目标是基于自然语言描述，在指定目录下的图片集合中检索语义匹配结果，并结合 OCR 文本做辅助排序。

核心特点：

- 本地执行，无云 API 依赖
- 索引与搜索分离
- 图像语义检索使用 CLIP
- 图片文字检索使用 Tesseract OCR
- 中文查询先翻译成英文再做 CLIP 搜索
- 搜索结果可在 iTerm2 中内联预览

## 2. 技术栈

### 运行时与工程基础

- Node.js 18+
- TypeScript
- ESM 模块体系
- `tsc` 编译到 `dist/`
- `tsx` 用于开发态直接运行

### 主要依赖

- `@huggingface/transformers`
  - 在 Node.js 中加载本地/缓存的 ONNX 模型
  - 用于 CLIP 图像编码、CLIP 文本编码、中文到英文翻译
- `tesseract.js`
  - 离线 OCR
  - 当前语言包：`eng`、`chi_sim`
- `sharp`
  - 处理 SVG 光栅化
- `commander`
  - CLI 命令定义
- `ora`
  - 终端 spinner
- `chalk`
  - 终端彩色输出

## 3. 命令入口

CLI 入口在 `src/index.ts`，只提供两个命令：

- `index <directory>`
  - 扫描目录
  - 提取图像向量和 OCR 文本
  - 生成或更新 `.image-index.json`
- `search <directory> <query>`
  - 读取已有索引
  - 对查询做文本编码
  - 计算语义分和 OCR 分
  - 输出排序结果

搜索命令支持两个参数：

- `--top <number>`：返回结果数量，默认 `10`
- `--ocr-weight <number>`：OCR 权重，范围 `0-1`，默认 `0.3`

搜索前会先检查目录下是否存在 `.image-index.json`，不存在则直接报错，不会先加载模型。

## 4. 模块划分

### `src/index.ts`

- CLI 定义
- 参数解析
- 搜索前的索引存在性校验
- 模型加载 spinner
- 调用索引和搜索主流程

### `src/indexer.ts`

- 递归扫描图片目录
- 处理支持格式
- SVG 光栅化
- 图像向量提取
- OCR 文本提取
- 增量索引
- 索引文件读写

### `src/searcher.ts`

- 查询预处理
- 中文查询检测
- 中文转英文
- CLIP 文本编码
- OCR 分计算
- 混合评分与排序

### `src/model.ts`

- CLIP 模型文件下载
- Hugging Face 缓存目录配置
- CLIP 视觉模型加载
- CLIP 文本模型加载
- 模型实例缓存

### `src/translator.ts`

- 中文到英文翻译模型文件下载
- 翻译 pipeline 加载
- 查询翻译

### `src/ocr.ts`

- OCR 语言包下载
- Tesseract worker 初始化
- OCR 执行与释放

### `src/display.ts`

- iTerm2 环境检测
- `imgcat` 可用性检测
- 搜索结果终端输出

### `src/utils.ts`

- 模型缓存目录解析
- 向量归一化
- 余弦相似度
- 中文检测

## 5. 模型与缓存策略

### 缓存目录

默认缓存目录为项目根目录：

```text
.model-cache/
```

也可以通过环境变量覆盖：

```bash
IMAGE_SEARCH_MODEL_CACHE=/custom/path
```

当前 `.gitignore` 已忽略：

- `.model-cache/`
- `*.image-index.json`

### CLIP 模型

当前使用模型：

- `Xenova/clip-vit-base-patch32`

在代码中拆成两部分加载：

- 视觉模型：`CLIPVisionModelWithProjection`
- 文本模型：`CLIPTextModelWithProjection`

项目不会直接依赖 Hugging Face 默认下载逻辑，而是先手动确保关键文件已下载到本地，再调用 `from_pretrained(...)`。

当前显式下载的文件包括：

- tokenizer 文件
  - `tokenizer.json`
  - `tokenizer_config.json`
  - `special_tokens_map.json`
- processor 文件
  - `preprocessor_config.json`
- ONNX 文件
  - `onnx/vision_model.onnx`
  - `onnx/text_model.onnx`

下载源有两个，按顺序回退：

- `https://huggingface.co`
- `https://hf-mirror.com`

### 翻译模型

当前中文查询翻译模型：

- `Xenova/opus-mt-zh-en`

用途：

- 仅在查询被判定为中文时，将查询翻译成英文，再进入 CLIP 文本编码

当前通过 `pipeline('translation', ...)` 加载，配置为：

- `dtype: 'q8'`
- `local_files_only: true`

翻译模型文件同样先手动下载到本地，再从本地加载。

### OCR 语言包

OCR 使用 `tesseract.js`，语言包下载到：

```text
.model-cache/tessdata/
```

当前语言包：

- `eng`
- `chi_sim`

下载源：

- `https://github.com/tesseract-ocr/tessdata_fast/raw/main`

## 6. 索引方案

### 支持格式

当前只索引以下图片扩展名：

- `.jpg`
- `.jpeg`
- `.png`
- `.webp`
- `.gif`
- `.svg`

### 目录扫描

索引通过递归遍历目录完成，不依赖外部文件系统监听。

实现特点：

- 遇到不可读目录会跳过
- 仅收集支持的图片文件
- 非图片文件直接忽略

### SVG 处理

CLIP 只能处理像素图，不能直接处理 SVG。

当前方案：

- 读取 SVG 文件
- 用 `sharp(buffer).png().toBuffer()` 光栅化
- 将结果作为后续视觉编码输入

### 图像向量提取

索引阶段会为每张图片生成向量，流程如下：

1. 读取图片二进制
2. 如果是 SVG，先转成 PNG buffer
3. 通过 `RawImage.fromBlob(...)` 构造输入
4. 调用 CLIP processor 生成模型输入
5. 调用视觉模型得到 `image_embeds`
6. 将向量做 L2 归一化

当前代码直接调用模型本身，而不是走更高层封装方法。

### OCR 提取

索引阶段同步执行 OCR：

1. 初始化 Tesseract worker
2. 对图片 buffer 调用 `recognize`
3. 提取 `result.data.text`
4. 去首尾空白后存入索引

OCR 失败时不会中断整张图索引流程之外的其他任务；当前实现是整张图在 `try/catch` 内处理，某张图任一步骤报错会跳过该图并继续后续文件。

### 增量索引

增量依据是文件修改时间 `mtimeMs`。

逻辑：

- 先加载已有 `.image-index.json`
- 按 `filePath` 建立映射
- 若旧记录存在，且旧 `mtime` 与当前 `mtimeMs` 差值小于 `100`，则复用旧记录
- 否则重新提取向量和 OCR

这意味着：

- 已删除文件不会出现在新的扫描结果中，因此会自然从新索引中移除
- 仅用 `mtime` 判断，不比较文件内容 hash

### 索引文件结构

索引文件名固定：

```text
.image-index.json
```

存储结构是 JSON 数组，每项字段如下：

```ts
interface IndexEntry {
  filePath: string;
  vector: number[];
  ocrText: string;
  mtime: number;
}
```

说明：

- `filePath`：图片绝对路径
- `vector`：归一化后的图像向量，存为普通数字数组
- `ocrText`：OCR 识别出的原始文本
- `mtime`：文件修改时间，单位毫秒

## 7. 搜索方案

### 搜索前提

搜索必须依赖已存在的 `.image-index.json`。当前实现不支持搜索时自动补建索引。

### 中文查询检测

中文检测逻辑在 `src/utils.ts`：

- 去掉空白字符
- 统计 CJK 字符数
- 若 CJK 占非空白字符比例大于 `0.5`，则视为中文查询

### 中文查询翻译

如果查询被识别为中文：

- 调用 `translateToEnglish(query)`
- 翻译成功则用英文查询参与 CLIP 编码
- 翻译失败则回退到原始查询

注意：当前真实实现不是“中文原文和英文版本双路取最大分”，而是“翻译成英文后只走英文 CLIP 检索”。

### 查询 prompt 构造

当前搜索不会直接只编码原始 query，而是先构造一组 prompt，再做 ensemble。

处理步骤：

1. 如 query 是中文，先翻译成英文
2. 去掉可能已有的前缀
   - `a photo of `
   - `an image of `
   - `a picture of `
   - `photo of `
   - `image of `
3. 得到裸主题 `subject`
4. 构造 5 个 prompt

当前 prompt 模板：

- `a photo of ${subject}`
- `an image of ${subject}`
- `a picture of ${subject}`
- `a photograph showing ${subject}`
- `${subject}`

### 文本向量提取

每个 prompt 都会：

1. 用 tokenizer 编码
2. 送入 CLIP 文本模型
3. 取 `text_embeds`
4. 做 L2 归一化

随后将多个 prompt 的向量做平均，再次归一化，得到最终查询向量。

### 相似度计算

图片向量和查询向量均已归一化，因此语义分通过余弦相似度计算。

实现为手写点积公式：

```text
cosine = dot(a, b) / (|a| * |b|)
```

### OCR 分计算

OCR 分只在搜索阶段计算，不在索引阶段预先算好。

逻辑：

1. 将原始 query 转小写
2. 去掉非单词、非中文字符
3. 以空白切词
4. 过滤长度小于等于 1 的 token
5. 统计有多少 query token 出现在图片 `ocrText` 中
6. 用 `matched / queryTokens.length` 作为 `ocrScore`

这是一个简单的关键词覆盖率匹配，不是 BM25、倒排索引或模糊匹配。

### 混合评分

最终评分公式：

```text
finalScore = (1 - ocrWeight) * clipScore + ocrWeight * ocrScore
```

默认参数：

- `ocrWeight = 0.3`

即默认：

```text
finalScore = 0.7 * clipScore + 0.3 * ocrScore
```

### 结果过滤、排序与截断

搜索结果处理顺序：

1. 为每个索引项计算
   - `clipScore`
   - `ocrScore`
   - `score`
2. 过滤 `score < 0.1` 的结果
3. 按 `score` 倒序排序
4. 截取前 `topN` 项

返回结构：

```ts
interface SearchResult {
  filePath: string;
  score: number;
  clipScore: number;
  ocrScore: number;
}
```

## 8. 终端展示方案

### iTerm2 检测

内联图片展示不是通用终端能力，当前只支持 iTerm2。

启用条件：

- `process.env.TERM_PROGRAM === 'iTerm.app'`
- 系统中可执行 `imgcat`

### 结果输出

搜索结果输出内容包括：

- 搜索标题
- 命中数量
- 每个结果的路径和分数
- 可选的图片内联展示
- 完成摘要

分数颜色规则：

- `>= 0.3`：绿色
- `>= 0.2 && < 0.3`：黄色
- `< 0.2`：弱化显示

如果不满足 iTerm2 条件：

- 仅输出文字结果
- 额外提示安装 iTerm2 以启用预览

## 9. 异常与降级策略

### 模型和语言包下载失败

- 首次下载失败会直接抛错
- CLI 捕获后打印错误并退出

### 索引文件不存在

- 搜索命令直接报错
- 提示先执行 `index`

### 单文件处理失败

索引阶段对单张图片的处理是容错的：

- 图像读取失败
- SVG 光栅化失败
- 向量提取失败
- OCR 失败

都会导致该文件被跳过，并继续处理下一张。

### OCR / 翻译运行失败

- `extractOcrText` 失败时返回空字符串
- `translateToEnglish` 失败时返回原始文本

### 非 iTerm2 环境

- 不影响搜索能力
- 仅失去图片预览能力

## 10. 当前实现的关键约束

其他项目复用这套方案时，需要注意这些约束：

- 当前是 CLI 设计，不包含 UI 层抽象
- 索引存储是目录级 JSON 文件，不是数据库
- 检索是全量遍历索引做线性计算，不是 ANN 向量检索
- 中文语义搜索依赖先翻译成英文，不是多语言 CLIP
- OCR 评分是简单关键词包含，不是全文检索系统
- 增量索引只基于 `mtime`，不基于文件内容摘要
- 图片预览能力绑定 iTerm2 + `imgcat`

## 11. 适合迁移到其他项目的实现骨架

如果要在另一个 VSCode 插件项目里复用当前方案，最小可迁移能力可以拆成以下 6 层：

1. 文件扫描层
   - 遍历目标目录
   - 过滤支持格式
2. 模型资源层
   - 管理 `.model-cache`
   - 下载并加载 CLIP、翻译模型、OCR 语言包
3. 索引构建层
   - 图像向量提取
   - OCR 文本提取
   - 索引序列化
4. 查询处理层
   - 中文检测
   - 中文转英文
   - prompt ensemble 编码
5. 检索排序层
   - 余弦相似度
   - OCR 覆盖率得分
   - 混合排序
6. 展示层
   - CLI / VSCode 插件结果渲染

其中 1-5 层是当前项目的核心技术方案，6 层可以按新项目形态替换。

## 12. 当前代码文件映射

- `src/index.ts`：CLI 入口
- `src/indexer.ts`：索引构建
- `src/searcher.ts`：查询与检索
- `src/model.ts`：CLIP 模型下载与加载
- `src/translator.ts`：中文翻译模型
- `src/ocr.ts`：OCR 初始化与识别
- `src/display.ts`：终端展示
- `src/utils.ts`：公共工具函数