import * as vscode from "vscode";
import imageSize from "image-size";
import * as path from "path";
import ffprobeStatic from "ffprobe-static";
import ffmpeg from "fluent-ffmpeg";
import { statSafe, readFileBuffer } from "../utils/fsUtils";
import { ResourceInfo, ResourceType } from "../types";
import { log, error } from "../utils/logger";

ffmpeg.setFfprobePath(ffprobeStatic.path);

export const IMAGE_EXT = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "bmp",
  "svg",
  "ico",
];
export const AUDIO_EXT = ["mp3", "wav", "aac", "flac", "ogg", "m4a", "opus"];
export const VIDEO_EXT = ["mp4", "mov", "mkv", "webm", "avi"];
export const FONT_EXT = ["woff", "woff2", "ttf", "otf", "tff"];
export const OFFICE_EXT = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
];

export const OTHER_STATIC_EXT = [
  "txt",
  "csv",
  "json",
  "xml",
  "yaml",
  "yml",
  "psd",
  "ai",
  "eps",
  "sketch",
  "fig",
  "zip",
  "rar",
  "7z",
  "map",
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

export async function getResourceInfo(uri: vscode.Uri): Promise<ResourceInfo> {
  const type = detectResourceType(uri);
  const stat = await statSafe(uri);
  if (!stat) {
    return { uri, type, exists: false };
  }

  const info: ResourceInfo = {
    uri,
    type,
    exists: true,
    sizeBytes: stat.size,
  };

  if (type === "image") {
    try {
      const dim = imageSize(uri.fsPath);
      if (dim.width && dim.height) {
        info.dimensions = { width: dim.width, height: dim.height };
        info.mime = dim.type ? `image/${dim.type}` : undefined;
      }
    } catch (err) {
      error("读取图片尺寸失败", err);
    }
  }

  if (type === "audio" || type === "video") {
    try {
      const meta = await probe(uri.fsPath);
      info.durationSeconds = meta.duration;
      info.codecs = meta.codec;
      info.bitrate = meta.bitrate;
      info.channels = meta.channels;
    } catch (err) {
      error("读取媒体元信息失败", err);
    }
  }

  return info;
}

async function probe(filePath: string): Promise<{ duration?: number; codec?: string; bitrate?: number; channels?: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err: Error | null, data: any) => {
      if (err) return reject(err);
      const stream = data.streams?.[0];
      resolve({
        duration: data.format?.duration,
        codec: stream?.codec_name,
        bitrate: data.format?.bit_rate ? Number(data.format.bit_rate) : undefined,
        channels: stream?.channels,
      });
    });
  });
}

export async function loadInlinePreview(uri: vscode.Uri, maxKB: number): Promise<string | undefined> {
  const stat = await statSafe(uri);
  if (!stat || stat.size > maxKB * 1024) return undefined;
  try {
    const buf = await readFileBuffer(uri);
    const ext = path.extname(uri.fsPath).replace(".", "").toLowerCase();
    const mime = IMAGE_EXT.includes(ext) ? `image/${ext === "svg" ? "svg+xml" : ext}` : "application/octet-stream";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch (err) {
    log(`读取内联预览失败: ${err}`);
    return undefined;
  }
}

export function isResourceExt(text: string) {
  const ext = path.extname(text).replace(".", "").toLowerCase();
  return ALL_RESOURCE_EXT.includes(ext);
}