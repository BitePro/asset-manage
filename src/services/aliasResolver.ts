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
    // 支持多种前端项目配置文件
    const files = [
      // TypeScript/JavaScript 项目配置
      "tsconfig.json",
      "tsconfig.base.json",
      "jsconfig.json",

      // Vite 项目配置
      "vite.config.json",

      // Next.js 项目配置
      "next.config.json",

      // Nuxt.js 项目配置
      "nuxt.config.json",

      // Angular 项目配置
      "angular.json",

      // Snowpack 项目配置
      "snowpack.config.json",

      // Parcel 项目配置
      ".parcelrc",

      // 其他可能的配置文件
      "tsconfig.build.json",
      "tsconfig.app.json",
      "tsconfig.node.json"
    ];
    const result: Record<string, string> = {};
    for (const name of files) {
      const uri = vscode.Uri.joinPath(workspace.uri, name);
      const content = await readJson(uri);
      if (!content) continue;

      let paths: Record<string, string[]> | undefined;
      let baseUrl: string = workspace.uri.fsPath;

      if (name === "angular.json") {
        // Angular 项目特殊处理：projects[projectName].architect.build.options
        const projects = content.projects as Record<string, any> | undefined;
        if (projects) {
          // 找到第一个项目配置
          const firstProject = Object.values(projects)[0] as any;
          const buildOptions = firstProject?.architect?.build?.options;
          if (buildOptions) {
            paths = buildOptions.paths;
            baseUrl = buildOptions.baseUrl ? path.resolve(workspace.uri.fsPath, buildOptions.baseUrl) : baseUrl;
          }
        }
      } else {
        // 标准 TypeScript/JavaScript 配置处理
        const compiler = content.compilerOptions ?? {};
        baseUrl = compiler.baseUrl ? path.resolve(workspace.uri.fsPath, compiler.baseUrl) : workspace.uri.fsPath;
        paths = compiler.paths as Record<string, string[]> | undefined;

        // 如果没有 compilerOptions.paths，尝试其他可能的路径配置
        if (!paths) {
          // 尝试直接在根级别查找 paths
          paths = content.paths as Record<string, string[]> | undefined;
        }
      }

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