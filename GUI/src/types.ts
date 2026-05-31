// VSCode Webview API 类型定义
export interface VsCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare global {
  interface Window {
    acquireVsCodeApi(): VsCodeApi;
  }
}

// 消息类型定义
export type MessageToExtension =
  | { type: 'refresh' }
  | { type: 'reveal'; path: string }
  | { type: 'openFile'; path: string }
  | { type: 'semanticSearch'; query: string }
  | { type: 'buildIndex' }
  | { type: 'cancelSearch' };

export type MessageFromExtension =
  | { type: 'refreshDone' }
  | { type: 'previewFont'; fileName: string }
  | { type: 'enterSemanticSearch' }
  | { type: 'searchStart'; query: string }
  | { type: 'searchResults'; query: string; results: ImageFile[] }
  | { type: 'indexProgress'; processed: number; total: number }
  | { type: 'indexBuilt'; count: number }
  | { type: 'modelDownloadProgress'; file: string; percent: number }
  | { type: 'searchError'; message: string }
  | { type: 'searchCancelled' };

// 资源类型定义
export interface AssetFile {
  path: string;
  name: string;
  size: string;
  ext: string;
  uri?: string;
  relativePath?: string;
  folder?: string;
  sizeBytes?: number;
  hash?: string;
}

export interface FontFile extends AssetFile {
  familyName: string;
  charset: string;
  fullCharset: string;
  previewCharset: string;
}

export interface ImageFile extends AssetFile {
  uri: string;
  score?: number;
  clipScore?: number;
  ocrScore?: number;
}

export interface MediaFile extends AssetFile {
  uri: string;
  kind: 'audio' | 'video';
}

export interface OfficeFile extends AssetFile {
  uri: string;
  fileType: 'word' | 'excel' | 'powerpoint' | 'pdf';
}

export interface Stats {
  images: number;
  media: number;
  fonts: number;
  office: number;
  others: number;
  folders: number;
  total: number;
}
