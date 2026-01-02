import { useEffect, useState, useCallback } from 'react';
import { VsCodeApi, MessageFromExtension, Stats } from './types';
import Header from './components/Header';
import SearchBar from './components/SearchBar';
import TabBar from './components/TabBar';
import ImageSection from './components/ImageSection';
import MediaSection from './components/MediaSection';
import FontSection from './components/FontSection';
import OfficeSection from './components/OfficeSection';
import OtherSection from './components/OtherSection';
import PreviewOverlay from './components/PreviewOverlay';

// 获取 VSCode API
const vscode: VsCodeApi = window.acquireVsCodeApi();

export default function App() {
  const [activeTab, setActiveTab] = useState<'images' | 'media' | 'fonts' | 'office' | 'others'>('images');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [assetData, setAssetData] = useState<any>(null);
  const [stats, setStats] = useState<Stats>({
    images: 0,
    media: 0,
    fonts: 0,
    office: 0,
    others: 0,
    folders: 0,
    total: 0
  });

  // 组件加载时请求数据
  useEffect(() => {
    // 延迟请求数据，确保 VSCode API 已准备好
    const timer = setTimeout(() => {
      vscode.postMessage({ type: 'getData' });
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  // 处理来自扩展的消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent<MessageFromExtension | any>) => {
      const message = event.data;
      
      if (message.type === 'refreshDone') {
        setIsRefreshing(false);
      } else if (message.type === 'previewFont') {
        setActiveTab('fonts');
        setTimeout(() => {
          setSearchQuery(message.fileName);
        }, 100);
      } else if (message.type === 'assetData') {
        // 接收资源数据
        setAssetData(message.data);
        
        // 更新统计信息
        const data = message.data;
        const imageCount = data.images?.reduce((sum: number, group: any) => sum + group.files.length, 0) || 0;
        const mediaCount = data.media?.reduce((sum: number, group: any) => sum + group.files.length, 0) || 0;
        const fontCount = data.fonts?.reduce((sum: number, group: any) => sum + group.files.length, 0) || 0;
        const officeCount = data.office?.reduce((sum: number, group: any) => sum + group.files.length, 0) || 0;
        const othersCount = data.others?.reduce((sum: number, group: any) => sum + group.files.length, 0) || 0;
        const folderCount = data.images?.length || 0;
        
        setStats({
          images: imageCount,
          media: mediaCount,
          fonts: fontCount,
          office: officeCount,
          others: othersCount,
          folders: folderCount,
          total: imageCount + mediaCount + fontCount + officeCount + othersCount
        });
      } else if (message.type === 'fontData') {
        // 接收字体数据（用于字体专用视图）
        console.log('📥 接收到字体数据:', message.data);
        console.log('📊 字体数量:', message.data?.length);
        if (message.data && message.data.length > 0) {
          console.log('🔍 第一个字体:', message.data[0]);
        }
        setAssetData({ fonts: message.data });
        setStats(prev => ({ ...prev, fonts: message.data?.length || 0 }));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    vscode.postMessage({ type: 'refresh' });
  }, []);

  const handleReveal = useCallback((path: string) => {
    vscode.postMessage({ type: 'reveal', path });
  }, []);

  const handleOpenFile = useCallback((path: string) => {
    vscode.postMessage({ type: 'openFile', path });
  }, []);

  const handleTabChange = useCallback((tab: typeof activeTab) => {
    setActiveTab(tab);
    setSearchQuery(''); // 切换标签时清空搜索
  }, []);

  return (
    <div className="app">
      <Header 
        stats={stats} 
        isRefreshing={isRefreshing} 
        onRefresh={handleRefresh} 
      />
      
      <SearchBar 
        value={searchQuery} 
        onChange={setSearchQuery} 
      />
      
      <TabBar 
        stats={stats}
        activeTab={activeTab} 
        onTabChange={handleTabChange} 
      />

      <div className="panels">
        <div className={`panel ${activeTab === 'images' ? 'active' : ''}`}>
          <ImageSection 
            data={assetData?.images || []}
            searchQuery={searchQuery} 
            onReveal={handleReveal} 
            // onOpenFile={handleOpenFile}
          />
        </div>

        <div className={`panel ${activeTab === 'media' ? 'active' : ''}`}>
          <MediaSection 
            data={assetData?.media || []}
            searchQuery={searchQuery} 
            onReveal={handleReveal} 
            onOpenFile={handleOpenFile}
          />
        </div>

        <div className={`panel ${activeTab === 'fonts' ? 'active' : ''}`}>
          <FontSection 
            data={assetData?.fonts || []}
            searchQuery={searchQuery} 
            onReveal={handleReveal} 
            // onOpenFile={handleOpenFile}
          />
        </div>

        <div className={`panel ${activeTab === 'office' ? 'active' : ''}`}>
          <OfficeSection 
            data={assetData?.office || []}
            searchQuery={searchQuery} 
            onReveal={handleReveal} 
            onOpenFile={handleOpenFile}
          />
        </div>

        <div className={`panel ${activeTab === 'others' ? 'active' : ''}`}>
          <OtherSection 
            data={assetData?.others || []}
            searchQuery={searchQuery} 
            onReveal={handleReveal} 
            onOpenFile={handleOpenFile}
          />
        </div>
      </div>

      <PreviewOverlay />
    </div>
  );
}