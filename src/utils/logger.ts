import * as vscode from "vscode";

const channel = vscode.window.createOutputChannel("AssetLens");

export function log(info: string) {
  channel.appendLine(info);
}

export function error(info: string, err?: unknown) {
  channel.appendLine(`[error] ${info}`);
  if (err instanceof Error) {
    channel.appendLine(err.stack ?? err.message);
  } else if (err) {
    channel.appendLine(String(err));
  }
}

export function show() {
  channel.show();
}