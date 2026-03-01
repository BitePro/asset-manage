import { useEffect, useState } from 'react';
import { MediaFile } from '../types';
import { useI18n } from '../contexts/I18nContext';
import { handleAssetDragStart } from '../utils/dragUtils';

interface MediaSectionProps {
  data: Array<{ folder: string; files: MediaFile[] }>;
  searchQuery: string;
  onReveal: (path: string) => void;
  onOpenFile: (path: string) => void;
}

interface FolderGroup {
  folder: string;
  files: MediaFile[];
  collapsed: boolean;
}

export default function MediaSection({ 
  data,
  searchQuery, 
  onReveal, 
}: MediaSectionProps) {
  const { t } = useI18n();
  const [folders, setFolders] = useState<FolderGroup[]>([]);

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
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎵</div>
        <div style={{ fontWeight: 600, marginBottom: '6px' }}>{t('noMedia')}</div>
        <div className="muted">{t('mediaFormats')}</div>
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
            <span className="folder-count">{t('itemsCount', group.files.length)}</span>
          </div>
          <div className="media-grid">
            {group.files.map(file => (
              <div 
                key={file.path} 
                className="media-card draggable-asset"
                data-file-path={file.path}
                data-file-name={file.name.toLowerCase()}
                draggable
                onDragStart={(e) => handleAssetDragStart(e, file.relativePath || file.path)}
                title={t('dragToInsert')}
              >
                <div className="media-title">
                  <span>{file.kind === 'video' ? '🎬' : '🎧'}</span>
                  <span>{file.name}</span>
                  <span className="badge">{file.ext}</span>
                </div>
                <div className="media-preview">
                  {file.kind === 'video' ? (
                    <video src={file.uri} controls preload="metadata" style={{ maxHeight: '160px' }} draggable={false} />
                  ) : (
                    <audio src={file.uri} controls preload="metadata" draggable={false} />
                  )}
                </div>
                <div className="media-meta">📦 {file.size}</div>
                <div className="card-actions">
                  <button className="btn" onClick={() => onReveal(file.path)}>
                    {t('locateResource')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}