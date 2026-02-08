# Asset Manage

在 VS Code 侧边栏中浏览与预览工作区内的静态资源：图片、音视频、字体、Office 文档等。

## 功能

- **静态资源侧边栏**：按类型分类展示图片、媒体、字体、Office、其他文件
- **预览**：图片、PDF、Word(docx)、Excel(xlsx) 等可在面板内预览
- **字体预览**：在资源管理器中右键 `.ttf/.otf/.woff/.woff2` 选择「字体预览」可跳转到侧边栏并定位该字体
- **状态栏入口**：点击底部状态栏「Asset Manage」快速打开面板
- **快捷键**：`Ctrl+Alt+A`（Windows/Linux）或 `Cmd+Alt+A`（macOS）打开静态资源面板

## 配置

| 配置项 | 说明 | 默认 |
|--------|------|------|
| `assetManage.scanInclude` | 参与扫描的 glob 列表 | `["**/*"]` |
| `assetManage.scanExclude` | 排除的 glob 列表 | `node_modules`、`.git`、`dist`、`build` 等 |

## 发布前请自行完成

1. **图标**：在项目根目录添加 `icon.png`（建议 128x128 或 256x256），用于市场展示；在 `resources/` 下添加 `assetmanage-icon-dark.svg` 作为活动栏图标（可选，缺失时使用默认图标）。
2. **仓库与发布者**：将 `package.json` 中 `repository`、`bugs`、`homepage` 的 `YOUR_USERNAME` 改为你的 GitHub 用户名；`publisher` 改为你在 [Visual Studio Marketplace](https://marketplace.visualstudio.com/) 的发布者 ID。
3. **安装 vsce 并打包**：`npm i -g @vscode/vsce`，在项目根目录执行 `vsce package` 生成 `.vsix`；首次发布用 `vsce publish`（需配置 Personal Access Token）。

## License

MIT
