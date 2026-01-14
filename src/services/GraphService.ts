import * as vscode from 'vscode';
import * as fs from 'fs';
import { GraphData, GraphNode, GraphEdge, Layer, ProposedChange, NodeHistoryEvent } from '../types';
import { StateSyncService } from './StateSyncService';
import { log, debug, warn, error } from '../logger';
import { getSharedStateFile, createEmptySharedState } from '../config/shared-state-config';

export class GraphService {
    private stateSyncService: StateSyncService;
    private onGraphChangedEmitter = new vscode.EventEmitter<void>();
    public readonly onGraphChanged = this.onGraphChangedEmitter.event;
    
    // Event for property-only updates (node data changes without structural changes)
    private onNodePropertiesChangedEmitter = new vscode.EventEmitter<{ layer: Layer; nodeUpdates: Map<string, Partial<GraphNode['data']>> }>();
    public readonly onNodePropertiesChanged = this.onNodePropertiesChangedEmitter.event;
    
    // Event for property-only updates (edge data changes without structural changes)
    private onEdgePropertiesChangedEmitter = new vscode.EventEmitter<{ layer: Layer; edgeUpdates: Map<string, Partial<GraphEdge['data']>> }>();
    public readonly onEdgePropertiesChanged = this.onEdgePropertiesChangedEmitter.event;
    
    // Event for incremental structural changes (nodes/edges added/removed, preserves zoom/state)
    private onGraphChangedIncrementalEmitter = new vscode.EventEmitter<{ 
        layer: Layer; 
        addedNodes: GraphNode[]; 
        addedEdges: any[]; 
        removedNodeIds: string[]; 
        removedEdgeIds: string[];
        fullGraph: GraphData;
    }>();
    public readonly onGraphChangedIncremental = this.onGraphChangedIncrementalEmitter.event;
    
    // NOTE: Currently, only the 'implementation' layer is fully developed.
    // Other layers (blueprint, architecture, dependencies) have basic implementations
    // and will be enhanced with more sophisticated visualizations in future updates.
    private graphs: Record<Layer, GraphData> = {
        blueprint: { nodes: [], edges: [] },
        architecture: { nodes: [], edges: [] },
        implementation: { nodes: [], edges: [] },
        dependencies: { nodes: [], edges: [] }
    };

    private currentLayer: Layer = 'implementation';
    private isApplyingExternalChange: boolean = false; // Prevent syncing back during external change
    private graphChangeBatchTimer?: NodeJS.Timeout; // Batch multiple graph change events

    // Proposed changes storage (per-layer) - in-memory until applied
    private proposedChangesByLayer: Record<Layer, Map<string, ProposedChange>> = {
        blueprint: new Map(),
        architecture: new Map(),
        implementation: new Map(),
        dependencies: new Map()
    };

    // Node history tracking (per-layer)
    private nodeHistoryByLayer: Record<Layer, Map<string, NodeHistoryEvent[]>> = {
        blueprint: new Map(),
        architecture: new Map(),
        implementation: new Map(),
        dependencies: new Map()
    };

    // Deleted node tracking (per-layer)
    private deletedNodeIds: Record<Layer, Set<string>> = {
        blueprint: new Set(),
        architecture: new Set(),
        implementation: new Set(),
        dependencies: new Set()
    };

    constructor(private context: vscode.ExtensionContext) {
        // Initialize state sync service
        this.stateSyncService = new StateSyncService();
        
        // Load from shared state file (synced with MCP server)
        this.loadFromSharedState();
        
        // Start watching for external changes (from MCP server)
        this.stateSyncService.startWatching();
        this.stateSyncService.onStateChanged((sharedState) => {
            log('[GraphService] External state change detected, updating...');
            this.handleExternalStateChange(sharedState);
        });
        
        // Legacy storage (will be deprecated in favor of shared state)
        this.loadProposedChangesFromStorage();
        this.loadNodeHistoryFromStorage();
        this.loadDeletedNodesFromStorage();
    }

    public setCurrentLayer(layer: Layer): void {
        this.currentLayer = layer;
    }

    public getCurrentLayer(): Layer {
        return this.currentLayer;
    }

    public getGraph(layer?: Layer): GraphData {
        return this.graphs[layer || this.currentLayer];
    }

    public setGraph(graphData: GraphData, layer?: Layer): void {
        this.graphs[layer || this.currentLayer] = graphData;
        this.saveToStorage();
        
        // Don't sync back if we're applying an external change to prevent feedback loop
        if (!this.isApplyingExternalChange) {
            this.syncToSharedState();
        }
    }

    public clearGraph(layer?: Layer): void {
        if (layer) {
            this.graphs[layer] = { nodes: [], edges: [] };
        } else {
            // Clear all layers
            this.graphs = {
                blueprint: { nodes: [], edges: [] },
                architecture: { nodes: [], edges: [] },
                implementation: { nodes: [], edges: [] },
                dependencies: { nodes: [], edges: [] }
            };
        }
        this.saveToStorage();
    }

    /**
     * Update properties of an existing node
     * Matches MCP server's updateNode functionality
     */
    public updateNode(nodeId: string, updates: Partial<GraphNode['data']>, layer?: Layer): void {
        const lyr = layer || this.currentLayer;
        const graph = this.graphs[lyr];
        
        const node = graph.nodes.find(n => n.data.id === nodeId);
        if (!node) {
            throw new Error(`Node with ID '${nodeId}' not found in ${lyr} layer`);
        }
        
        debug(`[GraphService] Updating node '${nodeId}' in ${lyr} layer`);
        
        // Apply updates
        Object.assign(node.data, updates);
        node.data.modified = true;
        
        // Record in history
        this.recordNodeHistory(lyr, nodeId, {
            timestamp: Date.now(),
            action: 'changed',
            details: `Updated node properties: ${Object.keys(updates).join(', ')}`
        });
        
        // Save and sync
        this.saveToStorage();
        
        // Don't sync back if we're applying an external change to prevent feedback loop
        if (!this.isApplyingExternalChange) {
            this.syncToSharedState();
        }
        
        // Fire graph changed event
        this.onGraphChangedEmitter.fire();
    }

    /**
     * Update properties of an existing edge
     * Matches MCP server's updateEdge functionality
     */
    public updateEdge(edgeId: string, updates: Partial<GraphEdge['data']>, layer?: Layer): void {
        const lyr = layer || this.currentLayer;
        const graph = this.graphs[lyr];
        
        const edge = graph.edges.find(e => e.data.id === edgeId);
        if (!edge) {
            throw new Error(`Edge with ID '${edgeId}' not found in ${lyr} layer`);
        }
        
        debug(`[GraphService] Updating edge '${edgeId}' in ${lyr} layer`);
        
        // Apply updates
        Object.assign(edge.data, updates);
        
        // Save and sync
        this.saveToStorage();
        
        // Don't sync back if we're applying an external change to prevent feedback loop
        if (!this.isApplyingExternalChange) {
            this.syncToSharedState();
        }
        
        // Fire edge property changed event (property-only update, no full refresh)
        const edgeUpdates = new Map<string, Partial<GraphEdge['data']>>();
        edgeUpdates.set(edgeId, updates);
        this.onEdgePropertiesChangedEmitter.fire({ layer: lyr, edgeUpdates });
    }

    private loadFromStorage(): void {
        const stored = this.context.globalState.get<Record<Layer, GraphData>>('graphData');
        if (stored) {
            this.graphs = stored;
        }
    }

    private saveToStorage(): void {
        this.context.globalState.update('graphData', this.graphs);
    }

    // ============================================================================
    // PROPOSED CHANGES API - In-memory changes before persistence
    // ============================================================================

    /**
     * Add or update a proposed change for a specific node.
     * Changes are stored in-memory until applyProposedChanges() is called.
     */
    public addProposedChangeForNode(
        nodeId: string,
        change: Partial<ProposedChange>,
        layer?: Layer
    ): void {
        const lyr = layer || this.currentLayer;
        const existing = this.proposedChangesByLayer[lyr].get(nodeId) || {};
        const merged: ProposedChange = {
            ...existing,
            ...change,
            nodeId,
            timestamp: Date.now()
        };
        this.proposedChangesByLayer[lyr].set(nodeId, merged);
        this.saveProposedChangesToStorage();
    }

    /**
     * Add a proposed change for a file (by path).
     * Automatically finds the node with matching path.
     */
    public addProposedChangeForFile(
        filePath: string,
        change: Partial<ProposedChange>,
        layer?: Layer
    ): void {
        const lyr = layer || this.currentLayer;
        // Try to find node by path
        const node = this.graphs[lyr].nodes.find(n => n.data.path === filePath);
        if (node) {
            this.addProposedChangeForNode(node.data.id, { ...change, filePath }, lyr);
        } else {
            // Store by file path for later application
            const nodeId = `file:${filePath}`;
            this.addProposedChangeForNode(nodeId, { ...change, filePath }, lyr);
        }
    }

    /**
     * Get a proposed change for a specific node.
     */
    public getProposedChange(nodeId: string, layer?: Layer): ProposedChange | undefined {
        const lyr = layer || this.currentLayer;
        return this.proposedChangesByLayer[lyr].get(nodeId);
    }

    /**
     * List all proposed changes for a layer.
     */
    public listProposedChanges(layer?: Layer): ProposedChange[] {
        const lyr = layer || this.currentLayer;
        return Array.from(this.proposedChangesByLayer[lyr].values());
    }

    /**
     * Clear a specific proposed change.
     */
    public clearProposedChangeForNode(nodeId: string, layer?: Layer): void {
        const lyr = layer || this.currentLayer;
        if (this.proposedChangesByLayer[lyr].has(nodeId)) {
            this.proposedChangesByLayer[lyr].delete(nodeId);
            this.saveProposedChangesToStorage();
        }
    }

    /**
     * Clear all proposed changes for a layer.
     */
    public clearAllProposedChanges(layer?: Layer): void {
        const lyr = layer || this.currentLayer;
        this.proposedChangesByLayer[lyr].clear();
        this.saveProposedChangesToStorage();
    }

    /**
     * Apply all proposed changes to the graph.
     * Merges change metadata into nodes and marks them as modified.
     * Clears proposals after application.
     */
    public applyProposedChanges(layer?: Layer): { appliedCount: number; notFoundCount: number } {
        const lyr = layer || this.currentLayer;
        const graph = this.graphs[lyr];
        const proposals = this.proposedChangesByLayer[lyr];
        
        let appliedCount = 0;
        let notFoundCount = 0;

        if (proposals.size === 0) {
            return { appliedCount: 0, notFoundCount: 0 };
        }

        for (const [nodeId, change] of proposals.entries()) {
            // Try to find node by ID or by path
            let node = graph.nodes.find(n => n.data.id === nodeId);
            if (!node && change.filePath) {
                node = graph.nodes.find(n => n.data.path === change.filePath);
            }

            if (!node) {
                notFoundCount++;
                continue;
            }

            // Apply change metadata
            node.data.changeName = change.name ?? node.data.changeName;
            node.data.changeSummary = change.summary ?? node.data.changeSummary;
            node.data.changeIntention = change.intention ?? node.data.changeIntention;
            node.data.changeAdditionalInfo = change.additionalInfo ?? node.data.changeAdditionalInfo;
            node.data.modified = true;

            // Record in history
            this.recordNodeHistory(lyr, node.data.id, {
                timestamp: change.timestamp || Date.now(),
                action: 'changed',
                details: `Applied proposed change: ${change.name || 'Unnamed change'}`
            });

            appliedCount++;
        }

        // Clear proposals after application
        this.proposedChangesByLayer[lyr].clear();
        this.saveToStorage();
        this.saveProposedChangesToStorage();

        return { appliedCount, notFoundCount };
    }

    // ============================================================================
    // NODE HISTORY API - Track changes over time
    // ============================================================================

    /**
     * Get the history of changes for a specific node.
     */
    public getNodeHistory(nodeId: string, layer?: Layer): NodeHistoryEvent[] {
        const lyr = layer || this.currentLayer;
        return this.nodeHistoryByLayer[lyr].get(nodeId) || [];
    }

    /**
     * Record a history event for a node.
     */
    private recordNodeHistory(layer: Layer, nodeId: string, event: NodeHistoryEvent): void {
        const history = this.nodeHistoryByLayer[layer].get(nodeId) || [];
        history.push(event);
        this.nodeHistoryByLayer[layer].set(nodeId, history);
        this.saveNodeHistoryToStorage();
    }

    /**
     * Clear history for a specific node.
     */
    public clearNodeHistory(nodeId: string, layer?: Layer): void {
        const lyr = layer || this.currentLayer;
        this.nodeHistoryByLayer[lyr].delete(nodeId);
        this.saveNodeHistoryToStorage();
    }

    // ============================================================================
    // DELETED NODE TRACKING
    // ============================================================================

    /**
     * Check if a node has been deleted.
     */
    public isNodeDeleted(nodeId: string, layer?: Layer): boolean {
        const lyr = layer || this.currentLayer;
        return this.deletedNodeIds[lyr].has(nodeId);
    }

    /**
     * Mark a node as deleted.
     */
    private markNodeAsDeleted(nodeId: string, layer: Layer): void {
        this.deletedNodeIds[layer].add(nodeId);
        this.saveDeletedNodesToStorage();
    }

    // ============================================================================
    // STORAGE HELPERS
    // ============================================================================

    private loadProposedChangesFromStorage(): void {
        try {
            const layers: Layer[] = ['blueprint', 'architecture', 'implementation', 'dependencies'];
            for (const layer of layers) {
                const key = `proposedChanges-${layer}`;
                const stored = this.context.globalState.get<Record<string, ProposedChange>>(key);
                if (stored) {
                    this.proposedChangesByLayer[layer] = new Map(Object.entries(stored));
                }
            }
        } catch (error) {
            console.warn('Failed to load proposed changes from storage:', error);
        }
    }

    private saveProposedChangesToStorage(): void {
        try {
            const layers: Layer[] = ['blueprint', 'architecture', 'implementation', 'dependencies'];
            for (const layer of layers) {
                const key = `proposedChanges-${layer}`;
                const obj: Record<string, ProposedChange> = {};
                for (const [k, v] of this.proposedChangesByLayer[layer].entries()) {
                    obj[k] = v;
                }
                this.context.globalState.update(key, obj);
            }
        } catch (error) {
            console.warn('Failed to save proposed changes to storage:', error);
        }
    }

    private loadNodeHistoryFromStorage(): void {
        try {
            const layers: Layer[] = ['blueprint', 'architecture', 'implementation', 'dependencies'];
            for (const layer of layers) {
                const key = `nodeHistory-${layer}`;
                const stored = this.context.globalState.get<Record<string, NodeHistoryEvent[]>>(key);
                if (stored) {
                    this.nodeHistoryByLayer[layer] = new Map(Object.entries(stored));
                }
            }
        } catch (error) {
            console.warn('Failed to load node history from storage:', error);
        }
    }

    private saveNodeHistoryToStorage(): void {
        try {
            const layers: Layer[] = ['blueprint', 'architecture', 'implementation', 'dependencies'];
            for (const layer of layers) {
                const key = `nodeHistory-${layer}`;
                const obj: Record<string, NodeHistoryEvent[]> = {};
                for (const [k, v] of this.nodeHistoryByLayer[layer].entries()) {
                    obj[k] = v;
                }
                this.context.globalState.update(key, obj);
            }
        } catch (error) {
            console.warn('Failed to save node history to storage:', error);
        }
    }

    private loadDeletedNodesFromStorage(): void {
        try {
            const layers: Layer[] = ['blueprint', 'architecture', 'implementation', 'dependencies'];
            for (const layer of layers) {
                const key = `deletedNodes-${layer}`;
                const stored = this.context.globalState.get<string[]>(key);
                if (stored) {
                    this.deletedNodeIds[layer] = new Set(stored);
                }
            }
        } catch (error) {
            console.warn('Failed to load deleted nodes from storage:', error);
        }
    }

    private saveDeletedNodesToStorage(): void {
        try {
            const layers: Layer[] = ['blueprint', 'architecture', 'implementation', 'dependencies'];
            for (const layer of layers) {
                const key = `deletedNodes-${layer}`;
                const arr = Array.from(this.deletedNodeIds[layer]);
                this.context.globalState.update(key, arr);
            }
        } catch (error) {
            console.warn('Failed to save deleted nodes to storage:', error);
        }
    }

    // ============================================================================
    // SHARED STATE SYNCHRONIZATION (Phase 3)
    // ============================================================================

    /**
     * Load graph state from shared file (synced with MCP server)
     */
    private loadFromSharedState(): void {
        try {
            const sharedState = this.stateSyncService.readState();
            if (!sharedState) {
                log('[GraphService] No shared state found, using empty state');
                return;
            }

            // Load graphs
            this.graphs = sharedState.graphs;

            // Load current layer
            this.currentLayer = sharedState.currentLayer;

            // Load proposed changes
            const layers: Layer[] = ['blueprint', 'architecture', 'implementation', 'dependencies'];
            for (const layer of layers) {
                this.proposedChangesByLayer[layer].clear();
                for (const change of sharedState.proposedChanges[layer]) {
                    this.proposedChangesByLayer[layer].set(change.nodeId, change);
                }
            }
        } catch (error) {
            log(`[GraphService] Error loading from shared state: ${error}`);
        }
    }

    /**
     * Handle external state changes (from MCP server or other instances)
     */
    private handleExternalStateChange(sharedState: any): void {
        const startTime = Date.now();
        debug(`[GraphService] Handling external state change`, () => ({
            version: sharedState.version,
            source: sharedState.source,
            currentLayer: sharedState.currentLayer || 'unknown',
            nodeCounts: Object.entries(sharedState.graphs || {}).reduce((acc, [layer, graph]: [string, any]) => {
                acc[layer] = graph?.nodes?.length || 0;
                return acc;
            }, {} as Record<string, number>)
        }));
        
        // Set flag to prevent syncing back during this operation
        if (this.isApplyingExternalChange) {
            warn(`[GraphService] Already applying external change, ignoring recursive call`);
            return;
        }

        this.isApplyingExternalChange = true;

        try {
            // Detect changes before updating to determine if we need full refresh or property-only update
            const layers: Layer[] = ['blueprint', 'architecture', 'implementation', 'dependencies'];
            const propertyOnlyNodeUpdates = new Map<Layer, Map<string, Partial<GraphNode['data']>>>();
            const propertyOnlyEdgeUpdates = new Map<Layer, Map<string, Partial<GraphEdge['data']>>>();
            const structuralChangesByLayer = new Map<Layer, {
                addedNodes: GraphNode[];
                addedEdges: any[];
                removedNodeIds: string[];
                removedEdgeIds: string[];
                isInitialLoad: boolean;
            }>();
            let hasStructuralChanges = false;

            // Store old graphs before updating (needed for diff calculation)
            const oldGraphs: Record<Layer, GraphData> = {
                blueprint: JSON.parse(JSON.stringify(this.graphs.blueprint)),
                architecture: JSON.parse(JSON.stringify(this.graphs.architecture)),
                implementation: JSON.parse(JSON.stringify(this.graphs.implementation)),
                dependencies: JSON.parse(JSON.stringify(this.graphs.dependencies))
            };

            for (const layer of layers) {
                if (sharedState.graphs && sharedState.graphs[layer]) {
                    const oldGraph = oldGraphs[layer];
                    const newGraph = sharedState.graphs[layer];
                    
                    // Check if this is truly an initial load (old graph empty, new graph has nodes)
                    const oldGraphEmpty = !oldGraph || !oldGraph.nodes || oldGraph.nodes.length === 0;
                    const newGraphEmpty = !newGraph.nodes || (newGraph.nodes as GraphNode[]).length === 0;
                    
                    if (oldGraphEmpty && !newGraphEmpty) {
                        // True initial load: old was empty, new has nodes
                        hasStructuralChanges = true;
                        structuralChangesByLayer.set(layer, {
                            addedNodes: (newGraph.nodes as GraphNode[]),
                            addedEdges: (newGraph.edges as any[]) || [],
                            removedNodeIds: [],
                            removedEdgeIds: [],
                            isInitialLoad: true
                        });
                        debug(`[GraphService] ${layer}: True initial load detected (empty -> ${(newGraph.nodes as GraphNode[]).length} nodes), using full refresh`);
                        continue;
                    } else if (oldGraphEmpty && newGraphEmpty) {
                        // Both empty - no change, skip
                        debug(`[GraphService] ${layer}: Both old and new graphs are empty, skipping`);
                        continue;
                    } else if (!oldGraph || !oldGraph.nodes || oldGraph.nodes.length === 0) {
                        // This shouldn't happen, but handle gracefully
                        debug(`[GraphService] ${layer}: Old graph empty but new graph also empty, skipping`);
                        continue;
                    }
                    
                    // Check for structural changes (node/edge count or IDs changed)
                    const oldNodeIds = new Set<string>(oldGraph.nodes.map((n: GraphNode) => n.data.id));
                    const newNodeIds = new Set<string>((newGraph.nodes as GraphNode[]).map((n: GraphNode) => n.data.id));
                    const oldEdgeIds = new Set<string>(oldGraph.edges.map((e: any) => e.data.id));
                    const newEdgeIds = new Set<string>((newGraph.edges as any[]).map((e: any) => e.data.id));
                    
                    const nodesAdded = newNodeIds.size > oldNodeIds.size || 
                        [...newNodeIds].some((id: string) => !oldNodeIds.has(id));
                    const nodesRemoved = oldNodeIds.size > newNodeIds.size || 
                        [...oldNodeIds].some((id: string) => !newNodeIds.has(id));
                    const edgesAdded = newEdgeIds.size > oldEdgeIds.size || 
                        [...newEdgeIds].some((id: string) => !oldEdgeIds.has(id));
                    const edgesRemoved = oldEdgeIds.size > newEdgeIds.size || 
                        [...oldEdgeIds].some((id: string) => !newEdgeIds.has(id));
                    
                    debug(`[GraphService] ${layer}: Change detection - nodesAdded: ${nodesAdded}, nodesRemoved: ${nodesRemoved}, edgesAdded: ${edgesAdded}, edgesRemoved: ${edgesRemoved}, oldNodes: ${oldNodeIds.size}, newNodes: ${newNodeIds.size}`);
                    
                    if (nodesAdded || nodesRemoved || edgesAdded || edgesRemoved) {
                        hasStructuralChanges = true;
                        
                        // Calculate exact diff
                        const addedNodeIds = [...newNodeIds].filter(id => !oldNodeIds.has(id));
                        const removedNodeIds = [...oldNodeIds].filter(id => !newNodeIds.has(id));
                        const addedEdgeIds = [...newEdgeIds].filter(id => !oldEdgeIds.has(id));
                        const removedEdgeIds = [...oldEdgeIds].filter(id => !newEdgeIds.has(id));
                        
                        // Get the actual node/edge objects from new graph
                        const addedNodes = (newGraph.nodes as GraphNode[]).filter(n => addedNodeIds.includes(n.data.id));
                        const addedEdges = (newGraph.edges as any[]).filter(e => addedEdgeIds.includes(e.data.id));
                        
                        structuralChangesByLayer.set(layer, {
                            addedNodes,
                            addedEdges,
                            removedNodeIds,
                            removedEdgeIds,
                            isInitialLoad: false
                        });
                        
                        debug(`[GraphService] ${layer}: Structural changes detected - +${addedNodes.length} nodes, -${removedNodeIds.length} nodes, +${addedEdges.length} edges, -${removedEdgeIds.length} edges`);
                    } else {
                        // Check for property-only changes
                        const nodeUpdates = new Map<string, Partial<GraphNode['data']>>();
                        for (const newNode of newGraph.nodes) {
                            const oldNode = oldGraph.nodes.find(n => n.data.id === newNode.data.id);
                            if (oldNode) {
                                // Compare node data properties
                                const updates: Partial<GraphNode['data']> = {};
                                let hasUpdates = false;
                                
                                // Get all unique keys from both old and new node data
                                const allKeys = new Set<string>();
                                for (const key in oldNode.data) {
                                    if (Object.prototype.hasOwnProperty.call(oldNode.data, key)) {
                                        allKeys.add(key);
                                    }
                                }
                                for (const key in newNode.data) {
                                    if (Object.prototype.hasOwnProperty.call(newNode.data, key)) {
                                        allKeys.add(key);
                                    }
                                }
                                
                                // Check all properties in both old and new
                                for (const key of allKeys) {
                                    const typedKey = key as keyof GraphNode['data'];
                                    const oldValue = oldNode.data[typedKey];
                                    const newValue = newNode.data[typedKey];
                                    
                                    // Compare values (handles undefined, null, and other types)
                                    let valuesDiffer = false;
                                    if (oldValue === undefined && newValue === undefined) {
                                        valuesDiffer = false;
                                    } else if (oldValue === null && newValue === null) {
                                        valuesDiffer = false;
                                    } else if (oldValue === undefined || newValue === undefined) {
                                        valuesDiffer = true; // One is undefined, other is not
                                    } else if (oldValue === null || newValue === null) {
                                        valuesDiffer = oldValue !== newValue;
                                    } else {
                                        // Both have values - use JSON.stringify for deep comparison
                                        const oldStr = JSON.stringify(oldValue);
                                        const newStr = JSON.stringify(newValue);
                                        valuesDiffer = oldStr !== newStr;
                                    }
                                    
                                    if (valuesDiffer) {
                                        updates[typedKey] = newValue;
                                        hasUpdates = true;
                                        debug(`[GraphService] ${layer}: Node ${newNode.data.id} - property '${key}' changed: ${oldValue === undefined ? 'undefined' : JSON.stringify(oldValue)} -> ${newValue === undefined ? 'undefined' : JSON.stringify(newValue)}`);
                                    }
                                }
                                
                                if (hasUpdates) {
                                    nodeUpdates.set(newNode.data.id, updates);
                                }
                            }
                        }
                        
                        if (nodeUpdates.size > 0) {
                            propertyOnlyNodeUpdates.set(layer, nodeUpdates);
                            debug(`[GraphService] ${layer}: Property-only changes detected for ${nodeUpdates.size} nodes`);
                        }
                        
                        // Check for edge property-only changes
                        const edgeUpdates = new Map<string, Partial<GraphEdge['data']>>();
                        for (const newEdge of newGraph.edges) {
                            const oldEdge = oldGraph.edges.find(e => e.data.id === newEdge.data.id);
                            if (oldEdge) {
                                // Compare edge data properties
                                const updates: Partial<GraphEdge['data']> = {};
                                let hasUpdates = false;
                                
                                // Get all unique keys from both old and new edge data
                                const allKeys = new Set<string>();
                                for (const key in oldEdge.data) {
                                    if (Object.prototype.hasOwnProperty.call(oldEdge.data, key)) {
                                        allKeys.add(key);
                                    }
                                }
                                for (const key in newEdge.data) {
                                    if (Object.prototype.hasOwnProperty.call(newEdge.data, key)) {
                                        allKeys.add(key);
                                    }
                                }
                                
                                // Check all properties in both old and new
                                for (const key of allKeys) {
                                    const typedKey = key as keyof GraphEdge['data'];
                                    const oldValue = oldEdge.data[typedKey];
                                    const newValue = newEdge.data[typedKey];
                                    
                                    // Compare values (handles undefined, null, and other types)
                                    let valuesDiffer = false;
                                    if (oldValue === undefined && newValue === undefined) {
                                        valuesDiffer = false;
                                    } else if (oldValue === null && newValue === null) {
                                        valuesDiffer = false;
                                    } else if (oldValue === undefined || newValue === undefined) {
                                        valuesDiffer = true; // One is undefined, other is not
                                    } else if (oldValue === null || newValue === null) {
                                        valuesDiffer = oldValue !== newValue;
                                    } else {
                                        // Both have values - use JSON.stringify for deep comparison
                                        const oldStr = JSON.stringify(oldValue);
                                        const newStr = JSON.stringify(newValue);
                                        valuesDiffer = oldStr !== newStr;
                                    }
                                    
                                    if (valuesDiffer) {
                                        updates[typedKey] = newValue;
                                        hasUpdates = true;
                                        debug(`[GraphService] ${layer}: Edge ${newEdge.data.id} - property '${key}' changed: ${oldValue === undefined ? 'undefined' : JSON.stringify(oldValue)} -> ${newValue === undefined ? 'undefined' : JSON.stringify(newValue)}`);
                                    }
                                }
                                
                                if (hasUpdates) {
                                    edgeUpdates.set(newEdge.data.id, updates);
                                }
                            }
                        }
                        
                        if (edgeUpdates.size > 0) {
                            propertyOnlyEdgeUpdates.set(layer, edgeUpdates);
                            debug(`[GraphService] ${layer}: Property-only changes detected for ${edgeUpdates.size} edges`);
                        }
                    }
                }
            }

            // Update graphs - deep copy to ensure proper data structure
            for (const layer of layers) {
                if (sharedState.graphs && sharedState.graphs[layer]) {
                    this.graphs[layer] = JSON.parse(JSON.stringify(sharedState.graphs[layer]));
                    debug(`[GraphService] ${layer} layer updated: ${this.graphs[layer].nodes.length} nodes, ${this.graphs[layer].edges.length} edges`);
                }
            }
            debug(`[GraphService] All graphs updated`);

            // Update current layer
            if (sharedState.currentLayer) {
                this.currentLayer = sharedState.currentLayer;
                debug(`[GraphService] Current layer updated: ${this.currentLayer}`);
            }

            // Update proposed changes
            for (const layer of layers) {
                this.proposedChangesByLayer[layer].clear();
                const changes = sharedState.proposedChanges?.[layer] || [];
                for (const change of changes) {
                    this.proposedChangesByLayer[layer].set(change.nodeId, change);
                }
                if (changes.length > 0) {
                    debug(`[GraphService] ${layer}: ${changes.length} proposed changes`);
                }
            }

            // Notify listeners based on change type
            // PRIORITY: Property-only updates take precedence over structural changes for the same layer
            
            // First, handle property-only node updates (these take priority)
            if (propertyOnlyNodeUpdates.size > 0) {
                for (const [layer, nodeUpdates] of propertyOnlyNodeUpdates.entries()) {
                    this.onNodePropertiesChangedEmitter.fire({ layer, nodeUpdates });
                }
            }
            
            // Handle property-only edge updates
            if (propertyOnlyEdgeUpdates.size > 0) {
                for (const [layer, edgeUpdates] of propertyOnlyEdgeUpdates.entries()) {
                    this.onEdgePropertiesChangedEmitter.fire({ layer, edgeUpdates });
                }
            }
            
            // Then, handle structural changes for layers that don't have property-only updates
            if (hasStructuralChanges) {
                // For external changes, use incremental updates to preserve zoom/state
                for (const [layer, changeInfo] of structuralChangesByLayer.entries()) {
                    // Skip if this layer already has property-only updates (already handled above)
                    if (propertyOnlyNodeUpdates.has(layer) || propertyOnlyEdgeUpdates.has(layer)) {
                        continue;
                    }
                    
                    if (changeInfo.isInitialLoad) {
                        // Initial load - use full refresh
                        this.batchGraphChangeEvent();
                    } else if (changeInfo.addedNodes.length > 0 || changeInfo.removedNodeIds.length > 0 || 
                               changeInfo.addedEdges.length > 0 || changeInfo.removedEdgeIds.length > 0) {
                        // Incremental structural change - preserve zoom/state
                        this.onGraphChangedIncrementalEmitter.fire({
                            layer,
                            addedNodes: changeInfo.addedNodes,
                            addedEdges: changeInfo.addedEdges,
                            removedNodeIds: changeInfo.removedNodeIds,
                            removedEdgeIds: changeInfo.removedEdgeIds,
                            fullGraph: this.graphs[layer] // Current state after update
                        });
                    }
                }
            }

            const totalTime = Date.now() - startTime;
            debug(`[GraphService] External state change applied (${totalTime}ms)`);
        } catch (err) {
            error(`[GraphService] Error handling external state change`, err);
        } finally {
            // Reset flag after a delay to allow any triggered operations to complete
            setTimeout(() => {
                this.isApplyingExternalChange = false;
                debug(`[GraphService] Reset isApplyingExternalChange flag`);
            }, 500);
        }
    }

    /**
     * Sync current state to shared file (for MCP server to read)
     */
    private syncToSharedState(): void {
        debug(`[GraphService] syncToSharedState called`);
        log(`  - isApplyingExternalChange: ${this.isApplyingExternalChange}`);
        
        // Don't sync if we're applying an external change to prevent feedback loop
        if (this.isApplyingExternalChange) {
            debug(`[GraphService] Skipping sync - currently applying external change (preventing feedback loop)`);
            return;
        }

        try {
            debug(`[GraphService] Preparing state for sync...`);
            // Convert proposed changes from Map to Array
            const layers: Layer[] = ['blueprint', 'architecture', 'implementation', 'dependencies'];
            const proposedChangesArray: any = {};
            
            for (const layer of layers) {
                proposedChangesArray[layer] = Array.from(this.proposedChangesByLayer[layer].values());
                log(`  - ${layer}: ${proposedChangesArray[layer].length} proposed changes`);
            }

            debug(`[GraphService] Calling stateSyncService.writeState...`);
            // Write to shared state
            this.stateSyncService.writeState({
                currentLayer: this.currentLayer,
                graphs: this.graphs,
                proposedChanges: proposedChangesArray
            });
            debug(`[GraphService] State sync initiated`);
        } catch (error) {
            log(`[GraphService] ❌ ERROR syncing to shared state: ${error}`);
            if (error instanceof Error) {
                log(`[GraphService] Error message: ${error.message}`);
                log(`[GraphService] Error stack: ${error.stack}`);
            }
        }
    }

    /**
     * Get the shared state file path (for debugging)
     */
    public getSharedStateFilePath(): string {
        return this.stateSyncService.getStateFilePath();
    }

    /**
     * Clear all graph data and state (for full refresh)
     * This clears:
     * - All graphs (nodes/edges) for all layers
     * - All proposed changes
     * - All node history
     * - All deleted node tracking
     * - globalState storage
     * - graph-state.json file
     */
    public async clearAllState(): Promise<void> {
        log('[GraphService] Clearing all graph state...');
        
        // Clear in-memory graphs
        this.graphs = {
            blueprint: { nodes: [], edges: [] },
            architecture: { nodes: [], edges: [] },
            implementation: { nodes: [], edges: [] },
            dependencies: { nodes: [], edges: [] }
        };
        
        // Clear proposed changes
        const layers: Layer[] = ['blueprint', 'architecture', 'implementation', 'dependencies'];
        for (const layer of layers) {
            this.proposedChangesByLayer[layer].clear();
            this.nodeHistoryByLayer[layer].clear();
            this.deletedNodeIds[layer].clear();
        }
        
        // Clear globalState
        try {
            // Clear graph data
            await this.context.globalState.update('graphData', undefined);
            
            // Clear proposed changes
            for (const layer of layers) {
                await this.context.globalState.update(`proposedChanges-${layer}`, undefined);
                await this.context.globalState.update(`nodeHistory-${layer}`, undefined);
                await this.context.globalState.update(`deletedNodes-${layer}`, undefined);
            }
            log('[GraphService] ✓ Cleared globalState');
        } catch (error) {
            log(`[GraphService] Error clearing globalState: ${error}`);
        }
        
        // Delete graph-state.json file
        try {
            const stateFile = getSharedStateFile();
            if (fs.existsSync(stateFile)) {
                fs.unlinkSync(stateFile);
                log(`[GraphService] ✓ Deleted graph-state.json: ${stateFile}`);
            } else {
                log(`[GraphService] graph-state.json does not exist: ${stateFile}`);
            }
        } catch (error) {
            log(`[GraphService] Error deleting graph-state.json: ${error}`);
        }
        
        // Reinitialize state file with empty state
        try {
            const emptyState = createEmptySharedState();
            this.stateSyncService.writeStateImmediate(emptyState);
            log('[GraphService] ✓ Reinitialized empty graph-state.json');
        } catch (error) {
            log(`[GraphService] Error reinitializing state file: ${error}`);
        }
        
        // Notify listeners that graph has changed
        // For clearAllState, fire immediately (user-initiated action)
        this.onGraphChangedEmitter.fire();
        
        log('[GraphService] ✓ All state cleared successfully');
    }
    
    /**
     * Batch graph change events to prevent overwhelming the webview
     * Collects multiple rapid changes and fires a single event after 300ms delay
     */
    private batchGraphChangeEvent(): void {
        // Clear existing timer
        if (this.graphChangeBatchTimer) {
            clearTimeout(this.graphChangeBatchTimer);
        }
        
        // Debounce: wait 300ms after last change before firing event
        this.graphChangeBatchTimer = setTimeout(() => {
            this.graphChangeBatchTimer = undefined;
            const beforeFire = Date.now();
            this.onGraphChangedEmitter.fire();
            const afterFire = Date.now();
            debug(`[GraphService] Batched graph change event fired (took ${afterFire - beforeFire}ms)`);
        }, 300); // 300ms batching delay
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.stateSyncService.dispose();
        if (this.graphChangeBatchTimer) {
            clearTimeout(this.graphChangeBatchTimer);
        }
    }
}

