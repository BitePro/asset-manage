# 发布 VS Code 插件检查清单

## 必须完成（否则无法通过或无法发布）

### 1. 扩展图标 `icon.png`
- 位置：项目**根目录**
- 格式：**PNG**（市场不接受 SVG）
- 尺寸：建议 **128x128** 或 **256x256**
- 用于：市场列表与详情页展示
- 若缺失：`vsce package` 可能报错或市场拒绝

### 2. 发布者 (publisher)
- 在 [Visual Studio Marketplace 发布者管理](https://marketplace.visualstudio.com/manage) 创建发布者（若还没有）
- 将 `package.json` 里 `"publisher": "asset-manage"` 改为你的**发布者 ID**（与市场一致）

### 3. 仓库链接（建议）
- 将 `package.json` 中 `repository.url`、`bugs.url`、`homepage` 的 `YOUR_USERNAME` 改为你的 GitHub 用户名或组织名
- 市场会显示「Repository」链接

---

## 可选

### 活动栏图标 `resources/assetmanage-icon-dark.svg`
- 用于侧边栏活动栏上的图标
- 缺失时 VS Code 会使用默认图标，扩展仍可正常使用和发布

---

## 打包与发布命令

```bash
# 安装打包工具（一次性）
npm i -g @vscode/vsce

# 先构建
pnpm run build:gui
pnpm run compile

# 打包成 .vsix（本地安装或上传用）
vsce package

# 首次发布（需 Azure DevOps PAT，见下方）
vsce publish
```

### 首次发布：Personal Access Token
1. 打开 [Azure DevOps 个人访问令牌](https://dev.azure.com/_users/settings/tokens)
2. 新建 Token，权限勾选 **Marketplace (Publish)**
3. 执行 `vsce publish` 时按提示输入 PAT

---

## 当前项目已具备

- [x] `package.json` 必填字段：name, displayName, version, engine, main, publisher
- [x] `.vscodeignore`：排除源码与开发文件，仅打包 `out/`、`GUI/dist/`、`node_modules` 等
- [x] `README.md`：市场展示用
- [x] `LICENSE`：MIT
- [x] `CHANGELOG.md`：版本更新说明
