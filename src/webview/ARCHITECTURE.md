# Webview Architecture

## 📁 Directory Structure

```
src/webview/
├── main.ts                      # Entry point - coordinates all modules
│
├── shared/                      # Shared utilities and types
│   ├── types.ts                # TypeScript interfaces and constants
│   ├── utils.ts                # Utility functions (logging, calculations, etc.)
│   └── state-manager.ts        # Centralized state management
│
├── cytoscape/                   # Cytoscape-specific modules
│   ├── cytoscape-core.ts       # Main Cytoscape controller
│   ├── interaction-handlers.ts # Event handlers (clicks, hovers, etc.)
│   ├── layout-manager.ts       # fCoSE layout algorithm
│   ├── style-manager.ts        # Centralized style management
│   ├── ui-controller.ts        # UI controls (toolbar, buttons, breadcrumbs)
│   ├── view-manager.ts         # Visibility and depth management
│   └── zoom-lod-manager.ts     # Zoom-based level of detail
```

## 🏗️ Architecture Overview

### 1. **Main Entry Point** (`main.ts`)
- Initializes `CytoscapeCore`
- Handles messages from VS Code extension
- Minimal logic - delegates to appropriate modules

### 2. **Shared Layer** (`shared/`)

#### `types.ts`
- All TypeScript interfaces
- Configuration constants (`CONFIG`, etc.)
- Shared types (`GraphData`, `FocusContext`)

#### `utils.ts`
- Pure utility functions
- Logging, calculations, DOM updates
- No state dependencies

#### `state-manager.ts`
- **Single source of truth** for all state
- Encapsulates:
  - Cytoscape instance
  - Configuration (styles, layout config)
  - Focus context (active file, expand level)
  - UI state (onboarding, focus mode)
- Provides getters/setters and state update methods

### 3. **Cytoscape Layer** (`cytoscape/`)

#### `cytoscape-core.ts`
- **Main coordinator** for Cytoscape functionality
- Instantiates and connects all other modules
- Orchestrates initialization sequence
- Delegates operations to specialized controllers

#### `interaction-handlers.ts` (`InteractionHandlers`)
- All event handlers (clicks, hovers, focus)
- Node tooltips
- Edge tooltips with type badges
- Node collapse/expand
- Focus mode highlighting

#### `layout-manager.ts` (`LayoutManager`)
- fCoSE layout algorithm (Fast Compound Spring Embedder)
- Optimized for hierarchical graphs with guaranteed no overlaps
- Smart camera positioning
- Automatic spacing and node arrangement

#### `style-manager.ts` (`StyleManager`)
- Centralized style management for all Cytoscape styling
- Layer-based priority system (BASE, DEPTH, USER, INTERACTION)
- Class-based styling for better performance
- Debug mode for troubleshooting style issues
- Single source of truth for all visual styling

#### `ui-controller.ts` (`UIController`)
- Manages all UI controls
- Toolbar buttons (zoom, fit, center)
- Depth level controls
- Focus mode toggle
- Onboarding overlay
- Breadcrumb updates
- Callbacks to other controllers

#### `view-manager.ts` (`ViewManager`)
- Controls node visibility
- Depth levels (folders only, files, classes, functions)
- Context-aware focused view (1-hop, 2-hop, 3-hop)
- Progressive edge disclosure
- Entry point highlighting
- Node styling (collapsed/expanded states)

#### `zoom-lod-manager.ts` (`ZoomLODManager`)
- Zoom-based level of detail management
- Automatic detail adjustment based on zoom level
- Depth level transitions with hysteresis
- Node visibility optimization for performance
- Position and dimension caching

## 🔄 Data Flow

```
Extension → main.ts → CytoscapeCore → Specialized Controllers
                            ↓
                     StateManager (central state)
                            ↑
                     All modules read/write state
```

### Example: User changes depth level

1. **UIController** captures depth select change
2. Calls callback registered by **CytoscapeCore**
3. **CytoscapeCore** delegates to **ViewManager**
4. **ViewManager** reads state from **StateManager**
5. Updates node visibility based on depth
6. **CytoscapeCore** triggers layout update via **LayoutManager**
7. Layout is applied to visible nodes

## 🎯 Design Principles

### 1. **Separation of Concerns**
- Each module has a single, well-defined responsibility
- No cross-dependencies between controllers (except through CytoscapeCore)

### 2. **Centralized State**
- All state lives in `StateManager`
- Modules don't maintain their own state
- Easier to debug and reason about

### 3. **Dependency Injection**
- Controllers receive `vscode` and `stateManager` in constructor
- Makes testing easier
- Clear dependencies

### 4. **Modular & Extensible**
- Easy to add new controllers
- Easy to swap implementations
- Clear interfaces between modules

### 5. **Single Responsibility**
- Each class/function does one thing well
- ~200-300 lines per module vs 2094 lines in original

## 🚀 Adding New Features

### To modify layout configuration:
1. Edit `LayoutManager.applyLayout()` for fCoSE parameters
2. Update `src/config/layout-config.ts` for layout settings
3. Note: Currently focused on fCoSE only; other layouts can be added in the future

### To modify styling:
1. Edit `src/config/cytoscape-styles.ts` for base styles
2. Use `StyleManager` methods for dynamic styling
3. Follow the layer priority system (BASE → DEPTH → USER → INTERACTION)

### To add a new UI control:
1. Add button/element to HTML
2. Add handler in `UIController.initializeControls()`
3. Create callback if needed
4. Register callback in `CytoscapeCore.setupUICallbacks()`

### To add a new interaction:
1. Add handler method to `InteractionHandlers`
2. Register event in `InteractionHandlers.registerHandlers()`

## 📊 Module Sizes

- **main.ts**: ~100 lines (was 2094)
- **cytoscape-core.ts**: ~630 lines
- **interaction-handlers.ts**: ~380 lines
- **layout-manager.ts**: ~1086 lines
- **style-manager.ts**: ~400 lines
- **ui-controller.ts**: ~700 lines
- **view-manager.ts**: ~640 lines
- **zoom-lod-manager.ts**: ~1670 lines
- **state-manager.ts**: ~60 lines
- **types.ts**: ~45 lines
- **utils.ts**: ~70 lines

**Total**: ~5781 lines (vs 2094 in monolith)
**But**: Each module is independently understandable and maintainable!


## 🧪 Testing Strategy

With this architecture, you can:
- Unit test each controller independently
- Mock `StateManager` for isolated tests
- Test fCoSE layout configuration without UI
- Test interactions without real Cytoscape instance
- Test style layers independently
- Test zoom-based LOD transitions in isolation

## 🎓 Learning the Codebase

**New developers should read in this order:**
1. `types.ts` - understand data structures
2. `state-manager.ts` - understand state management
3. `main.ts` - see initialization flow
4. `cytoscape-core.ts` - see how modules connect
5. `style-manager.ts` - understand styling system
6. Individual controllers as needed (layout, view, interaction, UI, zoom-LOD)

## 📝 Notes

- The architecture was refactored from a monolithic 2094-line file into modular components
- All functionality has been preserved during the refactoring
- Each module follows single responsibility principle for better maintainability



