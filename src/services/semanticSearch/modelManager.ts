import * as fs from "fs";
import * as path from "path";
import { downloadFile, DownloadProgress } from "./download";
import {
  ModelManifest,
  requiredManifests,
  OCR_LANGS,
  OCR_TESSDATA_BASE,
} from "./models";

export interface EnsureProgress {
  file: string;
  percent: number;
}

/** 某个文件是否已存在于缓存中。 */
function fileCached(cacheDir: string, modelId: string, relFile: string): boolean {
  const full = path.join(cacheDir, modelId, relFile);
  try {
    return fs.statSync(full).size > 0;
  } catch {
    return false;
  }
}

/** OCR 语言包是否已缓存。 */
function ocrLangCached(cacheDir: string, lang: string): boolean {
  const full = path.join(cacheDir, "tessdata", `${lang}.traineddata`);
  try {
    return fs.statSync(full).size > 0;
  } catch {
    return false;
  }
}

/** 模型管理：检查缓存、按需下载（含镜像回退）。下载逻辑在宿主侧执行。 */
export class ModelManager {
  constructor(
    private readonly cacheDir: string,
    private readonly mirrors: string[],
  ) {}

  /** 返回所有缺失的模型文件（含 OCR 语言包，可选）。 */
  listMissing(ocrEnabled: boolean): Array<{ kind: "model" | "ocr"; modelId?: string; file: string }> {
    const missing: Array<{ kind: "model" | "ocr"; modelId?: string; file: string }> = [];
    for (const manifest of requiredManifests()) {
      for (const file of manifest.files) {
        if (!fileCached(this.cacheDir, manifest.modelId, file)) {
          missing.push({ kind: "model", modelId: manifest.modelId, file });
        }
      }
    }
    if (ocrEnabled) {
      for (const lang of OCR_LANGS) {
        if (!ocrLangCached(this.cacheDir, lang)) {
          missing.push({ kind: "ocr", file: `${lang}.traineddata` });
        }
      }
    }
    return missing;
  }

  /** 是否全部已缓存。 */
  isReady(ocrEnabled: boolean): boolean {
    return this.listMissing(ocrEnabled).length === 0;
  }

  /**
   * 确保所有所需文件存在；缺失则下载。
   * 通过 onProgress 上报进度，isCancelled 可中断。
   * 任一文件在所有镜像均失败时抛错。
   */
  async ensureAll(
    ocrEnabled: boolean,
    onProgress: (p: EnsureProgress) => void,
    isCancelled: () => boolean,
  ): Promise<void> {
    const missing = this.listMissing(ocrEnabled);
    let done = 0;
    for (const item of missing) {
      if (isCancelled()) throw new Error("已取消");
      if (item.kind === "model") {
        await this.downloadModelFile(item.modelId!, item.file, (p) =>
          onProgress(this.scaleProgress(item.file, p, done, missing.length)),
        );
      } else {
        await this.downloadOcrLang(item.file.replace(/\.traineddata$/, ""), (p) =>
          onProgress(this.scaleProgress(item.file, p, done, missing.length)),
        );
      }
      done++;
    }
  }

  private scaleProgress(
    file: string,
    p: DownloadProgress,
    doneCount: number,
    total: number,
  ): EnsureProgress {
    // 将"单文件进度"折算成"整体进度"，便于 UI 展示。
    const per = p.percent < 0 ? 0 : p.percent;
    const overall = Math.floor(((doneCount + per / 100) / total) * 100);
    return { file, percent: overall };
  }

  /** 下载某个模型文件，依次尝试镜像。 */
  private async downloadModelFile(
    modelId: string,
    relFile: string,
    onProgress: (p: DownloadProgress) => void,
  ): Promise<void> {
    const dest = path.join(this.cacheDir, modelId, relFile);
    const urls = this.mirrors.map(
      (host) => `https://${host}/${modelId}/resolve/main/${relFile}`,
    );
    await this.tryUrls(urls, dest, `${modelId}/${relFile}`, onProgress);
  }

  /** 下载 OCR 语言包。 */
  private async downloadOcrLang(
    lang: string,
    onProgress: (p: DownloadProgress) => void,
  ): Promise<void> {
    const dest = path.join(this.cacheDir, "tessdata", `${lang}.traineddata`);
    const urls = [`${OCR_TESSDATA_BASE}/${lang}.traineddata.gz`, `${OCR_TESSDATA_BASE}/${lang}.traineddata`];
    // tessdata_fast 提供 .gz 与原始文件；优先非压缩，避免额外解压依赖。
    await this.tryUrls(
      [`${OCR_TESSDATA_BASE}/${lang}.traineddata`],
      dest,
      `${lang}.traineddata`,
      onProgress,
    ).catch(async () => {
      // 退而求其次（理论上很少触发）
      await this.tryUrls(urls, dest, `${lang}.traineddata`, onProgress);
    });
  }

  /** 依次尝试一组 URL，全部失败才抛错。 */
  private async tryUrls(
    urls: string[],
    dest: string,
    label: string,
    onProgress: (p: DownloadProgress) => void,
  ): Promise<void> {
    let lastErr: unknown;
    for (const url of urls) {
      try {
        await downloadFile(url, dest, label, onProgress);
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    throw new Error(
      `下载失败（已尝试所有源）: ${label} - ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }`,
    );
  }
}
