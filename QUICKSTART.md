# Quick Start Guide

## 🚀 Testing the Extension Locally

### 1. Open in VS Code
```bash
cd cervyn-visualizer
code .
```

### 2. Install Dependencies
```bash
npm install
npm run compile
```

### 3. Run the Extension
1. Press `F5` in VS Code (works on Windows, macOS, and Linux)
2. A new **Extension Development Host** window will open
3. In the new window, open a TypeScript/JavaScript project
4. Click the graph icon in the Activity Bar (left sidebar)
5. See your codebase visualized!

## 🎯 Quick Commands to Try

In the Extension Development Host window, press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) and try:

1. **Codebase Visualizer: Show Graph** - Opens the visualization
2. **Codebase Visualizer: Switch Layer** - Try different layers:
   - Blueprint (high-level)
   - Architecture (components)
   - Implementation (detailed)
   - Dependencies (packages)
3. **Codebase Visualizer: Change Layout** - Try different layouts:
   - Dagre (hierarchical)
   - Concentric (circular hierarchy)
   - Grid (structured grid)
   - Cose (force-directed, physics-based)
   - Circle (circular arrangement)

## 📊 What You'll See

The extension will automatically:
- Scan your workspace for `.ts`, `.tsx`, `.js`, `.jsx` files
- Create a visual graph with nodes representing files/components
- Show relationships (imports, dependencies)
- Let you click nodes to open files

## 🛠️ Development Tips

### Watch Mode
For continuous compilation during development:
```bash
npm run watch
```
Then press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) → "Reload Window" after making changes.

### Debug Output
Check the Debug Console in VS Code for logs and errors.

### Testing on Different Projects
Open different projects in the Extension Development Host to see how the visualizer handles various codebases.

## 📦 Building for Distribution

### Create VSIX Package
```bash
npm run package
```

This creates a `.vsix` file you can:
- Share with others
- Install manually in VS Code
- Publish to the VS Code Marketplace

## 🎨 Customization

Edit `package.json` to change:
- Extension name and description
- Commands and shortcuts
- Default settings

Edit `src/services/CodeAnalyzer.ts` to:
- Add support for more languages
- Improve node categorization
- Enhance import detection

## 🚧 Next Steps

### Phase 1: Polish MVP
- [ ] Test with real codebases
- [ ] Fix any bugs
- [ ] Improve performance for large projects
- [ ] Add better error handling

### Phase 2: Add Features
- [ ] Search/filter nodes
- [ ] Better tooltips with file info
- [ ] Export to PNG/SVG
- [ ] Custom node colors

### Phase 3: Advanced Features
- [ ] Python support
- [ ] MCP server integration
- [ ] Task tracker
- [ ] Team collaboration

## 📚 Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Cytoscape.js Documentation](https://js.cytoscape.org/)
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

## 💡 Tips for Demos

When showing this off:
1. Start with a familiar open-source project
2. Show the different layers (Blueprint → Implementation)
3. Demonstrate clicking nodes to navigate
4. Switch layouts to show flexibility
5. Export the graph as JSON

## 🐛 Troubleshooting

**Extension doesn't activate?**
- Check the Debug Console for errors
- Make sure you compiled: `npm run compile`

**Graph is empty?**
- Open a folder/workspace with code files
- Check that files match patterns: `*.ts`, `*.tsx`, `*.js`, `*.jsx`

**Changes not showing?**
- Reload the Extension Development Host window
- Or restart debugging (stop and press F5 again)

---

**Ready to visualize? Press F5 and explore!** 🎉

