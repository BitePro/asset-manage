import { useState, useEffect } from 'react';
import { OfficeFile } from '../types';
import DocumentPreview from './DocumentPreview';
import { useI18n } from '../contexts/I18nContext';

interface OfficeSectionProps {
  data: Array<{ folder: string; files: OfficeFile[] }>;
  searchQuery: string;
  onReveal: (path: string) => void;
  onOpenFile: (path: string) => void;
}

interface FolderGroup {
  folder: string;
  files: OfficeFile[];
  collapsed: boolean;
}

export default function OfficeSection({ 
  data,
  searchQuery, 
  onReveal, 
  onOpenFile
}: OfficeSectionProps) {
  const { t } = useI18n();
  const [folders, setFolders] = useState<FolderGroup[]>([]);
  const [previewFile, setPreviewFile] = useState<OfficeFile | null>(null);

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

  const getFileIcon = (fileType: OfficeFile['fileType']) => {
    switch (fileType) {
      case 'word': return '📝';
      case 'excel': return '📊';
      case 'powerpoint': return '📽️';
      case 'pdf': return '📄';
      default: return '📄';
    }
  };

  const getFileTypeName = (fileType: OfficeFile['fileType']) => {
    switch (fileType) {
      case 'word': return t('wordDoc');
      case 'excel': return t('excelSheet');
      case 'powerpoint': return t('ppt');
      case 'pdf': return t('pdfDoc');
      default: return t('document');
    }
  };

  const handlePreview = (file: OfficeFile) => {
    // 支持 PDF、Word、Excel 文件预览
    if (file.fileType === 'pdf' || file.fileType === 'word' || file.fileType === 'excel') {
      setPreviewFile(file);
    } else {
      // 对于其他类型，直接打开文件
      onOpenFile(file.path);
    }
  };

  const closePreview = () => {
    setPreviewFile(null);
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
        <div style={{ fontWeight: 600, marginBottom: '6px' }}>{t('noOffice')}</div>
        <div className="muted">{t('officeFormats')}</div>
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
          <div className="office-grid">
            {group.files.map(file => (
              <div 
                key={file.path} 
                className="office-card"
                data-file-path={file.path}
                data-file-name={file.name.toLowerCase()}
              >
                <div className="office-title">
                  <span>{getFileIcon(file.fileType)}</span>
                  <span>{file.name}</span>
                  <span className="badge">{file.ext}</span>
                </div>
                <div className="office-type">{getFileTypeName(file.fileType)}</div>
                <div className="office-meta">📦 {file.size}</div>
                <div className="card-actions">
                  {(file.fileType === 'pdf' || file.fileType === 'word' || file.fileType === 'excel') && (
                    <button 
                      className="btn" 
                      onClick={() => handlePreview(file)}
                    >
                      {t('preview')}
                    </button>
                  )}
                  {/* <button 
                    className="btn secondary" 
                    onClick={() => onOpenFile(file.path)}
                  >
                    打开
                  </button> */}
                  <button 
                    className="btn" 
                    onClick={() => onReveal(file.path)}
                  >
                    {t('locateResource')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 文档预览组件 */}
      <DocumentPreview 
        file={previewFile}
        onClose={closePreview}
        onOpenFile={onOpenFile}
      />
    </>
  );
}