/**
 * Utility functions shared across webview modules
 */

/**
 * Log message to VS Code output
 */
export function logMessage(vscode: any, message: string): void {
    vscode.postMessage({ type: 'log', message });
}

/**
 * Check if two bounding boxes overlap
 */
export function boxesOverlap(bb1: any, bb2: any): boolean {
    return !(bb1.x2 < bb2.x1 || bb1.x1 > bb2.x2 || bb1.y2 < bb2.y1 || bb1.y1 > bb2.y2);
}

/**
 * Calculate node importance score for positioning
 */
export function calculateNodeImportance(node: any): number {
    let score = 0;
    
    if (node.data('isEntryPoint')) score += 100;
    
    const dependents = node.data('dependents') || 0;
    score += dependents * 10;
    
    const loc = node.data('linesOfCode') || 0;
    score += Math.log10(loc + 1) * 5;
    
    const daysSinceChange = node.data('daysSinceLastChange') ?? Infinity;
    if (daysSinceChange < 7) score += 20;
    else if (daysSinceChange < 30) score += 10;
    else if (daysSinceChange < 90) score += 5;
    
    return score;
}

/**
 * Update zoom level display
 */
export function updateZoomDisplay(cy: any): void {
    if (!cy) return;
    const zoom = cy.zoom();
    const percent = Math.round(zoom * 100);
    const zoomLevelEl = document.getElementById('zoomLevel');
    if (zoomLevelEl) {
        zoomLevelEl.textContent = `${percent}%`;
    }
}

/**
 * Update statistics display
 */
export function updateStats(graphData: { nodes: any[]; edges: any[] }): void {
    const nodeCountEl = document.getElementById('nodeCount');
    const edgeCountEl = document.getElementById('edgeCount');
    if (nodeCountEl) {
        nodeCountEl.textContent = `${graphData.nodes.length} nodes`;
    }
    if (edgeCountEl) {
        edgeCountEl.textContent = `${graphData.edges.length} edges`;
    }
}

/**
 * Update stats display for focused view
 */
export function updateFocusedStats(visibleCount: number, totalCount: number): void {
    const nodeCountEl = document.getElementById('nodeCount');
    if (nodeCountEl) {
        nodeCountEl.textContent = `${visibleCount} of ${totalCount} nodes`;
    }
}

/**
 * Safe wrapper for node.descendants() that handles errors gracefully
 * Returns empty collection if node is invalid or not a compound node
 */
export function safeGetDescendants(node: any, vscode?: any): any {
    try {
        // Check if node exists and is valid
        if (!node) {
            if (vscode) {
                logMessage(vscode, '[WARN] safeGetDescendants: node is null or undefined');
            }
            return node?.cy?.collection() || [];
        }

        // Check if node is a compound node
        if (!node.isNode || !node.isNode()) {
            if (vscode) {
                logMessage(vscode, `[WARN] safeGetDescendants: object is not a valid node`);
            }
            return node.cy?.collection() || [];
        }

        // Check if node has descendants method
        if (typeof node.descendants !== 'function') {
            if (vscode) {
                logMessage(vscode, `[WARN] safeGetDescendants: node "${node.id?.() || 'unknown'}" does not have descendants method`);
            }
            return node.cy?.collection() || [];
        }

        // Check if node is a compound node (has isCompound data)
        const isCompound = node.data('isCompound');
        if (!isCompound) {
            if (vscode) {
                logMessage(vscode, `[WARN] safeGetDescendants: node "${node.id()}" (type: ${node.data('type')}) is not marked as compound`);
            }
            return node.cy.collection();
        }

        // Safely call descendants
        const descendants = node.descendants();
        return descendants;
        
    } catch (error) {
        if (vscode) {
            logMessage(vscode, `[ERROR] safeGetDescendants failed: ${error instanceof Error ? error.message : String(error)}`);
            if (error instanceof Error && error.stack) {
                logMessage(vscode, `[ERROR] Stack trace: ${error.stack.split('\n').slice(0, 3).join(' | ')}`);
            }
        }
        
        // Return empty collection on error
        try {
            return node?.cy?.collection() || [];
        } catch {
            return [];
        }
    }
}

/**
 * Safe wrapper for node.children() that handles errors gracefully
 * Returns empty collection if node is invalid or not a compound node
 */
export function safeGetChildren(node: any, vscode?: any): any {
    try {
        // Check if node exists and is valid
        if (!node || !node.isNode || !node.isNode()) {
            if (vscode) {
                logMessage(vscode, `[WARN] safeGetChildren: invalid node`);
            }
            return node?.cy?.collection() || [];
        }

        // Check if node has children method
        if (typeof node.children !== 'function') {
            if (vscode) {
                logMessage(vscode, `[WARN] safeGetChildren: node "${node.id?.() || 'unknown'}" does not have children method`);
            }
            return node.cy?.collection() || [];
        }

        // Safely call children
        return node.children();
        
    } catch (error) {
        if (vscode) {
            logMessage(vscode, `[ERROR] safeGetChildren failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Return empty collection on error
        try {
            return node?.cy?.collection() || [];
        } catch {
            return [];
        }
    }
}



