# Webview Module

**Cervyn Visualizer** webview implementation - the client-side visualization engine.

## Overview

This directory contains the webview code that runs in VS Code's webview panel. It handles graph rendering, user interactions, and visualization logic.

## Quick Start for Developers

### Structure Overview
```
src/webview/
├── main.ts                      # Entry point - coordinates all modules
├── shared/                      # Shared across renderers
│   ├── types.ts                # Interfaces & constants
│   ├── utils.ts                # Pure utility functions
│   └── state-manager.ts        # Centralized state management
├── cytoscape/                   # Cytoscape.js renderer modules
│   ├── cytoscape-core.ts       # Main coordinator
│   ├── interaction-handlers.ts # Event handlers
│   ├── layout-manager.ts       # Layout algorithms
│   ├── ui-controller.ts        # UI controls
│   ├── view-manager.ts         # Visibility management
│   └── zoom-lod-manager.ts     # Zoom-based level of detail
```

### Adding a Feature

**Modify Layout Configuration?**
→ Edit `cytoscape/layout-manager.ts` (currently uses fCoSE exclusively)

**New Interaction?**
→ Edit `cytoscape/interaction-handlers.ts`

**New UI Control?**
→ Edit `cytoscape/ui-controller.ts`

**New Visibility Rule?**
→ Edit `cytoscape/view-manager.ts`

**New Zoom Behavior?**
→ Edit `cytoscape/zoom-lod-manager.ts`

### Key Classes

- **`StateManager`** - Centralized state (Cytoscape instance, config, focus context)
- **`CytoscapeCore`** - Main coordinator that orchestrates all controllers
- **`InteractionHandlers`** - Handles clicks, hovers, focus events
- **`LayoutManager`** - Manages fCoSE layout algorithm (optimized for hierarchical graphs)
- **`UIController`** - Manages toolbar, buttons, onboarding, breadcrumbs
- **`ViewManager`** - Controls depth levels and node visibility
- **`ZoomLODManager`** - Handles zoom-based level of detail adjustments

### Data Flow
```
VS Code Extension → main.ts → CytoscapeCore → Specialized Controllers
                                          ↓
                                   StateManager (shared state)
                                          ↑
                                   All controllers read/write
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed architecture documentation.

## Development

### Building
```bash
npm run compile:webview
```

### Watch Mode
```bash
npm run watch:webview
```

### Testing
See [TESTING.md](../../TESTING.md) for testing guidelines.

## Module Responsibilities

- **main.ts**: Entry point, message handling from extension
- **shared/types.ts**: TypeScript interfaces and type definitions
- **shared/utils.ts**: Pure utility functions (no side effects)
- **shared/state-manager.ts**: Single source of truth for all state
- **cytoscape/cytoscape-core.ts**: Coordinates all Cytoscape modules
- **cytoscape/interaction-handlers.ts**: User interaction event handlers
- **cytoscape/layout-manager.ts**: Graph layout algorithms
- **cytoscape/ui-controller.ts**: UI element management
- **cytoscape/view-manager.ts**: Node visibility and depth management
- **cytoscape/zoom-lod-manager.ts**: Zoom-based level of detail

## Design Principles

1. **Separation of Concerns**: Each module has a single, well-defined responsibility
2. **Centralized State**: All state lives in `StateManager`
3. **Dependency Injection**: Controllers receive dependencies via constructor
4. **Modular & Extensible**: Easy to add new features or swap implementations
5. **Testable**: Modules can be tested independently with mocked dependencies



