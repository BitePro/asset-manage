// 语义搜索相关的共享类型定义（宿主与 worker 共用）。

/** 单条图片索引记录（参照 tel.md）。 */
export interface IndexEntry {
  /** 图片绝对路径 */
  filePath: string;
  /** L2 归一化后的图像向量 */
  vector: number[];
  /** OCR 识别出的文本（未启用 OCR 时为空字符串） */
  ocrText: string;
  /** 文件修改时间（毫秒） */
  mtime: number;
}

/** 搜索结果项。 */
export interface SearchResult {
  filePath: string;
  score: number;
  clipScore: number;
  ocrScore: number;
}

/** 宿主枚举出的待索引文件（路径 + 修改时间）。 */
export interface ScannedFile {
  filePath: string;
  mtime: number;
}

/** 从 VSCode 配置解析出的语义搜索配置。 */
export interface SemanticSearchConfig {
  enable: boolean;
  ocrEnabled: boolean;
  ocrWeight: number;
  topN: number;
  minScore: number;
  concurrency: number;
  /** 模型缓存目录覆盖（为空则使用全局存储） */
  modelCachePath: string;
  /** 下载镜像优先级，例如 ["huggingface.co", "hf-mirror.com"] */
  mirrors: string[];
}

// ---- worker 协议 ----

export type WorkerRequest =
  | { id: number; type: "loadModels"; cacheDir: string; ocrEnabled: boolean }
  | {
      id: number;
      type: "buildIndex";
      indexPath: string;
      files: ScannedFile[];
      ocrEnabled: boolean;
      concurrency: number;
    }
  | {
      id: number;
      type: "search";
      query: string;
      topN: number;
      minScore: number;
      ocrWeight: number;
    }
  | { id: number; type: "dispose" };

export type WorkerResponse =
  | { id: number; type: "result"; data: unknown }
  | { id: number; type: "error"; error: string }
  | {
      type: "progress";
      kind: "index";
      processed: number;
      total: number;
    };
