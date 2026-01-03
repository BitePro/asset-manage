import * as vscode from "vscode";
import fg from "fast-glob";
import * as path from "path";
import { promises as fs } from "fs";
import { AssetReference } from "../types";
import { log } from "../utils/logger";
import { resolveWorkspacePath } from "../utils/fsUtils";
import {
  isResourceExt,
  IMAGE_EXT,
  AUDIO_EXT,
  VIDEO_EXT,
  FONT_EXT,
  OTHER_STATIC_EXT,
  OFFICE_EXT,
} from "./mediaInfo";

const ALL_EXT = [
  ...IMAGE_EXT,
  ...AUDIO_EXT,
  ...VIDEO_EXT,
  ...FONT_EXT,
  ...OFFICE_EXT,
  ...OTHER_STATIC_EXT,
];
const EXT_GLOB = `{${ALL_EXT.join(",")}}`;
const ASSET_GLOBS = [`**/*.${EXT_GLOB}`];
const TEXT_GLOBS = ["**/*.{ts,tsx,js,jsx,vue,svelte,css,scss,less,html,md}"];
const EXT_REGEX = ALL_EXT.join("|");
const URL_RE = new RegExp(
  `url\\(\\s*['"]?([^'")\\s]+?\\.(${EXT_REGEX}))['"]?\\s*\\)`,
  "gi"
);
const IMPORT_RE = new RegExp(
  `(?:import\\s+[^'"]*from\\s+|require\\()\\s*['"]([^'"]+\\.(${EXT_REGEX}))['"]`,
  "gi"
);
const HTML_ATTR_RE = new RegExp(
  `\\b(?:src|href|data-src|poster|srcset|data-srcset|data-lazy-src|data-original)\\s*=\\s*['"]([^'"]+\\.(${EXT_REGEX}))['"]`,
  "gi"
);
const GENERIC_QUOTED_RE = new RegExp(`['"]([^'"]+\\.(${EXT_REGEX}))['"]`, "gi");

// Vue 动态绑定字符串字面量 (:attr="'value'" 或 :attr="`value`")
const VUE_BINDING_RE = new RegExp(
  `\\b(?:v-bind:)?(src|href|poster|data-src|data-lazy-src|data-original)\\s*=\\s*['"\`]([^'"\`]+\\.(${EXT_REGEX}))['"\`]`,
  "gi"
);

// React JSX 字符串字面量 (attr={'value'} 或 attr={`value`})
const REACT_JSX_BINDING_RE = new RegExp(
  `\\b(src|href|poster|data-src|data-lazy-src|data-original)\\s*=\\s*\\{['"\`]([^'"\`]+\\.(${EXT_REGEX}))['"\`]\\}`,
  "gi"
);

// srcset 属性特殊处理 (支持 srcset="img1.jpg 1x, img2.jpg 2x" 格式)
const SRCSET_RE = new RegExp(
  `\\b(?:srcset|data-srcset)\\s*=\\s*['"]([^'"]*?(\\w[^'"]*?\\.${EXT_REGEX})[^'"]*?)['"]`,
  "gi"
);

export class AssetIndex {
  private assets: vscode.Uri[] = [];
  private references = new Map<string, AssetReference>();
  private _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChange = this._onDidChange.event;

  async scan(
    workspace: vscode.WorkspaceFolder,
    include: string[],
    exclude: string[]
  ) {
    const cwd = workspace.uri.fsPath;
    log(`🔍 开始扫描资源，工作区: ${cwd}`);
    log(`📋 Include 模式: ${include.join(", ")}`);
    log(`🚫 Exclude 模式: ${exclude.join(", ")}`);

    const assetPatterns = buildAssetPatterns(include);
    log(`🎯 资源扫描模式: ${assetPatterns.join(", ")}`);

    const assets = await fg(assetPatterns, {
      cwd,
      ignore: exclude,
      absolute: true,
      suppressErrors: true,
      onlyFiles: true,
    });

    log(`✅ fast-glob 扫描完成，找到 ${assets.length} 个资源文件`);
    if (assets.length > 0) {
      const samples = assets.slice(0, 3);
      log(`📂 资源示例: ${samples.join(", ")}`);
    }

    this.assets = assets.map((a) => vscode.Uri.file(a));

    const textPatterns =
      include.length && !(include.length === 1 && include[0] === "**/*")
        ? include.map((p) =>
            p.includes("*")
              ? p
              : `${p}/**/*.{ts,tsx,js,jsx,vue,svelte,css,scss,less,html,md}`
          )
        : TEXT_GLOBS;
    const texts = await fg(textPatterns, {
      cwd,
      ignore: exclude,
      absolute: true,
      suppressErrors: true,
      onlyFiles: true,
    });
    const refMap = new Map<string, vscode.Location[]>();

    for (const file of texts) {
      let content: string;
      try {
        content = await fs.readFile(file, "utf8");
      } catch {
        continue;
      }

      const fileUri = vscode.Uri.file(file);
      const matches = collectResourcePaths(content);

      for (const m of matches) {
        const resolved = resolveWorkspacePath(fileUri, m.path);
        if (!resolved) continue;
        try {
          const stat = await fs.stat(resolved.fsPath);
          if (!stat.isFile()) continue;
          if (!isResourceExt(resolved.fsPath)) continue;
        } catch {
          continue;
        }

        const before = content.substring(0, m.index);
        const line = before.split(/\r?\n/).length - 1;
        const char = m.index - before.lastIndexOf("\n") - 1;
        const loc = new vscode.Location(
          fileUri,
          new vscode.Position(line, Math.max(0, char))
        );
        const key = resolved.fsPath;
        const arr = refMap.get(key) ?? [];
        arr.push(loc);
        refMap.set(key, arr);
      }
    }

    this.references = new Map(
      Array.from(refMap.entries()).map(([k, v]) => [
        k,
        { resource: vscode.Uri.file(k), references: v },
      ])
    );
    log(
      `AssetLens 索引完成，资源 ${this.assets.length}，引用表 ${this.references.size}`
    );

    // 触发变更事件，通知视图刷新
    this._onDidChange.fire();
  }

  listAssets() {
    return this.assets;
  }

  getReferences(uri: vscode.Uri): AssetReference | undefined {
    return this.references.get(uri.fsPath);
  }

  getUnused(): vscode.Uri[] {
    return this.assets.filter((a) => !this.references.has(a.fsPath));
  }

  /**
   * 增量更新单个文件的引用（用于文件保存时）
   * @param fileUri 被修改的文件URI
   * @param content 文件的新内容
   */
  async updateFileReferences(fileUri: vscode.Uri, content: string) {
    log(`🔄 增量更新文件引用: ${fileUri.fsPath}`);

    // 1. 先移除这个文件之前产生的所有引用
    this.removeReferencesFromFile(fileUri);

    // 2. 分析新内容，找出所有资源引用
    const matches = collectResourcePaths(content);
    const refsByResource = new Map<string, vscode.Location[]>();

    for (const m of matches) {
      const resolved = resolveWorkspacePath(fileUri, m.path);
      if (!resolved) continue;

      // 验证资源文件是否存在且是有效的资源文件
      try {
        const stat = await fs.stat(resolved.fsPath);
        if (!stat.isFile()) continue;
        if (!isResourceExt(resolved.fsPath)) continue;
      } catch {
        continue;
      }

      // 计算引用位置
      const before = content.substring(0, m.index);
      const line = before.split(/\r?\n/).length - 1;
      const char = m.index - before.lastIndexOf("\n") - 1;
      const loc = new vscode.Location(
        fileUri,
        new vscode.Position(line, Math.max(0, char))
      );

      // 按资源路径分组
      const resourcePath = resolved.fsPath;
      const locs = refsByResource.get(resourcePath) || [];
      locs.push(loc);
      refsByResource.set(resourcePath, locs);
    }

    // 3. 更新 references Map
    for (const [resourcePath, locs] of refsByResource) {
      const existing = this.references.get(resourcePath);
      if (existing) {
        // 合并引用（添加来自当前文件的新引用）
        existing.references = [...existing.references, ...locs];
      } else {
        // 新增资源引用
        this.references.set(resourcePath, {
          resource: vscode.Uri.file(resourcePath),
          references: locs,
        });
      }
    }

    log(`✅ 增量更新完成，更新了 ${refsByResource.size} 个资源的引用`);
    
    // 触发变更事件，通知视图刷新
    this._onDidChange.fire();
  }

  /**
   * 移除指定文件产生的所有引用
   */
  private removeReferencesFromFile(fileUri: vscode.Uri) {
    const filePath = fileUri.fsPath;
    
    for (const [resourcePath, ref] of this.references) {
      // 过滤掉来自该文件的引用
      ref.references = ref.references.filter(
        (loc) => loc.uri.fsPath !== filePath
      );
      
      // 如果没有引用了，从 Map 中移除
      if (ref.references.length === 0) {
        this.references.delete(resourcePath);
      }
    }
  }
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildAssetPatterns(include: string[]) {
  if (!include.length || (include.length === 1 && include[0] === "**/*")) {
    return ASSET_GLOBS;
  }
  return include.map((p) => {
    if (p.includes("*")) return p;
    return p.endsWith("/") ? `${p}**/*.${EXT_GLOB}` : `${p}/**/*.${EXT_GLOB}`;
  });
}

/**
 * 检查给定位置是否在注释中
 */
function isInComment(content: string, position: number): boolean {
  // 检查单行注释 //
  const beforePos = content.substring(0, position);
  const lastLineBreak = beforePos.lastIndexOf('\n');
  const currentLine = lastLineBreak === -1 ? beforePos : beforePos.substring(lastLineBreak + 1);
  const commentIndex = currentLine.indexOf('//');

  // 如果当前行有 // 注释，且注释在匹配内容之前
  if (commentIndex !== -1) {
    const matchInLine = position - (lastLineBreak === -1 ? 0 : lastLineBreak + 1);
    if (commentIndex < matchInLine) {
      return true;
    }
  }

  // 检查多行注释 /* */
  let inMultilineComment = false;
  for (let i = 0; i < position; i++) {
    if (content.substring(i, i + 2) === '/*' && !inMultilineComment) {
      inMultilineComment = true;
      i++; // 跳过 *
    } else if (content.substring(i, i + 2) === '*/' && inMultilineComment) {
      inMultilineComment = false;
      i++; // 跳过 /
    }
  }

  if (inMultilineComment) {
    return true;
  }

  // 检查 HTML 注释 <!-- -->
  let inHtmlComment = false;
  for (let i = 0; i < position; i++) {
    if (content.substring(i, i + 4) === '<!--' && !inHtmlComment) {
      inHtmlComment = true;
      i += 3; // 跳过 -->
    } else if (content.substring(i, i + 3) === '-->' && inHtmlComment) {
      inHtmlComment = false;
      i += 2; // 跳过 >
    }
  }

  if (inHtmlComment) {
    return true;
  }

  return false;
}

function collectResourcePaths(content: string) {
  const results: { path: string; index: number }[] = [];
  const seenIndexes = new Set<number>();

  const apply = (re: RegExp) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) {
      const full = m[0];
      const captured = m[1];
      if (!captured) continue;
      const idx = m.index + full.indexOf(captured);

      // 去重：同一位置只记录一次
      if (seenIndexes.has(idx)) continue;
      seenIndexes.add(idx);

      // 跳过注释中的引用
      if (isInComment(content, idx)) continue;

      results.push({ path: captured.trim(), index: idx });
    }
  };
  apply(URL_RE);
  apply(IMPORT_RE);
  apply(HTML_ATTR_RE);
  apply(VUE_BINDING_RE);
  apply(REACT_JSX_BINDING_RE);
  apply(SRCSET_RE);
  apply(GENERIC_QUOTED_RE);
  return results;
}