import { useState, useEffect, useRef, useCallback } from 'react';
import { OfficeFile } from '../types';
import { renderAsync } from 'docx-preview';
import * as XLSX from 'xlsx';

// 声明全局类型（仅用于 PDF.js）
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

interface DocumentPreviewProps {
  file: OfficeFile | null;
  onClose: () => void;
  onOpenFile: (path: string) => void;
}

export default function DocumentPreview({ 
  file, 
  onClose,
  onOpenFile 
}: DocumentPreviewProps) {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null);
  const [docxRendered, setDocxRendered] = useState<boolean>(false); // 标记 DOCX 是否已渲染
  
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const docxContainerRef = useRef<HTMLDivElement>(null);

  // 重置状态
  const resetState = () => {
    setPdfDoc(null);
    setCurrentPage(1);
    setTotalPages(0);
    setIsLoading(false);
    setError(null);
    setPageImageUrl(null);
    setDocxRendered(false);
    // 清空 DOCX 容器
    if (docxContainerRef.current) {
      docxContainerRef.current.innerHTML = '';
    }
  };

  // 加载文档
  useEffect(() => {
    if (!file) {
      resetState();
      return;
    }
    
    resetState();
    setIsLoading(true);
    setError(null);

    const loadDocument = async () => {
      try {
        switch (file.fileType) {
          case 'pdf':
            await loadPDF(file);
            break;
          case 'word':
            await loadDOCX(file);
            break;
          case 'excel':
            await loadXLSX(file);
            break;
          default:
            setError(`暂不支持预览 ${file.fileType} 格式`);
            setIsLoading(false);
        }
      } catch (err) {
        console.error('Error loading document:', err);
        setError(`加载文档失败: ${err instanceof Error ? err.message : '未知错误'}`);
        setIsLoading(false);
      }
    };

    loadDocument();
  }, [file]);

  // 缩放文档以适应容器宽度
  const scaleDocxToFit = useCallback(() => {
    if (!docxContainerRef.current) return;
    
    const wrapper = docxContainerRef.current.querySelector('.docx-wrapper') as HTMLElement;
    if (!wrapper) return;
    
    // 容器可用宽度（减去左右各10px的padding）
    const containerWidth = docxContainerRef.current.clientWidth - 20;
    
    // 文档原始宽度
    const docWidth = wrapper.scrollWidth;
    
    console.log('Container width:', containerWidth, 'Doc width:', docWidth);
    
    // 如果文档宽度大于容器宽度，需要缩放
    if (docWidth > containerWidth) {
      const scale = containerWidth / docWidth;
      wrapper.style.transform = `scale(${scale})`;
      wrapper.style.transformOrigin = 'top center';
      // 调整wrapper高度以适应缩放后的内容
      wrapper.style.marginBottom = `${wrapper.offsetHeight * (1 - scale)}px`;
      console.log('Applied scale:', scale);
    } else {
      // 文档宽度小于容器，不需要缩放，但要居中
      wrapper.style.transform = 'none';
      wrapper.style.marginBottom = '0';
    }
  }, []);

  // 加载 PDF
  const loadPDF = async (file: OfficeFile) => {
    if (!window.pdfjsLib) {
      throw new Error('PDF.js 库未加载，请刷新页面重试');
    }

    console.log('Loading PDF from:', file.uri);
    const loadingTask = window.pdfjsLib.getDocument(file.uri);
    const pdf = await loadingTask.promise;
    console.log('PDF loaded successfully, pages:', pdf.numPages);
    setPdfDoc(pdf);
    setTotalPages(pdf.numPages);
    setCurrentPage(1);
    setIsLoading(false);
  };

  // 加载 DOCX
  const loadDOCX = async (file: OfficeFile) => {
    if (!docxContainerRef.current) {
      throw new Error('DOCX 预览容器未就绪');
    }

    console.log('Loading DOCX from:', file.uri);
    
    // 获取文件内容
    const response = await fetch(file.uri);
    const blob = await response.blob();
    
    // 使用 docx-preview 渲染 DOCX
    await renderAsync(blob, docxContainerRef.current, undefined, {
      className: 'docx',
      inWrapper: true,
      ignoreWidth: false,  // 保持原始宽度
      ignoreHeight: false, // 保持原始高度
      ignoreFonts: false,
      breakPages: true,   // 不强制分页，让内容连续显示
      ignoreLastRenderedPageBreak: false,
      experimental: false,
      trimXmlDeclaration: true,
      useBase64URL: true,
      renderChanges: false,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      debug: false,
    });
    
    console.log('DOCX rendered successfully');
    setDocxRendered(true);
    setIsLoading(false);
    
    // 渲染完成后，计算并应用缩放
    setTimeout(() => {
      scaleDocxToFit();
    }, 100);
  };

  // 加载 XLSX
  const loadXLSX = async (file: OfficeFile) => {
    if (!previewContainerRef.current) {
      throw new Error('预览容器未就绪');
    }

    console.log('Loading XLSX from:', file.uri);
    
    // 获取文件内容
    const response = await fetch(file.uri);
    const arrayBuffer = await response.arrayBuffer();
    
    // 解析 Excel 文件
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
    // 创建标签页容器
    const container = previewContainerRef.current;
    container.innerHTML = '';
    
    // 如果有多个工作表，创建标签切换
    if (workbook.SheetNames.length > 1) {
      const tabsContainer = document.createElement('div');
      tabsContainer.className = 'excel-tabs';
      tabsContainer.style.cssText = `
        display: flex;
        gap: 5px;
        padding: 10px;
        background: var(--vscode-editor-background);
        border-bottom: 1px solid var(--vscode-panel-border);
        overflow-x: auto;
      `;
      container.appendChild(tabsContainer);

      const contentContainer = document.createElement('div');
      contentContainer.className = 'excel-content';
      contentContainer.style.cssText = `
        padding: 20px;
        overflow: auto;
        flex: 1;
        background: #ffffff;
      `;
      container.appendChild(contentContainer);

      // 为每个工作表创建标签
      workbook.SheetNames.forEach((sheetName: string, index: number) => {
        const tab = document.createElement('button');
        tab.className = 'excel-tab';
        tab.textContent = sheetName;
        tab.style.cssText = `
          padding: 8px 16px;
          border: none;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          cursor: pointer;
          border-radius: 3px;
          white-space: nowrap;
        `;
        
        tab.onclick = () => {
          // 更新激活状态
          Array.from(tabsContainer.children).forEach((t) => {
            (t as HTMLElement).style.background = 'var(--vscode-button-secondaryBackground)';
          });
          tab.style.background = 'var(--vscode-button-background)';
          
          // 显示对应的工作表
          renderSheet(workbook, sheetName, contentContainer);
        };
        
        tabsContainer.appendChild(tab);
        
        // 默认显示第一个工作表
        if (index === 0) {
          tab.style.background = 'var(--vscode-button-background)';
          renderSheet(workbook, sheetName, contentContainer);
        }
      });
    } else {
      // 只有一个工作表，直接显示
      container.style.padding = '20px';
      container.style.background = '#ffffff';
      renderSheet(workbook, workbook.SheetNames[0], container);
    }
    
    console.log('XLSX loaded successfully');
    setIsLoading(false);
  };

  // 渲染 Excel 工作表
  const renderSheet = (workbook: any, sheetName: string, container: HTMLElement) => {
    const worksheet = workbook.Sheets[sheetName];
    const html = XLSX.utils.sheet_to_html(worksheet, {
      id: 'excel-table',
      editable: false
    });
    
    container.innerHTML = html;
    
    // 美化表格样式
    const table = container.querySelector('table');
    if (table) {
      table.style.cssText = `
        border-collapse: collapse;
        width: 100%;
        background: #ffffff;
        color: #000000;
      `;
      
      // 美化单元格
      const cells = table.querySelectorAll('td, th');
      cells.forEach((cell) => {
        (cell as HTMLElement).style.cssText = `
          border: 1px solid #d0d0d0;
          padding: 8px;
          text-align: left;
          background: #ffffff;
          color: #000000;
        `;
      });
      
      // 美化表头
      const headers = table.querySelectorAll('th');
      headers.forEach((header) => {
        (header as HTMLElement).style.cssText += `
          background: #f0f0f0;
          font-weight: bold;
        `;
      });
    }
  };

  // 监听窗口大小变化，重新计算 DOCX 缩放
  useEffect(() => {
    if (!docxRendered || !file || file.fileType !== 'word') return;

    const handleResize = () => {
      scaleDocxToFit();
    };

    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [docxRendered, file, scaleDocxToFit]);

  // 渲染 PDF 页面
  useEffect(() => {
    if (!pdfDoc || !file || file.fileType !== 'pdf') return;

    const renderPage = async () => {
      try {
        console.log(`Rendering page ${currentPage}...`);
        setIsLoading(true);
        setPageImageUrl(null);

        const page = await pdfDoc.getPage(currentPage);
        console.log('Page loaded:', currentPage);
        
        // 创建临时 canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('无法创建渲染上下文');
        }

        // 计算合适的缩放比例（提高清晰度）
        const viewport = page.getViewport({ scale: 2 });
        console.log('Viewport size:', viewport.width, 'x', viewport.height);
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        // 渲染 PDF 页面到 canvas
        await page.render(renderContext).promise;
        console.log('Page rendered to canvas');
        
        // 将 canvas 转换为图片 URL
        const imageUrl = canvas.toDataURL('image/png');
        console.log('Canvas converted to image, size:', imageUrl.length, 'bytes');
        setPageImageUrl(imageUrl);
        setIsLoading(false);
      } catch (err) {
        console.error('Error rendering page:', err);
        setError(`渲染 PDF 页面失败: ${err instanceof Error ? err.message : '未知错误'}`);
        setIsLoading(false);
      }
    };

    renderPage();
  }, [pdfDoc, currentPage, file]);

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  if (!file) {
    return null;
  }

  return (
    <div className="preview-overlay active" onClick={onClose}>
      <div className="preview-controls" onClick={(e) => e.stopPropagation()}>
        {/* PDF 分页控制 */}
        {file.fileType === 'pdf' && totalPages > 0 && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px',
            marginLeft: 'auto',
            marginRight: '10px'
          }}>
            <button 
              className="btn secondary" 
              onClick={goToPrevPage}
              disabled={currentPage === 1}
              style={{ minWidth: '60px' }}
            >
              上一页
            </button>
            <span style={{ 
              padding: '0 10px',
              whiteSpace: 'nowrap'
            }}>
              {currentPage} / {totalPages}
            </span>
            <button 
              className="btn secondary" 
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              style={{ minWidth: '60px' }}
            >
              下一页
            </button>
          </div>
        )}
        <button 
          className="btn secondary" 
          onClick={onClose}
        >
          关闭
        </button>
      </div>
      
      <div 
        className="document-preview-container" 
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: file.fileType === 'pdf' ? 'center' : 'flex-start',
          alignItems: file.fileType === 'pdf' ? 'center' : 'stretch',
          padding: file.fileType === 'pdf' ? '20px' : '0',
          overflow: 'auto',
          height: 'calc(100% - 100px)',
          background: file.fileType === 'word' ? '#525659' : 'var(--vscode-editor-background)'
        }}
      >
        {isLoading && (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: 'var(--vscode-foreground)'
          }}>
            <p>正在加载文档...</p >
          </div>
        )}
        
        {error && (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: 'var(--vscode-errorForeground)'
          }}>
            <p>{error}</p >
            <p style={{ marginTop: '20px' }}>
              <button 
                className="btn" 
                onClick={() => onOpenFile(file.path)}
              >
                在系统默认应用中打开
              </button>
            </p >
          </div>
        )}
        
        {/* PDF 预览 */}
        {!isLoading && !error && file.fileType === 'pdf' && pageImageUrl && (
          < img 
            src={pageImageUrl}
            alt={`PDF 第 ${currentPage} 页`}
            style={{
              maxWidth: '100%',
              height: 'auto',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              display: 'block'
            }}
          />
        )}
        
        {/* DOCX 预览 */}
        {!error && file.fileType === 'word' && (
          <div 
            ref={docxContainerRef}
            className="docx-preview-wrapper"
            style={{
              display: docxRendered ? 'block' : 'none'
            }}
          />
        )}
        
        {/* XLSX 预览容器 !isLoading */}
        {!error && file.fileType === 'excel' && (
          <div 
            ref={previewContainerRef}
            style={{
              width: '100%',
              minHeight: '100%',
              overflow: 'auto',
              background: 'var(--vscode-editor-background)',
              color: 'var(--vscode-editor-foreground)'
            }}
          />
        )}
      </div>
      
      <div className="preview-info">
        {file.name} · {file.size}
        {file.fileType === 'pdf' && totalPages > 0 && ` · ${totalPages} 页`}
      </div>
    </div>
  );
}