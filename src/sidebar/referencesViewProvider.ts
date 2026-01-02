import * as vscode from "vscode";

export class ReferencesViewProvider implements vscode.TreeDataProvider<ReferenceItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ReferenceItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private references: vscode.Location[] = [];
  private targetUri?: vscode.Uri;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  showReferences(uri: vscode.Uri, locations: vscode.Location[]): void {
    this.targetUri = uri;
    this.references = locations;
    this.refresh();
    // 自动聚焦到引用视图
    vscode.commands.executeCommand("assetLens.referencesView.focus");
  }

  clear(): void {
    this.targetUri = undefined;
    this.references = [];
    this.refresh();
  }

  getTreeItem(element: ReferenceItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ReferenceItem): Thenable<ReferenceItem[]> {
    if (!this.targetUri || this.references.length === 0) {
      return Promise.resolve([]);
    }

    if (!element) {
      // 根节点：按文件分组
      const grouped = new Map<string, vscode.Location[]>();
      this.references.forEach((loc) => {
        const key = loc.uri.fsPath;
        const arr = grouped.get(key) || [];
        arr.push(loc);
        grouped.set(key, arr);
      });

      const items: ReferenceItem[] = [];
      grouped.forEach((locs, fsPath) => {
        const uri = vscode.Uri.file(fsPath);
        const label = vscode.workspace.asRelativePath(uri);
        const item = new ReferenceItem(
          label,
          vscode.TreeItemCollapsibleState.Expanded,
          uri,
          undefined,
          locs.length
        );
        item.contextValue = "file";
        items.push(item);
      });
      return Promise.resolve(items);
    } else {
      // 子节点：该文件下的所有引用位置
      if (element.uri && element.contextValue === "file") {
        const locs = this.references.filter((loc) => loc.uri.fsPath === element.uri!.fsPath);
        const items = locs.map((loc) => {
          const line = loc.range.start.line + 1;
          const col = loc.range.start.character + 1;
          const label = `第 ${line} 行，第 ${col} 列`;
          const item = new ReferenceItem(
            label,
            vscode.TreeItemCollapsibleState.None,
            loc.uri,
            loc.range
          );
          item.command = {
            command: "assetLens.openReference",
            title: "打开引用",
            arguments: [loc],
          };
          item.contextValue = "reference";
          return item;
        });
        return Promise.resolve(items);
      }
      return Promise.resolve([]);
    }
  }
}

class ReferenceItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly uri?: vscode.Uri,
    public readonly range?: vscode.Range,
    public readonly count?: number
  ) {
    super(label, collapsibleState);
    if (count !== undefined) {
      this.description = `${count} 个引用`;
    }
    if (range) {
      this.tooltip = `跳转到 ${vscode.workspace.asRelativePath(uri!)} 第 ${range.start.line + 1} 行`;
    }
  }
}