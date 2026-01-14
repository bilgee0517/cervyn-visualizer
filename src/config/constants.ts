/**
 * ============================================================================
 * CENTRALIZED CONSTANTS SYSTEM
 * ============================================================================
 * 
 * Single source of truth for all application-wide constants.
 * 
 * Usage:
 *   import { NODE_TYPES, MESSAGE_TYPES, WEBVIEW_CONFIG } from '@/config/constants';
 *   if (node.type === NODE_TYPES.DIRECTORY) { ... }
 * 
 * Features:
 *   - Consistent naming conventions
 *   - Type-safe string literals
 *   - Organized by domain
 *   - Immutable values
 * 
 * Note: For animation, spacing, and threshold values, see:
 *   - @/config/animations - Animation durations, delays, easing
 *   - @/config/spacing - Spacing, sizing, layout values
 *   - @/config/thresholds - Numeric thresholds and limits
 * ============================================================================
 */

// ============================================================================
// LIBRARY VERSIONS
// ============================================================================

/**
 * External library versions for the webview
 */
export const LIBRARY_VERSIONS = {
  CYTOSCAPE: '3.29.0', // 3.29.0+ required for percentage border-radius support
  DAGRE: '0.8.5',
  CYTOSCAPE_DAGRE: '2.5.0',
  CYTOSCAPE_FCOSE: '2.2.0',
  LAYOUT_BASE: '2.0.1',
  COSE_BASE: '2.2.0',
  GRAPHOLOGY: '0.25.0',
} as const;

// ============================================================================
// WEBVIEW CONFIGURATION
// ============================================================================

/**
 * Core webview configuration
 * 
 * Note: Animation and spacing values have been moved to:
 *   - @/config/animations (durations, delays)
 *   - @/config/spacing (padding, sizing)
 *   - @/config/thresholds (zoom min/max, sensitivities)
 */
export const WEBVIEW_CONFIG = {
  // Legacy values (kept for backward compatibility)
  MIN_ZOOM: 0.01,
  MAX_ZOOM: 10,
  WHEEL_SENSITIVITY: 0.2,
  TOOLBAR_HEIGHT: 60,
  DEFAULT_PADDING: 100,
  LAYOUT_ANIMATION_DURATION: 500,
  LAYOUT_ANIMATION_DELAY: 600,
} as const;

// ============================================================================
// DEPTH LEVELS
// ============================================================================

/**
 * Hierarchical depth levels for progressive disclosure
 */
export const DEPTH_LEVELS = {
  FOLDERS_ONLY: 0,
  FILES: 1,
  CLASSES: 2,
  FUNCTIONS: 3,
} as const;

export type DepthLevel = typeof DEPTH_LEVELS[keyof typeof DEPTH_LEVELS];

// ============================================================================
// NODE TYPES
// ============================================================================

/**
 * Node type identifiers
 */
export const NODE_TYPES = {
  DIRECTORY: 'directory',
  FOLDER: 'folder', // Alias for directory
  FILE: 'file',
  CLASS: 'class',
  FUNCTION: 'function',
  METHOD: 'method', // Alias for function
  MODULE: 'module',
  INTERFACE: 'interface',
  ENUM: 'enum',
  TYPE: 'type',
  VARIABLE: 'variable',
  CONSTANT: 'constant',
  CLUSTER: 'cluster', // For semantic clustering
  CONCEPT: 'concept', // For agent-added concepts
  UNKNOWN: 'unknown',
} as const;

export type NodeType = typeof NODE_TYPES[keyof typeof NODE_TYPES];

// ============================================================================
// EDGE TYPES
// ============================================================================

/**
 * Edge/relationship type identifiers
 */
export const EDGE_TYPES = {
  IMPORTS: 'imports',
  DEPENDS_ON: 'depends-on',
  CALLS: 'calls',
  EXTENDS: 'extends',
  IMPLEMENTS: 'implements',
  USES: 'uses',
  CONTAINS: 'contains',
  REFERENCES: 'references',
  RUNTIME_CALL: 'runtime-call',
  UNKNOWN: 'unknown',
} as const;

export type EdgeType = typeof EDGE_TYPES[keyof typeof EDGE_TYPES];

// ============================================================================
// ARCHITECTURAL LAYERS
// ============================================================================

/**
 * Architectural layer identifiers (for swimlane layouts)
 */
export const ARCHITECTURAL_LAYERS = {
  PRESENTATION: 'presentation',
  APPLICATION: 'application',
  DOMAIN: 'domain',
  INFRASTRUCTURE: 'infrastructure',
  UTILITY: 'utility',
  UNKNOWN: 'unknown',
} as const;

export type ArchitecturalLayer = typeof ARCHITECTURAL_LAYERS[keyof typeof ARCHITECTURAL_LAYERS];

// ============================================================================
// LAYOUT TYPES
// ============================================================================

/**
 * Available layout algorithm identifiers
 * 
 * Currently focused on fCoSE (Fast Compound Spring Embedder) only.
 * Other layouts can be added in the future as needed.
 */
export const LAYOUT_TYPES = {
  FCOSE: 'fcose',
  // Future layouts can be added here
} as const;

export type LayoutType = typeof LAYOUT_TYPES[keyof typeof LAYOUT_TYPES];

// ============================================================================
// RENDERER TYPES
// ============================================================================

/**
 * Available graph renderer identifiers
 */
export const RENDERER_TYPES = {
  CYTOSCAPE: 'cytoscape',
} as const;

export type RendererType = typeof RENDERER_TYPES[keyof typeof RENDERER_TYPES];

// ============================================================================
// ICONS & SYMBOLS
// ============================================================================

/**
 * UI icons and symbols (emoji-based for simplicity)
 */
export const ICONS = {
  // Expand/collapse
  COLLAPSED: '▶',
  EXPANDED: '▼',
  COLLAPSIBLE: '⏵',
  
  // Zoom
  ZOOM_IN: '🔍+',
  ZOOM_OUT: '🔍−',
  ZOOM_FIT: '⊡',
  
  // Node types
  FOLDER: '📁',
  FILE: '📄',
  CLASS: '📦',
  FUNCTION: '⚙️',
  INTERFACE: '📋',
  ENUM: '🔢',
  MODULE: '📚',
  
  // Edge types
  IMPORT: '📦',
  DEPENDENCY: '🔗',
  CALL: '📞',
  EXTENDS: '⬆️',
  IMPLEMENTS: '📋',
  
  // Actions
  REFRESH: '🔄',
  SETTINGS: '⚙️',
  FILTER: '🔍',
  LAYOUT: '📐',
  EXPORT: '💾',
  HELP: '❓',
  INFO: 'ℹ️',
  WARNING: '⚠️',
  ERROR: '❌',
  SUCCESS: '✅',
  
  // States
  LOADING: '⏳',
  PROCESSING: '⚡',
  ENTRY_POINT: '🚪',
  MODIFIED: '✏️',
  HOT: '🔥',
} as const;

// ============================================================================
// MESSAGE TYPES
// ============================================================================

/**
 * Message type identifiers for extension ↔ webview communication
 */
export const MESSAGE_TYPES = {
  // File operations
  OPEN_FILE: 'openFile',
  SAVE_FILE: 'saveFile',
  
  // Graph operations
  UPDATE_GRAPH: 'updateGraph',
  REFRESH_GRAPH: 'refreshGraph',
  SET_LAYOUT: 'setLayout',
  FIT_GRAPH: 'fitGraph',
  
  // State management
  SET_STATE: 'setState',
  GET_STATE: 'getState',
  SAVE_STATE: 'saveState',
  LOAD_STATE: 'loadState',
  
  // UI operations
  SHOW_NOTIFICATION: 'showNotification',
  SHOW_ERROR: 'showError',
  SHOW_WARNING: 'showWarning',
  SHOW_INFO: 'showInfo',
  
  // System
  READY: 'ready',
  INITIALIZED: 'initialized',
  ERROR: 'error',
  LOG: 'log',
  ALERT: 'alert',
  
  // Agent operations
  AGENT_ACTION: 'agentAction',
  AGENT_FEEDBACK: 'agentFeedback',
} as const;

export type MessageType = typeof MESSAGE_TYPES[keyof typeof MESSAGE_TYPES];

// ============================================================================
// STORAGE KEYS
// ============================================================================

/**
 * LocalStorage/workspace state keys
 */
export const STORAGE_KEYS = {
  LAYOUT_TYPE: 'cervyn.layout.type',
  ZOOM_LEVEL: 'cervyn.zoom.level',
  DEPTH_LEVEL: 'cervyn.depth.level',
  RENDERER_TYPE: 'cervyn.renderer.type',
  NODE_COLORS: 'cervyn.colors.nodes',
  EDGE_COLORS: 'cervyn.colors.edges',
  HIDDEN_NODES: 'cervyn.hidden.nodes',
  EXPANDED_NODES: 'cervyn.expanded.nodes',
  SELECTED_NODES: 'cervyn.selected.nodes',
  CAMERA_POSITION: 'cervyn.camera.position',
  USER_PREFERENCES: 'cervyn.preferences',
  ONBOARDING_COMPLETE: 'cervyn.onboarding.complete',
} as const;

// ============================================================================
// FEATURE FLAGS
// ============================================================================

/**
 * Feature flag identifiers
 */
export const FEATURE_FLAGS = {
  ENABLE_SEMANTIC_CLUSTERING: true,
  ENABLE_LOD_SYSTEM: true,
  ENABLE_MINIMAP: true,
  ENABLE_BREADCRUMBS: false, // Deprecated
  ENABLE_AGENT_MODE: false,   // Removed
  ENABLE_ANIMATIONS: true,
  ENABLE_TELEMETRY: false,
  ENABLE_DEBUG_MODE: false,
} as const;

// ============================================================================
// FILE PATTERNS
// ============================================================================

/**
 * File pattern matchers for categorization
 */
export const FILE_PATTERNS = {
  // Source code
  SOURCE_CODE: /\.(ts|tsx|js|jsx|py|java|cpp|c|go|rs|rb|php)$/,
  TYPESCRIPT: /\.tsx?$/,
  JAVASCRIPT: /\.jsx?$/,
  PYTHON: /\.py$/,
  
  // Configuration
  CONFIG: /\.(json|yaml|yml|toml|ini|env|config)$/,
  
  // Documentation
  DOCS: /\.(md|txt|rst|adoc)$/,
  
  // Tests
  TESTS: /\.(test|spec)\.(ts|tsx|js|jsx|py)$/,
  
  // Ignore patterns
  IGNORE: /(node_modules|\.git|dist|build|out|\.next|\.nuxt|coverage|\.cache)/,
} as const;

// ============================================================================
// UTILITY CONSTANTS
// ============================================================================

/**
 * Miscellaneous utility constants
 */
export const UTILS = {
  // Default values
  DEFAULT_NODE_LABEL: 'Unnamed',
  DEFAULT_EDGE_LABEL: '',
  
  // Empty states
  EMPTY_ARRAY: [] as const,
  EMPTY_OBJECT: {} as const,
  
  // Defaults
  DEFAULT_LAYOUT: LAYOUT_TYPES.FCOSE,
  DEFAULT_RENDERER: RENDERER_TYPES.CYTOSCAPE,
  DEFAULT_DEPTH: DEPTH_LEVELS.FILES,
} as const;

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  LIBRARY_VERSIONS,
  WEBVIEW_CONFIG,
  DEPTH_LEVELS,
  NODE_TYPES,
  EDGE_TYPES,
  ARCHITECTURAL_LAYERS,
  LAYOUT_TYPES,
  RENDERER_TYPES,
  ICONS,
  MESSAGE_TYPES,
  STORAGE_KEYS,
  FEATURE_FLAGS,
  FILE_PATTERNS,
  UTILS,
};

// Legacy exports for backward compatibility
export const OVERLAP_CONFIG = {
  MIN_NODE_SPACING: 50,
  DEFAULT_OFFSET: 100,
} as const;

