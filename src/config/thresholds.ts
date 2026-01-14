/**
 * ============================================================================
 * CENTRALIZED THRESHOLD SYSTEM
 * ============================================================================
 * 
 * Single source of truth for all numeric thresholds, limits, and boundaries.
 * 
 * Usage:
 *   import { ZOOM_THRESHOLDS, NODE_COUNT_LIMITS, getZoomLevel } from '@/config/thresholds';
 *   if (nodeCount > NODE_COUNT_LIMITS.performanceWarning) { ... }
 * 
 * Features:
 *   - Consistent thresholds across the application
 *   - Performance limits
 *   - Zoom level boundaries
 *   - Code quality thresholds
 *   - Type-safe access
 * ============================================================================
 */

// ============================================================================
// ZOOM THRESHOLDS
// ============================================================================

/**
 * Zoom level thresholds for Level of Detail (LOD) system
 * 
 * These control when different levels of detail are shown/hidden:
 * - Functions appear/disappear around zoom 1.5-1.8
 * - Classes appear/disappear around zoom 0.85-1.0
 * - Files appear/disappear around zoom 0.4-0.5
 */
export const ZOOM_THRESHOLDS = {
    // Zoom in thresholds (show more detail)
    showFunctionsIn: 1.8,
    showClassesIn: 1.0,
    showFilesIn: 0.5,
    showDirectoriesIn: 0.1,
    
    // Zoom out thresholds (hide detail) - with hysteresis
    showFunctionsOut: 1.5,
    showClassesOut: 0.85,
    showFilesOut: 0.4,
    showDirectoriesOut: 0.05,
    
    // Hysteresis factor (prevents flickering)
    hysteresisFactor: 0.85,
    
    // Minimum and maximum zoom levels
    min: 0.001,
    max: 10,
    
    // Default zoom
    default: 1.0,
    
    // Comfortable viewing ranges
    overview: 0.3,
    normal: 1.0,
    detail: 2.0,
    extreme: 5.0,
} as const;


// ============================================================================
// NODE COUNT LIMITS
// ============================================================================

/**
 * Node count thresholds for performance optimization
 */
export const NODE_COUNT_LIMITS = {
    // Performance thresholds
    small: 50,              // Small graph - all features enabled
    medium: 150,            // Medium graph - some optimizations
    large: 300,             // Large graph - significant optimizations
    veryLarge: 500,         // Very large - aggressive optimizations
    huge: 1000,             // Huge - maximum optimizations
    
    // Warning thresholds
    performanceWarning: 500,
    performanceCritical: 1000,
    
    // Layout-specific limits
    layoutAnimationDisable: 300, // Disable layout animation above this
    lodRequired: 150,            // LOD system required above this
    
    // Rendering limits
    maxVisible: 1000,            // Maximum visible nodes at once
    maxRenderable: 5000,         // Absolute maximum before refusing to render
} as const;

/**
 * Edge count thresholds
 */
export const EDGE_COUNT_LIMITS = {
    small: 100,
    medium: 500,
    large: 1000,
    veryLarge: 2000,
    huge: 5000,
    
    // Performance thresholds
    performanceWarning: 1000,
    performanceCritical: 5000,
    
    // Rendering limits
    maxVisible: 2000,
    maxRenderable: 10000,
} as const;

// ============================================================================
// CODE QUALITY THRESHOLDS
// ============================================================================

/**
 * Code complexity thresholds
 */
export const COMPLEXITY_THRESHOLDS = {
    veryLow: 5,
    low: 10,
    moderate: 20,
    high: 30,
    veryHigh: 50,
    extreme: 100,
} as const;

/**
 * Lines of code thresholds
 */
export const LOC_THRESHOLDS = {
    tiny: 10,
    small: 50,
    medium: 100,
    large: 200,
    veryLarge: 500,
    huge: 1000,
    massive: 2000,
} as const;

/**
 * Code coverage thresholds (percentages)
 */
export const COVERAGE_THRESHOLDS = {
    none: 0,
    low: 20,
    mediumLow: 40,
    medium: 60,
    mediumHigh: 80,
    high: 90,
    excellent: 95,
} as const;

/**
 * Dependent count thresholds (how many files depend on this one)
 */
export const DEPENDENT_THRESHOLDS = {
    isolated: 0,
    few: 2,
    some: 5,
    many: 10,
    heavily: 20,
    critical: 50,
} as const;

/**
 * Days since last change thresholds
 */
export const STALENESS_THRESHOLDS = {
    fresh: 7,
    recent: 30,
    moderate: 90,
    stale: 180,
    veryStale: 365,
} as const;

// ============================================================================
// VISUAL THRESHOLDS
// ============================================================================

/**
 * Node size thresholds (for size multipliers)
 */
export const SIZE_MULTIPLIER_THRESHOLDS = {
    min: 0.5,
    tiny: 0.75,
    small: 1.0,
    normal: 1.5,
    large: 2.0,
    veryLarge: 3.0,
    huge: 5.0,
    max: 10.0,
} as const;

/**
 * Opacity thresholds
 */
export const OPACITY_THRESHOLDS = {
    invisible: 0,
    verySubtle: 0.1,
    subtle: 0.3,
    light: 0.5,
    medium: 0.7,
    strong: 0.85,
    veryStrong: 0.95,
    solid: 1.0,
} as const;

/**
 * Distance thresholds (for proximity detection, clustering, etc.)
 */
export const DISTANCE_THRESHOLDS = {
    touching: 10,
    veryClose: 50,
    close: 100,
    near: 200,
    moderate: 500,
    far: 1000,
    veryFar: 2000,
} as const;

// ============================================================================
// LAYOUT THRESHOLDS
// ============================================================================

/**
 * Spacing thresholds for layouts
 */
export const LAYOUT_SPACING_THRESHOLDS = {
    minNodeSpacing: 50,
    idealNodeSpacing: 80,
    maxNodeSpacing: 200,
    
    minEdgeLength: 50,
    idealEdgeLength: 100,
    maxEdgeLength: 500,
    
    minLaneGap: 100,
    idealLaneGap: 150,
    maxLaneGap: 300,
} as const;

/**
 * Iteration thresholds for force-directed layouts
 */
export const LAYOUT_ITERATION_THRESHOLDS = {
    min: 50,
    quick: 500,
    normal: 1000,
    detailed: 2000,
    precise: 3500,
    max: 5000,
} as const;

// ============================================================================
// PERFORMANCE THRESHOLDS
// ============================================================================

/**
 * Frame rate thresholds (FPS)
 */
export const FPS_THRESHOLDS = {
    veryPoor: 15,
    poor: 24,
    acceptable: 30,
    good: 45,
    excellent: 60,
    perfect: 120,
} as const;

/**
 * Debounce delay thresholds (ms)
 */
export const DEBOUNCE_THRESHOLDS = {
    immediate: 0,
    fast: 50,
    normal: 150,
    moderate: 300,
    slow: 500,
    verySlow: 1000,
} as const;

/**
 * Throttle delay thresholds (ms)
 */
export const THROTTLE_THRESHOLDS = {
    immediate: 0,
    fast: 16,        // ~60 FPS
    normal: 33,      // ~30 FPS
    moderate: 100,
    slow: 250,
    verySlow: 500,
} as const;

// ============================================================================
// UI THRESHOLDS
// ============================================================================

/**
 * Tooltip delay thresholds (ms)
 */
export const TOOLTIP_THRESHOLDS = {
    showDelay: 300,
    hideDelay: 100,
    hoverThreshold: 50, // Minimum hover time before showing
} as const;

/**
 * Container size thresholds (pixels)
 */
export const CONTAINER_SIZE_THRESHOLDS = {
    tiny: 300,
    small: 600,
    medium: 900,
    large: 1200,
    veryLarge: 1600,
    huge: 2000,
} as const;

/**
 * Text length thresholds (characters)
 */
export const TEXT_LENGTH_THRESHOLDS = {
    short: 20,
    medium: 50,
    long: 100,
    veryLong: 200,
    extreme: 500,
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get zoom level category from zoom value
 */
export function getZoomLevel(zoom: number): 'overview' | 'normal' | 'detail' | 'extreme' {
    if (zoom < ZOOM_THRESHOLDS.overview) return 'overview';
    if (zoom < ZOOM_THRESHOLDS.detail) return 'normal';
    if (zoom < ZOOM_THRESHOLDS.extreme) return 'detail';
    return 'extreme';
}

/**
 * Get complexity category from complexity value
 */
export function getComplexityCategory(complexity: number): 'veryLow' | 'low' | 'moderate' | 'high' | 'veryHigh' | 'extreme' {
    if (complexity < COMPLEXITY_THRESHOLDS.veryLow) return 'veryLow';
    if (complexity < COMPLEXITY_THRESHOLDS.low) return 'low';
    if (complexity < COMPLEXITY_THRESHOLDS.moderate) return 'moderate';
    if (complexity < COMPLEXITY_THRESHOLDS.high) return 'high';
    if (complexity < COMPLEXITY_THRESHOLDS.veryHigh) return 'veryHigh';
    return 'extreme';
}

/**
 * Get LOC (Lines of Code) category
 */
export function getLOCCategory(loc: number): 'tiny' | 'small' | 'medium' | 'large' | 'veryLarge' | 'huge' | 'massive' {
    if (loc < LOC_THRESHOLDS.tiny) return 'tiny';
    if (loc < LOC_THRESHOLDS.small) return 'small';
    if (loc < LOC_THRESHOLDS.medium) return 'medium';
    if (loc < LOC_THRESHOLDS.large) return 'large';
    if (loc < LOC_THRESHOLDS.veryLarge) return 'veryLarge';
    if (loc < LOC_THRESHOLDS.huge) return 'huge';
    return 'massive';
}

/**
 * Get coverage quality from percentage
 */
export function getCoverageQuality(coverage: number): 'none' | 'low' | 'mediumLow' | 'medium' | 'mediumHigh' | 'high' | 'excellent' {
    if (coverage === 0) return 'none';
    if (coverage < COVERAGE_THRESHOLDS.low) return 'low';
    if (coverage < COVERAGE_THRESHOLDS.mediumLow) return 'mediumLow';
    if (coverage < COVERAGE_THRESHOLDS.medium) return 'medium';
    if (coverage < COVERAGE_THRESHOLDS.mediumHigh) return 'mediumHigh';
    if (coverage < COVERAGE_THRESHOLDS.high) return 'high';
    return 'excellent';
}

/**
 * Get node count category
 */
export function getNodeCountCategory(count: number): 'small' | 'medium' | 'large' | 'veryLarge' | 'huge' {
    if (count < NODE_COUNT_LIMITS.small) return 'small';
    if (count < NODE_COUNT_LIMITS.medium) return 'medium';
    if (count < NODE_COUNT_LIMITS.large) return 'large';
    if (count < NODE_COUNT_LIMITS.veryLarge) return 'veryLarge';
    return 'huge';
}

/**
 * Check if node count requires performance optimizations
 */
export function requiresPerformanceOptimization(count: number): boolean {
    return count >= NODE_COUNT_LIMITS.medium;
}

/**
 * Check if node count requires LOD system
 */
export function requiresLOD(count: number): boolean {
    return count >= NODE_COUNT_LIMITS.lodRequired;
}

/**
 * Check if layout animation should be disabled
 */
export function shouldDisableLayoutAnimation(count: number): boolean {
    return count >= NODE_COUNT_LIMITS.layoutAnimationDisable;
}

/**
 * Get debounce delay based on node count
 */
export function getDebounceDelay(count: number): number {
    if (count < NODE_COUNT_LIMITS.small) return DEBOUNCE_THRESHOLDS.fast;
    if (count < NODE_COUNT_LIMITS.medium) return DEBOUNCE_THRESHOLDS.normal;
    if (count < NODE_COUNT_LIMITS.large) return DEBOUNCE_THRESHOLDS.moderate;
    if (count < NODE_COUNT_LIMITS.veryLarge) return DEBOUNCE_THRESHOLDS.slow;
    return DEBOUNCE_THRESHOLDS.verySlow;
}

/**
 * Check if container size is small
 */
export function isSmallContainer(width: number, height: number): boolean {
    return width < CONTAINER_SIZE_THRESHOLDS.small || height < CONTAINER_SIZE_THRESHOLDS.small;
}

/**
 * Calculate optimal layout iterations based on node count
 */
export function getOptimalIterations(nodeCount: number): number {
    if (nodeCount < NODE_COUNT_LIMITS.small) return LAYOUT_ITERATION_THRESHOLDS.precise;
    if (nodeCount < NODE_COUNT_LIMITS.medium) return LAYOUT_ITERATION_THRESHOLDS.detailed;
    if (nodeCount < NODE_COUNT_LIMITS.large) return LAYOUT_ITERATION_THRESHOLDS.normal;
    if (nodeCount < NODE_COUNT_LIMITS.veryLarge) return LAYOUT_ITERATION_THRESHOLDS.quick;
    return LAYOUT_ITERATION_THRESHOLDS.min;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    ZOOM_THRESHOLDS,
    NODE_COUNT_LIMITS,
    EDGE_COUNT_LIMITS,
    COMPLEXITY_THRESHOLDS,
    LOC_THRESHOLDS,
    COVERAGE_THRESHOLDS,
    DEPENDENT_THRESHOLDS,
    STALENESS_THRESHOLDS,
    SIZE_MULTIPLIER_THRESHOLDS,
    OPACITY_THRESHOLDS,
    DISTANCE_THRESHOLDS,
    LAYOUT_SPACING_THRESHOLDS,
    LAYOUT_ITERATION_THRESHOLDS,
    FPS_THRESHOLDS,
    DEBOUNCE_THRESHOLDS,
    THROTTLE_THRESHOLDS,
    TOOLTIP_THRESHOLDS,
    CONTAINER_SIZE_THRESHOLDS,
    TEXT_LENGTH_THRESHOLDS,
};


