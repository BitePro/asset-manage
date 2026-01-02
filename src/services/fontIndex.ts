import * as vscode from "vscode";
import fg from "fast-glob";
import * as path from "path";
import postcss from "postcss";
import safeParser from "postcss-safe-parser";
import { promises as fs } from "fs";
import * as fontkit from "fontkit";
import { FontFaceEntry } from "../types";
import { log } from "../utils/logger";

const STYLE_GLOBS = ["**/*.css", "**/*.scss", "**/*.less", "**/*.sass"];
const COMPONENT_GLOBS = ["**/*.vue", "**/*.jsx", "**/*.tsx", "**/*.html", "**/*.svelte", "**/*.astro"];

/**
 * 从字体文件中提取支持的字符集
 * @param fontPath 字体文件路径（支持的格式数组）
 * @param basePath CSS文件所在目录
 * @returns 字体支持的字符串（用于预览）
 */
async function extractFontCharacters(fontPaths: string[], basePath: string): Promise<string | undefined> {
  for (const fontPath of fontPaths) {
    try {
      // 清理路径
      let cleanPath = fontPath.replace(/url\(['"]?([^'"]+)['"]?\)/i, "$1");
      
      // 跳过外部URL
      if (cleanPath.startsWith("http://") || cleanPath.startsWith("https://")) {
        continue;
      }
      
      // 跳过不支持的格式
      const ext = path.extname(cleanPath).toLowerCase();
      if (ext === ".woff" || ext === ".woff2") {
        continue;
      }
      
      // 解析绝对路径
      const absolutePath = path.resolve(basePath, cleanPath);
      
      // 检查文件是否存在
      try {
        await fs.access(absolutePath);
      } catch {
        continue;
      }
      
      // 使用fontkit读取字体
      const font = fontkit.openSync(absolutePath);
      
      // 提取字符集（排除数字、字母和特殊符号）
      const characters = new Set<string>();
      const cmap = (font as any).characterSet;
      
      if (cmap && cmap.length > 0) {
        for (const code of cmap) {
          const char = String.fromCharCode(code);
          
          // 只保留中文、日文、韩文等非ASCII字符
          // 排除数字(0-9)、字母(A-Z, a-z)、常见标点和符号
          if (
            code > 0x7F && // 非ASCII
            !(code >= 0x30 && code <= 0x39) && // 排除数字
            !(code >= 0x41 && code <= 0x5A) && // 排除大写字母
            !(code >= 0x61 && code <= 0x7A) && // 排除小写字母
            !(code >= 0x20 && code <= 0x2F) && // 排除标点
            !(code >= 0x3A && code <= 0x40) && // 排除标点
            !(code >= 0x5B && code <= 0x60) && // 排除标点
            !(code >= 0x7B && code <= 0x7E)    // 排除标点
          ) {
            characters.add(char);
          }
          
          // 限制数量，避免占用过多内存
          if (characters.size >= 1000) {
            break;
          }
        }
      }
      
      if (characters.size > 0) {
        return Array.from(characters).join('');
      }
    } catch (err) {
      log(`提取字体字符集失败 ${fontPath}: ${err}`);
      continue;
    }
  }
  
  return undefined;
}

export class FontIndex {
  private fonts: FontFaceEntry[] = [];
  private _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChange = this._onDidChange.event;

  async scan(workspace: vscode.WorkspaceFolder, include: string[], exclude: string[]) {
    const cwd = workspace.uri.fsPath;
    const patterns =
      include.length && !(include.length === 1 && include[0] === "**/*")
        ? include.map((p) => (p.includes("*") ? p : `${p}/**/*.{css,scss,less,sass,vue,jsx,tsx,html,svelte,astro}`))
        : [...STYLE_GLOBS, ...COMPONENT_GLOBS];

    const files = await fg(patterns, {
      cwd,
      ignore: exclude,
      absolute: true,
      suppressErrors: true,
      onlyFiles: true,
    });

    const entries: FontFaceEntry[] = [];
    for (const file of files) {
      try {
        const content = await fs.readFile(file, "utf8");
        const cssContents = this.extractCSSFromFile(file, content);

        for (const cssContent of cssContents) {
          const root = postcss().process(cssContent.content, { from: file, parser: safeParser }).root;
          root.walkAtRules("font-face", (rule) => {
          const familyDecl = rule.nodes?.find((n) => n.type === "decl" && n.prop === "font-family");
          if (!familyDecl || familyDecl.type !== "decl") return;
          const srcDecl = rule.nodes?.find((n) => n.type === "decl" && n.prop === "src");
          const sources: string[] = [];
          if (srcDecl && srcDecl.type === "decl") {
            const matches = srcDecl.value.match(/url\(([^)]+)\)/g);
            matches?.forEach((m) => {
              const url = m.replace(/url\((['"]?)([^)'"]+)\1\)/, "$2");
              sources.push(url);
            });
          }
          const family = familyDecl.value.replace(/['"]/g, "").trim();
          const declaredIn = vscode.Uri.file(file);
          const absoluteOffset = cssContent.offset + (familyDecl.source?.start?.offset ?? 0);
          const index = content.substring(0, absoluteOffset).split(/\r?\n/).length - 1;
          const range = new vscode.Range(new vscode.Position(index, 0), new vscode.Position(index, 1000));

          // 收集其他字体样式属性
          const weightDecl = rule.nodes?.find((n) => n.type === "decl" && n.prop === "font-weight");
          const styleDecl = rule.nodes?.find((n) => n.type === "decl" && n.prop === "font-style");
          const stretchDecl = rule.nodes?.find((n) => n.type === "decl" && n.prop === "font-stretch");
          const displayDecl = rule.nodes?.find((n) => n.type === "decl" && n.prop === "font-display");
          const unicodeRangeDecl = rule.nodes?.find((n) => n.type === "decl" && n.prop === "unicode-range");

          entries.push({
            family,
            sources,
            declaredIn,
            range,
            weight: weightDecl && weightDecl.type === "decl" ? weightDecl.value : undefined,
            style: styleDecl && styleDecl.type === "decl" ? styleDecl.value : undefined,
            stretch: stretchDecl && stretchDecl.type === "decl" ? stretchDecl.value : undefined,
            display: displayDecl && displayDecl.type === "decl" ? displayDecl.value : undefined,
            unicodeRange: unicodeRangeDecl && unicodeRangeDecl.type === "decl" ? unicodeRangeDecl.value : undefined,
          });
        });
        }
      } catch (err) {
        log(`解析字体失败 ${file}: ${err}`);
      }
    }
    
    // 异步提取字体字符集
    for (const entry of entries) {
      if (entry.sources.length > 0) {
        try {
          const cssDir = path.dirname(entry.declaredIn.fsPath);
          entry.characters = await extractFontCharacters(entry.sources, cssDir);
        } catch (err) {
          log(`提取字体字符集失败 ${entry.family}: ${err}`);
        }
      }
    }
    this.fonts = entries;
    log(`FontIndex 扫描完成，共 ${this.fonts.length} 个字体`);
    
    // 触发变更事件，通知视图刷新
    this._onDidChange.fire();
  }

  getFonts() {
    return this.fonts;
  }

  findByFamily(family: string) {
    return this.fonts.filter((f) => f.family.toLowerCase() === family.toLowerCase());
  }

  private extractCSSFromFile(file: string, content: string): Array<{ content: string; offset: number }> {
    const ext = path.extname(file).toLowerCase();

    switch (ext) {
      case '.css':
      case '.scss':
      case '.less':
      case '.sass':
        return [{ content, offset: 0 }];

      case '.vue':
        return this.extractStyleFromVue(content);

      case '.jsx':
      case '.tsx':
        return this.extractStyleFromJSX(content);

      case '.html':
        return this.extractStyleFromHTML(content);

      case '.svelte':
        return this.extractStyleFromSvelte(content);

      case '.astro':
        return this.extractStyleFromAstro(content);

      default:
        // 对于其他文件类型，尝试作为纯CSS处理
        return [{ content, offset: 0 }];
    }
  }

  private extractStyleFromVue(content: string): Array<{ content: string; offset: number }> {
    const results: Array<{ content: string; offset: number }> = [];
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;

    let match;
    while ((match = styleRegex.exec(content)) !== null) {
      const styleContent = match[1];
      const offset = match.index + match[0].indexOf(styleContent);
      results.push({ content: styleContent, offset });
    }

    return results;
  }

  private extractStyleFromJSX(content: string): Array<{ content: string; offset: number }> {
    const results: Array<{ content: string; offset: number }> = [];

    // 提取模板字符串中的CSS
    const templateRegex = /`([\s\S]*?)`/g;
    let match;
    while ((match = templateRegex.exec(content)) !== null) {
      const templateContent = match[1];
      // 检查是否包含CSS相关的内容
      if (templateContent.includes('@font-face') || templateContent.includes('font-family') || templateContent.includes('url(')) {
        const offset = match.index + 1; // +1 to skip the backtick
        results.push({ content: templateContent, offset });
      }
    }

    // 提取内联样式对象中的CSS
    const styleObjectRegex = /style\s*=\s*\{[\s\S]*?\}/gi;
    while ((match = styleObjectRegex.exec(content)) !== null) {
      const styleObject = match[0];
      // 简化的处理，实际可能需要更复杂的解析
      if (styleObject.includes('fontFamily') || styleObject.includes('@font-face')) {
        const offset = match.index;
        results.push({ content: styleObject, offset });
      }
    }

    return results;
  }

  private extractStyleFromHTML(content: string): Array<{ content: string; offset: number }> {
    const results: Array<{ content: string; offset: number }> = [];
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;

    let match;
    while ((match = styleRegex.exec(content)) !== null) {
      const styleContent = match[1];
      const offset = match.index + match[0].indexOf(styleContent);
      results.push({ content: styleContent, offset });
    }

    return results;
  }

  private extractStyleFromSvelte(content: string): Array<{ content: string; offset: number }> {
    const results: Array<{ content: string; offset: number }> = [];
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;

    let match;
    while ((match = styleRegex.exec(content)) !== null) {
      const styleContent = match[1];
      const offset = match.index + match[0].indexOf(styleContent);
      results.push({ content: styleContent, offset });
    }

    return results;
  }

  private extractStyleFromAstro(content: string): Array<{ content: string; offset: number }> {
    const results: Array<{ content: string; offset: number }> = [];

    // Astro文件中的<style>标签
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let match;
    while ((match = styleRegex.exec(content)) !== null) {
      const styleContent = match[1];
      const offset = match.index + match[0].indexOf(styleContent);
      results.push({ content: styleContent, offset });
    }

    // Astro中的样式导入或内联样式
    const importRegex = /import\s+['"]([^'"]*\.css)['"]/gi;
    while ((match = importRegex.exec(content)) !== null) {
      // 对于导入的CSS文件，我们可能需要单独处理，这里先跳过
      // 或者可以标记为需要进一步处理
    }

    return results;
  }
}