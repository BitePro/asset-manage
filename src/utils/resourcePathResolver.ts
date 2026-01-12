import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import * as http from "http";
import * as https from "https";
import { promises as fs } from "fs";
import { getAliasMapForFile } from "../services/aliasResolver";
import { IMAGE_EXT, getResourceInfo } from "../services/mediaInfo";
import { estimateOptimization } from "../services/optimizer";
import { getGitInfo } from "../services/gitInfo";
import { ResourceInfo, OptimizationEstimate, GitInfo } from "../types";
import { imageCache } from "../store/imageCache";

export type ResolvedType = "base64" | "file" | "network" | "not_found";

export interface ResolvedResource {
    type: ResolvedType;
    uri?: vscode.Uri; // 本地文件
    dataUrl?: string; // 内联 data:image
    raw?: string; // 原始 URL（如 http(s)）
    originalPath?: string; // 原始路径
    range?: vscode.Range; // 当前匹配范围
    // 图片信息相关字段
    resourceInfo?: ResourceInfo; // 图片基本信息（尺寸、体积等）
    optimizationEstimates?: OptimizationEstimate[]; // 优化体积信息
    gitInfo?: GitInfo; // Git提交信息
}

/**
 * 解析资源引用路径，返回绝对路径URI（用于 assetIndex 引用查找）
 * @param documentUri 包含资源引用的文件URI
 * @param rawPath 原始路径字符串
 * @returns 解析后的绝对路径URI，如果无法解析则返回undefined
 */
export async function resolveResourcePath(documentUri: vscode.Uri, rawPath: string): Promise<vscode.Uri | undefined> {
    const cleanedRaw = rawPath.replace(/\|(width=\d*)?(height=\d*)?/gm, "");

    // 跳过 data URLs 和网络 URLs
    if (cleanedRaw.indexOf("data:image") === 0 ||
        cleanedRaw.indexOf("http") === 0 ||
        cleanedRaw.indexOf("//") === 0) {
        return undefined;
    }

    // 绝对路径直接检查是否存在
    if (path.isAbsolute(cleanedRaw)) {
        if (existsSyncSafe(cleanedRaw)) {
            return vscode.Uri.file(cleanedRaw);
        }
        return undefined;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
    const workspaceRoot = workspaceFolder?.uri.fsPath;
    const aliases = getAliasMapForFile(documentUri.fsPath);

    // 获取 AsciiDoc imagesdir（如果适用）
    let relativeImageDir = "";
    try {
        // 创建一个临时文档来获取 imagesdir，但这可能不可靠
        // 对于 assetIndex 的场景，我们简化处理，不依赖复杂的文档上下文
        const tempDoc = await vscode.workspace.openTextDocument(documentUri);
        relativeImageDir = getRelativeImagesDir(tempDoc, 0);
        await vscode.commands.executeCommand('vscode.close', tempDoc.uri);
    } catch {
        // 如果无法打开文档，忽略 imagesdir
    }

    // 1) 相对路径：相对于文件所在目录 + imagesdir
    {
        const pathName = path.normalize(cleanedRaw);
        if (pathName) {
            const docDir = path.dirname(documentUri.fsPath);
            const testImagePath = path.join(docDir, relativeImageDir || "", pathName);
            if (existsSyncSafe(testImagePath)) {
                return vscode.Uri.file(testImagePath);
            }
        }
    }

    // 2) 别名解析和workspace根目录解析
    if (workspaceRoot) {
        const pathName = path.normalize(cleanedRaw).replace(/\\/g, "/");
        if (pathName) {
            const pathsToTest: string[] = [pathName];

            // alias 前缀替换
            Object.keys(aliases).forEach((alias) => {
                const aliasPrefix = alias.endsWith("/") ? alias : alias + "/";
                if (
                    alias !== "" &&
                    (pathName.startsWith(aliasPrefix) || pathName === alias)
                ) {
                    const replacement = aliases[alias];
                    const remaining =
                        pathName === alias ? "" : pathName.slice(aliasPrefix.length);
                    const resolvedPath = path.join(replacement, remaining);
                    pathsToTest.push(resolvedPath);
                }
            });

            // workspace 根目录测试
            for (const testPath of pathsToTest) {
                const testImagePath = path.join(workspaceRoot, testPath);
                if (existsSyncSafe(testImagePath)) {
                    return vscode.Uri.file(testImagePath);
                }
            }

            // additionalSourceFolders
            const cfg = vscode.workspace.getConfiguration("assetLens", documentUri);
            const additionalSourceFolders = [
                ...(cfg.get<string[]>("sourceFolder") ?? []),
                ...(cfg.get<string[]>("sourceFolders") ?? []),
            ];
            const fallbackFolders = ["static", "public"];

            const folders = additionalSourceFolders.length
                ? additionalSourceFolders
                : fallbackFolders;
            for (const testPath of pathsToTest) {
                for (const folder of folders) {
                    let testImagePath: string;
                    if (path.isAbsolute(folder)) {
                        testImagePath = path.join(folder, testPath);
                    } else {
                        testImagePath = path.join(workspaceRoot, folder, testPath);
                    }
                    if (existsSyncSafe(testImagePath)) {
                        return vscode.Uri.file(testImagePath);
                    }
                }
            }
        }
    }

    // 3) 以 / 开头的路径，尝试以工作区根拼接
    if (workspaceRoot && cleanedRaw.startsWith("/")) {
        const joined = path.resolve(workspaceRoot, "." + cleanedRaw);
        if (existsSyncSafe(joined)) {
            return vscode.Uri.file(joined);
        }
    }

    return undefined;
}

/**
 * 面向资源 Hover 的通用解析与绝对路径解析函数。
 * 目标：尽量复用性高，兼容 gutter-preview 中的场景。
 */
export async function parseAndResolveResource(
    document: vscode.TextDocument,
    position: vscode.Position
): Promise<ResolvedResource> {
    // 优先解析完整的 Base64（支持多行模板字符串）
    const base64 = getFullBase64DataUrlAtPosition(document, position);
    const lineIndex = position.line;
    const lineText = document.lineAt(lineIndex).text;
    const imagesDir = getRelativeImagesDir(document, lineIndex);

    // 依次使用解析器识别路径（参考 gutter-preview 的顺序）
    const matches = collectMarkedLinks(lineIndex, lineText)
        .concat(collectDataUrls(lineIndex, lineText))
        .concat(collectHttpLinks(lineIndex, lineText))
        .concat(collectLocalLinks(lineIndex, lineText))
        .concat(collectSiblingLinks(lineIndex, lineText));

    const candidates: ResolvedResource[] = [];

    if (base64) {
        candidates.push({
            type: "base64",
            dataUrl: base64,
            range: getWordRangeFallback(document, position),
        });
    }

    // 将识别到的所有匹配映射为候选结果
    for (const m of matches) {
        const mapped = await resolveViaMappers(
            document,
            position,
            m.url,
            imagesDir
        );
        if (mapped && mapped.type !== "not_found") {
            candidates.push(mapped);
        }
    }

    // 增加兜底：url(...) 或引号路径
    const fallback = fallbackQuotedOrUrl(document, position);
    if (fallback) {
        const mapped = await resolveViaMappers(
            document,
            position,
            fallback.url,
            imagesDir,
            fallback.range
        );
        if (mapped && mapped.type !== "not_found") {
            candidates.push(mapped);
        }
    }

    if (candidates.length === 0) {
        return {
            type: "not_found",
            range: getWordRangeFallback(document, position),
        };
    }

    // 使用 firstSuccessful 实现"谁先拿到真实内容，就返回谁"（兼容旧编译目标）
    try {
        const winner = await firstSuccessful(candidates.map(materializeCandidateWithCache)) as ResolvedResource;
        return winner;
    } catch {
        // 所有候选都失败
        return {
            type: "not_found",
            range: candidates[0]?.range || getWordRangeFallback(document, position),
        };
    }
}

/* 解析阶段 */

function isBase64DataUrl(str: string): boolean {
    return /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/.test(str);
}

/**
 * 支持跨行与模板字符串的 base64 解析（参考本项目原实现）。
 */
function getFullBase64DataUrlAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
): string | undefined {
    const currentLine = position.line;
    const currentLineText = document.lineAt(currentLine).text;
    const cursorIndex = position.character;

    let quoteStartLine = -1;
    let quoteStartIndex = -1;
    let quoteEndLine = -1;
    let quoteEndIndex = -1;
    let quoteChar = "";

    for (let lineNum = currentLine; lineNum >= 0; lineNum--) {
        const lineText = document.lineAt(lineNum).text;
        const searchStart =
            lineNum === currentLine ? cursorIndex - 1 : lineText.length - 1;
        for (let i = searchStart; i >= 0; i--) {
            const char = lineText[i];
            if (
                (char === '"' || char === "'" || char === "`") &&
                (i === 0 || lineText[i - 1] !== "\\")
            ) {
                quoteStartLine = lineNum;
                quoteStartIndex = i;
                quoteChar = char;
                break;
            }
        }
        if (quoteStartLine !== -1) break;
    }

    if (quoteStartLine !== -1) {
        const totalLines = document.lineCount;
        for (let lineNum = quoteStartLine; lineNum < totalLines; lineNum++) {
            const lineText = document.lineAt(lineNum).text;
            const searchStart = lineNum === quoteStartLine ? quoteStartIndex + 1 : 0;

            for (let i = searchStart; i < lineText.length; i++) {
                const char = lineText[i];
                if (char === quoteChar && (i === 0 || lineText[i - 1] !== "\\")) {
                    quoteEndLine = lineNum;
                    quoteEndIndex = i;
                    break;
                }
            }
            if (quoteEndLine !== -1) break;
        }

        if (
            quoteEndLine !== -1 &&
            (currentLine > quoteStartLine ||
                (currentLine === quoteStartLine && cursorIndex > quoteStartIndex)) &&
            (currentLine < quoteEndLine ||
                (currentLine === quoteEndLine && cursorIndex < quoteEndIndex))
        ) {
            const lines: string[] = [];
            for (let lineNum = quoteStartLine; lineNum <= quoteEndLine; lineNum++) {
                const lineText = document.lineAt(lineNum).text;
                if (lineNum === quoteStartLine && lineNum === quoteEndLine) {
                    lines.push(lineText.substring(quoteStartIndex + 1, quoteEndIndex));
                } else if (lineNum === quoteStartLine) {
                    lines.push(lineText.substring(quoteStartIndex + 1));
                } else if (lineNum === quoteEndLine) {
                    lines.push(lineText.substring(0, quoteEndIndex));
                } else {
                    lines.push(lineText);
                }
            }
            const quotedContent = lines.join("\n");
            const cleanedContent = quotedContent.replace(/\s+/g, "");
            if (isBase64DataUrl(cleanedContent)) {
                return cleanedContent;
            }
        }
    }

    const base64Pattern = /data:image\/[^;]+;base64,[^\s'")\]]+/g;
    let match: RegExpExecArray | null;
    while ((match = base64Pattern.exec(currentLineText)) !== null) {
        const startIndex = match.index;
        const endIndex = match.index + match[0].length;
        if (cursorIndex >= startIndex && cursorIndex <= endIndex) {
            return match[0];
        }
    }
    return undefined;
}

interface UrlMatch {
    url: string;
    start: number;
    end: number;
}

function collectMarkedLinks(lineIndex: number, line: string): UrlMatch[] {
    const pattern = /(\[.*\])\(([^"]*)(\".*\")?\)/gi; // [text](url "title")
    const result: UrlMatch[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line))) {
        if (match.length > 0) {
            const imagePath = match[2].trim();
            const matchIndex = match.index + match[1].length + 1;
            result.push({
                url: imagePath,
                start: matchIndex,
                end: matchIndex + imagePath.length,
            });
        }
    }
    return result;
}

function collectDataUrls(lineIndex: number, line: string): UrlMatch[] {
    // 与 gutter-preview 的 [dataUrlRecognizer.recognize()](gutter-preview/src/recognizers/dataurlrecognizer.ts:32) 一致
    const urlPrefixLength = "url('".length;
    const result: UrlMatch[] = [];

    const collect = (pattern: RegExp) => {
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(line))) {
            if (m.length > 1) {
                const imagePath = m[1];
                result.push({
                    url: imagePath,
                    start: m.index + urlPrefixLength,
                    end: m.index + urlPrefixLength + imagePath.length,
                });
            }
        }
    };

    collect(/url\(\'(data:image.*)\'\)/gim);
    collect(/url\(\"(data:image.*)\"\)/gim);

    if (result.length === 0) {
        const collect2 = (pattern: RegExp) => {
            let m: RegExpExecArray | null;
            while ((m = pattern.exec(line))) {
                if (m.length > 1) {
                    const imagePath = m[1];
                    result.push({
                        url: imagePath,
                        start: m.index + 1,
                        end: m.index + 1 + imagePath.length,
                    });
                }
            }
        };
        collect2(/\'(data:image[^']*)\'/gim);
        collect2(/\"(data:image[^"]*)\"/gim);
        collect2(/\`(data:image[^`]*)\`/gim);
    }

    return result;
}

function collectHttpLinks(lineIndex: number, line: string): UrlMatch[] {
    // 与 [linkRecognizer.recognize()](gutter-preview/src/recognizers/linkrecognizer.ts:3) 类似
    const pattern =
        /(?:(?:https?|ftp):\/\/|\b(?:[a-z\d]+\.))(?:(?:[^\s()<>]+|\((?:[^\s()<>]+|(?:\([^\s()<>]+\)))?\))+(?:\((?:[^\s()<>]+|(?:\(?:[^\s()<>]+\)))?\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))?/gi;
    const result: UrlMatch[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line))) {
        if (match.length > 0) {
            const imagePath = match[0];
            result.push({
                url: imagePath,
                start: match.index,
                end: match.index + imagePath.length,
            });
        }
    }
    return result;
}

function collectLocalLinks(lineIndex: number, line: string): UrlMatch[] {
    // 与 [localLinkRecognizer.recognize()](gutter-preview/src/recognizers/locallinkrecognizer.ts:46) 一致（简化版）
    const schemePrefix = "([a-zA-Z]{2,}:)";
    const pathPrefix = "(\\.\\.?|\\~)";
    const pathSeparatorClause = "\\/";
    const excludedPathCharactersClause = "[^\\0\\s!$`&*()\\[\\]+\\'\":;\\\\]";
    const unixLocalLinkClause =
        "((" +
        schemePrefix +
        "|" +
        pathPrefix +
        "|(" +
        excludedPathCharactersClause +
        ")+)?(" +
        pathSeparatorClause +
        "(" +
        excludedPathCharactersClause +
        ")+)+)";
    const winDrivePrefix = "[a-zA-Z]:";
    const winPathPrefix = "(" + winDrivePrefix + "|\\.\\.?|\\~)";
    const winPathSeparatorClause = "(\\\\|\\/)";
    const winExcludedPathCharactersClause =
        "[^\\0<>\\?\\|\\/\\s!$`&*()\\[\\]+\\'\":;]";
    const winLocalLinkClause =
        "((" +
        schemePrefix +
        "|" +
        winPathPrefix +
        "|(" +
        winExcludedPathCharactersClause +
        ")+)?(" +
        winPathSeparatorClause +
        "(" +
        winExcludedPathCharactersClause +
        ")+)+)";

    const _unix = new RegExp(`${unixLocalLinkClause}`, "g");
    const _win = new RegExp(`${winLocalLinkClause}`, "g");

    const result: UrlMatch[] = [];
    let match: RegExpExecArray | null;
    while ((match = _unix.exec(line))) {
        if (match.length > 1) {
            const imagePath = match[1];
            result.push({
                url: imagePath,
                start: match.index,
                end: match.index + imagePath.length,
            });
        }
    }
    while ((match = _win.exec(line))) {
        if (match.length > 1) {
            const imagePath = match[1];
            result.push({
                url: imagePath,
                start: match.index,
                end: match.index + imagePath.length,
            });
        }
    }
    return result;
}

function collectSiblingLinks(lineIndex: number, line: string): UrlMatch[] {
    // 与 [siblingRecognizer.recognize()](gutter-preview/src/recognizers/siblingrecognizer.ts:4) 类似：
    // 本项目使用 IMAGE_EXT 列表生成扩展匹配
    const excludedPathCharactersClause = "[^\\0\\s!$`&*()\\[\\]+\\'\":;\\\\]";
    const exts = IMAGE_EXT.map((ext) => `\\.${ext}`).join("|");
    const pattern = new RegExp(
        `(${excludedPathCharactersClause}+[(${exts})])`,
        "ig"
    );
    const result: UrlMatch[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line))) {
        if (match.length > 0) {
            const imagePath = match[0];
            result.push({
                url: imagePath,
                start: match.index,
                end: match.index + imagePath.length,
            });
        }
    }
    return result;
}

/**
 * AsciiDoc 的 imagesdir 属性支持（参考 [server.ts](gutter-preview/src/server/server.ts:121)）
 * 方案：从文档起始到当前位置行，记录最近一次 :imagesdir: 值
 */
function getRelativeImagesDir(
    document: vscode.TextDocument,
    upToLine: number
): string {
    let relativeImageDir = "";
    const total = Math.min(document.lineCount, Math.max(0, upToLine + 1));
    for (let i = 0; i < total; i++) {
        const text = document.lineAt(i).text;
        if (text.startsWith(":imagesdir:")) {
            relativeImageDir = text.substring(":imagesdir:".length).trim();
        }
    }
    return relativeImageDir;
}

/**
 * 兜底：匹配 url(...) 或 引号内的路径
 */
function fallbackQuotedOrUrl(
    document: vscode.TextDocument,
    position: vscode.Position
): { url: string; range?: vscode.Range } | undefined {
    const lineText = document.lineAt(position.line).text;

    const urlPattern = /url\(\s*(?<path>[^)\s'"]+|"[^"]+"|'[^']+')\s*\)/gi;
    let m: RegExpExecArray | null;
    while ((m = urlPattern.exec(lineText))) {
        const raw = m.groups?.path ?? "";
        const cleaned = raw.replace(/^['"]|['"]$/g, "");
        const start = m.index;
        const end = m.index + m[0].length;
        if (position.character >= start && position.character <= end) {
            return {
                url: cleaned,
                range: new vscode.Range(position.line, start, position.line, end),
            };
        }
    }

    const quotedPattern = /['"]([^'"]+(?:\.[^'"]+)?)['"]/g;
    while ((m = quotedPattern.exec(lineText))) {
        const start = m.index + 1;
        const end = m.index + m[0].length - 1;
        if (position.character >= start && position.character <= end) {
            return {
                url: m[1],
                range: new vscode.Range(position.line, start, position.line, end),
            };
        }
    }
    return undefined;
}

/* 映射阶段（绝对路径解析），按照 gutter-preview 的 mappers 顺序 */

function existsSyncSafe(p: string): boolean {
    try {
        require("fs").accessSync(p);
        return true;
    } catch {
        return false;
    }
}

async function resolveViaMappers(
    document: vscode.TextDocument,
    position: vscode.Position,
    rawPath: string,
    relativeImageDir: string,
    explicitRange?: vscode.Range
): Promise<ResolvedResource> {
    const cleanedRaw = rawPath.replace(/\|(width=\d*)?(height=\d*)?/gm, ""); // 参考 [convertToLocalImagePath()](gutter-preview/src/server/server.ts:202)
    const range = explicitRange || getWordRangeFallback(document, position);

    // 1) dataUrlMapper
    if (cleanedRaw.indexOf("data:image") === 0) {
        return { type: "base64", dataUrl: cleanedRaw, range };
    }

    // 2) simpleUrlMapper
    if (cleanedRaw.indexOf("http") === 0) {
        return { type: "network", raw: cleanedRaw, range };
    } else if (cleanedRaw.indexOf("//") === 0) {
        return { type: "network", raw: "http:" + cleanedRaw, range };
    } else if (path.isAbsolute(cleanedRaw)) {
        if (existsSyncSafe(cleanedRaw)) {
            return { type: "file", uri: vscode.Uri.file(cleanedRaw), range };
        }
    }

    const documentUri = document.uri;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
    const workspaceRoot = workspaceFolder?.uri.fsPath;
    const aliases = getAliasMapForFile(documentUri.fsPath);

    // 3) relativeToOpenFileMapper
    {
        const pathName = path.normalize(cleanedRaw);
        if (pathName) {
            const docDir = path.dirname(documentUri.fsPath);
            const testImagePath = path.join(docDir, relativeImageDir || "", pathName);
            if (existsSyncSafe(testImagePath)) {
                return { type: "file", uri: vscode.Uri.file(testImagePath), range };
            }
        }
    }

    // 4) relativeToWorkspaceRootMapper（包含 alias & additionalSourceFolders）
    if (workspaceRoot) {
        const pathName = path.normalize(cleanedRaw).replace(/\\/g, "/");
        if (pathName) {
            const pathsToTest: string[] = [pathName];

            // alias 前缀替换（参考 [relativetoworkspacerootmapper.ts](gutter-preview/src/mappers/relativetoworkspacerootmapper.ts:31) 的逻辑）
            Object.keys(aliases).forEach((alias) => {
                const aliasPrefix = alias.endsWith("/") ? alias : alias + "/";
                if (
                    alias !== "" &&
                    (pathName.startsWith(aliasPrefix) || pathName === alias)
                ) {
                    const replacement = aliases[alias];
                    const remaining =
                        pathName === alias ? "" : pathName.slice(aliasPrefix.length);
                    const resolvedPath = path.join(replacement, remaining);
                    pathsToTest.push(resolvedPath);
                }
            });

            // workspace 根目录测试
            for (const testPath of pathsToTest) {
                // const testImagePath = path.join(workspaceRoot, testPath);
                const testImagePath = testPath;
                if (existsSyncSafe(testImagePath)) {
                    const uri = vscode.Uri.file(testImagePath);
                    return { type: "file", uri, range };
                }
            }

            // additionalSourceFolders（默认 static/public，且允许通过配置覆盖）
            const cfg = vscode.workspace.getConfiguration("assetLens", documentUri);
            const additionalSourceFolders = [
                ...(cfg.get<string[]>("sourceFolder") ?? []),
                ...(cfg.get<string[]>("sourceFolders") ?? []),
            ];
            const fallbackFolders = ["static", "public"];
            // const fallbackFolders = ["staticc", "public"];

            const folders = additionalSourceFolders.length
                ? additionalSourceFolders
                : fallbackFolders;
            for (const testPath of pathsToTest) {
                for (const folder of folders) {
                    let testImagePath: string;
                    if (path.isAbsolute(folder)) {
                        testImagePath = path.join(folder, testPath);
                    } else {
                        testImagePath = path.join(workspaceRoot, folder, testPath);
                    }
                    if (existsSyncSafe(testImagePath)) {
                        return { type: "file", uri: vscode.Uri.file(testImagePath), range };
                    }
                }
            }
        }
    }

    // 若以 / 开头，尝试以工作区根拼接（与本项目原有行为兼容）
    if (workspaceRoot && cleanedRaw.startsWith("/")) {
        const joined = path.resolve(workspaceRoot, "." + cleanedRaw);
        if (existsSyncSafe(joined)) {
            return { type: "file", uri: vscode.Uri.file(joined), range };
        }
    }

    return { type: "not_found", range };
}

/* 辅助 */

function getWordRangeFallback(
    document: vscode.TextDocument,
    position: vscode.Position
) {
    return (
        document.getWordRangeAtPosition(
            position,
            /['"()[\]A-Za-z0-9_\-./~@,:;=]+/
        ) || new vscode.Range(position, position)
    );
}

function firstSuccessful<T>(promises: Promise<T>[]): Promise<T> {
    return new Promise((resolve, reject) => {
        let rejectedCount = 0;
        const total = promises.length;
        promises.forEach((p) => {
            p.then(resolve).catch(() => {
                rejectedCount++;
                if (rejectedCount === total) {
                    reject(new Error("All promises failed"));
                }
            });
        });
    });
}

/**
 * 带缓存的候选资源物化函数
 * 优先从缓存获取信息，如果没有则获取并缓存
 */
async function materializeCandidateWithCache(
    candidate: ResolvedResource
): Promise<ResolvedResource> {
    // Base64资源不缓存，直接处理
    if (candidate.type === "base64") {
        return await materializeCandidate(candidate);
    }

    // 生成缓存键
    let cacheKey: string | undefined;
    if (candidate.type === "file" && candidate.uri) {
        cacheKey = candidate.uri.fsPath;
    } else if (candidate.type === "network" && candidate.raw) {
        cacheKey = candidate.raw;
    }

    // 尝试从缓存获取
    if (cacheKey) {
        const cached = imageCache.get(cacheKey);
        if (cached) {
            // 从缓存恢复数据
            return {
                ...candidate,
                resourceInfo: cached.resourceInfo,
                optimizationEstimates: cached.optimizationEstimates,
                gitInfo: cached.gitInfo,
            };
        }
    }

    // 缓存未命中，正常处理并缓存结果
    const result = await materializeCandidate(candidate);

    // 保存到缓存（只有非base64且有信息才缓存）
    if (cacheKey && result.resourceInfo) {
        imageCache.set(cacheKey, {
            resourceInfo: result.resourceInfo,
            optimizationEstimates: result.optimizationEstimates,
            gitInfo: result.gitInfo,
        });
    }

    return result;
}

function contentTypeToExt(contentType?: string | null): string | undefined {
    const map: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/gif": "gif",
        "image/webp": "webp",
        "image/svg+xml": "svg",
        "image/avif": "avif",
        "image/bmp": "bmp",
        "image/x-icon": "ico",
        "image/vnd.microsoft.icon": "ico",
    };
    if (!contentType) return undefined;
    const ct = contentType.split(";")[0].trim().toLowerCase();
    return map[ct];
}

function buildTempFilePath(extHint?: string): string {
    const ext = (extHint && extHint.replace(/^\./, "")) || "img";
    const fname = `assetlens_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;
    return path.join(os.tmpdir(), fname);
}

async function materializeCandidate(
    candidate: ResolvedResource
): Promise<ResolvedResource> {
    let result: ResolvedResource;

    // 本地文件：验证可访问后直接返回
    if (candidate.type === "file" && candidate.uri) {
        await fs.access(candidate.uri.fsPath);
        result = {
            ...candidate,
            originalPath: candidate.uri?.fsPath,
        };
    }
    // Base64：写入临时文件后返回
    else if (candidate.type === "base64" && candidate.dataUrl) {
        const m = candidate.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!m) throw new Error("Invalid data URL");
        const mime = m[1];
        const data = m[2];
        const ext = contentTypeToExt(mime) || "img";
        const tmpPath = buildTempFilePath(ext);
        const buf = Buffer.from(data, "base64");
        await fs.writeFile(tmpPath, buf);
        result = {
            type: "base64",
            uri: vscode.Uri.file(tmpPath),
            originalPath: candidate.dataUrl,
            range: candidate.range,
        };
    }
    // 网络资源：下载至临时文件后返回
    else if (candidate.type === "network" && candidate.raw) {
        const raw = candidate.raw as string;
        const url = new URL(raw);
        const proto = url.protocol === "https:" ? https : http;

        const extFromUrl = path.extname(url.pathname);
        const tmpPath = buildTempFilePath(extFromUrl);

        const contentTypeExt = await new Promise<string | undefined>((resolve) => {
            const req = proto.get(raw, (res) => {
                // 处理重定向
                if (
                    res.statusCode &&
                    res.statusCode >= 300 &&
                    res.statusCode < 400 &&
                    res.headers.location
                ) {
                    const redirectUrl = res.headers.location.startsWith("http")
                        ? res.headers.location
                        : `${url.protocol}//${url.host}${res.headers.location}`;
                    const proto2 =
                        new URL(redirectUrl).protocol === "https:" ? https : http;
                    const req2 = proto2.get(redirectUrl, (res2) => {
                        resolve(contentTypeToExt(res2.headers["content-type"] || null));
                        req2.abort();
                    });
                    req.abort();
                    return;
                }
                resolve(contentTypeToExt(res.headers["content-type"] || null));
                req.abort();
            });
            req.on("error", () => resolve(undefined));
        });

        const finalTmpPath = contentTypeExt
            ? buildTempFilePath(contentTypeExt)
            : tmpPath;

        await new Promise<void>((resolve, reject) => {
            const file = require("fs").createWriteStream(finalTmpPath);
            const start = proto.get(raw, function handle(res: http.IncomingMessage) {
                if (
                    res.statusCode &&
                    res.statusCode >= 300 &&
                    res.statusCode < 400 &&
                    res.headers.location
                ) {
                    // 重定向
                    const redirect = res.headers.location.startsWith("http")
                        ? res.headers.location
                        : `${url.protocol}//${url.host}${res.headers.location}`;
                    const proto2 = new URL(redirect).protocol === "https:" ? https : http;
                    const next = proto2.get(redirect, handle);
                    next.on("error", reject);
                    res.resume();
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    res.resume();
                    return;
                }
                res.pipe(file);
                file.on("finish", () => file.close(resolve));
                file.on("error", reject);
            });
            start.on("error", reject);
        });

        result = {
            type: "network",
            uri: vscode.Uri.file(finalTmpPath),
            originalPath: raw,
            range: candidate.range,
        };
    } else {
    throw new Error("Unable to materialize candidate");
}

    // 为所有资源类型获取额外信息（包括base64）
    if (result.uri) {
        try {
            const resourceInfo = await getResourceInfo(result.uri);
            const optimizationEstimates = await estimateOptimization(resourceInfo);
            const gitInfo = result.type === "base64" ? undefined : await getGitInfo(result.uri); // base64不需要git信息

            result.resourceInfo = resourceInfo;
            result.optimizationEstimates = optimizationEstimates;
            result.gitInfo = gitInfo;
        } catch (error) {
            // 获取信息失败时不影响解析结果，但记录错误
            console.warn("获取资源信息失败:", error);
        }
    }

    return result;
}
