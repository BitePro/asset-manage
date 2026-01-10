import * as vscode from "vscode";
import { ResourceInfo, OptimizationEstimate, GitInfo } from "../types";

/**
 * 缓存的图片信息结构
 */
export interface CachedImageInfo {
    resourceInfo: ResourceInfo;
    optimizationEstimates?: OptimizationEstimate[];
    gitInfo?: GitInfo;
    lastAccessed: number; // 最后访问时间戳
    createdAt: number; // 创建时间戳
}

/**
 * 图片信息缓存器
 * key: 绝对地址或者网络地址
 * value: 缓存的图片信息
 */
export class ImageCache {
    private cache: Map<string, CachedImageInfo> = new Map();
    private maxSize: number = 1000; // 最大缓存条目数
    private maxAge: number = 30 * 60 * 1000; // 最大缓存时间30分钟

    /**
     * 获取缓存的图片信息
     * @param key 缓存键（绝对地址或网络地址）
     */
    get(key: string): CachedImageInfo | undefined {
        const item = this.cache.get(key);
        if (!item) return undefined;

        // 检查是否过期
        if (Date.now() - item.createdAt > this.maxAge) {
            this.cache.delete(key);
            return undefined;
        }

        // 更新最后访问时间
        item.lastAccessed = Date.now();
        return item;
    }

    /**
     * 设置缓存的图片信息
     * @param key 缓存键（绝对地址或网络地址）
     * @param info 图片信息
     */
    set(key: string, info: Omit<CachedImageInfo, 'lastAccessed' | 'createdAt'>): void {
        // 如果缓存已满，清理最旧的条目
        if (this.cache.size >= this.maxSize) {
            this.cleanup();
        }

        this.cache.set(key, {
            ...info,
            lastAccessed: Date.now(),
            createdAt: Date.now(),
        });
    }

    /**
     * 检查是否存在缓存
     * @param key 缓存键
     */
    has(key: string): boolean {
        const item = this.cache.get(key);
        if (!item) return false;

        // 检查是否过期
        if (Date.now() - item.createdAt > this.maxAge) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    /**
     * 删除缓存项
     * @param key 缓存键
     */
    delete(key: string): boolean {
        return this.cache.delete(key);
    }

    /**
     * 清空所有缓存
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * 获取缓存大小
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * 清理过期和最旧的缓存项
     */
    private cleanup(): void {
        const now = Date.now();
        const entries = Array.from(this.cache.entries());

        // 清理过期项
        const validEntries = entries.filter(([_, item]) => {
            return now - item.createdAt <= this.maxAge;
        });

        // 如果清理后仍然超过最大容量，按最后访问时间排序并保留最新的
        if (validEntries.length > this.maxSize) {
            validEntries.sort((a, b) => b[1].lastAccessed - a[1].lastAccessed);
            validEntries.splice(this.maxSize);
        }

        this.cache = new Map(validEntries);
    }

    /**
     * 获取缓存统计信息
     */
    getStats(): { size: number; maxSize: number; maxAge: number } {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            maxAge: this.maxAge,
        };
    }

    /**
     * 设置缓存配置
     * @param config 配置选项
     */
    setConfig(config: { maxSize?: number; maxAge?: number }): void {
        if (config.maxSize !== undefined) {
            this.maxSize = Math.max(10, config.maxSize); // 最小10
        }
        if (config.maxAge !== undefined) {
            this.maxAge = Math.max(60 * 1000, config.maxAge); // 最小1分钟
        }
        this.cleanup(); // 应用新配置后清理
    }
}

// 导出全局缓存实例
export const imageCache = new ImageCache();
