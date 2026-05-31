import { Worker } from "worker_threads";
import * as path from "path";
import {
  ScannedFile,
  SearchResult,
  WorkerRequest,
  WorkerResponse,
} from "./types";
import { log, error } from "../../utils/logger";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

/**
 * 宿主侧 worker 句柄：懒启动、复用预热实例、提供基于 Promise 的 RPC，
 * 并把索引进度通过回调转发给上层。对应任务 3.5 / 15。
 */
export class InferenceWorkerClient {
  private worker?: Worker;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private modelsLoaded = false;

  constructor(
    /** 编译后 worker 入口的绝对路径（out/.../inferenceWorker.js） */
    private readonly workerEntry: string,
    private readonly onIndexProgress: (processed: number, total: number) => void,
  ) {}

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    log(`🧵 启动推理 worker: ${this.workerEntry}`);
    const worker = new Worker(this.workerEntry);
    worker.on("message", (msg: WorkerResponse) => this.handleMessage(msg));
    worker.on("error", (err) => {
      error("推理 worker 错误", err);
      this.rejectAll(err);
    });
    worker.on("exit", (code) => {
      log(`🧵 推理 worker 退出，code=${code}`);
      if (code !== 0) this.rejectAll(new Error(`worker 异常退出 code=${code}`));
      this.worker = undefined;
      this.modelsLoaded = false;
    });
    this.worker = worker;
    return worker;
  }

  private handleMessage(msg: WorkerResponse) {
    if (msg.type === "progress") {
      if (msg.kind === "index") this.onIndexProgress(msg.processed, msg.total);
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.type === "result") p.resolve(msg.data);
    else p.reject(new Error(msg.error));
  }

  private rejectAll(err: unknown) {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }

  private request<T>(make: (id: number) => WorkerRequest): Promise<T> {
    const worker = this.ensureWorker();
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      worker.postMessage(make(id));
    });
  }

  /** 确保模型已在 worker 内加载（会话内只触发一次）。 */
  async loadModels(cacheDir: string, ocrEnabled: boolean): Promise<void> {
    if (this.modelsLoaded) return;
    await this.request((id) => ({ id, type: "loadModels", cacheDir, ocrEnabled }));
    this.modelsLoaded = true;
  }

  async buildIndex(
    indexPath: string,
    files: ScannedFile[],
    ocrEnabled: boolean,
    concurrency: number,
  ): Promise<number> {
    const res = await this.request<{ count: number }>((id) => ({
      id,
      type: "buildIndex",
      indexPath,
      files,
      ocrEnabled,
      concurrency,
    }));
    return res.count;
  }

  async search(
    query: string,
    topN: number,
    minScore: number,
    ocrWeight: number,
  ): Promise<SearchResult[]> {
    return this.request<SearchResult[]>((id) => ({
      id,
      type: "search",
      query,
      topN,
      minScore,
      ocrWeight,
    }));
  }

  /** 释放 worker（deactivate 时调用）。 */
  async dispose(): Promise<void> {
    if (!this.worker) return;
    try {
      await this.request((id) => ({ id, type: "dispose" }));
    } catch {
      /* ignore */
    }
    await this.worker.terminate();
    this.worker = undefined;
    this.modelsLoaded = false;
  }

  /** 取消当前推理/索引任务：终止 worker，并拒绝所有挂起请求。 */
  async cancelActive(): Promise<void> {
    if (!this.worker) return;
    const worker = this.worker;
    this.worker = undefined;
    this.modelsLoaded = false;
    this.rejectAll(new Error("已取消语义搜索"));
    await worker.terminate();
  }

  /** worker 入口路径（基于当前编译产物目录推导）。 */
  static resolveEntry(): string {
    // 编译后本文件位于 out/services/semanticSearch/workerClient.js
    return path.join(__dirname, "worker", "inferenceWorker.js");
  }
}
