/**
 * 拖拽工具函数 - 将资源相对路径设置到 DataTransfer，支持拖拽到编辑器
 */
export function handleAssetDragStart(
    e: React.DragEvent,
    relativePath: string
  ): void {
    if (!relativePath) return;
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", relativePath);
    // 同时设置 text/uri-list 以兼容部分编辑器的文件路径识别
    e.dataTransfer.setData("text/uri-list", relativePath);
  }