export const zh = {
  // Header
  title: '📦 静态资源',
  refresh: '🔄 刷新',
  refreshing: '⏳ 刷新中',
  language: '语言',

  // TabBar
  tabImages: '图片',
  tabMedia: '音视频',
  tabFonts: '字体',
  tabOffice: '办公',
  tabOthers: '其他',

  // SearchBar
  sortByName: '按名字排序',
  sortBySizeAsc: '体积 小-大',
  sortBySizeDesc: '体积 大-小',
  sortLabel: '排序方式',
  searchPlaceholder: '搜索文件路径或文件名...',
  clearSearch: '清除搜索',

  // Drag (shared)
  dragToInsert: '拖拽到编辑器可插入相对路径',

  // ImageSection
  noImages: '暂无图片资源',
  imageFormats: '支持 PNG/JPG/WEBP/SVG/AVIF/BMP 等格式',
  largeFileThreshold: '大文件阈值:',
  bigFile: 'Big',
  duplicate: '重复',
  fileTooLarge: (val: number, unit: string) => `文件过大 (阈值: ${val}${unit})`,
  duplicateCount: (n: number) => `发现 ${n} 个重复项`,
  viewDuplicates: '查看重复',
  imagesCount: (n: number) => `${n} 张`,
  background: '背景：',
  backgroundBrightness: '背景亮度：',
  close: '关闭',

  // MediaSection
  noMedia: '暂无音视频',
  mediaFormats: '支持 MP3/WAV/FLAC/OGG/AAC、MP4/MOV/MKV/WEBM/AVI 等格式',
  itemsCount: (n: number) => `${n} 个`,
  locateResource: '资源定位',

  // FontSection
  noFonts: '未检测到字体文件',
  noFontsDesc: '项目中暂无字体文件',
  moreCharset: '更多字符集',
  collapseCharset: '收起字符集',
  fontSize: '字号',
  adjustFontSize: '调整字体预览字号',
  locateFont: '定位字体文件',
  fontUriNotFound: '字体文件 URI 未找到，无法预览',

  // OfficeSection
  noOffice: '暂无办公文档',
  officeFormats: '支持 Word、Excel、PowerPoint、PDF 等格式',
  preview: '预览',
  wordDoc: 'Word 文档',
  excelSheet: 'Excel 表格',
  ppt: 'PowerPoint 演示文稿',
  pdfDoc: 'PDF 文档',
  document: '文档',

  // OtherSection
  noOthers: '暂无其他静态资源',
  othersFormats: '支持 txt/json/yaml/psd/ai/zip 等常见格式',

  // Duplicate modal
  duplicateImages: '内容重复的图片',
  currentImage: '当前图片',
  duplicateList: (n: number) => `重复的图片 (${n})`,
  locate: '定位',

  // DocumentPreview
  prevPage: '上一页',
  nextPage: '下一页',
  loadingDoc: '正在加载文档...',
  openInDefaultApp: '在系统默认应用中打开',
  pdfPage: (page: number, _total?: number) => `PDF 第 ${page} 页`,
  pages: (n: number) => `${n} 页`,
  unsupportedFormat: (fmt: string) => `暂不支持预览 ${fmt} 格式`,
  loadFailed: (msg: string) => `加载文档失败: ${msg}`,
  unknownError: '未知错误',
  renderFailed: (msg: string) => `渲染 PDF 页面失败: ${msg}`,
  pdfLibNotLoaded: 'PDF.js 库未加载，请刷新页面重试',
  docxContainerNotReady: 'DOCX 预览容器未就绪',
  previewContainerNotReady: '预览容器未就绪',
  noRenderContext: '无法创建渲染上下文',
} as const;
