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
        
        if (!/font-family/i.test(line)) return;

        const familyChain = parseFontFamilies(line);
        if (!familyChain.length) return;

        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;

        const previewText = vscode.workspace.getConfiguration("assetLens").get<string>("fontPreviewText") ?? "字体预览文本";

        // md.appendMarkdown(`**font-family 链**: ${familyChain.join(" → ")}`);
        md.appendMarkdown("\n\n**字体预览**\n\n");

        // 为每个字体生成预览图片
        for (const [index, fam] of familyChain.entries()) {
          
          const custom = fontIndex.findByFamily(fam);
          
          // 构建字体回退链（当前字体之后的所有字体）
          const fallbackChain = familyChain.slice(index + 1);

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
                log(`正在加载自定义字体: ${fam}, 源文件: ${firstCustom.sources.join(", ")}`);
                const loaded = await loadFontFile(firstCustom.sources, firstCustom.declaredIn);
                if (loaded) {
                  fontFilePath = loaded.filePath;
                  isCustomFont = true;
                  log(`自定义字体加载成功: ${fam}, 路径: ${loaded.filePath}`);
                } else {
                  log(`字体文件不存在: ${fam}, 所有源文件都无法加载，将作为系统字体处理`);
                }
              } catch (err) {
                log(`加载字体文件异常 ${fam}: ${err}, 将作为系统字体处理`);
              }
            } else {
              log(`自定义字体 ${fam} 没有源文件，将作为系统字体处理`);
            }
          }

          // 生成 Canvas 预览图片
          const pngDataUri = generateFontPreviewCanvas(fam, fallbackChain, previewText, fontFilePath, isCustomFont, characters);
          
          md.appendMarkdown(`**${fam}：**\n`);
          // md.appendMarkdown(`![${fam} 预览](${pngDataUri})\n`);
          md.appendMarkdown(`\n\n< img src="${pngDataUri}" width=280 height=70 />\n`);

          if (isCustomFont && custom.length) {
            custom.forEach((f) => {
              // md.appendMarkdown(`定义: ${vscode.workspace.asRelativePath(f.declaredIn)}\n`);
              if (f.sources.length) {
                md.appendMarkdown(`\n字体文件地址: ${f.sources.slice(0, 3).join(", ")}\n`);
              }
            });
          }
          md.appendMarkdown("\n");
          md.appendMarkdown("---"); // 添加横线
          md.appendMarkdown("\n");
          md.appendMarkdown("---"); // 添加横线
          md.appendMarkdown("\n");
        }

        // md.appendMarkdown("\n**最终生效**: 取链中第一个可用字体；若自定义未加载成功则回退到下一项。");
        const range = document.getWordRangeAtPosition(position, /font-family[^;]*/i);
        return new vscode.Hover(md, range);
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