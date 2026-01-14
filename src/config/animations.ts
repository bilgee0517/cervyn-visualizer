/**
 * ============================================================================
 * CENTRALIZED ANIMATION SYSTEM
 * ============================================================================
 * 
 * Single source of truth for all animations and transitions.
 * 
 * Usage:
 *   import { ANIMATION_DURATION, EASING, getAnimationConfig } from '@/config/animations';
 *   const duration = ANIMATION_DURATION.normal;
 *   const easing = EASING.easeInOut;
 * 
 * Features:
 *   - Consistent timing across the application
 *   - Standard easing functions
 *   - Pre-configured animation presets
 *   - Type-safe access
 * ============================================================================
 */

// ============================================================================
// ANIMATION DURATIONS (in milliseconds)
// ============================================================================

/**
 * Standard animation duration scale
 */
export const ANIMATION_DURATION = {
    instant: 0,
    fastest: 100,
    faster: 150,
    fast: 200,
    normal: 300,
    moderate: 400,
    slow: 500,
    slower: 600,
    slowest: 800,
    verySlow: 1000,
    extraSlow: 1500,
} as const;

/**
 * Semantic animation durations for specific use cases
 */
export const ANIMATION_SEMANTIC = {
    // UI interactions
    button: ANIMATION_DURATION.fast,
    dropdown: ANIMATION_DURATION.fast,
    modal: ANIMATION_DURATION.normal,
    tooltip: ANIMATION_DURATION.faster,
    sidebar: ANIMATION_DURATION.moderate,
    
    // Graph operations
    layoutChange: ANIMATION_DURATION.slow,
    layoutComplete: ANIMATION_DURATION.slower,
    nodeTransition: ANIMATION_DURATION.normal,
    edgeTransition: ANIMATION_DURATION.normal,
    zoomTransition: ANIMATION_DURATION.moderate,
    
    // LOD (Level of Detail) transitions
    lodChange: ANIMATION_DURATION.normal,
    lodFade: ANIMATION_DURATION.fast,
    
    // Expand/collapse
    expandCollapse: ANIMATION_DURATION.moderate,
    
    // Camera/focus operations
    focus: ANIMATION_DURATION.slow,
    
    // Hover effects
    hover: ANIMATION_DURATION.fastest,
    
    // Loading states
    spinner: ANIMATION_DURATION.verySlow,
    pulse: ANIMATION_DURATION.extraSlow,
} as const;

// ============================================================================
// ANIMATION DELAYS (in milliseconds)
// ============================================================================

/**
 * Standard delay scale
 */
export const ANIMATION_DELAY = {
    none: 0,
    tiny: 50,
    small: 100,
    short: 150,
    medium: 300,
    standard: 600,
    long: 800,
    veryLong: 1000,
    extraLong: 1500,
} as const;

/**
 * Semantic animation delays
 */
export const ANIMATION_DELAY_SEMANTIC = {
    layoutStart: ANIMATION_DELAY.standard,
    layoutComplete: ANIMATION_DELAY.tiny,
    cascadeStart: ANIMATION_DELAY.short,
    tooltipShow: ANIMATION_DELAY.medium,
    dropdownOpen: ANIMATION_DELAY.none,
} as const;

// ============================================================================
// EASING FUNCTIONS
// ============================================================================

/**
 * Standard CSS easing functions
 */
export const EASING = {
    // CSS keywords
    linear: 'linear',
    ease: 'ease',
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
    
    // Cubic bezier curves (custom)
    easeInQuad: 'cubic-bezier(0.55, 0.085, 0.68, 0.53)',
    easeOutQuad: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    easeInOutQuad: 'cubic-bezier(0.455, 0.03, 0.515, 0.955)',
    
    easeInCubic: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
    easeOutCubic: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
    easeInOutCubic: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
    
    easeInQuart: 'cubic-bezier(0.895, 0.03, 0.685, 0.22)',
    easeOutQuart: 'cubic-bezier(0.165, 0.84, 0.44, 1)',
    easeInOutQuart: 'cubic-bezier(0.77, 0, 0.175, 1)',
    
    // Material Design
    materialStandard: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
    materialAccelerate: 'cubic-bezier(0.4, 0.0, 1, 1)',
    materialDecelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
    
    // Bounce and elastic
    easeOutBounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    easeOutElastic: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    
    // Smooth (for organic/natural animations)
    smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
    smoothIn: 'cubic-bezier(0.4, 0, 1, 1)',
    smoothOut: 'cubic-bezier(0, 0, 0.2, 1)',
} as const;

/**
 * Semantic easing for specific use cases
 */
export const EASING_SEMANTIC = {
    ui: EASING.materialStandard,
    layout: EASING.easeInOutCubic,
    zoom: EASING.smooth,
    expand: EASING.materialDecelerate,
    collapse: EASING.materialAccelerate,
    hover: EASING.easeOut,
    bounce: EASING.easeOutBounce,
} as const;

// ============================================================================
// ANIMATION PRESETS
// ============================================================================

/**
 * Pre-configured animation settings for common use cases
 */
export const ANIMATION_PRESETS = {
    // Layout animations
    layout: {
        duration: ANIMATION_SEMANTIC.layoutChange,
        delay: ANIMATION_DELAY_SEMANTIC.layoutStart,
        easing: EASING_SEMANTIC.layout,
    },
    
    layoutComplete: {
        duration: ANIMATION_SEMANTIC.layoutComplete,
        delay: ANIMATION_DELAY_SEMANTIC.layoutComplete,
        easing: EASING_SEMANTIC.layout,
    },
    
    // Node transitions
    nodeShow: {
        duration: ANIMATION_SEMANTIC.nodeTransition,
        delay: ANIMATION_DELAY.none,
        easing: EASING_SEMANTIC.expand,
        opacity: {
            from: 0,
            to: 1,
        },
    },
    
    nodeHide: {
        duration: ANIMATION_SEMANTIC.nodeTransition,
        delay: ANIMATION_DELAY.none,
        easing: EASING_SEMANTIC.collapse,
        opacity: {
            from: 1,
            to: 0,
        },
    },
    
    // Zoom transitions
    zoom: {
        duration: ANIMATION_SEMANTIC.zoomTransition,
        delay: ANIMATION_DELAY.none,
        easing: EASING_SEMANTIC.zoom,
    },
    
    // LOD transitions
    lodTransition: {
        duration: ANIMATION_SEMANTIC.lodChange,
        delay: ANIMATION_DELAY.none,
        easing: EASING_SEMANTIC.layout,
    },
    
    // UI elements
    fadeIn: {
        duration: ANIMATION_DURATION.normal,
        delay: ANIMATION_DELAY.none,
        easing: EASING.easeOut,
        opacity: {
            from: 0,
            to: 1,
        },
    },
    
    fadeOut: {
        duration: ANIMATION_DURATION.normal,
        delay: ANIMATION_DELAY.none,
        easing: EASING.easeIn,
        opacity: {
            from: 1,
            to: 0,
        },
    },
    
    slideIn: {
        duration: ANIMATION_DURATION.moderate,
        delay: ANIMATION_DELAY.none,
        easing: EASING_SEMANTIC.expand,
    },
    
    slideOut: {
        duration: ANIMATION_DURATION.moderate,
        delay: ANIMATION_DELAY.none,
        easing: EASING_SEMANTIC.collapse,
    },
    
    // Hover effects
    hover: {
        duration: ANIMATION_SEMANTIC.hover,
        delay: ANIMATION_DELAY.none,
        easing: EASING_SEMANTIC.hover,
    },
    
    // Expand/collapse
    expand: {
        duration: ANIMATION_SEMANTIC.expandCollapse,
        delay: ANIMATION_DELAY.none,
        easing: EASING_SEMANTIC.expand,
    },
    
    collapse: {
        duration: ANIMATION_SEMANTIC.expandCollapse,
        delay: ANIMATION_DELAY.none,
        easing: EASING_SEMANTIC.collapse,
    },
} as const;

// ============================================================================
// TRANSITION PROPERTIES
// ============================================================================

/**
 * CSS transition property combinations
 */
export const TRANSITION_PROPERTIES = {
    all: 'all',
    opacity: 'opacity',
    transform: 'transform',
    position: 'left, top',
    size: 'width, height',
    colors: 'background-color, color, border-color',
    layout: 'opacity, transform',
    display: 'opacity, display',
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a CSS transition string
 */
export function createTransition(
    property: string = TRANSITION_PROPERTIES.all,
    duration: number = ANIMATION_DURATION.normal,
    easing: string = EASING.ease,
    delay: number = ANIMATION_DELAY.none
): string {
    return `${property} ${duration}ms ${easing} ${delay}ms`;
}

/**
 * Create multiple CSS transitions
 */
export function createTransitions(
    transitions: Array<{
        property?: string;
        duration?: number;
        easing?: string;
        delay?: number;
    }>
): string {
    return transitions
        .map(t => createTransition(t.property, t.duration, t.easing, t.delay))
        .join(', ');
}

/**
 * Get animation configuration by preset name
 */
export function getAnimationConfig(presetName: keyof typeof ANIMATION_PRESETS): typeof ANIMATION_PRESETS[typeof presetName] {
    return ANIMATION_PRESETS[presetName] || ANIMATION_PRESETS.fadeIn;
}

/**
 * Create a CSS animation string for keyframe animations
 */
export function createAnimation(
    name: string,
    duration: number = ANIMATION_DURATION.normal,
    easing: string = EASING.ease,
    delay: number = ANIMATION_DELAY.none,
    iterationCount: number | 'infinite' = 1,
    direction: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse' = 'normal',
    fillMode: 'none' | 'forwards' | 'backwards' | 'both' = 'none'
): string {
    return `${name} ${duration}ms ${easing} ${delay}ms ${iterationCount} ${direction} ${fillMode}`;
}

/**
 * Calculate staggered delay for cascading animations
 */
export function getStaggeredDelay(index: number, baseDelay: number = ANIMATION_DELAY.tiny): number {
    return baseDelay * index;
}

/**
 * Scale animation duration based on number of items
 */
export function getScaledDuration(
    itemCount: number,
    baseDuration: number = ANIMATION_DURATION.normal,
    maxDuration: number = ANIMATION_DURATION.extraSlow,
    minDuration: number = ANIMATION_DURATION.fast
): number {
    // Scale duration logarithmically
    const scale = Math.log10(Math.max(itemCount, 1) + 1) / 2;
    const scaledDuration = baseDuration * (1 + scale);
    return Math.max(minDuration, Math.min(maxDuration, scaledDuration));
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    ANIMATION_DURATION,
    ANIMATION_SEMANTIC,
    ANIMATION_DELAY,
    ANIMATION_DELAY_SEMANTIC,
    EASING,
    EASING_SEMANTIC,
    ANIMATION_PRESETS,
    TRANSITION_PROPERTIES,
};


