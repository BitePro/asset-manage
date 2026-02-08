# Asset Manage

在 VS Code 侧边栏中浏览与预览工作区内的静态资源：图片、音视频、字体、Office 文档等。

## 演示视频

<!-- 在此补充视频链接，例如：[▶ 观看介绍视频](https://your-video-url) -->

## 功能特性

- **静态资源侧边栏**：按类型分类展示图片、媒体、字体、Office、其他文件
- **内置预览**：图片、PDF、Word(docx)、Excel(xlsx) 等可在面板内直接预览
- **字体预览**：在资源管理器中右键 `.ttf/.otf/.woff/.woff2` 字体文件，选择「字体预览」可跳转到侧边栏并定位该字体
- **快捷入口**：快捷键 `Ctrl+Alt+A`（Windows/Linux）或 `Cmd+Alt+A`（macOS）快速打开静态资源面板

## 使用方式

1. 点击左侧活动栏的 **Asset Manage** 图标
2. 或使用快捷键 `Ctrl+Alt+A` / `Cmd+Alt+A` 打开面板
3. 在侧边栏中浏览、搜索、预览工作区内的静态资源

## 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `assetManage.scanInclude` | 参与资源扫描的 glob 列表 | `["**/*"]` |
| `assetManage.scanExclude` | 排除扫描的 glob 列表 | `node_modules`、`.git`、`dist`、`build` 等 |

## License

MIT
