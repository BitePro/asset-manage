export const en = {
  // Header
  title: '📦 Static Assets',
  refresh: '🔄 Refresh',
  refreshing: '⏳ Refreshing',
  language: 'Language',

  // TabBar
  tabImages: 'Images',
  tabMedia: 'Media',
  tabFonts: 'Fonts',
  tabOffice: 'Office',
  tabOthers: 'Others',

  // SearchBar
  sortByName: 'Sort by name',
  sortBySizeAsc: 'Size: small → large',
  sortBySizeDesc: 'Size: large → small',
  sortLabel: 'Sort',
  searchPlaceholder: 'Search by filename or path...',
  clearSearch: 'Clear search',

  // ImageSection
  noImages: 'No images found',
  imageFormats: 'Supports PNG/JPG/WEBP/SVG/AVIF/BMP etc.',
  largeFileThreshold: 'Large file threshold:',
  bigFile: 'Big',
  duplicate: 'Duplicate',
  fileTooLarge: (val: number, unit: string) => `File too large (threshold: ${val}${unit})`,
  duplicateCount: (n: number) => `${n} duplicate(s) found`,
  viewDuplicates: 'View duplicates',
  imagesCount: (n: number) => `${n} item(s)`,
  background: 'Background:',
  close: 'Close',

  // MediaSection
  noMedia: 'No media found',
  mediaFormats: 'Supports MP3/WAV/FLAC/OGG/AAC, MP4/MOV/MKV/WEBM/AVI etc.',
  itemsCount: (n: number) => `${n} item(s)`,
  locateResource: 'Reveal in Explorer',

  // FontSection
  noFonts: 'No fonts detected',
  noFontsDesc: 'No font files in project',
  moreCharset: 'More characters',
  collapseCharset: 'Collapse',
  fontSize: 'Size',
  adjustFontSize: 'Adjust font preview size',
  locateFont: 'Reveal font file',
  fontUriNotFound: 'Font URI not found, cannot preview',

  // OfficeSection
  noOffice: 'No office documents',
  officeFormats: 'Supports Word, Excel, PowerPoint, PDF etc.',
  preview: 'Preview',
  wordDoc: 'Word Document',
  excelSheet: 'Excel Spreadsheet',
  ppt: 'PowerPoint Presentation',
  pdfDoc: 'PDF Document',
  document: 'Document',

  // OtherSection
  noOthers: 'No other assets',
  othersFormats: 'Supports txt/json/yaml/psd/ai/zip etc.',

  // Duplicate modal
  duplicateImages: 'Duplicate images',
  currentImage: 'Current image',
  duplicateList: (n: number) => `Duplicates (${n})`,
  locate: 'Reveal',

  // DocumentPreview
  prevPage: 'Previous',
  nextPage: 'Next',
  loadingDoc: 'Loading document...',
  openInDefaultApp: 'Open in default app',
  pdfPage: (page: number, _total?: number) => `PDF page ${page}`,
  pages: (n: number) => `${n} pages`,
  unsupportedFormat: (fmt: string) => `Preview not supported for ${fmt}`,
  loadFailed: (msg: string) => `Failed to load: ${msg}`,
  unknownError: 'Unknown error',
  renderFailed: (msg: string) => `Failed to render PDF: ${msg}`,
  pdfLibNotLoaded: 'PDF.js not loaded, please refresh',
  docxContainerNotReady: 'DOCX preview container not ready',
  previewContainerNotReady: 'Preview container not ready',
  noRenderContext: 'Cannot create render context',
} as const;
