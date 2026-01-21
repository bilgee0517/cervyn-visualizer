/**
 * View Manager for Cytoscape
 * Handles depth levels, progressive disclosure, and node visibility
 */

import { DEPTH_LEVELS } from '../shared/types';
import { logMessage, calculateNodeImportance, safeGetDescendants, safeGetChildren } from '../shared/utils';
import { StateManager } from '../shared/state-manager';
import { StyleManager, StyleLayer } from './style-manager';

export class ViewManager {
    private vscode: any;
    private stateManager: StateManager;
    private styleManager: StyleManager | null = null;
    
    constructor(vscode: any, stateManager: StateManager) {
        this.vscode = vscode;
        this.stateManager = stateManager;
    }
    
    /**
     * Set StyleManager instance (must be called after initialization)
     */
    public setStyleManager(styleManager: StyleManager): void {
        this.styleManager = styleManager;
    }
    
    /**
     * Apply smart initial state
     * Note: This method no longer handles view/visibility - use setViewDepth() for that
     * @param allNodes - If true, update all nodes. If false, only update nodes without importance set.
     */
    applySmartInitialState(allNodes: boolean = true): void {
        const cy = this.stateManager.getCy();
        if (!cy) return;
        
        logMessage(this.vscode, `Applying smart initial state (allNodes: ${allNodes})`);
        
        let updatedCount = 0;
        let compoundCount = 0;
        
        // Calculate node importance
        cy.nodes().forEach((node: any) => {
            if (allNodes || node.data('importance') === undefined) {
            const importance = calculateNodeImportance(node);
            node.data('importance', importance);
                updatedCount++;
            }
        });
        
        // CRITICAL: Mark nodes with children as compound (for LOD system)
        // This is needed for workflow layer nodes created via MCP
        // Also fixes stale childCount metadata from graph-state.json
        cy.nodes().forEach((node: any) => {
            try {
                // Check if node has children (is a parent)
                const children = cy.nodes(`[parent = "${node.id()}"]`);
                if (children.length > 0) {
                    // Validate all children actually exist and have valid parent references
                    let allChildrenValid = true;
                    children.forEach((child: any) => {
                        const childParent = child.data('parent');
                        if (childParent !== node.id()) {
                            logMessage(this.vscode, `[WARN] Child "${child.id()}" parent mismatch: expected "${node.id()}", got "${childParent}"`);
                            allChildrenValid = false;
                        }
                    });
                    
                    if (allChildrenValid) {
                        // Always update isCompound and childCount (fixes stale data)
                        if (!node.data('isCompound')) {
                            node.data('isCompound', true);
                            // Set collapsed by default (like code layer)
                            if (node.data('isCollapsed') === undefined) {
                                node.data('isCollapsed', true);
                            }
                            compoundCount++;
                        }
                        // CRITICAL: Fix stale childCount (prevents fcose confusion)
                        const currentChildCount = node.data('childCount') || 0;
                        if (currentChildCount !== children.length) {
                            node.data('childCount', children.length);
                            logMessage(this.vscode, `[INFO] Fixed childCount for "${node.id()}": ${currentChildCount} → ${children.length}`);
                        }
                    }
                } else {
                    // Node has no children - ensure isCompound is false
                    if (node.data('isCompound')) {
                        logMessage(this.vscode, `[WARN] Node "${node.id()}" marked as compound but has no children - removing flag`);
                        node.data('isCompound', false);
                        node.data('childCount', 0);
                    }
                }
            } catch (error) {
                logMessage(this.vscode, `[ERROR] Failed to check children for node "${node.id()}": ${error}`);
            }
        });
        
        logMessage(this.vscode, `Smart initial state applied - importance: ${updatedCount} nodes, compound flags: ${compoundCount} nodes`);
        
        // Note: Visibility is now controlled by zoom-based LOD system
        // Initial visibility will be set after first layout completes
    }
    


    /**
     * Reapply depth styling (public method for external calls)
     */
    public reapplyDepthStyling(depth: number): void {
        const cy = this.stateManager.getCy();
        if (!cy) return;
        
        logMessage(this.vscode, `Reapplying depth styling for depth: ${depth}`);
        const allNodes = cy.nodes();
        this.applyDepthBasedStyling(depth, allNodes);
    }
    
    /**
     * Set view depth level
     * NOTE: With new DepthCollectionManager architecture, this is now only used for styling
     * The actual node filtering is handled by pre-computed collections in CytoscapeCore
     */
    setViewDepth(depth: number): void {
        const cy = this.stateManager.getCy();
        if (!cy) {
            logMessage(this.vscode, '[ERROR] setViewDepth: Cytoscape instance is null');
            return;
        }
        
        const totalNodes = cy.nodes().length;
        const totalEdges = cy.edges().length;
        
        logMessage(this.vscode, 
            `[ViewManager] setViewDepth(${depth}) - graph has ${totalNodes} nodes, ${totalEdges} edges (pre-filtered by DepthCollectionManager)`
        );
        
        // Apply depth-based styling to the pre-filtered nodes
        const allNodes = cy.nodes();
        this.applyDepthBasedStyling(depth, allNodes);
        
        logMessage(this.vscode, `[ViewManager] ✓ Depth styling applied for depth ${depth}`);
    }
    
    /**
     * Apply depth-based styling: only current depth layer gets colors, parents become outlines
     * REFACTORED to use StyleManager - NO INLINE STYLES!
     */
    private applyDepthBasedStyling(depth: number, allNodes: any): void {
        const cy = this.stateManager.getCy();
        if (!cy) {
            logMessage(this.vscode, '[ERROR] applyDepthBasedStyling: cy is null');
            return;
        }
        
        if (!this.styleManager) {
            logMessage(this.vscode, '[ERROR] applyDepthBasedStyling: styleManager is null!');
            console.error('[ViewManager] StyleManager is null - cannot apply depth styling!');
            return;
        }
        
        logMessage(this.vscode, `Applying depth-based styling for depth: ${depth}`);
        console.log('[ViewManager] applyDepthBasedStyling called, depth:', depth);
        
        // Collect nodes for target depth and parent depth
        const targetNodes: any[] = [];
        const parentNodes: any[] = [];
        
        allNodes.forEach((node: any) => {
            const type = node.data('type');
            const isTargetDepth = this.isNodeAtTargetDepth(type, depth);
            
            if (isTargetDepth) {
                targetNodes.push(node);
            } else {
                parentNodes.push(node);
            }
        });
        
        console.log('[ViewManager] Target nodes:', targetNodes.length, 'Parent nodes:', parentNodes.length);
        
        // Use StyleManager to apply classes instead of inline styles
        // This ensures zoom classes aren't overridden!
        if (targetNodes.length > 0) {
            this.styleManager.applyClasses(
                targetNodes,
                ['depth-target'],
                StyleLayer.DEPTH
            );
        }
        
        if (parentNodes.length > 0) {
            this.styleManager.applyClasses(
                parentNodes,
                ['depth-parent'],
                StyleLayer.DEPTH
            );
        }
        
        logMessage(
            this.vscode,
            `Styled ${targetNodes.length} target nodes and ${parentNodes.length} parent nodes via StyleManager`
        );
        console.log('[ViewManager] ✓ Depth styling applied via StyleManager (no inline styles!)');
    }
    
    /**
     * Check if a node type matches the target depth level
     */
    private isNodeAtTargetDepth(type: string, depth: number): boolean {
        switch(depth) {
            case DEPTH_LEVELS.FOLDERS_ONLY:
                return type === 'directory';
            case DEPTH_LEVELS.FILES:
                return type === 'file';
            case DEPTH_LEVELS.CLASSES:
                return type === 'class';
            case DEPTH_LEVELS.FUNCTIONS:
                return type === 'function';
            default:
                return false;
        }
    }
    
    /**
     * DEPRECATED: Old inline style methods
     * These are no longer used - kept only for reference
     */
    private applyColoredStyle(node: any, type: string): void {
        // DEPRECATED - This method applied inline styles which override zoom classes
        // Now handled by StyleManager with .depth-target class
        console.warn('[ViewManager] applyColoredStyle called - THIS SHOULD NOT HAPPEN!');
        logMessage(this.vscode, '[WARN] applyColoredStyle called - should use StyleManager');
    }
    
    private applyOutlineStyle(node: any, type: string): void {
        // DEPRECATED - This method applied inline styles which override zoom classes  
        // Now handled by StyleManager with .depth-parent class
        console.warn('[ViewManager] applyOutlineStyle called - THIS SHOULD NOT HAPPEN!');
        logMessage(this.vscode, '[WARN] applyOutlineStyle called - should use StyleManager');
    }
    
    /**
     * Show only folders
     */
    private showFoldersOnly(allNodes: any, allEdges: any): void {
        const cy = this.stateManager.getCy();
        if (!cy) {
            logMessage(this.vscode, '[ERROR] showFoldersOnly: cy is null');
            return;
        }
        
        allNodes.style('display', 'none');
        
        const folderNodes = allNodes.filter('[type="directory"][isCompound]');
        logMessage(this.vscode, `[INFO] Found ${folderNodes.length} folder nodes for FOLDERS_ONLY depth`);
        
        folderNodes.forEach((node: any) => {
            try {
                const children = safeGetDescendants(node, this.vscode);
                
                if (children && children.length > 0) {
                    children.style('display', 'none');
                    node.data('isCollapsed', true);
                } else {
                    logMessage(this.vscode, `[WARN] Folder node "${node.id()}" has no descendants`);
                }
                
                node.style('display', 'element');
                this.styleCollapsedNode(node, children);
            } catch (error) {
                logMessage(this.vscode, `[ERROR] Failed to process folder node "${node.id()}": ${error instanceof Error ? error.message : String(error)}`);
            }
        });
        
        allEdges.forEach((edge: any) => {
            const source = edge.source();
            const target = edge.target();
            const shouldShow = source.style('display') === 'element' && target.style('display') === 'element';
            edge.style('display', shouldShow ? 'element' : 'none');
        });
    }
    
    /**
     * Show files level
     */
    private showFilesLevel(allNodes: any): void {
        allNodes.forEach((node: any) => {
            const type = node.data('type');
            
            if (type === 'directory' || type === 'file') {
                node.style('display', 'element');
                
                if (type === 'file' && node.data('isCompound')) {
                    this.collapseFileNode(node);
                }
                
                if (type === 'directory' && node.data('isCompound')) {
                    this.expandDirectoryNode(node, ['file', 'directory']);
                }
            } else {
                node.style('display', 'none');
            }
        });
    }
    
    /**
     * Show classes level
     */
    private showClassesLevel(allNodes: any): void {
        allNodes.forEach((node: any) => {
            const type = node.data('type');
            
            if (type === 'directory' || type === 'file' || type === 'class') {
                node.style('display', 'element');
                
                if (type === 'class') {
                    node.connectedEdges().style('display', 'element');
                }
                
                if (type === 'file' && node.data('isCompound')) {
                    this.expandFileNodeShowClasses(node);
                }
                
                if (type === 'directory' && node.data('isCompound') && node.data('isCollapsed')) {
                    this.expandDirectoryNode(node, ['file', 'directory', 'class']);
                }
            } else if (type === 'function') {
                node.style('display', 'none');
            }
        });
    }
    
    /**
     * Show everything
     */
    private showEverything(allNodes: any): void {
        allNodes.forEach((node: any) => {
            node.style('display', 'element');
            node.connectedEdges().style('display', 'element');
            
            if (node.data('isCompound')) {
                this.expandCompoundNode(node);
            }
        });
    }
    
    /**
     * Collapse file node
     */
    private collapseFileNode(node: any): void {
        try {
            const children = safeGetDescendants(node, this.vscode);
            if (children && children.length > 0) {
                children.style('display', 'none');
                node.data('isCollapsed', true);
                this.styleCollapsedNode(node, children);
            } else {
                logMessage(this.vscode, `[WARN] collapseFileNode: node "${node.id()}" has no descendants to collapse`);
            }
        } catch (error) {
            logMessage(this.vscode, `[ERROR] collapseFileNode failed for node "${node.id()}": ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Expand directory node
     */
    private expandDirectoryNode(node: any, allowedTypes: string[]): void {
        try {
            const children = safeGetChildren(node, this.vscode);
            children.forEach((child: any) => {
                if (allowedTypes.includes(child.data('type'))) {
                    child.style('display', 'element');
                    child.connectedEdges().style('display', 'element');
                }
            });
            node.data('isCollapsed', false);
            this.styleExpandedNode(node);
        } catch (error) {
            logMessage(this.vscode, `[ERROR] expandDirectoryNode failed for node "${node.id()}": ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Expand file node to show classes
     */
    private expandFileNodeShowClasses(node: any): void {
        try {
            const children = safeGetChildren(node, this.vscode);
            children.forEach((child: any) => {
                const childType = child.data('type');
                if (childType === 'class') {
                    child.style('display', 'element');
                    child.connectedEdges().style('display', 'element');
                } else if (childType === 'function') {
                    child.style('display', 'none');
                }
            });
            
            if (node.data('isCollapsed')) {
                node.data('isCollapsed', false);
                this.styleExpandedNode(node);
            }
        } catch (error) {
            logMessage(this.vscode, `[ERROR] expandFileNodeShowClasses failed for node "${node.id()}": ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Expand compound node
     */
    private expandCompoundNode(node: any): void {
        try {
            const children = safeGetDescendants(node, this.vscode);
            children.style('display', 'element');
            children.forEach((child: any) => {
                child.connectedEdges().style('display', 'element');
            });
            node.data('isCollapsed', false);
            this.styleExpandedNode(node);
        } catch (error) {
            logMessage(this.vscode, `[ERROR] expandCompoundNode failed for node "${node.id()}": ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Style collapsed node
     */
    private styleCollapsedNode(node: any, children: any): void {
        const originalLabel = node.data('label').replace(/^[▶▼]\s/, '');
        const childCount = children && children.length > 0 ? ` [${children.length}]` : '';
        node.style({
            'min-width': '100px',
            'min-height': '70px',
            'label': `${ICONS.COLLAPSED} ${originalLabel}${childCount}`,
            'background-opacity': 0.5,
            'border-style': 'dashed',
            'visibility': 'visible',
            'opacity': 1
        });
    }
    
    /**
     * Style expanded node
     */
    private styleExpandedNode(node: any): void {
        const originalLabel = node.data('label').replace(/^[▶▼]\s/, '');
        node.style({
            'label': `${ICONS.EXPANDED} ${originalLabel}`,
            'background-opacity': 0.15,
            'border-style': 'solid'
        });
    }
    
    /**
     * Hide disconnected edges
     */
    private hideDisconnectedEdges(allEdges: any): void {
        let visibleEdgeCount = 0;
        allEdges.forEach((edge: any) => {
            const source = edge.source();
            const target = edge.target();
            
            // Hide edge if EITHER source OR target is hidden
            if (source.style('display') === 'none' || target.style('display') === 'none') {
                edge.style('display', 'none');
            } else {
                visibleEdgeCount++;
            }
        });
        logMessage(this.vscode, `After hiding disconnected edges: ${visibleEdgeCount} visible edges`);
    }
    
    /**
     * Highlight entry points
     */
    highlightEntryPoints(): void {
        const cy = this.stateManager.getCy();
        if (!cy) return;
        
        const entryPoints = cy.nodes('[isEntryPoint]');
        if (entryPoints.length > 0) {
            logMessage(this.vscode, `Found ${entryPoints.length} entry points`);
            
            entryPoints.style({
                'display': 'element',
                'z-index': 10,
            });
            
            // Removed automatic fit to preserve user's camera position
        }
    }
}



