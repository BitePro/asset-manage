import { useEffect, useState } from 'react';
import { ImageFile } from '../types';

interface ImageSectionProps {
  data: Array<{ folder: string; files: ImageFile[] }>;
  searchQuery: string;
  onReveal: (path: string) => void;
  // onOpenFile: (path: string) => void;
}

interface FolderGroup {
  folder: string;
  files: ImageFile[];
  collapsed: boolean;
}

export default function ImageSection({ 
  data,
  searchQuery, 
  onReveal, 
  // onOpenFile
}: ImageSectionProps) {
  const [folders, setFolders] = useState<FolderGroup[]>([]);
  const [previewImage, setPreviewImage] = useState<{ src: string; name: string; size: string } | null>(null);
  const [bgBrightness, setBgBrightness] = useState(10); // 0-100，0=黑色，100=白色

  // 将接收到的数据转换为组件内部状态
  useEffect(() => {
    const folderGroups: FolderGroup[] = data.map(group => ({
      folder: group.folder,
      files: group.files,
      collapsed: false
    }));
    setFolders(folderGroups);
  }, [data]);

  const toggleFolder = (folderPath: string) => {
    setFolders(prev =>
      prev.map(group =>
        group.folder === folderPath
          ? { ...group, collapsed: !group.collapsed }
          : group
      )
    );
  };

  const showPreview = (src: string, name: string, size: string) => {
    setPreviewImage({ src, name, size });
  };

  const closePreview = () => {
    setPreviewImage(null);
  };

  // 过滤逻辑
  const filteredFolders = folders.map(group => ({
    ...group,
    files: group.files.filter(file => 
      !searchQuery || 
      file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.relativePath?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(group => group.files.length > 0);

  if (folders.length === 0) {
    return (
      <div className="empty">
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🖼️</div>
        <div style={{ fontWeight: 600, marginBottom: '6px' }}>暂无图片资源</div>
        <div className="muted">支持 PNG/JPG/WEBP/SVG/AVIF/BMP 等格式</div>
      </div>
    );
  }

  return (
    <>
      {filteredFolders.map(group => (
        <div key={group.folder} className={`folder-group ${group.collapsed ? 'collapsed' : ''}`}>
          <div className="folder-header" onClick={() => toggleFolder(group.folder)}>
            <span className="folder-toggle">▼</span>
            <span>📁</span>
            <span className="folder-name">{group.folder}</span>
            <span className="folder-count">{group.files.length} 张</span>
          </div>
          <div className="gallery">
            {group.files.map(file => (
              <div 
                key={file.path} 
                className="card" 
                data-file-path={file.path}
                data-file-name={file.name.toLowerCase()}
              >
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
                    onClick={(e) => { onReveal(file.path); e.stopPropagation(); }}
                  >
                    {file.name}
                  </div>
                  <div className="file-meta">
                    <span>{file.size}</span>
                    <span className="file-ext">{file.ext}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {previewImage && (
        <div 
          className="preview-overlay active" 
          onClick={closePreview}
          style={{
            background: `rgb(${bgBrightness * 2.55}, ${bgBrightness * 2.55}, ${bgBrightness * 2.55})`
          }}
        >
          < img 
            className="preview-image" 
            src={previewImage.src} 
            alt={previewImage.name} 
            onClick={(e) => e.stopPropagation()}
          />
          <div className="preview-info">
            {previewImage.name} · {previewImage.size}
          </div>
          <div className='preview-header'>
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
            <div className='preview-close'>
              <button className="btn secondary" onClick={closePreview}>关闭</button>
            </div>
          </div>
          
        </div>
      )}
    </>
  );
}