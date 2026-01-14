# Cervyn Visualizer MCP Server

**Model Context Protocol (MCP) server for AI-powered knowledge graph manipulation.**

This MCP server exposes tools that allow AI agents (Claude, GPT, etc.) to programmatically manipulate the codebase knowledge graph in **Cervyn Visualizer**.

---

## 🚀 Features

### **Available Tools** (3 tools)

#### **Graph Operations**
- `getGraph` - Retrieve current graph data (nodes and edges)
- `updateNode` - Modify node properties (label, roleDescription, technology, progressStatus)
- `updateEdge` - Modify edge properties (label, edgeType, description)

**Note:** Additional tools (addNode, addEdge, proposed changes, layer management) exist in code but are not yet registered. They will be enabled in future releases.

---

## 📦 Installation

```bash
cd mcp-server
npm install
npm run build
```

---

## 🔧 Configuration

Add the MCP server to your Cursor/Claude Desktop configuration file (`~/.cursor/mcp.json` or `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "codebase-visualizer": {
      "command": "node",
      "args": [
        "${HOME}/path/to/cervyn-visualizer/mcp-server/dist/index.js"
      ]
    }
  }
}
```

**Note:** Replace `${HOME}/path/to/cervyn-visualizer` with the actual path where you cloned this repository.

---

## 🧪 Usage

### **In Cursor/Claude Desktop**

After building and configuring, restart Cursor. Then in a chat with Claude:

```
"Get the current graph for the implementation layer"
```

Claude will use the `getGraph` tool automatically.

### **Example Tool Calls**

```json
{
  "name": "getGraph",
  "arguments": {
    "layer": "implementation"
  }
}
```

Response:
```json
{
  "success": true,
  "layer": "implementation",
  "nodeCount": 42,
  "edgeCount": 67,
  "nodes": [...],
  "edges": [...]
}
```

#### 2. **Update Node**
```json
{
  "name": "updateNode",
  "arguments": {
    "nodeId": "file-src/AuthService.ts",
    "roleDescription": "Handles user authentication and authorization",
    "technology": "Express.js",
    "progressStatus": "in-progress"
  }
}
```

#### 3. **Update Edge**
```json
{
  "name": "updateEdge",
  "arguments": {
    "edgeId": "edge-auth-api",
    "label": "authenticates",
    "edgeType": "uses",
    "description": "API uses AuthService for authentication"
  }
}
```

---

## 🏗️ Architecture

```
mcp-server/
├── src/
│   ├── index.ts                      # Main MCP server
│   ├── graph-state-manager.ts        # In-memory graph state
│   ├── mcp-function-ids.ts           # Function ID constants
│   └── tools/
│       ├── index.ts                  # Tool exports
│       ├── graph-operations.ts       # Add/remove node/edge
│       ├── proposed-changes.ts       # Propose/apply changes
│       └── layer-management.ts       # Layer & agent mode
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔄 Development Workflow

### **Build**
```bash
npm run build
```

### **Watch Mode**
```bash
npm run watch
```

### **Test Locally**
```bash
npm run start
```

Then send JSON-RPC messages via stdin.

---

## 🎯 AI Agent Workflow

### **Typical Claude Conversation**

**User:** "Show me the current codebase graph"

**Claude:** "I'll retrieve the current graph data for you..."

Claude calls:
```
getGraph({ layer: "implementation" })
```

**User:** "Update the AuthService node to mark it as in-progress"

**Claude:** "I'll update that node for you..."

Claude calls:
```
updateNode({
  nodeId: "file-src/AuthService.ts",
  progressStatus: "in-progress",
  roleDescription: "Authentication service implementation"
})
```

---

## 🐛 Troubleshooting

### **MCP Server Not Found**
- Check that `mcp.json` path is correct
- Ensure `npm run build` completed successfully
- Verify `dist/index.js` exists

### **Tool Calls Failing**
- Check stderr logs (server logs to stderr, not stdout)
- Verify node IDs exist before operations
- Ensure layer names are valid

### **Graph State Lost**
- State is shared via file system (~/.codebase-visualizer/state.json)
- VS Code extension and MCP server sync state automatically
- If state seems stale, restart both the extension and MCP server

---

## 📊 Response Format

All tools return a consistent format:

```json
{
  "success": true,
  "message": "Operation completed",
  ...additional fields...
}
```

Or on error:
```json
{
  "error": "Error message here"
}
```

---

## 🔗 Integration with VS Code Extension

**Current Implementation:**
- State synchronization via shared file system (`~/.codebase-visualizer/state.json`)
- Changes made via MCP server automatically appear in VS Code extension
- Changes made in VS Code extension are available to MCP server
- File-based synchronization with version tracking

**Future Enhancements:**
- Real-time bidirectional sync (via IPC/WebSocket)
- Enhanced conflict resolution
- Network-based synchronization for remote collaboration

---

## 📝 License

MIT


