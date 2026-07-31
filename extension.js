const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");

function mcpConfigPath() {
  return path.join(os.homedir(), ".cursor", "mcp.json");
}

function readMcpServers() {
  try {
    const raw = fs.readFileSync(mcpConfigPath(), "utf8");
    const json = JSON.parse(raw);
    return json.mcpServers || {};
  } catch {
    return {};
  }
}

function workspaceToProjectSlug(workspacePath) {
  return workspacePath.replace(/^\//, "").replace(/\//g, "-");
}

function findMcpsRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const projectsRoot = path.join(os.homedir(), ".cursor", "projects");
  if (folder) {
    const candidate = path.join(
      projectsRoot,
      workspaceToProjectSlug(folder),
      "mcps"
    );
    if (fs.existsSync(candidate)) return candidate;
  }
  try {
    let best = null;
    let bestMtime = 0;
    for (const ent of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const mcps = path.join(projectsRoot, ent.name, "mcps");
      if (!fs.existsSync(mcps)) continue;
      const mtime = fs.statSync(mcps).mtimeMs;
      if (mtime > bestMtime) {
        bestMtime = mtime;
        best = mcps;
      }
    }
    return best;
  } catch {
    return null;
  }
}

function readServerRuntime(serverName) {
  const mcpsRoot = findMcpsRoot();
  if (!mcpsRoot) {
    return { status: "unknown", toolCount: 0, detail: "no runtime info" };
  }

  const dir = path.join(mcpsRoot, `user-${serverName}`);
  if (!fs.existsSync(dir)) {
    return { status: "disconnected", toolCount: 0, detail: "Not connected" };
  }

  const statusFile = path.join(dir, "STATUS.md");
  if (fs.existsSync(statusFile)) {
    let text = "";
    try {
      text = fs.readFileSync(statusFile, "utf8");
    } catch {
      text = "";
    }
    const lower = text.toLowerCase();
    if (lower.includes("error") || lower.includes("errored") || lower.includes("fail")) {
      return { status: "error", toolCount: 0, detail: "Error", tooltip: text.trim() };
    }
    if (lower.includes("need") && lower.includes("auth")) {
      return {
        status: "needsAuth",
        toolCount: 0,
        detail: "Needs auth",
        tooltip: text.trim(),
      };
    }
  }

  const toolsDir = path.join(dir, "tools");
  let toolCount = 0;
  if (fs.existsSync(toolsDir)) {
    try {
      toolCount = fs
        .readdirSync(toolsDir)
        .filter((f) => f.endsWith(".json")).length;
    } catch {
      toolCount = 0;
    }
  }

  if (toolCount > 0) {
    return {
      status: "connected",
      toolCount,
      detail: `Connected (${toolCount} tool${toolCount === 1 ? "" : "s"})`,
    };
  }

  return { status: "disconnected", toolCount: 0, detail: "Not connected" };
}

function item(label, opts = {}) {
  const treeItem = new vscode.TreeItem(
    label,
    opts.collapsible
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None
  );
  if (opts.description) treeItem.description = opts.description;
  if (opts.icon) {
    treeItem.iconPath = new vscode.ThemeIcon(
      opts.icon,
      opts.iconColor ? new vscode.ThemeColor(opts.iconColor) : undefined
    );
  }
  if (opts.tooltip) treeItem.tooltip = opts.tooltip;
  if (opts.command) treeItem.command = opts.command;
  return treeItem;
}

function statusVisual(runtime, disabled) {
  if (disabled) {
    return {
      icon: "circle-slash",
      description: "disabled",
      tooltip: "Disabled in mcp.json",
    };
  }
  switch (runtime.status) {
    case "connected":
      return {
        icon: "pass-filled",
        iconColor: "testing.iconPassed",
        description: runtime.detail,
        tooltip: runtime.detail,
      };
    case "error":
      return {
        icon: "error",
        iconColor: "testing.iconFailed",
        description: "Error",
        tooltip: runtime.tooltip || "MCP server errored",
      };
    case "needsAuth":
      return {
        icon: "key",
        iconColor: "problemsWarningIcon.foreground",
        description: "Needs auth",
        tooltip: runtime.tooltip || "Authentication required",
      };
    case "disconnected":
      return {
        icon: "circle-outline",
        description: "Not connected",
        tooltip: "Not connected",
      };
    default:
      return {
        icon: "question",
        description: "unknown",
        tooltip: "Status unknown",
      };
  }
}

function mcpChildren() {
  const servers = readMcpServers();
  const names = Object.keys(servers);
  if (names.length === 0) {
    return [
      item("No MCP servers in ~/.cursor/mcp.json", {
        icon: "warning",
        command: {
          command: "mcpServersViewer.openMcpConfig",
          title: "Open MCP Config",
        },
      }),
    ];
  }

  return names.map((name) => {
    const cfg = servers[name] || {};
    const disabled = cfg.disabled === true;
    const runtime = readServerRuntime(name);
    const visual = statusVisual(runtime, disabled);
    const cmd = cfg.command
      ? `${cfg.command} ${(cfg.args || []).join(" ")}`.trim()
      : cfg.url || "remote";

    return item(name, {
      icon: visual.icon,
      iconColor: visual.iconColor,
      description: visual.description,
      tooltip: `${visual.tooltip}\n${cmd}`,
      collapsible: runtime.status === "connected" && runtime.toolCount > 0,
    });
  });
}

function mcpToolChildren(serverName) {
  const mcpsRoot = findMcpsRoot();
  if (!mcpsRoot) return [];
  const toolsDir = path.join(mcpsRoot, `user-${serverName}`, "tools");
  if (!fs.existsSync(toolsDir)) return [];
  try {
    return fs
      .readdirSync(toolsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort()
      .map((tool) => item(tool, { icon: "tools" }));
  } catch {
    return [];
  }
}

class McpTree {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!element) return Promise.resolve(mcpChildren());
    if (
      element.label &&
      element.collapsibleState !== vscode.TreeItemCollapsibleState.None
    ) {
      return Promise.resolve(mcpToolChildren(String(element.label)));
    }
    return Promise.resolve([]);
  }
}

function activate(context) {
  const sidebar = new McpTree();
  const explorer = new McpTree();
  const providers = [sidebar, explorer];

  const watchRoots = new Set([mcpConfigPath()]);
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (folder) {
    watchRoots.add(
      path.join(
        os.homedir(),
        ".cursor",
        "projects",
        workspaceToProjectSlug(folder),
        "mcps"
      )
    );
  }

  for (const root of watchRoots) {
    try {
      const watcher = fs.watch(root, { recursive: true }, () => {
        for (const p of providers) p.refresh();
      });
      context.subscriptions.push({ dispose: () => watcher.close() });
    } catch {
      // ignored
    }
  }

  const interval = setInterval(() => {
    for (const p of providers) p.refresh();
  }, 5000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("mcpServersViewer.servers", sidebar),
    vscode.window.registerTreeDataProvider("mcpServersViewer.explorer", explorer),
    vscode.commands.registerCommand("mcpServersViewer.refresh", () => {
      for (const p of providers) p.refresh();
    }),
    vscode.commands.registerCommand("mcpServersViewer.open", async () => {
      try {
        await vscode.commands.executeCommand(
          "workbench.view.extension.mcpServersViewer"
        );
      } catch {
        await vscode.commands.executeCommand("mcpServersViewer.explorer.focus");
      }
    }),
    vscode.commands.registerCommand("mcpServersViewer.openMcpConfig", async () => {
      const file = mcpConfigPath();
      if (!fs.existsSync(file)) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ mcpServers: {} }, null, 2));
      }
      const doc = await vscode.workspace.openTextDocument(file);
      await vscode.window.showTextDocument(doc);
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
