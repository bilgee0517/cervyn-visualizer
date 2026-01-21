/**
 * Layout Manager for Cytoscape
 * Handles all layout algorithms and positioning logic
 */

import { CONFIG } from '../shared/types';
import { logMessage, boxesOverlap } from '../shared/utils';
import { StateManager } from '../shared/state-manager';

export class LayoutManager {
    private vscode: any;
    private stateManager: StateManager;
    private isFirstLayout: boolean = true;
    private zoomLODManager: any = null;
    
    constructor(vscode: any, stateManager: StateManager) {
        this.vscode = vscode;
        this.stateManager = stateManager;
    }
    
    /**
     * Set zoom LOD manager reference (for triggering initial visibility after first layout)
     */
    setZoomLODManager(zoomLODManager: any): void {
        this.zoomLODManager = zoomLODManager;
    }
    
    /**
     * Validate compound graph integrity for debugging
     * This helps identify issues that could cause fCoSE to crash
     */
    private validateCompoundGraphIntegrity(cy: any): { isValid: boolean; issues: string[] } {
        const issues: string[] = [];
        
        try {
            // Check 1: All visible nodes with parents should have visible parents
            const visibleNodes = cy.nodes(':visible');
            visibleNodes.forEach((node: any) => {
                const parentId = node.data('parent');
                if (parentId) {
                    const parent = cy.getElementById(parentId);
                    if (!parent || parent.length === 0) {
                        issues.push(`Node "${node.id()}" has non-existent parent "${parentId}"`);
                    } else if (parent.hidden() || parent.style('display') === 'none') {
                        issues.push(`Node "${node.id()}" is visible but parent "${parentId}" is hidden`);
                    }
                }
            });
            
            // Check 2: All visible compound nodes should be queryable
            const compoundNodes = visibleNodes.filter('[isCompound]');
            compoundNodes.forEach((parent: any) => {
                try {
                    // This is what fCoSE will try to do internally
                    const children = cy.nodes(`[parent = "${parent.id()}"]`);
                    if (children.length === 0) {
                        issues.push(`Compound node "${parent.id()}" marked as compound but has no children`);
                    }
                } catch (error) {
                    issues.push(`Compound node "${parent.id()}" children query failed: ${error}`);
                }
            });
            
            // Check 3: No orphaned edges (edges with hidden endpoints)
            const visibleEdges = cy.edges(':visible');
            visibleEdges.forEach((edge: any) => {
                const source = edge.source();
                const target = edge.target();
                if (!source || source.hidden() || source.style('display') === 'none') {
                    issues.push(`Edge "${edge.id()}" has hidden/missing source`);
                }
                if (!target || target.hidden() || target.style('display') === 'none') {
                    issues.push(`Edge "${edge.id()}" has hidden/missing target`);
                }
            });
            
        } catch (error) {
            issues.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        return {
            isValid: issues.length === 0,
            issues
        };
    }
    
    /**
     * Apply layout to the graph
     * @param layoutName - Layout algorithm name (or 'auto' for layer-based selection)
     * @param layer - Optional layer to determine optimal layout
     */
    applyLayout(layoutName: string, layer?: string): void {
        logMessage(this.vscode, `[LayoutManager] applyLayout("${layoutName}", layer="${layer || 'none'}") called`);
        
        const cy = this.stateManager.getCy();
        logMessage(this.vscode, `[LayoutManager] cy exists: ${!!cy}`);
        
        if (!cy) {
            logMessage(this.vscode, '[ERROR] applyLayout: Cytoscape instance is null or undefined');
            return;
        }
        
        logMessage(this.vscode, `[LayoutManager] cy has ${cy.nodes().length} nodes, ${cy.edges().length} edges`);
        
        // CRITICAL FIX: Temporarily show ALL nodes for layout calculation
        // fcose/cose need to access all nodes to calculate positions properly
        const hiddenNodesBefore = cy.nodes().filter((node: any) => node.style('display') === 'none');
        const hiddenEdgesBefore = cy.edges().filter((edge: any) => edge.style('display') === 'none');
        
        if (hiddenNodesBefore.length > 0) {
            logMessage(this.vscode, `[INFO] Temporarily showing ${hiddenNodesBefore.length} hidden nodes for layout calculation`);
            cy.batch(() => {
                cy.nodes().style('display', 'element');
                cy.edges().style('display', 'element');
            });
        }
        
        const totalNodes = cy.nodes().length;
        const totalEdges = cy.edges().length;
        const visibleNodes = cy.nodes(':visible').length;
        const visibleEdges = cy.edges(':visible').length;
        
        logMessage(this.vscode, `[INFO] Applying layout: ${layoutName} | Total: ${totalNodes} nodes, ${totalEdges} edges | Visible: ${visibleNodes} nodes, ${visibleEdges} edges`);
        
        // For compound layouts (fcose, cose), validate and fix parent-child relationships
        let elementsToLayout;
        if (layoutName === 'fcose' || layoutName === 'cose') {
            logMessage(this.vscode, `[INFO] Preparing compound layout "${layoutName}" - validating compound node structure...`);
            const visibleNodes = cy.nodes(':visible');
            
            // CRITICAL FIX: fCoSE internally calls descendants() on all compound nodes
            // If a parent is visible but children are hidden (or vice versa), fCoSE crashes
            // We need to ensure compound node hierarchy integrity
            
            let fixedCount = 0;
            const nodesWithIssues: string[] = [];
            
            // Pass 1: Check for broken parent references and invisible parents
            visibleNodes.forEach((node: any) => {
                const parentId = node.data('parent');
                if (parentId) {
                    const parent = cy.getElementById(parentId);
                    
                    // Case 1: Parent doesn't exist in the graph
                    if (!parent || parent.length === 0) {
                        logMessage(this.vscode, `[WARN] Node "${node.id()}" has non-existent parent "${parentId}" - removing parent reference`);
                        node.data('parent', undefined);
                        fixedCount++;
                        nodesWithIssues.push(node.id());
                    }
                    // Case 2: Parent exists but is hidden (CRITICAL for fCoSE)
                    else if (parent.hidden() || parent.style('display') === 'none') {
                        logMessage(this.vscode, `[WARN] Node "${node.id()}" has hidden parent "${parentId}" - this breaks fCoSE. Removing parent reference.`);
                        node.data('parent', undefined);
                        fixedCount++;
                        nodesWithIssues.push(node.id());
                    }
                }
            });
            
            // Pass 2: Check compound nodes with hidden children
            // fCoSE will call descendants() on these, which may fail if structure is inconsistent
            const compoundNodes = visibleNodes.filter('[isCompound]');
            compoundNodes.forEach((parent: any) => {
                try {
                    // CRITICAL: Verify the parent node itself is valid and can be accessed
                    if (!parent || parent.length === 0 || !parent.id()) {
                        logMessage(this.vscode, `[ERROR] Invalid compound node detected - removing from layout`);
                        return;
                    }
                    
                    // CRITICAL: Test if descendants() works on this node (fcose will call this internally)
                    try {
                        parent.descendants();
                    } catch (descError) {
                        logMessage(this.vscode, `[ERROR] Compound node "${parent.id()}" has broken descendants() - removing compound flag`);
                        parent.data('_wasCompound', true);
                        parent.data('isCompound', false);
                        fixedCount++;
                        return;
                    }
                    
                    // Try to get children safely
                    const allChildren = cy.nodes(`[parent = "${parent.id()}"]`);
                    const visibleChildren = allChildren.filter(':visible');
                    
                    if (allChildren.length > 0 && visibleChildren.length === 0) {
                        // Parent is visible but ALL children are hidden
                        // This can cause issues with fCoSE's descendants() calls
                        logMessage(this.vscode, `[INFO] Compound node "${parent.id()}" has all children hidden - marking as non-compound for layout`);
                        // Temporarily remove compound flag for this layout
                        parent.data('_wasCompound', true);
                        parent.data('isCompound', false);
                        fixedCount++;
                    }
                } catch (error) {
                    logMessage(this.vscode, `[ERROR] Failed to check children for compound node "${parent.id()}": ${error}`);
                    // If we can't check children, remove compound flag to be safe
                    parent.data('_wasCompound', true);
                    parent.data('isCompound', false);
                    fixedCount++;
                }
            });
            
            if (fixedCount > 0) {
                logMessage(this.vscode, `[INFO] Fixed ${fixedCount} compound node hierarchy issues before fCoSE layout`);
                if (nodesWithIssues.length > 0 && nodesWithIssues.length <= 5) {
                    logMessage(this.vscode, `[DEBUG] Nodes with issues: ${nodesWithIssues.join(', ')}`);
                }
            }
            
            // Now use only visible elements with valid compound structure
            elementsToLayout = cy.elements(':visible');
            
            // Pass 3: CRITICAL - Final compound node validation right before fcose
            // Test that all compound nodes in the layout set are valid
            const layoutCompoundNodes = elementsToLayout.nodes('[isCompound]');
            let invalidCompoundCount = 0;
            layoutCompoundNodes.forEach((node: any) => {
                try {
                    // Test if this node can be accessed safely
                    if (!node || !node.id || !node.isNode || !node.isNode()) {
                        throw new Error('Node is not valid');
                    }
                    // Test if descendants works (fcose will call this)
                    node.descendants();
                } catch (err) {
                    logMessage(this.vscode, `[ERROR] Invalid compound node "${node?.id?.() || 'unknown'}" detected in layout set - removing compound flag`);
                    if (node && node.data) {
                        node.data('_wasCompound', true);
                        node.data('isCompound', false);
                        invalidCompoundCount++;
                    }
                }
            });
            
            if (invalidCompoundCount > 0) {
                logMessage(this.vscode, `[WARN] Removed compound flag from ${invalidCompoundCount} invalid nodes`);
                // Refresh elements to layout after removing invalid compound flags
                elementsToLayout = cy.elements(':visible');
            }
            
            // Final validation: count compound nodes
            const compoundCount = elementsToLayout.nodes('[isCompound]').length;
            logMessage(this.vscode, `[INFO] fCoSE will process ${elementsToLayout.nodes().length} nodes (${compoundCount} compound) and ${elementsToLayout.edges().length} edges`);
            // Final validation: Run integrity check before passing to fCoSE
            const validation = this.validateCompoundGraphIntegrity(cy);
            if (!validation.isValid) {
                logMessage(this.vscode, `[WARN] Compound graph integrity issues detected (${validation.issues.length} issues)`);
                validation.issues.slice(0, 10).forEach(issue => {
                    logMessage(this.vscode, `[WARN]   - ${issue}`);
                });
                if (validation.issues.length > 10) {
                    logMessage(this.vscode, `[WARN]   ... and ${validation.issues.length - 10} more issues`);
                }
            } else {
                logMessage(this.vscode, `[INFO] Compound graph integrity validated successfully`);
            }
            
        } else {
            elementsToLayout = cy.elements(':visible');
        }
        
        if (elementsToLayout.length === 0) {
            logMessage(this.vscode, '[WARN] No elements to layout - aborting layout operation');
            return;
        }
        
        // fCoSE handles disconnected nodes (0 edges) using its repulsion forces
        if (visibleEdges === 0 && visibleNodes > 1) {
            logMessage(this.vscode, `[INFO] No edges detected - fCoSE will use repulsion forces to space nodes`);
        }
        
        // Layer-aware layout selection: fcose for all layers (supports compound nodes)
        // If layoutName is 'auto', automatically select based on layer
        if (layoutName === 'auto') {
            layoutName = 'fcose'; // Use fcose for all layers
            logMessage(this.vscode, `[INFO] Auto-selected layout: ${layoutName} for layer: ${layer}`);
        }
        
        logMessage(this.vscode, `[INFO] Preparing layout configuration for "${layoutName}" (layer: ${layer || 'unknown'})...`);
        
        const visibleNodeCount = cy.nodes(':visible').length;
        const getLayoutConfig = this.stateManager.getLayoutConfig();
        
        let layoutConfig;
        try {
            logMessage(this.vscode, `[INFO] Calling getLayoutConfig("${layoutName}", ${visibleNodeCount}, "${layer}")...`);
            layoutConfig = getLayoutConfig ? 
                getLayoutConfig(layoutName, visibleNodeCount, layer) :
                { name: layoutName };
            logMessage(this.vscode, `[INFO] Layout configuration generated successfully (${layoutConfig.name})`);
        } catch (error) {
            logMessage(this.vscode, `[ERROR] Failed to generate layout config: ${error instanceof Error ? error.message : String(error)}`);
            layoutConfig = { name: layoutName };
        }
        
        // fCoSE handles positioning automatically - no pre-positioning needed
        
        // For fCoSE, log node dimensions to verify sizeMultiplier is being respected
        if (layoutName === 'fcose') {
            logMessage(this.vscode, `[DEBUG] Logging sample node dimensions for fCoSE validation...`);
            const sampleNodes = elementsToLayout.nodes().slice(0, 5);
            sampleNodes.forEach((node: any) => {
                const bb = node.boundingBox();
                const sizeMultiplier = node.data('sizeMultiplier') || 1.0;
                const type = node.data('type');
                logMessage(this.vscode, 
                    `[DEBUG] Node "${node.id()}" (${type}, mult: ${sizeMultiplier.toFixed(1)}): ` +
                    `${Math.round(bb.w)}x${Math.round(bb.h)}px`
                );
            });
        }
        
        logMessage(this.vscode, `[INFO] Creating layout instance for "${layoutName}"...`);
        
        let layout;
        try {
            layout = elementsToLayout.layout(layoutConfig);
            logMessage(this.vscode, `[INFO] Layout instance created successfully`);
        } catch (error) {
            logMessage(this.vscode, `[ERROR] Failed to create layout instance: ${error instanceof Error ? error.message : String(error)}`);
            if (error instanceof Error && error.stack) {
                logMessage(this.vscode, `[ERROR] Stack trace: ${error.stack.split('\n').slice(0, 5).join(' | ')}`);
            }
            return;
        }
        
        layout.on('layoutstart', () => {
            logMessage(this.vscode, `[INFO] Layout started: ${layoutName}`);
        });
        
        try {
            logMessage(this.vscode, `[INFO] Running layout algorithm...`);
            layout.run();
            logMessage(this.vscode, `[INFO] Layout algorithm execution initiated successfully`);
        } catch (error) {
            logMessage(this.vscode, `[ERROR] Layout execution failed: ${error instanceof Error ? error.message : String(error)}`);
            if (error instanceof Error && error.stack) {
                logMessage(this.vscode, `[ERROR] Stack trace: ${error.stack.split('\n').slice(0, 5).join(' | ')}`);
            }
            return;
        }
        
        layout.one('layoutstop', () => {
            logMessage(this.vscode, `[INFO] Layout completed: ${layoutName}`);
            
            // Restore compound flags that were temporarily removed for fCoSE
            if (layoutName === 'fcose' || layoutName === 'cose') {
                cy.nodes('[_wasCompound]').forEach((node: any) => {
                    node.data('isCompound', true);
                    node.removeData('_wasCompound');
                });
            }
            
            // Restore hidden nodes/edges that were temporarily shown for layout
            if (hiddenNodesBefore.length > 0) {
                logMessage(this.vscode, `[INFO] Restoring visibility for ${hiddenNodesBefore.length} nodes that were hidden before layout`);
                cy.batch(() => {
                    hiddenNodesBefore.style('display', 'none');
                    hiddenEdgesBefore.style('display', 'none');
                });
            }
            
            // fCoSE handles overlap prevention and space optimization internally
            // Skip our custom overlap fixing for fCoSE and other constraint-based layouts
            if (layoutName !== 'fcose') {
            logMessage(this.vscode, '[INFO] Applying post-layout overlap fixes...');
            this.fixOverlappingNodes();
            } else {
                logMessage(this.vscode, '[INFO] Layout completed (fCoSE handles overlap prevention natively)');
            }
            
            setTimeout(() => {
                
                // Apply initial zoom-based visibility after first layout completes
                if (this.isFirstLayout && this.zoomLODManager) {
                    logMessage(this.vscode, '[LayoutManager] First layout complete - triggering initial zoom-based visibility');
                    setTimeout(() => {
                        this.zoomLODManager.applyInitialVisibility();
                    }, 200); // Small delay to ensure camera positioning is done
                    this.isFirstLayout = false;
                }
            }, 100);
        });
    }
    
    
    /**
     * Apply smart camera positioning (disabled to preserve user's camera position)
     */



    /**
     * Fix overlapping nodes with iterative approach
     */
    fixOverlappingNodes(): void {
        const cy = this.stateManager.getCy();
        if (!cy) return;
        
        const nodes = cy.nodes(':visible');
        
        // Sort nodes by size (largest first) to minimize repositioning
        const sortedNodes = nodes.sort((a: any, b: any) => {
            const bbA = a.boundingBox();
            const bbB = b.boundingBox();
            const areaA = bbA.w * bbA.h;
            const areaB = bbB.w * bbB.h;
            return areaB - areaA; // Descending order
        });
        
        // Iteratively fix overlaps until no overlaps remain
        const maxIterations = 10;
        let iteration = 0;
        let hasOverlaps = true;
        
        while (hasOverlaps && iteration < maxIterations) {
            hasOverlaps = false;
            iteration++;
            
            // Check each pair of nodes
            for (let i = 0; i < sortedNodes.length; i++) {
                const node1 = sortedNodes[i];
                const bb1 = node1.boundingBox();
                
                for (let j = i + 1; j < sortedNodes.length; j++) {
                    const node2 = sortedNodes[j];
                    const bb2 = node2.boundingBox();
                
                if (boxesOverlap(bb1, bb2)) {
                        this.pushNodesApart(node1, node2, bb1, bb2);
                        hasOverlaps = true;
                    }
                }
            }
            
            if (hasOverlaps) {
                logMessage(this.vscode, `Overlap fix iteration ${iteration}: resolved overlaps`);
            }
        }
        
        if (iteration > 1) {
            logMessage(this.vscode, `Fixed overlaps in ${iteration} iterations`);
        }
        
        // After fixing overlaps, compact the layout to minimize empty space
        this.compactLayout(sortedNodes);
    }
    
    /**
     * Compact layout using breadth-first hierarchical approach
     * Minimizes empty space by analyzing parent-child relationships
     */
    private compactLayout(nodes: any): void {
        const cy = this.stateManager.getCy();
        if (!cy) return;
        
        logMessage(this.vscode, 'Starting hierarchical compaction (BFS)...');
        
        // Step 1: Build hierarchy and identify levels (breadth-first)
        const nodesByLevel = this.buildHierarchyLevels(nodes);
        
        // Step 2: Process each level from root to leaves
        for (let level = 0; level < nodesByLevel.length; level++) {
            const levelNodes = nodesByLevel[level];
            logMessage(this.vscode, `  Level ${level}: ${levelNodes.length} nodes`);
            
            // Step 3: For parent nodes, optimize children layout
            levelNodes.forEach((node: any) => {
                if (node.data('isCompound') && node.children().length > 0) {
                    this.optimizeChildrenLayout(node);
                }
            });
            
            // Step 4: Pack nodes at this level tightly together (horizontal per-level)
            this.packNodesAtLevel(levelNodes, nodes);
        }
        
        // Step 5: Single-pass global compaction (prevent exponential gap accumulation)
        // CRITICAL: Only run once to avoid compounding movements
        // Multiple iterations were causing exponential gap increases (3k → 33k → 169k px!)
        logMessage(this.vscode, '  Running single-pass compaction (with movement limits)...');
        
        // Vertical compaction (reduce row gaps)
        this.compactVertically(nodes);
        
        // Horizontal compaction (reduce column gaps)
        this.compactHorizontally(nodes);
        
        logMessage(this.vscode, '✓ Hierarchical compaction complete');
    }
    
    /**
     * Build hierarchy levels using breadth-first traversal
     */
    private buildHierarchyLevels(nodes: any): any[][] {
        const cy = this.stateManager.getCy();
        if (!cy) return [];
        
        const levels: any[][] = [];
        const visited = new Set<string>();
        const nodesByLevel = new Map<string, number>();
        
        // Find root nodes (no parent or parent not visible)
        const roots = nodes.filter((node: any) => {
            const parentId = node.data('parent');
            return !parentId || !cy.$id(parentId).visible();
        });
        
        // BFS traversal
        const queue: Array<{ node: any; level: number }> = [];
        roots.forEach((node: any) => {
            queue.push({ node, level: 0 });
            visited.add(node.id());
            nodesByLevel.set(node.id(), 0);
        });
        
        while (queue.length > 0) {
            const { node, level } = queue.shift()!;
            
            // Ensure level array exists
            if (!levels[level]) {
                levels[level] = [];
            }
            levels[level].push(node);
            
            // Add children to queue
            if (node.data('isCompound')) {
                node.children().forEach((child: any) => {
                    if (!visited.has(child.id()) && child.visible()) {
                        queue.push({ node: child, level: level + 1 });
                        visited.add(child.id());
                        nodesByLevel.set(child.id(), level + 1);
                    }
                });
            }
        }
        
        return levels;
    }
    
    /**
     * Optimize children layout within a parent node
     * Calculates tight packing for children
     */
    private optimizeChildrenLayout(parent: any): void {
        try {
            const children = parent.children().filter(':visible');
            if (children.length === 0) {
                return;
            }
            
            // Sort children by size (largest first)
            const sortedChildren = children.sort((a: any, b: any) => {
                const aArea = a.boundingBox().w * a.boundingBox().h;
                const bArea = b.boundingBox().w * b.boundingBox().h;
                return bArea - aArea;
            });
            
            // Get parent position
            const parentPos = parent.position();
            const parentBb = parent.boundingBox();
            
            // Calculate grid layout for children
            const padding = 40;
            const childSpacing = 30;
            
            // Start position relative to parent
            const startX = parentPos.x - parentBb.w / 2 + padding;
            const startY = parentPos.y - parentBb.h / 2 + padding;
            
            let currentX = startX;
            let currentY = startY;
            let rowHeight = 0;
            const maxWidth = parentBb.w - padding * 2;
            
            sortedChildren.forEach((child: any, index: number) => {
                const childBb = child.boundingBox();
                
                // Check if we need to wrap to next row
                if (currentX - startX + childBb.w > maxWidth && index > 0) {
                    currentX = startX;
                    currentY += rowHeight + childSpacing;
                    rowHeight = 0;
                }
                
                // Position child
                child.position({
                    x: currentX + childBb.w / 2,
                    y: currentY + childBb.h / 2
                });
                
                currentX += childBb.w + childSpacing;
                rowHeight = Math.max(rowHeight, childBb.h);
            });
        } catch (error) {
            logMessage(this.vscode, `[ERROR] optimizeChildrenLayout failed for parent "${parent.id()}": ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Pack nodes at the same level tightly together
     */
    private packNodesAtLevel(levelNodes: any[], allNodes: any): void {
        if (levelNodes.length <= 1) return;
        
        // Sort nodes by their current position (left to right, top to bottom)
        const sortedNodes = levelNodes.sort((a: any, b: any) => {
            const posA = a.position();
            const posB = b.position();
            const yDiff = posA.y - posB.y;
            if (Math.abs(yDiff) > 100) {
                return yDiff; // Different rows
            }
            return posA.x - posB.x; // Same row
        });
        
        // Try to reduce gaps between nodes
        const maxAttempts = 5;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            let moved = false;
            
            for (let i = 1; i < sortedNodes.length; i++) {
                const prevNode = sortedNodes[i - 1];
                const currentNode = sortedNodes[i];
                
                const prevPos = prevNode.position();
                const currentPos = currentNode.position();
                const prevBb = prevNode.boundingBox();
                const currentBb = currentNode.boundingBox();
                
                // Check if they're on roughly the same row
                const yDiff = Math.abs(currentPos.y - prevPos.y);
                if (yDiff < 100) {
                    // Calculate ideal distance
                    const isCompoundPrev = prevNode.data('isCompound') || false;
                    const isCompoundCurrent = currentNode.data('isCompound') || false;
                    
                    let targetSpacing = CONFIG.MIN_NODE_SPACING;
                    if (isCompoundPrev) targetSpacing += 20;
                    if (isCompoundCurrent) targetSpacing += 20;
                    
                    // Calculate current gap
                    const idealX = prevPos.x + (prevBb.w + currentBb.w) / 2 + targetSpacing;
                    const gap = currentPos.x - idealX;
                    
                    // If there's excessive gap, try to close it
                    if (gap > 50) {
                        const moveDistance = Math.min(gap * 0.5, 50);
                        const newPos = {
                            x: currentPos.x - moveDistance,
                            y: currentPos.y
                        };
                        
                        // Test if this would cause overlaps
                        currentNode.position(newPos);
                        const newBb = currentNode.boundingBox();
                        
                        let hasOverlap = false;
                        for (let j = 0; j < allNodes.length; j++) {
                            const otherNode = allNodes[j];
                            if (otherNode.id() === currentNode.id()) continue;
                            
                            const otherBb = otherNode.boundingBox();
                            if (boxesOverlap(newBb, otherBb)) {
                                hasOverlap = true;
                                break;
                            }
                        }
                        
                        if (hasOverlap) {
                            // Revert
                            currentNode.position(currentPos);
                        } else {
                            moved = true;
                        }
                    }
                }
            }
            
            if (!moved) break; // No more improvements possible
        }
    }
    
    /**
     * Compact vertically by reducing gaps between rows (global)
     */
    private compactVertically(allNodes: any): void {
        // Group nodes by approximate Y position (rows)
        const allVisibleNodes = allNodes.filter(':visible');
        if (allVisibleNodes.length === 0) return;
        
        // Sort all nodes by Y position
        const sortedByY = allVisibleNodes.sort((a: any, b: any) => {
            return a.position().y - b.position().y;
        });
        
        // Identify distinct rows (nodes with similar Y values)
        const rows: any[][] = [];
        const rowThreshold = 50; // Nodes within 50px are considered same row
        
        sortedByY.forEach((node: any) => {
            const nodeY = node.position().y;
            let addedToRow = false;
            
            for (const row of rows) {
                const rowY = row[0].position().y;
                if (Math.abs(nodeY - rowY) < rowThreshold) {
                    row.push(node);
                    addedToRow = true;
                    break;
                }
            }
            
            if (!addedToRow) {
                rows.push([node]);
            }
        });
        
        logMessage(this.vscode, `  Identified ${rows.length} horizontal rows`);
        
        // Compact rows vertically
        for (let i = 1; i < rows.length; i++) {
            const prevRow = rows[i - 1];
            const currentRow = rows[i];
            
            // Find bottom of previous row
            let prevRowBottom = -Infinity;
            prevRow.forEach((node: any) => {
                const bb = node.boundingBox();
                prevRowBottom = Math.max(prevRowBottom, bb.y2);
            });
            
            // Find top of current row
            let currentRowTop = Infinity;
            currentRow.forEach((node: any) => {
                const bb = node.boundingBox();
                currentRowTop = Math.min(currentRowTop, bb.y1);
            });
            
            // Calculate gap
            const gap = currentRowTop - prevRowBottom;
            const minGap = CONFIG.MIN_NODE_SPACING;
            const targetGap = minGap; // Keep 20px extra for breathing room (reduced from 50)
            
            // If gap is excessive, move current row up (with safety limit)
            if (gap > targetGap) {
                const idealMove = gap - targetGap;
                
                // CRITICAL: Limit maximum movement to prevent exponential gaps
                // This prevents the bug where iterations compound: 3k → 33k → 169k px
                const MAX_MOVE = 50; // Maximum 500px movement per row
                const moveUp = Math.min(idealMove, MAX_MOVE);
                
                // Try moving all nodes in current row up
                const originalPositions = currentRow.map((node: any) => ({
                    node,
                    pos: { ...node.position() }
                }));
                
                currentRow.forEach((node: any) => {
                    const pos = node.position();
                    node.position({ x: pos.x, y: pos.y - moveUp });
                });
                
                // Check for overlaps
                let hasOverlap = false;
                for (const node of currentRow) {
                    const bb = node.boundingBox();
                    for (const otherNode of allVisibleNodes) {
                        if (node.id() === otherNode.id()) continue;
                        if (currentRow.includes(otherNode)) continue;
                        
                        const otherBb = otherNode.boundingBox();
                        if (boxesOverlap(bb, otherBb)) {
                            hasOverlap = true;
                            break;
                        }
                    }
                    if (hasOverlap) break;
                }
                
                // If overlap, revert
                if (hasOverlap) {
                    originalPositions.forEach(({ node, pos }) => {
                        node.position(pos);
                    });
                } else {
                    logMessage(this.vscode, `    Moved row ${i} up by ${Math.round(moveUp)}px`);
                }
            }
        }
    }
    
    /**
     * Compact horizontally by reducing gaps between columns (global)
     */
    private compactHorizontally(allNodes: any): void {
        // Group nodes by approximate X position (columns)
        const allVisibleNodes = allNodes.filter(':visible');
        if (allVisibleNodes.length === 0) return;
        
        // Sort all nodes by X position
        const sortedByX = allVisibleNodes.sort((a: any, b: any) => {
            return a.position().x - b.position().x;
        });
        
        // Identify distinct columns (nodes with similar X values)
        const columns: any[][] = [];
        const columnThreshold = 50; // Nodes within 50px are considered same column
        
        sortedByX.forEach((node: any) => {
            const nodeX = node.position().x;
            let addedToColumn = false;
            
            for (const column of columns) {
                const columnX = column[0].position().x;
                if (Math.abs(nodeX - columnX) < columnThreshold) {
                    column.push(node);
                    addedToColumn = true;
                    break;
                }
            }
            
            if (!addedToColumn) {
                columns.push([node]);
            }
        });
        
        logMessage(this.vscode, `  Identified ${columns.length} vertical columns`);
        
        // Compact columns horizontally
        for (let i = 1; i < columns.length; i++) {
            const prevColumn = columns[i - 1];
            const currentColumn = columns[i];
            
            // Find rightmost edge of previous column
            let prevColumnRight = -Infinity;
            prevColumn.forEach((node: any) => {
                const bb = node.boundingBox();
                prevColumnRight = Math.max(prevColumnRight, bb.x2);
            });
            
            // Find leftmost edge of current column
            let currentColumnLeft = Infinity;
            currentColumn.forEach((node: any) => {
                const bb = node.boundingBox();
                currentColumnLeft = Math.min(currentColumnLeft, bb.x1);
            });
            
            // Calculate gap
            const gap = currentColumnLeft - prevColumnRight;
            const minGap = CONFIG.MIN_NODE_SPACING;
            const targetGap = minGap + 20; // Keep 20px extra for breathing room (reduced from 50)
            
            // If gap is excessive, move current column left (with safety limit)
            if (gap > targetGap) {
                const idealMove = gap - targetGap;
                
                // CRITICAL: Limit maximum movement to prevent exponential gaps
                const MAX_MOVE = 500; // Maximum 500px movement per column
                const moveLeft = Math.min(idealMove, MAX_MOVE);
                
                // Try moving all nodes in current column left
                const originalPositions = currentColumn.map((node: any) => ({
                    node,
                    pos: { ...node.position() }
                }));
                
                currentColumn.forEach((node: any) => {
                    const pos = node.position();
                    node.position({ x: pos.x - moveLeft, y: pos.y });
                });
                
                // Check for overlaps
                let hasOverlap = false;
                for (const node of currentColumn) {
                    const bb = node.boundingBox();
                    for (const otherNode of allVisibleNodes) {
                        if (node.id() === otherNode.id()) continue;
                        if (currentColumn.includes(otherNode)) continue;
                        
                        const otherBb = otherNode.boundingBox();
                        if (boxesOverlap(bb, otherBb)) {
                            hasOverlap = true;
                            break;
                        }
                    }
                    if (hasOverlap) break;
                }
                
                // If overlap, revert
                if (hasOverlap) {
                    originalPositions.forEach(({ node, pos }) => {
                        node.position(pos);
                    });
                } else {
                    logMessage(this.vscode, `    Moved column ${i} left by ${Math.round(moveLeft)}px`);
                }
            }
        }
    }
    
    /**
     * Push overlapping nodes apart with extra spacing for compound nodes
     */
    private pushNodesApart(node1: any, node2: any, bb1: any, bb2: any): void {
        const pos1 = node1.position();
        const pos2 = node2.position();
        
        const dx = pos2.x - pos1.x || CONFIG.DEFAULT_OFFSET;
        const dy = pos2.y - pos1.y || CONFIG.DEFAULT_OFFSET;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        
        // Calculate spacing with extra padding for compound nodes
        const isCompound1 = node1.data('isCompound') || false;
        const isCompound2 = node2.data('isCompound') || false;
        
        // Base spacing: sum of half-widths + minimum spacing
        let baseSpacing = CONFIG.MIN_NODE_SPACING;
        
        // Add extra spacing for compound nodes (they need more breathing room)
        if (isCompound1) baseSpacing += 30;
        if (isCompound2) baseSpacing += 30;
        
        // Calculate minimum distance needed between node centers
        // Use the actual bounding box dimensions
        const minDistX = (bb1.w + bb2.w) / 2 + baseSpacing;
        const minDistY = (bb1.h + bb2.h) / 2 + baseSpacing;
        
        // Use the larger of the two minimum distances to ensure no overlap
        const minDist = Math.max(minDistX, minDistY);
        
        if (distance < minDist) {
            const pushDistance = (minDist - distance) / 2;
            const pushX = (dx / distance) * pushDistance;
            const pushY = (dy / distance) * pushDistance;
            
            // Only move node2 if node1 is larger or compound (to minimize repositioning)
            const area1 = bb1.w * bb1.h;
            const area2 = bb2.w * bb2.h;
            
            if (area1 >= area2 || isCompound1) {
                // node1 is larger or compound, only move node2
                node2.position({ x: pos2.x + pushX * 2, y: pos2.y + pushY * 2 });
            } else if (area2 > area1) {
                // node2 is larger, only move node1
                node1.position({ x: pos1.x - pushX * 2, y: pos1.y - pushY * 2 });
            } else {
                // Equal size, push both
            node1.position({ x: pos1.x - pushX, y: pos1.y - pushY });
            node2.position({ x: pos2.x + pushX, y: pos2.y + pushY });
            }
        }
    }
}



