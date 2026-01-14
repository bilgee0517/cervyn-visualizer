/**
 * ============================================================================
 * CERVYN VISUALIZER - MODERN GRAPH STYLES
 * ============================================================================
 * 
 * Uses centralized systems:
 *   - Colors from @/config/colors
 *   - Typography from @/config/typography
 *   - Spacing & Layout from @/config/spacing
 *   - Animations from @/config/animations
 * ============================================================================
 */

import { COLORS, PALETTE, hexToRgba } from './colors';
import { TEXT_MAX_WIDTH, TYPOGRAPHY } from './typography';
import { 
  NODE_SIZES, 
  BORDERS, 
  OPACITY, 
  OPACITY_SEMANTIC,
  SPACING_SEMANTIC,
  Z_INDEX,
  getNodePadding,
  getTextMargin
} from './spacing';
import { ANIMATION_DURATION, EASING } from './animations';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates consistent style objects for better maintainability
 */
const createNodeStyle = (overrides = {}) => ({
  'label': 'data(label)',
  'text-valign': 'center',
  'text-halign': 'center',
  'color': PALETTE.neutral[700],
  'font-weight': '500',
  'text-wrap': 'ellipsis',
  'text-overflow-wrap': 'whitespace',
  'opacity': OPACITY.solid,
  ...overrides,
});

// =============================================================================
// MAIN STYLE DEFINITIONS
// =============================================================================

export const CYTOSCAPE_STYLES = [
  // =============================================================================
  // BASE NODE STYLES - Neutral Design
  // =============================================================================
  
  {
    selector: 'node',
    style: createNodeStyle({
      'background-color': PALETTE.neutral[300],
      'border-color': PALETTE.neutral[600],
      'border-width': BORDERS.normal,
      'font-size': TYPOGRAPHY.node.default.fontSize,
      'font-weight': TYPOGRAPHY.node.default.fontWeight,
      'text-max-width': TYPOGRAPHY.node.default.textMaxWidth,
      'min-width': `${NODE_SIZES.default.minWidth}px`,
      'min-height': `${NODE_SIZES.default.minHeight}px`,
      'width': `${NODE_SIZES.default.width}px`,
      'height': `${NODE_SIZES.default.height}px`,
      'padding': getNodePadding('default'),
      'shape': 'round-rectangle', // Has built-in rounded corners (border-radius not supported for nodes)
      'transition-property': 'opacity, display',
      'transition-duration': `${ANIMATION_DURATION.fast}ms`,
      'transition-timing-function': EASING.easeInOut,
    }),
  },
  
  // =============================================================================
  // SEMANTIC STATES - Using Border Thickness & Subtle Accents
  // =============================================================================
  
  // Entry points - Orange accent for visibility
  {
    selector: 'node[isEntryPoint]',
    style: {
      'font-size': TYPOGRAPHY.node.entryPoint.fontSize,
      'font-weight': TYPOGRAPHY.node.entryPoint.fontWeight,
      'border-color': COLORS.states.entryPoint,
      'background-color': PALETTE.neutral[400],
      'z-index': Z_INDEX.nodeEntry,
    },
  },
  
  // =============================================================================
  // COMPOUND NODE HIERARCHY - Type Differentiation via Shape & Size
  // =============================================================================
  
  // Directory nodes - Minimal background with strong border for hierarchy
  {
    selector: 'node[type="directory"]',
    style: {
      'shape': 'round-rectangle', // Has built-in rounded corners
      'background-color': PALETTE.neutral[50],
      'border-color': PALETTE.neutral[500],
      'border-width': BORDERS.directory,
      'border-style': 'dashed',
      'background-opacity': OPACITY_SEMANTIC.directoryBackground,
      'border-opacity': OPACITY.solid,
      'width': `${NODE_SIZES.directory.width}px`,
      'height': `${NODE_SIZES.directory.height}px`,
      'min-width': `${NODE_SIZES.directory.minWidth}px`,
      'min-height': `${NODE_SIZES.directory.minHeight}px`,
      'padding': getNodePadding('directory'),
      'font-size': TYPOGRAPHY.node.directory.fontSize,
      'font-weight': TYPOGRAPHY.node.directory.fontWeight,
      'text-valign': 'top',
      'text-halign': 'center',
      'text-margin-y': getTextMargin('directory'),
      'color': COLORS.text.primary, 
      'text-max-width': TYPOGRAPHY.node.directory.textMaxWidth,
      'z-index': Z_INDEX.nodeDirectory,
      'compound-sizing-wrt-labels': 'exclude',
    },
  },
  
  // File nodes - Solid with distinct border
  {
    selector: 'node[type="file"]',
    style: {
      'shape': 'round-rectangle', // Has built-in rounded corners
      'background-color': COLORS.nodes.file,
      'border-color': PALETTE.neutral[600],
      'border-width': BORDERS.medium,
      'background-opacity': OPACITY_SEMANTIC.fileBackground,
      'width': `${NODE_SIZES.file.width}px`,
      'height': `${NODE_SIZES.file.height}px`,
      'min-width': `${NODE_SIZES.file.minWidth}px`,
      'min-height': `${NODE_SIZES.file.minHeight}px`,
      'padding': getNodePadding('file'),
      'font-size': TYPOGRAPHY.node.file.fontSize,
      'font-weight': TYPOGRAPHY.node.file.fontWeight,
      'text-valign': 'top',
      'text-halign': 'center',
      'text-margin-y': getTextMargin('file'),
      'color': COLORS.text.primary, // Dark, clean color
      'text-max-width': TYPOGRAPHY.node.file.textMaxWidth,
      'z-index': Z_INDEX.nodeFile,
    },
  },
  
  // Class nodes - Purple accent for distinction from files
  {
    selector: 'node[type="class"]',
    style: {
      'shape': 'round-rectangle', 
      'background-color': COLORS.nodes.class,
      'border-color': COLORS.nodes.class,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': TYPOGRAPHY.node.class.fontWeight,
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': `${NODE_SIZES.class.minWidth}px`,
      'min-height': `${NODE_SIZES.class.minHeight}px`,
      'width': `${NODE_SIZES.class.width}px`,
      'height': `${NODE_SIZES.class.height}px`,
      'padding': getNodePadding('class'),
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // Function nodes - Darker for contrast with classes
  {
    selector: 'node[type="function"]',
    style: {
      'shape': 'round-rectangle', // Has built-in rounded corners
      'background-color': COLORS.nodes.function,
      'border-color': PALETTE.neutral[700],
      'border-width': BORDERS.normal,
      'font-size': TYPOGRAPHY.node.function.fontSize,
      'font-weight': TYPOGRAPHY.node.function.fontWeight,
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.function.textMaxWidth,
      'min-width': `${NODE_SIZES.function.minWidth}px`,
      'min-height': `${NODE_SIZES.function.minHeight}px`,
      'width': `${NODE_SIZES.function.width}px`,
      'height': `${NODE_SIZES.function.height}px`,
      'padding': getNodePadding('function'),
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeFunction,
    },
  },
  
  // Compound (parent/folder) nodes - general styling
  {
    selector: 'node[isCompound]',
    style: {
      'cursor': 'pointer',
      'text-wrap': 'ellipsis',
      'text-max-width': TEXT_MAX_WIDTH.xxxl,
      'compound-sizing-wrt-labels': 'exclude',
    },
  },
  
  // Collapsed compound nodes - dashed border to indicate collapse state
  {
    selector: 'node[isCompound][isCollapsed]',
    style: {
      'border-style': 'dashed',
      'background-opacity': OPACITY_SEMANTIC.containerBackground,
    },
  },
  
  // =============================================================================
  // LOD (Level of Detail) - Hide nodes when filtered
  // =============================================================================
  
  {
    selector: 'node.lod-hidden',
    style: {
      'display': 'none',
    },
  },
  
  // =============================================================================
  // REMOVED: Layer-based coloring (presentation, application, domain, etc.)
  // Rationale: Reduces visual noise. Use size, shape, and position for hierarchy
  // Layer information can be shown via tooltips or on-demand filters
  // =============================================================================
  
  // =============================================================================
  // EDGE STYLES - Minimal, Consistent Design
  // =============================================================================
  
  // Base edge style
  {
    selector: 'edge',
    style: {
      'width': BORDERS.normal,
      'line-color': COLORS.edges.default,
      'target-arrow-color': COLORS.edges.default,
      'target-arrow-shape': 'triangle',
      'curve-style': 'taxi',
      'taxi-direction': 'auto',
      'taxi-turn': '50%',
      'arrow-scale': 1,
      'opacity': OPACITY_SEMANTIC.edge,
      'z-index': Z_INDEX.edge,
      'transition-property': 'opacity, display',
      'transition-duration': `${ANIMATION_DURATION.fast}ms`,
      'transition-timing-function': EASING.easeInOut,
    },
  },
  
  // Import edges - Straight lines for direct relationships
  {
    selector: 'edge[edgeType="imports"]',
    style: {
      'line-color': COLORS.edges.imports,
      'target-arrow-color': COLORS.edges.imports,
      'width': BORDERS.medium,
      'opacity': OPACITY_SEMANTIC.edge,
      'z-index': Z_INDEX.edgeImports,
      'curve-style': 'straight',
    },
  },
  
  // Dependency edges - Dashed for critical dependencies
  {
    selector: 'edge[edgeType="depends-on"]',
    style: {
      'line-color': COLORS.edges.dependsOn,
      'target-arrow-color': COLORS.edges.dependsOn,
      'line-style': 'dashed',
      'width': BORDERS.medium,
      'opacity': OPACITY_SEMANTIC.edge,
      'z-index': Z_INDEX.edgeDependency,
      'curve-style': 'taxi',
    },
  },
  
  // Call edges - Thinner, more subtle
  {
    selector: 'edge[edgeType="calls"]',
    style: {
      'line-color': COLORS.edges.calls,
      'target-arrow-color': COLORS.edges.calls,
      'width': BORDERS.thin,
      'opacity': OPACITY.dimmed,
      'z-index': Z_INDEX.edgeCalls,
      'line-style': 'dotted',
      'curve-style': 'bezier',
    },
  },
  
  // Extends/implements - Diamond arrow for inheritance
  {
    selector: 'edge[edgeType="extends"], edge[edgeType="implements"]',
    style: {
      'line-color': COLORS.edges.extends,
      'target-arrow-color': COLORS.edges.extends,
      'width': BORDERS.normal,
      'opacity': OPACITY_SEMANTIC.edge,
      'z-index': Z_INDEX.edgeImports,
      'line-style': 'solid',
      'target-arrow-shape': 'diamond',
    },
  },
  
  // Selected edge - Prominent orange/amber with increased width for better visibility
  // This selector has higher specificity than type-specific selectors when combined
  {
    selector: 'edge.selected',
    style: {
      'width': BORDERS.extraThick * 3, // Much thicker than normal (12px)
      'line-color': PALETTE.amber.DEFAULT, // Orange/amber for high contrast
      'target-arrow-color': PALETTE.amber.DEFAULT,
      'source-arrow-color': PALETTE.amber.DEFAULT,
      'opacity': 1,
      'z-index': Z_INDEX.selected,
      'curve-style': 'bezier',
    },
  },
  
  // Selected edges with specific types - Higher specificity to override type colors
  {
    selector: 'edge[edgeType="imports"].selected',
    style: {
      'line-color': PALETTE.amber.DEFAULT,
      'target-arrow-color': PALETTE.amber.DEFAULT,
      'source-arrow-color': PALETTE.amber.DEFAULT,
    },
  },
  {
    selector: 'edge[edgeType="depends-on"].selected',
    style: {
      'line-color': PALETTE.amber.DEFAULT,
      'target-arrow-color': PALETTE.amber.DEFAULT,
      'source-arrow-color': PALETTE.amber.DEFAULT,
    },
  },
  {
    selector: 'edge[edgeType="calls"].selected',
    style: {
      'line-color': PALETTE.amber.DEFAULT,
      'target-arrow-color': PALETTE.amber.DEFAULT,
      'source-arrow-color': PALETTE.amber.DEFAULT,
    },
  },
  {
    selector: 'edge[edgeType="extends"].selected, edge[edgeType="implements"].selected',
    style: {
      'line-color': PALETTE.amber.DEFAULT,
      'target-arrow-color': PALETTE.amber.DEFAULT,
      'source-arrow-color': PALETTE.amber.DEFAULT,
    },
  },
  
  // =============================================================================
  // INTERACTION STATES - Clean, Modern Highlights
  // =============================================================================
  
  // Node hover - Subtle elevation
  {
    selector: 'node:active',
    style: {
      'opacity': OPACITY_SEMANTIC.hover,
      'overlay-opacity': OPACITY.verySubtle,
      'overlay-color': PALETTE.neutral[800],
      'overlay-padding': SPACING_SEMANTIC.overlayPadding.small,
    },
  },
  
  // Selected node - Prominent orange background with matching border (matches edge color)
  // Using class-based selector for consistency with edge.selected
  {
    selector: 'node.selected',
    style: {
      'background-color': PALETTE.amber.DEFAULT,
      'background-opacity': 0.8,
      'border-width': BORDERS.extraThick,
      'border-color': PALETTE.amber.DEFAULT,
      'border-opacity': 1,
      'color': '#FFFFFF', // White text for contrast on orange background
      'text-outline-width': 1,
      'text-outline-color': '#000000',
      'text-outline-opacity': 0.5,
      'z-index': Z_INDEX.selected,
      'opacity': 1,
    },
  },
  
  // Edge hover - Slight emphasis (using class-based approach)
  {
    selector: 'edge.hover',
    style: {
      'width': BORDERS.thick * 2, // Double width on hover
      'opacity': OPACITY_SEMANTIC.hover,
      'z-index': Z_INDEX.hover,
    },
  },
  
  // Edge active state (fallback for Cytoscape's :active pseudo-class)
  {
    selector: 'edge:active',
    style: {
      'width': BORDERS.thick,
      'opacity': OPACITY_SEMANTIC.hover,
    },
  },
  
  // =============================================================================
  // STYLE CLASSES - For StyleManager Layer System
  // =============================================================================
  // These class-based styles work with the StyleManager to provide predictable,
  // coordinated styling across different systems (depth, zoom, user, interaction)
  
  // ---------------------------------------------------------------------------
  // DEPTH LAYER - Target and parent node styling
  // ---------------------------------------------------------------------------
  
  {
    selector: 'node.depth-target',
    style: {
      'background-color': COLORS.primary,
      'background-opacity': OPACITY.solid,
      'border-color': COLORS.nodes.directory,
      'border-width': BORDERS.medium,
      'border-style': 'solid',
      'border-opacity': OPACITY.solid,
    },
  },
  
  {
    selector: 'node.depth-parent',
    style: {
      'background-color': hexToRgba(PALETTE.neutral[700], 0.15),
      'background-opacity': OPACITY.solid,
      'border-color': COLORS.primary,
      'border-width': BORDERS.normal,
      'border-style': 'solid',
      'border-opacity': OPACITY.strong,
    },
  },
  
  // ---------------------------------------------------------------------------
  // USER LAYER - User customizations
  // ---------------------------------------------------------------------------
  
  {
    selector: 'node.user-colored',
    style: {
      // User color customization - colors set dynamically via color variables
      // This class just marks that the node has user customization applied
    },
  },
  
  // ---------------------------------------------------------------------------
  // INTERACTION LAYER - Hover, selection, focus states
  // ---------------------------------------------------------------------------
  
  {
    selector: 'node.hover',
    style: {
      'overlay-opacity': OPACITY.verySubtle + 0.02,
      'overlay-color': PALETTE.neutral[800],
      'overlay-padding': SPACING_SEMANTIC.overlayPadding.default,
      'z-index': Z_INDEX.hover,
    },
  },
  
  // Note: node.selected styling is defined above in the INTERACTION STATES section
  // This duplicate selector has been removed for consistency
  
  {
    selector: 'node.focused',
    style: {
      'border-width': BORDERS.thick,
      'border-color': COLORS.states.focused,
      'z-index': Z_INDEX.focused,
    },
  },
  
  {
    selector: 'node.dimmed',
    style: {
      'opacity': OPACITY_SEMANTIC.ghost,
    },
  },
];

