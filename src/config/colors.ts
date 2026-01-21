/**
 * ============================================================================
 * CENTRALIZED COLOR SYSTEM
 * ============================================================================
 * 
 * Single source of truth for all colors across the entire application.
 * 
 * Usage:
 *   import { COLORS, getThemeColors } from '@/config/colors';
 *   const color = COLORS.primary;
 *   const nodeColor = COLORS.nodes.file;
 * 
 * Features:
 *   - Semantic color tokens
 *   - Type-safe access
 *   - Theme support (extensible)
 *   - Consistent across Cytoscape and all services
 * ============================================================================
 */

// ============================================================================
// BASE PALETTE - Foundation Colors
// ============================================================================

export const PALETTE = {
    // Neutral Grays (8 shades)
    neutral: {
        50: '#F8FAFC',
        100: '#F1F5F9',
        200: '#E2E8F0',
        300: '#CBD5E1',
        400: '#94A3B8',
        500: '#64748B',
        600: '#475569',
        700: '#334155',
        800: '#1E293B',
        900: '#0F172A',
    },
    
    // Primary Colors
    blue: {
        light: '#60A5FA',
        DEFAULT: '#3B82F6',
        dark: '#2563EB',
    },
    
    emerald: {
        light: '#34D399',
        DEFAULT: '#10B981',
        dark: '#059669',
    },
    
    amber: {
        light: '#FBBF24',
        DEFAULT: '#F59E0B',
        dark: '#D97706',
    },
    
    purple: {
        light: '#A78BFA',
        DEFAULT: '#8B5CF6',
        dark: '#7C3AED',
    },
    
    rose: {
        light: '#FB7185',
        DEFAULT: '#F43F5E',
        dark: '#E11D48',
    },
    
    orange: {
        light: '#FB923C',
        DEFAULT: '#F97316',
        dark: '#EA580C',
    },
    
    cyan: {
        light: '#22D3EE',
        DEFAULT: '#06B6D4',
        dark: '#0891B2',
    },
    
    indigo: {
        light: '#818CF8',
        DEFAULT: '#6366F1',
        dark: '#4F46E5',
    },
    
    teal: {
        light: '#2DD4BF',
        DEFAULT: '#14B8A6',
        dark: '#0D9488',
    },
    
    lime: {
        light: '#A3E635',
        DEFAULT: '#84CC16',
        dark: '#65A30D',
    },
    
    red: {
        light: '#F87171',
        DEFAULT: '#EF4444',
        dark: '#DC2626',
    },
    
    violet: {
        light: '#C084FC',
        DEFAULT: '#A855F7',
        dark: '#9333EA',
    },
    
    pink: {
        light: '#F472B6',
        DEFAULT: '#EC4899',
        dark: '#DB2777',
    },
    
    yellow: {
        light: '#FDE047',
        DEFAULT: '#FACC15',
        dark: '#EAB308',
    },
    
    green: {
        light: '#86EFAC',
        DEFAULT: '#22C55E',
        dark: '#16A34A',
    },
} as const;

// ============================================================================
// SEMANTIC COLOR TOKENS
// ============================================================================

export const COLORS = {
    // Primary Brand Colors
    primary: PALETTE.blue.DEFAULT,
    primaryLight: PALETTE.blue.light,
    primaryDark: PALETTE.blue.dark,
    
    // Semantic Colors
    success: PALETTE.emerald.DEFAULT,
    warning: PALETTE.amber.DEFAULT,
    error: PALETTE.red.DEFAULT,
    info: PALETTE.cyan.DEFAULT,
    
    // Node Type Colors
    nodes: {
        file: PALETTE.emerald.DEFAULT,
        directory: PALETTE.purple.DEFAULT,
        folder: PALETTE.purple.DEFAULT,
        class: PALETTE.blue.DEFAULT,
        function: PALETTE.cyan.DEFAULT,
        module: PALETTE.neutral[500],
        cluster: PALETTE.neutral[800],
        concept: PALETTE.pink.DEFAULT,
    },
    
    // Workflow Layer Node Colors
    workflow: {
        feature: PALETTE.blue.DEFAULT,
        featureGroup: PALETTE.indigo.DEFAULT,
        userJourney: PALETTE.purple.DEFAULT,
    },
    
    // Context Layer Node Colors
    context: {
        actor: PALETTE.teal.DEFAULT,                // People, users, roles, personas
        externalSystem: PALETTE.rose.DEFAULT,       // Generic external systems
        externalApi: PALETTE.pink.DEFAULT,          // External APIs
        externalDatastore: PALETTE.yellow.DEFAULT,  // Databases, caches, data warehouses
        externalService: PALETTE.rose.light,        // SaaS services (Auth0, Stripe, etc.)
    },
    
    // Container Layer Node Colors (Runtime + Data Ownership)
    container: {
        frontend: PALETTE.cyan.DEFAULT,        // Client apps (web, mobile)
        service: PALETTE.green.DEFAULT,        // Backend services, APIs
        worker: PALETTE.orange.DEFAULT,        // Background job processors
        gateway: PALETTE.blue.DEFAULT,         // API gateways, load balancers
        messageBroker: PALETTE.purple.DEFAULT, // Event buses (Kafka, RabbitMQ)
        datastore: PALETTE.yellow.DEFAULT,     // Databases you own
        cache: PALETTE.red.DEFAULT,            // In-memory caches (Redis)
        objectStore: PALETTE.neutral[500],     // Blob storage (S3, MinIO)
    },
    
    // Component Layer Node Colors
    component: {
        module: PALETTE.purple.DEFAULT,
        package: PALETTE.violet.DEFAULT,
        component: PALETTE.indigo.DEFAULT,
        library: PALETTE.blue.DEFAULT,
        namespace: PALETTE.cyan.DEFAULT,
        plugin: PALETTE.pink.DEFAULT,
    },
    
    // Node Category Colors
    categories: {
        component: PALETTE.rose.DEFAULT,
        service: PALETTE.amber.DEFAULT,
        utility: PALETTE.purple.DEFAULT,
        model: PALETTE.blue.DEFAULT,
        view: PALETTE.cyan.DEFAULT,
    },
    
    // Architectural Layer Colors
    layers: {
        presentation: PALETTE.blue.DEFAULT,
        frontend: PALETTE.blue.DEFAULT,
        application: PALETTE.emerald.DEFAULT,
        backend: PALETTE.emerald.DEFAULT,
        domain: PALETTE.amber.DEFAULT,
        infrastructure: PALETTE.indigo.DEFAULT,
        database: PALETTE.amber.DEFAULT,
        utility: PALETTE.purple.DEFAULT,
        shared: PALETTE.purple.DEFAULT,
        unknown: PALETTE.neutral[500],
    },
    
    // Node State Colors
    states: {
        normal: PALETTE.neutral[300],
        selected: PALETTE.blue.DEFAULT,
        focused: PALETTE.emerald.DEFAULT,
        hovered: PALETTE.blue.light,
        dimmed: PALETTE.neutral[400],
        hidden: PALETTE.neutral[200],
        modified: PALETTE.orange.DEFAULT,
        agentAdded: PALETTE.pink.DEFAULT,
        entryPoint: PALETTE.orange.DEFAULT,
        recentlyChanged: PALETTE.emerald.DEFAULT,
        critical: PALETTE.red.DEFAULT,
        hot: PALETTE.orange.DEFAULT,
    },
    
    // Edge Type Colors
    edges: {
        default: PALETTE.neutral[400],
        imports: PALETTE.blue.DEFAULT,
        calls: PALETTE.emerald.DEFAULT,
        dependsOn: PALETTE.red.DEFAULT,
        extends: PALETTE.purple.DEFAULT,
        implements: PALETTE.purple.DEFAULT,
        runtimeCall: PALETTE.orange.DEFAULT,
        // Workflow layer edges
        dependsOnFeature: PALETTE.rose.DEFAULT,
        partOf: PALETTE.purple.DEFAULT,
        primaryFlow: PALETTE.emerald.DEFAULT,
        alternateFlow: PALETTE.amber.DEFAULT,
        triggers: PALETTE.cyan.DEFAULT,
        // Context layer edges (boundary interactions)
        uses: PALETTE.teal.DEFAULT,             // Actor uses system
        integratesWith: PALETTE.rose.DEFAULT,   // System integration
        authenticatesWith: PALETTE.orange.DEFAULT, // Authentication
        readsFrom: PALETTE.blue.DEFAULT,        // Data reading
        writesTo: PALETTE.indigo.DEFAULT,       // Data writing
        sendsEventTo: PALETTE.purple.DEFAULT,   // Event publishing
        receivesEventFrom: PALETTE.violet.DEFAULT, // Event subscription
        // Container layer edges (runtime semantics)
        httpRequest: PALETTE.blue.DEFAULT,      // Sync: REST/HTTP
        rpcCall: PALETTE.cyan.DEFAULT,          // Sync: gRPC/RPC
        dbQuery: PALETTE.yellow.DEFAULT,        // Sync: Database query
        cacheRead: PALETTE.red.light,           // Sync: Cache lookup
        cacheWrite: PALETTE.red.DEFAULT,        // Sync: Cache update
        publishEvent: PALETTE.purple.DEFAULT,   // Async: Publish to broker
        consumeEvent: PALETTE.purple.light,     // Async: Consume from broker
        enqueueJob: PALETTE.orange.DEFAULT,     // Async: Add job to queue
        replicatesTo: PALETTE.green.DEFAULT,    // Data: Replication flow
        syncsWith: PALETTE.teal.DEFAULT,        // Data: Bidirectional sync
        // Legacy workflow edges (deprecated)
        enables: PALETTE.emerald.DEFAULT,
        requires: PALETTE.rose.DEFAULT,
        composedOf: PALETTE.purple.DEFAULT,
    },
    
    // Code Quality Colors (Coverage/Complexity)
    quality: {
        excellent: PALETTE.green.DEFAULT,      // 80-100%
        good: PALETTE.lime.DEFAULT,            // 60-79%
        fair: PALETTE.yellow.DEFAULT,          // 40-59%
        poor: PALETTE.orange.DEFAULT,          // 20-39%
        bad: PALETTE.red.DEFAULT,              // 0-19%
        unknown: PALETTE.neutral[400],
    },
    
    // UI Element Colors
    ui: {
        background: PALETTE.neutral[900],
        backgroundSecondary: PALETTE.neutral[800],
        backgroundTertiary: PALETTE.neutral[700],
        border: PALETTE.neutral[700],
        borderSubtle: PALETTE.neutral[800],
        text: PALETTE.neutral[100],
        textSecondary: PALETTE.neutral[400],
        textMuted: PALETTE.neutral[500],
        overlay: 'rgba(15, 23, 42, 0.8)',
    },
    
    // Tooltip/Badge Colors
    tooltips: {
        background: PALETTE.neutral[800],
        border: PALETTE.neutral[700],
        text: PALETTE.neutral[100],
        accent: PALETTE.blue.DEFAULT,
    },
    
    // Text Colors (for readability)
    text: {
        primary: '#FFFFFF',
        secondary: PALETTE.neutral[100],
        muted: PALETTE.neutral[400],
        inverse: PALETTE.neutral[900],
        outline: '#FFFFFF',
    },
    
    // Border Colors
    borders: {
        default: PALETTE.neutral[600],
        light: PALETTE.neutral[500],
        dark: PALETTE.neutral[700],
        accent: PALETTE.blue.DEFAULT,
        warning: PALETTE.amber.DEFAULT,
        error: PALETTE.red.DEFAULT,
    },
} as const;

// ============================================================================
// CLUSTER COLORS (15 distinct colors for semantic clustering)
// ============================================================================

export const CLUSTER_COLORS = [
    PALETTE.blue.DEFAULT,      // Blue
    PALETTE.emerald.DEFAULT,   // Emerald
    PALETTE.amber.DEFAULT,     // Amber
    PALETTE.purple.DEFAULT,    // Purple
    PALETTE.pink.DEFAULT,      // Pink
    PALETTE.cyan.DEFAULT,      // Cyan
    PALETTE.orange.DEFAULT,    // Orange
    PALETTE.teal.DEFAULT,      // Teal
    PALETTE.indigo.DEFAULT,    // Indigo
    PALETTE.lime.DEFAULT,      // Lime
    PALETTE.red.DEFAULT,       // Red
    PALETTE.violet.DEFAULT,    // Violet
    PALETTE.cyan.light,        // Light cyan
    PALETTE.yellow.DEFAULT,    // Yellow
    PALETTE.green.DEFAULT,     // Green
] as const;

// ============================================================================
// COLOR UTILITIES
// ============================================================================

/**
 * Convert hex color to RGBA
 */
export function hexToRgba(hex: string, alpha: number = 1): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Get cluster color by index (wraps around)
 */
export function getClusterColor(index: number): string {
    return CLUSTER_COLORS[index % CLUSTER_COLORS.length];
}

/**
 * Get coverage color based on percentage
 */
export function getCoverageColor(coverage: number): string {
    if (coverage >= 80) return COLORS.quality.excellent;
    if (coverage >= 60) return COLORS.quality.good;
    if (coverage >= 40) return COLORS.quality.fair;
    if (coverage >= 20) return COLORS.quality.poor;
    if (coverage > 0) return COLORS.quality.bad;
    return COLORS.quality.unknown;
}

/**
 * Get complexity color based on value
 */
export function getComplexityColor(complexity: number): string {
    if (complexity > 20) return COLORS.error;
    if (complexity > 10) return COLORS.warning;
    return COLORS.borders.default;
}

/**
 * Get layer background color with opacity
 */
export function getLayerBackgroundColor(layer: string, alpha: number = 0.08): string {
    const colorKey = layer.toLowerCase() as keyof typeof COLORS.layers;
    const color = COLORS.layers[colorKey] || COLORS.layers.unknown;
    return hexToRgba(color, alpha);
}

/**
 * Generate color variations (lighter/darker)
 */
export function generateColorVariations(baseHex: string) {
    const r = parseInt(baseHex.slice(1, 3), 16);
    const g = parseInt(baseHex.slice(3, 5), 16);
    const b = parseInt(baseHex.slice(5, 7), 16);
    
    const lighten = (amount: number) => {
        return `rgb(${Math.min(255, r + amount)}, ${Math.min(255, g + amount)}, ${Math.min(255, b + amount)})`;
    };
    
    const darken = (amount: number) => {
        return `rgb(${Math.max(0, r - amount)}, ${Math.max(0, g - amount)}, ${Math.max(0, b - amount)})`;
    };
    
    return {
        lightest: lighten(80),
        veryLight: lighten(60),
        light: lighten(40),
        medium: lighten(20),
        base: baseHex,
        dark: darken(20),
        darker: darken(40),
        darkest: darken(60),
    };
}

/**
 * Get node type color
 */
export function getNodeTypeColor(type: string): string {
    const typeKey = type.toLowerCase() as keyof typeof COLORS.nodes;
    return COLORS.nodes[typeKey] || COLORS.nodes.file;
}

/**
 * Get edge type color
 */
export function getEdgeTypeColor(edgeType: string): string {
    const edgeKey = edgeType.toLowerCase().replace(/-/g, '') as keyof typeof COLORS.edges;
    return COLORS.edges[edgeKey] || COLORS.edges.default;
}

// ============================================================================
// THEME SYSTEM (Extensible for future dark/light mode)
// ============================================================================

export interface Theme {
    name: string;
    colors: typeof COLORS;
}

export const DEFAULT_THEME: Theme = {
    name: 'dark',
    colors: COLORS,
};

// Future: Add light theme support
// export const LIGHT_THEME: Theme = { ... };

let currentTheme: Theme = DEFAULT_THEME;

/**
 * Get current theme colors
 */
export function getThemeColors(): typeof COLORS {
    return currentTheme.colors;
}

/**
 * Set active theme (extensible for future theme switching)
 */
export function setTheme(theme: Theme): void {
    currentTheme = theme;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default COLORS;


