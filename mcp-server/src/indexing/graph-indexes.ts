/**
 * Graph Indexing System
 * 
 * Provides O(1) lookup performance for nodes and edges using in-memory indexes.
 * Indexes are automatically maintained when nodes/edges are added, updated, or removed.
 */

import { GraphNode, GraphEdge, Layer } from '../graph-state-manager.js';

export interface AdjacencyInfo {
    incoming: string[];  // Edge IDs
    outgoing: string[];  // Edge IDs
}

/**
 * GraphIndexes - In-memory indexes for fast graph queries
 */
export class GraphIndexes {
    // Core indexes
    private nodeById: Map<string, GraphNode> = new Map();
    private edgeById: Map<string, GraphEdge> = new Map();
    
    // Type indexes
    private nodesByType: Map<string, Set<string>> = new Map();
    
    // Feature annotation indexes
    private nodesByFeature: Map<string, Set<string>> = new Map(); // featureId -> nodeIds
    private featuresByNode: Map<string, Set<string>> = new Map(); // nodeId -> featureIds (supportsFeatures)
    private supportedByIndex: Map<string, Set<string>> = new Map(); // workflow node -> supporting nodeIds
    
    // Label pattern index (prefix search)
    private nodeLabelPrefixes: Map<string, Set<string>> = new Map();
    
    // Adjacency lists for graph traversal
    private adjacency: Map<string, AdjacencyInfo> = new Map();
    
    // Edge type index
    private edgesByType: Map<string, Set<string>> = new Map();
    
    // Statistics
    private stats = {
        nodeCount: 0,
        edgeCount: 0,
        lastRebuild: 0
    };

    constructor() {}

    // ============================================================================
    // INDEX BUILDING
    // ============================================================================

    /**
     * Build all indexes from scratch (called on initialization or rebuild)
     */
    public buildIndexes(nodes: GraphNode[], edges: GraphEdge[]): void {
        const startTime = Date.now();
        
        // Clear existing indexes
        this.clear();
        
        // Index nodes
        for (const node of nodes) {
            this.indexNode(node);
        }
        
        // Index edges
        for (const edge of edges) {
            this.indexEdge(edge);
        }
        
        this.stats.lastRebuild = Date.now();
        const elapsed = Date.now() - startTime;
        
        console.error(`[GraphIndexes] Built indexes: ${nodes.length} nodes, ${edges.length} edges in ${elapsed}ms`);
    }

    /**
     * Clear all indexes
     */
    public clear(): void {
        this.nodeById.clear();
        this.edgeById.clear();
        this.nodesByType.clear();
        this.nodesByFeature.clear();
        this.featuresByNode.clear();
        this.supportedByIndex.clear();
        this.nodeLabelPrefixes.clear();
        this.adjacency.clear();
        this.edgesByType.clear();
        this.stats.nodeCount = 0;
        this.stats.edgeCount = 0;
    }

    // ============================================================================
    // NODE INDEXING
    // ============================================================================

    /**
     * Index a single node (called when node is added)
     */
    public indexNode(node: GraphNode): void {
        const nodeId = node.data.id;
        
        // ID index
        this.nodeById.set(nodeId, node);
        
        // Type index
        if (node.data.type) {
            if (!this.nodesByType.has(node.data.type)) {
                this.nodesByType.set(node.data.type, new Set());
            }
            this.nodesByType.get(node.data.type)!.add(nodeId);
        }
        
        // Feature annotation indexes
        if (node.data.supportsFeatures) {
            for (const featureId of node.data.supportsFeatures) {
                if (!this.nodesByFeature.has(featureId)) {
                    this.nodesByFeature.set(featureId, new Set());
                }
                this.nodesByFeature.get(featureId)!.add(nodeId);
                
                if (!this.featuresByNode.has(nodeId)) {
                    this.featuresByNode.set(nodeId, new Set());
                }
                this.featuresByNode.get(nodeId)!.add(featureId);
            }
        }
        
        if (node.data.supportedBy) {
            for (const supportingNodeId of node.data.supportedBy) {
                if (!this.supportedByIndex.has(nodeId)) {
                    this.supportedByIndex.set(nodeId, new Set());
                }
                this.supportedByIndex.get(nodeId)!.add(supportingNodeId);
            }
        }
        
        // Label prefix index (for pattern matching)
        const label = node.data.label.toLowerCase();
        for (let i = 1; i <= Math.min(label.length, 10); i++) {
            const prefix = label.substring(0, i);
            if (!this.nodeLabelPrefixes.has(prefix)) {
                this.nodeLabelPrefixes.set(prefix, new Set());
            }
            this.nodeLabelPrefixes.get(prefix)!.add(nodeId);
        }
        
        // Initialize adjacency info
        if (!this.adjacency.has(nodeId)) {
            this.adjacency.set(nodeId, { incoming: [], outgoing: [] });
        }
        
        this.stats.nodeCount++;
    }

    /**
     * Update node in indexes (called when node is updated)
     */
    public updateNode(nodeId: string, updatedNode: GraphNode): void {
        // Remove old node from indexes
        const oldNode = this.nodeById.get(nodeId);
        if (oldNode) {
            this.removeNodeFromIndexes(oldNode);
        }
        
        // Re-index updated node
        this.indexNode(updatedNode);
    }

    /**
     * Remove node from all indexes (called when node is deleted)
     */
    public removeNode(nodeId: string): void {
        const node = this.nodeById.get(nodeId);
        if (node) {
            this.removeNodeFromIndexes(node);
        }
    }

    /**
     * Internal: Remove node from all indexes
     */
    private removeNodeFromIndexes(node: GraphNode): void {
        const nodeId = node.data.id;
        
        // Remove from ID index
        this.nodeById.delete(nodeId);
        
        // Remove from type index
        if (node.data.type) {
            this.nodesByType.get(node.data.type)?.delete(nodeId);
        }
        
        // Remove from feature indexes
        if (node.data.supportsFeatures) {
            for (const featureId of node.data.supportsFeatures) {
                this.nodesByFeature.get(featureId)?.delete(nodeId);
            }
        }
        this.featuresByNode.delete(nodeId);
        
        if (node.data.supportedBy) {
            this.supportedByIndex.delete(nodeId);
        }
        
        // Remove from label prefix index
        const label = node.data.label.toLowerCase();
        for (let i = 1; i <= Math.min(label.length, 10); i++) {
            const prefix = label.substring(0, i);
            this.nodeLabelPrefixes.get(prefix)?.delete(nodeId);
        }
        
        // Remove from adjacency (connections handled by edge removal)
        this.adjacency.delete(nodeId);
        
        this.stats.nodeCount--;
    }

    // ============================================================================
    // EDGE INDEXING
    // ============================================================================

    /**
     * Index a single edge (called when edge is added)
     */
    public indexEdge(edge: GraphEdge): void {
        const edgeId = edge.data.id;
        const sourceId = edge.data.source;
        const targetId = edge.data.target;
        
        // ID index
        this.edgeById.set(edgeId, edge);
        
        // Type index
        if (edge.data.edgeType) {
            if (!this.edgesByType.has(edge.data.edgeType)) {
                this.edgesByType.set(edge.data.edgeType, new Set());
            }
            this.edgesByType.get(edge.data.edgeType)!.add(edgeId);
        }
        
        // Adjacency lists
        if (!this.adjacency.has(sourceId)) {
            this.adjacency.set(sourceId, { incoming: [], outgoing: [] });
        }
        if (!this.adjacency.has(targetId)) {
            this.adjacency.set(targetId, { incoming: [], outgoing: [] });
        }
        
        this.adjacency.get(sourceId)!.outgoing.push(edgeId);
        this.adjacency.get(targetId)!.incoming.push(edgeId);
        
        this.stats.edgeCount++;
    }

    /**
     * Update edge in indexes (called when edge is updated)
     */
    public updateEdge(edgeId: string, updatedEdge: GraphEdge): void {
        // Remove old edge from indexes
        const oldEdge = this.edgeById.get(edgeId);
        if (oldEdge) {
            this.removeEdgeFromIndexes(oldEdge);
        }
        
        // Re-index updated edge
        this.indexEdge(updatedEdge);
    }

    /**
     * Remove edge from all indexes (called when edge is deleted)
     */
    public removeEdge(edgeId: string): void {
        const edge = this.edgeById.get(edgeId);
        if (edge) {
            this.removeEdgeFromIndexes(edge);
        }
    }

    /**
     * Internal: Remove edge from all indexes
     */
    private removeEdgeFromIndexes(edge: GraphEdge): void {
        const edgeId = edge.data.id;
        const sourceId = edge.data.source;
        const targetId = edge.data.target;
        
        // Remove from ID index
        this.edgeById.delete(edgeId);
        
        // Remove from type index
        if (edge.data.edgeType) {
            this.edgesByType.get(edge.data.edgeType)?.delete(edgeId);
        }
        
        // Remove from adjacency lists
        const sourceAdj = this.adjacency.get(sourceId);
        if (sourceAdj) {
            sourceAdj.outgoing = sourceAdj.outgoing.filter(id => id !== edgeId);
        }
        
        const targetAdj = this.adjacency.get(targetId);
        if (targetAdj) {
            targetAdj.incoming = targetAdj.incoming.filter(id => id !== edgeId);
        }
        
        this.stats.edgeCount--;
    }

    // ============================================================================
    // QUERY METHODS
    // ============================================================================

    /**
     * Get node by ID - O(1)
     */
    public getNodeById(nodeId: string): GraphNode | undefined {
        return this.nodeById.get(nodeId);
    }

    /**
     * Get edge by ID - O(1)
     */
    public getEdgeById(edgeId: string): GraphEdge | undefined {
        return this.edgeById.get(edgeId);
    }

    /**
     * Get all nodes of a specific type - O(1) lookup
     */
    public getNodesByType(type: string): GraphNode[] {
        const nodeIds = this.nodesByType.get(type);
        if (!nodeIds) return [];
        
        return Array.from(nodeIds)
            .map(id => this.nodeById.get(id))
            .filter((node): node is GraphNode => node !== undefined);
    }

    /**
     * Get all nodes supporting a specific feature - O(1) lookup
     */
    public getNodesByFeature(featureId: string): GraphNode[] {
        const nodeIds = this.nodesByFeature.get(featureId);
        if (!nodeIds) return [];
        
        return Array.from(nodeIds)
            .map(id => this.nodeById.get(id))
            .filter((node): node is GraphNode => node !== undefined);
    }

    /**
     * Get features supported by a node - O(1) lookup
     */
    public getFeaturesByNode(nodeId: string): string[] {
        const features = this.featuresByNode.get(nodeId);
        return features ? Array.from(features) : [];
    }

    /**
     * Get nodes supporting a workflow feature - O(1) lookup
     */
    public getSupportingNodes(workflowNodeId: string): GraphNode[] {
        const nodeIds = this.supportedByIndex.get(workflowNodeId);
        if (!nodeIds) return [];
        
        return Array.from(nodeIds)
            .map(id => this.nodeById.get(id))
            .filter((node): node is GraphNode => node !== undefined);
    }

    /**
     * Find nodes by label prefix - O(1) lookup + O(k) filter
     */
    public findNodesByLabelPrefix(prefix: string): GraphNode[] {
        const lowerPrefix = prefix.toLowerCase();
        const nodeIds = this.nodeLabelPrefixes.get(lowerPrefix);
        if (!nodeIds) return [];
        
        return Array.from(nodeIds)
            .map(id => this.nodeById.get(id))
            .filter((node): node is GraphNode => node !== undefined);
    }

    /**
     * Find nodes by label pattern (regex) - O(n) but cached prefix helps
     */
    public findNodesByLabelPattern(pattern: string): GraphNode[] {
        const regex = new RegExp(pattern, 'i');
        return Array.from(this.nodeById.values()).filter(node => 
            regex.test(node.data.label)
        );
    }

    /**
     * Get adjacency info for a node - O(1)
     */
    public getAdjacency(nodeId: string): AdjacencyInfo | undefined {
        return this.adjacency.get(nodeId);
    }

    /**
     * Get all edges of a specific type - O(1) lookup
     */
    public getEdgesByType(edgeType: string): GraphEdge[] {
        const edgeIds = this.edgesByType.get(edgeType);
        if (!edgeIds) return [];
        
        return Array.from(edgeIds)
            .map(id => this.edgeById.get(id))
            .filter((edge): edge is GraphEdge => edge !== undefined);
    }

    /**
     * Get all nodes (for compatibility)
     */
    public getAllNodes(): GraphNode[] {
        return Array.from(this.nodeById.values());
    }

    /**
     * Get all edges (for compatibility)
     */
    public getAllEdges(): GraphEdge[] {
        return Array.from(this.edgeById.values());
    }

    /**
     * Check if node exists - O(1)
     */
    public hasNode(nodeId: string): boolean {
        return this.nodeById.has(nodeId);
    }

    /**
     * Check if edge exists - O(1)
     */
    public hasEdge(edgeId: string): boolean {
        return this.edgeById.has(edgeId);
    }

    /**
     * Get statistics
     */
    public getStats() {
        return {
            ...this.stats,
            typeCount: this.nodesByType.size,
            featureCount: this.nodesByFeature.size,
            edgeTypeCount: this.edgesByType.size
        };
    }
}

/**
 * LayerIndexes - Manages indexes for all 5 layers
 */
export class LayerIndexes {
    private indexes: Record<Layer, GraphIndexes> = {
        workflow: new GraphIndexes(),
        context: new GraphIndexes(),
        container: new GraphIndexes(),
        component: new GraphIndexes(),
        code: new GraphIndexes()
    };

    /**
     * Get indexes for a specific layer
     */
    public getIndexes(layer: Layer): GraphIndexes {
        return this.indexes[layer];
    }

    /**
     * Build indexes for a specific layer
     */
    public buildIndexes(layer: Layer, nodes: GraphNode[], edges: GraphEdge[]): void {
        this.indexes[layer].buildIndexes(nodes, edges);
    }

    /**
     * Clear indexes for a specific layer
     */
    public clearIndexes(layer: Layer): void {
        this.indexes[layer].clear();
    }

    /**
     * Clear all indexes
     */
    public clearAll(): void {
        for (const layer of Object.keys(this.indexes) as Layer[]) {
            this.indexes[layer].clear();
        }
    }

    /**
     * Get statistics for all layers
     */
    public getAllStats() {
        const stats: Record<string, any> = {};
        for (const layer of Object.keys(this.indexes) as Layer[]) {
            stats[layer] = this.indexes[layer].getStats();
        }
        return stats;
    }
}
