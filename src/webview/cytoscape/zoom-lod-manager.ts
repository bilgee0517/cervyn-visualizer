/**
 * Coverage-Based Level of Detail Manager
 * 
 * Manages dynamic node visibility based on viewport coverage, providing semantic zoom
 * without recomputing layouts. Shows children of nodes when they cover sufficient
 * viewport area (adjusted by node size). Uses opacity-based visibility for smooth transitions.
 * 
 * Architecture:
 * - Single graph with all nodes pre-positioned
 * - Visibility controlled via opacity (keeps nodes in DOM for layout calculations)
 * - Coverage-based: nodes covering >threshold% of viewport show their children
 * - Thresholds adjusted based on node size (smaller nodes = lower threshold)
 * - Recursive: children are checked for coverage too
 * - Efficient debouncing to optimize performance
 */

import { logMessage } from '../shared/utils';
import { Z_INDEX } from '../../config/spacing';

/**
 * Webview-compatible logger with log levels
 * Sends messages to VS Code extension for logging
 */
class WebviewLogger {
    private vscode: any;
    private logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';
    
    constructor(vscode: any) {
        this.vscode = vscode;
    }
    
    private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        return levels[level] >= levels[this.logLevel];
    }
    
    debug(message: string): void {
        if (this.shouldLog('debug')) {
            logMessage(this.vscode, `[ZoomLOD DEBUG] ${message}`);
        }
    }
    
    log(message: string): void {
        if (this.shouldLog('info')) {
            logMessage(this.vscode, `[ZoomLOD] ${message}`);
        }
    }
    
    warn(message: string): void {
        if (this.shouldLog('warn')) {
            logMessage(this.vscode, `[ZoomLOD WARN] ${message}`);
        }
    }
    
    error(message: string, err?: any): void {
        if (this.shouldLog('error')) {
            const errorMsg = err instanceof Error 
                ? `${message}: ${err.message}` 
                : err ? `${message}: ${String(err)}` : message;
            logMessage(this.vscode, `[ZoomLOD ERROR] ${errorMsg}`);
        }
    }
}


// Depth levels for state tracking
enum DepthLevel {
    FOLDERS = 'FOLDERS',
    FILES = 'FILES',
    CLASSES = 'CLASSES',
    FUNCTIONS = 'FUNCTIONS'
}

/**
 * Interface for storing compound node dimensions and positions
 */
interface CompoundDimensions {
    width: number;
    height: number;
    timestamp: number;
}

/**
 * Interface for storing node positions
 */
interface NodePosition {
    x: number;
    y: number;
}

    /**
     * Interface for node viewport information
     */
interface NodeViewportInfo {
    nodeId: string;
    label: string;
    type: string;
    viewportCoveragePercent: number;
    adjustedThreshold: number; // Threshold adjusted based on viewport capacity
    isAtCenter: boolean;
    distanceFromCenter: number;
    boundingBox: {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        width: number;
        height: number;
    };
}

export class ZoomBasedLODManager {
    private vscode: any;
    private logger: WebviewLogger;
    private cy: any = null;
    private expandCollapseAPI: any = null;
    private currentDepthLevel: DepthLevel = DepthLevel.FOLDERS;
    private isTransitioning: boolean = false;
    private debounceTimer: any = null;
    private initialized: boolean = false;
    private adaptiveZoomEnabled: boolean = true;
    private firstLayoutComplete: boolean = false;
    private incrementalUpdateMode: boolean = false; // Track if we're in incremental update mode
    
    // Fixed dimensions system for compound nodes
    private dimensionCache: Map<string, CompoundDimensions> = new Map();
    private dimensionsLocked: boolean = false;
    
    // Position locking to prevent movement during visibility changes
    private positionCache: Map<string, NodePosition> = new Map();
    private positionsLocked: boolean = false;
    
    constructor(vscode: any) {
        this.vscode = vscode;
        this.logger = new WebviewLogger(vscode);
    }
    
    /**
     * Initialize the coverage-based LOD system
     */
    public initialize(cy: any): boolean {
        if (!cy) {
            this.logger.error('Cytoscape instance is null');
            return false;
        }
        
        this.cy = cy;
        
        try {
            // Check if expand-collapse extension is available
            if (typeof cy.expandCollapse !== 'function') {
                this.logger.warn('cytoscape-expand-collapse extension not loaded, using fallback mode');
                this.initializeFallbackMode();
                return true;
            }
            
            // Initialize expand-collapse extension
            this.expandCollapseAPI = cy.expandCollapse({
                layoutBy: null,  // Critical: Don't relayout on expand/collapse
                fisheye: false,
                animate: true,
                animationDuration: 300,
                undoable: false,
                cueEnabled: false,  // Disable manual cues (automatic coverage-based only)
                expandCollapseCuePosition: 'top-left',
                expandCollapseCueSize: 12,
                expandCollapseCueLineSize: 8,
            });
            
            this.logger.debug('Expand-collapse extension initialized');
            
            // Set up zoom event listener with debouncing
            this.setupZoomListener();
            
            this.initialized = true;
            this.logger.log('Coverage-based LOD system initialized');
            
            return true;
            
        } catch (error) {
            this.logger.error('Initialization failed', error);
            return false;
        }
    }
    
    /**
     * Initialize fallback mode without expand-collapse extension
     */
    private initializeFallbackMode(): void {
        this.logger.debug('Using fallback mode (display-based visibility only)');
        this.setupZoomListener();
        this.initialized = true;
    }
    
    /**
     * Set up zoom event listener with debouncing
     */
    private setupZoomListener(): void {
        this.cy.on('zoom', () => {
            // Don't respond until first layout completes
            if (!this.firstLayoutComplete) {
                return;
            }
            
            // Only respond if adaptive zoom is enabled
            if (!this.adaptiveZoomEnabled) return;
            
            // Clear existing debounce timer
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }
            
            // Debounce to avoid excessive updates during rapid zooming
            this.debounceTimer = setTimeout(() => {
                const zoomLevel = this.cy.zoom();
                this.updateVisibility(zoomLevel, false);
            }, 150); // 150ms debounce
        });
        
        this.logger.debug('Zoom event listener registered');
    }
    
    /**
     * Update node visibility based solely on coverage
     * If a node covers >20% of viewport, show its children (recursively)
     */
    private updateVisibility(zoom: number, immediate: boolean): void {
        if (this.isTransitioning) {
            return; // Prevent overlapping transitions
        }
        
        // =====================================================================
        // PURE COVERAGE-BASED VISIBILITY
        // No zoom thresholds - only coverage determines visibility
        // Uses viewport capacity-adjusted thresholds
        // =====================================================================
        this.isTransitioning = true;
        
        try {
            const cy = this.cy;
            if (!cy) return;
            
            cy.batch(() => {
                // Step 1: Always show directories/folders (base level)
                this.showNodes(cy.nodes('[type="directory"]'), immediate);
                
                // Step 2: Hide all children first (we'll show them based on coverage)
                // BUT: Preserve selected nodes - they should never be hidden
                const nodesToHide = cy.nodes('[type="file"],[type="class"],[type="function"]')
                    .filter((node: any) => !node.hasClass('selected')); // Exclude selected nodes
                this.hideNodes(nodesToHide, immediate);
                
                // Step 2.5: Ensure selected nodes and their connected nodes are always visible
                const selectedNodes = cy.nodes('.selected');
                if (selectedNodes.length > 0) {
                    selectedNodes.forEach((selectedNode: any) => {
                        // Show the selected node itself
                        this.showNodes(selectedNode, immediate);
                        // Show all nodes connected to the selected node
                        const connectedNodes = selectedNode.neighborhood('node');
                        if (connectedNodes.length > 0) {
                            this.showNodes(connectedNodes, immediate);
                        }
                    });
                }
                
                // Step 3: Apply coverage-based visibility with adjusted thresholds
                const nodesAtCenter = this.getNodesAtViewportCenter(150);
                // Filter nodes that meet their adjusted threshold (not fixed 20%)
                const nodesWithHighCoverage = nodesAtCenter.filter(n => 
                    n.viewportCoveragePercent >= n.adjustedThreshold
                );
                
                if (nodesWithHighCoverage.length > 0) {
                    this.logger.debug(`Found ${nodesWithHighCoverage.length} node(s) at center meeting thresholds`);
                    
                    // For each node meeting its adjusted threshold, show its children
                    nodesWithHighCoverage.forEach(nodeInfo => {
                        this.logger.debug(
                            `"${nodeInfo.label}" (${nodeInfo.type}): ` +
                            `${nodeInfo.viewportCoveragePercent.toFixed(1)}% coverage ` +
                            `(threshold: ${nodeInfo.adjustedThreshold.toFixed(1)}%)`
                        );
                        this.applyCoverageBasedVisibility(nodeInfo, immediate);
                    });
                }
            });
            
            // Step 4: Update edge visibility AFTER batch completes (ensures all node opacity changes are committed)
            this.updateEdgeVisibility();
            
            // Update depth indicator (for UI feedback, but we're using coverage-based)
            // Check what's visible based on opacity
            const visibleFiles = cy.nodes('[type="file"]').filter((n: any) => n.style('opacity') > 0.5).length;
            const visibleClasses = cy.nodes('[type="class"]').filter((n: any) => n.style('opacity') > 0.5).length;
            const visibleFunctions = cy.nodes('[type="function"]').filter((n: any) => n.style('opacity') > 0.5).length;
            
            if (visibleFunctions > 0) {
                this.currentDepthLevel = DepthLevel.FUNCTIONS;
                this.updateDepthIndicator(DepthLevel.FUNCTIONS);
            } else if (visibleClasses > 0) {
                this.currentDepthLevel = DepthLevel.CLASSES;
                this.updateDepthIndicator(DepthLevel.CLASSES);
            } else if (visibleFiles > 0) {
                this.currentDepthLevel = DepthLevel.FILES;
                this.updateDepthIndicator(DepthLevel.FILES);
            } else {
                this.currentDepthLevel = DepthLevel.FOLDERS;
                this.updateDepthIndicator(DepthLevel.FOLDERS);
            }
            
        } catch (error) {
            this.logger.error('Error during coverage-based visibility update', error);
        } finally {
            // Allow next transition after animation completes
            setTimeout(() => {
                this.isTransitioning = false;
            }, immediate ? 50 : 400);
        }
    }
    
    /**
     * Apply coverage-based visibility: show children of nodes meeting adjusted threshold
     * Threshold is adjusted based on viewport capacity (smaller nodes need less coverage)
     * Recursively checks children too
     * 
     * @param nodeInfo - Information about the node at viewport center (includes adjusted threshold)
     * @param immediate - Whether to apply changes immediately (no animation)
     */
    private applyCoverageBasedVisibility(nodeInfo: NodeViewportInfo, immediate: boolean): void {
        const cy = this.cy;
        if (!cy) return;
        
        const node = cy.getElementById(nodeInfo.nodeId);
        if (node.length === 0) return;
        
        const targetNode = node[0];
        try {
            // Show ALL children of the node when it meets threshold (don't filter by type)
            this.showAllNodeChildren(targetNode, immediate);
            
            // Recursively check children for coverage meeting adjusted thresholds
            this.recursivelyCheckChildrenCoverage(targetNode, immediate);
            
        } catch (error) {
            this.logger.error('Error applying coverage-based visibility', error);
        }
    }
    
    /**
     * Show ALL children of a specific node (no type filtering)
     * 
     * @param parentNode - The parent node
     * @param immediate - Whether to apply immediately
     */
    private showAllNodeChildren(parentNode: any, immediate: boolean): void {
        const children = parentNode.children();
        
        if (children.length > 0) {
            this.logger.debug(`Showing ${children.length} children of "${parentNode.data('label')}"`);
            this.showNodes(children, immediate);
        }
    }
    
    /**
     * Recursively check children for coverage meeting adjusted thresholds and show their children if needed
     * 
     * @param parentNode - The parent node to check children of
     * @param immediate - Whether to apply immediately
     */
    private recursivelyCheckChildrenCoverage(parentNode: any, immediate: boolean): void {
        const cy = this.cy;
        if (!cy) return;
        
        const children = parentNode.children();
        
        children.forEach((child: any) => {
            // Only check visible children
            if (child.style('opacity') < 0.5) return;
            
            // Get coverage info for this child (includes adjusted threshold)
            const childNodes = this.getNodesAtViewportCenter(150);
            const childInfo = childNodes.find(n => n.nodeId === child.id());
            
            // Use adjusted threshold instead of fixed 20%
            if (childInfo && childInfo.viewportCoveragePercent >= childInfo.adjustedThreshold) {
                this.logger.debug(
                    `Recursive: "${childInfo.label}" covers ${childInfo.viewportCoveragePercent.toFixed(1)}% ` +
                    `(threshold: ${childInfo.adjustedThreshold.toFixed(1)}%) - showing children`
                );
                
                // Show ALL children when this child meets threshold (don't filter by type)
                this.showAllNodeChildren(child, immediate);
                
                // Recursively check this child's children too
                this.recursivelyCheckChildrenCoverage(child, immediate);
            }
        });
    }
    
    /**
     * Transition to a specific depth level
     */
    private transitionToDepthLevel(targetLevel: DepthLevel, immediate: boolean): void {
        const cy = this.cy;
        
        // Use batch for performance
        cy.batch(() => {
            switch (targetLevel) {
                case DepthLevel.FOLDERS:
                    this.showFoldersOnly(immediate);
                    break;
                    
                case DepthLevel.FILES:
                    this.showFiles(immediate);
                    break;
                    
                case DepthLevel.CLASSES:
                    this.showClasses(immediate);
                    break;
                    
                case DepthLevel.FUNCTIONS:
                    this.showFunctions(immediate);
                    break;
            }
        });
        
        // Update edges based on visible nodes AFTER batch completes (ensures all node opacity changes are committed)
        this.updateEdgeVisibility();
        
        this.logger.debug(`Transitioned to ${targetLevel}`);
    }
    
    /**
     * Show folders only (most zoomed out)
     */
    private showFoldersOnly(immediate: boolean): void {
        const cy = this.cy;
        
        // Hide files, classes, and functions
        this.hideNodes(cy.nodes('[type="file"],[type="class"],[type="function"]'), immediate);
        
        // Show only directories
        this.showNodes(cy.nodes('[type="directory"]'), immediate);
    }
    
    /**
     * Show files (manual depth level)
     */
    private showFiles(immediate: boolean): void {
        const cy = this.cy;
        
        // Show directories and files
        this.showNodes(cy.nodes('[type="directory"],[type="file"]'), immediate);
        
        // Hide classes and functions
        this.hideNodes(cy.nodes('[type="class"],[type="function"]'), immediate);
    }
    
    /**
     * Show classes (manual depth level)
     */
    private showClasses(immediate: boolean): void {
        const cy = this.cy;
        
        // Show directories, files, and classes
        this.showNodes(cy.nodes('[type="directory"],[type="file"],[type="class"]'), immediate);
        
        // Hide functions
        this.hideNodes(cy.nodes('[type="function"]'), immediate);
    }
    
    /**
     * Show functions (most zoomed in)
     */
    private showFunctions(immediate: boolean): void {
        const cy = this.cy;
        
        // Show all nodes
        this.showNodes(cy.nodes(), immediate);
    }
    
    /**
     * Show nodes with optional animation
     * Uses opacity instead of display to keep nodes in DOM for bounding box calculations
     * Preserves selected state (doesn't override selected styling)
     */
    private showNodes(nodes: any, immediate: boolean): void {
        if (nodes.length === 0) return;
        
        this.logger.debug(`Showing ${nodes.length} nodes`);
        
        const cy = this.cy;
        
        // Set full visibility and enable interactions immediately
        // But preserve selected state styling
        cy.batch(() => {
            nodes.forEach((node: any) => {
                const isSelected = node.hasClass('selected');
                
                if (!isSelected) {
                    // Normal nodes - standard visibility
                    node.style({
                        'opacity': 1,
                        'text-opacity': 1,
                        'pointer-events': 'auto',
                        'events': 'yes',
                        'z-index': 1
                    });
                } else {
                    // Selected nodes - keep full visibility but preserve selected styling
                    // Only update opacity if needed, don't override background/border colors
                    node.style({
                        'opacity': 1,
                        'text-opacity': 1,
                        'pointer-events': 'auto',
                        'events': 'yes',
                        'z-index': Z_INDEX.selected
                    });
                }
            });
        });
        
        // Adjust compound node labels based on child visibility
        this.adjustCompoundNodeLabels();
    }
    
    /**
     * Hide nodes with optional animation
     * Uses opacity instead of display:none to keep nodes in DOM for bounding box calculations
     * This prevents compound nodes from resizing when children are hidden
     * CRITICAL: Selected nodes are never hidden - they are filtered out before calling this method
     */
    private hideNodes(nodes: any, immediate: boolean): void {
        if (nodes.length === 0) return;
        
        // Double-check: filter out any selected nodes that might have slipped through
        const nodesToHide = nodes.filter((node: any) => !node.hasClass('selected'));
        
        if (nodesToHide.length === 0) {
            return;
        }
        
        this.logger.debug(`Hiding ${nodesToHide.length} nodes (${nodes.length - nodesToHide.length} selected preserved)`);
        
        const cy = this.cy;
        
        // CRITICAL: Set opacity to 0 immediately for edge visibility checks
        // Even if we animate, we need edges to hide right away
        cy.batch(() => {
            nodesToHide.style({
                'opacity': 0,
                'text-opacity': 0,
                'pointer-events': 'none',
                'events': 'no',
                'z-index': -999
            });
        });
        
        // Adjust compound node labels based on child visibility
        this.adjustCompoundNodeLabels();
    }
    
    /**
     * Update edge visibility based on visible nodes
     * Uses opacity to hide edges whose endpoints are hidden
     * Preserves selected and hover states (doesn't override CSS-defined styling)
     * CRITICAL: For styled edges (selected, hover), we only update opacity - don't set width/color inline
     * as that would override the CSS selector styles managed by StyleManager
     * CRITICAL: Edges connected to selected nodes are always visible, even if the other endpoint is hidden
     * CRITICAL: This must be called AFTER all node visibility changes are committed (after batch completes)
     */
    private updateEdgeVisibility(): void {
        const cy = this.cy;
        if (!cy) return;
        
        // Use batch for performance when updating many edges
        cy.batch(() => {
            cy.edges().forEach((edge: any) => {
                // Validate edge exists
                if (!edge || !edge.length) return;
                
                const source = edge.source();
                const target = edge.target();
                
                // Validate source and target nodes exist and are valid
                // If nodes were removed, hide the edge
                if (!source || !source.length || !target || !target.length) {
                    edge.style({
                        'opacity': 0,
                        'pointer-events': 'none',
                        'events': 'no',
                        'z-index': -999
                    });
                    return;
                }
                
                // Check if edge has interaction classes - preserve their styling
                const isSelected = edge.hasClass('selected');
                const isHovered = edge.hasClass('hover');
                const hasInteractionClass = isSelected || isHovered;
                
                // Check if source or target is selected - if so, always show the edge
                const sourceIsSelected = source.hasClass('selected');
                const targetIsSelected = target.hasClass('selected');
                const connectedToSelectedNode = sourceIsSelected || targetIsSelected;
                
                // Check opacity for visibility - handle both number and string formats
                const sourceOpacity = source.style('opacity');
                const targetOpacity = target.style('opacity');
                
                // Convert to number if needed (Cytoscape may return string or number)
                const sourceOpacityNum = typeof sourceOpacity === 'number' 
                    ? sourceOpacity 
                    : (typeof sourceOpacity === 'string' ? parseFloat(sourceOpacity) : 0);
                const targetOpacityNum = typeof targetOpacity === 'number' 
                    ? targetOpacity 
                    : (typeof targetOpacity === 'string' ? parseFloat(targetOpacity) : 0);
                
                // Node is visible if opacity > 0.5
                const sourceVisible = sourceOpacityNum > 0.5;
                const targetVisible = targetOpacityNum > 0.5;
                
                // Show edge if:
                // 1. Both endpoints are visible (normal case), OR
                // 2. Edge is selected/hovered (preserve interaction styling), OR
                // 3. Edge is connected to a selected node (keep selected node's connections visible)
                const shouldShowEdge = (sourceVisible && targetVisible) || hasInteractionClass || connectedToSelectedNode;
                
                if (shouldShowEdge) {
                    if (!hasInteractionClass && !connectedToSelectedNode) {
                        // Normal edges - set all properties
                        edge.style({
                            'opacity': 1,
                            'pointer-events': 'auto',
                            'events': 'yes',
                            'z-index': 1
                        });
                    } else {
                        // Styled edges (selected/hover) or edges connected to selected nodes
                        // ONLY update opacity and interaction
                        // DO NOT set width, line-color, or target-arrow-color as inline styles
                        // These must come from CSS selector to preserve styling from StyleManager
                        edge.style({
                            'opacity': 1,
                            'pointer-events': 'auto',
                            'events': 'yes'
                            // z-index, width, and colors are handled by CSS selectors, don't override
                        });
                    }
                } else {
                    // Hide edge if endpoints are not visible and not connected to selected node
                    edge.style({
                        'opacity': 0,
                        'pointer-events': 'none',
                        'events': 'no',
                        'z-index': -999
                    });
                }
            });
        });
    }
    
    /**
     * Adjust compound node labels based on child visibility
     * When children are hidden, center and enlarge the label
     * When children are visible, restore top-aligned smaller label
     */
    private adjustCompoundNodeLabels(): void {
        const cy = this.cy;
        
        cy.nodes('[isCompound]').forEach((node: any) => {
            const children = node.children();
            
            // Count how many children are visible
            let visibleChildCount = 0;
            children.forEach((child: any) => {
                if (child.style('opacity') > 0.5) {
                    visibleChildCount++;
                }
            });
            
            const hasNoChildren = children.length === 0;
            const allChildrenHidden = children.length > 0 && visibleChildCount === 0;
            
            if (hasNoChildren || allChildrenHidden) {
                // No children or all children hidden - center and enlarge label
                this.centerAndEnlargeLabel(node);
            } else {
                // Children visible - restore normal label style
                this.restoreNormalLabel(node);
            }
        });
    }
    
    /**
     * Center and enlarge label for compound nodes with hidden children
     * Font size scales aggressively with node size to fill the space
     */
    private centerAndEnlargeLabel(node: any): void {
        const bb = node.boundingBox();
        const nodeWidth = bb.w;
        const nodeHeight = bb.h;
        const label = node.data('label') || '';
        
        // AGGRESSIVE SIZING: Make font as big as possible to fill the node
        // Use the smaller dimension (width or height) as base for scaling
        const minDimension = Math.min(nodeWidth, nodeHeight);
        
        // Start with a very aggressive base: 20-30% of the smaller dimension
        let fontSize = minDimension * 0.25;
        
        // Character width estimation: ~0.55 * fontSize (varies by font)
        // We want the text to use about 80% of the node width
        const availableWidth = nodeWidth * 0.85;
        const charWidth = fontSize * 0.55;
        const estimatedTextWidth = label.length * charWidth;
        
        // If text is too wide, scale down to fit
        if (estimatedTextWidth > availableWidth) {
            fontSize = availableWidth / (label.length * 0.55);
        }
        
        // Also check height constraint (text should use max 70% of height)
        const availableHeight = nodeHeight * 0.7;
        const textHeight = fontSize * 1.3; // Line height factor
        if (textHeight > availableHeight) {
            fontSize = availableHeight / 1.3;
        }
        
        // Reasonable bounds (but much higher max)
        fontSize = Math.max(14, Math.min(fontSize, 120));
        

        
        // Apply modern, centered label style - no background, pure typography
        node.style({
            // Positioning
            'text-valign': 'center',
            'text-halign': 'center',
            'text-margin-y': 0,
            
            // Typography - Clean and modern
            'font-size': `${fontSize}px`,
            'font-weight': 700, // Bold for strong presence
            'font-family': 'Inter, "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            'text-transform': 'none',
            'text-wrap': 'ellipsis',
            'text-max-width': `${availableWidth}px`,
        

            // Additional modern touches
            'min-zoomed-font-size': 0,
        });
    }
    
    /**
     * Restore normal label style for compound nodes with visible children
     * Removes inline text styles to let the stylesheet (cytoscape-styles.ts) handle defaults
     */
    private restoreNormalLabel(node: any): void {
        // Remove all inline text-related styles to restore stylesheet defaults
        // This allows the stylesheet selectors (node[type="directory"], node[type="file"])
        // from cytoscape-styles.ts to take over with their proper values
        node.removeStyle(
            'text-valign text-halign text-margin-y font-size font-weight ' +
            'text-wrap text-max-width text-outline-width text-outline-color ' +
            'text-outline-opacity text-background-opacity color font-family ' +
            'text-transform min-zoomed-font-size'
        );
        
        // The stylesheet will automatically apply the correct styles based on:
        // - node[type="directory"] selector for directories
        // - node[type="file"] selector for files
        // - node[type="class"] selector for classes
        // etc. from cytoscape-styles.ts
    }
    
    /**
     * Update depth indicator in UI
     */
    private updateDepthIndicator(level: DepthLevel): void {
        const depthSelect = document.getElementById('depthSelect') as HTMLSelectElement;
        if (depthSelect) {
            // Map depth level to select value
            const valueMap: Record<DepthLevel, string> = {
                [DepthLevel.FOLDERS]: '0',
                [DepthLevel.FILES]: '1',
                [DepthLevel.CLASSES]: '2',
                [DepthLevel.FUNCTIONS]: '3'
            };
            
            depthSelect.value = valueMap[level];
            
            // Update label to indicate it's automatic
            const label = depthSelect.parentElement?.querySelector('label');
            if (label && !label.textContent?.includes('(Auto)')) {
                label.textContent = label.textContent + ' (Auto)';
            }
        }
    }
    
    /**
     * Get current depth level
     */
    public getCurrentDepthLevel(): DepthLevel {
        return this.currentDepthLevel;
    }
    
    /**
     * Get current zoom thresholds (for debugging/UI)
     * Note: Returns empty object since we use pure coverage-based visibility now
     * Kept for backward compatibility with tests
     */
    public getZoomThresholds(): any {
        return {}; // No longer using zoom-based thresholds
    }
    
    /**
     * Enable or disable adaptive zoom
     */
    public setAdaptiveZoomEnabled(enabled: boolean): void {
        this.adaptiveZoomEnabled = enabled;
        this.logger.log(`Adaptive zoom ${enabled ? 'enabled' : 'disabled'}`);
        
        if (enabled) {
            // When re-enabling, update based on current coverage
            const currentZoom = this.cy.zoom();
            this.updateVisibility(currentZoom, false);
        }
    }
    
    /**
     * Check if adaptive zoom is enabled
     */
    public isAdaptiveZoomEnabled(): boolean {
        return this.adaptiveZoomEnabled;
    }
    
    /**
     * Public method to force update edge visibility
     * Useful when nodes are hidden/shown outside of the normal visibility flow
     * (e.g., by other managers or user interactions)
     */
    public forceUpdateEdgeVisibility(): void {
        this.updateEdgeVisibility();
    }
    
    /**
     * Manually set depth level (for manual depth control when adaptive zoom is off)
     */
    public manuallySetDepthLevel(level: DepthLevel): void {
        this.logger.log(`Manual depth set to ${level}`);
        this.currentDepthLevel = level;
        this.transitionToDepthLevel(level, false);
    }
    
    /**
     * Apply initial visibility after first layout completes
     * Called by layout manager after initial layout
     */
    public applyInitialVisibility(): void {
        if (!this.cy || !this.initialized) {
            this.logger.error('Cannot apply initial visibility - not initialized');
            return;
        }
        
        const currentZoom = this.cy.zoom();
        
        // Full layout: Disable incremental mode to ensure full dimension recalculation
        this.incrementalUpdateMode = false;
        
        // CRITICAL: Ensure ALL nodes are visible FIRST, then capture dimensions, then apply coverage-based visibility
        this.showAllNodesImmediate();
        
        // Capture and fix compound node dimensions while ALL children are visible
        this.captureAndFixCompoundDimensionsSync();
        
        // CRITICAL: Also lock positions to prevent any movement during visibility changes
        this.lockAllNodePositions();
        
        // Calculate node size statistics for threshold calculation
        this.calculateNodeSizeStatistics();
        
        // Mark first layout as complete - enables zoom listener
        this.firstLayoutComplete = true;
        
        // Now apply coverage-based visibility
        this.logger.log(`Applying initial visibility at zoom ${currentZoom.toFixed(2)}`);
        this.updateVisibility(currentZoom, true);
    }
    
    /**
     * Recalculate visibility (call after layout changes or graph updates)
     * Recalculates node size statistics and applies coverage-based visibility
     */
    public recalculateThresholds(): void {
        this.logger.debug('Recalculating visibility after layout change');
        
        // Wait for layout to settle before recalculating
        setTimeout(() => {
            // Recalculate node size statistics for threshold calculation
            this.calculateNodeSizeStatistics();
            // Reapply visibility based on current coverage
            this.updateVisibility(this.cy.zoom(), false);
        }, 500); // Wait 500ms for layout animation to complete
    }
    
    /**
     * Check if system is initialized
     */
    public isInitialized(): boolean {
        return this.initialized;
    }
    
    /**
     * Clean up resources
     */
    public dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        if (this.cy) {
            this.cy.off('zoom');
            this.cy.off('position', 'node'); // Remove position monitoring
            this.cy.off('grab', 'node'); // Remove drag start listener
            this.cy.off('free', 'node'); // Remove drag end listener
        }
        
        this.expandCollapseAPI = null;
        this.cy = null;
        this.initialized = false;
        this.dimensionCache.clear();
        this.positionCache.clear();
    }
    
    /**
     * Show all nodes immediately (no animation)
     * Helper function to ensure all nodes are visible before capturing dimensions
     * Uses opacity-based visibility for consistency
     */
    private showAllNodesImmediate(): void {
        const cy = this.cy;
        cy.batch(() => {
            cy.nodes().style({
                'opacity': 1,
                'text-opacity': 1,
                'pointer-events': 'auto',
                'events': 'yes',
                'z-index': 1
            });
        });
    }
    
    /**
     * Capture and fix dimensions for all compound nodes (synchronous version)
     * Called after initial layout when all nodes are visible
     * IMPORTANT: This MUST be called when ALL children are visible to capture true dimensions
     */
    private captureAndFixCompoundDimensionsSync(): void {
        const cy = this.cy;
        
        const compoundNodes = cy.nodes('[isCompound]');
        let capturedCount = 0;
        
        cy.batch(() => {
            compoundNodes.forEach((node: any) => {
                const bb = node.boundingBox();
                
                // Cache dimensions
                this.dimensionCache.set(node.id(), {
                    width: bb.w,
                    height: bb.h,
                    timestamp: Date.now()
                });
                
                // Apply fixed dimensions
                this.applyFixedDimensions(node, bb.w, bb.h);
                capturedCount++;
            });
        });
        
        this.dimensionsLocked = true;
        
        this.logger.log(`Captured and fixed dimensions for ${capturedCount} compound nodes`);
        
        // Verify dimensions are actually applied
        setTimeout(() => {
            this.verifyFixedDimensions();
        }, 100);
    }
    
    /**
     * Verify that fixed dimensions are properly applied
     * Diagnostic function to check if CSS styles are working
     */
    private verifyFixedDimensions(): void {
        const cy = this.cy;
        const compoundNodes = cy.nodes('[isCompound]');
        let verifiedCount = 0;
        let issueCount = 0;
        
        compoundNodes.forEach((node: any) => {
            const cached = this.dimensionCache.get(node.id());
            const currentBB = node.boundingBox();
            const hasFixedFlag = node.data('_fixedDimensions');
            
            if (cached && hasFixedFlag) {
                const widthDiff = Math.abs(currentBB.w - cached.width);
                const heightDiff = Math.abs(currentBB.h - cached.height);
                
                // Allow small tolerance (1px) for rounding
                if (widthDiff > 1 || heightDiff > 1) {
                    issueCount++;
                    if (issueCount <= 3) {
                        this.logger.warn(
                            `Dimension mismatch for "${node.id()}": ` +
                            `cached=${cached.width.toFixed(0)}x${cached.height.toFixed(0)}, ` +
                            `actual=${currentBB.w.toFixed(0)}x${currentBB.h.toFixed(0)}`
                        );
                    }
                } else {
                    verifiedCount++;
                }
            }
        });
        
        if (issueCount > 0) {
            this.logger.warn(`Found ${issueCount} nodes with dimension mismatches (verified ${verifiedCount} OK)`);
        }
    }
    
    /**
     * Apply fixed dimensions to a specific node
     * CRITICAL: Uses absolute pixel values and multiple properties to prevent Cytoscape from auto-sizing
     */
    private applyFixedDimensions(node: any, width: number, height: number): void {
        // Apply multiple style properties to ensure dimensions are truly fixed
        // Use string with 'px' to be explicit
        node.style({
            'width': `${width}px`,
            'height': `${height}px`,
            'min-width': `${width}px`,
            'min-height': `${height}px`,
            'max-width': `${width}px`,   // NEW: Prevent growing
            'max-height': `${height}px`, // NEW: Prevent growing
            // Critical: Tell Cytoscape to NOT auto-size based on children
            'compound-sizing-wrt-labels': 'exclude',
            // Ensure padding doesn't affect size calculation
            'padding-relative-to': 'width'
        });
        
        // Mark node with metadata for verification
        node.data('_fixedDimensions', true);
        node.data('_fixedWidth', width);
        node.data('_fixedHeight', height);
        
        // CRITICAL: Also store the style as locked to prevent updates
        node.data('_styleSnapshot', {
            width: `${width}px`,
            height: `${height}px`,
            minWidth: `${width}px`,
            minHeight: `${height}px`,
            maxWidth: `${width}px`,
            maxHeight: `${height}px`
        });
        
    }
    
    /**
     * Recalculate dimensions for a specific compound node
     * Called when children are added or removed from a compound node
     * 
     * @param nodeId - ID of the compound node to recalculate
     * @param skipVisibilityRestore - If true, don't restore visibility after (useful for batch operations)
     */
    public recalculateNodeDimensions(nodeId: string, skipVisibilityRestore: boolean = false): void {
        const cy = this.cy;
        const node = cy.getElementById(nodeId);
        
        if (!node || !node.data('isCompound')) {
            this.logger.warn(`Cannot recalculate: "${nodeId}" is not a compound node`);
            return;
        }
        
        this.logger.debug(`Recalculating dimensions for "${nodeId}"`);
        
        cy.batch(() => {
            // Step 1: Temporarily make all children fully visible to get true bounding box
            const children = node.children();
            const wasHidden = children.filter((child: any) => child.style('opacity') < 0.5);
            
            if (wasHidden.length > 0) {
                wasHidden.style({
                    'opacity': 1,
                    'text-opacity': 1
                });
            }
            
            // Step 2: Remove fixed dimension constraints temporarily
            node.style({
                'width': 'auto',
                'height': 'auto',
                'min-width': 'initial',
                'min-height': 'initial'
            });
            
            // Step 3: Wait for Cytoscape to recalculate natural size
            requestAnimationFrame(() => {
                const newBB = node.boundingBox();
                
                // Step 4: Apply new fixed dimensions
                this.applyFixedDimensions(node, newBB.w, newBB.h);
                
                // Update cache
                this.dimensionCache.set(nodeId, {
                    width: newBB.w,
                    height: newBB.h,
                    timestamp: Date.now()
                });
                
                this.logger.debug(`Updated "${nodeId}": ${newBB.w.toFixed(0)}x${newBB.h.toFixed(0)}px`);
                
                // Step 5: Restore visibility based on current zoom
                if (!skipVisibilityRestore) {
                    this.updateVisibility(cy.zoom(), true);
                }
            });
        });
    }
    
    /**
     * Handle new node addition
     * Called externally when a node is dynamically added to the graph
     * 
     * @param newNodeId - ID of the newly added node
     * @param parentNodeId - ID of the parent compound node (if any)
     */
    public onNodeAdded(newNodeId: string, parentNodeId?: string): void {
        if (!parentNodeId) {
            return;
        }
        
        const cy = this.cy;
        const newNode = cy.getElementById(newNodeId);
        const parent = cy.getElementById(parentNodeId);
        
        if (!parent || !parent.data('isCompound')) {
            this.logger.warn(`Parent "${parentNodeId}" is not a compound node`);
            return;
        }
        
        this.logger.debug(`Node "${newNodeId}" added to compound node "${parentNodeId}"`);
        
        // Position new child locally within parent
        this.positionNewChildInParent(newNode, parent);
        
        // Skip dimension recalculation for incremental updates to avoid hanging
        // Use cached dimensions instead - they're accurate enough for small changes
        if (this.incrementalUpdateMode) {
            this.ensureParentHasDimensions(parent);
        } else {
            // Full update mode: recalculate dimensions (this should only happen on initial layout)
            setTimeout(() => {
                this.recalculateNodeDimensions(parentNodeId);
            }, 100);
        }
    }
    
    /**
     * Handle node removal
     * Called externally when a node is removed from the graph
     * 
     * @param removedNodeId - ID of the removed node
     * @param parentNodeId - ID of the parent compound node (if any)
     */
    public onNodeRemoved(removedNodeId: string, parentNodeId?: string): void {
        if (!parentNodeId) {
            return;
        }
        
        const cy = this.cy;
        const parent = cy.getElementById(parentNodeId);
        
        if (!parent || !parent.data('isCompound')) {
            return;
        }
        
        this.logger.debug(`Node "${removedNodeId}" removed from compound node "${parentNodeId}"`);
        
        // Skip dimension recalculation for incremental updates to avoid hanging
        if (this.incrementalUpdateMode) {
            this.ensureParentHasDimensions(parent);
        } else {
            // Full update mode: recalculate dimensions (this should only happen on initial layout)
            setTimeout(() => {
                this.recalculateNodeDimensions(parentNodeId);
            }, 100);
        }
    }
    
    /**
     * Handle multiple nodes added (batch operation)
     * More efficient than calling onNodeAdded multiple times
     * 
     * @param additions - Array of {nodeId, parentNodeId} pairs
     */
    public onNodesAddedBatch(additions: Array<{nodeId: string, parentNodeId?: string}>): void {
        const cy = this.cy;
        const affectedParents = new Set<string>();
        
        this.logger.debug(`onNodesAddedBatch: ${additions.length} additions (incremental: ${this.incrementalUpdateMode})`);
        
        // Position all new nodes
        additions.forEach(({nodeId, parentNodeId}) => {
            if (!parentNodeId) return;
            
            const newNode = cy.getElementById(nodeId);
            const parent = cy.getElementById(parentNodeId);
            
            if (parent && parent.data('isCompound')) {
                this.positionNewChildInParent(newNode, parent);
                affectedParents.add(parentNodeId);
            }
        });
        
        // Skip dimension recalculation for incremental updates to avoid hanging
        if (affectedParents.size > 0) {
            if (this.incrementalUpdateMode) {
                // Ensure all affected parents have dimensions from cache
                affectedParents.forEach(parentId => {
                    const parent = cy.getElementById(parentId);
                    if (parent && parent.length > 0) {
                        this.ensureParentHasDimensions(parent);
                    }
                });
            } else {
                // Full update mode: recalculate dimensions (this should only happen on initial layout)
                const parentArray = Array.from(affectedParents);
                parentArray.forEach((parentId, index) => {
                    const isLast = index === parentArray.length - 1;
                    this.recalculateNodeDimensions(parentId, !isLast);
                });
            }
        }
    }
    
    /**
     * Ensure a parent node has dimensions (from cache or current bounding box)
     * Used during incremental updates to avoid expensive recalculation
     */
    private ensureParentHasDimensions(parent: any): void {
        if (!parent || !parent.length) return;
        
        const parentId = parent.id();
        const cached = this.dimensionCache.get(parentId);
        
        if (cached) {
            // Use cached dimensions - they're still accurate enough
            // Ensure dimensions are still applied (they should be from initial layout)
            if (!parent.data('_fixedDimensions')) {
                this.applyFixedDimensions(parent, cached.width, cached.height);
            }
        } else {
            // No cache available - use current bounding box (this should be rare)
            try {
                const bb = parent.boundingBox();
                if (bb && bb.w > 0 && bb.h > 0) {
                    this.applyFixedDimensions(parent, bb.w, bb.h);
                    this.dimensionCache.set(parentId, {
                        width: bb.w,
                        height: bb.h,
                        timestamp: Date.now()
                    });
                }
            } catch (err) {
                this.logger.warn(`Could not get bounding box for "${parentId}": ${err}`);
            }
        }
    }

    /**
     * Set incremental update mode
     * When true, dimension recalculation is skipped during node add/remove operations
     * This prevents webview hanging while maintaining functionality
     */
    public setIncrementalUpdateMode(enabled: boolean): void {
        this.logger.debug(`Setting incremental update mode: ${enabled}`);
        this.incrementalUpdateMode = enabled;
    }

    /**
     * Check if in incremental update mode
     */
    public isIncrementalUpdateMode(): boolean {
        return this.incrementalUpdateMode;
    }
    
    /**
     * Position a new child node within its parent using simple grid layout
     * This avoids needing to run a full layout algorithm
     */
    private positionNewChildInParent(child: any, parent: any): void {
        if (!child || !parent) return;
        
        try {
            // Use cached dimensions if available to avoid expensive boundingBox call
            // This is especially important during incremental updates
            const parentId = parent.id();
            const cached = this.dimensionCache.get(parentId);
            
            let parentBB;
            if (cached && this.incrementalUpdateMode) {
                // During incremental updates, use cached dimensions and parent position
                const parentPos = parent.position();
                parentBB = {
                    x1: parentPos.x - cached.width / 2,
                    y1: parentPos.y - cached.height / 2,
                    x2: parentPos.x + cached.width / 2,
                    y2: parentPos.y + cached.height / 2,
                    w: cached.width,
                    h: cached.height
                };
            } else {
                // During full updates, use actual bounding box
                parentBB = parent.boundingBox();
                if (!parentBB || parentBB.w <= 0 || parentBB.h <= 0) {
                    // Fallback: position at parent center
                    const parentPos = parent.position();
                    child.position({ x: parentPos.x, y: parentPos.y });
                    return;
                }
            }
            
            const existingChildren = parent.children();
            
            // Configuration for grid layout
            const padding = 50;
            const spacing = 30;
            const columns = 4; // 4 columns per row
            
            // Calculate child index (excluding the new child itself)
            const childIndex = Math.max(0, existingChildren.length - 1);
            
            // Calculate grid position
            const row = Math.floor(childIndex / columns);
            const col = childIndex % columns;
            
            // Get child dimensions
            const childW = child.width() || 100;
            const childH = child.height() || 70;
            
            // Calculate absolute position
            const x = parentBB.x1 + padding + col * (childW + spacing) + childW / 2;
            const y = parentBB.y1 + padding + row * (childH + spacing) + childH / 2;
            
            // Position the child
            child.position({ x, y });
        } catch (err) {
            this.logger.error(`Error positioning child "${child?.id()}" in parent "${parent?.id()}"`, err);
            // Fallback: position at parent center
            try {
                const parentPos = parent.position();
                child.position({ x: parentPos.x, y: parentPos.y });
            } catch (fallbackErr) {
                this.logger.error('Error in fallback positioning', fallbackErr);
            }
        }
    }
    
    /**
     * Get cached dimensions for a compound node
     * Useful for debugging or external queries
     */
    public getCachedDimensions(nodeId: string): CompoundDimensions | undefined {
        return this.dimensionCache.get(nodeId);
    }
    
    /**
     * Check if dimensions are currently locked
     */
    public areDimensionsLocked(): boolean {
        return this.dimensionsLocked;
    }
    
    /**
     * Unlock dimensions (allows natural sizing again)
     * Use with caution - this will allow compound nodes to resize
     */
    public unlockDimensions(): void {
        if (!this.dimensionsLocked) return;
        
        const cy = this.cy;
        const compoundNodes = cy.nodes('[isCompound]');
        
        compoundNodes.forEach((node: any) => {
            node.removeStyle('width height min-width min-height');
            node.removeData('_fixedDimensions');
            node.removeData('_fixedWidth');
            node.removeData('_fixedHeight');
        });
        
        this.dimensionsLocked = false;
        this.dimensionCache.clear();
        
        this.logger.log('Dimensions unlocked');
    }
    
    /**
     * Re-lock dimensions (after unlocking or after major layout changes)
     * Recaptures current sizes and fixes them
     */
    public relockDimensions(): void {
        this.logger.log('Re-locking dimensions');
        
        // Ensure all nodes are visible first
        this.showAllNodesImmediate();
        
        // Capture and fix synchronously
        this.captureAndFixCompoundDimensionsSync();
    }
    
    // =========================================================================
    // POSITION LOCKING SYSTEM
    // Prevents nodes from moving during visibility changes
    // =========================================================================
    
    /**
     * Lock positions for all nodes to prevent movement during visibility changes
     * Some compound node libraries may try to reposition nodes when children are hidden
     */
    private lockAllNodePositions(): void {
        const cy = this.cy;
        const allNodes = cy.nodes();
        let lockedCount = 0;
        
        cy.batch(() => {
            allNodes.forEach((node: any) => {
                const pos = node.position();
                
                // Cache the position
                this.positionCache.set(node.id(), {
                    x: pos.x,
                    y: pos.y
                });
                
                // Lock the node position (disable dragging temporarily)
                // We'll restore it but monitor for unwanted changes
                node.data('_lockedPosition', { x: pos.x, y: pos.y });
                
                lockedCount++;
            });
        });
        
        this.positionsLocked = true;
        
        this.logger.debug(`Locked positions for ${lockedCount} nodes`);
        
        // Set up position monitoring
        this.setupPositionMonitoring();
    }
    
    /**
     * Set up monitoring to detect and correct unwanted position changes
     * This catches any library-induced position shifts
     * IMPORTANT: Only monitors during transitions, NOT during user interactions
     */
    private setupPositionMonitoring(): void {
        const cy = this.cy;
        
        // Track if user is currently dragging
        let userIsDragging = false;
        
        // Detect when user starts dragging
        cy.on('grab', 'node', () => {
            userIsDragging = true;
        });
        
        // Detect when user stops dragging
        cy.on('free', 'node', (evt: any) => {
            userIsDragging = false;
            
            // Update position cache with new user-defined position
            const node = evt.target;
            const newPos = node.position();
            this.positionCache.set(node.id(), {
                x: newPos.x,
                y: newPos.y
            });
            

        });
        
        // Monitor for unwanted position changes (NOT user-initiated)
        cy.on('position', 'node', (evt: any) => {
            if (!this.positionsLocked) return;
            if (userIsDragging) return; // CRITICAL: Don't interfere with user dragging
            
            // Log ALL position changes during transitions to debug drift
            const node = evt.target;
            const cachedPos = this.positionCache.get(node.id());
            
            if (cachedPos && node.isParent()) {
                const currentPos = node.position();
                const dx = Math.abs(currentPos.x - cachedPos.x);
                const dy = Math.abs(currentPos.y - cachedPos.y);
                
                // If position changed by more than 5px (likely Cytoscape auto-repositioning)
                if (dx > 5 || dy > 5) {
                    // Restore the locked position
                    node.position(cachedPos);
                }
            }
        });
    }
    
    /**
     * Unlock positions (allow nodes to move freely)
     */
    public unlockPositions(): void {
        if (!this.positionsLocked) return;
        
        const cy = this.cy;
        cy.nodes().forEach((node: any) => {
            node.removeData('_lockedPosition');
        });
        
        // Remove all position-related monitoring
        cy.off('position', 'node');
        cy.off('grab', 'node');
        cy.off('free', 'node');
        
        this.positionsLocked = false;
        this.positionCache.clear();
        
        this.logger.log('Positions unlocked');
    }
    
    /**
     * Re-lock positions (after a layout change)
     */
    public relockPositions(): void {
        this.logger.debug('Re-locking positions');
        this.lockAllNodePositions();
    }
    
    /**
     * Check if positions are currently locked
     */
    public arePositionsLocked(): boolean {
        return this.positionsLocked;
    }
    
    // =========================================================================
    // VIEWPORT CENTER DETECTION
    // Detects which nodes are at the viewport center and their coverage
    // =========================================================================
    
    /**
     * Cache for node size statistics (recalculated when graph changes)
     */
    private nodeSizeStats: {
        minArea: number;
        maxArea: number;
        medianArea: number;
        timestamp: number;
    } | null = null;
    
    /**
     * Calculate node size statistics for all nodes in the graph
     * Uses true graph coordinates (not zoomed)
     */
    private calculateNodeSizeStatistics(): void {
        const cy = this.cy;
        if (!cy) return;
        
        const allNodes = cy.nodes();
        if (allNodes.length === 0) return;
        
        const areas: number[] = [];
        
        allNodes.forEach((node: any) => {
            const bb = node.boundingBox();
            // Use true graph area (not zoomed)
            const area = bb.w * bb.h;
            if (area > 0) {
                areas.push(area);
            }
        });
        
        if (areas.length === 0) return;
        
        // Sort areas for median calculation
        areas.sort((a, b) => a - b);
        
        const minArea = areas[0];
        const maxArea = areas[areas.length - 1];
        const medianArea = areas.length % 2 === 0
            ? (areas[Math.floor(areas.length / 2) - 1] + areas[Math.floor(areas.length / 2)]) / 2
            : areas[Math.floor(areas.length / 2)];
        
        this.nodeSizeStats = {
            minArea,
            maxArea,
            medianArea,
            timestamp: Date.now()
        };
        
        this.logger.debug(
            `Node size statistics: min=${minArea.toFixed(0)}, ` +
            `median=${medianArea.toFixed(0)}, max=${maxArea.toFixed(0)} (${areas.length} nodes)`
        );
    }
    
    /**
     * Calculate adjusted threshold based on true node size relative to all nodes
     * Uses power function (x^power) to map from node size to threshold for polarized behavior
     * Smaller nodes get lower thresholds, larger nodes get higher thresholds
     * 
     * @param trueNodeArea - True area of the node (in graph coordinates, not zoomed)
     * @returns Adjusted threshold percentage
     */
    private calculateAdjustedThreshold(trueNodeArea: number): number {
        // Ensure statistics are calculated
        if (!this.nodeSizeStats) {
            this.calculateNodeSizeStatistics();
        }
        
        if (!this.nodeSizeStats) {
            // Fallback to default if stats unavailable
            return 20.0;
        }
        
        const { minArea, maxArea } = this.nodeSizeStats;
        
        // Define thresholds
        const MIN_THRESHOLD = 2.0; // Minimum threshold for very small nodes
        const MAX_THRESHOLD = 20.0; // Maximum threshold for very large nodes
        
        // Normalize node area relative to the distribution
        // Use logarithmic scale to handle wide range of sizes for normalization
        const logMin = Math.log10(minArea + 1); // +1 to avoid log(0)
        const logMax = Math.log10(maxArea + 1);
        const logNode = Math.log10(trueNodeArea + 1);
        
        // Normalize to 0-1 range (0 = smallest, 1 = largest)
        const normalizedSize = (logNode - logMin) / (logMax - logMin);
        
        // Use power function for polarized mapping
        // Higher power = more extreme polarization (small nodes get very low thresholds, large nodes get very high)
        // Recommended: 2.0 = moderate, 2.5 = balanced, 3.0 = strong, 4.0 = very strong
        const POWER = 2.5;
        
        // Power function: normalizedSize^power
        // Smaller nodes (normalizedSize → 0) get lower threshold
        // Larger nodes (normalizedSize → 1) get higher threshold
        // Power function creates more polarization than log
        const polarizedFactor = Math.pow(normalizedSize, POWER);
        
        // Map to threshold range
        const adjustedThreshold = MIN_THRESHOLD + (polarizedFactor * (MAX_THRESHOLD - MIN_THRESHOLD));
        
        return Math.round(adjustedThreshold * 100) / 100; // Round to 2 decimals
    }
    
    /**
     * Get nodes at the viewport center and calculate their viewport coverage percentage
     * Includes adjusted thresholds based on viewport capacity
     * 
     * @param centerRadius - Radius around viewport center to consider (in graph coordinates). Default: 100
     * @returns Array of node information sorted by viewport coverage (largest first)
     */
    public getNodesAtViewportCenter(centerRadius: number = 100): NodeViewportInfo[] {
        const cy = this.cy;
        if (!cy) {
            return [];
        }
        
        // Get viewport dimensions
        const viewportWidth = cy.width();
        const viewportHeight = cy.height();
        const viewportArea = viewportWidth * viewportHeight;
        
        // Get current pan and zoom
        const pan = cy.pan();
        const zoom = cy.zoom();
        
        // Calculate viewport center in screen coordinates
        const screenCenterX = viewportWidth / 2;
        const screenCenterY = viewportHeight / 2;
        
        // Convert screen center to graph coordinates
        const graphCenterX = (screenCenterX - pan.x) / zoom;
        const graphCenterY = (screenCenterY - pan.y) / zoom;
        
        // Calculate viewport bounds in graph coordinates
        const viewportGraphWidth = viewportWidth / zoom;
        const viewportGraphHeight = viewportHeight / zoom;
        const viewportGraphX1 = graphCenterX - viewportGraphWidth / 2;
        const viewportGraphY1 = graphCenterY - viewportGraphHeight / 2;
        const viewportGraphX2 = graphCenterX + viewportGraphWidth / 2;
        const viewportGraphY2 = graphCenterY + viewportGraphHeight / 2;
        
        // Get all visible nodes
        const visibleNodes = cy.nodes(':visible').filter((node: any) => {
            // Only consider nodes with opacity > 0.5 (actually visible)
            return node.style('opacity') > 0.5;
        });
        
        const nodeInfos: NodeViewportInfo[] = [];
        
        visibleNodes.forEach((node: any) => {
            const bb = node.boundingBox();
            const nodePos = node.position();
            
            // Calculate distance from node center to viewport center
            const dx = nodePos.x - graphCenterX;
            const dy = nodePos.y - graphCenterY;
            const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);
            
            // Check if node intersects with viewport
            const nodeIntersectsViewport = !(
                bb.x2 < viewportGraphX1 ||
                bb.x1 > viewportGraphX2 ||
                bb.y2 < viewportGraphY1 ||
                bb.y1 > viewportGraphY2
            );
            
            if (!nodeIntersectsViewport) {
                return; // Skip nodes that don't intersect viewport
            }
            
            // Calculate intersection area between node and viewport
            const intersectionX1 = Math.max(bb.x1, viewportGraphX1);
            const intersectionY1 = Math.max(bb.y1, viewportGraphY1);
            const intersectionX2 = Math.min(bb.x2, viewportGraphX2);
            const intersectionY2 = Math.min(bb.y2, viewportGraphY2);
            
            const intersectionWidth = Math.max(0, intersectionX2 - intersectionX1);
            const intersectionHeight = Math.max(0, intersectionY2 - intersectionY1);
            const intersectionArea = intersectionWidth * intersectionHeight;
            
            // Convert intersection area to screen coordinates (for percentage calculation)
            const intersectionScreenArea = intersectionArea * zoom * zoom;
            
            // Calculate what percentage of viewport this node covers
            const viewportCoveragePercent = (intersectionScreenArea / viewportArea) * 100;
            
            // Calculate true node area in graph coordinates (not zoomed)
            const trueNodeArea = bb.w * bb.h;
            
            // Calculate adjusted threshold based on true node size relative to all nodes
            const adjustedThreshold = this.calculateAdjustedThreshold(trueNodeArea);
            
            // Check if node center is within the specified radius of viewport center
            const isAtCenter = distanceFromCenter <= centerRadius;
            
            nodeInfos.push({
                nodeId: node.id(),
                label: node.data('label') || node.id(),
                type: node.data('type') || 'unknown',
                viewportCoveragePercent: Math.round(viewportCoveragePercent * 100) / 100, // Round to 2 decimals
                adjustedThreshold: adjustedThreshold,
                isAtCenter: isAtCenter,
                distanceFromCenter: Math.round(distanceFromCenter * 100) / 100, // Round to 2 decimals
                boundingBox: {
                    x1: Math.round(bb.x1 * 100) / 100,
                    y1: Math.round(bb.y1 * 100) / 100,
                    x2: Math.round(bb.x2 * 100) / 100,
                    y2: Math.round(bb.y2 * 100) / 100,
                    width: Math.round(bb.w * 100) / 100,
                    height: Math.round(bb.h * 100) / 100
                }
            });
        });
        
        // Sort by viewport coverage (largest first), then by distance from center
        nodeInfos.sort((a, b) => {
            if (Math.abs(a.viewportCoveragePercent - b.viewportCoveragePercent) > 0.01) {
                return b.viewportCoveragePercent - a.viewportCoveragePercent;
            }
            return a.distanceFromCenter - b.distanceFromCenter;
        });
        
        return nodeInfos;
    }
    
    /**
     * Get the primary node at viewport center (the largest node covering the center)
     * 
     * @param centerRadius - Radius around viewport center to consider (in graph coordinates). Default: 100
     * @returns The primary node at center, or null if none found
     */
    public getPrimaryNodeAtViewportCenter(centerRadius: number = 100): NodeViewportInfo | null {
        const nodes = this.getNodesAtViewportCenter(centerRadius);
        
        // Filter to only nodes at center, then return the largest one
        const centerNodes = nodes.filter(n => n.isAtCenter);
        return centerNodes.length > 0 ? centerNodes[0] : null;
    }
    
    /**
     * Log viewport center information (for debugging)
     * 
     * @param centerRadius - Radius around viewport center to consider (in graph coordinates). Default: 100
     */
    public logViewportCenterInfo(centerRadius: number = 100): void {
        const nodes = this.getNodesAtViewportCenter(centerRadius);
        
        if (nodes.length === 0) {
            this.logger.debug('No nodes found at viewport center');
            return;
        }
        
        const primaryNode = this.getPrimaryNodeAtViewportCenter(centerRadius);
        const centerNodes = nodes.filter(n => n.isAtCenter);
        
        const info = primaryNode ? 
            `Primary: "${primaryNode.label}" (${primaryNode.type}), ` +
            `${primaryNode.viewportCoveragePercent}% coverage, threshold: ${primaryNode.adjustedThreshold}`
            : 'No primary node at center';
        
        this.logger.debug(
            `Viewport center: ${nodes.length} nodes total, ${centerNodes.length} at center. ${info}`
        );
    }
    
}



