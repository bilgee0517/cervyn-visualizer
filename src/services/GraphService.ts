import * as vscode from 'vscode';
import * as fs from 'fs';
import { GraphData, GraphNode, GraphEdge, Layer, ProposedChange, NodeHistoryEvent } from '../types';
import { StateSyncService } from './StateSyncService';
import { log, debug, error as logError } from '../logger';
import { getSharedStateFile, createEmptySharedState, MCP_OWNED_PROPERTIES, SharedGraphState } from '../config/shared-state-config';
import { 
    GraphStateError, 
    ValidationError, 
    FileSystemError 
} from '../errors';
import { Result, Ok, Err } from '../types/result';
import { 
    handleError, 
    generateCorrelationId 
} from '../utils/error-handler';
import { conflictResolutionService } from './ConflictResolutionService';

export class GraphService {
    private stateSyncService: StateSyncService;
    private lastSyncedState: SharedGraphState | null = null; // For three-way merge
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
    
    // C4 Model Layers: Context → Container → Component → Code
    // NOTE: Currently, ONLY the 'code' layer (C4 Level 4) is auto-populated.
    // Other layers are empty and will be implemented in future updates.
    private graphs: Record<Layer, GraphData> = {
        context: { nodes: [], edges: [] },
        container: { nodes: [], edges: [] },
        component: { nodes: [], edges: [] },
        code: { nodes: [], edges: [] }
    };

    private currentLayer: Layer = 'code';
    private graphChangeBatchTimer?: NodeJS.Timeout; // Batch multiple graph change events

    // Proposed changes storage (per-layer) - in-memory until applied
    private proposedChangesByLayer: Record<Layer, Map<string, ProposedChange>> = {
        context: new Map(),
        container: new Map(),
        component: new Map(),
        code: new Map()
    };

    // Node history tracking (per-layer)
    private nodeHistoryByLayer: Record<Layer, Map<string, NodeHistoryEvent[]>> = {
        context: new Map(),
        container: new Map(),
        component: new Map(),
        code: new Map()
    };

    // Deleted node tracking (per-layer)
    private deletedNodeIds: Record<Layer, Set<string>> = {
        context: new Set(),
        container: new Set(),
        component: new Set(),
        code: new Set()
    };

    constructor(private context: vscode.ExtensionContext) {
        // Initialize state sync service
        this.stateSyncService = new StateSyncService();
        
        // Migrate from globalState to shared file (one-time migration)
        this.migrateFromGlobalState();
        
        // Load from shared state file (synced with MCP server)
        this.loadFromSharedState();
        
        // Start watching for external changes (from MCP server)
        this.stateSyncService.startWatching();
        this.stateSyncService.onStateChanged((sharedState) => {
            log('[GraphService] External state change detected, updating...');
            this.handleExternalStateChange(sharedState);
        });
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
        this.syncToSharedState();
    }

    public clearGraph(layer?: Layer): void {
        if (layer) {
            this.graphs[layer] = { nodes: [], edges: [] };
        } else {
            // Clear all layers
            this.graphs = {
                context: { nodes: [], edges: [] },
                container: { nodes: [], edges: [] },
                component: { nodes: [], edges: [] },
                code: { nodes: [], edges: [] }
            };
        }
        this.syncToSharedState();
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
        
        this.syncToSharedState();
        
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
        
        this.syncToSharedState();
        
        // Fire edge property changed event (property-only update, no full refresh)
        const edgeUpdates = new Map<string, Partial<GraphEdge['data']>>();
        edgeUpdates.set(edgeId, updates);
        this.onEdgePropertiesChangedEmitter.fire({ layer: lyr, edgeUpdates });
    }

    // ============================================================================
    // MIGRATION FROM GLOBALSTATE TO SHARED FILE (One-time migration)
    // ============================================================================

    /**
     * Migrate data from VS Code globalState to shared file system
     * This is a one-time migration that runs on first load after update
     */
    private migrateFromGlobalState(): void {
        const migrationKey = 'codebaseVisualizer.migratedToSharedFile';
        const hasMigrated = this.context.globalState.get<boolean>(migrationKey);
        
        if (hasMigrated) {
            debug('[GraphService] Migration already completed, skipping');
            return;
        }

        log('[GraphService] Starting migration from globalState to shared file...');
        
        try {
            const sharedState = this.stateSyncService.readState() || createEmptySharedState();
            let hasDataToMigrate = false;

            // Migrate graph data
            const storedGraphs = this.context.globalState.get<Record<Layer, GraphData>>('graphData');
            if (storedGraphs) {
                log('[GraphService] Migrating graph data...');
                sharedState.graphs = storedGraphs;
                hasDataToMigrate = true;
            }

            // Migrate proposed changes
            const layers: Layer[] = ['context', 'container', 'component', 'code'];
            for (const layer of layers) {
                const key = `proposedChanges-${layer}`;
                const stored = this.context.globalState.get<Record<string, ProposedChange>>(key);
                if (stored && Object.keys(stored).length > 0) {
                    log(`[GraphService] Migrating ${Object.keys(stored).length} proposed changes for ${layer} layer...`);
                    // Filter out changes without nodeId and ensure nodeId is set
                    sharedState.proposedChanges[layer] = Object.values(stored)
                        .filter(change => change.nodeId)
                        .map(change => ({ ...change, nodeId: change.nodeId! }));
                    hasDataToMigrate = true;
                }
            }

            // Migrate node history
            if (!sharedState.nodeHistory) {
                sharedState.nodeHistory = {
                    context: {},
                    container: {},
                    component: {},
                    code: {}
                };
            }
            for (const layer of layers) {
                const key = `nodeHistory-${layer}`;
                const stored = this.context.globalState.get<Record<string, NodeHistoryEvent[]>>(key);
                if (stored && Object.keys(stored).length > 0) {
                    log(`[GraphService] Migrating node history for ${layer} layer...`);
                    sharedState.nodeHistory[layer] = stored;
                    hasDataToMigrate = true;
                }
            }

            // Migrate deleted nodes
            if (!sharedState.deletedNodes) {
                sharedState.deletedNodes = {
                    context: [],
                    container: [],
                    component: [],
                    code: []
                };
            }
            for (const layer of layers) {
                const key = `deletedNodes-${layer}`;
                const stored = this.context.globalState.get<string[]>(key);
                if (stored && stored.length > 0) {
                    log(`[GraphService] Migrating ${stored.length} deleted nodes for ${layer} layer...`);
                    sharedState.deletedNodes[layer] = stored;
                    hasDataToMigrate = true;
                }
            }

            // Write migrated data to shared file
            if (hasDataToMigrate) {
                this.stateSyncService.writeStateImmediate(sharedState);
                log('[GraphService] ✓ Migration completed successfully');
            } else {
                log('[GraphService] No data to migrate');
            }

            // Mark migration as complete
            this.context.globalState.update(migrationKey, true);
            
            // Optionally clear old globalState data (commented out for safety - uncomment after verifying migration works)
            // this.clearGlobalStateData();
            
        } catch (err) {
            const migrationError = new GraphStateError(
                'Failed to migrate from globalState to shared file',
                'load',
                { operation: 'migration' },
                err instanceof Error ? err : undefined
            );
            handleError(migrationError, {
                operation: 'migrateFromGlobalState',
                component: 'GraphService',
                metadata: { canRetry: true }
            }, true);
            // Don't mark as migrated if there was an error, so it can retry
        }
    }

    /**
     * Clear old globalState data after successful migration
     * This is called after verifying migration works correctly
     */
    private async clearGlobalStateData(): Promise<void> {
        log('[GraphService] Clearing old globalState data...');
        try {
            const layers: Layer[] = ['context', 'container', 'component', 'code'];
            
            // Clear graph data
            await this.context.globalState.update('graphData', undefined);
            
            // Clear proposed changes
            for (const layer of layers) {
                await this.context.globalState.update(`proposedChanges-${layer}`, undefined);
                await this.context.globalState.update(`nodeHistory-${layer}`, undefined);
                await this.context.globalState.update(`deletedNodes-${layer}`, undefined);
            }
            
            log('[GraphService] ✓ Cleared old globalState data');
        } catch (err) {
            const clearError = new GraphStateError(
                'Failed to clear old globalState data',
                'save',
                { operation: 'clearGlobalStateData' },
                err instanceof Error ? err : undefined
            );
            handleError(clearError, {
                operation: 'clearGlobalStateData',
                component: 'GraphService'
            });
        }
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
        this.syncToSharedState();
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
            this.syncToSharedState();
        }
    }

    /**
     * Clear all proposed changes for a layer.
     */
    public clearAllProposedChanges(layer?: Layer): void {
        const lyr = layer || this.currentLayer;
        this.proposedChangesByLayer[lyr].clear();
        this.syncToSharedState();
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
        this.syncToSharedState();

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
        this.syncToSharedState();
    }

    /**
     * Clear history for a specific node.
     */
    public clearNodeHistory(nodeId: string, layer?: Layer): void {
        const lyr = layer || this.currentLayer;
        this.nodeHistoryByLayer[lyr].delete(nodeId);
        this.syncToSharedState();
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
        this.syncToSharedState();
    }

    /**
     * Remove all nodes for a deleted file and mark them as deleted
     * This ensures orphaned entries are cleaned up when files are deleted
     */
    public removeNodesForFile(filePath: string, layer?: Layer): void {
        const lyr = layer || this.currentLayer;
        const graph = this.graphs[lyr];
        
        log(`[GraphService] Removing nodes for deleted file: ${filePath}`);
        
        // Find all nodes related to this file (file node + its children like classes/functions)
        const nodesToRemove = graph.nodes.filter(n => n.data.path === filePath);
        
        if (nodesToRemove.length === 0) {
            debug(`[GraphService] No nodes found for file: ${filePath}`);
            return;
        }
        
        const nodeIdsToRemove = new Set(nodesToRemove.map(n => n.data.id));
        
        // Also find child nodes (nodes that have one of the file nodes as parent)
        const fileNodeIds = new Set(nodesToRemove.filter(n => n.data.type === 'file').map(n => n.data.id));
        const childNodes = graph.nodes.filter(n => n.data.parent && fileNodeIds.has(n.data.parent));
        for (const childNode of childNodes) {
            nodeIdsToRemove.add(childNode.data.id);
        }
        
        // Remove edges connected to removed nodes
        const edgesToRemove = graph.edges.filter(e => 
            nodeIdsToRemove.has(e.data.source) || nodeIdsToRemove.has(e.data.target)
        );
        
        log(`[GraphService] Removing ${nodeIdsToRemove.size} nodes and ${edgesToRemove.length} edges for file: ${filePath}`);
        
        // Mark nodes as deleted
        for (const nodeId of nodeIdsToRemove) {
            this.markNodeAsDeleted(nodeId, lyr);
        }
        
        // Remove from in-memory graph
        graph.nodes = graph.nodes.filter(n => !nodeIdsToRemove.has(n.data.id));
        graph.edges = graph.edges.filter(e => {
            const edgeId = e.data.id;
            return !edgesToRemove.some(removed => removed.data.id === edgeId);
        });
        
        // Record in history for each removed node
        for (const nodeId of nodeIdsToRemove) {
            this.recordNodeHistory(lyr, nodeId, {
                timestamp: Date.now(),
                action: 'deleted',
                details: `File deleted: ${filePath}`
            });
        }
        
        // Sync to shared state
        this.syncToSharedState();
        
        // Fire incremental change event
        this.onGraphChangedIncrementalEmitter.fire({
            layer: lyr,
            addedNodes: [],
            addedEdges: [],
            removedNodeIds: Array.from(nodeIdsToRemove),
            removedEdgeIds: edgesToRemove.map(e => e.data.id),
            fullGraph: graph
        });
        
        log(`[GraphService] ✓ Removed nodes for deleted file: ${filePath}`);
    }

    /**
     * Reconcile in-memory graph state with actual file system
     * Removes orphaned nodes that point to non-existent files
     * Should be called on startup and after major file system changes
     */
    public async reconcileStateWithFilesystem(): Promise<void> {
        const correlationId = generateCorrelationId();
        log('[GraphService] Starting state reconciliation with file system...', () => ({ correlationId }));
        
        const layers: Layer[] = ['context', 'container', 'component', 'code'];
        let totalOrphanedNodes = 0;
        let totalOrphanedEdges = 0;
        
        for (const layer of layers) {
            const graph = this.graphs[layer];
            const orphanedNodeIds = new Set<string>();
            
            // Check each node that has a path (file nodes)
            for (const node of graph.nodes) {
                if (node.data.path) {
                    // Skip agent-added nodes (they don't correspond to real files)
                    if (node.data.isAgentAdded) {
                        continue;
                    }
                    
                    // Check if file exists
                    if (!fs.existsSync(node.data.path)) {
                        debug(`[GraphService] Found orphaned node: ${node.data.id} (path: ${node.data.path})`, () => ({ correlationId }));
                        orphanedNodeIds.add(node.data.id);
                        
                        // Also mark child nodes as orphaned
                        if (node.data.type === 'file') {
                            const childNodes = graph.nodes.filter(n => n.data.parent === node.data.id);
                            for (const childNode of childNodes) {
                                orphanedNodeIds.add(childNode.data.id);
                            }
                        }
                    }
                }
            }
            
            if (orphanedNodeIds.size === 0) {
                debug(`[GraphService] No orphaned nodes found in ${layer} layer`, () => ({ correlationId }));
                continue;
            }
            
            // Remove orphaned edges
            const orphanedEdges = graph.edges.filter(e => 
                orphanedNodeIds.has(e.data.source) || orphanedNodeIds.has(e.data.target)
            );
            
            log(`[GraphService] Found ${orphanedNodeIds.size} orphaned nodes and ${orphanedEdges.length} orphaned edges in ${layer} layer`, () => ({ correlationId }));
            
            // Mark nodes as deleted
            for (const nodeId of orphanedNodeIds) {
                this.markNodeAsDeleted(nodeId, layer);
            }
            
            // Remove orphaned nodes and edges from graph
            graph.nodes = graph.nodes.filter(n => !orphanedNodeIds.has(n.data.id));
            graph.edges = graph.edges.filter(e => {
                const edgeId = e.data.id;
                return !orphanedEdges.some(removed => removed.data.id === edgeId);
            });
            
            // Record in history
            for (const nodeId of orphanedNodeIds) {
                this.recordNodeHistory(layer, nodeId, {
                    timestamp: Date.now(),
                    action: 'deleted',
                    details: 'Orphaned node removed during startup reconciliation'
                });
            }
            
            totalOrphanedNodes += orphanedNodeIds.size;
            totalOrphanedEdges += orphanedEdges.length;
        }
        
        if (totalOrphanedNodes > 0) {
            log(`[GraphService] ✓ Reconciliation complete: removed ${totalOrphanedNodes} orphaned nodes and ${totalOrphanedEdges} orphaned edges across all layers`, () => ({ correlationId }));
            // Sync to shared state
            this.syncToSharedState();
            // Fire graph change event
            this.batchGraphChangeEvent();
        } else {
            log('[GraphService] ✓ Reconciliation complete: no orphaned nodes found', () => ({ correlationId }));
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
            const layers: Layer[] = ['context', 'container', 'component', 'code'];
            for (const layer of layers) {
                this.proposedChangesByLayer[layer].clear();
                for (const change of sharedState.proposedChanges[layer]) {
                    this.proposedChangesByLayer[layer].set(change.nodeId, change);
                }
            }

            // Load node history
            if (sharedState.nodeHistory) {
                for (const layer of layers) {
                    this.nodeHistoryByLayer[layer].clear();
                    const history = sharedState.nodeHistory[layer];
                    if (history) {
                        for (const [nodeId, events] of Object.entries(history)) {
                            this.nodeHistoryByLayer[layer].set(nodeId, events);
                        }
                    }
                }
            }

            // Load deleted nodes
            if (sharedState.deletedNodes) {
                for (const layer of layers) {
                    this.deletedNodeIds[layer].clear();
                    const deleted = sharedState.deletedNodes[layer];
                    if (deleted) {
                        for (const nodeId of deleted) {
                            this.deletedNodeIds[layer].add(nodeId);
                        }
                    }
                }
            }
        } catch (error) {
            log(`[GraphService] Error loading from shared state: ${error}`);
        }
    }

    /**
     * Handle external state changes (from MCP server or other instances)
     * Uses three-way merge with property ownership awareness
     */
    private handleExternalStateChange(sharedState: SharedGraphState): void {
        debug(`[GraphService] Handling external state change (version ${sharedState.version}, source: ${sharedState.source})`);
        
        try {
            // Create current local state for merge
            const localState = this.getCurrentStateSnapshot();
            
            // Check if we need conflict resolution
            if (conflictResolutionService.hasConflicts(localState, sharedState)) {
                log(`[GraphService] Conflicts detected, performing three-way merge...`);
                
                // Perform three-way merge
                const { mergedState, conflicts, stats } = conflictResolutionService.mergeStates(
                    this.lastSyncedState,
                    localState,
                    sharedState
                );
                
                if (conflicts.length > 0) {
                    log(`[GraphService] ✓ Resolved ${conflicts.length} conflicts during merge`, () => ({
                        nodesProcessed: stats.nodesProcessed,
                        conflictsResolved: stats.conflictsResolved
                    }));
                }
                
                // Apply merged state
                this.applyMergedState(mergedState);
                
                // Update last synced state
                this.lastSyncedState = conflictResolutionService.createMergeBase(mergedState);
            } else {
                // No conflicts - apply simple merge
                if (sharedState.source === 'mcp-server') {
                    // MCP enriched the graph - merge only MCP-owned properties
                    this.mergeExternalChanges(sharedState);
                } else {
                    // Another extension instance - full replace (rare case)
                    this.applyFullGraphUpdate(sharedState);
                }
                
                // Update last synced state
                this.lastSyncedState = conflictResolutionService.createMergeBase(sharedState);
            }

        } catch (err) {
            logError(`[GraphService] Error handling external state change`, err);
        }
    }

    /**
     * Get current state as a snapshot for merge operations
     */
    private getCurrentStateSnapshot(): SharedGraphState {
        const layers: Layer[] = ['context', 'container', 'component', 'code'];
        const proposedChangesArray: any = {};
        const nodeHistoryObject: any = {};
        const deletedNodesArray: any = {};
        
        for (const layer of layers) {
            proposedChangesArray[layer] = Array.from(this.proposedChangesByLayer[layer].values());
            
            const historyMap = this.nodeHistoryByLayer[layer];
            nodeHistoryObject[layer] = {};
            for (const [nodeId, events] of historyMap.entries()) {
                nodeHistoryObject[layer][nodeId] = events;
            }
            
            deletedNodesArray[layer] = Array.from(this.deletedNodeIds[layer]);
        }

        return {
            schemaVersion: 1,
            version: 0, // Will be set during merge
            timestamp: Date.now(),
            source: 'vscode-extension',
            currentLayer: this.currentLayer,
            agentOnlyMode: false,
            graphs: this.graphs,
            proposedChanges: proposedChangesArray,
            nodeHistory: nodeHistoryObject,
            deletedNodes: deletedNodesArray
        };
    }

    /**
     * Apply merged state after conflict resolution
     */
    private applyMergedState(mergedState: SharedGraphState): void {
        const layers: Layer[] = ['context', 'container', 'component', 'code'];
        
        // Apply graphs
        for (const layer of layers) {
            if (mergedState.graphs && mergedState.graphs[layer]) {
                this.graphs[layer] = JSON.parse(JSON.stringify(mergedState.graphs[layer]));
            }
        }

        // Apply current layer
        if (mergedState.currentLayer) {
            this.currentLayer = mergedState.currentLayer;
        }

        // Apply proposed changes
        for (const layer of layers) {
            this.proposedChangesByLayer[layer].clear();
            const changes = mergedState.proposedChanges?.[layer] || [];
            for (const change of changes) {
                this.proposedChangesByLayer[layer].set(change.nodeId, change);
            }
        }

        // Apply node history
        if (mergedState.nodeHistory) {
            for (const layer of layers) {
                this.nodeHistoryByLayer[layer].clear();
                const history = mergedState.nodeHistory[layer];
                if (history) {
                    for (const [nodeId, events] of Object.entries(history)) {
                        if (Array.isArray(events)) {
                            this.nodeHistoryByLayer[layer].set(nodeId, events as NodeHistoryEvent[]);
                        }
                    }
                }
            }
        }

        // Apply deleted nodes
        if (mergedState.deletedNodes) {
            for (const layer of layers) {
                this.deletedNodeIds[layer].clear();
                const deleted = mergedState.deletedNodes[layer];
                if (deleted) {
                    for (const nodeId of deleted) {
                        this.deletedNodeIds[layer].add(nodeId);
                    }
                }
            }
        }

        // Fire full graph change event
        this.batchGraphChangeEvent();
        
        debug(`[GraphService] Applied merged state after conflict resolution`);
    }

    /**
     * Merge external changes from MCP server (property-only updates)
     * Only merges MCP-owned properties, preserves extension-owned properties
     */
    private mergeExternalChanges(external: any): void {
        const layers: Layer[] = ['context', 'container', 'component', 'code'];
        const nodeUpdatesMap = new Map<Layer, Map<string, Partial<GraphNode['data']>>>();
        
        for (const layer of layers) {
            const nodeUpdates = new Map<string, Partial<GraphNode['data']>>();
            
            if (external.graphs && external.graphs[layer]) {
                // Process node updates
                for (const externalNode of external.graphs[layer].nodes) {
                    const existing = this.graphs[layer].nodes.find(n => n.data.id === externalNode.data.id);
                    
                    if (existing) {
                        // Merge only MCP-owned properties
                        const updates = this.extractMcpProperties(externalNode.data);
                        if (Object.keys(updates).length > 0) {
                            Object.assign(existing.data, updates);
                            nodeUpdates.set(externalNode.data.id, updates);
                        }
                    } else if (externalNode.data.isAgentAdded) {
                        // New agent-added node - accept it
                        this.graphs[layer].nodes.push(externalNode);
                    }
                }
                
                // Process edge updates (agents can add edges too)
                for (const externalEdge of external.graphs[layer].edges || []) {
                    const existing = this.graphs[layer].edges.find(e => e.data.id === externalEdge.data.id);
                    if (!existing) {
                        // New edge (likely from agent) - add it
                        this.graphs[layer].edges.push(externalEdge);
                    }
                }
            }
            
            if (nodeUpdates.size > 0) {
                nodeUpdatesMap.set(layer, nodeUpdates);
            }
        }

        // Update proposed changes
        for (const layer of layers) {
            this.proposedChangesByLayer[layer].clear();
            const changes = external.proposedChanges?.[layer] || [];
            for (const change of changes) {
                this.proposedChangesByLayer[layer].set(change.nodeId, change);
            }
        }

        // Fire property update events for changed nodes
        for (const [layer, nodeUpdates] of nodeUpdatesMap) {
            if (nodeUpdates.size > 0) {
                this.onNodePropertiesChangedEmitter.fire({ layer, nodeUpdates });
            }
        }
        
        debug(`[GraphService] Merged MCP properties for ${nodeUpdatesMap.size} layer(s)`);
    }

    /**
     * Extract only MCP-owned properties from a node
     */
    private extractMcpProperties(nodeData: any): Partial<GraphNode['data']> {
        const updates: any = {};
        
        for (const key of MCP_OWNED_PROPERTIES) {
            if (key in nodeData) {
                updates[key] = nodeData[key];
            }
        }
        
        return updates;
    }

    /**
     * Apply full graph update (for updates from another extension instance)
     * This is the fallback for non-MCP sources
     */
    private applyFullGraphUpdate(sharedState: any): void {
        const layers: Layer[] = ['context', 'container', 'component', 'code'];
        
        // Deep copy to ensure proper data structure
        for (const layer of layers) {
            if (sharedState.graphs && sharedState.graphs[layer]) {
                this.graphs[layer] = JSON.parse(JSON.stringify(sharedState.graphs[layer]));
            }
        }

        // Update proposed changes
        for (const layer of layers) {
            this.proposedChangesByLayer[layer].clear();
            const changes = sharedState.proposedChanges?.[layer] || [];
            for (const change of changes) {
                this.proposedChangesByLayer[layer].set(change.nodeId, change);
            }
        }

        // Update node history
        if (sharedState.nodeHistory) {
            for (const layer of layers) {
                this.nodeHistoryByLayer[layer].clear();
                const history = sharedState.nodeHistory[layer];
                if (history) {
                    for (const [nodeId, events] of Object.entries(history)) {
                        if (Array.isArray(events)) {
                            this.nodeHistoryByLayer[layer].set(nodeId, events as NodeHistoryEvent[]);
                        }
                    }
                }
            }
        }

        // Update deleted nodes
        if (sharedState.deletedNodes) {
            for (const layer of layers) {
                this.deletedNodeIds[layer].clear();
                const deleted = sharedState.deletedNodes[layer];
                if (deleted) {
                    for (const nodeId of deleted) {
                        this.deletedNodeIds[layer].add(nodeId);
                    }
                }
            }
        }

        // Fire full graph change event
        this.batchGraphChangeEvent();
        
        debug(`[GraphService] Applied full graph update from ${sharedState.source}`);
    }

    /**
     * Sync current state to shared file (for MCP server to read)
     */
    private syncToSharedState(): void {
        try {
            // Convert proposed changes from Map to Array
            const layers: Layer[] = ['context', 'container', 'component', 'code'];
            const proposedChangesArray: any = {};
            const nodeHistoryObject: any = {};
            const deletedNodesArray: any = {};
            
            for (const layer of layers) {
                proposedChangesArray[layer] = Array.from(this.proposedChangesByLayer[layer].values());
                
                // Convert node history from Map to Record
                const historyMap = this.nodeHistoryByLayer[layer];
                nodeHistoryObject[layer] = {};
                for (const [nodeId, events] of historyMap.entries()) {
                    nodeHistoryObject[layer][nodeId] = events;
                }
                
                // Convert deleted nodes from Set to Array
                deletedNodesArray[layer] = Array.from(this.deletedNodeIds[layer]);
            }

            // Write to shared state
            this.stateSyncService.writeState({
                currentLayer: this.currentLayer,
                graphs: this.graphs,
                proposedChanges: proposedChangesArray,
                nodeHistory: nodeHistoryObject,
                deletedNodes: deletedNodesArray
            });
        } catch (error) {
            log(`[GraphService] Error syncing to shared state: ${error}`);
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
     * - graph-state.json file
     */
    public async clearAllState(): Promise<void> {
        log('[GraphService] Clearing all graph state...');
        
        // Clear in-memory graphs
        this.graphs = {
            context: { nodes: [], edges: [] },
            container: { nodes: [], edges: [] },
            component: { nodes: [], edges: [] },
            code: { nodes: [], edges: [] }
        };
        
        // Clear proposed changes, node history, and deleted nodes
        const layers: Layer[] = ['context', 'container', 'component', 'code'];
        for (const layer of layers) {
            this.proposedChangesByLayer[layer].clear();
            this.nodeHistoryByLayer[layer].clear();
            this.deletedNodeIds[layer].clear();
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

