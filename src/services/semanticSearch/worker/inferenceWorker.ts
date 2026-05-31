import { parentPort } from "worker_threads";
import * as fs from "fs";
import * as path from "path";
import {
  IndexEntry,
  SearchResult,
  ScannedFile,
  WorkerRequest,
  WorkerResponse,
} from "../types";
import {
  isChineseQuery,
  stripPromptPrefix,
  buildPrompts,
  l2Normalize,
  cosineSimilarity,
  meanPool,
  ocrCoverageScore,
} from "../utils";
import { CLIP_MODEL_ID, TRANSLATION_MODEL_ID, OCR_LANGS } from "../models";

if (!parentPort) {
  throw new Error("inferenceWorker 必须作为 worker_thread 运行");
}
const port = parentPort;

const IMAGE_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".svg",
  ".ico",
]);

// ---- 运行时缓存的模型与索引（会话内复用，对应任务 2.5 / D2） ----
let transformers: any;
let sharpLib: any;
let tokenizer: any;
let processor: any;
let visionModel: any;
let textModel: any;
let translator: any;
let ocrWorker: any;
let cacheDirRef = "";
let ocrEnabledRef = false;

let index: IndexEntry[] = [];

function post(msg: WorkerResponse) {
  port.postMessage(msg);
}

/** 把 transformers 输出的张量转换为一维 number[]（取 batch 第一行）。 */
function tensorToVector(out: any, key: string): number[] {
  const tensor = out[key] ?? out;
  if (typeof tensor.tolist === "function") {
    const list = tensor.tolist();
    return Array.isArray(list[0]) ? list[0] : list;
  }
  // 退回到扁平 data
  const data: ArrayLike<number> = tensor.data ?? tensor;
  return Array.from(data as ArrayLike<number>);
}

/** 加载模型（仅本地缓存）。对应任务 2.5 / 10。 */
async function loadModels(cacheDir: string, ocrEnabled: boolean): Promise<void> {
  cacheDirRef = cacheDir;
  ocrEnabledRef = ocrEnabled;

  transformers = await import("@huggingface/transformers");
  const { env, AutoTokenizer, AutoProcessor, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, pipeline } =
    transformers;

  // 仅从本地缓存加载，禁止联网（下载在宿主侧已完成）。
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = cacheDir;
  env.cacheDir = cacheDir;

  if (!tokenizer) tokenizer = await AutoTokenizer.from_pretrained(CLIP_MODEL_ID);
  if (!processor) processor = await AutoProcessor.from_pretrained(CLIP_MODEL_ID);
  if (!visionModel)
    visionModel = await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL_ID, { dtype: "fp32" });
  if (!textModel)
    textModel = await CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL_ID, { dtype: "fp32" });
  if (!translator)
    translator = await pipeline("translation", TRANSLATION_MODEL_ID, { dtype: "q8" });

  if (ocrEnabled && !ocrWorker) {
    const Tesseract = await import("tesseract.js");
    const tessdata = path.join(cacheDir, "tessdata");
    ocrWorker = await Tesseract.createWorker(OCR_LANGS, 1, {
      langPath: tessdata,
      cachePath: tessdata,
      gzip: false,
    });
  }
}

/** 读取图片为可供视觉模型使用的 RawImage（SVG 先用 sharp 光栅化）。对应任务 3.2。 */
async function loadRawImage(filePath: string): Promise<any> {
  const { RawImage } = transformers;
  let buffer = await fs.promises.readFile(filePath);
  if (path.extname(filePath).toLowerCase() === ".svg") {
    if (!sharpLib) sharpLib = (await import("sharp")).default ?? (await import("sharp"));
    buffer = await sharpLib(buffer).png().toBuffer();
  }
  const blob = new Blob([buffer]);
  return await RawImage.fromBlob(blob);
}

/** 提取图像向量（L2 归一化）。对应任务 3.2。 */
async function extractImageVector(filePath: string): Promise<number[]> {
  const image = await loadRawImage(filePath);
  const inputs = await processor(image);
  const output = await visionModel(inputs);
  return l2Normalize(tensorToVector(output, "image_embeds"));
}

/** 提取 OCR 文本，失败返回空串。对应任务 3.3。 */
async function extractOcrText(filePath: string): Promise<string> {
  if (!ocrEnabledRef || !ocrWorker) return "";
  try {
    let buffer = await fs.promises.readFile(filePath);
    if (path.extname(filePath).toLowerCase() === ".svg") {
      if (!sharpLib) sharpLib = (await import("sharp")).default ?? (await import("sharp"));
      buffer = await sharpLib(buffer).png().toBuffer();
    }
    const { data } = await ocrWorker.recognize(buffer);
    return (data.text ?? "").trim();
  } catch {
    return "";
  }
}

/** 文本编码（单条 prompt），L2 归一化。 */
async function embedText(text: string): Promise<number[]> {
  const inputs = tokenizer(text, { padding: true, truncation: true });
  const output = await textModel(inputs);
  return l2Normalize(tensorToVector(output, "text_embeds"));
}

/** 中文查询翻译为英文，失败回退原文。对应任务 5.1。 */
async function translateToEnglish(query: string): Promise<string> {
  try {
    const result = await translator(query);
    const text = Array.isArray(result) ? result[0]?.translation_text : result?.translation_text;
    return text && text.trim() ? text.trim() : query;
  } catch {
    return query;
  }
}

/** 增量构建索引。对应任务 4.3 / 4.4 / 4.6 / 3.4。 */
async function buildIndex(
  indexPath: string,
  files: ScannedFile[],
  concurrency: number,
): Promise<number> {
  // 载入已有索引
  const previous = loadIndexFile(indexPath);
  const prevByPath = new Map(previous.map((e) => [e.filePath, e]));

  const result: IndexEntry[] = [];
  const total = files.length;
  let processed = 0;

  // 并发池（对应任务 3.4 / 并发上限）
  let cursor = 0;
  const workers: Promise<void>[] = [];
  const limit = Math.max(1, concurrency);

  const runOne = async (file: ScannedFile): Promise<void> => {
    try {
      const old = prevByPath.get(file.filePath);
      if (old && Math.abs(old.mtime - file.mtime) < 100) {
        // mtime 一致 → 复用
        result.push(old);
      } else {
        const vector = await extractImageVector(file.filePath);
        const ocrText = await extractOcrText(file.filePath);
        result.push({ filePath: file.filePath, vector, ocrText, mtime: file.mtime });
      }
    } catch {
      // 单文件失败：跳过，不中断整批（任务 4.6）
    } finally {
      processed++;
      post({ type: "progress", kind: "index", processed, total });
    }
  };

  const pump = async (): Promise<void> => {
    while (cursor < files.length) {
      const i = cursor++;
      await runOne(files[i]);
    }
  };

  for (let i = 0; i < limit; i++) workers.push(pump());
  await Promise.all(workers);

  index = result;
  saveIndexFile(indexPath, result);
  return result.length;
}

function loadIndexFile(indexPath: string): IndexEntry[] {
  try {
    const raw = fs.readFileSync(indexPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveIndexFile(indexPath: string, entries: IndexEntry[]): void {
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(entries), "utf8");
}

/** 执行查询。对应任务 5.x。 */
async function search(
  query: string,
  topN: number,
  minScore: number,
  ocrWeight: number,
): Promise<SearchResult[]> {
  if (index.length === 0) return [];

  // 1) 中文 → 英文
  let effective = query;
  if (isChineseQuery(query)) {
    effective = await translateToEnglish(query);
  }

  // 2) 去前缀 + 3) 5-prompt ensemble + 4) mean-pool 归一化
  const subject = stripPromptPrefix(effective);
  const prompts = buildPrompts(subject);
  const promptVectors: number[][] = [];
  for (const p of prompts) {
    promptVectors.push(await embedText(p));
  }
  const queryVector = meanPool(promptVectors);

  // 5) 逐项打分
  const results: SearchResult[] = [];
  for (const entry of index) {
    const clipScore = cosineSimilarity(queryVector, entry.vector);
    const ocrScore = ocrWeight > 0 ? ocrCoverageScore(query, entry.ocrText) : 0;
    const score = (1 - ocrWeight) * clipScore + ocrWeight * ocrScore;
    results.push({ filePath: entry.filePath, score, clipScore, ocrScore });
  }

  return results
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

async function dispose(): Promise<void> {
  try {
    if (ocrWorker) await ocrWorker.terminate();
  } catch {
    /* ignore */
  }
  ocrWorker = undefined;
}

port.on("message", async (msg: WorkerRequest) => {
  try {
    switch (msg.type) {
      case "loadModels":
        await loadModels(msg.cacheDir, msg.ocrEnabled);
        post({ id: msg.id, type: "result", data: { ready: true } });
        break;
      case "buildIndex": {
        const count = await buildIndex(msg.indexPath, msg.files, msg.concurrency);
        post({ id: msg.id, type: "result", data: { count } });
        break;
      }
      case "search": {
        const results = await search(msg.query, msg.topN, msg.minScore, msg.ocrWeight);
        post({ id: msg.id, type: "result", data: results });
        break;
      }
      case "dispose":
        await dispose();
        post({ id: msg.id, type: "result", data: { disposed: true } });
        break;
    }
  } catch (err) {
    post({
      id: (msg as { id: number }).id,
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// 让未使用的导入不被裁剪（类型用途）
void cacheDirRef;
