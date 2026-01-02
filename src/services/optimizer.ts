import * as vscode from "vscode";
import sharp from "sharp";
import { statSafe } from "../utils/fsUtils";
import { OptimizationEstimate, ResourceInfo } from "../types";

export async function estimateOptimization(info: ResourceInfo): Promise<OptimizationEstimate[] | undefined> {
  if (!info.exists || info.type !== "image") return undefined;
  const stat = await statSafe(info.uri);
  if (!stat) return undefined;

  const res: OptimizationEstimate[] = [];
  try {
    const webp = await sharp(info.uri.fsPath).webp({ quality: 75 }).toBuffer({ resolveWithObject: true });
    res.push({
      format: "webp",
      estimatedSizeBytes: webp.data.length,
      savingPercent: calcSaving(stat.size, webp.data.length),
    });
  } catch {
    // ignore
  }

  try {
    const avif = await sharp(info.uri.fsPath).avif({ quality: 60 }).toBuffer({ resolveWithObject: true });
    res.push({
      format: "avif",
      estimatedSizeBytes: avif.data.length,
      savingPercent: calcSaving(stat.size, avif.data.length),
    });
  } catch {
    // ignore
  }

  return res.length ? res : undefined;
}

function calcSaving(original: number, estimated: number) {
  if (original === 0) return 0;
  return Math.max(0, Math.round((1 - estimated / original) * 100));
}