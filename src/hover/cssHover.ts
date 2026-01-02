import * as vscode from "vscode";

const SELECTORS: vscode.DocumentSelector = [
  { scheme: "file", language: "css" },
  { scheme: "file", language: "scss" },
  { scheme: "file", language: "less" },
  { scheme: "file", language: "html" },
  { scheme: "file", language: "vue" },
  { scheme: "file", language: "svelte" },
];

interface CssInfo {
  property: string;
  value?: string;
}

interface BrowserSupportInfo {
  name: string;
  icon: string;
  version: string;
  isSupported: boolean;
}


export function registerCssHover(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(SELECTORS, {
      provideHover(document: vscode.TextDocument, position: vscode.Position) {
        const cssInfo = getCssPropertyOrValueAtPosition(document, position);
        if (!cssInfo) return;

        const compatibilityMarkdown = getCompatibilityInfo(cssInfo.property, cssInfo.value);
        if (!compatibilityMarkdown) return;

        const range = document.getWordRangeAtPosition(position, /[a-zA-Z-]+/);
        const md = new vscode.MarkdownString();
        md.supportHtml = true;
        md.isTrusted = true;
        md.appendMarkdown(compatibilityMarkdown);

        return new vscode.Hover(md, range);
      },
    })
  );
}

function getCssPropertyOrValueAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): CssInfo | undefined {
  const lineText = document.lineAt(position.line).text;
  const charIndex = position.character;

  // 检查光标位置的字符，如果是数字，直接返回
  const currentChar = lineText.charAt(charIndex);
  if (currentChar && /[0-9]/.test(currentChar)) {
    return undefined;
  }

  // 获取当前单词
  const wordRange = document.getWordRangeAtPosition(
    position,
    /[a-zA-Z][a-zA-Z0-9-]*/
  );
  if (!wordRange) {
    return undefined;
  }

  const word = document.getText(wordRange);
  
  // 确保单词以字母开头（额外的安全检查）
  if (!/^[a-zA-Z]/.test(word)) {
    return undefined;
  }

  // 检查这个单词是否可能是CSS属性（后面跟着冒号）
  const afterWord = lineText.substring(wordRange.end.character);

  if (afterWord.trim().startsWith(":")) {
    return { property: word };
  }

  // 检查光标前面的内容是否以属性名+冒号结束
  const beforeCursor = lineText.substring(0, charIndex);
  const colonIndex = beforeCursor.lastIndexOf(":");
  if (colonIndex !== -1) {
    const beforeColon = beforeCursor.substring(0, colonIndex);
    const propertyMatch = beforeColon.match(/([a-zA-Z][a-zA-Z0-9-]*)\s*$/);
    if (propertyMatch && propertyMatch[1] === word) {
      return { property: word };
    }

    // 检查是否在属性值上
    if (propertyMatch && propertyMatch[1] !== word) {
      const propertyName = propertyMatch[1];
      // 检查当前单词是否在冒号之后（可能是属性值）
      if (wordRange.start.character > colonIndex) {
        return { property: propertyName, value: word };
      }
    }
  }

  return undefined;
}

function getCompatibilityInfo(property: string, value?: string): string | undefined {
  try {
    const bcd = require("@mdn/browser-compat-data");
    const propertyCompat = findCompatData(bcd, property);
    if (!propertyCompat) return getFallbackMessage(property);

    // 如果提供了值，检查MDN数据库中是否存在该值的独立兼容性数据
    if (value) {
      const valueCompat = findValueCompatData(bcd, property, value);
      if (valueCompat) {
        return formatCompatibilityInfo(valueCompat, `${property}: ${value}`);
      }
    }

    // 否则直接返回属性的兼容性
    return formatCompatibilityInfo(propertyCompat, property);
  } catch (error) {
    return "无法加载兼容性数据";
  }
}

// 在 MDN 数据中查找 CSS 属性的兼容性数据
function findCompatData(bcd: any, property: string): any {
  if (!bcd.css || !bcd.css.properties) {
    return null;
  }

  // 查找属性
  const propertyData = bcd.css.properties[property];
  if (!propertyData) {
    return null;
  }

  return propertyData;
}

// 在 MDN 数据中查找 CSS 属性值的兼容性数据
// 只有当该值在MDN数据库中有独立的兼容性数据时才返回，否则返回null
function findValueCompatData(bcd: any, property: string, value: string): any {
  if (!bcd.css || !bcd.css.properties) {
    return null;
  }

  const propertyData = bcd.css.properties[property];
  if (!propertyData) {
    return null;
  }

  // 检查该值是否存在且有自己的兼容性数据
  if (propertyData[value] && propertyData[value].__compat) {
    return propertyData[value];
  }

  return null;
}

// 解析浏览器支持信息
function parseBrowserSupport(
  browserKey: string,
  browserSupport: any
): BrowserSupportInfo {
  const browserInfo: { [key: string]: { name: string; icon: string } } = {
    chrome: { name: "Chrome", icon: "🌐" },
    edge: { name: "Edge", icon: "🌍" },
    firefox: { name: "Firefox", icon: "🦊" },
    ie: { name: "IE", icon: "💻" },
    opera: { name: "Opera", icon: "🎭" },
    safari: { name: "Safari", icon: "🧭" },
    chrome_android: { name: "Chrome_Android", icon: "📱" },
    firefox_android: { name: "Firefox_Android", icon: "🦊" },
    opera_android: { name: "Opera_Android", icon: "🎭" },
    safari_ios: { name: "Safari_iOS", icon: "🧭" },
    samsunginternet_android: { name: "Samsung_Internet", icon: "📱" },
    webview_android: { name: "WebView_Android", icon: "📱" },
    webview_ios: { name: "WebView_iOS", icon: "📱" },
  };

  const browser =
    browserInfo[browserKey] || {
      name: browserKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      icon: "🌐",
    };

  if (!browserSupport) {
    return {
      name: browser.name,
      icon: browser.icon,
      version: "未知",
      isSupported: false,
    };
  }

  // 处理可能是数组的情况
  const supportList = Array.isArray(browserSupport)
    ? browserSupport
    : [browserSupport];

  // 查找最早的完全支持版本（无前缀、无flags、无部分实现、无已废弃的）
  let earliestVersion: string | null = null;

  for (const info of supportList) {
    // 跳过已废弃的特性
    if (info.version_removed !== undefined && info.version_removed !== null) {
      continue;
    }

    // 跳过实验性支持
    if (info.flags && info.flags.length > 0) {
      continue;
    }

    // 跳过部分实现
    if (info.partial_implementation) {
      continue;
    }

    // 跳过前缀支持
    if (info.prefix) {
      continue;
    }

    // 跳过替代名称
    if (info.alternative_name) {
      continue;
    }

    // 找到完全支持的版本
    if (info.version_added && info.version_added !== false && info.version_added !== null) {
      const version = info.version_added === true ? "1" : String(info.version_added);
      if (!earliestVersion || parseFloat(version) < parseFloat(earliestVersion)) {
        earliestVersion = version;
      }
    }
  }

  // 格式化版本号
  const formatVersion = (version: string): string => {
    if (version === "true") return "1";
    return version;
  };

  if (earliestVersion) {
    return {
      name: browser.name,
      icon: browser.icon,
      version: formatVersion(earliestVersion),
      isSupported: true,
    };
  }

  return {
    name: browser.name,
    icon: browser.icon,
    version: "不支持",
    isSupported: false,
  };
}

// 格式化兼容性信息为 Markdown
function formatCompatibilityInfo(compatData: any, displayName: string): string {
  const compat = compatData.__compat;
  if (!compat || !compat.support) {
    return `**${displayName}**\n\n暂无兼容性数据`;
  }

  const support = compat.support;
  const desktopBrowsers = ["chrome", "firefox", "safari", "edge", "opera", "ie"];
  const mobileBrowsers = ["chrome_android", "firefox_android", "opera_android", "safari_ios", "samsunginternet_android", "webview_android", "webview_ios"];

  const desktopData = desktopBrowsers
    .map((key) => parseBrowserSupport(key, support[key]))
    .filter((data) => data.isSupported);

  const mobileData = mobileBrowsers
    .map((key) => parseBrowserSupport(key, support[key]))
    .filter((data) => data.isSupported);

  if (desktopData.length === 0 && mobileData.length === 0) {
    return `**${displayName}**\n\n暂无浏览器支持数据`;
  }

  let result = `## ${displayName}-浏览器兼容性\n\n`;

  if (compat.description) {
    result += `> ${compat.description}\n\n`;
  }

  if (desktopData.length > 0) {
    result += `#### 🖥️ 桌面浏览器\n\n`;
    for (let i = 0; i < desktopData.length; i++) {
      const data = desktopData[i];
      result += `${data.icon} ${data.name}: **${data.version}+** &nbsp;&nbsp;|&nbsp;&nbsp;`;
      if ((i + 1) % 3 === 0 && i !== desktopData.length - 1) {
        result += "\n\n";
      }
    }
    result += "\n\n";
  }

  if (mobileData.length > 0) {
    result += `#### 📱 移动浏览器\n\n`;
    for (let i = 0; i < mobileData.length; i++) {
      const data = mobileData[i];
      result += `${data.icon} ${data.name}: **${data.version}+** &nbsp;&nbsp;|&nbsp;&nbsp;`;
      if ((i + 1) % 3 === 0 && i !== mobileData.length - 1) {
        result += "\n\n";
      }
    }
    result += "\n\n";
  }

  

  const mdnUrl = compat.mdn_url || `https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(displayName)}`;
  result += `📚 [MDN 文档](${mdnUrl})`;
  // css规范链接
  const specUrl = compat.spec_url;
  if (specUrl) {
    result += ` | [CSSWG规范](${specUrl})\n\n`;
  }

  result += "---\n\n";

  return result;
}

// 当找不到兼容性数据时的后备消息
function getFallbackMessage(property: string): string {
  const basicProperties = ["margin", "padding", "border", "background", "color", "font-size", "width", "height"];

  if (basicProperties.includes(property)) {
    return `### ${property}\n\n✅ **基础 CSS 属性**\n\n该属性在所有现代浏览器中都支持。\n\n📚 [MDN 文档](https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(property)})`;
  }

  return `### ${property}\n\n❓ **暂无兼容性数据**\n\n📚 [搜索 MDN 文档](https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(property)})`;
}