import * as vscode from "vscode";

export type ResourceType = "image" | "audio" | "video" | "font" | "other";

export interface ResourceInfo {
  uri: vscode.Uri;
  type: ResourceType;
  exists: boolean;
  sizeBytes?: number;
  dimensions?: { width: number; height: number };
  durationSeconds?: number;
  codecs?: string;
  channels?: number;
  bitrate?: number;
  mime?: string;
}

export interface OptimizationEstimate {
  format: "webp" | "avif";
  estimatedSizeBytes: number;
  savingPercent: number;
  note?: string;
}

export interface GitInfo {
  author?: string;
  date?: string;
  message?: string;
  sizeChange?: string;
}

export interface FontFaceEntry {
  family: string;
  sources: string[];
  declaredIn: vscode.Uri;
  range?: vscode.Range;
  weight?: string;      // font-weight 值
  style?: string;       // font-style 值
  stretch?: string;     // font-stretch 值
  display?: string;     // font-display 值
  unicodeRange?: string; // unicode-range 值
  base64Data?: string;  // 字体文件的 Base64 数据，用于 SVG 预览
  characters?: string;  // 字体支持的字符集（用于预览文本生成）
}

export interface AssetReference {
  resource: vscode.Uri;
  references: vscode.Location[];
}