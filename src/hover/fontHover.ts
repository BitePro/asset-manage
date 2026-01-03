import * as vscode from "vscode";
import * as path from "path";
import { promises as fs } from "fs";
import { createCanvas, GlobalFonts, SKRSContext2D } from "@napi-rs/canvas";
import { FontIndex } from "../services/fontIndex";
import { FontFaceEntry } from "../types";
import { log } from "../utils/logger";

/**
 * 从字体源路径加载字体文件
 * @param sources 字体源路径数组
 * @param declaredIn 字体定义所在的 CSS 文件 URI
 * @returns 包含字体文件路径和格式的对象，如果加载失败则返回 null
 */
async function loadFontFile(
  sources: string[],
  declaredIn: vscode.Uri
): Promise<{ filePath: string; format: string } | null> {
  for (const src of sources) {
    try {
      // 清理 URL 语法（移除 url(), format() 等）
      let cleanPath = src.replace(/url\(['"]?([^'"]+)['"]?\)/i, "$1");
      
      log(`处理字体源: ${src} -> 清理后: ${cleanPath}`);
      
      // 跳过外部 URL
      if (cleanPath.startsWith("http://") || cleanPath.startsWith("https://")) {
        log(`跳过外部 URL: ${cleanPath}`);
        continue;
      }

      // 解析相对路径（相对于 CSS 文件所在目录）
      const cssDir = path.dirname(declaredIn.fsPath);
      const absolutePath = path.resolve(cssDir, cleanPath);
      
      log(`尝试加载字体文件: ${absolutePath}`);

      // 检查文件是否存在
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) {
        log(`路径不是文件: ${absolutePath}`);
        continue;
      }

      // 根据文件扩展名确定字体格式
      const ext = path.extname(absolutePath).toLowerCase();
      let format = "truetype"; // 默认格式
      if (ext === ".woff") format = "woff";
      else if (ext === ".woff2") format = "woff2";
      else if (ext === ".otf") format = "opentype";
      else if (ext === ".ttf") format = "truetype";

      // node-canvas 的 registerFont 只支持 TTF 和 OTF 格式
      // 如果是 WOFF/WOFF2，跳过此文件继续尝试其他源
      if (ext === ".woff" || ext === ".woff2") {
        log(`字体格式 ${format} 不支持 Canvas 渲染，跳过: ${absolutePath}`);
        continue;
      }

      log(`字体文件找到: ${absolutePath}, 格式: ${format}`);
      return { filePath: absolutePath, format };
    } catch (err) {
      // 如果此源加载失败，尝试下一个
      log(`加载字体源失败: ${src}, 错误: ${err}`);
      continue;
    }
  }

  log(`所有字体源都加载失败`);
  return null;
}

/**
 * 使用 Canvas 生成字体预览图片的 Data URI
 * @param fontFamily 字体族名称
 * @param fallbackChain 回退字体链
 * @param previewText 预览文本
 * @param fontFilePath 字体文件的路径（可选，用于自定义字体）
 * @param isCustomFont 是否为自定义字体
 * @param characters 字体支持的字符集（用于自定义字体的第三行文本）
 */

function drawRoundedRect(ctx: SKRSContext2D, x: number, y: number, width: number, height: number, radius: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();
}
// 判断是否数字、字母、空格以及常见特殊字符
function isSpecialChar(code: number) {
  if (!code) return false; // 如果code不存在 则不认为是特殊字符
  // 排除数字
  if (code >= 48 && code <= 57) return true;
  // 排除大写字母
  if (code >= 65 && code <= 90) return true;
  // 排除小写字母
  if (code >= 97 && code <= 122) return true;
  // 空格
  if (code === 32) return true;
  // 排除常见特殊字符 (标点符号等)
  if ((code >= 33 && code <= 47) || (code >= 58 && code <= 64) ||
      (code >= 91 && code <= 96) || (code >= 123 && code <= 126)) return true;
  return false;
}
function getRandomChar(charArray: string[], numChars: number, isFilterSpecial: boolean = false) {
  const randomIndexs: number[] = [];
  const res: string[] = [];
  for (let i = 0; i < numChars; i++) {
    const randomIndex = Math.floor(Math.random() * charArray.length);
    randomIndexs.push(randomIndex);
  }
  // selectedChars = randomIndexs.map(index => charArray[index]);
  for (let i = 0; i < randomIndexs.length; i++) {
    const char = charArray[randomIndexs[i]];
    if (isFilterSpecial) {
      // 如果需要过滤掉特殊字符
      const code = char.charCodeAt(0)
      const isSpecial = isSpecialChar(code)
      if (!isSpecial) {
        res.push(char);
      }
    } else {
      // 不需要过滤掉特殊字符
      res.push(char);
    }
  }
  return res;
}
function generateFontPreviewCanvas(
  fontFamily: string,
  fallbackChain: string[],
  previewText: string,
  fontFilePath?: string,
  isCustomFont: boolean = false,
  characters?: string
): string {
  try {
    // 支持高DPI显示，设置更高的分辨率
    const devicePixelRatio = 3; // VS Code扩展中假设2倍像素密度
    const logicalWidth = 240;
    const logicalHeight = 60;
    const width = logicalWidth * devicePixelRatio;
    const height = logicalHeight * devicePixelRatio;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 设置Canvas缩放以支持高DPI
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // 绘制背景（使用更柔和的深色背景，适合VSCode暗色主题）
    // ctx.fillStyle = "#ffffff";
    // ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    drawRoundedRect(ctx, 0, 0, logicalWidth, logicalHeight, 10, "#ffffff");

    // 绘制边框（使用更柔和的边框颜色）
    ctx.strokeStyle = "#555555";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, logicalWidth - 1, logicalHeight - 1);

    // 如果是自定义字体，使用 GlobalFonts 注册
    let actualFontFamily = fontFamily;
    if (fontFilePath && isCustomFont) {
      try {
        GlobalFonts.registerFromPath(fontFilePath, fontFamily);
        actualFontFamily = fontFamily || "sans-serif";
        log(`字体注册成功: ${fontFamily}`);
      } catch (err) {
        log(`注册字体失败: ${fontFamily}, 错误: ${err}`);
        // 注册失败，使用默认字体
        actualFontFamily = "sans-serif";
      }
    } else {
      // 系统字体使用默认字体，因为 Canvas 可能无法访问所有系统字体
      log(`使用系统字体（可能回退到默认字体）: ${fontFamily}`);
      actualFontFamily = fontFamily || "sans-serif";
    }

    // 准备三行文本
    let line1 = "";
    let line2 = "";
    
    // 如果是自定义字体且有字符集，从中随机选择7个字符
    if (isCustomFont && characters && characters.length > 0) {
      const charArray = Array.from(characters);
      let selectedChars: string[] = [];
      
      // 随机选择7个字符
      const numChars = Math.min(10, charArray.length);
      const usedIndices = new Set<number>();

      if (charArray.length) {
        if (charArray.length < numChars) {
          // 如果字体文件内的字符特别少，则直接使用所有字符
          selectedChars = charArray;
        } else {
          const chars1 = getRandomChar(charArray, numChars, true);
          selectedChars = [...chars1];
          if (selectedChars.length < numChars / 2) {
            const chars2 = getRandomChar(charArray, numChars - selectedChars.length, false);
            selectedChars = [...selectedChars, ...chars2];
          }
        }
      } else {
        selectedChars = []
      }
      
      
      line1 = '0123456789 abcd ABCD';
      line2 = selectedChars.join('');
    } 
    else {
      line1 = '0123456789';
      line2 = 'abcd ABCD';
    }

    // 设置文本样式
    ctx.fillStyle = "#333333"; // 使用VSCode默认文本颜色
    ctx.textBaseline = "top";
    
    // 第一行：数字（稍小一点的字体）
    ctx.font = `18px "${actualFontFamily}"`;
    ctx.fillText(line1, 10, 10);
    
    // 第二行：字母（稍小一点的字体）
    ctx.font = `18px "${actualFontFamily}"`;
    ctx.fillText(line2, 10, 34);
    
    // // 第三行：中文或随机字符（稍大一点突出显示）
    // ctx.font = `20px "${actualFontFamily}"`;
    // ctx.fillStyle = "#569cd6"; // 使用VSCode的高亮蓝色
    // ctx.fillText(line3, 12, 75);

    // 转为 PNG 的 Base64
    const buffer = canvas.toBuffer("image/png");
    const base64 = buffer.toString("base64");
    const pngDataUri = `data:image/png;base64,${base64}`;
    log(`Canvas 预览生成成功: ${fontFamily}`);
    return pngDataUri;
  } catch (err) {
    log(`生成 Canvas 预览失败: ${fontFamily}, 错误: ${err}`);
    // 返回一个空白图片作为后备
    try {
      const devicePixelRatio = 2;
      const logicalWidth = 240;
      const logicalHeight = 60;
      const width = logicalWidth * devicePixelRatio;
      const height = logicalHeight * devicePixelRatio;

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      ctx.scale(devicePixelRatio, devicePixelRatio);

      ctx.fillStyle = "#eeeeee";
      ctx.fillRect(0, 0, logicalWidth, logicalHeight);
      
      ctx.strokeStyle = "#3c3c3c";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, logicalWidth - 1, logicalHeight - 1);
      
      ctx.fillStyle = "#555555";
      ctx.font = "14px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(`can't preview: ${fontFamily}`, 12, 60);
      const buffer = canvas.toBuffer("image/png");
      const base64 = buffer.toString("base64");
      return `data:image/png;base64,${base64}`;
    } catch (fallbackErr) {
      log(`生成后备预览也失败: ${fallbackErr}`);
      // 返回一个最小的空白 PNG
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    }
  }
}

const SELECTORS: vscode.DocumentSelector = [
  { scheme: "file", language: "css" },
  { scheme: "file", language: "scss" },
  { scheme: "file", language: "less" },
  { scheme: "file", language: "typescriptreact" },
  { scheme: "file", language: "javascriptreact" },
  { scheme: "file", language: "vue" },
  { scheme: "file", language: "svelte" },
  { scheme: "file", language: "html" },
];

export function registerFontHover(context: vscode.ExtensionContext, fontIndex: FontIndex) {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(SELECTORS, {
      async provideHover(document, position) {
        const line = document.lineAt(position.line).text;
        
        // 检查当前行是否是注释
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.startsWith('*')) {
          return; // 注释行不显示预览
        }
        
        // 检查光标位置是否在注释中（/* ... */ 或 // ...）
        const lineBeforeCursor = line.substring(0, position.character);
        const lineAfterCursor = line.substring(position.character);
        
        // 检查单行注释 //
        const singleLineCommentIndex = line.indexOf('//');
        if (singleLineCommentIndex !== -1 && position.character >= singleLineCommentIndex) {
          return; // 光标在单行注释中
        }
        
        // 检查块注释 /* */
        const blockCommentStart = lineBeforeCursor.lastIndexOf('/*');
        const blockCommentEnd = lineBeforeCursor.lastIndexOf('*/');
        if (blockCommentStart !== -1 && (blockCommentEnd === -1 || blockCommentStart > blockCommentEnd)) {
          // 光标在块注释开始之后且没有闭合
          return;
        }
        
        // 检查是否在 font-family 声明范围内（支持多行）
        const fontFamilyRange = getFontFamilyRange(document, position);
        if (!fontFamilyRange) return;

        const familyChain = parseFontFamiliesFromRange(document, fontFamilyRange);
        if (!familyChain.length) return;

        // 确定鼠标悬浮的具体字体名称
        const hoveredFont = getHoveredFont(document, position, familyChain, fontFamilyRange);
        if (!hoveredFont) return;

        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;

        const previewText = vscode.workspace.getConfiguration("assetLens").get<string>("fontPreviewText") ?? "字体预览文本";

        // md.appendMarkdown(`**font-family 链**: ${familyChain.join(" → ")}`);
        md.appendMarkdown("\n\n**字体预览**\n\n");

        // 只为鼠标悬浮的字体生成预览
        const custom = fontIndex.findByFamily(hoveredFont);

        // 构建字体回退链（当前字体之后的所有字体）
        const currentIndex = familyChain.indexOf(hoveredFont);
        const fallbackChain = currentIndex >= 0 ? familyChain.slice(currentIndex + 1) : [];

        // 判断是否为自定义字体：必须通过 @font-face 引入且字体文件真实存在
        let fontFilePath: string | undefined;
        let isCustomFont = false;
        let characters: string | undefined;
        if (custom.length > 0) {
          // 取第一个自定义字体定义
          const firstCustom = custom[0];
          characters = firstCustom.characters; // 获取字符集
          if (firstCustom.sources.length > 0) {
            try {
              log(`正在加载自定义字体: ${hoveredFont}, 源文件: ${firstCustom.sources.join(", ")}`);
              const loaded = await loadFontFile(firstCustom.sources, firstCustom.declaredIn);
              if (loaded) {
                fontFilePath = loaded.filePath;
                isCustomFont = true;
                log(`自定义字体加载成功: ${hoveredFont}, 路径: ${loaded.filePath}`);
              } else {
                log(`字体文件不存在: ${hoveredFont}, 所有源文件都无法加载，将作为系统字体处理`);
              }
            } catch (err) {
              log(`加载字体文件异常 ${hoveredFont}: ${err}, 将作为系统字体处理`);
            }
          } else {
            log(`自定义字体 ${hoveredFont} 没有源文件，将作为系统字体处理`);
          }
        }

        // 生成 Canvas 预览图片
        const pngDataUri = generateFontPreviewCanvas(hoveredFont, fallbackChain, previewText, fontFilePath, isCustomFont, characters);

        md.appendMarkdown(`**${hoveredFont}**\n`);
        md.appendMarkdown(`\n\n<img src="${pngDataUri}" width="280" height="70" />\n\n`);

        if (isCustomFont && custom.length) {
          custom.forEach((f: FontFaceEntry) => {
            // md.appendMarkdown(`定义: ${vscode.workspace.asRelativePath(f.declaredIn)}\n`);
            if (f.sources.length) {
              md.appendMarkdown(`\n字体文件地址: ${f.sources.slice(0, 3).join(", ")}\n`);
            }
          });
        }

        // 设置 hover 范围为悬浮的字体名称
        const range = getHoveredFontRange(document, position, hoveredFont, fontFamilyRange);
        return new vscode.Hover(md, range || fontFamilyRange);
      },
    }),
  );
}

function parseFontFamilies(line: string): string[] {
  const match = line.match(/font-family\s*:\s*([^;]+)/i);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

/**
 * 获取完整的 font-family 声明范围（支持多行）
 */
function getFontFamilyRange(document: vscode.TextDocument, position: vscode.Position): vscode.Range | null {
  // 先检查当前行是否包含 font-family
  const currentLine = document.lineAt(position.line).text;
  if (!/font-family\s*:/i.test(currentLine)) {
    return null;
  }

  // 查找 font-family 声明的开始位置
  let startLine = position.line;
  let startChar = currentLine.indexOf('font-family');

  // 如果当前行没有找到，向上查找
  while (startChar === -1 && startLine > 0) {
    startLine--;
    const lineText = document.lineAt(startLine).text;
    startChar = lineText.indexOf('font-family');
  }

  if (startChar === -1) return null;

  // 查找 font-family 声明的结束位置（分号）
  let endLine = startLine;
  let endChar = -1;
  const startLineText = document.lineAt(startLine).text;

  // 从 font-family 开始查找分号
  for (let i = startChar; i < startLineText.length; i++) {
    if (startLineText[i] === ';') {
      endChar = i;
      break;
    }
  }

  // 如果当前行没有分号，继续向下查找
  while (endChar === -1 && endLine < document.lineCount - 1) {
    endLine++;
    const lineText = document.lineAt(endLine).text;
    const semicolonIndex = lineText.indexOf(';');
    if (semicolonIndex !== -1) {
      endChar = semicolonIndex;
      break;
    }
  }

  if (endChar === -1) {
    // 如果没有找到分号，使用当前行的末尾
    endChar = document.lineAt(endLine).text.length;
  }

  return new vscode.Range(startLine, startChar, endLine, endChar + 1);
}

/**
 * 从范围中解析字体家族列表
 */
function parseFontFamiliesFromRange(document: vscode.TextDocument, range: vscode.Range): string[] {
  let text = '';
  for (let line = range.start.line; line <= range.end.line; line++) {
    const lineText = document.lineAt(line).text;
    if (line === range.start.line && line === range.end.line) {
      text = lineText.substring(range.start.character, range.end.character);
    } else if (line === range.start.line) {
      text = lineText.substring(range.start.character);
    } else if (line === range.end.line) {
      text += lineText.substring(0, range.end.character);
    } else {
      text += lineText;
    }
  }

  // 移除 font-family: 前缀
  const match = text.match(/font-family\s*:\s*(.+)/i);
  if (!match) return [];

  return match[1]
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

/**
 * 获取鼠标悬浮的字体名称
 */
function getHoveredFont(
  document: vscode.TextDocument,
  position: vscode.Position,
  familyChain: string[],
  fontFamilyRange: vscode.Range
): string | null {
  // 主要使用位置匹配方法，因为它更准确
  // 方法2：使用位置匹配
  // 获取完整的 font-family 文本
  let fontFamilyText = '';
  for (let line = fontFamilyRange.start.line; line <= fontFamilyRange.end.line; line++) {
    const lineText = document.lineAt(line).text;
    if (line === fontFamilyRange.start.line && line === fontFamilyRange.end.line) {
      fontFamilyText = lineText.substring(fontFamilyRange.start.character, fontFamilyRange.end.character);
    } else if (line === fontFamilyRange.start.line) {
      fontFamilyText = lineText.substring(fontFamilyRange.start.character);
    } else if (line === fontFamilyRange.end.line) {
      fontFamilyText += lineText.substring(0, fontFamilyRange.end.character);
    } else {
      fontFamilyText += lineText;
    }
  }

  // 移除 font-family: 前缀，获取字体列表部分
  const match = fontFamilyText.match(/font-family\s*:\s*(.+)/i);
  if (!match) return null;

  const fontListText = match[1];

  // 计算鼠标在 fontListText 中的相对位置
  const absolutePosition = document.offsetAt(position);
  const fontFamilyStartOffset = document.offsetAt(fontFamilyRange.start);
  const relativePosition = absolutePosition - fontFamilyStartOffset;

  // 找到 font-family: 后的实际字体列表开始位置
  const colonIndex = fontFamilyText.indexOf(':');
  if (colonIndex === -1) return null;

  let fontListStart = colonIndex + 1;
  while (fontListStart < fontFamilyText.length && /\s/.test(fontFamilyText[fontListStart])) {
    fontListStart++;
  }

  const adjustedPosition = relativePosition - fontListStart;

  if (adjustedPosition < 0 || adjustedPosition >= fontListText.length) return null;

  // 按逗号分割字体列表，保持原始格式（包含引号）
  const fontsWithQuotes = fontListText.split(',').map(s => s.trim());

  // 为每个字体找到其在文本中的位置
  let currentPos = 0;
  for (let i = 0; i < fontsWithQuotes.length; i++) {
    const fontWithQuotes = fontsWithQuotes[i];
    const fontStart = currentPos;
    const fontEnd = currentPos + fontWithQuotes.length;

    // 检查鼠标是否在这个字体范围内
    if (adjustedPosition >= fontStart && adjustedPosition <= fontEnd) {
      return familyChain[i] || null;
    }

    // 更新位置到下一个字体
    currentPos += fontWithQuotes.length;
    if (i < fontsWithQuotes.length - 1) {
      // 跳过逗号和后续空格
      while (currentPos < fontListText.length && fontListText[currentPos] !== ',') {
        currentPos++;
      }
      if (currentPos < fontListText.length) {
        currentPos++; // 跳过逗号
      }
      // 跳过空格
      while (currentPos < fontListText.length && /\s/.test(fontListText[currentPos])) {
        currentPos++;
      }
    }
  }

  return null;
}

/**
 * 获取悬浮字体名称的范围
 */
function getHoveredFontRange(
  document: vscode.TextDocument,
  position: vscode.Position,
  hoveredFont: string,
  fontFamilyRange: vscode.Range
): vscode.Range | null {
  const text = document.getText(fontFamilyRange);
  const fontIndex = text.toLowerCase().indexOf(hoveredFont.toLowerCase());

  if (fontIndex === -1) return null;

  // 计算全局位置
  const startPos = document.positionAt(document.offsetAt(fontFamilyRange.start) + fontIndex);
  const endPos = document.positionAt(document.offsetAt(fontFamilyRange.start) + fontIndex + hoveredFont.length);

  return new vscode.Range(startPos, endPos);
}