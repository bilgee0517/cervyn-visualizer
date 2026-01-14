/**
 * LLM Semantic Clusterer
 * 
 * Integrates LLM-based semantic clustering from MCP server.
 * The LLM analyzes code and groups nodes by what they actually do,
 * based on semantic meaning and functionality.
 */

import { GraphNode } from '../types';
import { log } from '../logger';
import { CLUSTER_COLORS, getClusterColor } from '../config/colors';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface LLMClusterResult {
    clusters: Array<{
        id: string;
        name: string;
        description?: string;
        semanticCategory?: string;
        nodeIds: string[];
    }>;
    assignments: Record<string, string>; // nodeId -> clusterId
    layer: string;
    timestamp: number;
    method: 'llm-semantic';
}

export interface LLMClusterSummary {
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
    semanticCategory?: string;
    description?: string;
}

export class LLMSemanticClusterer {

    /**
     * Get shared state file path
     */
    private getSharedStateFile(): string {
        const homeDir = os.homedir();
        return path.join(homeDir, '.codebase-visualizer', 'graph-state.json');
    }

    /**
     * Load semantic clustering from shared state (set by MCP server)
     */
    public loadLLMClustering(layer: string): LLMClusterResult | null {
        const stateFile = this.getSharedStateFile();
        
        try {
            if (!fs.existsSync(stateFile)) {
                log('[LLMSemanticClusterer] No shared state file found');
                return null;
            }

            const fileContent = fs.readFileSync(stateFile, 'utf-8');
            const sharedState = JSON.parse(fileContent);

            if (!sharedState.semanticClustering || !sharedState.semanticClustering[layer]) {
                log(`[LLMSemanticClusterer] No LLM clustering found for layer: ${layer}`);
                return null;
            }

            const clustering = sharedState.semanticClustering[layer];
            
            // Validate it's LLM-based
            if (clustering.method !== 'llm-semantic') {
                log(`[LLMSemanticClusterer] Clustering found but not LLM-based (method: ${clustering.method})`);
                return null;
            }

            const nodeCount = Object.keys(clustering.assignments || {}).length;
            log(`[LLMSemanticClusterer] ✅ Loaded LLM clustering: ${clustering.clusters.length} clusters, ${nodeCount} node assignments`);
            log(`[LLMSemanticClusterer] Cluster IDs: ${clustering.clusters.map((c: any) => c.id).join(', ')}`);
            return clustering as LLMClusterResult;

        } catch (error) {
            log(`[LLMSemanticClusterer] Error loading clustering: ${error}`);
            return null;
        }
    }

    /**
     * Convert LLM clustering result to cluster summaries (compatible with SemanticClusterer format)
     */
    public convertToClusterSummaries(
        llmResult: LLMClusterResult,
        nodes: GraphNode[]
    ): LLMClusterSummary[] {
        const summaries: LLMClusterSummary[] = [];
        const nodeMap = new Map(nodes.map(n => [n.data.id, n]));

        llmResult.clusters.forEach((cluster, index) => {
            // Calculate metrics for this cluster
            const clusterNodes = cluster.nodeIds
                .map(id => nodeMap.get(id))
                .filter(n => n !== undefined) as GraphNode[];

            const metrics = this.calculateClusterMetrics(clusterNodes);

            // Assign color
            const color = getClusterColor(index);

            // IMPORTANT: Use numeric cluster ID format (cluster-0, cluster-1, etc.)
            // This matches what the webview hierarchy builder expects: cluster-${n.clusterId}
            const numericClusterId = `cluster-${index}`;

            summaries.push({
                id: numericClusterId,  // Use numeric format for webview compatibility
                label: cluster.name,
                type: cluster.semanticCategory || 'module',
                size: Math.sqrt(cluster.nodeIds.length) * 15 + 20,
                color: color,
                childNodes: cluster.nodeIds,
                metrics: {
                    fileCount: clusterNodes.length,
                    avgComplexity: metrics.avgComplexity,
                    totalLOC: metrics.totalLOC
                },
                x: Math.cos(index * 2 * Math.PI / llmResult.clusters.length) * 300,
                y: Math.sin(index * 2 * Math.PI / llmResult.clusters.length) * 300,
                semanticCategory: cluster.semanticCategory,
                description: cluster.description
            });
        });

        return summaries;
    }

    /**
     * Calculate aggregate metrics for a cluster
     */
    private calculateClusterMetrics(nodes: GraphNode[]) {
        let totalLOC = 0;
        let totalComplexity = 0;
        let count = 0;

        nodes.forEach(node => {
            const loc = node.data.linesOfCode || 0;
            const complexity = node.data.complexity || 0;

            totalLOC += loc;
            if (complexity > 0) {
                totalComplexity += complexity;
                count++;
            }
        });

        return {
            totalLOC,
            avgComplexity: count > 0 ? totalComplexity / count : 0
        };
    }
}




