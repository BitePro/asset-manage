import * as vscode from "vscode";
import * as path from "path";

import { AssetViewProvider } from "./sidebar/assetViewProvider";
import { log } from "./utils/logger";

export async function activate(context: vscode.ExtensionContext) {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    vscode.window.showWarningMessage(
      vscode.l10n.t("Asset Manage: Please open a workspace first.")
    );
    return;
  }

  const imagesView = new AssetViewProvider("images", context.extensionUri);

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

export function deactivate() {}
