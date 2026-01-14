# Cervyn Visualizer MCP Server

**Model Context Protocol (MCP) server for AI-powered knowledge graph manipulation.**

This MCP server exposes tools that allow AI agents (Claude, GPT, etc.) to programmatically manipulate the codebase knowledge graph in **Cervyn Visualizer**.

---

## 🚀 Features

### **Available Tools** (14 total)

#### **Graph Operations** (6 tools)
- `addNode` - Add a new node to the graph
- `addEdge` - Create a connection between nodes
- `removeNode` - Remove a node and its edges
- `removeEdge` - Remove a specific edge
- `getGraph` - Retrieve current graph data
- `updateNode` - Modify node properties

#### **Proposed Changes** (4 tools)
- `proposeChange` - Propose a change to a node (in-memory)
- `applyProposedChanges` - Apply all proposed changes
- `listProposedChanges` - View pending changes
- `clearProposedChange` - Remove a specific proposal

#### **Layer Management** (2 tools)
- `setLayer` - Switch between layers (blueprint/architecture/implementation/dependencies)
- `getCurrentLayer` - Get active layer

#### **Agent Mode** (2 tools)
- `setAgentOnlyMode` - Toggle filter for AI-added nodes only
- `getAgentOnlyMode` - Check current mode

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
"Add a new node called AuthService to the architecture layer"
```

Claude will use the `addNode` tool automatically.

### **Example Tool Calls**

#### 1. **Add a Node**
```json
{
  "name": "addNode",
  "arguments": {
    "label": "AuthService",
    "type": "module",
    "layer": "architecture",
    "roleDescription": "Handles user authentication",
    "technology": "Express"
  }
}
```

#### 2. **Propose a Change**
```json
{
  "name": "proposeChange",
  "arguments": {
    "nodeId": "node-authservice-123",
    "changeName": "Add JWT support",
    "summary": "Implement token-based authentication",
    "intention": "Security requirement"
  }
}
```

#### 3. **Get Graph**
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

**User:** "I want to visualize the authentication flow in my app"

**Claude:** "I'll help you create a knowledge graph for authentication. Let me add the key components..."

Claude internally calls:
```
1. setLayer("architecture")
2. addNode("AuthController", ...)
3. addNode("TokenService", ...)
4. addEdge("AuthController" -> "TokenService", type="uses")
5. getGraph() to verify
```

**User:** "Can you propose changes to add OAuth support?"

**Claude:** "I'll propose those changes..."

Claude calls:
```
1. proposeChange("TokenService", changeName="Add OAuth", ...)
2. listProposedChanges() to show you the plan
3. (After your approval) applyProposedChanges()
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
- MCP server is stateless - restarts clear graph
- For persistence, integrate with VS Code extension (future phase)

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

**Current:** MCP server runs independently (stateless)

**Future (Phase 3+):**
- Share state with VS Code extension via IPC
- Sync changes to extension's GraphService
- Persist to Supabase
- Real-time webview updates

---

## 📝 License

MIT


