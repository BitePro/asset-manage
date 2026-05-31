import * as https from "https";
import * as fs from "fs";
import * as path from "path";

export interface DownloadProgress {
  /** 正在下载的相对文件名 */
  file: string;
  /** 0-100，未知长度时为 -1 */
  percent: number;
}

/**
 * 下载单个 URL 到目标文件，跟随重定向；通过回调上报进度。
 * 失败时抛出错误（由上层做镜像回退）。
 */
export function downloadFile(
  url: string,
  destPath: string,
  label: string,
  onProgress?: (p: DownloadProgress) => void,
  redirectsLeft = 5,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const status = res.statusCode ?? 0;

      // 处理重定向（HF 会重定向到 CDN）
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          reject(new Error(`重定向次数过多: ${url}`));
          return;
        }
        const next = new URL(res.headers.location, url).toString();
        downloadFile(next, destPath, label, onProgress, redirectsLeft - 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (status !== 200) {
        res.resume();
        reject(new Error(`HTTP ${status}: ${url}`));
        return;
      }

      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const tmpPath = `${destPath}.partial`;
      const out = fs.createWriteStream(tmpPath);

      const total = Number(res.headers["content-length"] ?? 0);
      let received = 0;

      res.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (onProgress) {
          onProgress({
            file: label,
            percent: total > 0 ? Math.floor((received / total) * 100) : -1,
          });
        }
      });

      res.pipe(out);

      out.on("finish", () => {
        out.close(() => {
          try {
            fs.renameSync(tmpPath, destPath);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });

      out.on("error", (err) => {
        fs.rm(tmpPath, { force: true }, () => reject(err));
      });
    });

    req.on("error", reject);
    req.setTimeout(60000, () => {
      req.destroy(new Error(`下载超时: ${url}`));
    });
  });
}
