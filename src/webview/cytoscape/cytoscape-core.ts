/**
 * Cytoscape Core - Main controller for Cytoscape functionality
 * Coordinates all modules and manages the Cytoscape instance
 */

import { CONFIG, GraphData } from '../shared/types';
import { logMessage, updateStats, updateZoomDisplay } from '../shared/utils';
import { StateManager } from '../shared/state-manager';
import { InteractionHandlers } from './interaction-handlers';
import { LayoutManager } from './layout-manager';
import { UIController } from './ui-controller';
import { ViewManager } from './view-manager';
import { ZoomBasedLODManager } from './zoom-lod-manager';
import { StyleManager, StyleLayer } from './style-manager';
import { CameraManager } from './camera-manager';

// Cytoscape is loaded globally via script tag in HTML
declare const cytoscape: any;

/**
 * Incremental update request structure
 */
interface IncrementalUpdateRequest {
    addedNodes: any[];
    addedEdges: any[];
    removedNodeIds: string[];
    fullGraph?: GraphData;
    newlyAddedNodeIds?: string[];
}

export class CytoscapeCore {
    private vscode: any;
    private stateManager: StateManager;
    private styleManager: StyleManager | null = null;
    private interactionHandlers: InteractionHandlers;
    private layoutManager: LayoutManager;
    private uiController: UIController;
    private viewManager: ViewManager;
    private zoomLODManager: ZoomBasedLODManager;
    private cameraManager: CameraManager;
    
    // =========================================================================
    // INCREMENTAL UPDATE QUEUE SYSTEM
    // Prevents overlapping updates and race conditions
    // =========================================================================
    private incrementalUpdateQueue: IncrementalUpdateRequest[] = [];
    private isProcessingIncrementalUpdate: boolean = false;
    private pendingTimeouts: Set<NodeJS.Timeout> = new Set();
    private currentUpdateId: number = 0;
    private incrementalModeUpdateId: number = -1; // Track which update set incremental mode
    
    constructor(vscode: any) {
        this.vscode = vscode;
        this.stateManager = new StateManager();
        
        // Initialize controllers
        this.interactionHandlers = new InteractionHandlers(vscode, this.stateManager);
        this.layoutManager = new LayoutManager(vscode, this.stateManager);
        this.uiController = new UIController(vscode, this.stateManager);
        this.viewManager = new ViewManager(vscode, this.stateManager);
        this.zoomLODManager = new ZoomBasedLODManager(vscode);
        this.cameraManager = new CameraManager(vscode, this.stateManager);
        
        this.setupUICallbacks();
    }
    
    /**
     * Setup UI callbacks
     */
    private setupUICallbacks(): void {
        this.uiController.onLayoutChangeCallback((layout: string) => {
            this.layoutManager.applyLayout(layout);
            
            // Recalculate zoom thresholds after layout settles
            if (this.zoomLODManager && this.zoomLODManager.isInitialized()) {
                this.zoomLODManager.recalculateThresholds();
            }
        });
        
        // Depth selector - manual control when adaptive zoom is off
        this.uiController.onDepthChangeCallback((depth: number) => {
            if (!this.zoomLODManager.isAdaptiveZoomEnabled()) {
                logMessage(this.vscode, `[CytoscapeCore] Manual depth change to ${depth}`);
                
                // Map depth number to DepthLevel enum
                const depthLevelMap: any = {
                    0: 'FOLDERS',
                    1: 'FILES',
                    2: 'CLASSES',
                    3: 'FUNCTIONS'
                };
                
                this.zoomLODManager.manuallySetDepthLevel(depthLevelMap[depth]);
            }
        });
        
        this.uiController.onExpandContextCallback(() => {
            this.stateManager.incrementExpandLevel();
            
            const layoutSelectEl = document.getElementById('layoutSelect') as HTMLSelectElement;
            const currentLayout = layoutSelectEl ? layoutSelectEl.value : 'fcose';
            this.layoutManager.applyLayout(currentLayout);
        });
        
        this.uiController.onResetContextCallback(() => {
            this.stateManager.resetExpandLevel();
            
            const layoutSelectEl = document.getElementById('layoutSelect') as HTMLSelectElement;
            const currentLayout = layoutSelectEl ? layoutSelectEl.value : 'fcose';
            this.layoutManager.applyLayout(currentLayout);
        });
    }
    
    /**
     * Initialize Cytoscape instance
     */
    initCytoscape(): void {
        const container = document.getElementById('cy');
        if (!container) {
            console.error('[Webview] Container element #cy not found');
            return;
        }
        
        const cytoscapeStyles = this.stateManager.getCytoscapeStyles();
        if (!cytoscapeStyles) {
            console.error('[Webview] Cannot initialize - cytoscapeStyles not received yet');
            return;
        }
        
        if (this.stateManager.getCy()) {
            console.log('[Webview] Cytoscape already initialized, skipping');
            return;
        }
        
        console.log('[Webview] Initializing Cytoscape instance...');
        
        const cy = cytoscape({
            container: container,
            style: cytoscapeStyles,
            minZoom: CONFIG.MIN_ZOOM,
            maxZoom: CONFIG.MAX_ZOOM,
            wheelSensitivity: CONFIG.WHEEL_SENSITIVITY
        });
        
        this.stateManager.setCy(cy);
        
        // Initialize centralized StyleManager FIRST
        this.styleManager = new StyleManager(this.vscode, cy);
        // Debug mode disabled by default - can be enabled via: styleManager.setDebugMode(true)
        logMessage(this.vscode, '[CytoscapeCore] ✓ StyleManager initialized');
        
        // Inject StyleManager into other systems that need it
        this.viewManager.setStyleManager(this.styleManager);
        this.cameraManager.setStyleManager(this.styleManager);
        this.interactionHandlers.setStyleManager(this.styleManager);
        this.uiController.setStyleManager(this.styleManager);
        
        // Register event handlers
        this.interactionHandlers.registerHandlers();
        
        // Inject CameraManager into InteractionHandlers for optional focus-on-click
        this.interactionHandlers.setCameraManager(this.cameraManager);
        
        // Inject CameraManager into UIController for search functionality
        this.uiController.setCameraManager(this.cameraManager);
        
        // Initialize UI controls
        this.uiController.initializeControls();
        
        // Text scales with node size (using mapData() in cytoscape-styles.ts)
        logMessage(this.vscode, '[CytoscapeCore] ℹ️ Using node-size-adaptive text scaling');
        
        // Listen to zoom events for display update
        cy.on('zoom', () => updateZoomDisplay(cy));
        
        // Initialize zoom-based LOD manager
        const lodInitSuccess = this.zoomLODManager.initialize(cy);
        if (lodInitSuccess) {
            logMessage(this.vscode, '[CytoscapeCore] ✓ Zoom-based LOD system active');
            
            // Wire up layout manager to trigger initial visibility after first layout
            this.layoutManager.setZoomLODManager(this.zoomLODManager);
        } else {
            logMessage(this.vscode, '[CytoscapeCore] WARN: Zoom-based LOD initialization failed');
        }
        
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
        
        console.log('[Webview] ✓ Cytoscape initialized successfully with zoom-based LOD');
        this.stateManager.setConfigReady(true);
    }
    
    /**
     * Update graph with new data
     * NEW ARCHITECTURE: Single graph with zoom-based LOD
     * 
     * PRODUCTION-GRADE: Clears incremental update queue when full update occurs
     */
    updateGraph(graphData: GraphData, layout?: string, activeFilePath?: string, newlyAddedNodeIds?: string[]): void {
        // Clear any pending incremental updates when doing a full update
        this.clearIncrementalUpdateQueue();
        
        const cy = this.stateManager.getCy();
        logMessage(this.vscode, `[CytoscapeCore] updateGraph START - cy exists: ${!!cy}`);
        
        if (!cy) {
            logMessage(this.vscode, '[ERROR] updateGraph: Cytoscape instance is null');
            return;
        }
        
        logMessage(this.vscode, 
            `[CytoscapeCore] updateGraph called with ${graphData?.nodes?.length || 0} nodes, ${graphData?.edges?.length || 0} edges`
        );
        
        if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
            logMessage(this.vscode, '[WARN] updateGraph received empty or invalid graphData - clearing graph');
            // Clear the graph even when empty (important for layer switching)
            cy.elements().remove();
            updateStats({ nodes: [], edges: [] });
            return;
        }
        
        // Full update: disable incremental mode to allow full dimension recalculation
        if (this.zoomLODManager && this.zoomLODManager.isInitialized()) {
            logMessage(this.vscode, '[INFO] Full update: Disabling incremental update mode for dimension recalculation');
            this.zoomLODManager.setIncrementalUpdateMode(false);
        }
        
        // Clear tooltip when graph updates (old nodes are removed, tooltip would show stale data)
        this.interactionHandlers.clearTooltip();
        
        // Load full graph at once
        logMessage(this.vscode, '[INFO] Removing old elements...');
        cy.elements().remove();
        
        logMessage(this.vscode, '[INFO] Adding new nodes and edges...');
        cy.add(graphData.nodes);
        cy.add(graphData.edges);
        
        logMessage(this.vscode, 
            `[INFO] Loaded full graph: ${cy.nodes().length} nodes, ${cy.edges().length} edges`
        );
        
        // Apply initial state setup (importance calculation, compound node icons)
        logMessage(this.vscode, '[INFO] Applying smart initial state...');
        this.viewManager.applySmartInitialState(true);
        
        // Apply layout to the complete graph (positions all nodes)
        const currentLayout = layout || 'fcose';
        logMessage(this.vscode, `[INFO] About to call applyLayout("${currentLayout}")...`);
        logMessage(this.vscode, `[INFO] layoutManager exists: ${!!this.layoutManager}`);
        
        try {
            this.layoutManager.applyLayout(currentLayout);
            logMessage(this.vscode, `[INFO] applyLayout("${currentLayout}") call completed`);
        } catch (error) {
            logMessage(this.vscode, `[ERROR] applyLayout threw error: ${error instanceof Error ? error.message : String(error)}`);
            if (error instanceof Error && error.stack) {
                logMessage(this.vscode, `[ERROR] Stack: ${error.stack}`);
            }
        }
        
        // Update stats display with original graph data
        updateStats(graphData);
        
        // Select newly added nodes from StateSync if provided
        // Use a longer timeout to ensure layout and visibility updates complete
        // Layout completes quickly, but applyInitialVisibility takes ~300ms (100ms + 200ms)
        if (newlyAddedNodeIds && newlyAddedNodeIds.length > 0) {
            logMessage(this.vscode, `[CytoscapeCore] Will select ${newlyAddedNodeIds.length} newly added nodes from StateSync: ${newlyAddedNodeIds.slice(0, 5).join(', ')}${newlyAddedNodeIds.length > 5 ? '...' : ''}`);
            // Wait for layout and visibility updates to complete (layout + applyInitialVisibility ~400-500ms)
            setTimeout(() => {
                logMessage(this.vscode, `[CytoscapeCore] Selecting ${newlyAddedNodeIds.length} newly added nodes from StateSync after layout/visibility complete`);
                this.selectNodesByIds(newlyAddedNodeIds);
            }, 600); // Wait 600ms for layout (fast) + applyInitialVisibility (~300ms) + buffer
        }
        
        logMessage(this.vscode, '[INFO] ✓ Graph update complete, zoom-based LOD will control visibility');
    }
    
    /**
     * Select nodes by their IDs (used for selecting newly added nodes from StateSync)
     * Clears previous selection and selects only the specified nodes and their connected edges
     */
    private selectNodesByIds(nodeIds: string[]): void {
        const cy = this.stateManager.getCy();
        if (!cy) {
            logMessage(this.vscode, '[CytoscapeCore] selectNodesByIds: Cytoscape instance is null');
            return;
        }
        
        if (!this.styleManager) {
            logMessage(this.vscode, '[CytoscapeCore] selectNodesByIds: StyleManager is null');
            return;
        }
        
        try {
            // Clear previous selection
            this.styleManager.clearLayer(StyleLayer.INTERACTION);
            
            // Get nodes by IDs
            const nodesToSelect = cy.collection();
            const edgesToSelect = cy.collection();
            
            nodeIds.forEach(nodeId => {
                const node = cy.getElementById(nodeId);
                if (node.length > 0) {
                    nodesToSelect.merge(node);
                    // Get connected edges
                    const connectedEdges = node.connectedEdges();
                    edgesToSelect.merge(connectedEdges);
                }
            });
            
            if (nodesToSelect.length > 0) {
                // Select the nodes
                this.styleManager.applyInteraction(nodesToSelect, 'selected');
                
                // Select connected edges
                if (edgesToSelect.length > 0) {
                    this.styleManager.applyEdgeInteraction(edgesToSelect, 'selected');
                    
                    // Remove inline styles from selected edges to ensure CSS takes precedence
                    edgesToSelect.forEach((edge: any) => {
                        edge.removeStyle('line-color');
                        edge.removeStyle('target-arrow-color');
                        edge.removeStyle('source-arrow-color');
                        edge.removeStyle('width');
                    });
                }
                
                // Force style recalculation
                if (cy.style) {
                    cy.style().update();
                }
                
                logMessage(this.vscode, `[CytoscapeCore] ✓ Selected ${nodesToSelect.length} nodes and ${edgesToSelect.length} edges`);
            } else {
                logMessage(this.vscode, `[CytoscapeCore] ⚠️  No nodes found to select (checked ${nodeIds.length} IDs)`);
            }
        } catch (error) {
            logMessage(this.vscode, `[CytoscapeCore] ERROR selecting nodes: ${error}`);
            if (error instanceof Error) {
                logMessage(this.vscode, `[CytoscapeCore] Stack: ${error.stack}`);
            }
        }
    }

    /**
     * Update node properties in-place (efficient for property-only changes)
     * This is much more efficient than full graph refresh for simple property updates
     * like roleDescription changes
     * 
     * @param updates Array of { nodeId, updates } objects with property changes
     */
    updateNodeProperties(updates: Array<{ nodeId: string; updates: any }>): void {
        const cy = this.stateManager.getCy();
        if (!cy) {
            logMessage(this.vscode, '[CytoscapeCore] updateNodeProperties: Cytoscape instance is null');
            return;
        }

        if (!updates || updates.length === 0) {
            logMessage(this.vscode, '[CytoscapeCore] updateNodeProperties: No updates provided');
            return;
        }

        logMessage(this.vscode, `[CytoscapeCore] updateNodeProperties: Updating ${updates.length} nodes`);
        
        let successCount = 0;
        let notFoundCount = 0;
        
        // Use batch to make updates more efficient
        cy.batch(() => {
            for (const { nodeId, updates: updateData } of updates) {
                try {
                    const node = cy.getElementById(nodeId);
                    if (node.length > 0) {
                        // Update node data in-place
                        node.data(updateData);
                        successCount++;
                        
                        // If roleDescription was updated, we may need to refresh tooltip if it's currently showing
                        if (updateData.roleDescription !== undefined) {
                            // The tooltip will automatically show new data on next hover/click
                            // No need to manually refresh it here
                        }
                    } else {
                        notFoundCount++;
                        logMessage(this.vscode, `[CytoscapeCore] updateNodeProperties: Node '${nodeId}' not found`);
                    }
                } catch (err) {
                    logMessage(this.vscode, `[CytoscapeCore] updateNodeProperties: Error updating node '${nodeId}': ${err}`);
                    if (err instanceof Error) {
                        logMessage(this.vscode, `  - Stack: ${err.stack}`);
                    }
                }
            }
        });
        
        logMessage(this.vscode, `[CytoscapeCore] updateNodeProperties: ✓ Updated ${successCount} nodes, ${notFoundCount} not found`);
        
        // Trigger style refresh for updated nodes (in case styles depend on updated properties)
        // This is lightweight - Cytoscape will only re-evaluate styles for affected nodes
        if (successCount > 0) {
            try {
                // Get all updated node IDs
                const updatedNodeIds = updates
                    .map(u => u.nodeId)
                    .filter((id, index, self) => self.indexOf(id) === index); // unique
                
                // Trigger style refresh by touching the nodes
                // Cytoscape will automatically re-apply styles based on data changes
                const nodes = cy.collection();
                for (const nodeId of updatedNodeIds) {
                    const node = cy.getElementById(nodeId);
                    if (node.length > 0) {
                        nodes.merge(node);
                    }
                }
                
                if (nodes.length > 0) {
                    // Trigger style recalculation by adding/removing a temporary class
                    // This is a lightweight way to force style refresh
                    nodes.addClass('_property-updated');
                    setTimeout(() => {
                        nodes.removeClass('_property-updated');
                    }, 0);
                }
            } catch (err) {
                logMessage(this.vscode, `[CytoscapeCore] updateNodeProperties: Error refreshing styles: ${err}`);
            }
        }
    }

    /**
     * Update edge properties in-place (efficient for property-only changes)
     * This is much more efficient than full graph refresh for simple property updates
     * like label or edgeType changes
     * 
     * @param updates Array of { edgeId, updates } objects with property changes
     */
    updateEdgeProperties(updates: Array<{ edgeId: string; updates: any }>): void {
        const cy = this.stateManager.getCy();
        if (!cy) {
            logMessage(this.vscode, '[CytoscapeCore] updateEdgeProperties: Cytoscape instance is null');
            return;
        }

        if (!updates || updates.length === 0) {
            logMessage(this.vscode, '[CytoscapeCore] updateEdgeProperties: No updates provided');
            return;
        }

        logMessage(this.vscode, `[CytoscapeCore] updateEdgeProperties: Updating ${updates.length} edges`);
        
        let successCount = 0;
        let notFoundCount = 0;
        
        // Use batch to make updates more efficient
        cy.batch(() => {
            for (const { edgeId, updates: updateData } of updates) {
                try {
                    const edge = cy.getElementById(edgeId);
                    if (edge.length > 0) {
                        // Update edge data in-place
                        edge.data(updateData);
                        successCount++;
                    } else {
                        notFoundCount++;
                        logMessage(this.vscode, `[CytoscapeCore] updateEdgeProperties: Edge '${edgeId}' not found`);
                    }
                } catch (err) {
                    logMessage(this.vscode, `[CytoscapeCore] updateEdgeProperties: Error updating edge '${edgeId}': ${err}`);
                    if (err instanceof Error) {
                        logMessage(this.vscode, `  - Stack: ${err.stack}`);
                    }
                }
            }
        });
        
        logMessage(this.vscode, `[CytoscapeCore] updateEdgeProperties: ✓ Updated ${successCount} edges, ${notFoundCount} not found`);
        
        // Trigger style refresh for updated edges (in case styles depend on updated properties)
        if (successCount > 0) {
            try {
                // Get all updated edge IDs
                const updatedEdgeIds = updates
                    .map(u => u.edgeId)
                    .filter((id, index, self) => self.indexOf(id) === index); // unique
                
                // Trigger style refresh by touching the edges
                const edges = cy.collection();
                for (const edgeId of updatedEdgeIds) {
                    const edge = cy.getElementById(edgeId);
                    if (edge.length > 0) {
                        edges.merge(edge);
                    }
                }
                
                if (edges.length > 0) {
                    // Trigger style recalculation by adding/removing a temporary class
                    edges.addClass('_property-updated');
                    setTimeout(() => {
                        edges.removeClass('_property-updated');
                    }, 0);
                }
            } catch (err) {
                logMessage(this.vscode, `[CytoscapeCore] updateEdgeProperties: Error refreshing styles: ${err}`);
            }
        }
    }

    /**
     * Incremental graph update - only add/remove changed nodes/edges
     * This preserves existing node positions and avoids full layout recalculation
     * 
     * PRODUCTION-GRADE: Uses queue system to prevent overlapping updates and race conditions
     */
    updateGraphIncremental(
        addedNodes: any[],
        addedEdges: any[],
        removedNodeIds: string[],
        fullGraph?: GraphData,
        newlyAddedNodeIds?: string[]
    ): void {
        // Queue the update request
        const request: IncrementalUpdateRequest = {
            addedNodes,
            addedEdges,
            removedNodeIds,
            fullGraph,
            newlyAddedNodeIds
        };
        
        this.incrementalUpdateQueue.push(request);
        logMessage(this.vscode, `[CytoscapeCore] Queued incremental update (queue size: ${this.incrementalUpdateQueue.length})`);
        logMessage(this.vscode, `  - Added nodes: ${addedNodes.length}`);
        logMessage(this.vscode, `  - Added edges: ${addedEdges.length}`);
        logMessage(this.vscode, `  - Removed node IDs: ${removedNodeIds.length}`);
        logMessage(this.vscode, `  - Is processing: ${this.isProcessingIncrementalUpdate}`);
        
        // Process queue if not already processing
        if (!this.isProcessingIncrementalUpdate) {
            this.processIncrementalUpdateQueue();
        }
    }
    
    /**
     * Process the incremental update queue
     * Ensures updates are processed one at a time to prevent race conditions
     * 
     * PRODUCTION-GRADE: Has safety mechanism to recover from stuck state
     */
    private processIncrementalUpdateQueue(): void {
        // PRODUCTION-GRADE: Safety check - if flag is stuck, reset it
        // This prevents permanent deadlock if something went wrong
        if (this.isProcessingIncrementalUpdate) {
            // Check if we've been processing for too long (stuck state)
            // If queue has items but we're stuck processing, something went wrong
            if (this.incrementalUpdateQueue.length > 0) {
                logMessage(this.vscode, '[CytoscapeCore] [SAFETY] Processing flag stuck with items in queue, resetting...');
                this.isProcessingIncrementalUpdate = false;
                // Continue processing below
            } else {
                logMessage(this.vscode, '[CytoscapeCore] Already processing update, skipping queue processing');
                return;
            }
        }
        
        if (this.incrementalUpdateQueue.length === 0) {
            logMessage(this.vscode, '[CytoscapeCore] Update queue is empty');
            // Safety: Ensure incremental mode is reset if queue is empty
            this.ensureIncrementalModeReset();
            return;
        }
        
        // Safety: Reset incremental mode if previous update left it on
        // This prevents the flag from getting stuck
        if (this.zoomLODManager && this.zoomLODManager.isInitialized()) {
            if (this.zoomLODManager.isIncrementalUpdateMode()) {
                logMessage(this.vscode, '[CytoscapeCore] [SAFETY] Resetting incremental mode before starting new update');
                this.zoomLODManager.setIncrementalUpdateMode(false);
                this.incrementalModeUpdateId = -1;
            }
        }
        
        // Mark as processing
        this.isProcessingIncrementalUpdate = true;
        this.currentUpdateId++;
        const updateId = this.currentUpdateId;
        
        // Get the next request (FIFO)
        const request = this.incrementalUpdateQueue.shift()!;
        
        logMessage(this.vscode, `[CytoscapeCore] ========== Processing incremental update #${updateId} ==========`);
        logMessage(this.vscode, `  - Timestamp: ${new Date().toISOString()}`);
        logMessage(this.vscode, `  - Queue remaining: ${this.incrementalUpdateQueue.length}`);
        
        // Execute the update asynchronously to prevent blocking
        // Use setTimeout(0) instead of requestAnimationFrame to ensure it runs in next tick
        // This prevents blocking the current event loop cycle
        setTimeout(() => {
            try {
                this.executeIncrementalUpdate(
                    request.addedNodes,
                    request.addedEdges,
                    request.removedNodeIds,
                    request.fullGraph,
                    updateId,
                    request.newlyAddedNodeIds
                );
            } catch (err) {
                // Safety: If executeIncrementalUpdate throws synchronously, ensure we finish
                logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [CRITICAL] Error before executeIncrementalUpdate: ${err}`);
                this.finishIncrementalUpdate(updateId);
            }
        }, 0);
    }
    
    /**
     * Ensure incremental update mode is reset
     * Production-grade safety method that guarantees the flag is always reset
     */
    private ensureIncrementalModeReset(): void {
        if (this.zoomLODManager && this.zoomLODManager.isInitialized()) {
            if (this.zoomLODManager.isIncrementalUpdateMode()) {
                logMessage(this.vscode, '[CytoscapeCore] [SAFETY] Resetting stuck incremental mode');
                this.zoomLODManager.setIncrementalUpdateMode(false);
                this.incrementalModeUpdateId = -1;
            }
        }
    }
    
    /**
     * Execute a single incremental update
     * Internal method that performs the actual update work
     * 
     * PRODUCTION-GRADE: Uses timeout guard to prevent hanging
     */
    private executeIncrementalUpdate(
        addedNodes: any[],
        addedEdges: any[],
        removedNodeIds: string[],
        fullGraph: GraphData | undefined,
        updateId: number,
        newlyAddedNodeIds?: string[]
    ): void {
        const startTime = Date.now();
        
        // PRODUCTION-GRADE: Timeout guard to prevent hanging
        // If update takes more than 10 seconds, force finish it
        const timeoutGuard = setTimeout(() => {
            if (this.isProcessingIncrementalUpdate && this.currentUpdateId === updateId) {
                logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [TIMEOUT GUARD] Update taking too long, forcing finish`);
                this.finishIncrementalUpdate(updateId);
            }
        }, 10000); // 10 second timeout
        
        try {
            const cy = this.stateManager.getCy();
            
            if (!cy) {
                logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] ERROR: Cytoscape instance is null`);
                clearTimeout(timeoutGuard);
                this.finishIncrementalUpdate(updateId);
                return;
            }

            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Cytoscape instance exists: ✓`);
            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Current nodes: ${cy.nodes().length}, edges: ${cy.edges().length}`);

            // Remove nodes (this will also remove connected edges automatically)
            if (removedNodeIds.length > 0) {
                logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [STEP 1] Removing ${removedNodeIds.length} nodes...`);
                try {
                    // Enable incremental update mode to skip expensive dimension recalculation
                    if (this.zoomLODManager && this.zoomLODManager.isInitialized()) {
                        this.zoomLODManager.setIncrementalUpdateMode(true);
                        this.incrementalModeUpdateId = updateId; // Track which update set it
                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Enabled incremental update mode for removals`);
                    }
                    
                    const nodesToRemove = cy.collection();
                    removedNodeIds.forEach(nodeId => {
                        try {
                            const node = cy.getElementById(nodeId);
                            if (node.length > 0) {
                                nodesToRemove.merge(node);
                            }
                        } catch (err) {
                            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [WARN] Error getting node ${nodeId}: ${err}`);
                        }
                    });
                    
                    if (nodesToRemove.length > 0) {
                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Found ${nodesToRemove.length} nodes to remove`);
                        
                        // Notify ZoomLODManager before removal (async to prevent blocking)
                        if (this.zoomLODManager && this.zoomLODManager.isInitialized()) {
                            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Scheduling ZoomLODManager notification of removals...`);
                            const timeout = setTimeout(() => {
                                if (updateId === this.currentUpdateId) {
                            try {
                                removedNodeIds.forEach(nodeId => {
                                    try {
                                        const node = cy.getElementById(nodeId);
                                        if (node.length > 0) {
                                            const parentId = node.data('parent');
                                            this.zoomLODManager.onNodeRemoved(nodeId, parentId);
                                        }
                                    } catch (err) {
                                                logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [WARN] Error notifying ZoomLODManager for ${nodeId}: ${err}`);
                                    }
                                });
                            } catch (err) {
                                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [WARN] Error in ZoomLODManager.onNodeRemoved: ${err}`);
                            }
                                }
                                this.pendingTimeouts.delete(timeout);
                            }, 0);
                            this.pendingTimeouts.add(timeout);
                        }
                        
                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Calling nodes.remove()...`);
                        // Use batch to make removal more efficient and less blocking
                        cy.batch(() => {
                        nodesToRemove.remove();
                        });
                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] ✓ Removed ${nodesToRemove.length} nodes`);
                    } else {
                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] ⚠️  No nodes found to remove`);
                    }
                    
                    // Update edge visibility after removals (edges connected to removed nodes need to be hidden)
                    // Make this async to prevent blocking
                    if (removedNodeIds.length > 0 && this.zoomLODManager && this.zoomLODManager.isInitialized()) {
                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Scheduling edge visibility update after removals...`);
                        const timeout = setTimeout(() => {
                            if (updateId === this.currentUpdateId) {
                        try {
                            this.zoomLODManager.forceUpdateEdgeVisibility();
                                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] ✓ Edge visibility updated after removals`);
                        } catch (err) {
                                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [WARN] Error updating edge visibility after removals: ${err}`);
                        }
                            }
                            this.pendingTimeouts.delete(timeout);
                        }, 0);
                        this.pendingTimeouts.add(timeout);
                    }
                    
                    // Reset incremental mode immediately after removals complete
                    // PRODUCTION-GRADE: Don't rely on timeouts - reset synchronously
                    if (this.zoomLODManager && this.zoomLODManager.isInitialized()) {
                        // Only reset if this update set it
                        if (this.incrementalModeUpdateId === updateId) {
                            this.zoomLODManager.setIncrementalUpdateMode(false);
                            this.incrementalModeUpdateId = -1;
                            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Incremental update mode disabled after removals (immediate)`);
                        }
                    }
                } catch (err) {
                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [ERROR] Error removing nodes: ${err}`);
                    if (err instanceof Error) {
                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Stack: ${err.stack}`);
                    }
                    // Ensure mode is reset even on error
                    if (this.zoomLODManager && this.zoomLODManager.isInitialized()) {
                        this.zoomLODManager.setIncrementalUpdateMode(false);
                        this.incrementalModeUpdateId = -1;
                    }
                }
            }

            // Add new nodes
            if (addedNodes.length > 0) {
                logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [STEP 2] Adding ${addedNodes.length} new nodes...`);
                try {
                    // Batch add nodes for better performance
                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Mapping nodes to Cytoscape format...`);
                    const nodesToAdd = addedNodes.map((node, index) => {
                        try {
                            return {
                                group: 'nodes',
                                data: node.data,
                                position: this.getInitialPositionForNode(node, cy)
                            };
                        } catch (err) {
                            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [WARN] Error mapping node ${index} (${node.data?.id}): ${err}`);
                            return null;
                        }
                    }).filter(n => n !== null);

                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Prepared ${nodesToAdd.length} nodes to add`);
                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Calling cy.add()...`);
                    
                    // Use batch to make addition more efficient and less blocking
                    cy.batch(() => {
                    cy.add(nodesToAdd);
                    });
                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] ✓ Added ${nodesToAdd.length} nodes`);

                    // Notify ZoomLODManager for positioning (async to prevent blocking)
                    if (this.zoomLODManager && this.zoomLODManager.isInitialized()) {
                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Scheduling ZoomLODManager notification of additions...`);
                        // Enable incremental update mode to skip expensive dimension recalculation
                        this.zoomLODManager.setIncrementalUpdateMode(true);
                        this.incrementalModeUpdateId = updateId; // Track which update set it
                        
                        const additions = addedNodes
                            .filter(n => n.data && n.data.parent)
                            .map(n => ({ nodeId: n.data.id, parentNodeId: n.data.parent }));
                        
                        if (additions.length > 0) {
                            const timeout = setTimeout(() => {
                                if (updateId === this.currentUpdateId) {
                                    try {
                                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Batch adding ${additions.length} nodes with parents (incremental mode)`);
                                        this.zoomLODManager.onNodesAddedBatch(additions);
                                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Incremental mode enabled for node additions`);
                                    } catch (err) {
                                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [WARN] Error in ZoomLODManager.onNodesAddedBatch: ${err}`);
                                        // Ensure mode is reset even on error
                                        if (this.zoomLODManager) {
                                            this.zoomLODManager.setIncrementalUpdateMode(false);
                                            this.incrementalModeUpdateId = -1;
                                        }
                                    }
                                }
                                this.pendingTimeouts.delete(timeout);
                            }, 0);
                            this.pendingTimeouts.add(timeout);
                        } else {
                            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] No nodes with parents to notify`);
                        }
                    }
                } catch (err) {
                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [ERROR] Error adding nodes: ${err}`);
                    if (err instanceof Error) {
                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Stack: ${err.stack}`);
                    }
                }
            }

            // Add new edges
            if (addedEdges.length > 0) {
                logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [STEP 3] Adding ${addedEdges.length} new edges...`);
                try {
                    const edgesToAdd = addedEdges.map(edge => ({
                        group: 'edges',
                        data: edge.data
                    }));
                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Prepared ${edgesToAdd.length} edges to add`);
                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Calling cy.add() for edges...`);
                    // Use batch to make addition more efficient and less blocking
                    cy.batch(() => {
                    cy.add(edgesToAdd);
                    });
                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] ✓ Added ${edgesToAdd.length} edges`);
                    
                    // Update edge visibility after edges are added
                    // This ensures new edges are shown/hidden correctly based on their endpoints' visibility
                    // Make this async to prevent blocking
                    if (this.zoomLODManager && this.zoomLODManager.isInitialized()) {
                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Scheduling edge visibility update for newly added edges...`);
                        const timeout = setTimeout(() => {
                            if (updateId === this.currentUpdateId) {
                        try {
                            this.zoomLODManager.forceUpdateEdgeVisibility();
                                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] ✓ Edge visibility updated for new edges`);
                        } catch (err) {
                                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [WARN] Error updating edge visibility for new edges: ${err}`);
                        }
                            }
                            this.pendingTimeouts.delete(timeout);
                        }, 0);
                        this.pendingTimeouts.add(timeout);
                    }
                } catch (err) {
                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [ERROR] Error adding edges: ${err}`);
                    if (err instanceof Error) {
                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Stack: ${err.stack}`);
                    }
                }
            }

            // Apply initial state setup for new nodes
            if (addedNodes.length > 0) {
                logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [STEP 4] Applying smart initial state to new nodes...`);
                try {
                    this.viewManager.applySmartInitialState(false); // false = only update new nodes
                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] ✓ Smart initial state applied`);
                    
                    // Update edge visibility after nodes are added (in case nodes affect edge visibility)
                    // This ensures edges connecting new nodes are shown/hidden correctly
                    // Note: This might update edges again if edges were already added, but that's fine (idempotent)
                    // Make this async to prevent blocking
                    if (this.zoomLODManager && this.zoomLODManager.isInitialized()) {
                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Scheduling edge visibility update after node additions...`);
                        const timeout = setTimeout(() => {
                            if (updateId === this.currentUpdateId) {
                        try {
                            this.zoomLODManager.forceUpdateEdgeVisibility();
                                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] ✓ Edge visibility updated after node additions`);
                        } catch (err) {
                                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [WARN] Error updating edge visibility after node additions: ${err}`);
                        }
                            }
                            this.pendingTimeouts.delete(timeout);
                        }, 0);
                        this.pendingTimeouts.add(timeout);
                    }
                } catch (err) {
                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [ERROR] Error applying smart initial state: ${err}`);
                    if (err instanceof Error) {
                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Stack: ${err.stack}`);
                    }
                }
            }

            // Incremental layout - only reposition affected nodes
            // Do this asynchronously to avoid blocking UI
            if (addedNodes.length > 0 || removedNodeIds.length > 0) {
                logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [STEP 5] Scheduling incremental layout...`);
                // Use setTimeout to make layout non-blocking
                const timeout = setTimeout(() => {
                    // Only apply layout if this is still the current update
                    if (updateId === this.currentUpdateId) {
                    try {
                            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Applying incremental layout (async)...`);
                        this.applyIncrementalLayout(addedNodes, removedNodeIds);
                            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] ✓ Incremental layout complete`);
                        
                        // Select newly added nodes after incremental layout completes
                        if (newlyAddedNodeIds && newlyAddedNodeIds.length > 0) {
                            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Will select ${newlyAddedNodeIds.length} newly added nodes after incremental layout`);
                            setTimeout(() => {
                                if (updateId === this.currentUpdateId) {
                                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Selecting ${newlyAddedNodeIds.length} newly added nodes`);
                                    this.selectNodesByIds(newlyAddedNodeIds);
                                }
                            }, 100); // Small delay to ensure nodes are rendered
                        }
                    } catch (err) {
                            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [ERROR] Error in incremental layout: ${err}`);
                        if (err instanceof Error) {
                                logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Stack: ${err.stack}`);
                        }
                    }
                    } else {
                        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Layout cancelled - newer update in progress`);
                    }
                    this.pendingTimeouts.delete(timeout);
                }, 50); // Small delay to let UI render first
                this.pendingTimeouts.add(timeout);
            }

            // Update stats if full graph provided
            if (fullGraph) {
                logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [STEP 6] Updating stats...`);
                try {
                    updateStats(fullGraph);
                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] ✓ Stats updated`);
                } catch (err) {
                    logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [WARN] Error updating stats: ${err}`);
                }
            }

            const totalTime = Date.now() - startTime;
            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] ========== Update complete (${totalTime}ms) ==========`);
            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Final nodes: ${cy.nodes().length}, edges: ${cy.edges().length}`);
            
            // Clear timeout guard
            clearTimeout(timeoutGuard);
            
            // Finish this update and process next in queue
            this.finishIncrementalUpdate(updateId);
        } catch (err) {
            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [ERROR] Fatal error: ${err}`);
            if (err instanceof Error) {
                logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Message: ${err.message}`);
                logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Stack: ${err.stack}`);
            }
            
            // Clear timeout guard
            clearTimeout(timeoutGuard);
            
            // Fall back to full update if incremental fails
            if (fullGraph) {
                logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [FALLBACK] Attempting full graph update due to error...`);
                const timeout = setTimeout(() => {
                    // Only fallback if this is still the current update
                    if (updateId === this.currentUpdateId) {
                    try {
                        this.updateGraph(fullGraph);
                    } catch (fallbackErr) {
                            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [ERROR] Fallback update also failed: ${fallbackErr}`);
                    }
                    }
                    this.pendingTimeouts.delete(timeout);
                }, 100);
                this.pendingTimeouts.add(timeout);
            }
            // Finish this update even on error
            this.finishIncrementalUpdate(updateId);
        }
    }
    
    /**
     * Finish processing an incremental update and start the next one
     * Cancels all pending timeouts from this update if a newer update has started
     * 
     * PRODUCTION-GRADE: Always resets incremental mode to prevent it from getting stuck
     * PRODUCTION-GRADE: Always resets processing flag to prevent queue from getting stuck
     */
    private finishIncrementalUpdate(updateId: number): void {
        // PRODUCTION-GRADE: Always reset incremental mode when finishing an update
        // This ensures the flag never gets stuck, even if timeouts were cancelled
        if (this.zoomLODManager && this.zoomLODManager.isInitialized()) {
            // Only reset if this update (or an older one) set it
            // If a newer update set it, don't reset it
            if (this.incrementalModeUpdateId === updateId || 
                (this.incrementalModeUpdateId !== -1 && this.incrementalModeUpdateId < updateId)) {
                this.zoomLODManager.setIncrementalUpdateMode(false);
                this.incrementalModeUpdateId = -1;
                logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Incremental mode reset (finish)`);
            }
        }
        
        // If a newer update has started, cancel all pending timeouts from this update
        if (updateId !== this.currentUpdateId) {
            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Cancelling pending operations - newer update in progress`);
            this.cancelPendingTimeouts();
        }
        
        // PRODUCTION-GRADE: Always reset processing flag, even if something went wrong
        // This prevents the queue from getting permanently stuck
        const wasProcessing = this.isProcessingIncrementalUpdate;
        this.isProcessingIncrementalUpdate = false;
        
        if (!wasProcessing) {
            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] [WARN] Processing flag was already false`);
        }
        
        logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] Finished, processing next in queue...`);
        
        // Process next update in queue if any
        if (this.incrementalUpdateQueue.length > 0) {
            // Use setTimeout to allow current update to fully complete
            setTimeout(() => {
                this.processIncrementalUpdateQueue();
            }, 0);
        } else {
            logMessage(this.vscode, `[CytoscapeCore] [Update #${updateId}] No more updates in queue`);
            // Safety: Double-check incremental mode is reset when queue is empty
            this.ensureIncrementalModeReset();
        }
    }
    
    /**
     * Cancel all pending operations
     * Production-grade safety method that ensures clean slate for new updates
     */
    private cancelAllPendingOperations(): void {
        // Cancel all pending timeouts
        this.cancelPendingTimeouts();
        
        // Force reset incremental mode if stuck
        if (this.zoomLODManager && this.zoomLODManager.isInitialized()) {
            if (this.zoomLODManager.isIncrementalUpdateMode()) {
                logMessage(this.vscode, '[CytoscapeCore] Force resetting stuck incremental mode');
                this.zoomLODManager.setIncrementalUpdateMode(false);
                this.incrementalModeUpdateId = -1;
            }
        }
    }
    
    /**
     * Cancel all pending timeouts
     * Called when a new update starts to prevent old timeouts from interfering
     */
    private cancelPendingTimeouts(): void {
        const cancelledCount = this.pendingTimeouts.size;
        this.pendingTimeouts.forEach(timeout => {
            clearTimeout(timeout);
        });
        this.pendingTimeouts.clear();
        if (cancelledCount > 0) {
            logMessage(this.vscode, `[CytoscapeCore] Cancelled ${cancelledCount} pending timeouts`);
        }
    }
    
    /**
     * Clear the incremental update queue
     * Called when a full update occurs or when we need to reset state
     * 
     * PRODUCTION-GRADE: Always resets incremental mode to prevent it from getting stuck
     * PRODUCTION-GRADE: Cancels all pending operations for clean slate
     */
    private clearIncrementalUpdateQueue(): void {
        const queueSize = this.incrementalUpdateQueue.length;
        if (queueSize > 0) {
            logMessage(this.vscode, `[CytoscapeCore] Clearing incremental update queue (${queueSize} pending updates)`);
            this.incrementalUpdateQueue = [];
        }
        
        // Cancel all pending operations
        this.cancelAllPendingOperations();
        
        // Reset processing flag
        if (this.isProcessingIncrementalUpdate) {
            logMessage(this.vscode, `[CytoscapeCore] Resetting processing flag`);
            this.isProcessingIncrementalUpdate = false;
        }
        
        // Increment update ID to invalidate any pending operations
        this.currentUpdateId++;
    }

    /**
     * Get initial position for a new node
     * Try to position near parent or use a default position
     */
    private getInitialPositionForNode(node: any, cy: any): { x: number; y: number } {
        try {
            // If node has a parent, try to position near parent
            if (node.data && node.data.parent) {
                const parent = cy.getElementById(node.data.parent);
                if (parent.length > 0) {
                    try {
                        const parentPos = parent.position();
                        // Position near parent with some offset
                        return {
                            x: parentPos.x + (Math.random() - 0.5) * 200,
                            y: parentPos.y + (Math.random() - 0.5) * 200
                        };
                    } catch (err) {
                        logMessage(this.vscode, `[WARN] Error getting parent position for ${node.data.id}: ${err}`);
                    }
                }
            }

            // Default: center of viewport or random position
            try {
                const extent = cy.extent();
                if (extent && extent.x1 !== undefined && extent.x2 !== undefined) {
                    return {
                        x: (extent.x1 + extent.x2) / 2 + (Math.random() - 0.5) * 300,
                        y: (extent.y1 + extent.y2) / 2 + (Math.random() - 0.5) * 300
                    };
                }
            } catch (err) {
                logMessage(this.vscode, `[WARN] Error getting extent: ${err}`);
            }

            // Fallback: random position around center
            return {
                x: (Math.random() - 0.5) * 1000,
                y: (Math.random() - 0.5) * 1000
            };
        } catch (err) {
            logMessage(this.vscode, `[ERROR] Error in getInitialPositionForNode: ${err}`);
            // Return default position on error
            return { x: 0, y: 0 };
        }
    }

    /**
     * Apply incremental layout - only reposition affected nodes
     */
    private applyIncrementalLayout(addedNodes: any[], removedNodeIds: string[]): void {
        logMessage(this.vscode, `[CytoscapeCore] applyIncrementalLayout called`);
        logMessage(this.vscode, `  - Added nodes: ${addedNodes.length}`);
        logMessage(this.vscode, `  - Removed nodes: ${removedNodeIds.length}`);
        
        try {
            const cy = this.stateManager.getCy();
            if (!cy) {
                logMessage(this.vscode, '[ERROR] applyIncrementalLayout: cy is null');
                return;
            }
            
            if (!this.layoutManager) {
                logMessage(this.vscode, '[ERROR] applyIncrementalLayout: layoutManager is null');
                return;
            }

            // For incremental updates, we avoid full layout to prevent UI blocking
            // Position new nodes near their parents (already done in getInitialPositionForNode)
            // Only run layout if there are MANY changes and user explicitly needs it
            
            if (addedNodes.length > 20 || removedNodeIds.length > 20) {
                // Many changes - skip layout for now to avoid blocking
                // User can manually trigger layout if needed
                logMessage(this.vscode, '[INFO] Many changes detected, skipping layout to avoid blocking UI');
                logMessage(this.vscode, '[INFO] Nodes positioned manually - layout skipped for performance');
            } else {
                // Few changes - nodes are already positioned by getInitialPositionForNode
                logMessage(this.vscode, '[INFO] Few changes, nodes already positioned manually');
                logMessage(this.vscode, '[INFO] ZoomLODManager will handle compound node dimension recalculation');
                
                // Try to trigger a quick refresh without full layout
                // This is faster and doesn't block
                try {
                    cy.trigger('layoutstop'); // Ensure no layout is running
                } catch (err) {
                    // Ignore errors here
                }
            }
            
            logMessage(this.vscode, `[CytoscapeCore] ✓ applyIncrementalLayout complete`);
        } catch (err) {
            logMessage(this.vscode, `[ERROR] Error in applyIncrementalLayout: ${err}`);
            if (err instanceof Error) {
                logMessage(this.vscode, `  - Stack: ${err.stack}`);
            }
        }
    }
    
    /**
     * Set layout
     */
    setLayout(layout: string): void {
        this.layoutManager.applyLayout(layout);
        // Note: updateLayoutSelector was removed - layout selector is now fixed
    }
    
    /**
     * Fit visible nodes
     */
    private fitVisibleNodes(): void {
        const cy = this.stateManager.getCy();
        if (!cy) return;
        
        const visible = cy.nodes(':visible');
        logMessage(this.vscode, `Fitting ${visible.length} visible nodes`);
        
        if (visible.length > 0) {
            cy.fit(visible, CONFIG.DEFAULT_PADDING);
            logMessage(this.vscode, `Fit completed, zoom=${cy.zoom()}`);
        } else {
            logMessage(this.vscode, 'ERROR: No visible nodes to fit!');
        }
    }
    
    /**
     * Set configuration from extension
     */
    setConfig(cytoscapeStyles: any): void {
        this.stateManager.setCytoscapeStyles(cytoscapeStyles);
        
        // Don't try to eval getLayoutConfig due to CSP restrictions
        // Instead, use the built-in layout configuration
        this.stateManager.setLayoutConfig(this.getLayoutConfigFunction());
        logMessage(this.vscode, '✓ Using built-in layout configuration (CSP-safe)');
    }
    
    /**
     * Get layout configuration function (CSP-safe, no eval needed)
     */
    private getLayoutConfigFunction(): (layoutName: string, visibleNodeCount: number) => any {
        const baseConfig = {
            animate: true,
            animationDuration: 500,
            fit: true,
            padding: 100,
            spacingFactor: 2.0,
            avoidOverlap: true,
            nodeDimensionsIncludeLabels: true,
        };
        
        return (layoutName: string, visibleNodeCount: number) => {
            switch (layoutName) {
                case 'fcose':
                    return {
                        ...baseConfig,
                        name: 'fcose',
                        quality: 'default',
                        randomize: true,
                        animate: true,
                        animationDuration: 1000,
                        fit: true,
                        padding: 50,
                        nodeDimensionsIncludeLabels: true,
                        uniformNodeDimensions: false,
                        packComponents: false,
                        samplingType: true,
                        sampleSize: 25,
                        nodeSeparation: 50,
                        piTol: 0.0000001,
                        nodeRepulsion: (node: any) => {
                            const isCompound = node.data('isCompound');
                            const sizeMultiplier = node.data('sizeMultiplier') || 1.0;
                            if (isCompound) {
                                return 1500 * Math.max(sizeMultiplier, 1.5);
                            }
                            return 1500;
                        },
                        idealEdgeLength: (edge: any) => {
                            const source = edge.source();
                            const target = edge.target();
                            const sourceSize = source.data('sizeMultiplier') || 1.0;
                            const targetSize = target.data('sizeMultiplier') || 1.0;
                            const avgSize = (sourceSize + targetSize) / 2;
                            return 40 * Math.max(avgSize, 1.0);
                        },
                        edgeElasticity: () => 0.45,
                        nestingFactor: 1.2,
                        numIter: 2500,
                        tile: true,
                        tilingPaddingVertical: 10,
                        tilingPaddingHorizontal: 10,
                        gravity: 0.35,
                        gravityRange: 3.8,
                        gravityCompound: 1.5,
                        gravityRangeCompound: 2.5,
                        initialEnergyOnIncremental: 0.3,
                    };
                case 'dagre':
                    return {
                        ...baseConfig,
                        name: 'dagre',
                        rankDir: 'TB',
                        rankSep: visibleNodeCount < 10 ? 250 : 200,
                        nodeSep: visibleNodeCount < 10 ? 180 : 150,
                        edgeSep: 100,
                        ranker: 'network-simplex',
                        spacingFactor: visibleNodeCount < 10 ? 2.5 : 2.0,
                    };
                case 'grid':
                    return {
                        ...baseConfig,
                        name: 'grid',
                        rows: undefined,
                        cols: undefined,
                        condense: false,
                        avoidOverlapPadding: 80,
                    };
                case 'cose':
                    return {
                        ...baseConfig,
                        name: 'cose',
                        nodeRepulsion: 1400000,
                        nodeOverlap: 180,
                        idealEdgeLength: 220,
                        edgeElasticity: 120,
                        nestingFactor: 1.5,
                        gravity: 0.7,
                        numIter: 3000,
                        initialTemp: 250,
                        coolingFactor: 0.95,
                        minTemp: 1.0,
                        gravityCompound: 1.2,
                        gravityRange: 250,
                    };
                case 'circle':
                    return {
                        ...baseConfig,
                        name: 'circle',
                        radius: undefined,
                        startAngle: -Math.PI / 2,
                        sweep: 2 * Math.PI,
                        clockwise: true,
                        spacingFactor: 2.5,
                    };
                case 'concentric':
                    return {
                        ...baseConfig,
                        name: 'concentric',
                        concentric: (node: any) => {
                            if (node.data('isEntryPoint')) return 10;
                            const dependents = node.data('dependents') || 0;
                            const loc = node.data('linesOfCode') || 0;
                            return Math.min(dependents * 2 + Math.log10(loc + 1) * 2, 9);
                        },
                        levelWidth: () => 200,
                        minNodeSpacing: 150,
                    };
                default:
                    return { ...baseConfig, name: layoutName };
            }
        };
    }
    
    /**
     * Check if ready
     */
    isReady(): boolean {
        return this.stateManager.isReady();
    }
    
    /**
     * Show onboarding if needed
     */
    showOnboardingIfNeeded(): void {
        if (!this.stateManager.hasUserSeenOnboarding()) {
            setTimeout(() => {
                this.uiController.showOnboarding();
            }, 1000);
        }
    }
    
    // =========================================================================
    // DYNAMIC GRAPH OPERATIONS
    // Support for adding/removing nodes after initial load
    // 
    // Usage examples:
    // 
    // Add a single node:
    //   cytoscapeCore.addNode({
    //     id: 'newNode1',
    //     label: 'New File',
    //     type: 'file',
    //     parent: 'directoryId'  // Optional: parent compound node
    //   });
    // 
    // Remove a node:
    //   cytoscapeCore.removeNode('nodeId');
    // 
    // Add multiple nodes efficiently:
    //   cytoscapeCore.addNodesBatch([
    //     { id: 'node1', label: 'Node 1', parent: 'parentId' },
    //     { id: 'node2', label: 'Node 2', parent: 'parentId' }
    //   ]);
    // 
    // Add an edge:
    //   cytoscapeCore.addEdge({
    //     id: 'edge1',
    //     source: 'sourceNodeId',
    //     target: 'targetNodeId',
    //     edgeType: 'imports'
    //   });
    // 
    // Notes:
    // - When adding children to compound nodes, dimensions are automatically 
    //   recalculated without affecting other nodes' positions
    // - Batch operations are more efficient than individual operations
    // - All operations respect the fixed dimensions system for adaptive zoom
    // =========================================================================
    
    /**
     * Add a node dynamically to the graph
     * Handles dimension recalculation for compound nodes
     * 
     * @param nodeData - Node data object with id, label, type, parent, etc.
     */
    public addNode(nodeData: any): void {
        const cy = this.stateManager.getCy();
        
        if (!cy) {
            logMessage(this.vscode, '[ERROR] addNode: Cytoscape instance is null');
            return;
        }
        
        try {
            // Check if node already exists
            if (cy.getElementById(nodeData.id).length > 0) {
                logMessage(this.vscode, `[WARN] Node "${nodeData.id}" already exists`);
                return;
            }
            
            // Add the node to Cytoscape
            cy.add({
                group: 'nodes',
                data: nodeData,
                position: { x: 0, y: 0 } // Temporary position
            });
            
            logMessage(this.vscode, `[CytoscapeCore] ✓ Added node "${nodeData.id}"`);
            
            // Notify the ZoomLODManager to handle positioning and dimension recalculation
            if (this.zoomLODManager && this.zoomLODManager.isInitialized()) {
                this.zoomLODManager.onNodeAdded(nodeData.id, nodeData.parent);
            }
            
        } catch (error) {
            logMessage(this.vscode, 
                `[ERROR] Failed to add node "${nodeData.id}": ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
    
    /**
     * Remove a node dynamically from the graph
     * Handles dimension recalculation for compound nodes
     * 
     * @param nodeId - ID of the node to remove
     */
    public removeNode(nodeId: string): void {
        const cy = this.stateManager.getCy();
        
        if (!cy) {
            logMessage(this.vscode, '[ERROR] removeNode: Cytoscape instance is null');
            return;
        }
        
        try {
            const node = cy.getElementById(nodeId);
            
            if (node.length === 0) {
                logMessage(this.vscode, `[WARN] Node "${nodeId}" does not exist`);
                return;
            }
            
            // Get parent before removing
            const parentId = node.data('parent');
            
            // Remove the node
            cy.remove(node);
            
            logMessage(this.vscode, `[CytoscapeCore] ✓ Removed node "${nodeId}"`);
            
            // Notify the ZoomLODManager to handle dimension recalculation
            if (this.zoomLODManager && this.zoomLODManager.isInitialized() && parentId) {
                this.zoomLODManager.onNodeRemoved(nodeId, parentId);
            }
            
        } catch (error) {
            logMessage(this.vscode, 
                `[ERROR] Failed to remove node "${nodeId}": ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
    
    /**
     * Add multiple nodes in a batch operation
     * More efficient than adding nodes one by one
     * 
     * @param nodesData - Array of node data objects
     */
    public addNodesBatch(nodesData: any[]): void {
        const cy = this.stateManager.getCy();
        
        if (!cy) {
            logMessage(this.vscode, '[ERROR] addNodesBatch: Cytoscape instance is null');
            return;
        }
        
        try {
            const additions: Array<{nodeId: string, parentNodeId?: string}> = [];
            
            // Add all nodes
            cy.batch(() => {
                nodesData.forEach(nodeData => {
                    // Skip if already exists
                    if (cy.getElementById(nodeData.id).length > 0) {
                        return;
                    }
                    
                    cy.add({
                        group: 'nodes',
                        data: nodeData,
                        position: { x: 0, y: 0 }
                    });
                    
                    additions.push({
                        nodeId: nodeData.id,
                        parentNodeId: nodeData.parent
                    });
                });
            });
            
            logMessage(this.vscode, `[CytoscapeCore] ✓ Added ${additions.length} nodes in batch`);
            
            // Notify the ZoomLODManager for batch processing
            if (this.zoomLODManager && this.zoomLODManager.isInitialized() && additions.length > 0) {
                this.zoomLODManager.onNodesAddedBatch(additions);
            }
            
        } catch (error) {
            logMessage(this.vscode, 
                `[ERROR] Failed to add nodes batch: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
    
    /**
     * Add an edge dynamically to the graph
     * 
     * @param edgeData - Edge data object with source, target, edgeType, etc.
     */
    public addEdge(edgeData: any): void {
        const cy = this.stateManager.getCy();
        
        if (!cy) {
            logMessage(this.vscode, '[ERROR] addEdge: Cytoscape instance is null');
            return;
        }
        
        try {
            // Check if source and target exist
            if (cy.getElementById(edgeData.source).length === 0) {
                logMessage(this.vscode, `[WARN] Source node "${edgeData.source}" does not exist`);
                return;
            }
            
            if (cy.getElementById(edgeData.target).length === 0) {
                logMessage(this.vscode, `[WARN] Target node "${edgeData.target}" does not exist`);
                return;
            }
            
            // Add the edge
            cy.add({
                group: 'edges',
                data: edgeData
            });
            
            logMessage(this.vscode, `[CytoscapeCore] ✓ Added edge ${edgeData.source} -> ${edgeData.target}`);
            
        } catch (error) {
            logMessage(this.vscode, 
                `[ERROR] Failed to add edge: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
    
    /**
     * Get access to the ZoomLODManager for advanced operations
     */
    public getZoomLODManager(): ZoomBasedLODManager {
        return this.zoomLODManager;
    }
    
    /**
     * Get access to the CameraManager for focus/zoom operations
     */
    public getCameraManager(): CameraManager {
        return this.cameraManager;
    }
    
    // =========================================================================
    // CAMERA/FOCUS OPERATIONS
    // Public API for focusing and zooming to nodes
    // =========================================================================
    
    /**
     * Focus on a specific node by ID
     * Centers the camera on the node and adjusts zoom to show it clearly
     * 
     * @param nodeId - ID of the node to focus on
     * @param options - Focus options (padding, duration, animate, zoom)
     * @returns true if successful, false if node not found
     */
    public focusOnNode(nodeId: string, options?: any): boolean {
        return this.cameraManager.focusOnNode(nodeId, options);
    }
    
    /**
     * Search for nodes by label, ID, or path
     * 
     * @param query - Search query
     * @param maxResults - Maximum number of results. Default: 20
     * @returns Array of matching nodes with match scores
     */
    public searchNodes(query: string, maxResults: number = 20): any[] {
        return this.cameraManager.searchNodes(query, maxResults);
    }
    
    /**
     * Find a node by ID (exact match)
     * 
     * @param nodeId - ID of the node to find
     * @returns NodeSearchResult if found, null otherwise
     */
    public findNodeById(nodeId: string): any {
        return this.cameraManager.findNodeById(nodeId);
    }
    
    /**
     * Focus on the first node matching a search query
     * 
     * @param query - Search query
     * @param options - Focus options
     * @returns true if a node was found and focused, false otherwise
     */
    public focusOnSearch(query: string, options?: any): boolean {
        return this.cameraManager.focusOnSearch(query, options);
    }
    
    /**
     * Fit multiple nodes in view
     * 
     * @param nodeIds - Array of node IDs to fit in view
     * @param options - Focus options
     * @returns true if successful, false if no nodes found
     */
    public fitNodes(nodeIds: string[], options?: any): boolean {
        return this.cameraManager.fitNodes(nodeIds, options);
    }
    
    /**
     * Update layer selector UI to reflect current layer
     * Called when layer changes from extension
     */
    public updateLayerSelector(layer: string): void {
        this.uiController.updateLayerSelector(layer);
    }
}



