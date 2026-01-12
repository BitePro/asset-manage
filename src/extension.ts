import * as vscode from "vscode";
import * as path from "path";
import { registerResourceHover } from "./hover/resourceHover";
import { registerFontHover } from "./hover/fontHover";
import { registerCssHover } from "./hover/cssHover";
import { FontIndex } from "./services/fontIndex";
import { AssetIndex } from "./services/assetIndex";
import { registerUnusedDecoration } from "./decorations/unusedDecoration";
import { ReferencesViewProvider } from "./sidebar/referencesViewProvider";
import { AssetViewProvider } from "./sidebar/assetViewProvider";
import { registerAssetCompletion } from "./completions/assetCompletion";
import { loadAliasMap } from "./services/aliasResolver";
import { log } from "./utils/logger";
import {
  AUDIO_EXT,
  FONT_EXT,
  IMAGE_EXT,
  OTHER_STATIC_EXT,
  VIDEO_EXT,
} from "./services/mediaInfo";

export async function activate(context: vscode.ExtensionContext) {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    vscode.window.showWarningMessage("AssetLens: 请先打开一个工作区。");
    return;
  }

  const config = vscode.workspace.getConfiguration("assetLens");
  const include = config.get<string[]>("scanInclude") ?? ["**/*"];
  const exclude = config.get<string[]>("scanExclude") ?? [
    "**/node_modules/**",
    "**/.git/**",
  ];

  const diagnostics = vscode.languages.createDiagnosticCollection("assetLens");
  context.subscriptions.push(diagnostics);

  const fontIndex = new FontIndex();
  const assetIndex = new AssetIndex();

  // 不再在启动时自动加载索引，只在需要时加载
  await loadAliasMap(workspace);

  const referencesView = new ReferencesViewProvider();
  const imagesView = new AssetViewProvider(
    "images",
    fontIndex,
    assetIndex,
    context.extensionUri
  );
  log("✅ referencesView 创建完成");
  log("✅ imagesView 创建完成");

  registerResourceHover(context, diagnostics, assetIndex);
  registerFontHover(context, fontIndex);
  // registerCssHover(context);
  registerAssetCompletion(context, assetIndex);
  registerAssetReferenceProvider(context, assetIndex);
  const refreshUnused = registerUnusedDecoration(context, assetIndex);
  registerStatusBarShortcut(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("assetLens.refreshIndexes", async () => {
      await rescan(workspace, fontIndex, assetIndex, include, exclude);
      refreshUnused();
      vscode.window.showInformationMessage("AssetLens 索引已刷新");
    })
  );

  // 打开图片画廊面板
  context.subscriptions.push(
    vscode.commands.registerCommand("assetLens.showImageGallery", () => {
      log("🖼️ 打开静态资源侧边栏");
      vscode.commands.executeCommand("workbench.view.extension.assetlens");
      vscode.commands.executeCommand("assetLens.imagesView.focus");
    })
  );

  // 从活动栏快捷打开侧边栏
  context.subscriptions.push(
    vscode.commands.registerCommand("assetLens.openImagesSidebar", () => {
      vscode.commands.executeCommand("workbench.view.extension.assetlens");
      vscode.commands.executeCommand("assetLens.imagesView.focus");
    })
  );

  // 字体文件完整预览命令
  context.subscriptions.push(
    vscode.commands.registerCommand("assetLens.previewFontInSidebar", async (uri: vscode.Uri) => {
      // 打开AssetLens侧边栏
      await vscode.commands.executeCommand("workbench.view.extension.assetlens");
      await vscode.commands.executeCommand("assetLens.imagesView.focus");

      // 等待一小段时间确保webview加载完成
      setTimeout(() => {
        // 获取webview实例并发送消息
        const webviewView = imagesView['webviewView'];
        if (webviewView && webviewView.webview) {
          // 发送消息到webview，切换到字体tab并搜索指定文件
          const fileName = path.basename(uri.fsPath, path.extname(uri.fsPath));
          webviewView.webview.postMessage({
            type: 'previewFont',
            fileName: fileName
          });
        }
      }, 500);
    })
  );

  // 注册打开引用位置的命令
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "assetLens.openReference",
      async (location: vscode.Location) => {
        const doc = await vscode.workspace.openTextDocument(location.uri);
        const editor = await vscode.window.showTextDocument(doc);
        editor.selection = new vscode.Selection(
          location.range.start,
          location.range.start
        );
        editor.revealRange(
          location.range,
          vscode.TextEditorRevealType.InCenter
        );
      }
    )
  );

  // 查找资源引用命令
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "assetLens.findReferences",
      async (uri?: vscode.Uri) => {
        // 如果索引还没有加载，先加载索引
        if (assetIndex.listAssets().length === 0) {
          vscode.window.showInformationMessage("AssetLens 正在加载资源索引...");
          await rescan(workspace, fontIndex, assetIndex, include, exclude);
          refreshUnused();
        }

        const target =
          uri ??
          (
            await vscode.window.showOpenDialog({
              canSelectFiles: true,
              canSelectMany: false,
            })
          )?.[0];
        if (!target) return;
        const refs = await assetIndex.findReferencesByPath(target.fsPath);
        if (refs.length === 0) {
          vscode.window.showInformationMessage("未找到引用");
          return;
        }

        // 使用我们自己的 referencesView 展示，完全避开 vscode.references-view 扩展
        referencesView.showReferences(target, refs);
        vscode.commands.executeCommand("workbench.view.explorer");
        vscode.commands.executeCommand("assetLens.referencesView.focus");
      }
    )
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "assetLens.referencesView",
      referencesView
    )
  );
  log("✅ assetLens.referencesView 已注册");

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "assetLens.imagesView",
      imagesView,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
  log("✅ assetLens.imagesView 已注册");

  // 文件监听已禁用，只有在查找引用时才会加载索引
  // const watcher = vscode.workspace.createFileSystemWatcher("**/*");
  // const debounce = debounceAsync(async () => {
  //   await loadAliasMap(workspace);
  //   await rescan(workspace, fontIndex, assetIndex, include, exclude);
  //   refreshUnused();
  // }, 1500);

  // // 只监听创建和删除事件（包含重命名），不监听文件内容变化
  // watcher.onDidCreate(() => debounce());
  // watcher.onDidDelete(() => debounce());
  // context.subscriptions.push(watcher);

  // 监听文件保存事件，增量更新引用索引
  // context.subscriptions.push(
  //   vscode.workspace.onDidSaveTextDocument(async (document) => {
  //     // 只处理文本文件（代码文件、样式文件等）
  //     const supportedExtensions = [
  //       "ts", "tsx", "js", "jsx", "vue", "svelte",
  //       "css", "scss", "less", "html", "md"
  //     ];
  //     const ext = document.fileName.split(".").pop()?.toLowerCase();
      
  //     if (!ext || !supportedExtensions.includes(ext)) {
  //       return;
  //     }

  //     // 跳过排除的文件
  //     const relativePath = vscode.workspace.asRelativePath(document.uri);
  //     const shouldExclude = exclude.some(pattern => {
  //       const glob = pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
  //       return new RegExp(glob).test(relativePath);
  //     });
      
  //     if (shouldExclude) {
  //       return;
  //     }

  //     log(`📝 文件已保存，增量更新引用: ${document.fileName}`);
      
  //     // 增量更新该文件的引用
  //     await assetIndex.updateFileReferences(document.uri, document.getText());
      
  //     // 刷新装饰器（更新未使用资源的显示）
  //     refreshUnused();
  //   })
  // );

  // 注册快捷键 Ctrl+R (Windows/Linux) 或 Cmd+R (macOS) 刷新
  context.subscriptions.push(
    vscode.commands.registerCommand("assetLens.manualRefresh", async () => {
      await loadAliasMap(workspace);
      await rescan(workspace, fontIndex, assetIndex, include, exclude);
      refreshUnused();
      vscode.window.showInformationMessage("AssetLens 索引已刷新");
    })
  );

  log("AssetLens 已激活");
}

async function rescan(
  workspace: vscode.WorkspaceFolder,
  fontIndex: FontIndex,
  assetIndex: AssetIndex,
  include: string[],
  exclude: string[]
) {
  await fontIndex.scan(workspace, include, exclude);
  await assetIndex.scan(workspace, include, exclude);
}

function debounceAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delay: number
) {
  let timer: NodeJS.Timeout | undefined;
  return (...args: Parameters<T>) =>
    new Promise<ReturnType<T>>((resolve) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        resolve(await fn(...args));
      }, delay);
    });
}

function registerAssetReferenceProvider(
  context: vscode.ExtensionContext,
  assetIndex: AssetIndex
) {
  // 为资源文件注册 ReferenceProvider，让 VS Code 内置的"查找所有引用"自动使用我们的索引
  const RESOURCE_PATTERN = `**/*.{${[
    ...IMAGE_EXT,
    ...AUDIO_EXT,
    ...VIDEO_EXT,
    ...FONT_EXT,
    ...OTHER_STATIC_EXT,
  ].join(",")}}`;
  const resourceSelector: vscode.DocumentSelector = [
    { scheme: "file", pattern: RESOURCE_PATTERN },
  ];

  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(resourceSelector, {
      provideReferences(document, position, context) {
        const refs = assetIndex.getReferences(document.uri);
        return refs?.references ?? [];
      },
    })
  );
}

function registerStatusBarShortcut(context: vscode.ExtensionContext) {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  item.text = "$(file-media) AssetLens";
  item.tooltip = "打开静态资源面板";
  item.command = "assetLens.showImageGallery";
  item.show();
  context.subscriptions.push(item);
}

export function deactivate() {
  // noop
}