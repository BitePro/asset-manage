import * as vscode from "vscode";
import { AssetIndex } from "../services/assetIndex";

export function registerUnusedDecoration(
  context: vscode.ExtensionContext,
  assetIndex: AssetIndex
) {
  const enable = vscode.workspace
    .getConfiguration("assetLens")
    .get<boolean>("unusedDecoration.enable", true);
  if (!enable) return () => {};

  const emitter = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  const decorationProvider: vscode.FileDecorationProvider = {
    onDidChangeFileDecorations: emitter.event,
    provideFileDecoration(uri) {
      const unused = assetIndex
        .getUnused()
        .some((a) => a.fsPath === uri.fsPath);
      if (!unused) return;
      return {
        color: new vscode.ThemeColor("disabledForeground"),
        tooltip: "未被引用的资源",
      };
    },
  };

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(decorationProvider)
  );

  return () => emitter.fire(undefined);
}