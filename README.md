# Codebase Visualizer for VS Code

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code Version](https://img.shields.io/badge/VS%20Code-%3E%3D1.85.0-blue.svg)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

An open-source VS Code extension for visualizing codebase architecture through interactive knowledge graphs. Understand complex projects through multi-layer visualizations, code quality metrics, and AI-powered semantic clustering.

## Features

### High-Performance Visualization
- **WebGL Rendering**: GPU-accelerated rendering handles 10,000+ nodes at 60fps
- **Level of Detail**: Automatic detail adjustment based on zoom level
- **Semantic Clustering**: AI-powered module detection using Louvain algorithm
- **Viewport Culling**: Only renders visible nodes for optimal performance

### Code Quality Insights
- **Visual Metrics**: Node size represents lines of code, color indicates test coverage, border width shows complexity
- **Comprehensive Metrics**: Tracks lines of code, cyclomatic complexity, dependencies, and code health
- **Instant Assessment**: Visual indicators highlight technical debt and code quality issues

### Multi-Layer Architecture Views
- **Blueprint Layer**: High-level directory structure and organization
- **Architecture Layer**: Component relationships and import dependencies
- **Implementation Layer**: Detailed code structure with classes and functions
- **Dependencies Layer**: External package dependencies and internal module relationships

### Interactive Exploration
- **Progressive Disclosure**: Drill down from clusters to files to classes to functions
- **Focus Mode**: Isolate specific nodes and their dependencies
- **Click-to-Navigate**: Jump directly to source files in VS Code
- **Advanced Filtering**: Filter by complexity, size, coverage, layer, and more
- **Multiple Layouts**: Semantic, hierarchical, circular, and force-directed layouts

### Code Analysis
- **Automatic Discovery**: Analyzes TypeScript and JavaScript projects
- **Import Tracking**: Visualizes module dependencies and relationships
- **Symbol Extraction**: Identifies classes and functions within files
- **Package Integration**: Displays external dependencies from package.json

## Installation

### From VS Code Marketplace
Search for "Codebase Visualizer" in the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)

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
4. Use the command palette to switch layers or change layouts

## Usage

### Commands

Access from Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- `Codebase Visualizer: Show Graph` - Open the visualization panel
- `Codebase Visualizer: Refresh Graph` - Regenerate the graph
- `Codebase Visualizer: Change Layout` - Switch between layout algorithms
- `Codebase Visualizer: Switch Layer` - Change visualization layer
- `Codebase Visualizer: Export Graph` - Export graph data as JSON

### Configuration

Customize the extension in VS Code Settings:

```json
{
  "codebaseVisualizer.useSigmaRenderer": true,
  "codebaseVisualizer.enableClustering": true,
  "codebaseVisualizer.showCodeMetrics": true,
  "codebaseVisualizer.defaultLayout": "semantic",
  "codebaseVisualizer.defaultLayer": "architecture",
  "codebaseVisualizer.autoRefresh": true,
  "codebaseVisualizer.maxNodes": 1000
}
```

### Visual Encoding

- **Node Size**: Lines of code
- **Node Color**: Test coverage (green = high, yellow = medium, red = low)
- **Border Width**: Code complexity
- **Border Color**: Critical complexity indicators
- **Opacity**: Recent changes
- **Halo Effect**: Node importance (number of dependents)

## Technology Stack

- **Rendering**: Sigma.js 3.0 (WebGL), Cytoscape.js (fallback)
- **Graph Processing**: Graphology with Louvain community detection
- **Layout Algorithms**: ForceAtlas2, Dagre, semantic positioning
- **Code Analysis**: TypeScript/JavaScript AST parsing
- **Integration**: VS Code Extension API

## Roadmap

### v0.3.0 - AST Analysis
- TypeScript Compiler API integration for accurate symbol extraction
- Call graph analysis
- Circular dependency detection
- Multi-language support (Python, Java, Go)

### v0.4.0 - Git Integration
- File history visualization
- Code evolution timeline
- Hot spot detection (frequently changed files)
- Code churn analysis

### v1.0.0 - Enterprise Features
- MCP Server for AI agent integration
- Real-time collaboration
- Export to PNG/SVG/PlantUML
- Team ownership visualization

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

## Documentation

- [Quick Start Guide](QUICKSTART.md) - Get started in 5 minutes
- [Contributing Guide](CONTRIBUTING.md) - How to contribute
- [Project Vision](VISION.md) - Development roadmap and goals

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Cytoscape.js](https://js.cytoscape.org/) and [Sigma.js](https://www.sigmajs.org/)
- Graph algorithms powered by [Dagre](https://github.com/dagrejs/dagre) and [Graphology](https://graphology.github.io/)

## Support

- 🐛 [Report a Bug](https://github.com/bilgee0517/cervyn-visualizer/issues/new)
- 💡 [Request a Feature](https://github.com/bilgee0517/cervyn-visualizer/issues/new)
- 💬 [Discussions](https://github.com/bilgee0517/cervyn-visualizer/discussions)

---

**Made with ❤️ for developers who want to understand their code better**

⭐ If you find this helpful, please star the repository!
