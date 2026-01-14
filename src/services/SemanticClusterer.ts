import { GraphNode } from '../types';
import { log } from '../logger';
import { LLMSemanticClusterer } from './LLMSemanticClusterer';
import { CLUSTER_COLORS, getClusterColor } from '../config/colors';

export interface ClusterSummary {
    id: string;
    label: string;
    type: string;
    size: number;
    color: string;
    childNodes: string[];
    metrics: {
        fileCount: number;
        avgComplexity: number;
        totalLOC: number;
    };
    x: number;
    y: number;
}

export interface ClusterResult {
    communities: Record<string, number>;
    clusterSummaries: ClusterSummary[];
    clusterColors: Record<number, string>;
}

export class SemanticClusterer {
    private llmClusterer = new LLMSemanticClusterer();

    /**
     * Cluster codebase nodes using LLM-based semantic clustering
     * @param layer - Current layer (required for LLM clustering lookup)
     */
    public clusterCodebase(
        nodes: GraphNode[], 
        edges: any[], 
        layer: string
    ): ClusterResult {
        log(`\n🧮 Starting LLM-based semantic clustering for layer: ${layer}...`);
        
        // Load LLM-based clustering
        log(`[SemanticClusterer] Attempting to load LLM clustering for layer: "${layer}"`);
        const llmResult = this.llmClusterer.loadLLMClustering(layer);
        if (llmResult) {
            log(`[SemanticClusterer] ✅ Using LLM-based semantic clustering: ${llmResult.clusters.length} clusters`);
            const result = this.convertLLMResultToClusterResult(llmResult, nodes);
            log(`[SemanticClusterer] Converted to ${result.clusterSummaries.length} cluster summaries, ${Object.keys(result.communities).length} node assignments`);
            return result;
        }
        
        // No LLM clustering available - return empty result
        log('[SemanticClusterer] ⚠️ No LLM clustering found. Please use the MCP server to create semantic clusters first.');
        log('[SemanticClusterer]    Ask Claude: "Analyze my codebase and create semantic clusters based on functionality"');
        
        return {
            communities: {},
            clusterSummaries: [],
            clusterColors: {}
        };
    }


    /**
     * Assign cluster metadata to nodes
     */
    public assignClusterMetadata(nodes: GraphNode[], clusterResult: ClusterResult): GraphNode[] {
        return nodes.map(node => ({
            ...node,
            data: {
                ...node.data,
                clusterId: clusterResult.communities[node.data.id],
                clusterColor: clusterResult.clusterColors[clusterResult.communities[node.data.id]]
            }
        }));
    }

    /**
     * Convert LLM clustering result to ClusterResult format
     */
    private convertLLMResultToClusterResult(
        llmResult: any,
        nodes: GraphNode[]
    ): ClusterResult {
        const clusterSummaries = this.llmClusterer.convertToClusterSummaries(llmResult, nodes);
        
        // Create clusterId string -> numeric index mapping
        const clusterIdToIndex = new Map<string, number>();
        llmResult.clusters.forEach((cluster: any, index: number) => {
            clusterIdToIndex.set(cluster.id, index);
        });
        
        // Create communities map (nodeId -> numeric clusterId)
        const communities: Record<string, number> = {};
        Object.entries(llmResult.assignments).forEach(([nodeId, clusterIdString]) => {
            const clusterIndex = clusterIdToIndex.get(clusterIdString as string);
            if (clusterIndex !== undefined) {
                communities[nodeId] = clusterIndex;
            }
        });

        // Create cluster colors map (numeric index -> color)
        const clusterColors: Record<number, string> = {};
        clusterSummaries.forEach((summary, index) => {
            clusterColors[index] = summary.color;
        });

        // IMPORTANT: Update cluster summary IDs to match numeric format expected by webview
        // Webview expects cluster IDs like "cluster-0", "cluster-1", etc. for hierarchy building
        const updatedSummaries = clusterSummaries.map((summary, index) => ({
            ...summary,
            id: `cluster-${index}`  // Use numeric ID format
        }));

        return {
            communities,
            clusterSummaries: updatedSummaries,
            clusterColors
        };
    }
}


