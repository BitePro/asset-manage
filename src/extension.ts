import * as vscode from "vscode";
import * as path from "path";

import { AssetViewProvider } from "./sidebar/assetViewProvider";
import { SearchController } from "./services/semanticSearch/searchController";
import { log, error } from "./utils/logger";

let searchController: SearchController | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    vscode.window.showWarningMessage(
      vscode.l10n.t("Asset Manage: Please open a workspace first.")
    );
    return;
  }

  // 懒加载：仅构造控制器，不下载模型、不建索引（保留原有激活行为，任务 6.3 / 29）。
  searchController = new SearchController(context);
  context.subscriptions.push({ dispose: () => void searchController?.dispose() });

  const imagesView = new AssetViewProvider(
    "images",
    context.extensionUri,
    searchController,
  );

  registerSemanticSearchCommands(context, imagesView, searchController);

  registerStatusBarShortcut(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("assetManage.refreshIndexes", async () => {
      vscode.window.showInformationMessage(
        vscode.l10n.t("Asset Manage index refreshed")
      );
      await imagesView.refreshData();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("assetManage.showImageGallery", () => {
      log("🖼️ 打开静态资源侧边栏");
      vscode.commands.executeCommand("workbench.view.extension.assetmanage");
      vscode.commands.executeCommand("assetManage.imagesView.focus");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("assetManage.openImagesSidebar", () => {
      vscode.commands.executeCommand("workbench.view.extension.assetmanage");
      vscode.commands.executeCommand("assetManage.imagesView.focus");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "assetManage.previewFontInSidebar",
      async (uri: vscode.Uri) => {
        await vscode.commands.executeCommand(
          "workbench.view.extension.assetmanage"
        );
        await vscode.commands.executeCommand("assetManage.imagesView.focus");
        setTimeout(() => {
          const webviewView = imagesView["webviewView"];
          if (webviewView?.webview) {
            const fileName = path.basename(
              uri.fsPath,
              path.extname(uri.fsPath)
            );
            webviewView.webview.postMessage({
              type: "previewFont",
              fileName,
            });
          }
        }, 500);
      }
    )
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "assetManage.imagesView",
      imagesView,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  log(vscode.l10n.t("Asset Manage activated"));
}

function registerSemanticSearchCommands(
  context: vscode.ExtensionContext,
  imagesView: AssetViewProvider,
  controller: SearchController,
) {
  // 按描述搜索图片：聚焦面板 → 输入查询 → 结果回传 webview，并提供 QuickPick 兜底。
  context.subscriptions.push(
    vscode.commands.registerCommand("assetManage.semanticSearch", async () => {
      await vscode.commands.executeCommand(
        "workbench.view.extension.assetmanage",
      );
      await vscode.commands.executeCommand("assetManage.imagesView.focus");
      imagesView.focusSemanticSearch();

      const query = await vscode.window.showInputBox({
        prompt: vscode.l10n.t("Asset Manage: Search Images by Description"),
        placeHolder: "箭头图标 / arrow icon",
      });
      if (!query) return;

      // 同时把结果送到 webview 渲染。
      void imagesView.runSemanticSearch(query);
    }),
  );

  // 重建图片搜索索引。
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "assetManage.buildImageIndex",
      async () => {
        try {
          await controller.buildIndex();
        } catch (err) {
          error("重建图片索引失败", err);
          vscode.window.showErrorMessage(
            `${err instanceof Error ? err.message : String(err)}`,
          );
        }
      },
    ),
  );
}

function registerStatusBarShortcut(context: vscode.ExtensionContext) {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  item.text = "$(file-media) Asset Manage";
  item.tooltip = vscode.l10n.t("Open static assets panel");
  item.command = "assetManage.showImageGallery";
  item.show();
  context.subscriptions.push(item);
}

export function deactivate() {
  void searchController?.dispose();
  searchController = undefined;
}
