/**
 * ============================================================================
 * Shared types for webview modules
 * ============================================================================
 * 
 * Note: Most constants have been moved to centralized config modules:
 *   - ../../config/constants.ts (DEPTH_LEVELS, ICONS, NODE_TYPES, etc.)
 *   - ../../config/spacing.ts (LAYOUT, BORDERS, SPACING)
 *   - ../../config/animations.ts (ANIMATION_DURATION, ANIMATION_DELAY)
 *   - ../../config/thresholds.ts (ZOOM_THRESHOLDS, limits)
 * 
 * These values are re-exported here for backward compatibility.
 * ============================================================================
 */

import { DEPTH_LEVELS as CENTRALIZED_DEPTH_LEVELS, ICONS as CENTRALIZED_ICONS } from '../../config/constants';
import { LAYOUT } from '../../config/spacing';
import { ANIMATION_SEMANTIC, ANIMATION_DELAY_SEMANTIC } from '../../config/animations';
import { ZOOM_THRESHOLDS } from '../../config/thresholds';

export interface GraphData {
    nodes: any[];
    edges: any[];
}

// Re-export centralized constants for backward compatibility
export const DEPTH_LEVELS = CENTRALIZED_DEPTH_LEVELS;

export const ICONS = {
    COLLAPSED: CENTRALIZED_ICONS.COLLAPSED,
    EXPANDED: CENTRALIZED_ICONS.EXPANDED,
} as const;

/**
 * Configuration constants for layout and interaction
 * 
 * These values are derived from the centralized systems.
 * For the source of truth, see:
 *   - ../../config/thresholds.ts (zoom limits)
 *   - ../../config/animations.ts (durations, delays)
 *   - ../../config/spacing.ts (layout values)
 */
export const CONFIG = {
    // Zoom constraints (from ZOOM_THRESHOLDS in thresholds.ts)
    MIN_ZOOM: ZOOM_THRESHOLDS.min,
    MAX_ZOOM: ZOOM_THRESHOLDS.max,
    WHEEL_SENSITIVITY: 0.2,
    
    // Animation (from ANIMATION_SEMANTIC in animations.ts)
    LAYOUT_ANIMATION_DURATION: ANIMATION_SEMANTIC.layoutChange,
    LAYOUT_ANIMATION_DELAY: ANIMATION_DELAY_SEMANTIC.layoutStart,
    
    // Padding and spacing (from LAYOUT in spacing.ts)
    DEFAULT_PADDING: LAYOUT.defaultPadding,
    MIN_NODE_SPACING: LAYOUT.minNodeSpacing,
    DEFAULT_OFFSET: LAYOUT.defaultOffset,
    
    // Border widths (legacy - for backward compatibility)
    COMPOUND_BORDER_WIDTH_HOVER: '4px',
    REGULAR_BORDER_WIDTH_HOVER: '2.5px',
    COMPOUND_BORDER_WIDTH: '3px',
} as const;



