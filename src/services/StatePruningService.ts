/**
 * State Pruning Service
 * 
 * Manages data growth by pruning old history entries and limiting deleted nodes arrays.
 * Prevents the shared state file from growing indefinitely.
 */

import { SharedGraphState, SCHEMA_VERSION } from '../config/shared-state-config';
import { Layer } from '../types';
import { log, debug } from '../logger';
import { generateCorrelationId } from '../utils/error-handler';

export interface PruningConfig {
    /** Maximum number of history events to keep per node */
    maxHistoryPerNode: number;
    /** Maximum number of deleted node IDs to keep per layer */
    maxDeletedNodesPerLayer: number;
    /** Age threshold for history events (milliseconds) - events older than this are removed */
    historyAgeThreshold?: number;
    /** Age threshold for deleted nodes (milliseconds) - IDs older than this are removed */
    deletedNodesAgeThreshold?: number;
}

export class StatePruningService {
    private readonly config: PruningConfig;
    
    constructor(config?: Partial<PruningConfig>) {
        this.config = {
            maxHistoryPerNode: 50, // Keep last 50 events per node
            maxDeletedNodesPerLayer: 100, // Keep last 100 deleted node IDs per layer
            historyAgeThreshold: 30 * 24 * 60 * 60 * 1000, // 30 days
            deletedNodesAgeThreshold: 7 * 24 * 60 * 60 * 1000, // 7 days
            ...config
        };
        
        log(`[StatePruningService] Initialized with config:`, () => ({
            maxHistoryPerNode: this.config.maxHistoryPerNode,
            maxDeletedNodesPerLayer: this.config.maxDeletedNodesPerLayer,
            historyAgeThresholdDays: this.config.historyAgeThreshold ? this.config.historyAgeThreshold / (24 * 60 * 60 * 1000) : undefined,
            deletedNodesAgeThresholdDays: this.config.deletedNodesAgeThreshold ? this.config.deletedNodesAgeThreshold / (24 * 60 * 60 * 1000) : undefined
        }));
    }
    
    /**
     * Prune old data from shared state
     * Returns the pruned state and statistics about what was pruned
     */
    public pruneState(state: SharedGraphState): {
        prunedState: SharedGraphState;
        stats: PruningStats;
    } {
        const correlationId = generateCorrelationId();
        const startTime = Date.now();
        
        log(`[StatePruningService] Starting state pruning...`, () => ({ correlationId }));
        
        const stats: PruningStats = {
            historyEventsPruned: 0,
            deletedNodesPruned: 0,
            layerStats: {
                context: { historyEventsPruned: 0, deletedNodesPruned: 0 },
                container: { historyEventsPruned: 0, deletedNodesPruned: 0 },
                component: { historyEventsPruned: 0, deletedNodesPruned: 0 },
                code: { historyEventsPruned: 0, deletedNodesPruned: 0 }
            }
        };
        
        const prunedState: SharedGraphState = {
            ...state,
            nodeHistory: this.pruneNodeHistory(state.nodeHistory, stats, correlationId),
            deletedNodes: this.pruneDeletedNodes(state.deletedNodes, stats, correlationId)
        };
        
        const duration = Date.now() - startTime;
        
        log(`[StatePruningService] ✓ Pruning complete in ${duration}ms`, () => ({
            correlationId,
            duration,
            historyEventsPruned: stats.historyEventsPruned,
            deletedNodesPruned: stats.deletedNodesPruned
        }));
        
        return { prunedState, stats };
    }
    
    /**
     * Prune node history entries
     */
    private pruneNodeHistory(
        nodeHistory: SharedGraphState['nodeHistory'],
        stats: PruningStats,
        correlationId: string
    ): SharedGraphState['nodeHistory'] {
        if (!nodeHistory) {
            return {
                context: {},
                container: {},
                component: {},
                code: {}
            };
        }
        
        const layers: Layer[] = ['context', 'container', 'component', 'code'];
        const prunedHistory: any = {};
        const now = Date.now();
        
        for (const layer of layers) {
            prunedHistory[layer] = {};
            const layerHistory = nodeHistory[layer] || {};
            let prunedInLayer = 0;
            
            for (const [nodeId, events] of Object.entries(layerHistory)) {
                if (!Array.isArray(events) || events.length === 0) {
                    continue;
                }
                
                // Filter by age if threshold is set
                let filteredEvents = events;
                if (this.config.historyAgeThreshold) {
                    filteredEvents = events.filter(event => {
                        const age = now - event.timestamp;
                        return age <= this.config.historyAgeThreshold!;
                    });
                    
                    const removedByAge = events.length - filteredEvents.length;
                    if (removedByAge > 0) {
                        prunedInLayer += removedByAge;
                    }
                }
                
                // Keep only the most recent N events
                if (filteredEvents.length > this.config.maxHistoryPerNode) {
                    // Sort by timestamp descending and take the most recent
                    const sorted = [...filteredEvents].sort((a, b) => b.timestamp - a.timestamp);
                    const kept = sorted.slice(0, this.config.maxHistoryPerNode);
                    const removed = filteredEvents.length - kept.length;
                    
                    prunedHistory[layer][nodeId] = kept;
                    prunedInLayer += removed;
                } else {
                    prunedHistory[layer][nodeId] = filteredEvents;
                }
            }
            
            stats.historyEventsPruned += prunedInLayer;
            
            if (!stats.layerStats[layer]) {
                stats.layerStats[layer] = { historyEventsPruned: 0, deletedNodesPruned: 0 };
            }
            stats.layerStats[layer].historyEventsPruned = prunedInLayer;
            
            if (prunedInLayer > 0) {
                debug(`[StatePruningService] Pruned ${prunedInLayer} history events from ${layer} layer`, () => ({ correlationId }));
            }
        }
        
        return prunedHistory;
    }
    
    /**
     * Prune deleted nodes arrays
     */
    private pruneDeletedNodes(
        deletedNodes: SharedGraphState['deletedNodes'],
        stats: PruningStats,
        correlationId: string
    ): SharedGraphState['deletedNodes'] {
        if (!deletedNodes) {
            return {
                context: [],
                container: [],
                component: [],
                code: []
            };
        }
        
        const layers: Layer[] = ['context', 'container', 'component', 'code'];
        const prunedDeleted: any = {};
        
        for (const layer of layers) {
            const layerDeleted = deletedNodes[layer] || [];
            let prunedInLayer = 0;
            
            if (layerDeleted.length > this.config.maxDeletedNodesPerLayer) {
                // Keep only the most recent N
                // Since we don't have timestamps on deleted node IDs, we just keep the last N in the array
                prunedDeleted[layer] = layerDeleted.slice(-this.config.maxDeletedNodesPerLayer);
                prunedInLayer = layerDeleted.length - prunedDeleted[layer].length;
            } else {
                prunedDeleted[layer] = layerDeleted;
            }
            
            stats.deletedNodesPruned += prunedInLayer;
            
            if (!stats.layerStats[layer]) {
                stats.layerStats[layer] = { historyEventsPruned: 0, deletedNodesPruned: 0 };
            }
            stats.layerStats[layer].deletedNodesPruned = prunedInLayer;
            
            if (prunedInLayer > 0) {
                debug(`[StatePruningService] Pruned ${prunedInLayer} deleted node IDs from ${layer} layer`, () => ({ correlationId }));
            }
        }
        
        return prunedDeleted;
    }
    
    /**
     * Get current data size statistics for a state
     */
    public getStateStats(state: SharedGraphState): StateStats {
        const layers: Layer[] = ['context', 'container', 'component', 'code'];
        const stats: StateStats = {
            totalNodes: 0,
            totalEdges: 0,
            totalHistoryEvents: 0,
            totalDeletedNodes: 0,
            layerBreakdown: {
                context: { nodes: 0, edges: 0, historyEvents: 0, deletedNodes: 0 },
                container: { nodes: 0, edges: 0, historyEvents: 0, deletedNodes: 0 },
                component: { nodes: 0, edges: 0, historyEvents: 0, deletedNodes: 0 },
                code: { nodes: 0, edges: 0, historyEvents: 0, deletedNodes: 0 }
            }
        };
        
        for (const layer of layers) {
            const layerGraph = state.graphs?.[layer];
            const nodes = layerGraph?.nodes?.length || 0;
            const edges = layerGraph?.edges?.length || 0;
            
            // Count history events
            const layerHistory = state.nodeHistory?.[layer] || {};
            let historyEvents = 0;
            for (const events of Object.values(layerHistory)) {
                if (Array.isArray(events)) {
                    historyEvents += events.length;
                }
            }
            
            // Count deleted nodes
            const deletedNodes = state.deletedNodes?.[layer]?.length || 0;
            
            stats.layerBreakdown[layer] = {
                nodes,
                edges,
                historyEvents,
                deletedNodes
            };
            
            stats.totalNodes += nodes;
            stats.totalEdges += edges;
            stats.totalHistoryEvents += historyEvents;
            stats.totalDeletedNodes += deletedNodes;
        }
        
        return stats;
    }
    
    /**
     * Check if state needs pruning based on thresholds
     */
    public needsPruning(state: SharedGraphState): boolean {
        const stats = this.getStateStats(state);
        
        // Need pruning if:
        // - Total history events exceed threshold
        // - Total deleted nodes exceed threshold
        // - Any layer has excessive data
        
        const historyThreshold = this.config.maxHistoryPerNode * 10; // 10 nodes worth
        const deletedThreshold = this.config.maxDeletedNodesPerLayer;
        
        if (stats.totalHistoryEvents > historyThreshold) {
            return true;
        }
        
        if (stats.totalDeletedNodes > deletedThreshold) {
            return true;
        }
        
        // Check individual layers
        for (const layer of Object.keys(stats.layerBreakdown) as Layer[]) {
            const layerStats = stats.layerBreakdown[layer];
            
            if (layerStats.historyEvents > this.config.maxHistoryPerNode * 5) {
                return true;
            }
            
            if (layerStats.deletedNodes > this.config.maxDeletedNodesPerLayer) {
                return true;
            }
        }
        
        return false;
    }
}

export interface PruningStats {
    historyEventsPruned: number;
    deletedNodesPruned: number;
    layerStats: Record<Layer, {
        historyEventsPruned: number;
        deletedNodesPruned: number;
    }>;
}

export interface StateStats {
    totalNodes: number;
    totalEdges: number;
    totalHistoryEvents: number;
    totalDeletedNodes: number;
    layerBreakdown: Record<Layer, {
        nodes: number;
        edges: number;
        historyEvents: number;
        deletedNodes: number;
    }>;
}

// Singleton instance with default config
export const statePruningService = new StatePruningService();
