import * as vscode from "vscode";
import { toHumanSize } from "../utils/fsUtils";
import { log } from "../utils/logger";
import { AssetIndex } from "../services/assetIndex";
import { parseAndResolveResource } from "../utils/resourcePathResolver";

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

/* base64 尺寸计算已不再需要，预览统一使用本地/临时文件路径 */

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
        // 仅在悬浮时解析，并采用“先成功先返回”的物化策略
        const resolvedRes = await parseAndResolveResource(document, position);
        const resourceInfo = resolvedRes.resourceInfo;
        const fsPath = resourceInfo?.uri?.fsPath;
        if (resolvedRes.type === "not_found") return;

        const range =
          resolvedRes.range ||
          document.getWordRangeAtPosition(
            position,
            /['"()[\]A-Za-z0-9_\-./,:;=]+/
          );

        const md = new vscode.MarkdownString();
        md.supportHtml = true;
        md.isTrusted = true;

        let info: any;

        // 预览统一使用文件路径（本地或临时文件）
        if (resourceInfo?.uri) {
          const info = resourceInfo;

          if (!info?.exists && range) {
            const diag = new vscode.Diagnostic(
              range,
              `资源不存在: ${vscode.workspace.asRelativePath(info.uri)}`,
              vscode.DiagnosticSeverity.Error
            );
            diagnostics.set(document.uri, [diag]);
            return new vscode.Hover(
              `资源不存在: ${vscode.workspace.asRelativePath(info.uri)}`,
              range
            );
          } else {
            diagnostics.delete(document.uri);
          }

          const lines: string[] = [];
          if (resolvedRes.type === "base64") {
            lines.push(`**base64**`);
          } else if (resolvedRes.type === "network") {
            lines.push(`**网络图片**`);
          } else {
            lines.push(`**路径**: ${vscode.workspace.asRelativePath(info.uri)}`);
          }

          if (info) {
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
          }

          md.appendMarkdown(lines.join("\n\n"));

          if (info?.type === "image") {
            const width = info.dimensions?.width ?? 100;
            const height = info.dimensions?.height ?? 100;
            let imgWidth = 0;
            let imgHeight = 0;
            if (width > height) {
                imgWidth = 240;
                imgHeight = Math.round(height * 200 / width);
            } else {
                imgHeight = 240;
                imgWidth = Math.round(width * 200 / height);
            }
            md.appendMarkdown('\n\n')
            const maxSizeConfig = `|width=${imgWidth}|height=${imgHeight}`;
            md.appendMarkdown(`![${fsPath}](${fsPath}${maxSizeConfig})`);
            md.appendMarkdown('\n\n');
          }

          const estimates = resolvedRes.optimizationEstimates;
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

          const git = resolvedRes.gitInfo;
          if (git) {
            md.appendMarkdown(
              `\n\n**Git**\n- 最后提交: ${git.date ?? "未知"}\n- 作者: ${
                git.author ?? "未知"
              }\n- 体积变化: ${git.sizeChange ?? "未知"}\n- 提交说明: ${
                git.message ?? ""
              }`
            );
          }

          const ref = assetIndex.getReferences(info.uri);
          if (ref) {
            md.appendMarkdown(`\n\n**引用次数**: ${ref.references.length}`);
          } else {
            md.appendMarkdown(`\n\n**引用次数**: 0`);
          }

          return new vscode.Hover(md, range);
        }
      },
    })
  );
}