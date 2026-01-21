/**
 * GraphStateManager
 * 
 * Manages the in-memory state of the knowledge graph for the MCP server.
 * This mirrors the GraphService from the VS Code extension but runs independently.
 * 
 * Phase 3: Now persists to shared state file for synchronization with VS Code extension.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import { LayerIndexes } from './indexing/graph-indexes.js';

// Current schema version
const SCHEMA_VERSION = 3;

// Import property ownership boundaries from shared config
// Note: In production, these should be in a shared package or copied between projects
const EXTENSION_OWNED_PROPERTIES = [
    'id', 'label', 'type', 'path', 'fileExtension', 'language',
    'parent', 'isCompound', 'groupType', 'childCount',
    'linesOfCode', 'complexity', 'testCoverage', 'daysSinceLastChange', 'layer',
    'sizeMultiplier', 'revealThreshold', 'category', 'isEntryPoint',
    'chunkHash', 'merkleRoot'
];

// 5-Layer Visualization System
// Combines workflow layer (features) with C4 model (architecture)
// - workflow: User-facing features and capabilities (NEW)
// - context: External systems and boundaries (C4 Level 1)
// - container: Applications and services (C4 Level 2)
// - component: Modules and packages (C4 Level 3)
// - code: Implementation details (C4 Level 4)
export type Layer = 'workflow' | 'context' | 'container' | 'component' | 'code';


export interface GraphNode {
    data: {
        id: string;
        label: string;
        type?: 'file' | 'directory' | 'module' | 'class' | 'function';
        path?: string;
        category?: string;
        isEntryPoint?: boolean;
        fileExtension?: string;
        roleDescription?: string;
        technology?: string;
        progressStatus?: 'done' | 'in-progress' | 'not-started' | 'error';
        shape?: string;
        modified?: boolean;
        language?: string;
        parent?: string;
        isCompound?: boolean;
        isCollapsed?: boolean;
        groupType?: 'folder' | 'logical' | 'namespace' | 'file';
        childCount?: number;
        // NOTE: children/childNodes arrays removed - use parent references instead
        // Cytoscape calculates children dynamically via parent field
        isAgentAdded?: boolean;
        changeName?: string;
        changeSummary?: string;
        changeIntention?: string;
        changeAdditionalInfo?: string;
        chunkHash?: string;
        merkleRoot?: string;
        // Feature annotation properties (cross-layer tracing)
        supportsFeatures?: string[]; // Feature IDs this node supports (all layers except workflow)
        supportedBy?: string[];      // Node IDs implementing this feature (workflow layer only)
    };
}

export interface GraphEdge {
    data: {
        id: string;
        source: string;
        target: string;
        label?: string;
        edgeType?: 'imports' | 'calls' | 'extends' | 'implements' | 'depends-on' | 'uses';
        description?: string; // Description of what this edge/relationship represents
    };
}

export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface ProposedChange {
    name?: string;
    summary?: string;
    intention?: string;
    additionalInfo?: string;
    nodeId?: string;
    filePath?: string;
    timestamp?: number;
}

export class GraphStateManager {
    private graphs: Record<Layer, GraphData> = {
        workflow: { nodes: [], edges: [] },
        context: { nodes: [], edges: [] },
        container: { nodes: [], edges: [] },
        component: { nodes: [], edges: [] },
        code: { nodes: [], edges: [] }
    };

    private currentLayer: Layer = 'code';
    private agentOnlyMode: boolean = false;
    
    // Indexes for fast lookups (NEW)
    private indexes: LayerIndexes = new LayerIndexes();

    private proposedChangesByLayer: Record<Layer, Map<string, ProposedChange>> = {
        workflow: new Map(),
        context: new Map(),
        container: new Map(),
        component: new Map(),
        code: new Map()
    };

    // Semantic clustering storage (LLM-based)
    private semanticClusteringByLayer: Record<Layer, any> = {
        workflow: null,
        context: null,
        container: null,
        component: null,
        code: null
    };

    // Shared state file tracking
    private stateVersion: number = 1;
    private writeDebounceTimer?: NodeJS.Timeout;

    constructor() {
        this.ensureStateDirectory();
        this.loadFromSharedState();
    }

    // ============================================================================
    // SHARED STATE FILE MANAGEMENT
    // ============================================================================

    private getSharedStateDir(): string {
        // Get workspace path from environment variable (set by Cursor/VS Code)
        // If not set, assume we're in mcp-server subdir and go up one level to workspace root
        let workspacePath = process.env.WORKSPACE_PATH;
        
        if (!workspacePath) {
            const cwd = process.cwd();
            // If we're in the mcp-server directory, go up one level to get workspace root
            if (cwd.endsWith('mcp-server') || cwd.includes('/mcp-server')) {
                workspacePath = path.dirname(cwd);
            } else {
                workspacePath = cwd;
            }
        }
        
        console.error(`[GraphStateManager] Using workspace path: ${workspacePath}`);
        console.error(`[GraphStateManager] process.cwd(): ${process.cwd()}`);
        console.error(`[GraphStateManager] process.env.WORKSPACE_PATH: ${process.env.WORKSPACE_PATH}`);
        
        // Store in workspace/.codebase-visualizer
        const stateDir = path.join(workspacePath, '.codebase-visualizer');
        console.error(`[GraphStateManager] State dir: ${stateDir}`);
        return stateDir;
    }

    private getSharedStateFile(): string {
        return path.join(this.getSharedStateDir(), 'graph-state.json');
    }

    private ensureStateDirectory(): void {
        const stateDir = this.getSharedStateDir();
        if (!fs.existsSync(stateDir)) {
            fs.mkdirSync(stateDir, { recursive: true });
            console.error(`[GraphStateManager] Created state directory: ${stateDir}`);
        }
    }

    private loadFromSharedState(): void {
        const stateFile = this.getSharedStateFile();
        try {
            if (fs.existsSync(stateFile)) {
                const fileContent = fs.readFileSync(stateFile, 'utf-8');
                
                let sharedState: any;
                try {
                    sharedState = JSON.parse(fileContent);
                } catch (parseError) {
                    console.error(`[GraphStateManager] Failed to parse state file: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
                    console.error(`[GraphStateManager] File will be recreated on next write`);
                    return;
                }
                
                // Validate structure before loading
                if (!sharedState.graphs || typeof sharedState.graphs !== 'object') {
                    console.error(`[GraphStateManager] Invalid state structure: missing or invalid graphs field`);
                    return;
                }

                // Verify schema version (expecting v3)
                const currentSchemaVersion = sharedState.schemaVersion || 0;
                if (currentSchemaVersion !== SCHEMA_VERSION) {
                    console.error(`[GraphStateManager] Warning: State file schema version is ${currentSchemaVersion}, expected ${SCHEMA_VERSION}`);
                    console.error(`[GraphStateManager] State may need to be regenerated if errors occur`);
                }

                // Load graphs - only load valid layers, filter out legacy keys
                if (sharedState.graphs) {
                    const validLayers: Layer[] = ['workflow', 'context', 'container', 'component', 'code'];
                    // Start with empty graphs to ensure all layers exist
                    const normalizedGraphs: Record<Layer, GraphData> = {
                        workflow: { nodes: [], edges: [] },
                        context: { nodes: [], edges: [] },
                        container: { nodes: [], edges: [] },
                        component: { nodes: [], edges: [] },
                        code: { nodes: [], edges: [] }
                    };
                    // Only copy valid layer data from loaded state
                    for (const layer of validLayers) {
                        if (sharedState.graphs[layer]) {
                            normalizedGraphs[layer] = sharedState.graphs[layer];
                            // Build indexes for this layer
                            this.indexes.buildIndexes(layer, normalizedGraphs[layer].nodes, normalizedGraphs[layer].edges);
                        }
                    }
                    this.graphs = normalizedGraphs;
                }

                // Load current layer
                if (sharedState.currentLayer) {
                    this.currentLayer = sharedState.currentLayer;
                }

                // Load agent-only mode
                if (sharedState.agentOnlyMode !== undefined) {
                    this.agentOnlyMode = sharedState.agentOnlyMode;
                }

                // Load proposed changes
                if (sharedState.proposedChanges) {
                    const layers: Layer[] = ['workflow', 'context', 'container', 'component', 'code'];
                    for (const layer of layers) {
                        this.proposedChangesByLayer[layer].clear();
                        if (sharedState.proposedChanges[layer]) {
                            for (const change of sharedState.proposedChanges[layer]) {
                                this.proposedChangesByLayer[layer].set(change.nodeId, change);
                            }
                        }
                    }
                }

                // Load semantic clustering
                if (sharedState.semanticClustering) {
                    this.semanticClusteringByLayer = sharedState.semanticClustering;
                }

                // Note: nodeHistory and deletedNodes are preserved in sync but not actively used by MCP server
                // They are managed by the VS Code extension

                // Track version
                if (sharedState.version) {
                    this.stateVersion = sharedState.version;
                }

                console.error(`[GraphStateManager] Loaded shared state version ${this.stateVersion}`);
            }
        } catch (err) {
            console.error(`[GraphStateManager] Error loading shared state: ${err instanceof Error ? err.message : String(err)}`);
            if (err instanceof Error && err.stack) {
                console.error(`[GraphStateManager] Stack: ${err.stack}`);
            }
        }
    }

    private syncToSharedState(): void {
        // Debounce writes to avoid excessive I/O
        if (this.writeDebounceTimer) {
            clearTimeout(this.writeDebounceTimer);
        }

        this.writeDebounceTimer = setTimeout(() => {
            this.syncToSharedStateImmediate().catch(err => {
                console.error(`[GraphStateManager] Error in debounced sync: ${err instanceof Error ? err.message : String(err)}`);
            });
        }, 100);
    }

    private async syncToSharedStateImmediate(): Promise<void> {
        const startTime = Date.now();
        const stateFile = this.getSharedStateFile();
        let releaseLock: (() => Promise<void>) | null = null;
        
        console.error(`[GraphStateManager] Starting state sync (current version: ${this.stateVersion})`);
        
        try {
            // Acquire file lock before writing
            try {
                releaseLock = await lockfile.lock(stateFile, {
                    retries: {
                        retries: 3,
                        minTimeout: 100,
                        maxTimeout: 500,
                        randomize: true
                    },
                    stale: 3000, // 3 second stale timeout
                    realpath: false
                });
                console.error(`[GraphStateManager] ? Lock acquired`);
            } catch (lockErr) {
                console.error(`[GraphStateManager] ??  Failed to acquire lock, proceeding without lock: ${lockErr instanceof Error ? lockErr.message : String(lockErr)}`);
                // Proceed without lock in case of lock acquisition failure
            }
            
            // Read existing state to preserve extension-owned fields
            let existingState: any = null;
            let existingVersion = 0;
            if (fs.existsSync(stateFile)) {
                try {
                    const fileContent = fs.readFileSync(stateFile, 'utf-8');
                    existingState = JSON.parse(fileContent);
                    existingVersion = existingState.version || 0;
                    console.error(`[GraphStateManager] Read existing state (version ${existingVersion}, ${fileContent.length} bytes)`);
                } catch (err) {
                    console.error(`[GraphStateManager] Could not read existing state: ${err instanceof Error ? err.message : String(err)}`);
                    console.error(`[GraphStateManager] Will create new state file`);
                }
            }

            // Convert proposed changes from Map to Array
            const layers: Layer[] = ['workflow', 'context', 'container', 'component', 'code'];
            const proposedChangesArray: any = {};
            
            for (const layer of layers) {
                proposedChangesArray[layer] = Array.from(this.proposedChangesByLayer[layer].values());
            }

            // CRITICAL: Always use file version as source of truth (multi-writer coordination)
            // Never trust our cached version - extension may have written in between
            const oldVersion = this.stateVersion;
            this.stateVersion = existingVersion + 1; // File version + 1
            console.error(`[GraphStateManager] Version: ${oldVersion} (cached) ? ${existingVersion} (file) ? ${this.stateVersion} (write)`);

            // Preserve extension-owned properties when writing nodes
            const preservedGraphs: any = {};
            let totalNodes = 0;
            let totalEdges = 0;
            let agentAddedNodes = 0;
            
            for (const layer of layers) {
                const layerNodes = this.graphs[layer].nodes.length;
                const layerEdges = this.graphs[layer].edges.length;
                const agentNodesInLayer = this.graphs[layer].nodes.filter(n => n.data.isAgentAdded).length;
                
                if (layerNodes > 0 || layerEdges > 0) {
                    console.error(`[GraphStateManager]   ${layer}: ${layerNodes} nodes (${agentNodesInLayer} agent-added), ${layerEdges} edges`);
                }
                
                totalNodes += layerNodes;
                totalEdges += layerEdges;
                agentAddedNodes += agentNodesInLayer;
                
                preservedGraphs[layer] = {
                    nodes: this.graphs[layer].nodes.map(node => {
                        // Find corresponding node in existing state
                        const existingNode = existingState?.graphs?.[layer]?.nodes?.find(
                            (n: any) => n.data.id === node.data.id
                        );
                        
                        if (existingNode) {
                            // Preserve extension-owned properties from existing state
                            return {
                                ...node,
                                data: this.preserveExtensionProperties(existingNode.data, node.data)
                            };
                        }
                        
                        return node;
                    }),
                    edges: this.graphs[layer].edges
                };
            }
            
            console.error(`[GraphStateManager] Total: ${totalNodes} nodes (${agentAddedNodes} agent-added), ${totalEdges} edges`);

            // Create shared state object
            const sharedState = {
                schemaVersion: SCHEMA_VERSION,
                version: this.stateVersion,
                timestamp: Date.now(),
                source: 'mcp-server',
                currentLayer: this.currentLayer,
                agentOnlyMode: this.agentOnlyMode,
                graphs: preservedGraphs,
                proposedChanges: proposedChangesArray,
                semanticClustering: this.semanticClusteringByLayer,
                // Preserve extension-managed fields
                nodeHistory: existingState?.nodeHistory,
                deletedNodes: existingState?.deletedNodes
            };

            // Write atomically (temp file + rename)
            const tempFile = stateFile + '.tmp';
            const stateJson = JSON.stringify(sharedState, null, 2);
            fs.writeFileSync(tempFile, stateJson, 'utf-8');
            fs.renameSync(tempFile, stateFile);
            
            // Verify write
            const fileSize = fs.statSync(stateFile).size;
            const elapsedMs = Date.now() - startTime;
            
            console.error(`[GraphStateManager] ? State written successfully:`);
            console.error(`[GraphStateManager]   Version: ${this.stateVersion}`);
            console.error(`[GraphStateManager]   File: ${stateFile}`);
            console.error(`[GraphStateManager]   Size: ${fileSize} bytes (${(fileSize / 1024).toFixed(2)} KB)`);
            console.error(`[GraphStateManager]   Time: ${elapsedMs}ms`);
            
            // Release lock
            if (releaseLock) {
                await releaseLock();
                console.error(`[GraphStateManager] ? Lock released`);
            }
        } catch (err) {
            // Ensure lock is released even on error
            if (releaseLock) {
                try {
                    await releaseLock();
                } catch (releaseErr) {
                    console.error(`[GraphStateManager] ??  Failed to release lock: ${releaseErr instanceof Error ? releaseErr.message : String(releaseErr)}`);
                }
            }
            
            console.error(`[GraphStateManager] Error syncing to shared state: ${err instanceof Error ? err.message : String(err)}`);
            if (err instanceof Error && err.stack) {
                console.error(`[GraphStateManager] Stack: ${err.stack}`);
            }
            // Re-throw as this is critical for MCP operations
            throw new Error(`Failed to sync state: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Preserve extension-owned properties when merging node data
     * MCP should only modify MCP-owned properties
     */
    private preserveExtensionProperties(existingData: any, newData: any): any {
        const merged = { ...newData };
        
        // Preserve all extension-owned properties from existing data
        for (const key of EXTENSION_OWNED_PROPERTIES) {
            if (key in existingData) {
                merged[key] = existingData[key];
            }
        }
        
        return merged;
    }

    // ============================================================================
    // GRAPH OPERATIONS
    // ============================================================================

    public getGraph(layer?: Layer | string): GraphData {
        const lyr = layer ? (layer as Layer) : this.currentLayer;
        const graphData = this.graphs[lyr];
        return this.filterAgentOnlyGraph(graphData);
    }

    public setGraph(graphData: GraphData, layer?: Layer | string): void {
        const lyr = layer ? (layer as Layer) : this.currentLayer;
        this.graphs[lyr] = graphData;
        this.syncToSharedState();
    }

    public addNode(node: GraphNode, layer?: Layer | string): void {
        // Validate node structure
        if (!node || !node.data || !node.data.id) {
            throw new Error('Invalid node: must have data.id');
        }
        
        const lyr = layer ? (layer as Layer) : this.currentLayer;
        const graph = this.graphs[lyr];
        const layerIndexes = this.indexes.getIndexes(lyr);
        
        // Check if node already exists (using index - O(1))
        if (layerIndexes.hasNode(node.data.id)) {
            throw new Error(`Node with ID '${node.data.id}' already exists in layer '${lyr}'`);
        }
        
        // Mark as agent-added
        node.data.isAgentAdded = true;
        
        const beforeCount = graph.nodes.length;
        graph.nodes.push(node);
        layerIndexes.indexNode(node); // Index the new node
        const afterCount = graph.nodes.length;
        
        console.error(`[GraphStateManager] Adding node to ${lyr} layer:`);
        console.error(`[GraphStateManager]   ID: ${node.data.id}`);
        console.error(`[GraphStateManager]   Label: ${node.data.label}`);
        console.error(`[GraphStateManager]   Type: ${node.data.type || 'unspecified'}`);
        console.error(`[GraphStateManager]   Node count: ${beforeCount} ? ${afterCount}`);
        console.error(`[GraphStateManager] Syncing to shared state file...`);
        
        this.syncToSharedState();
        
        console.error(`[GraphStateManager] ? Node added and synced`);
    }

    public removeNode(nodeId: string, layer?: Layer | string): void {
        const lyr = layer ? (layer as Layer) : this.currentLayer;
        const graph = this.graphs[lyr];
        const layerIndexes = this.indexes.getIndexes(lyr);
        
        const initialLength = graph.nodes.length;
        graph.nodes = graph.nodes.filter(n => n.data.id !== nodeId);
        
        if (graph.nodes.length === initialLength) {
            throw new Error(`Node with ID '${nodeId}' not found`);
        }
        
        // Remove from indexes
        layerIndexes.removeNode(nodeId);
        
        // Also remove edges connected to this node
        const edgesToRemove = graph.edges.filter(
            e => e.data.source === nodeId || e.data.target === nodeId
        );
        
        graph.edges = graph.edges.filter(
            e => e.data.source !== nodeId && e.data.target !== nodeId
        );
        
        // Remove edges from indexes
        for (const edge of edgesToRemove) {
            layerIndexes.removeEdge(edge.data.id);
        }
        
        this.syncToSharedState();
    }

    public updateNode(nodeId: string, updates: Partial<GraphNode['data']>, layer?: Layer | string): void {
        // Validate inputs
        if (!nodeId || typeof nodeId !== 'string') {
            throw new Error('Node ID must be a non-empty string');
        }
        
        if (!updates || typeof updates !== 'object') {
            throw new Error('Updates must be an object');
        }
        
        const lyr = layer ? (layer as Layer) : this.currentLayer;
        const graph = this.graphs[lyr];
        const layerIndexes = this.indexes.getIndexes(lyr);
        
        // Use index for O(1) lookup
        const node = layerIndexes.getNodeById(nodeId);
        if (!node) {
            throw new Error(`Node with ID '${nodeId}' not found in layer '${lyr}' (total nodes: ${graph.nodes.length})`);
        }
        
        // Apply updates
        Object.assign(node.data, updates);
        node.data.modified = true;
        
        // Update indexes
        layerIndexes.updateNode(nodeId, node);
        
        this.syncToSharedState();
        
        console.error(`[GraphStateManager] Updated node '${nodeId}' in layer '${lyr}' with ${Object.keys(updates).length} properties`);
    }

    public addEdge(edge: GraphEdge, layer?: Layer | string): void {
        // Validate edge structure
        if (!edge || !edge.data) {
            throw new Error('Invalid edge: must have data');
        }
        if (!edge.data.id || !edge.data.source || !edge.data.target) {
            throw new Error('Invalid edge: must have id, source, and target');
        }
        
        const lyr = layer ? (layer as Layer) : this.currentLayer;
        const graph = this.graphs[lyr];
        const layerIndexes = this.indexes.getIndexes(lyr);
        
        // Check if edge already exists (using index - O(1))
        if (layerIndexes.hasEdge(edge.data.id)) {
            throw new Error(`Edge with ID '${edge.data.id}' already exists in layer '${lyr}'`);
        }
        
        // Validate that source and target nodes exist (check across all layers for cross-layer edges)
        const allLayers: Layer[] = ['workflow', 'context', 'container', 'component', 'code'];
        let sourceExists = false;
        let targetExists = false;
        
        for (const checkLayer of allLayers) {
            const checkIndexes = this.indexes.getIndexes(checkLayer);
            if (checkIndexes.hasNode(edge.data.source)) {
                sourceExists = true;
            }
            if (checkIndexes.hasNode(edge.data.target)) {
                targetExists = true;
            }
            if (sourceExists && targetExists) break;
        }
        
        if (!sourceExists) {
            throw new Error(`Source node '${edge.data.source}' does not exist in any layer`);
        }
        if (!targetExists) {
            throw new Error(`Target node '${edge.data.target}' does not exist in any layer`);
        }
        
        graph.edges.push(edge);
        layerIndexes.indexEdge(edge); // Index the new edge
        this.syncToSharedState();
        
        console.error(`[GraphStateManager] Added edge '${edge.data.id}' (${edge.data.source} -> ${edge.data.target}) to layer '${lyr}'`);
    }

    public removeEdge(edgeId: string, layer?: Layer | string): void {
        const lyr = layer ? (layer as Layer) : this.currentLayer;
        const graph = this.graphs[lyr];
        const layerIndexes = this.indexes.getIndexes(lyr);
        
        const initialLength = graph.edges.length;
        graph.edges = graph.edges.filter(e => e.data.id !== edgeId);
        
        if (graph.edges.length === initialLength) {
            throw new Error(`Edge with ID '${edgeId}' not found`);
        }
        
        // Remove from indexes
        layerIndexes.removeEdge(edgeId);
        
        this.syncToSharedState();
    }

    public updateEdge(edgeId: string, updates: Partial<GraphEdge['data']>, layer?: Layer | string): void {
        // Validate inputs
        if (!edgeId || typeof edgeId !== 'string') {
            throw new Error('Edge ID must be a non-empty string');
        }
        
        if (!updates || typeof updates !== 'object') {
            throw new Error('Updates must be an object');
        }
        
        const lyr = layer ? (layer as Layer) : this.currentLayer;
        const graph = this.graphs[lyr];
        const layerIndexes = this.indexes.getIndexes(lyr);
        
        // Use index for O(1) lookup
        const edge = layerIndexes.getEdgeById(edgeId);
        if (!edge) {
            throw new Error(`Edge with ID '${edgeId}' not found in layer '${lyr}' (total edges: ${graph.edges.length})`);
        }
        
        // Apply updates
        Object.assign(edge.data, updates);
        
        // Update indexes
        layerIndexes.updateEdge(edgeId, edge);
        
        this.syncToSharedState();
        
        console.error(`[GraphStateManager] Updated edge '${edgeId}' in layer '${lyr}' with ${Object.keys(updates).length} properties`);
    }

    // ============================================================================
    // PROPOSED CHANGES
    // ============================================================================

    public addProposedChange(nodeId: string, change: Partial<ProposedChange>, layer?: Layer | string): void {
        const lyr = layer ? (layer as Layer) : this.currentLayer;
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

    public listProposedChanges(layer?: Layer | string): ProposedChange[] {
        const lyr = layer ? (layer as Layer) : this.currentLayer;
        return Array.from(this.proposedChangesByLayer[lyr].values());
    }

    public clearProposedChange(nodeId: string, layer?: Layer | string): void {
        const lyr = layer ? (layer as Layer) : this.currentLayer;
        if (!this.proposedChangesByLayer[lyr].has(nodeId)) {
            throw new Error(`No proposed change found for node '${nodeId}'`);
        }
        this.proposedChangesByLayer[lyr].delete(nodeId);
        this.syncToSharedState();
    }

    public applyProposedChanges(layer?: Layer | string): { appliedCount: number; notFoundCount: number } {
        const lyr = layer ? (layer as Layer) : this.currentLayer;
        const graph = this.graphs[lyr];
        const proposals = this.proposedChangesByLayer[lyr];
        
        let appliedCount = 0;
        let notFoundCount = 0;

        for (const [nodeId, change] of proposals.entries()) {
            const node = graph.nodes.find(n => n.data.id === nodeId);
            
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

            appliedCount++;
        }

        // Clear proposals after application
        this.proposedChangesByLayer[lyr].clear();
        this.syncToSharedState();

        return { appliedCount, notFoundCount };
    }

    // ============================================================================
    // LAYER MANAGEMENT
    // ============================================================================

    public setCurrentLayer(layer: Layer): void {
        this.currentLayer = layer;
        this.syncToSharedState();
    }

    public getCurrentLayer(): Layer {
        return this.currentLayer;
    }

    // ============================================================================
    // AGENT-ONLY MODE
    // ============================================================================

    public setAgentOnlyMode(enabled: boolean): void {
        this.agentOnlyMode = enabled;
        this.syncToSharedState();
    }

    public getAgentOnlyMode(): boolean {
        return this.agentOnlyMode;
    }

    private filterAgentOnlyGraph(graphData: GraphData): GraphData {
        if (!this.agentOnlyMode) {
            return graphData;
        }

        const agentNodes = graphData.nodes.filter(node => node.data.isAgentAdded === true);
        const agentNodeIds = new Set(agentNodes.map(n => n.data.id));

        const agentEdges = graphData.edges.filter(
            edge => agentNodeIds.has(edge.data.source) && agentNodeIds.has(edge.data.target)
        );

        return {
            nodes: agentNodes,
            edges: agentEdges
        };
    }

    // ============================================================================
    // INDEX ACCESS (NEW)
    // ============================================================================

    /**
     * Get indexes for a specific layer
     */
    public getIndexes(layer?: Layer | string) {
        const lyr = layer ? (layer as Layer) : this.currentLayer;
        return this.indexes.getIndexes(lyr);
    }

    /**
     * Get all layer indexes
     */
    public getAllIndexes() {
        return this.indexes;
    }

    // ============================================================================
    // UTILITY
    // ============================================================================

    public generateNodeId(label: string): string {
        return `node-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
    }

    public generateEdgeId(sourceId: string, targetId: string): string {
        return `edge-${sourceId}-${targetId}-${Date.now()}`;
    }

    // ============================================================================
    // SEMANTIC CLUSTERING (LLM-based)
    // ============================================================================

    public saveSemanticClustering(clusteringResult: any, layer?: Layer | string): void {
        const lyr = layer ? (layer as Layer) : this.currentLayer;
        this.semanticClusteringByLayer[lyr] = clusteringResult;
        this.syncToSharedState();
    }

    public getSemanticClustering(layer?: Layer | string): any {
        const lyr = layer ? (layer as Layer) : this.currentLayer;
        return this.semanticClusteringByLayer[lyr] || null;
    }

    public clearSemanticClustering(layer?: Layer | string): void {
        const lyr = layer ? (layer as Layer) : this.currentLayer;
        this.semanticClusteringByLayer[lyr] = null;
        this.syncToSharedState();
    }
}

