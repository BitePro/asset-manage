import * as vscode from "vscode";
import * as path from "path";
import { SemanticSearchConfig } from "./types";

/** 从 VSCode 配置读取语义搜索配置，并套用默认值与范围裁剪。 */
export function readConfig(): SemanticSearchConfig {
  const cfg = vscode.workspace.getConfiguration("assetManage.semanticSearch");

  const ocrWeight = clamp(cfg.get<number>("ocrWeight", 0.3), 0, 1);
  const topN = Math.max(1, Math.floor(cfg.get<number>("topN", 20)));
  const minScore = clamp(cfg.get<number>("minScore", 0.1), 0, 1);
  const concurrency = Math.max(1, Math.floor(cfg.get<number>("concurrency", 2)));

  return {
    enable: cfg.get<boolean>("enable", true),
    ocrEnabled: cfg.get<boolean>("ocrEnabled", false),
    ocrWeight,
    topN,
    minScore,
    concurrency,
    modelCachePath: cfg.get<string>("modelCachePath", "").trim(),
    mirrors: cfg.get<string[]>("mirrors", [
      "huggingface.co",
      "hf-mirror.com",
    ]),
  };
}

/**
 * 解析模型缓存目录：
 * 1) 配置项 modelCachePath
 * 2) 环境变量 IMAGE_SEARCH_MODEL_CACHE
 * 3) 插件全局存储目录下的 model-cache
 */
export function resolveModelCacheDir(
  context: vscode.ExtensionContext,
  cfg: SemanticSearchConfig,
): string {
  if (cfg.modelCachePath) return cfg.modelCachePath;
  const env = process.env.IMAGE_SEARCH_MODEL_CACHE;
  if (env && env.trim()) return env.trim();
  return path.join(context.globalStorageUri.fsPath, "model-cache");
}

/**
 * 解析当前工作区的索引文件路径（位于全局存储中，不污染源码树）。
 * 以工作区路径生成稳定的子目录名。
 */
export function resolveIndexPath(
  context: vscode.ExtensionContext,
  workspaceFsPath: string,
): string {
  const key = hashString(workspaceFsPath);
  return path.join(
    context.globalStorageUri.fsPath,
    "image-index",
    `${key}.json`,
  );
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/** 简单稳定哈希（用于按工作区区分索引文件名）。 */
function hashString(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}
