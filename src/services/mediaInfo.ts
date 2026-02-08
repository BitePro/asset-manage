import * as vscode from "vscode";
import * as path from "path";
import { ResourceType } from "../types";

export const IMAGE_EXT = [
  "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg", "ico",
];
export const AUDIO_EXT = ["mp3", "wav", "aac", "flac", "ogg", "m4a", "opus"];
export const VIDEO_EXT = ["mp4", "mov", "mkv", "webm", "avi"];
export const FONT_EXT = ["woff", "woff2", "ttf", "otf", "tff"];
export const OFFICE_EXT = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
];
export const OTHER_STATIC_EXT = [
  "txt", "csv", "json", "xml", "yaml", "yml", "psd", "ai", "eps",
  "sketch", "fig", "zip", "rar", "7z", "map",
];

const ALL_RESOURCE_EXT = [
  ...IMAGE_EXT,
  ...AUDIO_EXT,
  ...VIDEO_EXT,
  ...FONT_EXT,
  ...OFFICE_EXT,
  ...OTHER_STATIC_EXT,
];

export function detectResourceType(uri: vscode.Uri): ResourceType {
  const ext = path.extname(uri.fsPath).replace(".", "").toLowerCase();
  if (IMAGE_EXT.includes(ext)) return "image";
  if (AUDIO_EXT.includes(ext)) return "audio";
  if (VIDEO_EXT.includes(ext)) return "video";
  if (FONT_EXT.includes(ext)) return "font";
  return "other";
}

export function isResourceExt(text: string): boolean {
  const ext = path.extname(text).replace(".", "").toLowerCase();
  return ALL_RESOURCE_EXT.includes(ext);
}
