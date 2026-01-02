import * as vscode from "vscode";
import * as path from "path";
import {
  getResourceInfo,
  isResourceExt,
  loadInlinePreview,
} from "../services/mediaInfo";
import { estimateOptimization } from "../services/optimizer";
import { getGitInfo } from "../services/gitInfo";
import { resolveWorkspacePath, toHumanSize } from "../utils/fsUtils";
import { log } from "../utils/logger";
import { AssetIndex } from "../services/assetIndex";

const SELECTORS: vscode.DocumentSelector = [
  { scheme: "file", language: "typescript" },
  { scheme: "file", language: "javascript" },
  { scheme: "file", language: "typescriptreact" },
  { scheme: "file", language: "javascriptreact" },
  { scheme: "file", language: "css" },
  { scheme: "file", language: "scss" },
  { scheme: "file", language: "less" },
  { scheme: "file", language: "html" },
  { scheme: "file", language: "vue" },
  { scheme: "file", language: "svelte" },
  { scheme: "file", language: "markdown" },
];

export function registerResourceHover(
  context: vscode.ExtensionContext,
  diagnostics: vscode.DiagnosticCollection,
  assetIndex: AssetIndex
) {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(SELECTORS, {
      async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
      ) {
        const line = document.lineAt(position.line).text;
        
        // 检查当前行是否是注释
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.startsWith('*')) {
          return; // 注释行不显示预览
        }
        
        // 检查光标位置是否在注释中（/* ... */ 或 // ...）
        const lineBeforeCursor = line.substring(0, position.character);
        const lineAfterCursor = line.substring(position.character);
        
        // 检查单行注释 //
        const singleLineCommentIndex = line.indexOf('//');
        if (singleLineCommentIndex !== -1 && position.character >= singleLineCommentIndex) {
          return; // 光标在单行注释中
        }
        
        // 检查块注释 /* */
        const blockCommentStart = lineBeforeCursor.lastIndexOf('/*');
        const blockCommentEnd = lineBeforeCursor.lastIndexOf('*/');
        if (blockCommentStart !== -1 && (blockCommentEnd === -1 || blockCommentStart > blockCommentEnd)) {
          // 光标在块注释开始之后且没有闭合
          return;
        }
        
        const target = getResourcePathAtPosition(document, position);
        if (!target) return;

        const resolved = resolveWorkspacePath(document.uri, target);
        if (!resolved) return;

        const info = await getResourceInfo(resolved);
        const range = document.getWordRangeAtPosition(
          position,
          /['"()[\]A-Za-z0-9_\-./]+/
        );

        if (!info.exists && range) {
          const diag = new vscode.Diagnostic(
            range,
            `资源不存在: ${target}`,
            vscode.DiagnosticSeverity.Error
          );
          diagnostics.set(document.uri, [diag]);
          return new vscode.Hover(`资源不存在: ${target}`, range);
        } else {
          diagnostics.delete(document.uri);
        }

        const lines: string[] = [];
        lines.push(`**路径**: ${vscode.workspace.asRelativePath(resolved)}`);
        lines.push(`**体积**: ${toHumanSize(info.sizeBytes)}`);
        if (info.dimensions) {
          lines.push(
            `**尺寸**: ${info.dimensions.width} × ${info.dimensions.height}`
          );
        }
        if (info.durationSeconds) {
          const dur = info.durationSeconds.toFixed(2);
          lines.push(`**时长**: ${dur}s`);
        }
        if (info.codecs) lines.push(`**编码**: ${info.codecs}`);
        if (info.bitrate)
          lines.push(`**码率**: ${(info.bitrate / 1000).toFixed(0)} kbps`);

        const md = new vscode.MarkdownString(lines.join("\n\n"));
        (md as any).supportHtml = true;
        md.isTrusted = true;

        // 预览
        if (info.type === "image") {
          const data = await loadInlinePreview(
            resolved,
            vscode.workspace
              .getConfiguration("assetLens")
              .get<number>("maxInlinePreviewKB") ?? 256
          );
          if (data) {
            const width = info.dimensions?.width ?? 100;
            const height = info.dimensions?.height ?? 100;
            let imgWidth = width;
            let imgHeight = height;
            if (width > 100) {
              imgWidth = 100;
            }
            if (height > 100) {
              imgHeight = 100;
            }
            if (width < 50) {
              imgWidth = 50;
            }
            if (height < 50) {
              imgHeight = 50;
            }
            md.appendMarkdown(
              `\n\n<div style="background-color: #666666;">< img src="${data}" width="${imgWidth}" height="${imgHeight}" /></div>`
            );
          }
        }

        // 优化估算
        const estimates = await estimateOptimization(info);
        if (estimates?.length) {
          const desc = estimates
            .map(
              (e) =>
                `- ${e.format.toUpperCase()}: 预计 ${toHumanSize(
                  e.estimatedSizeBytes
                )} (节省 ~${e.savingPercent}%)`
            )
            .join("\n");
          md.appendMarkdown(`\n\n**可优化体积**\n${desc}`);
        }

        // Git 信息
        const git = await getGitInfo(resolved);
        if (git) {
          md.appendMarkdown(
            `\n\n**Git**\n- 最后提交: ${git.date ?? "未知"}\n- 作者: ${
              git.author ?? "未知"
            }\n- 体积变化: ${git.sizeChange ?? "未知"}\n- 提交说明: ${
              git.message ?? ""
            }`
          );
        }

        // 引用信息
        const ref = assetIndex.getReferences(resolved);
        if (ref) {
          md.appendMarkdown(`\n\n**引用次数**: ${ref.references.length}`);
        } else {
          md.appendMarkdown(`\n\n**引用次数**: 0`);
        }

        return new vscode.Hover(md, range);
      },
    })
  );
}

function getResourcePathAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): string | undefined {
  const wordRange = document.getWordRangeAtPosition(
    position,
    /['"()[\]A-Za-z0-9_\-./~@]+/
  );
  if (wordRange) {
    const word = document.getText(wordRange).replace(/['"]/g, "");
    if (isResourceExt(word)) return word;
  }

  const lineText = document.lineAt(position.line).text;

  // 匹配 url(...)，支持不带引号的写法
  const urlPattern = /url\(\s*(?<path>[^)\s'"]+|"[^"]+"|'[^']+')\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = urlPattern.exec(lineText))) {
    const raw = m.groups?.path ?? "";
    const cleaned = raw.replace(/^['"]|['"]$/g, "");
    const start = m.index;
    const end = m.index + m[0].length;
    if (
      position.character >= start &&
      position.character <= end &&
      isResourceExt(cleaned)
    ) {
      return cleaned;
    }
  }

  // 兜底匹配引号内资源
  const quotedPattern = /['"]([^'"]+\.[\w]+)['"]/g;
  while ((m = quotedPattern.exec(lineText))) {
    const start = m.index + 1;
    const end = m.index + m[0].length - 1;
    if (
      position.character >= start &&
      position.character <= end &&
      isResourceExt(m[1])
    ) {
      return m[1];
    }
  }
  return undefined;
}