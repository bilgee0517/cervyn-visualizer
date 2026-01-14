/**
 * ============================================================================
 * CENTRALIZED STYLE MANAGER
 * ============================================================================
 * 
 * ARCHITECTURE OVERVIEW:
 * This class provides a single source of truth for all Cytoscape style
 * management, following industry best practices:
 * 
 * 1. **Style Layers**: Different systems (depth, interaction, user)
 *    apply styles in separate layers with clear priority
 * 
 * 2. **Class-Based Styling**: Uses Cytoscape classes instead of inline styles
 *    for better performance and maintainability
 * 
 * 3. **Priority System**: Higher priority layers override lower ones predictably
 * 
 * 4. **No Inline Styles**: All styles managed through stylesheet updates
 * 
 * 5. **Debug Mode**: Comprehensive logging for troubleshooting
 * 
 * STYLE LAYER PRIORITY (lowest to highest):
 * 1. BASE (0)        - Default styles from cytoscape-styles.ts
 * 2. DEPTH (10)      - Depth-based coloring and visibility
 * 3. USER (20)       - User-customized colors
 * 4. INTERACTION (30) - Hover, selection, focus states
 * 
 * ============================================================================
 */

import { logMessage } from '../shared/utils';

/**
 * Style layer priorities
 */
export enum StyleLayer {
    BASE = 0,
    DEPTH = 10,
    USER = 20,
    INTERACTION = 30,
}

/**
 * Style class names (prefixed to avoid conflicts)
 */
export const StyleClasses = {
    // Depth layer
    DEPTH_TARGET: 'depth-target',
    DEPTH_PARENT: 'depth-parent',
    
    // LOD (Level of Detail) visibility
    LOD_HIDDEN: 'lod-hidden',
    
    // User customizations
    USER_COLORED: 'user-colored',
    
    // Interaction states
    HOVER: 'hover',
    SELECTED: 'selected',
    FOCUSED: 'focused',
    DIMMED: 'dimmed',
} as const;

/**
 * Style operation for batch updates
 * (Currently unused, reserved for future batch operations)
 */
// interface StyleOperation {
//     nodeIds: string[];
//     addClass?: string[];
//     removeClass?: string[];
//     layer: StyleLayer;
// }

/**
 * Centralized Style Manager
 */
export class StyleManager {
    private vscode: any;
    private cy: any;
    private debugMode: boolean = false; // Disabled by default for production
    
    // Track which classes are applied to which nodes for debugging
    private nodeClasses: Map<string, Set<string>> = new Map();
    
    // Track which classes are applied to which edges for debugging
    private edgeClasses: Map<string, Set<string>> = new Map();
    
    // Track style operations history for debugging
    private operationHistory: Array<{ timestamp: number; operation: string; details: any }> = [];
    private readonly MAX_HISTORY = 100;
    
    constructor(vscode: any, cy: any) {
        this.vscode = vscode;
        this.cy = cy;
        
        this.log('StyleManager initialized');
    }
    
    /**
     * Enable/disable debug mode
     */
    public setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
        this.log(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * Apply style classes to nodes
     * This is the primary method for all style changes
     */
    public applyClasses(
        selector: string | any,
        classNames: string[],
        layer: StyleLayer
    ): void {
        if (!this.cy) {
            this.log('ERROR: Cytoscape instance is null', 'error');
            return;
        }
        
        try {
            // Get nodes
            const nodes = typeof selector === 'string' ? this.cy.$(selector) : selector;
            
            if (nodes.length === 0) {
                this.log(`No nodes matched selector: ${selector}`, 'warn');
                return;
            }
            
            // Apply classes
            nodes.forEach((node: any) => {
                const nodeId = node.id();
                
                // Track classes for this node
                if (!this.nodeClasses.has(nodeId)) {
                    this.nodeClasses.set(nodeId, new Set());
                }
                const nodeClassSet = this.nodeClasses.get(nodeId)!;
                
                // Add each class
                classNames.forEach(className => {
                    node.addClass(className);
                    nodeClassSet.add(className);
                });
            });
            
            this.log(
                `Applied classes [${classNames.join(', ')}] to ${nodes.length} nodes (layer: ${StyleLayer[layer]})`,
                'info'
            );
            
            this.recordOperation('applyClasses', {
                selector: typeof selector === 'string' ? selector : `${selector.length} nodes`,
                classNames,
                layer: StyleLayer[layer],
                nodeCount: nodes.length,
            });
            
        } catch (error) {
            this.log(`ERROR applying classes: ${error}`, 'error');
        }
    }
    
    /**
     * Remove style classes from nodes
     */
    public removeClasses(
        selector: string | any,
        classNames: string[],
        layer: StyleLayer
    ): void {
        if (!this.cy) return;
        
        try {
            const nodes = typeof selector === 'string' ? this.cy.$(selector) : selector;
            
            nodes.forEach((node: any) => {
                const nodeId = node.id();
                const nodeClassSet = this.nodeClasses.get(nodeId);
                
                classNames.forEach(className => {
                    node.removeClass(className);
                    nodeClassSet?.delete(className);
                });
            });
            
            this.log(
                `Removed classes [${classNames.join(', ')}] from ${nodes.length} nodes (layer: ${StyleLayer[layer]})`,
                'info'
            );
            
            this.recordOperation('removeClasses', {
                selector: typeof selector === 'string' ? selector : `${nodes.length} nodes`,
                classNames,
                layer: StyleLayer[layer],
                nodeCount: nodes.length,
            });
            
        } catch (error) {
            this.log(`ERROR removing classes: ${error}`, 'error');
        }
    }
    
    /**
     * Apply style classes to edges
     * This is the primary method for all edge style changes
     */
    public applyEdgeClasses(
        selector: string | any,
        classNames: string[],
        layer: StyleLayer
    ): void {
        if (!this.cy) {
            this.log('ERROR: Cytoscape instance is null', 'error');
            return;
        }
        
        try {
            // Get edges
            const edges = typeof selector === 'string' ? this.cy.$(selector) : selector;
            
            if (edges.length === 0) {
                this.log(`No edges matched selector: ${selector}`, 'warn');
                return;
            }
            
            // Apply classes
            edges.forEach((edge: any) => {
                const edgeId = edge.id();
                
                // Track classes for this edge
                if (!this.edgeClasses.has(edgeId)) {
                    this.edgeClasses.set(edgeId, new Set());
                }
                const edgeClassSet = this.edgeClasses.get(edgeId)!;
                
                // Add each class
                classNames.forEach(className => {
                    edge.addClass(className);
                    edgeClassSet.add(className);
                    
                    // If applying selected class, remove inline color styles to let CSS take precedence
                    // Inline styles have higher specificity than CSS classes in Cytoscape
                    if (className === 'selected') {
                        // Remove all inline color-related styles
                        edge.removeStyle('line-color');
                        edge.removeStyle('target-arrow-color');
                        edge.removeStyle('source-arrow-color');
                        edge.removeStyle('width'); // Also remove width to let CSS handle it
                        
                        // Force Cytoscape to recalculate styles for this edge
                        // This ensures CSS selectors are re-evaluated
                        if (this.cy && this.cy.style) {
                            // Force style update for this specific edge
                            edge.trigger('style');
                        }
                    }
                });
            });
            
            this.log(
                `Applied classes [${classNames.join(', ')}] to ${edges.length} edges (layer: ${StyleLayer[layer]})`,
                'info'
            );
            
            this.recordOperation('applyEdgeClasses', {
                selector: typeof selector === 'string' ? selector : `${selector.length} edges`,
                classNames,
                layer: StyleLayer[layer],
                edgeCount: edges.length,
            });
            
        } catch (error) {
            this.log(`ERROR applying edge classes: ${error}`, 'error');
        }
    }
    
    /**
     * Remove style classes from edges
     */
    public removeEdgeClasses(
        selector: string | any,
        classNames: string[],
        layer: StyleLayer
    ): void {
        if (!this.cy) return;
        
        try {
            const edges = typeof selector === 'string' ? this.cy.$(selector) : selector;
            
            edges.forEach((edge: any) => {
                const edgeId = edge.id();
                const edgeClassSet = this.edgeClasses.get(edgeId);
                
                classNames.forEach(className => {
                    edge.removeClass(className);
                    edgeClassSet?.delete(className);
                });
            });
            
            this.log(
                `Removed classes [${classNames.join(', ')}] from ${edges.length} edges (layer: ${StyleLayer[layer]})`,
                'info'
            );
            
            this.recordOperation('removeEdgeClasses', {
                selector: typeof selector === 'string' ? selector : `${edges.length} edges`,
                classNames,
                layer: StyleLayer[layer],
                edgeCount: edges.length,
            });
            
        } catch (error) {
            this.log(`ERROR removing edge classes: ${error}`, 'error');
        }
    }
    
    /**
     * Clear all classes from a specific layer (for both nodes and edges)
     * This is useful when switching between states (e.g., depth changes)
     */
    public clearLayer(layer: StyleLayer): void {
        if (!this.cy) return;
        
        const classesToClear: string[] = [];
        
        // Determine which classes belong to this layer
        switch (layer) {
            case StyleLayer.DEPTH:
                classesToClear.push(StyleClasses.DEPTH_TARGET, StyleClasses.DEPTH_PARENT);
                break;
            case StyleLayer.USER:
                classesToClear.push(StyleClasses.USER_COLORED);
                break;
            case StyleLayer.INTERACTION:
                classesToClear.push(
                    StyleClasses.HOVER,
                    StyleClasses.SELECTED,
                    StyleClasses.FOCUSED,
                    StyleClasses.DIMMED
                );
                break;
        }
        
        if (classesToClear.length > 0) {
            // Clear from nodes
            classesToClear.forEach(className => {
                this.cy.nodes(`.${className}`).removeClass(className);
            });
            
            // Clear from edges
            classesToClear.forEach(className => {
                this.cy.edges(`.${className}`).removeClass(className);
            });
            
            // Clear from tracking
            this.nodeClasses.forEach(classSet => {
                classesToClear.forEach(className => classSet.delete(className));
            });
            
            this.edgeClasses.forEach(classSet => {
                classesToClear.forEach(className => classSet.delete(className));
            });
            
            this.log(`Cleared layer ${StyleLayer[layer]} (removed ${classesToClear.length} class types from nodes and edges)`, 'info');
            
            this.recordOperation('clearLayer', {
                layer: StyleLayer[layer],
                classesCleared: classesToClear,
            });
        }
    }
    
    /**
     * Replace classes in a layer (clear old, apply new)
     * This is the most common operation for state changes
     */
    public replaceClasses(
        selector: string | any,
        oldClasses: string[],
        newClasses: string[],
        layer: StyleLayer
    ): void {
        this.removeClasses(selector, oldClasses, layer);
        this.applyClasses(selector, newClasses, layer);
    }
    
    /**
     * Apply depth styling (replaces view-manager depth styling logic)
     */
    public applyDepthStyling(depth: number, targetNodeSelector: string, parentNodeSelector: string): void {
        // Clear existing depth classes
        this.clearLayer(StyleLayer.DEPTH);
        
        // Apply new depth classes
        if (targetNodeSelector) {
            this.applyClasses(targetNodeSelector, [StyleClasses.DEPTH_TARGET], StyleLayer.DEPTH);
        }
        
        if (parentNodeSelector) {
            this.applyClasses(parentNodeSelector, [StyleClasses.DEPTH_PARENT], StyleLayer.DEPTH);
        }
        
        this.log(`Applied depth styling for depth ${depth}`, 'info');
    }
    
    /**
     * Apply user color customization
     */
    public applyUserColors(nodeSelectors: string[]): void {
        this.clearLayer(StyleLayer.USER);
        
        nodeSelectors.forEach(selector => {
            this.applyClasses(selector, [StyleClasses.USER_COLORED], StyleLayer.USER);
        });
        
        this.log(`Applied user color customization to ${nodeSelectors.length} node types`, 'info');
    }
    
    /**
     * Apply interaction states (hover, selection, etc.) to nodes
     */
    public applyInteraction(nodes: any, interactionType: 'hover' | 'selected' | 'focused' | 'dimmed'): void {
        const className = StyleClasses[interactionType.toUpperCase() as keyof typeof StyleClasses];
        this.applyClasses(nodes, [className], StyleLayer.INTERACTION);
    }
    
    /**
     * Clear interaction states from nodes
     */
    public clearInteraction(nodes: any, interactionType: 'hover' | 'selected' | 'focused' | 'dimmed'): void {
        const className = StyleClasses[interactionType.toUpperCase() as keyof typeof StyleClasses];
        this.removeClasses(nodes, [className], StyleLayer.INTERACTION);
    }
    
    /**
     * Apply interaction states to edges (hover, selection, etc.)
     */
    public applyEdgeInteraction(edges: any, interactionType: 'hover' | 'selected' | 'focused' | 'dimmed'): void {
        const className = StyleClasses[interactionType.toUpperCase() as keyof typeof StyleClasses];
        this.applyEdgeClasses(edges, [className], StyleLayer.INTERACTION);
    }
    
    /**
     * Clear interaction states from edges
     */
    public clearEdgeInteraction(edges: any, interactionType: 'hover' | 'selected' | 'focused' | 'dimmed'): void {
        const className = StyleClasses[interactionType.toUpperCase() as keyof typeof StyleClasses];
        this.removeEdgeClasses(edges, [className], StyleLayer.INTERACTION);
    }
    
    /**
     * Get debug information about a node's classes
     */
    public getNodeDebugInfo(nodeId: string): { classes: string[]; layers: string[] } {
        const node = this.cy.$id(nodeId);
        if (!node || node.length === 0) {
            return { classes: [], layers: [] };
        }
        
        const classes = Array.from(this.nodeClasses.get(nodeId) || []);
        const layers = this.getLayersForClasses(classes);
        
        return { classes, layers };
    }
    
    /**
     * Get all nodes with a specific class
     */
    public getNodesWithClass(className: string): any {
        return this.cy.$(`.${className}`);
    }
    
    /**
     * Get all edges with a specific class
     */
    public getEdgesWithClass(className: string): any {
        return this.cy.$(`edge.${className}`);
    }
    
    /**
     * Get debug information about an edge's classes
     */
    public getEdgeDebugInfo(edgeId: string): { classes: string[]; layers: string[] } {
        const edge = this.cy.$id(edgeId);
        if (!edge || edge.length === 0) {
            return { classes: [], layers: [] };
        }
        
        const classes = Array.from(this.edgeClasses.get(edgeId) || []);
        const layers = this.getLayersForClasses(classes);
        
        return { classes, layers };
    }
    
    /**
     * Get style operation history
     */
    public getOperationHistory(): Array<{ timestamp: number; operation: string; details: any }> {
        return [...this.operationHistory];
    }
    
    /**
     * Print debug summary
     */
    public printDebugSummary(): void {
        const totalNodes = this.cy.nodes().length;
        const totalEdges = this.cy.edges().length;
        const nodesWithClasses = this.nodeClasses.size;
        const edgesWithClasses = this.edgeClasses.size;
        
        this.log('=== STYLE MANAGER DEBUG SUMMARY ===', 'info');
        this.log(`Total nodes: ${totalNodes}`, 'info');
        this.log(`Nodes with custom classes: ${nodesWithClasses}`, 'info');
        this.log(`Total edges: ${totalEdges}`, 'info');
        this.log(`Edges with custom classes: ${edgesWithClasses}`, 'info');
        
        // Count nodes per class
        const nodeClassCounts: { [key: string]: number } = {};
        this.nodeClasses.forEach(classSet => {
            classSet.forEach(className => {
                nodeClassCounts[className] = (nodeClassCounts[className] || 0) + 1;
            });
        });
        
        // Count edges per class
        const edgeClassCounts: { [key: string]: number } = {};
        this.edgeClasses.forEach(classSet => {
            classSet.forEach(className => {
                edgeClassCounts[className] = (edgeClassCounts[className] || 0) + 1;
            });
        });
        
        this.log('Node class distribution:', 'info');
        Object.entries(nodeClassCounts).forEach(([className, count]) => {
            this.log(`  ${className}: ${count} nodes`, 'info');
        });
        
        this.log('Edge class distribution:', 'info');
        Object.entries(edgeClassCounts).forEach(([className, count]) => {
            this.log(`  ${className}: ${count} edges`, 'info');
        });
        
        this.log(`Recent operations: ${this.operationHistory.length}`, 'info');
        this.log('===================================', 'info');
    }
    
    /**
     * Helper: Get layers for a list of classes
     */
    private getLayersForClasses(classes: string[]): string[] {
        const layers = new Set<string>();
        
        classes.forEach(className => {
            if ([StyleClasses.DEPTH_TARGET, StyleClasses.DEPTH_PARENT].includes(className as any)) {
                layers.add('DEPTH');
            } else if (className === StyleClasses.USER_COLORED) {
                layers.add('USER');
            } else if ([
                StyleClasses.HOVER,
                StyleClasses.SELECTED,
                StyleClasses.FOCUSED,
                StyleClasses.DIMMED
            ].includes(className as any)) {
                layers.add('INTERACTION');
            }
        });
        
        return Array.from(layers);
    }
    
    /**
     * Record an operation for debugging
     */
    private recordOperation(operation: string, details: any): void {
        this.operationHistory.push({
            timestamp: Date.now(),
            operation,
            details,
        });
        
        // Keep history size manageable
        if (this.operationHistory.length > this.MAX_HISTORY) {
            this.operationHistory.shift();
        }
    }
    
    /**
     * Logging helper
     */
    private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
        if (!this.debugMode && level === 'info') return;
        
        const prefix = '[StyleManager]';
        logMessage(this.vscode, `${prefix} ${message}`);
    }
}



