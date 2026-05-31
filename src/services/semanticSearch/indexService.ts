import * as vscode from "vscode";
import fg from "fast-glob";
import { promises as fsp } from "fs";
import { ScannedFile } from "./types";
import { IMAGE_EXT } from "../mediaInfo";

/**
 * 枚举工作区图片文件（复用 fast-glob 扫描 + IMAGE_EXT，遵循 scanInclude/scanExclude）。
 * 返回 {filePath, mtime}，供 worker 做增量索引。对应任务 4.1 / 4.2。
 */
export async function enumerateImages(
  workspaceFsPath: string,
): Promise<ScannedFile[]> {
  const config = vscode.workspace.getConfiguration("assetManage");
  const include = config.get<string[]>("scanInclude") ?? ["**/*"];
  const exclude = config.get<string[]>("scanExclude") ?? [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
  ];

  let files: string[];
  const isDefaultInclude = include.length === 1 && include[0] === "**/*";
  if (!isDefaultInclude) {
    const all = await fg(include, {
      cwd: workspaceFsPath,
      ignore: exclude,
      absolute: true,
      suppressErrors: true,
      onlyFiles: true,
    });
    files = all.filter((p) => IMAGE_EXT.includes(extLower(p)));
  } else {
    const pattern = `**/*.{${IMAGE_EXT.join(",")}}`;
    files = await fg([pattern], {
      cwd: workspaceFsPath,
      ignore: exclude,
      absolute: true,
      suppressErrors: true,
      onlyFiles: true,
    });
  }

  const scanned: ScannedFile[] = [];
  for (const filePath of files) {
    try {
      const stat = await fsp.stat(filePath);
      scanned.push({ filePath, mtime: stat.mtimeMs });
    } catch {
      // 不可读文件跳过
    }
  }
  return scanned;
}

function extLower(p: string): string {
  const idx = p.lastIndexOf(".");
  return idx >= 0 ? p.slice(idx + 1).toLowerCase() : "";
}
