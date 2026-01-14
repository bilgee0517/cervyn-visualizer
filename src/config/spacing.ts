/**
 * ============================================================================
 * CENTRALIZED SPACING & LAYOUT SYSTEM
 * ============================================================================
 * 
 * Single source of truth for all spacing, sizing, and layout values.
 * 
 * Usage:
 *   import { SPACING, NODE_SIZES, BORDERS } from '@/config/spacing';
 *   const padding = SPACING.lg;
 *   const nodeSize = NODE_SIZES.file;
 * 
 * Features:
 *   - Consistent spacing scale (4px base)
 *   - Semantic spacing tokens
 *   - Node size definitions
 *   - Border width scale
 *   - Layout constants
 * ============================================================================
 */

// ============================================================================
// BASE SPACING SCALE (4px increments)
// ============================================================================

/**
 * Base spacing scale - use these for padding, margin, gaps
 */
export const SPACING = {
    none: '0',
    xxs: '2px',      // Micro spacing
    xs: '4px',       // Extra small
    sm: '8px',       // Small
    md: '12px',      // Medium
    base: '16px',    // Base/default
    lg: '20px',      // Large
    xl: '24px',      // Extra large
    xxl: '32px',     // 2X large
    xxxl: '40px',    // 3X large
    huge: '48px',    // Huge
    massive: '64px', // Massive
    giant: '80px',   // Giant
    colossal: '100px', // Colossal
} as const;

/**
 * Semantic spacing tokens for specific use cases
 */
export const SPACING_SEMANTIC = {
    // Component padding
    componentPadding: {
        tight: SPACING.xs,
        default: SPACING.md,
        relaxed: SPACING.lg,
        loose: SPACING.xl,
    },
    
    // Text margins
    textMargin: {
        directory: '30px',
        file: '20px',
        default: '10px',
    },
    
    // Node padding (internal spacing)
    nodePadding: {
        directory: '100px',
        file: '50px',
        class: '25px',
        function: '15px',
        default: '15px',
    },
    
    // Layout spacing
    layout: {
        minNodeSpacing: '80px',
        defaultOffset: '100px',
        defaultPadding: '100px',
        toolbarHeight: '60px',
    },
    
    // Text outline and background
    textSpacing: {
        outlineWidth: '4px',
        outlineWidthLarge: '5px',
        outlineWidthSmall: '3px',
        backgroundPadding: '3px',
        backgroundPaddingLarge: '5px',
        backgroundPaddingSmall: '2px',
    },
    
    // Overlay and borders
    overlayPadding: {
        small: '4px',
        default: '6px',
        large: '8px',
    },
} as const;

// ============================================================================
// NODE SIZES
// ============================================================================

/**
 * Fixed node sizes by type
 */
export const NODE_SIZES = {
    directory: {
        minWidth: 700,
        minHeight: 500,
        width: 700,
        height: 500,
    },
    file: {
        minWidth: 180,
        minHeight: 120,
        width: 180,
        height: 120,
    },
    class: {
        minWidth: 100,
        minHeight: 70,
        width: 100,
        height: 70,
    },
    function: {
        minWidth: 75,
        minHeight: 45,
        width: 75,
        height: 45,
    },
    default: {
        minWidth: 80,
        minHeight: 50,
        width: 80,
        height: 50,
    },
} as const;

/**
 * Node size scale for general sizing
 */
export const SIZE_SCALE = {
    xs: 40,
    sm: 60,
    md: 80,
    base: 100,
    lg: 120,
    xl: 150,
    xxl: 200,
    xxxl: 300,
    huge: 500,
    massive: 700,
} as const;

// ============================================================================
// BORDER WIDTHS
// ============================================================================

/**
 * Border width scale
 */
export const BORDERS = {
    none: 0,
    thin: 1.5,
    normal: 2,
    medium: 2.5,
    thick: 3,
    extraThick: 4,
    directory: 4,  // Special case for directories
} as const;

/**
 * Semantic border tokens
 */
export const BORDER_SEMANTIC = {
    default: BORDERS.normal,
    hover: BORDERS.medium,
    selected: BORDERS.thick,
    compound: BORDERS.thick,
    directory: BORDERS.directory,
} as const;

// ============================================================================
// OPACITY VALUES
// ============================================================================

/**
 * Opacity scale
 */
export const OPACITY = {
    invisible: 0,
    verySubtle: 0.1,
    subtle: 0.3,
    dimmed: 0.5,
    medium: 0.7,
    strong: 0.85,
    veryStrong: 0.95,
    solid: 1,
} as const;

/**
 * Semantic opacity tokens
 */
export const OPACITY_SEMANTIC = {
    containerBackground: 0.08,        // Very subtle for compound nodes (was 0.2)
    directoryBackground: 0.08,        // Very subtle for directories (was 0.2)
    fileBackground: OPACITY.veryStrong,
    edge: OPACITY.medium,
    hover: OPACITY.solid,
    ghost: OPACITY.dimmed,
} as const;

// ============================================================================
// Z-INDEX LAYERS
// ============================================================================

/**
 * Z-index layering system (prevents stacking conflicts)
 */
export const Z_INDEX = {
    // Background layers
    base: 0,
    background: 1,
    
    // Edge layers
    edge: 1,
    edgeImports: 3,
    edgeDependency: 4,
    edgeCalls: 2,
    
    // Node layers
    nodeDirectory: 1,
    nodeFile: 5,
    nodeClass: 7,
    nodeFunction: 9,
    nodeEntry: 10,
    
    // Interaction states
    hover: 100,
    focused: 998,
    selected: 999,
    
    // UI overlays
    tooltip: 1000,
    dropdown: 1500,
    modal: 2000,
    notification: 3000,
} as const;

// ============================================================================
// LAYOUT CONFIGURATION
// ============================================================================

/**
 * Layout and positioning constants
 */
export const LAYOUT = {
    // Zoom constraints
    minZoom: 0.001,
    maxZoom: 10,
    wheelSensitivity: 0.2,
    
    // Animation
    animationDuration: 500,
    animationDelay: 600,
    transitionDuration: 200,
    
    // Padding and spacing
    defaultPadding: 100,
    minNodeSpacing: 80,
    defaultOffset: 100,
    
    // Fit behavior
    fitPadding: 50,
} as const;

// ============================================================================
// RADIUS/ROUNDING
// ============================================================================

/**
 * Border radius scale
 */
export const RADIUS = {
    none: '0',
    sm: '2px',
    base: '4px',
    md: '6px',
    lg: '8px',
    xl: '12px',
    xxl: '16px',
    round: '50%',
    roundRectangle: '8px', // For Cytoscape
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get node size by type
 */
export function getNodeSize(nodeType: string): { minWidth: number; minHeight: number; width: number; height: number } {
    const type = nodeType?.toLowerCase() as keyof typeof NODE_SIZES;
    return NODE_SIZES[type] || NODE_SIZES.default;
}

/**
 * Get node padding by type
 */
export function getNodePadding(nodeType: string): string {
    const type = nodeType?.toLowerCase() as keyof typeof SPACING_SEMANTIC.nodePadding;
    return SPACING_SEMANTIC.nodePadding[type] || SPACING_SEMANTIC.nodePadding.default;
}

/**
 * Get text margin by type
 */
export function getTextMargin(nodeType: string): string {
    const type = nodeType?.toLowerCase() as keyof typeof SPACING_SEMANTIC.textMargin;
    return SPACING_SEMANTIC.textMargin[type] || SPACING_SEMANTIC.textMargin.default;
}

/**
 * Convert spacing token to number (removes 'px')
 */
export function getSpacingValue(spacing: string): number {
    return parseInt(spacing.replace('px', ''), 10);
}

/**
 * Scale spacing by multiplier
 */
export function scaleSpacing(baseSpacing: string, multiplier: number): string {
    const value = getSpacingValue(baseSpacing);
    return `${Math.round(value * multiplier)}px`;
}

/**
 * Get responsive padding based on container size
 */
export function getResponsivePadding(containerSize: number): string {
    if (containerSize < 100) return SPACING.xs;
    if (containerSize < 200) return SPACING.sm;
    if (containerSize < 400) return SPACING.md;
    if (containerSize < 600) return SPACING.lg;
    return SPACING.xl;
}

/**
 * Calculate aspect ratio
 */
export function getAspectRatio(width: number, height: number): number {
    return width / height;
}

/**
 * Get border width by semantic token
 */
export function getBorderWidth(token: keyof typeof BORDER_SEMANTIC): number {
    return BORDER_SEMANTIC[token];
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    SPACING,
    SPACING_SEMANTIC,
    NODE_SIZES,
    SIZE_SCALE,
    BORDERS,
    BORDER_SEMANTIC,
    OPACITY,
    OPACITY_SEMANTIC,
    Z_INDEX,
    LAYOUT,
    RADIUS,
};

