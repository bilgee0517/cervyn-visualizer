/**
 * Graph Traversal Operations
 * 
 * Efficient graph traversal algorithms using adjacency lists.
 * - Find neighbors (direct connections)
 * - Find paths between nodes
 * - Extract subgraphs (connected components)
 * - BFS/DFS traversal
 */

import { GraphStateManager, GraphNode, GraphEdge } from '../graph-state-manager.js';

export interface TraversalFilter {
    edgeTypes?: string[];  // Only traverse these edge types
    maxDepth?: number;     // Maximum traversal depth
    nodeTypes?: string[];  // Only include these node types
}

export interface TraversalResult {
    success: boolean;
    operation: string;
    startNodeId?: string;
    endNodeId?: string;
    layer: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    metadata: {
        nodeCount: number;
        edgeCount: number;
        depth?: number;
        pathLength?: number;
    };
    executionTimeMs: number;
}

/**
 * Main traversal function - routes to specific traversal operations
 */
export async function traverseGraph(
    graphState: GraphStateManager,
    args: any
): Promise<TraversalResult> {
    const { operation, startNodeId, endNodeId, layer, direction = 'both', depth = 1, filter = {} } = args;
    
    if (!operation) {
        throw new Error('operation is required (neighbors, path, subgraph, bfs, dfs)');
    }
    
    const targetLayer = layer || graphState.getCurrentLayer();
    
    switch (operation) {
        case 'neighbors':
            return await findNeighbors(graphState, { startNodeId, layer: targetLayer, direction, depth, filter });
        
        case 'path':
            if (!endNodeId) {
                throw new Error('endNodeId is required for path operation');
            }
            return await findPath(graphState, { startNodeId, endNodeId, layer: targetLayer, filter });
        
        case 'subgraph':
            return await extractSubgraph(graphState, { startNodeId, layer: targetLayer, depth, filter });
        
        case 'bfs':
            return await breadthFirstSearch(graphState, { startNodeId, layer: targetLayer, depth, filter });
        
        case 'dfs':
            return await depthFirstSearch(graphState, { startNodeId, layer: targetLayer, depth, filter });
        
        default:
            throw new Error(`Unknown traversal operation: ${operation}. Valid operations: neighbors, path, subgraph, bfs, dfs`);
    }
}

/**
 * Find neighbors of a node (direct connections)
 */
export async function findNeighbors(
    graphState: GraphStateManager,
    args: any
): Promise<TraversalResult> {
    const startTime = Date.now();
    const { startNodeId, layer, direction = 'both', depth = 1, filter = {} } = args;
    
    if (!startNodeId) {
        throw new Error('startNodeId is required');
    }
    
    const targetLayer = layer || graphState.getCurrentLayer();
    const layerIndexes = graphState.getIndexes(targetLayer);
    
    // Check if start node exists
    const startNode = layerIndexes.getNodeById(startNodeId);
    if (!startNode) {
        throw new Error(`Start node '${startNodeId}' not found in layer '${targetLayer}'`);
    }
    
    const visitedNodes = new Set<string>([startNodeId]);
    const visitedEdges = new Set<string>();
    const resultNodes: GraphNode[] = [startNode];
    const resultEdges: GraphEdge[] = [];
    
    // BFS to specified depth
    let currentLevel = [startNodeId];
    let currentDepth = 0;
    
    while (currentLevel.length > 0 && currentDepth < depth) {
        const nextLevel: string[] = [];
        
        for (const nodeId of currentLevel) {
            const adjacency = layerIndexes.getAdjacency(nodeId);
            if (!adjacency) continue;
            
            // Collect edge IDs based on direction
            let edgeIds: string[] = [];
            if (direction === 'outgoing' || direction === 'both') {
                edgeIds = edgeIds.concat(adjacency.outgoing);
            }
            if (direction === 'incoming' || direction === 'both') {
                edgeIds = edgeIds.concat(adjacency.incoming);
            }
            
            // Process edges
            for (const edgeId of edgeIds) {
                if (visitedEdges.has(edgeId)) continue;
                
                const edge = layerIndexes.getEdgeById(edgeId);
                if (!edge) continue;
                
                // Apply edge type filter
                if (filter.edgeTypes && filter.edgeTypes.length > 0) {
                    if (!edge.data.edgeType || !filter.edgeTypes.includes(edge.data.edgeType)) {
                        continue;
                    }
                }
                
                // Determine neighbor node ID
                const neighborId = edge.data.source === nodeId ? edge.data.target : edge.data.source;
                
                // Get neighbor node
                const neighborNode = layerIndexes.getNodeById(neighborId);
                if (!neighborNode) continue;
                
                // Apply node type filter
                if (filter.nodeTypes && filter.nodeTypes.length > 0) {
                    if (!neighborNode.data.type || !filter.nodeTypes.includes(neighborNode.data.type)) {
                        continue;
                    }
                }
                
                // Add to results
                visitedEdges.add(edgeId);
                resultEdges.push(edge);
                
                if (!visitedNodes.has(neighborId)) {
                    visitedNodes.add(neighborId);
                    resultNodes.push(neighborNode);
                    nextLevel.push(neighborId);
                }
            }
        }
        
        currentLevel = nextLevel;
        currentDepth++;
    }
    
    const executionTimeMs = Date.now() - startTime;
    
    console.error(`[Traversal] Neighbors: Found ${resultNodes.length - 1} neighbors at depth ${depth} in ${executionTimeMs}ms`);
    
    return {
        success: true,
        operation: 'neighbors',
        startNodeId,
        layer: targetLayer,
        nodes: resultNodes,
        edges: resultEdges,
        metadata: {
            nodeCount: resultNodes.length,
            edgeCount: resultEdges.length,
            depth: currentDepth
        },
        executionTimeMs
    };
}

/**
 * Find shortest path between two nodes using BFS
 */
export async function findPath(
    graphState: GraphStateManager,
    args: any
): Promise<TraversalResult> {
    const startTime = Date.now();
    const { startNodeId, endNodeId, layer, filter = {} } = args;
    
    if (!startNodeId || !endNodeId) {
        throw new Error('Both startNodeId and endNodeId are required');
    }
    
    const targetLayer = layer || graphState.getCurrentLayer();
    const layerIndexes = graphState.getIndexes(targetLayer);
    
    // Check if nodes exist
    const startNode = layerIndexes.getNodeById(startNodeId);
    const endNode = layerIndexes.getNodeById(endNodeId);
    
    if (!startNode) {
        throw new Error(`Start node '${startNodeId}' not found in layer '${targetLayer}'`);
    }
    if (!endNode) {
        throw new Error(`End node '${endNodeId}' not found in layer '${targetLayer}'`);
    }
    
    // BFS to find shortest path
    const queue: Array<{ nodeId: string; path: string[]; edgePath: string[] }> = [
        { nodeId: startNodeId, path: [startNodeId], edgePath: [] }
    ];
    const visited = new Set<string>([startNodeId]);
    
    while (queue.length > 0) {
        const current = queue.shift()!;
        
        if (current.nodeId === endNodeId) {
            // Found path - reconstruct nodes and edges
            const pathNodes = current.path
                .map(id => layerIndexes.getNodeById(id))
                .filter((node): node is GraphNode => node !== undefined);
            
            const pathEdges = current.edgePath
                .map(id => layerIndexes.getEdgeById(id))
                .filter((edge): edge is GraphEdge => edge !== undefined);
            
            const executionTimeMs = Date.now() - startTime;
            
            console.error(`[Traversal] Path: Found path of length ${current.path.length - 1} in ${executionTimeMs}ms`);
            
            return {
                success: true,
                operation: 'path',
                startNodeId,
                endNodeId,
                layer: targetLayer,
                nodes: pathNodes,
                edges: pathEdges,
                metadata: {
                    nodeCount: pathNodes.length,
                    edgeCount: pathEdges.length,
                    pathLength: current.path.length - 1
                },
                executionTimeMs
            };
        }
        
        // Explore neighbors
        const adjacency = layerIndexes.getAdjacency(current.nodeId);
        if (!adjacency) continue;
        
        const edgeIds = [...adjacency.outgoing, ...adjacency.incoming];
        
        for (const edgeId of edgeIds) {
            const edge = layerIndexes.getEdgeById(edgeId);
            if (!edge) continue;
            
            // Apply edge type filter
            if (filter.edgeTypes && filter.edgeTypes.length > 0) {
                if (!edge.data.edgeType || !filter.edgeTypes.includes(edge.data.edgeType)) {
                    continue;
                }
            }
            
            // Determine neighbor
            const neighborId = edge.data.source === current.nodeId ? edge.data.target : edge.data.source;
            
            if (!visited.has(neighborId)) {
                visited.add(neighborId);
                queue.push({
                    nodeId: neighborId,
                    path: [...current.path, neighborId],
                    edgePath: [...current.edgePath, edgeId]
                });
            }
        }
    }
    
    // No path found
    const executionTimeMs = Date.now() - startTime;
    
    console.error(`[Traversal] Path: No path found between ${startNodeId} and ${endNodeId} in ${executionTimeMs}ms`);
    
    return {
        success: false,
        operation: 'path',
        startNodeId,
        endNodeId,
        layer: targetLayer,
        nodes: [],
        edges: [],
        metadata: {
            nodeCount: 0,
            edgeCount: 0,
            pathLength: -1
        },
        executionTimeMs
    };
}

/**
 * Extract subgraph starting from a node
 */
export async function extractSubgraph(
    graphState: GraphStateManager,
    args: any
): Promise<TraversalResult> {
    const startTime = Date.now();
    const { startNodeId, layer, depth = 2, filter = {} } = args;
    
    if (!startNodeId) {
        throw new Error('startNodeId is required');
    }
    
    const targetLayer = layer || graphState.getCurrentLayer();
    const layerIndexes = graphState.getIndexes(targetLayer);
    
    // Check if start node exists
    const startNode = layerIndexes.getNodeById(startNodeId);
    if (!startNode) {
        throw new Error(`Start node '${startNodeId}' not found in layer '${targetLayer}'`);
    }
    
    // BFS to collect subgraph
    const visitedNodes = new Set<string>([startNodeId]);
    const visitedEdges = new Set<string>();
    const resultNodes: GraphNode[] = [startNode];
    const resultEdges: GraphEdge[] = [];
    
    let currentLevel = [startNodeId];
    let currentDepth = 0;
    
    while (currentLevel.length > 0 && currentDepth < depth) {
        const nextLevel: string[] = [];
        
        for (const nodeId of currentLevel) {
            const adjacency = layerIndexes.getAdjacency(nodeId);
            if (!adjacency) continue;
            
            const edgeIds = [...adjacency.outgoing, ...adjacency.incoming];
            
            for (const edgeId of edgeIds) {
                if (visitedEdges.has(edgeId)) continue;
                
                const edge = layerIndexes.getEdgeById(edgeId);
                if (!edge) continue;
                
                // Apply edge type filter
                if (filter.edgeTypes && filter.edgeTypes.length > 0) {
                    if (!edge.data.edgeType || !filter.edgeTypes.includes(edge.data.edgeType)) {
                        continue;
                    }
                }
                
                visitedEdges.add(edgeId);
                resultEdges.push(edge);
                
                // Add both source and target to subgraph
                for (const neighborId of [edge.data.source, edge.data.target]) {
                    if (!visitedNodes.has(neighborId)) {
                        const neighborNode = layerIndexes.getNodeById(neighborId);
                        if (neighborNode) {
                            // Apply node type filter
                            if (filter.nodeTypes && filter.nodeTypes.length > 0) {
                                if (!neighborNode.data.type || !filter.nodeTypes.includes(neighborNode.data.type)) {
                                    continue;
                                }
                            }
                            
                            visitedNodes.add(neighborId);
                            resultNodes.push(neighborNode);
                            nextLevel.push(neighborId);
                        }
                    }
                }
            }
        }
        
        currentLevel = nextLevel;
        currentDepth++;
    }
    
    const executionTimeMs = Date.now() - startTime;
    
    console.error(`[Traversal] Subgraph: Extracted ${resultNodes.length} nodes, ${resultEdges.length} edges at depth ${depth} in ${executionTimeMs}ms`);
    
    return {
        success: true,
        operation: 'subgraph',
        startNodeId,
        layer: targetLayer,
        nodes: resultNodes,
        edges: resultEdges,
        metadata: {
            nodeCount: resultNodes.length,
            edgeCount: resultEdges.length,
            depth: currentDepth
        },
        executionTimeMs
    };
}

/**
 * Breadth-first search traversal
 */
export async function breadthFirstSearch(
    graphState: GraphStateManager,
    args: any
): Promise<TraversalResult> {
    // BFS is similar to extractSubgraph but returns nodes in BFS order
    return await extractSubgraph(graphState, args);
}

/**
 * Depth-first search traversal
 */
export async function depthFirstSearch(
    graphState: GraphStateManager,
    args: any
): Promise<TraversalResult> {
    const startTime = Date.now();
    const { startNodeId, layer, depth = 2, filter = {} } = args;
    
    if (!startNodeId) {
        throw new Error('startNodeId is required');
    }
    
    const targetLayer = layer || graphState.getCurrentLayer();
    const layerIndexes = graphState.getIndexes(targetLayer);
    
    // Check if start node exists
    const startNode = layerIndexes.getNodeById(startNodeId);
    if (!startNode) {
        throw new Error(`Start node '${startNodeId}' not found in layer '${targetLayer}'`);
    }
    
    const visitedNodes = new Set<string>();
    const visitedEdges = new Set<string>();
    const resultNodes: GraphNode[] = [];
    const resultEdges: GraphEdge[] = [];
    
    // DFS recursive helper
    function dfs(nodeId: string, currentDepth: number) {
        if (currentDepth >= depth || visitedNodes.has(nodeId)) {
            return;
        }
        
        const node = layerIndexes.getNodeById(nodeId);
        if (!node) return;
        
        // Apply node type filter
        if (filter.nodeTypes && filter.nodeTypes.length > 0) {
            if (!node.data.type || !filter.nodeTypes.includes(node.data.type)) {
                return;
            }
        }
        
        visitedNodes.add(nodeId);
        resultNodes.push(node);
        
        const adjacency = layerIndexes.getAdjacency(nodeId);
        if (!adjacency) return;
        
        const edgeIds = [...adjacency.outgoing, ...adjacency.incoming];
        
        for (const edgeId of edgeIds) {
            if (visitedEdges.has(edgeId)) continue;
            
            const edge = layerIndexes.getEdgeById(edgeId);
            if (!edge) continue;
            
            // Apply edge type filter
            if (filter.edgeTypes && filter.edgeTypes.length > 0) {
                if (!edge.data.edgeType || !filter.edgeTypes.includes(edge.data.edgeType)) {
                    continue;
                }
            }
            
            visitedEdges.add(edgeId);
            resultEdges.push(edge);
            
            // Recurse to neighbor
            const neighborId = edge.data.source === nodeId ? edge.data.target : edge.data.source;
            dfs(neighborId, currentDepth + 1);
        }
    }
    
    dfs(startNodeId, 0);
    
    const executionTimeMs = Date.now() - startTime;
    
    console.error(`[Traversal] DFS: Visited ${resultNodes.length} nodes, ${resultEdges.length} edges in ${executionTimeMs}ms`);
    
    return {
        success: true,
        operation: 'dfs',
        startNodeId,
        layer: targetLayer,
        nodes: resultNodes,
        edges: resultEdges,
        metadata: {
            nodeCount: resultNodes.length,
            edgeCount: resultEdges.length,
            depth
        },
        executionTimeMs
    };
}
