/**
 * Camera Manager for Cytoscape
 * Handles focusing and zooming to nodes with appropriate zoom levels
 */

import { CONFIG } from '../shared/types';
import { logMessage } from '../shared/utils';
import { StateManager } from '../shared/state-manager';
import { ANIMATION_SEMANTIC } from '../../config/animations';
import { StyleManager, StyleLayer } from './style-manager';

export interface FocusOptions {
    /** Padding around the node (in pixels). Default: 50 */
    padding?: number;
    /** Duration of animation in milliseconds. Default: 500 */
    duration?: number;
    /** Whether to animate the transition. Default: true */
    animate?: boolean;
    /** Target zoom level (overrides auto-calculated zoom). If not provided, zoom is calculated automatically */
    zoom?: number;
    /** Whether to ensure the node is visible before focusing. Default: true */
    ensureVisible?: boolean;
}

export interface NodeSearchResult {
    nodeId: string;
    label: string;
    type: string;
    path?: string;
    matchScore: number;
}

export class CameraManager {
    private vscode: any;
    private stateManager: StateManager;
    private styleManager?: StyleManager;
    
    constructor(vscode: any, stateManager: StateManager) {
        this.vscode = vscode;
        this.stateManager = stateManager;
    }
    
    /**
     * Set the StyleManager instance (injected from CytoscapeCore)
     */
    public setStyleManager(styleManager: StyleManager): void {
        this.styleManager = styleManager;
    }
    
    /**
     * Clear selection (remove selected class from all nodes and edges)
     * Uses StyleManager for centralized style management
     */
    public clearSelection(): void {
        if (!this.styleManager) {
            // Fallback to direct class removal if StyleManager not available
            const cy = this.stateManager.getCy();
            if (!cy) return;
            cy.nodes().removeClass('selected');
            cy.edges().removeClass('selected');
            return;
        }
        
        const cy = this.stateManager.getCy();
        if (!cy) return;
        
        // Use StyleManager to clear interaction layer
        this.styleManager.clearLayer(StyleLayer.INTERACTION);
    }
    
    /**
     * Focus on a specific node by ID
     * Centers the camera on the node and adjusts zoom to show it clearly
     * 
     * @param nodeId - ID of the node to focus on
     * @param options - Focus options (padding, duration, animate, zoom)
     * @returns true if successful, false if node not found
     */
    public focusOnNode(nodeId: string, options: FocusOptions = {}): boolean {
        const cy = this.stateManager.getCy();
        if (!cy) {
            logMessage(this.vscode, '[CameraManager] ERROR: Cytoscape instance is null');
            return false;
        }
        
        const node = cy.getElementById(nodeId);
        if (node.length === 0) {
            logMessage(this.vscode, `[CameraManager] Node "${nodeId}" not found`);
            return false;
        }
        
        const targetNode = node[0];
        
        // Ensure node is visible if requested
        if (options.ensureVisible !== false) {
            this.ensureNodeVisible(targetNode);
        }
        
        // Clear previous selection
        this.clearSelection();
        
        // Add selected class to the focused node and connected edges using StyleManager
        if (this.styleManager) {
            this.styleManager.applyInteraction(targetNode, 'selected');
            const connectedEdges = targetNode.connectedEdges();
            
            // Log for debugging
            logMessage(this.vscode, `[CameraManager] Applying selected class to ${connectedEdges.length} connected edges`);
            
            this.styleManager.applyEdgeInteraction(connectedEdges, 'selected');
            
            // Explicitly remove inline color styles from selected edges to ensure CSS takes precedence
            // Inline styles override CSS classes in Cytoscape, so we must remove them
            connectedEdges.forEach((edge: any) => {
                const edgeId = edge.id();
                const edgeType = edge.data('edgeType');
                const hasSelectedClass = edge.hasClass('selected');
                
                logMessage(this.vscode, 
                    `[CameraManager] Edge ${edgeId} (type: ${edgeType}, hasSelected: ${hasSelectedClass}) - removing inline styles`
                );
                
                // Remove all inline color styles - this allows CSS selectors to take effect
                edge.removeStyle('line-color');
                edge.removeStyle('target-arrow-color');
                edge.removeStyle('source-arrow-color');
                edge.removeStyle('width'); // Also remove width to let CSS handle it
            });
            
            // Force Cytoscape to recalculate all styles after removing inline styles
            // This ensures CSS selectors are re-evaluated with the new class
            const cy = this.stateManager.getCy();
            if (cy && cy.style) {
                cy.style().update();
                logMessage(this.vscode, '[CameraManager] Forced style recalculation');
            }
        } else {
            // Fallback to direct class addition if StyleManager not available
            targetNode.addClass('selected');
            const connectedEdges = targetNode.connectedEdges();
            connectedEdges.addClass('selected');
            // Also remove inline styles in fallback mode
            connectedEdges.forEach((edge: any) => {
                edge.removeStyle('line-color');
                edge.removeStyle('target-arrow-color');
                edge.removeStyle('source-arrow-color');
            });
            
            // Force style recalculation
            const cy = this.stateManager.getCy();
            if (cy) {
                cy.style().update();
            }
        }
        
        // Get options with defaults
        const padding = options.padding ?? CONFIG.DEFAULT_PADDING;
        const duration = options.duration ?? ANIMATION_SEMANTIC.focus;
        const animate = options.animate !== false;
        
        try {
            if (options.zoom !== undefined) {
                // Use specified zoom level
                this.focusWithZoom(targetNode, options.zoom, padding, duration, animate);
            } else {
                // Calculate optimal zoom level based on node size
                this.focusWithAutoZoom(targetNode, padding, duration, animate);
            }
            
            logMessage(this.vscode, `[CameraManager] ✓ Focused on node "${nodeId}"`);
            return true;
        } catch (error) {
            logMessage(this.vscode, 
                `[CameraManager] ERROR: Failed to focus on node "${nodeId}": ${error instanceof Error ? error.message : String(error)}`
            );
            return false;
        }
    }
    
    /**
     * Focus on a node with automatically calculated zoom level
     * The zoom is calculated to show the node with appropriate padding
     */
    private focusWithAutoZoom(node: any, padding: number, duration: number, animate: boolean): void {
        const cy = this.stateManager.getCy();
        if (!cy) return;
        
        // Get node bounding box
        const bb = node.boundingBox();
        const nodeWidth = bb.w;
        const nodeHeight = bb.h;
        
        // Get viewport dimensions
        const viewportWidth = cy.width();
        const viewportHeight = cy.height();
        
        // Calculate the area we want to show (node + padding)
        const targetWidth = nodeWidth + padding * 2;
        const targetHeight = nodeHeight + padding * 2;
        
        // Calculate zoom to fit the target area in viewport
        // We want the target area to take up about 60-80% of the viewport for good visibility
        const viewportRatio = Math.min(viewportWidth / targetWidth, viewportHeight / targetHeight);
        const optimalZoom = viewportRatio * 0.7; // 70% of viewport for the node area
        
        // Clamp zoom to valid range
        const clampedZoom = Math.max(CONFIG.MIN_ZOOM, Math.min(CONFIG.MAX_ZOOM, optimalZoom));
        
        // Focus with calculated zoom
        this.focusWithZoom(node, clampedZoom, padding, duration, animate);
    }
    
    /**
     * Focus on a node with a specific zoom level
     */
    private focusWithZoom(node: any, zoom: number, padding: number, duration: number, animate: boolean): void {
        const cy = this.stateManager.getCy();
        if (!cy) return;
        
        // Clamp zoom to valid range
        const clampedZoom = Math.max(CONFIG.MIN_ZOOM, Math.min(CONFIG.MAX_ZOOM, zoom));
        
        // Get node position
        const nodePos = node.position();
        
        // Calculate pan position to center the node
        // The pan is the offset from the graph origin to the viewport center
        const viewportWidth = cy.width();
        const viewportHeight = cy.height();
        
        // Convert node position to screen coordinates at target zoom
        const screenX = nodePos.x * clampedZoom;
        const screenY = nodePos.y * clampedZoom;
        
        // Calculate pan to center the node in viewport
        const panX = viewportWidth / 2 - screenX;
        const panY = viewportHeight / 2 - screenY;
        
        if (animate) {
            // Animate to the new position
            cy.animate({
                pan: { x: panX, y: panY },
                zoom: clampedZoom,
                duration: duration,
                easing: 'ease-out'
            });
        } else {
            // Set immediately
            cy.pan({ x: panX, y: panY });
            cy.zoom(clampedZoom);
        }
    }
    
    /**
     * Ensure a node is visible (make it visible if it's hidden)
     */
    private ensureNodeVisible(node: any): void {
        // Check if node is hidden (opacity-based visibility)
        const opacity = node.style('opacity');
        if (opacity < 0.5) {
            // Node is hidden, make it visible
            node.style({
                'opacity': 1,
                'text-opacity': 1,
                'pointer-events': 'auto',
                'events': 'yes',
                'z-index': 1
            });
            
            // Also ensure parent nodes are visible if it's a child
            let parent = node.parent();
            while (parent && parent.length > 0) {
                const parentNode = parent[0];
                if (parentNode.style('opacity') < 0.5) {
                    parentNode.style({
                        'opacity': 1,
                        'text-opacity': 1,
                        'pointer-events': 'auto',
                        'events': 'yes'
                    });
                }
                parent = parentNode.parent();
            }
            
            // Update edge visibility
            const cy = this.stateManager.getCy();
            if (cy) {
                node.connectedEdges().forEach((edge: any) => {
                    const source = edge.source();
                    const target = edge.target();
                    if (source.style('opacity') > 0.5 && target.style('opacity') > 0.5) {
                        edge.style({
                            'opacity': 1,
                            'pointer-events': 'auto',
                            'events': 'yes'
                        });
                    }
                });
            }
        }
    }
    
    /**
     * Search for nodes by label, ID, or path
     * Returns nodes matching the search query, sorted by relevance
     * 
     * @param query - Search query (searches in label, ID, and path)
     * @param maxResults - Maximum number of results to return. Default: 20
     * @returns Array of matching nodes with match scores
     */
    public searchNodes(query: string, maxResults: number = 20): NodeSearchResult[] {
        const cy = this.stateManager.getCy();
        if (!cy || !query || query.trim().length === 0) {
            return [];
        }
        
        const searchTerm = query.toLowerCase().trim();
        const results: NodeSearchResult[] = [];
        
        // Search through all nodes
        cy.nodes().forEach((node: any) => {
            const data = node.data();
            const label = (data.label || '').toLowerCase();
            const nodeId = (data.id || '').toLowerCase();
            const path = (data.path || '').toLowerCase();
            const type = data.type || 'unknown';
            
            let matchScore = 0;
            
            // Exact ID match gets highest score
            if (nodeId === searchTerm) {
                matchScore = 1000;
            }
            // Exact label match gets high score
            else if (label === searchTerm) {
                matchScore = 900;
            }
            // ID starts with query
            else if (nodeId.startsWith(searchTerm)) {
                matchScore = 800;
            }
            // Label starts with query
            else if (label.startsWith(searchTerm)) {
                matchScore = 700;
            }
            // Path contains query
            else if (path.includes(searchTerm)) {
                matchScore = 600;
            }
            // Label contains query
            else if (label.includes(searchTerm)) {
                matchScore = 500;
            }
            // ID contains query
            else if (nodeId.includes(searchTerm)) {
                matchScore = 400;
            }
            // Fuzzy match (words in label)
            else {
                const labelWords = label.split(/[\s\-_.]+/);
                const queryWords = searchTerm.split(/[\s\-_.]+/);
                let wordMatches = 0;
                queryWords.forEach(qWord => {
                    if (labelWords.some(lWord => lWord.includes(qWord) || qWord.includes(lWord))) {
                        wordMatches++;
                    }
                });
                if (wordMatches > 0) {
                    matchScore = 300 + (wordMatches / queryWords.length) * 100;
                }
            }
            
            if (matchScore > 0) {
                results.push({
                    nodeId: data.id,
                    label: data.label || data.id,
                    type: type,
                    path: data.path,
                    matchScore: matchScore
                });
            }
        });
        
        // Sort by match score (highest first), then by label
        results.sort((a, b) => {
            if (Math.abs(a.matchScore - b.matchScore) > 0.1) {
                return b.matchScore - a.matchScore;
            }
            return a.label.localeCompare(b.label);
        });
        
        // Return top results
        return results.slice(0, maxResults);
    }
    
    /**
     * Find a node by ID (exact match)
     * 
     * @param nodeId - ID of the node to find
     * @returns NodeSearchResult if found, null otherwise
     */
    public findNodeById(nodeId: string): NodeSearchResult | null {
        const cy = this.stateManager.getCy();
        if (!cy) return null;
        
        const node = cy.getElementById(nodeId);
        if (node.length === 0) return null;
        
        const data = node[0].data();
        return {
            nodeId: data.id,
            label: data.label || data.id,
            type: data.type || 'unknown',
            path: data.path,
            matchScore: 1000
        };
    }
    
    /**
     * Focus on the first node matching a search query
     * 
     * @param query - Search query
     * @param options - Focus options
     * @returns true if a node was found and focused, false otherwise
     */
    public focusOnSearch(query: string, options: FocusOptions = {}): boolean {
        const results = this.searchNodes(query, 1);
        if (results.length === 0) {
            logMessage(this.vscode, `[CameraManager] No nodes found matching "${query}"`);
            return false;
        }
        
        return this.focusOnNode(results[0].nodeId, options);
    }
    
    /**
     * Fit multiple nodes in view
     * Useful for showing a group of related nodes
     * 
     * @param nodeIds - Array of node IDs to fit in view
     * @param options - Focus options
     * @returns true if successful, false if no nodes found
     */
    public fitNodes(nodeIds: string[], options: FocusOptions = {}): boolean {
        const cy = this.stateManager.getCy();
        if (!cy) {
            logMessage(this.vscode, '[CameraManager] ERROR: Cytoscape instance is null');
            return false;
        }
        
        const nodes = cy.collection();
        nodeIds.forEach(id => {
            const node = cy.getElementById(id);
            if (node.length > 0) {
                nodes.merge(node);
                
                // Ensure nodes are visible
                if (options.ensureVisible !== false) {
                    this.ensureNodeVisible(node[0]);
                }
            }
        });
        
        if (nodes.length === 0) {
            logMessage(this.vscode, '[CameraManager] No valid nodes found to fit');
            return false;
        }
        
        const padding = options.padding ?? CONFIG.DEFAULT_PADDING;
        const duration = options.duration ?? ANIMATION_SEMANTIC.focus;
        const animate = options.animate !== false;
        
        try {
            if (animate) {
                cy.animate({
                    fit: {
                        eles: nodes,
                        padding: padding
                    },
                    duration: duration,
                    easing: 'ease-out'
                });
            } else {
                cy.fit(nodes, padding);
            }
            
            logMessage(this.vscode, `[CameraManager] ✓ Fitted ${nodes.length} nodes in view`);
            return true;
        } catch (error) {
            logMessage(this.vscode, 
                `[CameraManager] ERROR: Failed to fit nodes: ${error instanceof Error ? error.message : String(error)}`
            );
            return false;
        }
    }
}



