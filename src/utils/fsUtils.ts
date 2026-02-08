import { promises as fs } from "fs";

export async function statSafe(uri: { fsPath: string }) {
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
