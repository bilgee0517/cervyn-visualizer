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
  
  // =============================================================================
  // WORKFLOW LAYER NODE STYLES - User-facing Features
  // =============================================================================
  
  // Feature nodes - Primary blue for main features
  {
    selector: 'node[type="feature"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': COLORS.workflow.feature,
      'border-color': COLORS.workflow.feature,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // Feature nodes - Not implemented (no supportedBy links)
  {
    selector: 'node[type="feature"][!supportedBy], node[type="feature"][supportedBy=""], node[type="feature"][supportedBy="[]"]',
    style: {
      'border-style': 'dotted',
      'opacity': 0.6,
      'background-color': COLORS.states.dimmed,
      'border-color': PALETTE.neutral[500],
    },
  },
  
  // Feature nodes - Fully implemented (has supportedBy links)
  {
    selector: 'node[type="feature"][supportedBy]',
    style: {
      'border-style': 'solid',
      'opacity': 1.0,
      'border-width': BORDERS.thick,
    },
  },
  
  // Feature-group nodes - Container for related features (indigo)
  {
    selector: 'node[type="feature-group"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': COLORS.workflow.featureGroup,
      'border-color': COLORS.workflow.featureGroup,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '140px',
      'min-height': '90px',
      'width': '140px',
      'height': '90px',
      'padding': '25px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // User-journey nodes - Flow through multiple features (purple, works as compound node)
  {
    selector: 'node[type="user-journey"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': COLORS.workflow.userJourney,
      'border-color': COLORS.workflow.userJourney,
      'border-width': BORDERS.thick,
      'border-style': 'solid',
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '700',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '160px',
      'min-height': '100px',
      'width': '160px',
      'height': '100px',
      'padding': '30px',
      'text-valign': 'top',
      'text-halign': 'center',
      'text-margin-y': getTextMargin('directory'),
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
      'compound-sizing-wrt-labels': 'exclude',
    },
  },
  
  // =============================================================================
  // CONTEXT LAYER NODE STYLES - External Systems & Boundaries
  // =============================================================================
  
  // Actor nodes (people, users, roles, personas) - Teal, ellipse shape
  {
    selector: 'node[type="actor"]',
    style: {
      'shape': 'ellipse',
      'background-color': COLORS.context.actor,
      'border-color': COLORS.context.actor,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '100px',
      'min-height': '100px',
      'width': '100px',
      'height': '100px',
      'padding': '15px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // External system nodes - Rose for external dependencies
  {
    selector: 'node[type="external-system"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': COLORS.context.externalSystem,
      'border-color': COLORS.context.externalSystem,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // External API nodes - Pink for API integrations
  {
    selector: 'node[type="external-api"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': COLORS.context.externalApi,
      'border-color': COLORS.context.externalApi,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // External datastore nodes (databases, caches) - Yellow, cylinder shape
  {
    selector: 'node[type="external-datastore"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': COLORS.context.externalDatastore,
      'border-color': COLORS.context.externalDatastore,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // External service nodes (SaaS: Auth0, Stripe, Twilio) - Light rose
  {
    selector: 'node[type="external-service"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': COLORS.context.externalService,
      'border-color': COLORS.context.externalService,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // =============================================================================
  // CONTAINER LAYER NODE STYLES - Runtime + Data Ownership
  // =============================================================================
  
  // =============================================================================
  // CONTAINER LAYER NODE STYLES - Runtime + Data Ownership
  // =============================================================================
  
  // Frontend nodes - Cyan for client apps (web, mobile)
  {
    selector: 'node[type="frontend"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': COLORS.container.frontend,
      'border-color': COLORS.container.frontend,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // Service nodes - Green for backend services/APIs
  {
    selector: 'node[type="service"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': COLORS.container.service,
      'border-color': COLORS.container.service,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // Worker nodes - Orange for background job processors
  {
    selector: 'node[type="worker"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': COLORS.container.worker,
      'border-color': COLORS.container.worker,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // Gateway nodes - Blue for API gateways/load balancers
  {
    selector: 'node[type="gateway"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': COLORS.container.gateway,
      'border-color': COLORS.container.gateway,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // Message broker nodes - Purple for event buses
  {
    selector: 'node[type="message-broker"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': COLORS.container.messageBroker,
      'border-color': COLORS.container.messageBroker,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // Datastore nodes - Yellow cylinder for databases
  {
    selector: 'node[type="datastore"]',
    style: {
      'shape': 'barrel', // Cylinder shape for databases
      'background-color': COLORS.container.datastore,
      'border-color': COLORS.container.datastore,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // Cache nodes - Red for in-memory caches
  {
    selector: 'node[type="cache"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': COLORS.container.cache,
      'border-color': COLORS.container.cache,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // Object store nodes - Gray for blob storage
  {
    selector: 'node[type="object-store"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': COLORS.container.objectStore,
      'border-color': COLORS.container.objectStore,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // =============================================================================
  // COMPONENT LAYER NODE STYLES - DDD-Inspired Meaningful Components
  // =============================================================================
  
  // Bounded context nodes - Large compound nodes with dashed border
  {
    selector: 'node[type="bounded-context"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': PALETTE.blue.light,
      'background-opacity': OPACITY_SEMANTIC.directoryBackground,
      'border-color': PALETTE.blue.DEFAULT,
      'border-width': BORDERS.directory,
      'border-style': 'dashed',
      'font-size': TYPOGRAPHY.node.directory.fontSize,
      'font-weight': TYPOGRAPHY.node.directory.fontWeight,
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.directory.textMaxWidth,
      'min-width': `${NODE_SIZES.directory.minWidth}px`,
      'min-height': `${NODE_SIZES.directory.minHeight}px`,
      'width': `${NODE_SIZES.directory.width}px`,
      'height': `${NODE_SIZES.directory.height}px`,
      'padding': getNodePadding('directory'),
      'text-valign': 'top',
      'text-margin-y': getTextMargin('directory'),
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeDirectory,
      'compound-sizing-wrt-labels': 'exclude',
    },
  },
  
  // Use-case nodes - Medium size, teal color
  {
    selector: 'node[type="use-case"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': PALETTE.teal.DEFAULT,
      'border-color': PALETTE.teal.dark,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // Domain model nodes - Medium size, indigo color
  {
    selector: 'node[type="domain-model"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': PALETTE.indigo.DEFAULT,
      'border-color': PALETTE.indigo.dark,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // Adapter nodes - Smaller, pink accent
  {
    selector: 'node[type="adapter"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': PALETTE.pink.light,
      'border-color': PALETTE.pink.DEFAULT,
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
  
  // Repository nodes - Medium, yellow (data-focused)
  {
    selector: 'node[type="repository"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': PALETTE.yellow.light,
      'border-color': PALETTE.yellow.DEFAULT,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // Policy nodes - Small, orange (rule-focused)
  {
    selector: 'node[type="policy"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': PALETTE.orange.light,
      'border-color': PALETTE.orange.DEFAULT,
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
  
  // Subsystem nodes - Large compound nodes (escape hatch)
  {
    selector: 'node[type="subsystem"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': PALETTE.neutral[300],
      'background-opacity': OPACITY_SEMANTIC.directoryBackground,
      'border-color': PALETTE.neutral[600],
      'border-width': BORDERS.directory,
      'border-style': 'dashed',
      'font-size': TYPOGRAPHY.node.directory.fontSize,
      'font-weight': TYPOGRAPHY.node.directory.fontWeight,
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.directory.textMaxWidth,
      'min-width': `${NODE_SIZES.directory.minWidth}px`,
      'min-height': `${NODE_SIZES.directory.minHeight}px`,
      'width': `${NODE_SIZES.directory.width}px`,
      'height': `${NODE_SIZES.directory.height}px`,
      'padding': getNodePadding('directory'),
      'text-valign': 'top',
      'text-margin-y': getTextMargin('directory'),
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeDirectory,
      'compound-sizing-wrt-labels': 'exclude',
    },
  },
  
  // Shared kernel nodes - Medium, violet (shared library style)
  {
    selector: 'node[type="shared-kernel"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': PALETTE.violet.light,
      'border-color': PALETTE.violet.DEFAULT,
      'border-width': BORDERS.medium,
      'border-style': 'dotted',
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // Namespace nodes - Cyan for namespaces
  {
    selector: 'node[type="namespace"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': COLORS.component.namespace,
      'border-color': COLORS.component.namespace,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
    },
  },
  
  // Plugin nodes - Pink for plugins
  {
    selector: 'node[type="plugin"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': COLORS.component.plugin,
      'border-color': COLORS.component.plugin,
      'border-width': BORDERS.medium,
      'font-size': TYPOGRAPHY.node.class.fontSize,
      'font-weight': '600',
      'text-wrap': 'ellipsis',
      'text-max-width': TYPOGRAPHY.node.class.textMaxWidth,
      'min-width': '120px',
      'min-height': '80px',
      'width': '120px',
      'height': '80px',
      'padding': '20px',
      'text-valign': 'center',
      'color': COLORS.text.primary,
      'z-index': Z_INDEX.nodeClass,
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
  
  // Base edge style - Straight lines for clarity
  {
    selector: 'edge',
    style: {
      'width': BORDERS.normal,
      'line-color': COLORS.edges.default,
      'target-arrow-color': COLORS.edges.default,
      'target-arrow-shape': 'triangle',
      'curve-style': 'straight', // Changed from 'taxi' to 'straight'
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
      'curve-style': 'straight', // Changed from 'taxi' to 'straight'
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
      'curve-style': 'straight', // Changed from 'bezier' to 'straight'
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
  
  // =============================================================================
  // WORKFLOW LAYER EDGE STYLES - Feature Dependencies & User Journeys
  // =============================================================================
  
  // Depends-on-feature edges - Rose for feature dependencies (replaces "requires")
  {
    selector: 'edge[edgeType="depends-on-feature"]',
    style: {
      'line-color': COLORS.edges.dependsOnFeature,
      'target-arrow-color': COLORS.edges.dependsOnFeature,
      'width': BORDERS.medium,
      'line-style': 'dashed',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Part-of edges - Purple for composition (replaces "composed-of")
  {
    selector: 'edge[edgeType="part-of"]',
    style: {
      'line-color': COLORS.edges.partOf,
      'target-arrow-color': COLORS.edges.partOf,
      'width': BORDERS.normal,
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Primary-flow edges - Emerald for main journey steps
  {
    selector: 'edge[edgeType="primary-flow"]',
    style: {
      'line-color': COLORS.edges.primaryFlow,
      'target-arrow-color': COLORS.edges.primaryFlow,
      'width': BORDERS.thick,
      'line-style': 'solid',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Alternate-flow edges - Amber for variant/error paths
  {
    selector: 'edge[edgeType="alternate-flow"]',
    style: {
      'line-color': COLORS.edges.alternateFlow,
      'target-arrow-color': COLORS.edges.alternateFlow,
      'width': BORDERS.normal,
      'line-style': 'dotted',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Triggers edges - Cyan for event triggers
  {
    selector: 'edge[edgeType="triggers"]',
    style: {
      'line-color': COLORS.edges.triggers,
      'target-arrow-color': COLORS.edges.triggers,
      'width': BORDERS.thin,
      'opacity': OPACITY.dimmed,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // =============================================================================
  // CONTEXT LAYER EDGE STYLES - Boundary Interactions
  // =============================================================================
  
  // Uses edges - Teal for actor uses system (human interaction)
  {
    selector: 'edge[edgeType="uses"]',
    style: {
      'line-color': COLORS.edges.uses,
      'target-arrow-color': COLORS.edges.uses,
      'width': BORDERS.medium,
      'line-style': 'solid',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Integrates With edges - Rose for system integration (bidirectional)
  {
    selector: 'edge[edgeType="integrates-with"]',
    style: {
      'line-color': COLORS.edges.integratesWith,
      'target-arrow-color': COLORS.edges.integratesWith,
      'width': BORDERS.medium,
      'line-style': 'solid',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'diamond',  // Diamond for bidirectional
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Authenticates With edges - Orange for authentication relationships
  {
    selector: 'edge[edgeType="authenticates-with"]',
    style: {
      'line-color': COLORS.edges.authenticatesWith,
      'target-arrow-color': COLORS.edges.authenticatesWith,
      'width': BORDERS.medium,
      'line-style': 'solid',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Reads From edges - Blue for data reading from external source
  {
    selector: 'edge[edgeType="reads-from"]',
    style: {
      'line-color': COLORS.edges.readsFrom,
      'target-arrow-color': COLORS.edges.readsFrom,
      'width': BORDERS.medium,
      'line-style': 'solid',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Writes To edges - Indigo for data writing to external target
  {
    selector: 'edge[edgeType="writes-to"]',
    style: {
      'line-color': COLORS.edges.writesTo,
      'target-arrow-color': COLORS.edges.writesTo,
      'width': BORDERS.medium,
      'line-style': 'solid',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Sends Event To edges - Purple for event publishing to external system
  {
    selector: 'edge[edgeType="sends-event-to"]',
    style: {
      'line-color': COLORS.edges.sendsEventTo,
      'target-arrow-color': COLORS.edges.sendsEventTo,
      'width': BORDERS.medium,
      'line-style': 'dashed',  // Dashed for event/async semantics
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Receives Event From edges - Violet for event subscription from external system
  {
    selector: 'edge[edgeType="receives-event-from"]',
    style: {
      'line-color': COLORS.edges.receivesEventFrom,
      'target-arrow-color': COLORS.edges.receivesEventFrom,
      'width': BORDERS.medium,
      'line-style': 'dashed',  // Dashed for event/async semantics
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // =============================================================================
  // CONTAINER LAYER EDGE STYLES - Runtime Semantics
  // =============================================================================
  
  // HTTP Request edges - Blue solid for REST/HTTP calls (sync)
  {
    selector: 'edge[edgeType="http-request"]',
    style: {
      'line-color': COLORS.edges.httpRequest,
      'target-arrow-color': COLORS.edges.httpRequest,
      'width': BORDERS.medium,
      'line-style': 'solid',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // RPC Call edges - Cyan solid for gRPC/RPC calls (sync)
  {
    selector: 'edge[edgeType="rpc-call"]',
    style: {
      'line-color': COLORS.edges.rpcCall,
      'target-arrow-color': COLORS.edges.rpcCall,
      'width': BORDERS.medium,
      'line-style': 'solid',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // DB Query edges - Yellow solid for database queries (sync)
  {
    selector: 'edge[edgeType="db-query"]',
    style: {
      'line-color': COLORS.edges.dbQuery,
      'target-arrow-color': COLORS.edges.dbQuery,
      'width': BORDERS.medium,
      'line-style': 'solid',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Cache Read edges - Light red solid for cache lookups (sync)
  {
    selector: 'edge[edgeType="cache-read"]',
    style: {
      'line-color': COLORS.edges.cacheRead,
      'target-arrow-color': COLORS.edges.cacheRead,
      'width': BORDERS.thin,
      'line-style': 'solid',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Cache Write edges - Red solid for cache updates (sync)
  {
    selector: 'edge[edgeType="cache-write"]',
    style: {
      'line-color': COLORS.edges.cacheWrite,
      'target-arrow-color': COLORS.edges.cacheWrite,
      'width': BORDERS.thin,
      'line-style': 'solid',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Publish Event edges - Purple dashed for event publishing (async)
  {
    selector: 'edge[edgeType="publish-event"]',
    style: {
      'line-color': COLORS.edges.publishEvent,
      'target-arrow-color': COLORS.edges.publishEvent,
      'width': BORDERS.medium,
      'line-style': 'dashed',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Consume Event edges - Light purple dashed for event consumption (async)
  {
    selector: 'edge[edgeType="consume-event"]',
    style: {
      'line-color': COLORS.edges.consumeEvent,
      'target-arrow-color': COLORS.edges.consumeEvent,
      'width': BORDERS.medium,
      'line-style': 'dashed',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Enqueue Job edges - Orange dashed for job queuing (async)
  {
    selector: 'edge[edgeType="enqueue-job"]',
    style: {
      'line-color': COLORS.edges.enqueueJob,
      'target-arrow-color': COLORS.edges.enqueueJob,
      'width': BORDERS.medium,
      'line-style': 'dashed',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Replicates To edges - Green dotted for data replication
  {
    selector: 'edge[edgeType="replicates-to"]',
    style: {
      'line-color': COLORS.edges.replicatesTo,
      'target-arrow-color': COLORS.edges.replicatesTo,
      'width': BORDERS.thin,
      'line-style': 'dotted',
      'opacity': OPACITY.dimmed,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Syncs With edges - Teal dotted for bidirectional sync
  {
    selector: 'edge[edgeType="syncs-with"]',
    style: {
      'line-color': COLORS.edges.syncsWith,
      'target-arrow-color': COLORS.edges.syncsWith,
      'width': BORDERS.thin,
      'line-style': 'dotted',
      'opacity': OPACITY.dimmed,
      'target-arrow-shape': 'diamond',  // Diamond for bidirectional
      'z-index': Z_INDEX.edge,
    },
  },
  
  // =============================================================================
  // COMPONENT LAYER EDGE STYLES - DDD-Inspired Domain Relationships
  // =============================================================================
  
  // Owns edges - Blue, thick, dashed (bounded-context owns use-cases/domain-models)
  {
    selector: 'edge[edgeType="owns"]',
    style: {
      'line-color': PALETTE.blue.DEFAULT,
      'target-arrow-color': PALETTE.blue.DEFAULT,
      'width': BORDERS.thick,
      'line-style': 'dashed',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Invokes edges - Teal, medium, solid (use-case invokes domain-model/policy)
  {
    selector: 'edge[edgeType="invokes"]',
    style: {
      'line-color': PALETTE.teal.DEFAULT,
      'target-arrow-color': PALETTE.teal.DEFAULT,
      'width': BORDERS.medium,
      'line-style': 'solid',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Persists Via edges - Yellow, medium, solid (use-case persists via repository)
  {
    selector: 'edge[edgeType="persists-via"]',
    style: {
      'line-color': PALETTE.yellow.DEFAULT,
      'target-arrow-color': PALETTE.yellow.DEFAULT,
      'width': BORDERS.medium,
      'line-style': 'solid',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Implemented By edges - Pink, medium, dashed (repository implemented by adapter)
  {
    selector: 'edge[edgeType="implemented-by"]',
    style: {
      'line-color': PALETTE.pink.DEFAULT,
      'target-arrow-color': PALETTE.pink.DEFAULT,
      'width': BORDERS.medium,
      'line-style': 'dashed',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Integrates Via edges - Rose, medium, dotted (use-case integrates via adapter)
  {
    selector: 'edge[edgeType="integrates-via"]',
    style: {
      'line-color': PALETTE.rose.DEFAULT,
      'target-arrow-color': PALETTE.rose.DEFAULT,
      'width': BORDERS.medium,
      'line-style': 'dotted',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // =============================================================================
  // LEGACY WORKFLOW EDGES (Deprecated - kept for backward compatibility)
  // =============================================================================
  
  // Enables edges - Green arrows (DEPRECATED: use primary-flow or depends-on-feature)
  {
    selector: 'edge[edgeType="enables"]',
    style: {
      'line-color': PALETTE.emerald.DEFAULT,
      'target-arrow-color': PALETTE.emerald.DEFAULT,
      'width': BORDERS.medium,
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Requires edges - Red arrows (DEPRECATED: use depends-on-feature)
  {
    selector: 'edge[edgeType="requires"]',
    style: {
      'line-color': PALETTE.rose.DEFAULT,
      'target-arrow-color': PALETTE.rose.DEFAULT,
      'width': BORDERS.medium,
      'line-style': 'dashed',
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
    },
  },
  
  // Composed-of edges - Purple containment lines (DEPRECATED: use part-of)
  {
    selector: 'edge[edgeType="composed-of"]',
    style: {
      'line-color': PALETTE.purple.DEFAULT,
      'target-arrow-color': PALETTE.purple.DEFAULT,
      'width': BORDERS.normal,
      'opacity': OPACITY_SEMANTIC.edge,
      'target-arrow-shape': 'triangle',
      'z-index': Z_INDEX.edge,
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
      'curve-style': 'straight', // Changed from 'bezier' to 'straight'
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

