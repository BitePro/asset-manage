import * as vscode from "vscode";
import simpleGit from "simple-git";
import { GitInfo } from "../types";
import { log } from "../utils/logger";

export async function getGitInfo(uri: vscode.Uri): Promise<GitInfo | undefined> {
  const workspace = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspace) return undefined;
  const git = simpleGit(workspace.uri.fsPath);
  try {
    const res = await git.raw(["log", "-1", "--stat", "--", uri.fsPath]);
    const lines = res.split("\n").filter(Boolean);
    const header = lines[0];
    const match = header.match(/^commit\s+(.+)/);
    const authorLine = lines.find((l) => l.startsWith("Author:"));
    const dateLine = lines.find((l) => l.startsWith("Date:"));
    const stats = lines.find((l) => l.includes("|"));
    return {
      author: authorLine?.replace("Author:", "").trim(),
      date: dateLine?.replace("Date:", "").trim(),
      message: lines[lines.length - 1]?.trim(),
      sizeChange: stats?.split("|")[1]?.trim(),
    };
  } catch (err) {
    log(`获取 git 信息失败: ${err}`);
    return undefined;
  }
}