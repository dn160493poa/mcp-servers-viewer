# MCP Servers Viewer

Sidebar viewer for **Cursor** (and VS Code-compatible) MCP servers.

Shows live status from your local Cursor runtime:

- **Connected (N tools)** — green check
- **Error** — red error
- **Needs auth** — key icon
- **Not connected** / **disabled**

Expand a connected server to see its tools.

## Features

- Activity Bar panel **MCP Servers Viewer**
- Same list in the Explorer sidebar
- Reads config from `~/.cursor/mcp.json`
- Reads live status from `~/.cursor/projects/<workspace>/mcps/`
- Auto-refresh + manual refresh

## Install

### From VSIX

```bash
cursor --install-extension mcp-servers-viewer-0.1.0.vsix
```

Then reload the window.

### From source

```bash
npm install
npx vsce package
cursor --install-extension ./mcp-servers-viewer-0.1.0.vsix
```

## Commands

- `MCP Servers Viewer: Open`
- `MCP Servers Viewer: Refresh`
- `MCP Servers Viewer: Open MCP Config`

## Requirements

- Cursor with MCP configured in `~/.cursor/mcp.json`
- Works best when the workspace has a matching folder under `~/.cursor/projects/`

## License

MIT
