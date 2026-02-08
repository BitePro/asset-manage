import * as vscode from "vscode";
import * as path from "path";

import { AssetViewProvider } from "./sidebar/assetViewProvider";
import { log } from "./utils/logger";

export async function activate(context: vscode.ExtensionContext) {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    vscode.window.showWarningMessage("Asset Manage: 请先打开一个工作区。");
    return;
  }

  const imagesView = new AssetViewProvider("images", context.extensionUri);

  registerStatusBarShortcut(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("assetManage.refreshIndexes", async () => {
      vscode.window.showInformationMessage("Asset Manage 索引已刷新");
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

  log("Asset Manage 已激活");
}

function registerStatusBarShortcut(context: vscode.ExtensionContext) {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  item.text = "$(file-media) Asset Manage";
  item.tooltip = "打开静态资源面板";
  item.command = "assetManage.showImageGallery";
  item.show();
  context.subscriptions.push(item);
}

export function deactivate() {}
