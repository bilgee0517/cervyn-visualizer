/**
 * ============================================================================
 * LAYOUT CONFIGURATION - fCoSE (SIMPLIFIED)
 * ============================================================================
 * 
 * Focused exclusively on fCoSE (Fast Compound Spring Embedder) layout.
 * This is the optimal layout for hierarchical graphs with guaranteed no overlaps.
 * 
 * Future layouts can be added here as needed.
 * ============================================================================
 */

import { WEBVIEW_CONFIG } from './constants';

export interface LayoutConfig {
  name: string;
  displayName: string;
  description: string;
  animate?: boolean;
  animationDuration?: number;
  fit?: boolean;
  padding?: number;
  spacingFactor?: number;
  avoidOverlap?: boolean;
  nodeDimensionsIncludeLabels?: boolean;
  [key: string]: any;
}

const baseLayoutConfig = {
  animate: true,
  animationDuration: WEBVIEW_CONFIG.LAYOUT_ANIMATION_DURATION,
  fit: true,
  padding: WEBVIEW_CONFIG.DEFAULT_PADDING,
  spacingFactor: 2.0,
  avoidOverlap: true,
  nodeDimensionsIncludeLabels: true,
} as const;

/**
 * Dagre Layout Configuration
 * 
 * Hierarchical layout optimized for workflow/feature dependencies.
 * Uses top-to-bottom flow to show feature relationships clearly.
 */
const dagreConfig = (visibleNodeCount = 10): LayoutConfig => ({
  name: 'dagre',
  displayName: '📊 Dagre',
  description: 'Hierarchical layout for feature dependencies',
  rankDir: 'TB',        // Top to bottom
  nodeSep: 60,          // Horizontal spacing between nodes (reduced from 120)
  rankSep: 80,          // Vertical spacing between ranks (reduced from 150)
  fit: true,
  padding: 50,
  animate: true,
  animationDuration: 1000,
  nodeDimensionsIncludeLabels: true,
  ranker: 'network-simplex', // Optimal rank assignment
  edgeSep: 20,          // Spacing between edges (reduced from 30)
  acyclicer: 'greedy',  // Handle cycles
});

/**
 * fCoSE Layout Configuration
 * 
 * Fast Compound Spring Embedder - research-based algorithm specifically
 * designed for hierarchical graphs with guaranteed no overlaps.
 */
export const LAYOUT_CONFIGS: Record<string, (visibleNodeCount?: number) => LayoutConfig> = {
  dagre: dagreConfig,
  fcose: (visibleNodeCount = 10) => ({
    ...baseLayoutConfig,
    name: 'fcose',
    displayName: '🚀 fCoSE',
    description: 'Fast compound layout with guaranteed no overlaps',
    // Quality: 'draft', 'default', or 'proof'
    quality: 'default', // 'default' for good quality with reasonable speed
    randomize: true, // Start with random positions
    animate: true,
    animationDuration: 1000,
    fit: true,
    padding: 50,
    
    // CRITICAL: Node dimensions must include labels AND computed styles (mapData)
    // fCoSE will query node.boundingBox() to get actual rendered dimensions
    nodeDimensionsIncludeLabels: true,
    
    // FALSE = fCoSE respects individual node sizes (critical for our sizeMultiplier system)
    uniformNodeDimensions: false,
    
    // Pack disconnected components
    packComponents: false, // We'll handle this ourselves
    
    /* Spectral layout options */
    samplingType: true, // Greedy sampling
    sampleSize: 25,
    nodeSeparation: 100, // INCREASED from 75 - more space between nodes including children
    piTol: 0.0000001,
    
    /* Incremental layout (force-directed) options */
    // These functions receive the node/edge, allowing dynamic values
    nodeRepulsion: (node: any) => {
      // Higher repulsion for larger nodes (compound nodes with high sizeMultiplier)
      const isCompound = node.data('isCompound');
      const sizeMultiplier = node.data('sizeMultiplier') || 1.0;
      
      if (isCompound) {
        // Compound nodes need much stronger repulsion
        return 4500 * Math.max(sizeMultiplier, 2.0);
      }
      return 4500;
    },
    
    idealEdgeLength: (edge: any) => {
      // Longer edges for larger nodes
      const source = edge.source();
      const target = edge.target();
      const sourceSize = source.data('sizeMultiplier') || 1.0;
      const targetSize = target.data('sizeMultiplier') || 1.0;
      const avgSize = (sourceSize + targetSize) / 2;
      
      return 50 * Math.max(avgSize, 1.0);
    },
    
    edgeElasticity: () => 0.45, // Edge elasticity
    
    // CRITICAL: Nesting factor for compound nodes
    // Higher value = stronger enforcement of parent-child containment
    // 0.1 is TOO LOW, children escape parents
    nestingFactor: 1.2, // INCREASED from 0.1 to 1.2 for proper containment
    
    numIter: 3500, // Increased iterations for better convergence with compound nodes
    tile: true, // Enable tiling for disconnected components
    tilingPaddingVertical: 20, // Increased for compound node children
    tilingPaddingHorizontal: 20, // Increased for compound node children
    
    /* Gravity options */
    gravity: 0.25,
    gravityRange: 3.8,
    
    // Compound-specific gravity - pulls children toward parent center
    gravityCompound: 1.5, // INCREASED from 1.0 to keep children centered in parents
    gravityRangeCompound: 2.5, // INCREASED from 1.5 for stronger compound containment
    
    /* Initial energy */
    initialEnergyOnIncremental: 0.3,
    
    /* Constraints - can be customized */
    fixedNodeConstraint: undefined,
    alignmentConstraint: undefined,
    relativePlacementConstraint: undefined,
  }),
};

/**
 * Get layout configuration based on layer
 * - All layers: fCoSE (compound-aware force-directed)
 */
export function getLayoutConfig(layoutName: string = 'fcose', visibleNodeCount?: number, layer?: string): LayoutConfig {
  // Use fCoSE for all layers (supports compound nodes properly)
  return LAYOUT_CONFIGS[layoutName]?.(visibleNodeCount) || LAYOUT_CONFIGS.fcose(visibleNodeCount);
}

/**
 * Get list of available layouts for UI
 */
export function getAvailableLayouts(): Array<{ name: string; displayName: string; description: string }> {
  const fcoseConfig = LAYOUT_CONFIGS.fcose();
  const dagreConfig = LAYOUT_CONFIGS.dagre();
  return [
    {
      name: 'fcose',
      displayName: fcoseConfig.displayName,
      description: fcoseConfig.description,
    },
    {
      name: 'dagre',
      displayName: dagreConfig.displayName,
      description: dagreConfig.description,
    }
  ];
}

/**
 * Check if a layout name is valid
 */
export function isValidLayout(layoutName: string): boolean {
  return layoutName === 'fcose' || layoutName === 'dagre';
}

/**
 * Get the default layout name (always fCoSE)
 */
export function getDefaultLayoutName(): string {
  return 'fcose';
}

