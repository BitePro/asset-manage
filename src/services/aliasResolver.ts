import * as vscode from "vscode";
import * as path from "path";
import { promises as fs } from "fs";
import { log } from "../utils/logger";

let cached: Record<string, string> = {};

export function getAliasMap() {
  return cached;
}

export async function loadAliasMap(workspace: vscode.WorkspaceFolder) {
  try {
    const files = ["tsconfig.json", "tsconfig.base.json", "jsconfig.json"];
    const result: Record<string, string> = {};
    for (const name of files) {
      const uri = vscode.Uri.joinPath(workspace.uri, name);
      const content = await readJson(uri);
      if (!content) continue;
      const compiler = content.compilerOptions ?? {};
      const baseUrl = compiler.baseUrl ? path.resolve(workspace.uri.fsPath, compiler.baseUrl) : workspace.uri.fsPath;
      const paths = compiler.paths as Record<string, string[]> | undefined;
      if (!paths) continue;
      Object.entries(paths).forEach(([alias, targets]) => {
        if (!targets?.length) return;
        const normalizedAlias = alias.replace(/\*.*$/, "");
        const targetRaw = targets[0]?.replace(/\*.*$/, "");
        if (!normalizedAlias || !targetRaw) return;
        const abs = path.resolve(baseUrl, targetRaw);
        result[normalizedAlias] = abs;
      });
    }
    cached = result;
    log(`AliasResolver: 已加载别名 ${Object.keys(cached).join(", ") || "无"}`);
  } catch (err) {
    log(`AliasResolver 加载失败: ${err}`);
  }
}

async function readJson(uri: vscode.Uri) {
  try {
    const buf = await fs.readFile(uri.fsPath, "utf8");
    return JSON.parse(buf);
  } catch {
    return undefined;
  }
}