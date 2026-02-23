import { useEffect, useState, useCallback, useMemo } from "react";
import { VsCodeApi, MessageFromExtension, Stats } from "./types";
import { useI18n } from "./contexts/I18nContext";
import Header from "./components/Header";
import SearchBar from "./components/SearchBar";
import TabBar from "./components/TabBar";
import ImageSection from "./components/ImageSection";
import MediaSection from "./components/MediaSection";
import FontSection from "./components/FontSection";
import OfficeSection from "./components/OfficeSection";
import OtherSection from "./components/OtherSection";
import PreviewOverlay from "./components/PreviewOverlay";

// 获取 VSCode API
const vscode: VsCodeApi = window.acquireVsCodeApi();

export default function App() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<
    "images" | "media" | "fonts" | "office" | "others"
  >("images");
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [assetData, setAssetData] = useState<any>(null);
  const [stats, setStats] = useState<Stats>({
    images: 0,
    media: 0,
    fonts: 0,
    office: 0,
    others: 0,
    folders: 0,
    total: 0,
  });

  const [sortBy, setSortBy] = useState<"name" | "size-asc" | "size-desc">(
    "name",
  );
  const [duplicateHashes, setDuplicateHashes] = useState<
    Record<string, number>
  >({});
  const [thresholdValue, setThresholdValue] = useState<number>(100);
  const [thresholdUnit, setThresholdUnit] = useState<"B" | "KB" | "MB">("KB");
  const [duplicateModalGroup, setDuplicateModalGroup] = useState<{
    file: any;
    hash: string;
  } | null>(null);

  const largeFileThreshold = useMemo(() => {
    const multipliers = { B: 1, KB: 1024, MB: 1024 * 1024 };
    return thresholdValue * multipliers[thresholdUnit];
  }, [thresholdValue, thresholdUnit]);

  // 组件加载时请求数据
  useEffect(() => {
    // 延迟请求数据，确保 VSCode API 已准备好
    const timer = setTimeout(() => {
      vscode.postMessage({ type: "getData" });
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // 处理来自扩展的消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent<MessageFromExtension | any>) => {
      const message = event.data;

      if (message.type === "refreshDone") {
        setIsRefreshing(false);
      } else if (message.type === "previewFont") {
        setActiveTab("fonts");
        setTimeout(() => {
          setSearchQuery(message.fileName);
        }, 100);
      } else if (message.type === "assetData") {
        // 接收资源数据
        const data = message.data;
        setAssetData(data);

        // 计算重复哈希
        const hashes: Record<string, number> = {};
        data.images?.forEach((group: any) => {
          group.files.forEach((file: any) => {
            if (file.hash) {
              hashes[file.hash] = (hashes[file.hash] || 0) + 1;
            }
          });
        });
        setDuplicateHashes(hashes);

        // 更新统计信息
        const imageCount =
          data.images?.reduce(
            (sum: number, group: any) => sum + group.files.length,
            0,
          ) || 0;
        const mediaCount =
          data.media?.reduce(
            (sum: number, group: any) => sum + group.files.length,
            0,
          ) || 0;
        const fontCount =
          data.fonts?.reduce(
            (sum: number, group: any) => sum + group.files.length,
            0,
          ) || 0;
        const officeCount =
          data.office?.reduce(
            (sum: number, group: any) => sum + group.files.length,
            0,
          ) || 0;
        const othersCount =
          data.others?.reduce(
            (sum: number, group: any) => sum + group.files.length,
            0,
          ) || 0;
        const folderCount = data.images?.length || 0;

        setStats({
          images: imageCount,
          media: mediaCount,
          fonts: fontCount,
          office: officeCount,
          others: othersCount,
          folders: folderCount,
          total:
            imageCount + mediaCount + fontCount + officeCount + othersCount,
        });
      } else if (message.type === "fontData") {
        // 接收字体数据
        setAssetData({ fonts: message.data });
        setStats((prev) => ({ ...prev, fonts: message.data?.length || 0 }));
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    vscode.postMessage({ type: "refresh" });
  }, []);

  const handleReveal = useCallback((path: string) => {
    vscode.postMessage({ type: "reveal", path });
  }, []);

  const handleOpenFile = useCallback((path: string) => {
    vscode.postMessage({ type: "openFile", path });
  }, []);

  const handleTabChange = useCallback((tab: typeof activeTab) => {
    setActiveTab(tab);
    setSearchQuery(""); // 切换标签时清空搜索
  }, []);

  const handleDuplicateClick = (file: any) => {
    setDuplicateModalGroup({ file, hash: file.hash });
  };

  // 根据哈希获取其他重复文件，并按文件夹分组
  const getDuplicateGroups = (hash: string, sourcePath: string) => {
    if (!assetData?.images || !hash) return [];

    const otherFiles: any[] = [];
    assetData.images.forEach((group: any) => {
      group.files.forEach((file: any) => {
        if (file.hash === hash && file.path !== sourcePath) {
          // 这里的 file 对象本身不带 folder 字段，需要从 group 中获取
          otherFiles.push({ ...file, folderName: group.folder });
        }
      });
    });

    // 按文件夹分组
    const groups: Record<string, any[]> = {};
    otherFiles.forEach((file) => {
      const folder = file.folderName || "unknown";
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(file);
    });

    return Object.entries(groups).map(([folder, files]) => ({ folder, files }));
  };

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
        sortBy={sortBy as any}
        onSortChange={setSortBy as any}
      />

      <TabBar
        stats={stats}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      <div className="panels">
        <div className={`panel ${activeTab === "images" ? "active" : ""}`}>
          <ImageSection
            data={assetData?.images || []}
            searchQuery={searchQuery}
            sortBy={sortBy as any}
            duplicateHashes={duplicateHashes}
            largeFileThreshold={largeFileThreshold}
            thresholdValue={thresholdValue}
            thresholdUnit={thresholdUnit}
            onThresholdValueChange={setThresholdValue}
            onThresholdUnitChange={setThresholdUnit as any}
            onReveal={handleReveal}
            onDuplicateClick={handleDuplicateClick}
          />
        </div>

        <div className={`panel ${activeTab === "media" ? "active" : ""}`}>
          <MediaSection
            data={assetData?.media || []}
            searchQuery={searchQuery}
            onReveal={handleReveal}
            onOpenFile={handleOpenFile}
          />
        </div>

        <div className={`panel ${activeTab === "fonts" ? "active" : ""}`}>
          <FontSection
            data={assetData?.fonts || []}
            searchQuery={searchQuery}
            onReveal={handleReveal}
            // onOpenFile={handleOpenFile}
          />
        </div>

        <div className={`panel ${activeTab === "office" ? "active" : ""}`}>
          <OfficeSection
            data={assetData?.office || []}
            searchQuery={searchQuery}
            onReveal={handleReveal}
            onOpenFile={handleOpenFile}
          />
        </div>

        <div className={`panel ${activeTab === "others" ? "active" : ""}`}>
          <OtherSection
            data={assetData?.others || []}
            searchQuery={searchQuery}
            onReveal={handleReveal}
            onOpenFile={handleOpenFile}
          />
        </div>
      </div>

      {/* 重复文件弹窗 */}
      {duplicateModalGroup && (
        <div
          className="modal-overlay"
          onClick={() => setDuplicateModalGroup(null)}
        >
          <div
            className="modal-content wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{t('duplicateImages')}</h3>
              <button
                className="close-btn"
                onClick={() => setDuplicateModalGroup(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body structured">
              {/* 当前图片部分 */}
              <div className="modal-section current">
                <div className="section-header">{t('currentImage')}</div>
                <div className="current-image-card mini">
                  <div className="current-preview small">
                    <img
                      src={duplicateModalGroup.file.uri}
                      alt={duplicateModalGroup.file.name}
                    />
                  </div>
                  <div className="current-info">
                    <div className="dup-name">
                      {duplicateModalGroup.file.name}
                    </div>
                    <div className="dup-path">
                      {duplicateModalGroup.file.relativePath}
                    </div>
                    <div className="dup-meta">
                      {duplicateModalGroup.file.size} ·{" "}
                      {duplicateModalGroup.file.ext}
                    </div>
                  </div>
                </div>
              </div>

              {/* 重复列表部分 */}
                <div className="modal-section duplicates">
                <div className="section-header">
                  {t('duplicateList', duplicateHashes[duplicateModalGroup.hash] - 1)}
                </div>
                <div className="duplicate-groups">
                  {getDuplicateGroups(
                    duplicateModalGroup.hash,
                    duplicateModalGroup.file.path,
                  ).map((group) => (
                    <div key={group.folder} className="modal-folder-group">
                      <div className="modal-folder-title">
                        📁 {group.folder}
                      </div>
                      <div className="duplicate-list">
                        {group.files.map((file: any) => (
                          <div
                            key={file.path}
                            className="duplicate-item small with-preview"
                          >
                            <div className="dup-mini-preview">
                              <img src={file.uri} alt={file.name} />
                            </div>
                            <div className="dup-info">
                              <div className="dup-name" title={file.name}>
                                {file.name}
                              </div>
                              <div className="dup-meta-inline">
                                {file.size} · {file.relativePath}
                              </div>
                            </div>
                            <button
                              className="btn secondary tiny"
                              onClick={() => handleReveal(file.path)}
                            >
                              {t('locate')}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <PreviewOverlay />
    </div>
  );
}