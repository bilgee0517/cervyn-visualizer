/**
 * Semantic Clustering Tools
 * Tools for LLM-based semantic clustering of codebase nodes
 */

import { GraphStateManager } from '../graph-state-manager.js';

export interface SemanticClusterAssignment {
    nodeId: string;
    clusterId: string;
    clusterName: string;
    clusterDescription?: string;
    semanticCategory?: string; // e.g., "authentication", "payment", "user-management"
}

export interface SemanticClusteringResult {
    clusters: Array<{
        id: string;
        name: string;
        description?: string;
        semanticCategory?: string;
        nodeIds: string[];
    }>;
    assignments: Record<string, string>; // nodeId -> clusterId
}

/**
 * Apply semantic clusters created by LLM analysis
 * The LLM analyzes code and groups nodes by what they actually do
 */
export async function applySemanticClusters(
    graphState: GraphStateManager,
    args: any
): Promise<any> {
    const { layer, clusters, assignments } = args;

    if (!clusters || !Array.isArray(clusters)) {
        throw new Error('clusters must be an array');
    }

    if (!assignments || typeof assignments !== 'object') {
        throw new Error('assignments must be an object mapping nodeId to clusterId');
    }

    const currentLayer = (layer || graphState.getCurrentLayer()) as any;

    // Store cluster metadata in graph state
    // We'll store this as node attributes for cluster nodes
    const clusterNodes: any[] = [];
    const nodeToCluster: Record<string, string> = {};

    clusters.forEach((cluster: any) => {
        const clusterId = cluster.id || `cluster-${cluster.name.toLowerCase().replace(/\s+/g, '-')}`;
        
        // Create a cluster summary node
        clusterNodes.push({
            data: {
            id: clusterId,
            label: cluster.name,
            type: 'cluster',
            roleDescription: cluster.description || cluster.semanticCategory,
            isAgentAdded: true,
            isCompound: true,
            isCollapsed: true,  // Start collapsed like code layer
            groupType: 'logical' as const,
            childCount: (cluster.nodeIds || []).length
            // children managed via parent references
        }
    });

        // Map each node to its cluster
        (cluster.nodeIds || []).forEach((nodeId: string) => {
            nodeToCluster[nodeId] = clusterId;
        });
    });

    // Apply assignments to existing nodes
    Object.entries(assignments).forEach(([nodeId, clusterId]) => {
        nodeToCluster[nodeId] = clusterId as string;
    });

    // Store clustering result in shared state
    // This will be picked up by the VS Code extension
    const clusteringResult = {
        clusters: clusters.map((c: any) => ({
            id: c.id || `cluster-${c.name.toLowerCase().replace(/\s+/g, '-')}`,
            name: c.name,
            description: c.description,
            semanticCategory: c.semanticCategory,
            nodeIds: c.nodeIds || []
        })),
        assignments: nodeToCluster,
        layer: currentLayer,
        timestamp: Date.now(),
        method: 'llm-semantic'
    };

    // Save to shared state file so extension can pick it up
    graphState.saveSemanticClustering(clusteringResult, currentLayer);

    return {
        success: true,
        message: `Applied ${clusters.length} semantic clusters to ${Object.keys(assignments).length} nodes`,
        clusterCount: clusters.length,
        nodeCount: Object.keys(assignments).length,
        layer: currentLayer,
        clusters: clusteringResult.clusters
    };
}

/**
 * Get current semantic clustering (if any)
 */
export async function getSemanticClustering(
    graphState: GraphStateManager,
    args: any
): Promise<any> {
    const { layer } = args;
    const currentLayer = (layer || graphState.getCurrentLayer()) as any;
    
    const clustering = graphState.getSemanticClustering(currentLayer);
    
    if (!clustering) {
        return {
            success: true,
            hasClustering: false,
            message: 'No semantic clustering found for this layer'
        };
    }

    return {
        success: true,
        hasClustering: true,
        layer: currentLayer,
        clusterCount: clustering.clusters.length,
        nodeCount: Object.keys(clustering.assignments).length,
        method: clustering.method || 'unknown',
        clusters: clustering.clusters,
        assignments: clustering.assignments
    };
}




