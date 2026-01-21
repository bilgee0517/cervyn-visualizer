/**
 * Conflict Resolution Service
 * 
 * Implements three-way merge strategy with property ownership awareness
 * for resolving conflicts between Extension and MCP server state updates.
 * 
 * Strategy:
 * - Extension owns structural properties (derived from code analysis)
 * - MCP server owns enrichment properties (AI annotations)
 * - Shared properties use last-write-wins with timestamp checking
 */

import { GraphNode, GraphEdge, GraphData, Layer } from '../types';
import { 
    SharedGraphState,
    EXTENSION_OWNED_PROPERTIES,
    MCP_OWNED_PROPERTIES,
    SHARED_PROPERTIES,
    getPropertyOwner
} from '../config/shared-state-config';
import { log, debug } from '../logger';
import { generateCorrelationId } from '../utils/error-handler';

export interface MergeResult {
    mergedState: SharedGraphState;
    conflicts: ConflictInfo[];
    stats: MergeStats;
}

export interface ConflictInfo {
    layer: Layer;
    nodeId: string;
    property: string;
    baseValue: any;
    localValue: any;
    remoteValue: any;
    resolution: 'local' | 'remote' | 'base' | 'merged';
    reason: string;
}

export interface MergeStats {
    nodesProcessed: number;
    edgesProcessed: number;
    conflictsDetected: number;
    conflictsResolved: number;
    propertiesUpdated: number;
}

/**
 * Conflict Resolution Service using three-way merge strategy
 */
export class ConflictResolutionService {
    
    constructor() {
        log('[ConflictResolutionService] Initialized with property ownership awareness');
    }
    
    /**
     * Perform three-way merge of graph states
     * @param base Common ancestor state (last synced state)
     * @param local Current extension state
     * @param remote Current MCP server state
     * @returns Merged state with conflict information
     */
    public mergeStates(
        base: SharedGraphState | null,
        local: SharedGraphState,
        remote: SharedGraphState
    ): MergeResult {
        const correlationId = generateCorrelationId();
        const startTime = Date.now();
        
        log(`[ConflictResolutionService] Starting three-way merge...`, () => ({ correlationId }));
        
        const conflicts: ConflictInfo[] = [];
        const stats: MergeStats = {
            nodesProcessed: 0,
            edgesProcessed: 0,
            conflictsDetected: 0,
            conflictsResolved: 0,
            propertiesUpdated: 0
        };
        
        // Start with local state as base
        const mergedState: SharedGraphState = {
            ...local,
            version: Math.max(local.version, remote.version) + 1,
            timestamp: Date.now(),
            source: 'vscode-extension'
        };
        
        // Merge each layer's graphs
        const layers: Layer[] = ['workflow', 'context', 'container', 'component', 'code'];
        for (const layer of layers) {
            const mergedGraph = this.mergeGraphs(
                base?.graphs?.[layer],
                local.graphs[layer],
                remote.graphs[layer],
                layer,
                conflicts,
                stats,
                correlationId
            );
            mergedState.graphs[layer] = mergedGraph;
        }
        
        // Merge proposed changes (MCP-owned, so prefer remote)
        mergedState.proposedChanges = remote.proposedChanges || local.proposedChanges;
        
        // Preserve extension-managed fields from local
        mergedState.nodeHistory = local.nodeHistory;
        mergedState.deletedNodes = local.deletedNodes;
        
        // Merge layer and mode (last-write-wins based on timestamp)
        if (remote.timestamp > local.timestamp) {
            mergedState.currentLayer = remote.currentLayer;
            mergedState.agentOnlyMode = remote.agentOnlyMode;
        }
        
        const duration = Date.now() - startTime;
        
        log(`[ConflictResolutionService] ✓ Merge complete in ${duration}ms`, () => ({
            correlationId,
            duration,
            nodesProcessed: stats.nodesProcessed,
            conflicts: stats.conflictsDetected,
            resolved: stats.conflictsResolved
        }));
        
        return {
            mergedState,
            conflicts,
            stats
        };
    }
    
    /**
     * Merge two graphs for a specific layer
     */
    private mergeGraphs(
        base: GraphData | undefined,
        local: GraphData,
        remote: GraphData,
        layer: Layer,
        conflicts: ConflictInfo[],
        stats: MergeStats,
        correlationId: string
    ): GraphData {
        // Create maps for efficient lookups
        const baseNodes = new Map(base?.nodes?.map(n => [n.data.id, n]) || []);
        const localNodes = new Map(local.nodes.map(n => [n.data.id, n]));
        const remoteNodes = new Map(remote.nodes.map(n => [n.data.id, n]));
        
        const mergedNodes: GraphNode[] = [];
        const processedIds = new Set<string>();
        
        // Process all unique node IDs
        const allNodeIds = new Set([
            ...localNodes.keys(),
            ...remoteNodes.keys()
        ]);
        
        for (const nodeId of allNodeIds) {
            const baseNode = baseNodes.get(nodeId);
            const localNode = localNodes.get(nodeId);
            const remoteNode = remoteNodes.get(nodeId);
            
            const mergedNode = this.mergeNode(
                baseNode,
                localNode,
                remoteNode,
                layer,
                conflicts,
                stats,
                correlationId
            );
            
            if (mergedNode) {
                mergedNodes.push(mergedNode);
                processedIds.add(nodeId);
            }
            
            stats.nodesProcessed++;
        }
        
        // Merge edges (simpler - just combine and deduplicate by ID)
        const mergedEdges = this.mergeEdges(local.edges, remote.edges, stats);
        
        debug(`[ConflictResolutionService] Merged ${layer} layer: ${mergedNodes.length} nodes, ${mergedEdges.length} edges`, () => ({ correlationId }));
        
        return {
            nodes: mergedNodes,
            edges: mergedEdges
        };
    }
    
    /**
     * Merge a single node using property ownership rules
     */
    private mergeNode(
        base: GraphNode | undefined,
        local: GraphNode | undefined,
        remote: GraphNode | undefined,
        layer: Layer,
        conflicts: ConflictInfo[],
        stats: MergeStats,
        correlationId: string
    ): GraphNode | null {
        // Case 1: Node only in local (extension added it)
        if (local && !remote) {
            return local;
        }
        
        // Case 2: Node only in remote (MCP added it - likely agent-added)
        if (remote && !local) {
            return remote;
        }
        
        // Case 3: Node in both - merge properties
        if (local && remote) {
            const mergedNode: GraphNode = {
                data: { ...local.data } as any
            };
            
            // Merge properties based on ownership
            for (const key of Object.keys(remote.data)) {
                const owner = getPropertyOwner(key);
                const baseValue = base?.data?.[key as keyof typeof base.data];
                const localValue = (local.data as any)[key];
                const remoteValue = (remote.data as any)[key];
                
                // Skip if values are identical
                if (JSON.stringify(localValue) === JSON.stringify(remoteValue)) {
                    continue;
                }
                
                switch (owner) {
                    case 'extension':
                        // Extension owns this property - keep local value
                        (mergedNode.data as any)[key] = localValue;
                        break;
                        
                    case 'mcp':
                        // MCP owns this property - use remote value
                        if (remoteValue !== undefined) {
                            (mergedNode.data as any)[key] = remoteValue;
                            stats.propertiesUpdated++;
                        }
                        break;
                        
                    case 'shared':
                        // Shared property - use last-write-wins
                        // Since we don't have per-property timestamps, prefer remote (MCP) for shared props
                        if (remoteValue !== undefined) {
                            (mergedNode.data as any)[key] = remoteValue;
                            stats.propertiesUpdated++;
                        }
                        break;
                        
                    case 'unknown':
                        // Unknown property - create conflict and use remote
                        if (localValue !== remoteValue) {
                            conflicts.push({
                                layer,
                                nodeId: local.data.id,
                                property: key,
                                baseValue,
                                localValue,
                                remoteValue,
                                resolution: 'remote',
                                reason: 'Unknown property ownership, defaulting to remote'
                            });
                            stats.conflictsDetected++;
                            stats.conflictsResolved++;
                        }
                        
                        if (remoteValue !== undefined) {
                            (mergedNode.data as any)[key] = remoteValue;
                        }
                        break;
                }
            }
            
            return mergedNode;
        }
        
        // Case 4: Node in neither (shouldn't happen, but handle gracefully)
        return null;
    }
    
    /**
     * Merge edges from local and remote
     */
    private mergeEdges(
        localEdges: GraphEdge[],
        remoteEdges: GraphEdge[],
        stats: MergeStats
    ): GraphEdge[] {
        const edgeMap = new Map<string, GraphEdge>();
        
        // Add all local edges
        for (const edge of localEdges) {
            edgeMap.set(edge.data.id, edge);
            stats.edgesProcessed++;
        }
        
        // Add/update with remote edges
        for (const edge of remoteEdges) {
            const existing = edgeMap.get(edge.data.id);
            
            if (!existing) {
                // New edge from remote
                edgeMap.set(edge.data.id, edge);
                stats.edgesProcessed++;
            } else {
                // Merge edge data (prefer remote for edge metadata)
                edgeMap.set(edge.data.id, {
                    data: {
                        ...existing.data,
                        ...edge.data
                    }
                });
            }
        }
        
        return Array.from(edgeMap.values());
    }
    
    /**
     * Detect if two states have conflicts that need resolution
     */
    public hasConflicts(
        local: SharedGraphState,
        remote: SharedGraphState
    ): boolean {
        // Quick check - if sources are different and versions diverge, there might be conflicts
        if (local.source !== remote.source && local.version !== remote.version) {
            return true;
        }
        
        // Check if timestamps are far apart (> 5 seconds)
        const timeDiff = Math.abs(local.timestamp - remote.timestamp);
        if (timeDiff > 5000) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Create a snapshot of current state for use as merge base
     */
    public createMergeBase(state: SharedGraphState): SharedGraphState {
        // Deep clone the state to use as merge base
        return JSON.parse(JSON.stringify(state));
    }
}

// Singleton instance
export const conflictResolutionService = new ConflictResolutionService();
