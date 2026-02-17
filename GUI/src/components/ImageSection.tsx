import { useEffect, useState } from "react";
import { ImageFile } from "../types";

interface ImageSectionProps {
  data: Array<{ folder: string; files: ImageFile[] }>;
  searchQuery: string;
  sortBy: "name" | "size-asc" | "size-desc";
  duplicateHashes: Record<string, number>;
  largeFileThreshold: number;
  thresholdValue: number;
  thresholdUnit: "B" | "KB" | "MB";
  onThresholdValueChange: (val: number) => void;
  onThresholdUnitChange: (unit: "B" | "KB" | "MB") => void;
  onReveal: (path: string) => void;
  onDuplicateClick: (file: ImageFile) => void;
}

interface FolderGroup {
  folder: string;
  files: ImageFile[];
  collapsed: boolean;
}

export default function ImageSection({
  data,
  searchQuery,
  sortBy,
  duplicateHashes,
  largeFileThreshold,
  thresholdValue,
  thresholdUnit,
  onThresholdValueChange,
  onThresholdUnitChange,
  onReveal,
  onDuplicateClick,
}: ImageSectionProps) {
  const [folders, setFolders] = useState<FolderGroup[]>([]);
  const [previewImage, setPreviewImage] = useState<{
    src: string;
    name: string;
    size: string;
  } | null>(null);
  const [bgBrightness, setBgBrightness] = useState(10); // 0-100

  // 将接收到的数据转换为组件内部状态
  useEffect(() => {
    const folderGroups: FolderGroup[] = data.map((group) => ({
      folder: group.folder,
      files: group.files,
      collapsed: false,
    }));
    setFolders(folderGroups);
  }, [data]);

  const toggleFolder = (folderPath: string) => {
    setFolders((prev) =>
      prev.map((group) =>
        group.folder === folderPath
          ? { ...group, collapsed: !group.collapsed }
          : group,
      ),
    );
  };

  const showPreview = (src: string, name: string, size: string) => {
    setPreviewImage({ src, name, size });
  };

  const closePreview = () => {
    setPreviewImage(null);
  };

  // 排序逻辑
  const sortFiles = (files: ImageFile[]) => {
    return [...files].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "size-asc":
          return (a.sizeBytes || 0) - (b.sizeBytes || 0);
        case "size-desc":
          return (b.sizeBytes || 0) - (a.sizeBytes || 0);
        default:
          return 0;
      }
    });
  };

  // 过滤逻辑
  let filteredFolders = folders
    .map((group) => {
      let files = group.files.filter(
        (file) =>
          !searchQuery ||
          file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          file.relativePath?.toLowerCase().includes(searchQuery.toLowerCase()),
      );

      return {
        ...group,
        files: sortFiles(files),
      };
    })
    .filter((group) => group.files.length > 0);

  if (folders.length === 0) {
    return (
      <div className="empty">
        <div style={{ fontSize: "32px", marginBottom: "8px" }}>🖼️</div>
        <div style={{ fontWeight: 600, marginBottom: "6px" }}>暂无图片资源</div>
        <div className="muted">支持 PNG/JPG/WEBP/SVG/AVIF/BMP 等格式</div>
      </div>
    );
  }

  return (
    <>
      <div className="config-row">
        <div className="threshold-setting">
          <span className="setting-label">大文件阈值:</span>
          <input
            type="number"
            className="threshold-input"
            value={thresholdValue}
            onChange={(e) => onThresholdValueChange(Number(e.target.value))}
            min="1"
          />
          <select
            className="threshold-unit"
            value={thresholdUnit}
            onChange={(e) => onThresholdUnitChange(e.target.value as any)}
          >
            <option value="B">B</option>
            <option value="KB">KB</option>
            <option value="MB">MB</option>
          </select>
        </div>
      </div>

      {filteredFolders.map((group) => (
        <div
          key={group.folder}
          className={`folder-group ${group.collapsed ? "collapsed" : ""}`}
        >
          <div
            className="folder-header"
            onClick={() => toggleFolder(group.folder)}
          >
            <span className="folder-toggle">▼</span>
            <span>📁</span>
            <span className="folder-name">{group.folder}</span>
            <span className="folder-count">{group.files.length} 张</span>
          </div>
          <div className="gallery">
            {group.files.map((file) => {
              const isLarge = (file.sizeBytes || 0) > largeFileThreshold;
              const duplicateCount = file.hash
                ? duplicateHashes[file.hash] || 0
                : 0;
              const isDuplicate = duplicateCount > 1;

              return (
                <div
                  key={file.path}
                  className={`card ${isLarge ? "warning" : ""} ${isDuplicate ? "duplicate" : ""}`}
                  data-file-path={file.path}
                >
                  <div className="card-tags">
                    {isLarge && (
                      <div
                        className="badge warning"
                        title={`文件过大 (阈值: ${thresholdValue}${thresholdUnit})`}
                      >
                        Big
                      </div>
                    )}
                    {isDuplicate && (
                      <div
                        className="badge chongfu"
                        title={`发现 ${duplicateCount} 个重复项`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicateClick(file);
                        }}
                      >
                        重复
                      </div>
                    )}
                  </div>

                  <div
                    className="img-container"
                    onClick={() => showPreview(file.uri, file.name, file.size)}
                  >
                    < img src={file.uri} alt={file.name} loading="lazy" />
                  </div>
                  <div className="card-info">
                    <div
                      className="file-name"
                      title={file.name}
                      onClick={(e) => {
                        onReveal(file.path);
                        e.stopPropagation();
                      }}
                    >
                      {file.name}
                    </div>
                    <div className="file-meta">
                      <span className={isLarge ? "text-warning" : ""}>
                        {file.size}
                      </span>
                      <span className="file-ext">{file.ext}</span>
                    </div>
                    <div>
                      {isDuplicate && (
                        <div
                          className="chongfu-action"
                          style={{ marginTop: "3px" }}
                          title={`发现 ${duplicateCount} 个重复项`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicateClick(file);
                          }}
                        >
                          查看重复
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {previewImage && (
        <div
          className="preview-overlay active"
          onClick={closePreview}
          style={{
            background: `rgb(${bgBrightness * 2.55}, ${bgBrightness * 2.55}, ${bgBrightness * 2.55})`,
          }}
        >
          {/* ... (existing preview code) */}
          <img
            className="preview-image"
            src={previewImage.src}
            alt={previewImage.name}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="preview-info">
            {previewImage.name} · {previewImage.size}
          </div>
          <div className="preview-header">
            <div
              className="preview-bg-control"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="control-label">背景：</span>
              <span className="control-icon">🌑</span>
              <input
                type="range"
                min="0"
                max="100"
                value={bgBrightness}
                onChange={(e) => setBgBrightness(Number(e.target.value))}
                className="bg-slider"
              />
              <span className="control-icon">🌕</span>
            </div>
            <div className="preview-close">
              <button className="btn secondary" onClick={closePreview}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}