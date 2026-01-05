import * as vscode from "vscode";
import * as path from "path";
import { promises as fs } from "fs";
import { getAliasMapForFile } from "../services/aliasResolver";

export function resolveWorkspacePath(uri: vscode.Uri, targetPath: string): vscode.Uri | undefined {
  if (targetPath.startsWith("http://") || targetPath.startsWith("https://") || targetPath.startsWith("data:")) {
    return undefined;
  }
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  const aliases = getAliasMapForFile(uri.fsPath);

  let p = targetPath.trim();
  // 兼容 webpack/postcss 中的 ~ 前缀
//   if (p.startsWith("~")) p = p.slice(1);

  // 别名解析（tsconfig/jsconfig paths）如 @/assets -> <workspace>/src/assets
  for (const [alias, mappedAbs] of Object.entries(aliases)) {
    const aliasPrefix = alias.endsWith("/") ? alias : `${alias}/`;
    if (p === alias) {
      return vscode.Uri.file(mappedAbs);
    }
    if (p.startsWith(aliasPrefix)) {
      const rest = p.slice(aliasPrefix.length);
      return vscode.Uri.file(path.resolve(mappedAbs, rest));
    }
  }

  // 绝对路径直接返回
  if (path.isAbsolute(p)) {
    return vscode.Uri.file(p);
  }

  // 相对路径以当前文件所在目录为基准
  const baseDir = path.dirname(uri.fsPath);
  const resolved = path.resolve(baseDir, p);

  // 若以 / 开头，尝试以工作区根拼接
  if (p.startsWith("/") && workspaceFolder) {
    return vscode.Uri.file(path.resolve(workspaceFolder.uri.fsPath, "." + p));
  }

  return vscode.Uri.file(resolved);
}

export async function readFileBuffer(uri: vscode.Uri): Promise<Buffer> {
  return fs.readFile(uri.fsPath);
}

export async function statSafe(uri: vscode.Uri) {
  try {
    return await fs.stat(uri.fsPath);
  } catch {
    return undefined;
  }
}

export function toHumanSize(bytes?: number): string {
  if (bytes === undefined) return "未知";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}