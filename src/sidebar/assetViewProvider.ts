import * as vscode from "vscode";
import * as path from "path";
import fg from "fast-glob";
import { toHumanSize, statSafe } from "../utils/fsUtils";
import { log } from "../utils/logger";
import {
  detectResourceType,
  IMAGE_EXT,
  AUDIO_EXT,
  VIDEO_EXT,
  FONT_EXT,
  OFFICE_EXT,
  OTHER_STATIC_EXT,
  isResourceExt,
} from "../services/mediaInfo";

export class AssetViewProvider implements vscode.WebviewViewProvider {
  private webviewView?: vscode.WebviewView;
  private fontCharsetCache = new Map<string, string>();
  private static readonly FONT_CHARSET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`~!@#$%^&*()_+-=[]{};:'\",.<>?/\\|一二三四五六七八九十春夏秋冬東南西北风雨雷电云山海川湖田木林森花草鸟鱼虫日月星辰天地人和";

  constructor(
    private readonly viewId: "fonts" | "images",
    private readonly extensionUri: vscode.Uri,
  ) {
    log(`🏗️ AssetViewProvider 构造函数被调用，viewId: ${viewId}`);
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken,
  ) {
    log(`🎬 resolveWebviewView 被调用！viewId: ${this.viewId}`);
    log(`📋 context.state: ${JSON.stringify(context.state)}`);

    this.webviewView = webviewView;
    log(`✅ ${this.viewId} 视图初始化开始`);

    // 配置 webview 权限
    const workspaceRoots =
      vscode.workspace.workspaceFolders?.map((f) => f.uri) || [];
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri, ...workspaceRoots],
      // 允许加载外部资源（开发模式需要）
      enableCommandUris: true,
    };

    // 处理来自 webview 的消息
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      // 兼容 msg.command 与 msg.type，避免前端与扩展端字段不一致
      const command = msg.command ?? msg.type;
      if (command === "refresh") {
        log(`🔄 用户手动点击刷新 ${this.viewId} 视图`);
        await vscode.commands.executeCommand("assetManage.refreshIndexes");
        webviewView.webview.postMessage({ type: "refreshDone" });
      } else if (command === "getData") {
        log(`📥 前端请求数据`);
        await this.sendDataToWebview();
      } else if (command === "reveal" && msg.path) {
        vscode.commands.executeCommand(
          "revealInExplorer",
          vscode.Uri.file(msg.path),
        );
      } else if ((command === "open" || command === "openFile") && msg.path) {
        vscode.workspace
          .openTextDocument(vscode.Uri.file(msg.path))
          .then((doc) => vscode.window.showTextDocument(doc));
      }
    });

    // 立即进行初次渲染
    log(`🎨 执行 ${this.viewId} 视图初次渲染`);
    this.render();
  }

  /**
   * 重新拉取数据并发送到 webview（供外部命令调用）
   */
  async refreshData() {
    log(`外部触发刷新 ${this.viewId} 视图`);
    await this.sendDataToWebview();
  }

  /**
   * 渲染视图内容
   */
  private async render() {
    if (!this.webviewView) {
      log(`⚠️ ${this.viewId} 视图尚未初始化，跳过渲染`);
      return;
    }

    try {
      log(`🎨 开始渲染 ${this.viewId} 视图...`);
      const html = this.getWebviewContent(this.webviewView.webview);
      this.webviewView.webview.html = html;

      // 等待 webview 加载完成后再发送数据
      setTimeout(async () => {
        await this.sendDataToWebview();
      }, 500);

      log(`✅ ${this.viewId} 视图渲染完成`);
    } catch (error) {
      log(`❌ ${this.viewId} 视图渲染失败: ${error}`);
      vscode.window.showErrorMessage(`渲染视图失败: ${error}`);
      throw error;
    }
  }

  /**
   * 获取 Webview HTML 内容，加载 React 应用
   */
  private getWebviewContent(webview: vscode.Webview): string {
    const guiDistPath = vscode.Uri.joinPath(this.extensionUri, "GUI", "dist");
    const indexHtmlPath = vscode.Uri.joinPath(guiDistPath, "index.html");

    // 读取打包后的 index.html
    try {
      const fs = require("fs");
      let htmlContent = fs.readFileSync(indexHtmlPath.fsPath, "utf8");

      // 检查是否是开发模式（HTML 中包含 localhost）
      const isDevMode = htmlContent.includes("localhost:");

      if (isDevMode) {
        // 开发模式：直接返回，不需要替换路径
        log(`🔧 开发模式：使用 Vite 开发服务器`);
        return this.injectCSP(htmlContent, webview);
      } else {
        // 生产模式：替换资源路径为 webview URI
        log(`📦 生产模式：加载打包后的资源`);
        htmlContent = htmlContent.replace(
          /(href|src)="([^"]+)"/g,
          (match: string, attr: string, path: string) => {
            if (path.startsWith("http") || path.startsWith("//")) {
              return match;
            }
            const resourceUri = webview.asWebviewUri(
              vscode.Uri.joinPath(guiDistPath, path.replace(/^\.\//, "")),
            );
            return `${attr}="${resourceUri}"`;
          },
        );
        return this.injectCSP(htmlContent, webview);
      }
    } catch (error) {
      log(`❌ 读取 GUI/dist/index.html 失败: ${error}`);
      // 返回错误提示页面
      return this.getErrorHtml();
    }
  }

  /**
   * 注入 CSP（内容安全策略）
   */
  private injectCSP(htmlContent: string, webview: vscode.Webview): string {
    const nonce = this.getNonce();

    // 生成 CSP
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data: https:`,
      // 允许从 CDN 加载 PDF.js，以及 localhost（开发模式）
      `script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com http://localhost:*`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      // 允许连接到 localhost 和 CDN（用于 worker）
      `connect-src ${webview.cspSource} http://localhost:* ws://localhost:* https://cdnjs.cloudflare.com`,
      // 关键：允许加载 PDF 和其他媒体
      `media-src ${webview.cspSource} data:`,
      `object-src ${webview.cspSource}`,
      `frame-src ${webview.cspSource} data:`,
      // 允许 Web Worker（PDF.js 需要）
      `worker-src ${webview.cspSource} blob: https://cdnjs.cloudflare.com`,
    ].join("; ");

    // 在 <head> 标签后注入 CSP meta 标签
    if (htmlContent.includes("<head>")) {
      htmlContent = htmlContent.replace(
        "<head>",
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`,
      );
    }

    return htmlContent;
  }

  /**
   * 生成随机 nonce
   */
  private getNonce(): string {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * 发送数据到 Webview
   */
  private async sendDataToWebview() {
    if (!this.webviewView) return;

    if (this.viewId === "fonts") {
      const fontData = await this.getFontData();
      log(`📤 发送字体数据: ${fontData.length} 个字体`);
      this.webviewView.webview.postMessage({
        type: "fontData",
        data: fontData,
      });
    } else {
      const assetData = await this.getAssetData();
      log(`📤 发送资源数据`);
      this.webviewView.webview.postMessage({
        type: "assetData",
        data: assetData,
      });
    }
  }

  /**
   * 按需扫描工作区，返回所有静态资源文件（去除 node_modules/.git 等）
   */
  private async listAllAssets(): Promise<vscode.Uri[]> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) return [];
    const cwd = workspace.uri.fsPath;

    const config = vscode.workspace.getConfiguration("assetManage");
    const include = config.get<string[]>("scanInclude") ?? ["**/*"];
    const exclude = config.get<string[]>("scanExclude") ?? [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
    ];

    // 当 include 使用自定义模式时，优先按 include 搜索，再按扩展过滤；
    // 默认模式则直接用扩展过滤的通配符以提升效率。
    const ALL_EXT = [
      ...IMAGE_EXT,
      ...AUDIO_EXT,
      ...VIDEO_EXT,
      ...FONT_EXT,
      ...OFFICE_EXT,
      ...OTHER_STATIC_EXT,
    ];

    let files: string[] = [];
    if (include.length && !(include.length === 1 && include[0] === "**/*")) {
      files = await fg(include, {
        cwd,
        ignore: exclude,
        absolute: true,
        suppressErrors: true,
        onlyFiles: true,
      });
      files = files.filter(isResourceExt);
    } else {
      const pattern = `**/*.{${ALL_EXT.join(",")}}`;
      files = await fg([pattern], {
        cwd,
        ignore: exclude,
        absolute: true,
        suppressErrors: true,
        onlyFiles: true,
      });
    }

    return files.map((p) => vscode.Uri.file(p));
  }

  /**
   * 获取字体数据
   */
  private async getFontData() {
    const allAssets = await this.listAllAssets();
    const fontFiles = allAssets.filter(
      (uri) => detectResourceType(uri) === "font",
    );

    const fonts = [];
    for (const uri of fontFiles) {
      const stat = await statSafe(uri);
      if (!stat) continue;

      const familyName =
        (await this.getFontFamilyFromFile(uri)) ||
        path.basename(uri.fsPath, path.extname(uri.fsPath));
      const charset =
        (await this.extractFontCharsetFromSources([uri])) ||
        AssetViewProvider.FONT_CHARSET;

      fonts.push({
        path: uri.fsPath,
        name: path.basename(uri.fsPath, path.extname(uri.fsPath)),
        familyName,
        size: toHumanSize(stat.size),
        ext: path.extname(uri.fsPath).slice(1).toUpperCase(),
        relativePath: vscode.workspace.asRelativePath(uri.fsPath),
        charset: charset.slice(0, 100),
        fullCharset: charset,
        previewCharset: charset.slice(0, 120),
        uri: this.webviewView!.webview.asWebviewUri(uri).toString(),
      });
    }

    return fonts;
  }

  /**
   * 获取资源数据
   */
  private async getAssetData() {
    const allAssets = await this.listAllAssets();
    const categorized = this.categorizeAssets(allAssets);

    // 处理图片
    const imagesByFolder = new Map<string, any[]>();
    for (const img of categorized.images) {
      const stat = await statSafe(img);
      if (!stat) continue;

      const dir = path.dirname(img.fsPath);
      const relativeDir = vscode.workspace.asRelativePath(dir);

      if (!imagesByFolder.has(relativeDir)) {
        imagesByFolder.set(relativeDir, []);
      }

      imagesByFolder.get(relativeDir)!.push({
        path: img.fsPath,
        name: path.basename(img.fsPath),
        size: toHumanSize(stat.size),
        ext: path.extname(img.fsPath).slice(1).toUpperCase(),
        uri: this.webviewView!.webview.asWebviewUri(img).toString(),
        relativePath: vscode.workspace.asRelativePath(img.fsPath),
      });
    }

    // 处理媒体文件 - 按目录分组
    const mediaByFolder = new Map<string, any[]>();
    for (const uri of [...categorized.audios, ...categorized.videos]) {
      const stat = await statSafe(uri);
      if (!stat) continue;

      const dir = path.dirname(uri.fsPath);
      const relativeDir = vscode.workspace.asRelativePath(dir);

      if (!mediaByFolder.has(relativeDir)) {
        mediaByFolder.set(relativeDir, []);
      }

      mediaByFolder.get(relativeDir)!.push({
        path: uri.fsPath,
        name: path.basename(uri.fsPath),
        size: toHumanSize(stat.size),
        ext: path.extname(uri.fsPath).replace(".", "").toUpperCase(),
        uri: this.webviewView!.webview.asWebviewUri(uri).toString(),
        relativePath: vscode.workspace.asRelativePath(uri.fsPath),
        kind: detectResourceType(uri) === "video" ? "video" : "audio",
      });
    }

    // 处理字体文件 - 按目录分组
    const fontsByFolder = new Map<string, any[]>();
    for (const uri of categorized.fonts) {
      const stat = await statSafe(uri);
      if (!stat) continue;

      const dir = path.dirname(uri.fsPath);
      const relativeDir = vscode.workspace.asRelativePath(dir);

      if (!fontsByFolder.has(relativeDir)) {
        fontsByFolder.set(relativeDir, []);
      }

      const familyName =
        (await this.getFontFamilyFromFile(uri)) ||
        path.basename(uri.fsPath, path.extname(uri.fsPath));
      const charset =
        (await this.extractFontCharsetFromSources([uri])) ||
        AssetViewProvider.FONT_CHARSET;

      fontsByFolder.get(relativeDir)!.push({
        path: uri.fsPath,
        name: path.basename(uri.fsPath, path.extname(uri.fsPath)),
        familyName,
        size: toHumanSize(stat.size),
        ext: path.extname(uri.fsPath).slice(1).toUpperCase(),
        relativePath: vscode.workspace.asRelativePath(uri.fsPath),
        charset: charset.slice(0, 100),
        fullCharset: charset,
        previewCharset: charset.slice(0, 120),
        uri: this.webviewView!.webview.asWebviewUri(uri).toString(),
      });
    }

    // 处理办公文档 - 按目录分组
    const officeByFolder = new Map<string, any[]>();
    log(`📄 开始处理 ${categorized.office.length} 个办公文档`);
    for (const uri of categorized.office) {
      const stat = await statSafe(uri);
      if (!stat) {
        log(`⚠️ 办公文档文件不存在: ${uri.fsPath}`);
        continue;
      }

      const dir = path.dirname(uri.fsPath);
      const relativeDir = vscode.workspace.asRelativePath(dir);

      if (!officeByFolder.has(relativeDir)) {
        officeByFolder.set(relativeDir, []);
      }

      const ext = path.extname(uri.fsPath).toLowerCase();
      let fileType: "word" | "excel" | "powerpoint" | "pdf" = "pdf";

      if ([".docx", ".doc"].includes(ext)) {
        fileType = "word";
      } else if ([".xlsx", ".xls"].includes(ext)) {
        fileType = "excel";
      } else if ([".pptx", ".ppt"].includes(ext)) {
        fileType = "powerpoint";
      } else if (ext === ".pdf") {
        fileType = "pdf";
      }

      const fileData = {
        path: uri.fsPath,
        name: path.basename(uri.fsPath),
        size: toHumanSize(stat.size),
        ext: path.extname(uri.fsPath).replace(".", "").toUpperCase(),
        relativePath: vscode.workspace.asRelativePath(uri.fsPath),
        uri: this.webviewView!.webview.asWebviewUri(uri).toString(),
        fileType,
      };

      log(`✅ 添加办公文档: ${fileData.name} (${fileData.fileType})`);
      officeByFolder.get(relativeDir)!.push(fileData);
    }
    log(`📄 办公文档处理完成，共 ${officeByFolder.size} 个目录`);

    // 处理其他文件 - 按目录分组
    const othersByFolder = new Map<string, any[]>();
    for (const uri of categorized.others) {
      const stat = await statSafe(uri);
      if (!stat) continue;

      const dir = path.dirname(uri.fsPath);
      const relativeDir = vscode.workspace.asRelativePath(dir);

      if (!othersByFolder.has(relativeDir)) {
        othersByFolder.set(relativeDir, []);
      }

      othersByFolder.get(relativeDir)!.push({
        path: uri.fsPath,
        name: path.basename(uri.fsPath),
        size: toHumanSize(stat.size),
        ext: path.extname(uri.fsPath).replace(".", "").toUpperCase(),
        relativePath: vscode.workspace.asRelativePath(uri.fsPath),
      });
    }

    return {
      images: Array.from(imagesByFolder.entries()).map(([folder, files]) => ({
        folder,
        files,
      })),
      media: Array.from(mediaByFolder.entries()).map(([folder, files]) => ({
        folder,
        files,
      })),
      fonts: Array.from(fontsByFolder.entries()).map(([folder, files]) => ({
        folder,
        files,
      })),
      office: Array.from(officeByFolder.entries()).map(([folder, files]) => ({
        folder,
        files,
      })),
      others: Array.from(othersByFolder.entries()).map(([folder, files]) => ({
        folder,
        files,
      })),
    };
  }
  /**
   * 错误提示页面
   */
  private getErrorHtml(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            text-align: center;
            padding: 40px;
          }
          .error-container { max-width: 420px; }
          .error-icon { font-size: 64px; margin-bottom: 18px; opacity: .6; }
          h2 { margin-bottom: 12px; color: var(--vscode-errorForeground); }
          p { color: var(--vscode-descriptionForeground); line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="error-container">
          <div class="error-icon">⚠️</div>
          <h2>加载失败</h2>
          <p>找不到 GUI/dist/index.html 文件。<br/>请先运行 <code>cd GUI && npm run build</code> 构建前端应用。</p >
        </div>
      </body>
      </html>
    `;
  }

  private categorizeAssets(assets: vscode.Uri[]) {
    const images: vscode.Uri[] = [];
    const audios: vscode.Uri[] = [];
    const videos: vscode.Uri[] = [];
    const fonts: vscode.Uri[] = [];
    const office: vscode.Uri[] = [];
    const others: vscode.Uri[] = [];

    // 办公文档扩展名
    const officeExtensions = [
      ".docx",
      ".doc",
      ".pdf",
      ".xlsx",
      ".xls",
      ".pptx",
      ".ppt",
    ];

    for (const uri of assets) {
      const ext = path.extname(uri.fsPath).toLowerCase();

      if (officeExtensions.includes(ext)) {
        log(`📄 发现办公文档: ${uri.fsPath}`);
        office.push(uri);
      } else {
        const type = detectResourceType(uri);
        if (type === "image") images.push(uri);
        else if (type === "audio") audios.push(uri);
        else if (type === "video") videos.push(uri);
        else if (type === "font") fonts.push(uri);
        else others.push(uri);
      }
    }

    log(
      `📊 资源分类统计: 图片=${images.length}, 音频=${audios.length}, 视频=${videos.length}, 字体=${fonts.length}, 办公=${office.length}, 其他=${others.length}`,
    );
    return { images, audios, videos, fonts, office, others };
  }

  private countFolders(images: vscode.Uri[]) {
    const set = new Set<string>();
    for (const img of images) {
      set.add(path.dirname(img.fsPath));
    }
    return set.size;
  }

  private async extractFontCharsetFromSources(
    sources: vscode.Uri[],
  ): Promise<string | undefined> {
    if (!sources.length) return undefined;

    try {
      for (const src of sources) {
        const stat = await statSafe(src);
        if (!stat) continue;

        // 缓存key包含文件路径和修改时间，确保文件变更后缓存失效
        const cacheKey = `${src.fsPath}|${stat.mtime.getTime()}`;
        const cached = this.fontCharsetCache.get(cacheKey);
        if (cached) return cached;

        const mod = await import("fontkit");
        const fontkit = (mod as any).default ?? (mod as any);
        const font = await fontkit.open(src.fsPath);

        let codePoints: number[] = [];

        // 尝试多种方法获取字符集
        try {
          // 方法1: 使用 characterSet 属性（适用于大多数字体）
          if (font.characterSet && font.characterSet.length > 0) {
            codePoints = font.characterSet;
          } else {
            // 方法2: 手动遍历 cmap 表获取字符映射
            const cmap = font.characterToGlyphIndexMap;
            if (cmap) {
              codePoints = Object.keys(cmap)
                .map((k) => parseInt(k, 10))
                .filter((cp) => cp > 0);
            }
          }

          // 方法3: 如果是复合字体（TTC），尝试获取所有子字体的字符集
          if (codePoints.length === 0 && font.fonts) {
            for (const subFont of font.fonts) {
              if (subFont.characterSet && subFont.characterSet.length > 0) {
                codePoints = codePoints.concat(subFont.characterSet);
              }
            }
            // 去重
            codePoints = Array.from(new Set(codePoints));
          }
        } catch (cmapErr) {
          log(`解析字体字符映射表失败: ${cmapErr}`);
        }

        if (codePoints.length === 0) {
          log(`无法从字体文件获取字符集: ${src.fsPath}`);
          continue;
        }

        const chars: string[] = [];
        for (const cp of codePoints) {
          // 放宽字符过滤条件，包含更多字符
          if (cp > 0x10ffff) continue; // 超出 Unicode 范围

          try {
            const ch = String.fromCodePoint(cp);
            // 只过滤掉控制字符（除了空格和换行）
            if (cp < 32 && cp !== 9 && cp !== 10 && cp !== 13 && cp !== 32)
              continue;
            chars.push(ch);
          } catch (err) {
            // 忽略无效的码点
            log(`无效码点 ${cp}: ${err}`);
          }
        }

        // 对字符进行排序，便于查看常用字符
        const sortedChars = chars.sort((a, b) => {
          const aCode = a.codePointAt(0) || 0;
          const bCode = b.codePointAt(0) || 0;
          return aCode - bCode;
        });

        const unique = Array.from(new Set(sortedChars)).join("");
        log("unique=============");
        log(unique);
        // const limited = unique.slice(0, 2000);
        const limited = unique;
        this.fontCharsetCache.set(cacheKey, limited);
        return limited;
      }
    } catch (err) {
      log(`字体字符集解析失败: ${err}`);
    }

    return undefined;
  }

  private async getFontFamilyFromFile(
    uri: vscode.Uri,
  ): Promise<string | undefined> {
    try {
      // 确保文件存在
      const stat = await statSafe(uri);
      if (!stat) {
        return undefined;
      }

      const mod = await import("fontkit");
      const fontkit = (mod as any).default ?? (mod as any);
      const font = fontkit.openSync(uri.fsPath);
      return (
        font.familyName ||
        font.fullName ||
        font.postscriptName ||
        path.basename(uri.fsPath, path.extname(uri.fsPath))
      );
    } catch (err) {
      log(`读取字体名称失败 ${uri.fsPath}: ${err}`);
      return undefined;
    }
  }

  private guessFontFormat(filePath: string) {
    const ext = path.extname(filePath).replace(".", "").toLowerCase();
    if (ext === "ttf" || ext === "tff") return "truetype";
    if (ext === "otf") return "opentype";
    if (ext === "woff2") return "woff2";
    if (ext === "woff") return "woff";
    return "opentype";
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private escapeAttr(value: string) {
    return this.escapeHtml(value).replace(/`/g, "&#96;");
  }

  private normalizePath(p: string) {
    return p.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }
}