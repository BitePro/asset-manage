import { useState, useEffect } from 'react';
import { FontFile } from '../types';

interface FontSectionProps {
  data: Array<{ folder: string; files: FontFile[] }>;
  searchQuery: string;
  onReveal: (path: string) => void;
}

interface FolderGroup {
  folder: string;
  files: FontFile[];
  collapsed: boolean;
}

export default function FontSection({ 
  data,
  searchQuery, 
  onReveal, 
}: FontSectionProps) {
  const [folders, setFolders] = useState<FolderGroup[]>([]);
  const [fontSizes, setFontSizes] = useState<Record<string, number>>({});
  const [expandedFonts, setExpandedFonts] = useState<Record<string, { state: 'short' | 'partial' | 'full', length: number }>>({});

  // 将接收到的数据转换为组件内部状态
  useEffect(() => {
    const folderGroups: FolderGroup[] = data.map(group => ({
      folder: group.folder,
      files: group.files,
      collapsed: false
    }));
    setFolders(folderGroups);
  }, [data]);

  // 获取所有字体文件（用于动态加载字体）
  const allFontFiles = folders.flatMap(group => group.files);

  // 动态加载字体
  useEffect(() => {
    // 创建或获取 style 元素
    let styleElement = document.getElementById('dynamic-font-faces') as HTMLStyleElement;
    
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'dynamic-font-faces';
      document.head.appendChild(styleElement);
    }

    // 为每个字体生成 @font-face 规则（使用原始索引）
    const fontFaceRules = allFontFiles
      .map((font, index) => {
        if (!font.uri) return ''; // 没有 URI 的字体跳过
        
        const fontId = `font-${index}`;
        return `
          @font-face {
            font-family: '${fontId}';
            src: url('${font.uri}');
          }
        `;
      })
      .filter(rule => rule !== '') // 过滤掉空规则
      .join('\n');

    styleElement.textContent = fontFaceRules;

    // 清理函数
    return () => {
      if (styleElement && styleElement.parentNode) {
        styleElement.parentNode.removeChild(styleElement);
      }
    };
  }, [allFontFiles]);

  const toggleFolder = (folderPath: string) => {
    setFolders(prev =>
      prev.map(group =>
        group.folder === folderPath
          ? { ...group, collapsed: !group.collapsed }
          : group
      )
    );
  };

  const setFontSize = (fontId: string, size: number) => {
    setFontSizes(prev => ({ ...prev, [fontId]: size }));
  };

  const toggleFontText = (fontId: string, font: FontFile) => {
    setExpandedFonts(prev => {
      const current = prev[fontId] || { state: 'short', length: 120 };
      
      if (current.state === 'full') {
        return { ...prev, [fontId]: { state: 'short', length: 120 } };
      }

      let nextLength = current.length;
      if (nextLength === 120) nextLength = 240;
      else if (nextLength === 240) nextLength = 480;
      else if (nextLength === 480) nextLength = 960;
      else if (nextLength === 960) nextLength = 1920;
      else nextLength = font.fullCharset.length;

      const isFull = nextLength >= font.fullCharset.length;
      return {
        ...prev,
        [fontId]: {
          state: isFull ? 'full' : 'partial',
          length: isFull ? font.fullCharset.length : nextLength
        }
      };
    });
  };

  const getDisplayCharset = (font: FontFile, fontId: string) => {
    const expanded = expandedFonts[fontId];
    if (!expanded || expanded.state === 'short') {
      return font.previewCharset;
    }
    if (expanded.state === 'full') {
      return font.fullCharset;
    }
    return font.fullCharset.slice(0, expanded.length);
  };

  const getToggleButtonText = (fontId: string) => {
    const expanded = expandedFonts[fontId];
    if (!expanded || expanded.state !== 'full') {
      return '更多字符集';
    }
    return '收起字符集';
  };

  // 过滤逻辑
  const filteredFolders = folders.map(group => ({
    ...group,
    files: group.files.filter(file => 
      !searchQuery || 
      file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.familyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.relativePath?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(group => group.files.length > 0);

  if (folders.length === 0) {
    return (
      <div className="empty">
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔠</div>
        <div style={{ fontWeight: 600, marginBottom: '6px' }}>未检测到字体文件</div>
        <div className="muted">项目中暂无字体文件</div>
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
          <div className="font-grid">
            {group.files.map((font) => {
              // 使用原始数组中的索引来生成 fontId
              const originalIndex = allFontFiles.findIndex(f => f.path === font.path);
              const fontId = `font-${originalIndex}`;
              const fontSize = fontSizes[fontId] || 18;
              const displayCharset = getDisplayCharset(font, fontId);

              return (
                <div 
                  key={font.path} 
                  className="font-card"
                  data-file-path={font.path}
                  data-file-name={font.name.toLowerCase()}
                >
                  <div className="font-title">
                    <span>🔤</span>
                    <span>{font.name}</span>
                    <span className="badge">{font.ext}</span>
                  </div>
                  <div className="font-family">{font.familyName}</div>
                  {!font.uri ? (
                    <div 
                      className="font-preview"
                      style={{ 
                        fontSize: `${fontSize}px`,
                        color: 'var(--vscode-errorForeground)',
                        fontStyle: 'italic'
                      }}
                    >
                      字体文件 URI 未找到，无法预览
                    </div>
                  ) : (
                    <div 
                      className="font-preview"
                      style={{ 
                        fontFamily: `'${fontId}', sans-serif`,
                        fontSize: `${fontSize}px`
                      }}
                    >
                      {displayCharset}
                    </div>
                  )}
                  <div className="font-size-control">
                    <span>字号</span>
                    <input
                      type="range"
                      min="12"
                      max="64"
                      value={fontSize}
                      aria-label="调整字体预览字号"
                      onChange={(e) => setFontSize(fontId, parseInt(e.target.value))}
                    />
                    <span className="font-size-value">{fontSize}px</span>
                  </div>
                  <div className="font-meta">📁 {font.relativePath} · {font.size}</div>
                  <div className="font-actions">
                    <button 
                      className="btn-link" 
                      onClick={() => toggleFontText(fontId, font)}
                    >
                      {getToggleButtonText(fontId)}
                    </button>
                    <button 
                      className="btn secondary" 
                      onClick={() => onReveal(font.path)}
                    >
                      定位字体文件
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}