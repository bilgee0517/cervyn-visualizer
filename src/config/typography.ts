/**
 * ============================================================================
 * CENTRALIZED TYPOGRAPHY SYSTEM
 * ============================================================================
 * 
 * Single source of truth for all typography across the application.
 * 
 * Usage:
 *   import { TYPOGRAPHY, getFontStyle } from '@/config/typography';
 *   const headingStyle = TYPOGRAPHY.heading;
 *   const fontSize = TYPOGRAPHY.fontSize.lg;
 * 
 * Features:
 *   - Consistent font sizing scale
 *   - Semantic typography tokens
 *   - Type-safe access
 *   - Responsive font scaling utilities
 * ============================================================================
 */

// ============================================================================
// BASE TYPOGRAPHY SCALE
// ============================================================================

/**
 * Font size scale (based on 4px increments with common UI sizes)
 */
export const FONT_SIZE = {
    xxs: '9px',      // Tiny labels
    xs: '10px',      // Small labels, badges
    sm: '11px',      // Small text, captions
    base: '12px',    // Default text size
    md: '13px',      // Slightly larger text
    lg: '14px',      // Large text, subheadings
    xl: '16px',      // Medium headings
    xxl: '18px',     // Large headings
    xxxl: '20px',    // Very large headings
    huge: '24px',    // Hero text, directory labels
    massive: '32px', // Extra large display text
} as const;

/**
 * Font weight scale
 */
export const FONT_WEIGHT = {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
} as const;

/**
 * Line height scale (for better readability)
 */
export const LINE_HEIGHT = {
    tight: 1.2,
    snug: 1.4,
    normal: 1.5,
    relaxed: 1.6,
    loose: 1.8,
} as const;

/**
 * Letter spacing scale
 */
export const LETTER_SPACING = {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
} as const;

/**
 * Text max width for readability
 */
export const TEXT_MAX_WIDTH = {
    xs: '80px',
    sm: '100px',
    md: '120px',
    base: '180px',
    lg: '220px',
    xl: '280px',
    xxl: '350px',
    xxxl: '400px',
    full: '100%',
} as const;

// ============================================================================
// SEMANTIC TYPOGRAPHY TOKENS
// ============================================================================

/**
 * Pre-configured typography styles for common use cases
 */
export const TYPOGRAPHY = {
    // Headings
    heading: {
        huge: {
            fontSize: FONT_SIZE.huge,
            fontWeight: FONT_WEIGHT.bold,
            lineHeight: LINE_HEIGHT.tight,
        },
        large: {
            fontSize: FONT_SIZE.xxxl,
            fontWeight: FONT_WEIGHT.bold,
            lineHeight: LINE_HEIGHT.tight,
        },
        medium: {
            fontSize: FONT_SIZE.xl,
            fontWeight: FONT_WEIGHT.semibold,
            lineHeight: LINE_HEIGHT.snug,
        },
        small: {
            fontSize: FONT_SIZE.lg,
            fontWeight: FONT_WEIGHT.semibold,
            lineHeight: LINE_HEIGHT.normal,
        },
    },
    
    // Body text
    body: {
        large: {
            fontSize: FONT_SIZE.lg,
            fontWeight: FONT_WEIGHT.normal,
            lineHeight: LINE_HEIGHT.normal,
        },
        default: {
            fontSize: FONT_SIZE.base,
            fontWeight: FONT_WEIGHT.normal,
            lineHeight: LINE_HEIGHT.normal,
        },
        small: {
            fontSize: FONT_SIZE.sm,
            fontWeight: FONT_WEIGHT.normal,
            lineHeight: LINE_HEIGHT.normal,
        },
    },
    
    // Labels
    label: {
        large: {
            fontSize: FONT_SIZE.md,
            fontWeight: FONT_WEIGHT.semibold,
            lineHeight: LINE_HEIGHT.tight,
        },
        default: {
            fontSize: FONT_SIZE.base,
            fontWeight: FONT_WEIGHT.medium,
            lineHeight: LINE_HEIGHT.tight,
        },
        small: {
            fontSize: FONT_SIZE.sm,
            fontWeight: FONT_WEIGHT.medium,
            lineHeight: LINE_HEIGHT.tight,
        },
    },
    
    // Captions/Helper text
    caption: {
        default: {
            fontSize: FONT_SIZE.xs,
            fontWeight: FONT_WEIGHT.normal,
            lineHeight: LINE_HEIGHT.snug,
        },
        tiny: {
            fontSize: FONT_SIZE.xxs,
            fontWeight: FONT_WEIGHT.normal,
            lineHeight: LINE_HEIGHT.snug,
        },
    },
    
    // Node-specific typography (graph nodes)
    node: {
        directory: {
            fontSize: FONT_SIZE.huge,
            fontWeight: FONT_WEIGHT.bold,
            textMaxWidth: TEXT_MAX_WIDTH.xxxl,
        },
        file: {
            fontSize: FONT_SIZE.lg,
            fontWeight: FONT_WEIGHT.bold,
            textMaxWidth: TEXT_MAX_WIDTH.base,
        },
        class: {
            fontSize: FONT_SIZE.base,
            fontWeight: FONT_WEIGHT.bold,
            textMaxWidth: TEXT_MAX_WIDTH.md,
        },
        function: {
            fontSize: FONT_SIZE.sm,
            fontWeight: FONT_WEIGHT.semibold,
            textMaxWidth: TEXT_MAX_WIDTH.sm,
        },
        default: {
            fontSize: FONT_SIZE.base,
            fontWeight: FONT_WEIGHT.semibold,
            textMaxWidth: TEXT_MAX_WIDTH.base,
        },
        entryPoint: {
            fontSize: FONT_SIZE.lg,
            fontWeight: FONT_WEIGHT.bold,
            textMaxWidth: TEXT_MAX_WIDTH.lg,
        },
    },
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get complete font style object for a specific typography token
 */
export function getFontStyle(category: keyof typeof TYPOGRAPHY, variant: string): any {
    const categoryStyles = TYPOGRAPHY[category] as any;
    return categoryStyles[variant] || categoryStyles.default || TYPOGRAPHY.body.default;
}

/**
 * Get node typography based on node type
 */
export function getNodeTypography(nodeType: string): any {
    const type = nodeType?.toLowerCase() as keyof typeof TYPOGRAPHY.node;
    return TYPOGRAPHY.node[type] || TYPOGRAPHY.node.default;
}

/**
 * Create CSS font shorthand
 * Example: getFontShorthand('14px', 600, '1.5') => '600 14px/1.5'
 */
export function getFontShorthand(
    size: string = FONT_SIZE.base,
    weight: number | string = FONT_WEIGHT.normal,
    lineHeight: number | string = LINE_HEIGHT.normal
): string {
    return `${weight} ${size}/${lineHeight}`;
}

/**
 * Convert font size to number (removes 'px')
 */
export function getFontSizeValue(fontSize: string): number {
    return parseInt(fontSize.replace('px', ''), 10);
}

/**
 * Scale font size by a multiplier
 */
export function scaleFontSize(baseFontSize: string, multiplier: number): string {
    const value = getFontSizeValue(baseFontSize);
    return `${Math.round(value * multiplier)}px`;
}

/**
 * Get responsive font size based on container size
 */
export function getResponsiveFontSize(containerWidth: number): string {
    if (containerWidth < 100) return FONT_SIZE.xs;
    if (containerWidth < 150) return FONT_SIZE.sm;
    if (containerWidth < 200) return FONT_SIZE.base;
    if (containerWidth < 300) return FONT_SIZE.lg;
    if (containerWidth < 500) return FONT_SIZE.xl;
    return FONT_SIZE.xxl;
}

// ============================================================================
// TEXT STYLE PRESETS (for Cytoscape)
// ============================================================================

/**
 * Common text styling for graph nodes
 */
export const TEXT_STYLE = {

    // Text background for enhanced readability
    // background: {
    //     color: 'rgba(255, 255, 255, 0.85)',
    //     opacity: 1,
    //     padding: '3px',
    //     paddingSmall: '2px',
    //     paddingLarge: '5px',
    //     shape: 'round-rectangle',
    // },
    
    // Text alignment presets
    align: {
        center: {
            valign: 'center',
            halign: 'center',
        },
        top: {
            valign: 'top',
            halign: 'center',
        },
        bottom: {
            valign: 'bottom',
            halign: 'center',
        },
    },
    
    // Text wrapping
    wrap: {
        ellipsis: 'ellipsis',
        wrap: 'wrap',
        none: 'none',
    },
} as const;

// ============================================================================
// EXPORTS
// ============================================================================

export default TYPOGRAPHY;

