import { useState, useEffect } from 'react';
import { AssetFile } from '../types';

interface OtherSectionProps {
  data: Array<{ folder: string; files: AssetFile[] }>;
  searchQuery: string;
  onReveal: (path: string) => void;
  onOpenFile: (path: string) => void;
}

interface FolderGroup {
  folder: string;
  files: AssetFile[];
  collapsed: boolean;
}

export default function OtherSection({ 
  data,
  searchQuery, 
  onReveal, 
}: OtherSectionProps) {
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
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>📂</div>
        <div style={{ fontWeight: 600, marginBottom: '6px' }}>暂无其他静态资源</div>
        <div className="muted">支持 txt/json/yaml/psd/ai/zip 等常见格式</div>
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
            <span className="folder-count">{group.files.length} 个</span>
          </div>
          <div className="other-grid">
            {group.files.map(file => (
              <div 
                key={file.path} 
                className="other-card"
                data-file-path={file.path}
                data-file-name={file.name.toLowerCase()}
              >
                <div className="other-title">
                  <span>📄</span>
                  <span>{file.name}</span>
                  <span className="badge">{file.ext || 'FILE'}</span>
                </div>
                <div className="other-meta">📦 {file.size}</div>
                <div className="card-actions">
                  {/* <button className="btn secondary" onClick={() => onOpenFile(file.path)}>
                    打开
                  </button> */}
                  <button className="btn secondary" onClick={() => onReveal(file.path)}>
                    资源定位
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