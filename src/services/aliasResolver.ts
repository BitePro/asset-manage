import * as vscode from "vscode";
import * as path from "path";
import { promises as fs } from "fs";
import { log } from "../utils/logger";

// 配置文件信息接口
interface ConfigFile {
  uri: vscode.Uri;
  configDir: string; // 配置文件所在目录
  aliases: Record<string, string>; // 别名映射
}

let configFiles: ConfigFile[] = [];
let cached: Record<string, string> = {}; // 向后兼容的全局缓存

export function getAliasMap() {
  return cached;
}

// 根据文件路径获取对应的别名映射（使用最近的配置文件）
export function getAliasMapForFile(filePath: string): Record<string, string> {
  const configFile = findNearestConfigFile(filePath);
  return configFile?.aliases || {};
}

export async function loadAliasMap(workspace: vscode.WorkspaceFolder) {
  try {
    // 查找所有配置文件
    configFiles = await findAllConfigFiles(workspace.uri.fsPath);

    // 加载所有配置文件的别名
    for (const configFile of configFiles) {
      configFile.aliases = await loadAliasesFromConfig(configFile.uri);
    }

    // 更新全局缓存（向后兼容，使用根目录配置）
    const rootConfig = configFiles.find(cf => cf.configDir === workspace.uri.fsPath);
    cached = rootConfig?.aliases || {};

    log(`AliasResolver: 已加载 ${configFiles.length} 个配置文件，别名: ${Object.keys(cached).join(", ") || "无"}`);
  } catch (err) {
    log(`AliasResolver 加载失败: ${err}`);
  }
}

// 递归查找所有配置文件
async function findAllConfigFiles(rootDir: string): Promise<ConfigFile[]> {
  const configFiles: ConfigFile[] = [];
  const configNames = [
    "tsconfig.json",
    "jsconfig.json",
    "angular.json"
  ];

  async function scanDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      // 检查当前目录是否有配置文件
      for (const configName of configNames) {
        const configPath = path.join(dir, configName);
        try {
          await fs.access(configPath);
          const uri = vscode.Uri.file(configPath);
          configFiles.push({
            uri,
            configDir: dir,
            aliases: {}
          });
        } catch {
          // 配置文件不存在，跳过
        }
      }

      // 递归扫描子目录
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await scanDir(path.join(dir, entry.name));
        }
      }
    } catch (err) {
      // 忽略无法访问的目录
    }
  }

  await scanDir(rootDir);
  return configFiles;
}

// 从配置文件加载别名
async function loadAliasesFromConfig(uri: vscode.Uri): Promise<Record<string, string>> {
  const content = await readJson(uri);
  if (!content) return {};

  let paths: Record<string, string[]> | undefined;
  let baseUrl: string = path.dirname(uri.fsPath);

  const fileName = path.basename(uri.fsPath);

  if (fileName === "angular.json") {
    // Angular 项目特殊处理：projects[projectName].architect.build.options
    const projects = content.projects as Record<string, any> | undefined;
    if (projects) {
      // 找到第一个项目配置
      const firstProject = Object.values(projects)[0] as any;
      const buildOptions = firstProject?.architect?.build?.options;
      if (buildOptions) {
        paths = buildOptions.paths;
        baseUrl = buildOptions.baseUrl ? path.resolve(path.dirname(uri.fsPath), buildOptions.baseUrl) : baseUrl;
      }
    }
  } else {
    // 标准 TypeScript/JavaScript 配置处理
    const compiler = content.compilerOptions ?? {};
    baseUrl = compiler.baseUrl ? path.resolve(path.dirname(uri.fsPath), compiler.baseUrl) : path.dirname(uri.fsPath);
    paths = compiler.paths as Record<string, string[]> | undefined;

    // 如果没有 compilerOptions.paths，尝试其他可能的路径配置
    if (!paths) {
      // 尝试直接在根级别查找 paths
      paths = content.paths as Record<string, string[]> | undefined;
    }
  }

  if (!paths) return {};

  const result: Record<string, string> = {};
  Object.entries(paths).forEach(([alias, targets]) => {
    if (!targets?.length) return;
    const normalizedAlias = alias.replace(/\*.*$/, "");
    const targetRaw = targets[0]?.replace(/\*.*$/, "");
    if (!normalizedAlias || !targetRaw) return;
    const abs = path.resolve(baseUrl, targetRaw);
    result[normalizedAlias] = abs;
  });

  return result;
}

// 根据文件路径找到最近的配置文件
function findNearestConfigFile(filePath: string): ConfigFile | undefined {
  const fileDir = path.dirname(filePath);

  // 按路径深度排序（最深的目录优先）
  const sortedConfigs = configFiles
    .filter(config => fileDir.startsWith(config.configDir))
    .sort((a, b) => b.configDir.length - a.configDir.length);

  return sortedConfigs[0];
}

async function readJson(uri: vscode.Uri) {
  try {
    const buf = await fs.readFile(uri.fsPath, "utf8");
    return JSON.parse(buf);
  } catch {
    return undefined;
  }
}