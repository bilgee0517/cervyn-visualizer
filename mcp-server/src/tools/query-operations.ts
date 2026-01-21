/**
 * Query Operations Tools
 * 
 * Advanced search and filtering capabilities for efficient graph queries.
 * - Filter by node/edge types, properties, features
 * - Pattern matching on labels
 * - Pagination for large result sets
 * - Summary statistics without full data transfer
 */

import { GraphStateManager, GraphNode, GraphEdge } from '../graph-state-manager.js';
import { getLayerGuidance } from '../config/layer-guidance.js';

export interface QueryFilter {
    // Node type filtering
    nodeTypes?: string[];
    
    // Label filtering
    labelPattern?: string;  // Regex pattern
    labelPrefix?: string;   // Faster prefix search
    
    // Feature filtering
    supportsFeatures?: string[];  // Nodes supporting ANY of these features
    supportedBy?: string[];       // Workflow nodes supported by these nodes
    
    // Property filtering
    technology?: string;
    progressStatus?: 'done' | 'in-progress' | 'not-started' | 'error';
    isAgentAdded?: boolean;
    
    // Edge type filtering (for edges only)
    edgeTypes?: string[];
    
    // Node ID filtering
    nodeIds?: string[];  // Explicit list of node IDs
    
    // Pagination
    limit?: number;
    offset?: number;
}

export interface QueryResult {
    success: boolean;
    layer: string;
    totalMatches: number;
    returnedCount: number;
    hasMore: boolean;
    nodes: GraphNode[];
    edges?: GraphEdge[];
    executionTimeMs: number;
    filter?: QueryFilter;
}

/**
 * Query nodes with advanced filtering
 */
export async function queryNodes(
    graphState: GraphStateManager,
    args: any
): Promise<QueryResult> {
    const startTime = Date.now();
    const { layer, filter = {}, includeEdges = false } = args;
    
    const targetLayer = layer || graphState.getCurrentLayer();
    const layerIndexes = graphState.getIndexes(targetLayer);
    
    let matchedNodes: GraphNode[] = [];
    
    // Apply filters using indexes for efficiency
    if (filter.nodeIds && filter.nodeIds.length > 0) {
        // Explicit node ID list - O(k) where k = nodeIds.length
        matchedNodes = filter.nodeIds
            .map((id: string) => layerIndexes.getNodeById(id))
            .filter((node: GraphNode | undefined): node is GraphNode => node !== undefined);
            
    } else if (filter.nodeTypes && filter.nodeTypes.length > 0) {
        // Filter by type - use type index for O(1) lookup per type
        const nodesByType = new Set<GraphNode>();
        for (const type of filter.nodeTypes) {
            const nodesOfType = layerIndexes.getNodesByType(type);
            for (const node of nodesOfType) {
                nodesByType.add(node);
            }
        }
        matchedNodes = Array.from(nodesByType);
        
    } else if (filter.supportsFeatures && filter.supportsFeatures.length > 0) {
        // Filter by features - use feature index for O(1) lookup per feature
        const nodesByFeature = new Set<GraphNode>();
        for (const featureId of filter.supportsFeatures) {
            const nodesForFeature = layerIndexes.getNodesByFeature(featureId);
            for (const node of nodesForFeature) {
                nodesByFeature.add(node);
            }
        }
        matchedNodes = Array.from(nodesByFeature);
        
    } else if (filter.labelPrefix) {
        // Prefix search - use prefix index
        matchedNodes = layerIndexes.findNodesByLabelPrefix(filter.labelPrefix);
        
    } else {
        // No index-friendly filter - get all nodes
        matchedNodes = layerIndexes.getAllNodes();
    }
    
    // Apply additional filters (post-index filtering)
    if (filter.labelPattern) {
        const regex = new RegExp(filter.labelPattern, 'i');
        matchedNodes = matchedNodes.filter(node => regex.test(node.data.label));
    }
    
    if (filter.technology) {
        matchedNodes = matchedNodes.filter(node => 
            node.data.technology?.toLowerCase().includes(filter.technology.toLowerCase())
        );
    }
    
    if (filter.progressStatus) {
        matchedNodes = matchedNodes.filter(node => 
            node.data.progressStatus === filter.progressStatus
        );
    }
    
    if (filter.isAgentAdded !== undefined) {
        matchedNodes = matchedNodes.filter(node => 
            node.data.isAgentAdded === filter.isAgentAdded
        );
    }
    
    if (filter.supportedBy && filter.supportedBy.length > 0) {
        matchedNodes = matchedNodes.filter(node => {
            if (!node.data.supportedBy) return false;
            return filter.supportedBy.some((id: string) => 
                node.data.supportedBy!.includes(id)
            );
        });
    }
    
    const totalMatches = matchedNodes.length;
    
    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || 100;  // Default limit
    const hasMore = totalMatches > (offset + limit);
    
    matchedNodes = matchedNodes.slice(offset, offset + limit);
    
    // Include edges if requested
    let matchedEdges: GraphEdge[] | undefined;
    if (includeEdges) {
        const nodeIds = new Set(matchedNodes.map(n => n.data.id));
        const allEdges = layerIndexes.getAllEdges();
        
        matchedEdges = allEdges.filter(edge => 
            nodeIds.has(edge.data.source) && nodeIds.has(edge.data.target)
        );
        
        // Apply edge type filter if specified
        if (filter.edgeTypes && filter.edgeTypes.length > 0) {
            matchedEdges = matchedEdges.filter(edge => 
                edge.data.edgeType && filter.edgeTypes.includes(edge.data.edgeType)
            );
        }
    }
    
    const executionTimeMs = Date.now() - startTime;
    
    console.error(`[QueryNodes] Layer: ${targetLayer}, Matched: ${totalMatches}, Returned: ${matchedNodes.length}, Time: ${executionTimeMs}ms`);
    
    return {
        success: true,
        layer: targetLayer,
        totalMatches,
        returnedCount: matchedNodes.length,
        hasMore,
        nodes: matchedNodes,
        edges: matchedEdges,
        executionTimeMs,
        filter
    };
}

/**
 * Get graph with filtering and pagination (enhanced getGraph)
 */
export async function getGraphFiltered(
    graphState: GraphStateManager,
    args: any
): Promise<any> {
    const startTime = Date.now();
    const { layer, filter, summaryOnly = false, includeEdges = true } = args;
    
    const targetLayer = layer || graphState.getCurrentLayer();
    const guidance = getLayerGuidance(targetLayer);
    const layerIndexes = graphState.getIndexes(targetLayer);
    
    // Summary-only mode - return statistics without full data
    if (summaryOnly) {
        const stats = layerIndexes.getStats();
        
        // Count nodes by type
        const nodeTypeStats: Record<string, number> = {};
        const allNodes = layerIndexes.getAllNodes();
        for (const node of allNodes) {
            const type = (node.data.type as string) || 'unknown';
            nodeTypeStats[type] = (nodeTypeStats[type] || 0) + 1;
        }
        
        // Count edges by type
        const edgeTypeStats: Record<string, number> = {};
        const allEdges = layerIndexes.getAllEdges();
        for (const edge of allEdges) {
            const type = edge.data.edgeType || 'unknown';
            edgeTypeStats[type] = (edgeTypeStats[type] || 0) + 1;
        }
        
        return {
            success: true,
            layer: targetLayer,
            summaryOnly: true,
            statistics: {
                nodeCount: stats.nodeCount,
                edgeCount: stats.edgeCount,
                nodeTypeCount: stats.typeCount,
                edgeTypeCount: stats.edgeTypeCount,
                featureCount: stats.featureCount,
                nodesByType: nodeTypeStats,
                edgesByType: edgeTypeStats
            },
            layerInfo: {
                name: guidance.name,
                purpose: guidance.purpose,
                recommendedNodeTypes: guidance.recommendedNodeTypes,
                recommendedEdgeTypes: guidance.recommendedEdgeTypes
            },
            executionTimeMs: Date.now() - startTime
        };
    }
    
    // Query nodes with filters
    if (filter) {
        const queryResult = await queryNodes(graphState, { layer: targetLayer, filter, includeEdges });
        
        return {
            ...queryResult,
            layerInfo: {
                name: guidance.name,
                purpose: guidance.purpose,
                recommendedNodeTypes: guidance.recommendedNodeTypes,
                recommendedEdgeTypes: guidance.recommendedEdgeTypes
            },
            agentOnlyMode: graphState.getAgentOnlyMode()
        };
    }
    
    // No filter - return full graph (backward compatible)
    const graphData = graphState.getGraph(targetLayer);
    
    return {
        success: true,
        layer: targetLayer,
        layerInfo: {
            name: guidance.name,
            purpose: guidance.purpose,
            recommendedNodeTypes: guidance.recommendedNodeTypes,
            recommendedEdgeTypes: guidance.recommendedEdgeTypes,
            examples: guidance.examples,
            useCases: guidance.useCases,
            warnings: guidance.warnings
        },
        agentOnlyMode: graphState.getAgentOnlyMode(),
        nodeCount: graphData.nodes.length,
        edgeCount: graphData.edges.length,
        nodes: graphData.nodes,
        edges: graphData.edges,
        executionTimeMs: Date.now() - startTime
    };
}

/**
 * Query edges with filtering
 */
export async function queryEdges(
    graphState: GraphStateManager,
    args: any
): Promise<QueryResult> {
    const startTime = Date.now();
    const { layer, filter = {} } = args;
    
    const targetLayer = layer || graphState.getCurrentLayer();
    const layerIndexes = graphState.getIndexes(targetLayer);
    
    let matchedEdges: GraphEdge[] = [];
    
    // Apply filters using indexes
    if (filter.edgeTypes && filter.edgeTypes.length > 0) {
        // Filter by type - use type index for O(1) lookup per type
        const edgesByType = new Set<GraphEdge>();
        for (const type of filter.edgeTypes) {
            const edgesOfType = layerIndexes.getEdgesByType(type);
            for (const edge of edgesOfType) {
                edgesByType.add(edge);
            }
        }
        matchedEdges = Array.from(edgesByType);
    } else {
        // No type filter - get all edges
        matchedEdges = layerIndexes.getAllEdges();
    }
    
    // Filter by source/target nodes if specified
    if (filter.sourceIds && filter.sourceIds.length > 0) {
        const sourceIdSet = new Set(filter.sourceIds);
        matchedEdges = matchedEdges.filter(edge => sourceIdSet.has(edge.data.source));
    }
    
    if (filter.targetIds && filter.targetIds.length > 0) {
        const targetIdSet = new Set(filter.targetIds);
        matchedEdges = matchedEdges.filter(edge => targetIdSet.has(edge.data.target));
    }
    
    // Filter by label pattern if specified
    if (filter.labelPattern) {
        const regex = new RegExp(filter.labelPattern, 'i');
        matchedEdges = matchedEdges.filter(edge => 
            edge.data.label && regex.test(edge.data.label)
        );
    }
    
    const totalMatches = matchedEdges.length;
    
    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || 100;
    const hasMore = totalMatches > (offset + limit);
    
    matchedEdges = matchedEdges.slice(offset, offset + limit);
    
    const executionTimeMs = Date.now() - startTime;
    
    console.error(`[QueryEdges] Layer: ${targetLayer}, Matched: ${totalMatches}, Returned: ${matchedEdges.length}, Time: ${executionTimeMs}ms`);
    
    return {
        success: true,
        layer: targetLayer,
        totalMatches,
        returnedCount: matchedEdges.length,
        hasMore,
        nodes: [],
        edges: matchedEdges,
        executionTimeMs,
        filter
    };
}
