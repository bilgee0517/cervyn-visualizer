# Cervyn Visualizer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code Version](https://img.shields.io/badge/VS%20Code-%3E%3D1.85.0-blue.svg)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Version](https://img.shields.io/badge/version-0.1.1-blue.svg)](https://github.com/bilgee0517/cervyn-visualizer/releases)

An open-source VS Code extension for visualizing codebase architecture through interactive knowledge graphs. Understand complex projects through AI-powered semantic clustering and multi-language code analysis.

## Features

### Core Visualization
- **Cytoscape.js Rendering**: Interactive graph visualization
- **fCoSE Layout**: Fast Compound Spring Embedder with guaranteed no overlaps
- **Zoom-based Level of Detail**: Automatic detail adjustment
- **Progressive Disclosure**: Drill down from files to classes to functions

### Code Analysis (Implementation Layer)
- **TypeScript/JavaScript**: Full Tree-sitter parsing with symbol extraction
- **Import Tracking**: Visualizes module dependencies
- **Auto-refresh**: Updates on file changes
- **JSON Export**: Export graph data

### AI Integration (MCP Server)
- **Semantic Clustering**: AI-powered module grouping via MCP server (requires setup)
- **Graph Manipulation**: Add/update nodes through AI agents

## Installation

### From VS Code Marketplace
Search for "Cervyn Visualizer" in the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)

### Manual Installation
1. Download the `.vsix` file from [Releases](https://github.com/bilgee0517/cervyn-visualizer/releases)
2. Open VS Code Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run `Extensions: Install from VSIX...`
4. Select the downloaded `.vsix` file

### Development Setup
```bash
git clone https://github.com/bilgee0517/cervyn-visualizer.git
cd cervyn-visualizer
npm install
npm run compile
```

Press `F5` in VS Code to launch the extension in debug mode.

## Quick Start

1. Open a TypeScript or JavaScript project in VS Code
2. Click the graph icon in the Activity Bar
3. The extension automatically analyzes your codebase and displays the visualization

## Usage

### Commands

Access from Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- `Cervyn Visualizer: Show Graph` - Open the visualization panel
- `Cervyn Visualizer: Refresh Graph` - Regenerate the graph
- `Cervyn Visualizer: Switch Layer` - Change layer (only implementation layer fully supported)

### Configuration

Customize the extension in VS Code Settings:

```json
{
  "codebaseVisualizer.defaultLayer": "implementation",
  "codebaseVisualizer.autoRefresh": true,
  "codebaseVisualizer.maxNodes": 500,
  "codebaseVisualizer.enableClustering": true,
  "codebaseVisualizer.logLevel": "info"
}
```


## Technology Stack

- **Rendering**: Cytoscape.js
- **Layout**: fCoSE (Fast Compound Spring Embedder)
- **Code Analysis**: Tree-sitter (TypeScript/JavaScript)
- **AI Integration**: Model Context Protocol (MCP) server

## Roadmap

### v0.3.0 - Next Release
- Complete multi-layer architecture views (blueprint, architecture, dependencies)
- Visual code metrics display
- Enhanced multi-language support (Python, Java, Go, Rust)

### Future
- Export to PNG/SVG
- Call graph analysis
- Circular dependency detection
- Git integration

See [VISION.md](VISION.md) for detailed roadmap and development intentions.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development

```bash
# Clone and setup
git clone https://github.com/bilgee0517/cervyn-visualizer.git
cd cervyn-visualizer
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Run in VS Code
# Press F5 to launch extension development host
```

### MCP Server Setup (for AI Agent Integration)

```bash
# Build the MCP server
cd mcp-server
npm install
npm run build
```

Then configure the MCP server in your Cursor/Claude Desktop config file (`~/.cursor/mcp.json` or `~/Library/Application Support/Claude/claude_desktop_config.json`):

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

**Note:** Replace `${HOME}/path/to/cervyn-visualizer` with the actual path where you cloned this repository. Restart Cursor/Claude Desktop after configuration.

See [MCP Server README](mcp-server/README.md) for detailed usage instructions.

## Documentation

- [Quick Start Guide](QUICKSTART.md) - Get started in 5 minutes
- [Contributing Guide](CONTRIBUTING.md) - How to contribute
- [Testing Guide](TESTING.md) - Testing strategies and guidelines
- [Project Vision](VISION.md) - Development roadmap and goals
- [MCP Server README](mcp-server/README.md) - AI agent integration via Model Context Protocol
- [Webview Architecture](src/webview/ARCHITECTURE.md) - Internal architecture documentation

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Cytoscape.js](https://js.cytoscape.org/)
- Layout algorithm powered by [cytoscape-fcose](https://github.com/iVis-at-Bilkent/cytoscape.js-fcose)
- Code parsing powered by [Tree-sitter](https://tree-sitter.github.io/tree-sitter/)

## Support

- 🐛 [Report a Bug](https://github.com/bilgee0517/cervyn-visualizer/issues/new)
- 💡 [Request a Feature](https://github.com/bilgee0517/cervyn-visualizer/issues/new)
- 💬 [Discussions](https://github.com/bilgee0517/cervyn-visualizer/discussions)

---

**Made with ❤️ for developers who want to understand their code better**

⭐ If you find this helpful, please star the repository!