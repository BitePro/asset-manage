import * as vscode from "vscode";
import { AssetIndex } from "../services/assetIndex";
import { loadInlinePreview } from "../services/mediaInfo";

export function registerAssetCompletion(context: vscode.ExtensionContext, assetIndex: AssetIndex) {
  const selector: vscode.DocumentSelector = [
    { language: "typescriptreact", scheme: "file" },
    { language: "javascriptreact", scheme: "file" },
    { language: "typescript", scheme: "file" },
    { language: "javascript", scheme: "file" },
    { language: "vue", scheme: "file" },
    { language: "svelte", scheme: "file" },
    { language: "html", scheme: "file" },
    { language: "css", scheme: "file" },
    { language: "scss", scheme: "file" },
    { language: "less", scheme: "file" },
  ];

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      selector,
      {
        async provideCompletionItems(document, position) {
          const line = document.lineAt(position.line).text;
          if (!isInPathContext(line, position.character)) return;
          const items: vscode.CompletionItem[] = [];
          for (const asset of assetIndex.listAssets()) {
            const item = new vscode.CompletionItem(vscode.workspace.asRelativePath(asset), vscode.CompletionItemKind.File);
            item.insertText = vscode.workspace.asRelativePath(asset);
            const preview = await loadInlinePreview(asset, 32);
            if (preview) {
              item.documentation = new vscode.MarkdownString(`![preview](${preview})`);
            }
            items.push(item);
          }
          return items;
        },
      },
      "/",
      '"',
      "'",
    ),
  );
}

function isInPathContext(line: string, char: number) {
  const before = line.slice(0, char);
  return /(src\s*=\s*["']?$|url\(\s*["']?$|url\(\s*$)/i.test(before);
}