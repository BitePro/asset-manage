import * as vscode from "vscode";
import * as path from "path";
import imageSize from "image-size";
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

function isBase64DataUrl(str: string): boolean {
  return /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/.test(str);
}

function getImageDimensionsFromBase64(base64DataUrl: string): { width: number; height: number } | undefined {
  try {
    // 提取base64数据部分
    const match = base64DataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
    if (!match || !match[1]) {
      return undefined;
    }

    // 解码base64为Buffer
    const buffer = Buffer.from(match[1], 'base64');
    
    // 使用image-size库获取尺寸
    const dimensions = imageSize(buffer);
    if (dimensions.width && dimensions.height) {
      return { width: dimensions.width, height: dimensions.height };
    }
  } catch (err) {
    log(`从base64获取图片尺寸失败: ${err}`);
  }
  return undefined;
}

function getFullBase64DataUrlAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): string | undefined {
  const currentLine = position.line;
  const currentLineText = document.lineAt(currentLine).text;
  const cursorIndex = position.character;

  // 检查光标是否在引号或反引号内（包括多行模板字符串）
  let quoteStartLine = -1;
  let quoteStartIndex = -1;
  let quoteEndLine = -1;
  let quoteEndIndex = -1;
  let quoteChar = '';

  // 从当前行向上查找未闭合的引号
  for (let lineNum = currentLine; lineNum >= 0; lineNum--) {
    const lineText = document.lineAt(lineNum).text;
    const searchStart = lineNum === currentLine ? cursorIndex - 1 : lineText.length - 1;
    
    for (let i = searchStart; i >= 0; i--) {
      const char = lineText[i];
      if ((char === '"' || char === "'" || char === '`') && (i === 0 || lineText[i - 1] !== '\\')) {
        quoteStartLine = lineNum;
        quoteStartIndex = i;
        quoteChar = char;
        break;
      }
    }
    
    if (quoteStartLine !== -1) break;
  }

  // 如果找到了开始引号，向下查找对应的结束引号
  if (quoteStartLine !== -1) {
    const totalLines = document.lineCount;
    for (let lineNum = quoteStartLine; lineNum < totalLines; lineNum++) {
      const lineText = document.lineAt(lineNum).text;
      const searchStart = lineNum === quoteStartLine ? quoteStartIndex + 1 : 0;
      
      for (let i = searchStart; i < lineText.length; i++) {
        const char = lineText[i];
        if (char === quoteChar && (i === 0 || lineText[i - 1] !== '\\')) {
          quoteEndLine = lineNum;
          quoteEndIndex = i;
          break;
        }
      }
      
      if (quoteEndLine !== -1) break;
    }

    // 如果找到了闭合引号，且光标在引号范围内，提取内容
    if (quoteEndLine !== -1 && 
        (currentLine > quoteStartLine || (currentLine === quoteStartLine && cursorIndex > quoteStartIndex)) &&
        (currentLine < quoteEndLine || (currentLine === quoteEndLine && cursorIndex < quoteEndIndex))) {
      
      // 提取多行内容
      const lines: string[] = [];
      for (let lineNum = quoteStartLine; lineNum <= quoteEndLine; lineNum++) {
        const lineText = document.lineAt(lineNum).text;
        if (lineNum === quoteStartLine && lineNum === quoteEndLine) {
          // 同一行
          lines.push(lineText.substring(quoteStartIndex + 1, quoteEndIndex));
        } else if (lineNum === quoteStartLine) {
          // 第一行
          lines.push(lineText.substring(quoteStartIndex + 1));
        } else if (lineNum === quoteEndLine) {
          // 最后一行
          lines.push(lineText.substring(0, quoteEndIndex));
        } else {
          // 中间行
          lines.push(lineText);
        }
      }
      
      const quotedContent = lines.join('\n');
      // 移除base64数据中的换行符和空格
      const cleanedContent = quotedContent.replace(/\s+/g, '');
      
      // 检查是否是base64数据URL
      if (isBase64DataUrl(cleanedContent)) {
        return cleanedContent;
      }
    }
  }

  // 如果不在引号内，或者引号内不是base64，尝试在当前行直接匹配
  const base64Pattern = /data:image\/[^;]+;base64,[^\s'")\]]+/g;
  let match;
  while ((match = base64Pattern.exec(currentLineText)) !== null) {
    const startIndex = match.index;
    const endIndex = match.index + match[0].length;

    // 检查光标是否在这个匹配的范围内
    if (cursorIndex >= startIndex && cursorIndex <= endIndex) {
      return match[0];
    }
  }

  return undefined;
}

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

        const range = document.getWordRangeAtPosition(
          position,
          /['"()[\]A-Za-z0-9_\-./,:;=]+/
        );

        const md = new vscode.MarkdownString();
        md.supportHtml = true;
        md.isTrusted = true;

        let resolved: vscode.Uri | undefined;
        let info: any;

        // 检查是否是 base64 数据 URL
        if (isBase64DataUrl(target)) {
          const lines: string[] = [];
          lines.push(`**类型**: Base64 图片`);
          md.appendMarkdown(lines.join("\n\n"));

          // 直接预览 base64 图片
          const match = target.match(/^data:image\/([^;]+);base64,(.+)$/);
          if (match) {
            const format = match[1];
            const data = target;
            // 估算 base64 数据大小 (base64 编码会增加约 33% 的体积)
            const estimatedSize = (data.length * 0.75) / 1024; // KB
            md.appendMarkdown(`\n\n**格式**: ${format.toUpperCase()}\n\n**体积**: ${estimatedSize.toFixed(2)} KB`);

            // 获取图片尺寸
            const dimensions = getImageDimensionsFromBase64(data);
            if (dimensions) {
              md.appendMarkdown(`\n\n**尺寸**: ${dimensions.width} × ${dimensions.height}`);
            }

            const width = dimensions?.width ?? 100;
            const height = dimensions?.height ?? 100;
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

            // 预览图片，使用 Markdown 图片语法
            md.appendMarkdown(`\n\n<img src="${data}" width="${imgWidth}" height="${imgHeight}" style="background-color: #666666; padding: 4px; border-radius: 4px;" />`);
            // md.appendMarkdown(`\n\n<img src="${data}" width= />`);
          }
        } else {
          // 原有的文件资源处理逻辑
          resolved = resolveWorkspacePath(document.uri, target);
          if (!resolved) return;

          info = await getResourceInfo(resolved);

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

          md.appendMarkdown(lines.join("\n\n"));

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
            //   md.appendMarkdown(`\n\n![图片预览](${data})`);
            md.appendMarkdown(`\n\n<img src="${data}" width="${imgWidth}" height="${imgHeight}" style="background-color: #666666; padding: 4px; border-radius: 4px;" />`);
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
  // 优先检测完整的 base64 数据 URL（特别是引号内的）
  const fullBase64Url = getFullBase64DataUrlAtPosition(document, position);
  if (fullBase64Url) {
    return fullBase64Url;
  }

  const lineText = document.lineAt(position.line).text;

  const wordRange = document.getWordRangeAtPosition(
    position,
    /['"()[\]A-Za-z0-9_\-./~@,:;=]+/
  );
  if (wordRange) {
    const word = document.getText(wordRange).replace(/['"]/g, "");
    if (isResourceExt(word)) return word;

    // 检查是否是 base64 数据 URL
    if (isBase64DataUrl(word)) {
      return word;
    }
  }

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
      (isResourceExt(cleaned) || isBase64DataUrl(cleaned))
    ) {
      return cleaned;
    }
  }

  // 兜底匹配引号内资源
  const quotedPattern = /['"]([^'"]+(?:\.[^'"]+)?)['"]/g;
  while ((m = quotedPattern.exec(lineText))) {
    const start = m.index + 1;
    const end = m.index + m[0].length - 1;
    if (
      position.character >= start &&
      position.character <= end &&
      (isResourceExt(m[1]) || isBase64DataUrl(m[1]))
    ) {
      return m[1];
    }
  }
  return undefined;
}