import * as vscode from "vscode";
import { SearchResult, SemanticSearchConfig } from "./types";
import { readConfig, resolveModelCacheDir, resolveIndexPath } from "./config";
import { ModelManager } from "./modelManager";
import { InferenceWorkerClient } from "./workerClient";
import { enumerateImages } from "./indexService";
import { log, error } from "../../utils/logger";

export interface SearchCallbacks {
  onModelDownloadProgress?: (file: string, percent: number) => void;
  onIndexProgress?: (processed: number, total: number) => void;
}

/**
 * 语义搜索宿主编排器：确保模型 → 确保/更新索引 → 执行查询。
 * 全程懒加载，绝不在 activate 时触发。对应任务 6.2 / 28、30。
 */
export class SearchController {
  private worker?: InferenceWorkerClient;
  private indexBuiltOnce = false;
  /** 转发给 webview 的索引进度回调（与 VSCode 进度并行）。 */
  private webviewIndexProgress?: (processed: number, total: number) => void;
  private indexProgressCb?: (processed: number, total: number) => void;

  constructor(private readonly context: vscode.ExtensionContext) {}

  private getWorker(): InferenceWorkerClient {
    if (!this.worker) {
      this.worker = new InferenceWorkerClient(
        InferenceWorkerClient.resolveEntry(),
        (processed, total) => this.indexProgressCb?.(processed, total),
      );
    }
    return this.worker;
  }

  /**
   * 执行一次语义搜索。返回排序结果。
   * 出错时抛出（由调用方转成 searchError，确保插件不崩溃）。
   */
  async search(
    query: string,
    callbacks: SearchCallbacks = {},
  ): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) throw new Error("请先打开一个工作区");

    const cfg = readConfig();
    if (!cfg.enable) throw new Error("语义搜索未启用（assetManage.semanticSearch.enable）");

    const cacheDir = resolveModelCacheDir(this.context, cfg);
    const indexPath = resolveIndexPath(this.context, workspace.uri.fsPath);

    // 1) 确保模型（首次按需下载）
    await this.ensureModels(cfg, cacheDir, callbacks);

    // 2) worker 内加载模型
    const worker = this.getWorker();
    await worker.loadModels(cacheDir, cfg.ocrEnabled);

    // 3) 确保/更新索引
    this.webviewIndexProgress = callbacks.onIndexProgress;
    await this.ensureIndex(workspace.uri.fsPath, indexPath, cfg);

    // 4) 查询
    return worker.search(trimmed, cfg.topN, cfg.minScore, cfg.ocrWeight);
  }

  /** 显式重建/更新索引（命令入口用）。 */
  async buildIndex(callbacks: SearchCallbacks = {}): Promise<number> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) throw new Error("请先打开一个工作区");
    const cfg = readConfig();
    const cacheDir = resolveModelCacheDir(this.context, cfg);
    const indexPath = resolveIndexPath(this.context, workspace.uri.fsPath);

    await this.ensureModels(cfg, cacheDir, callbacks);
    const worker = this.getWorker();
    await worker.loadModels(cacheDir, cfg.ocrEnabled);
    this.webviewIndexProgress = callbacks.onIndexProgress;
    return this.runIndex(workspace.uri.fsPath, indexPath, cfg);
  }

  private async ensureModels(
    cfg: SemanticSearchConfig,
    cacheDir: string,
    callbacks: SearchCallbacks,
  ): Promise<void> {
    const manager = new ModelManager(cacheDir, cfg.mirrors);
    if (manager.isReady(cfg.ocrEnabled)) return;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t("Asset Manage: downloading search models"),
        cancellable: true,
      },
      async (progress, token) => {
        let last = 0;
        await manager.ensureAll(
          cfg.ocrEnabled,
          (p) => {
            const inc = Math.max(0, p.percent - last);
            last = p.percent;
            progress.report({ increment: inc, message: `${p.file} ${p.percent}%` });
            callbacks.onModelDownloadProgress?.(p.file, p.percent);
          },
          () => token.isCancellationRequested,
        );
      },
    );
  }

  private async ensureIndex(
    workspaceFsPath: string,
    indexPath: string,
    cfg: SemanticSearchConfig,
  ): Promise<void> {
    // 会话内首次搜索时构建/更新一次；后续查询直接复用 worker 内存索引。
    if (this.indexBuiltOnce) return;
    await this.runIndex(workspaceFsPath, indexPath, cfg);
  }

  private async runIndex(
    workspaceFsPath: string,
    indexPath: string,
    cfg: SemanticSearchConfig,
  ): Promise<number> {
    const files = await enumerateImages(workspaceFsPath);
    log(`🔎 语义索引：发现 ${files.length} 张图片`);
    const worker = this.getWorker();
    const count = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t("Asset Manage: building image index"),
        cancellable: true,
      },
      async (progress, token) => {
        let last = 0;
        const cancel = token.onCancellationRequested(() => {
          void worker.cancelActive();
        });
        this.indexProgressCb = (processed, total) => {
          const pct = total > 0 ? Math.floor((processed / total) * 100) : 0;
          const inc = Math.max(0, pct - last);
          last = pct;
          progress.report({ increment: inc, message: `${processed}/${total}` });
          this.webviewIndexProgress?.(processed, total);
        };
        try {
          return await worker.buildIndex(indexPath, files, cfg.ocrEnabled, cfg.concurrency);
        } finally {
          cancel.dispose();
          this.indexProgressCb = undefined;
          this.webviewIndexProgress = undefined;
        }
      },
    );
    this.indexBuiltOnce = true;
    log(`✅ 语义索引完成：${count} 条`);
    return count;
  }

  async cancelActive(): Promise<void> {
    await this.worker?.cancelActive();
    this.indexBuiltOnce = false;
  }

  async dispose(): Promise<void> {
    try {
      await this.worker?.dispose();
    } catch (err) {
      error("释放语义搜索 worker 失败", err);
    }
    this.worker = undefined;
  }
}
