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
import * as os from 'os';
import * as lockfile from 'proper-lockfile';

// Schema version for state file migrations
const SCHEMA_VERSION = 1;

// Import property ownership boundaries from shared config
// Note: In production, these should be in a shared package or copied between projects
const EXTENSION_OWNED_PROPERTIES = [
    'id', 'label', 'type', 'path', 'fileExtension', 'language',
    'parent', 'isCompound', 'groupType', 'childCount', 'children', 'childNodes',
    'linesOfCode', 'complexity', 'testCoverage', 'daysSinceLastChange', 'layer',
    'sizeMultiplier', 'revealThreshold', 'category', 'isEntryPoint',
    'chunkHash', 'merkleRoot'
];

export type Layer = 'blueprint' | 'architecture' | 'implementation' | 'dependencies';

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
        groupType?: 'folder' | 'logical' | 'namespace';
        childCount?: number;
        isAgentAdded?: boolean;
        changeName?: string;
        changeSummary?: string;
        changeIntention?: string;
        changeAdditionalInfo?: string;
        chunkHash?: string;
        merkleRoot?: string;
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
        blueprint: { nodes: [], edges: [] },
        architecture: { nodes: [], edges: [] },
        implementation: { nodes: [], edges: [] },
        dependencies: { nodes: [], edges: [] }
    };

    private currentLayer: Layer = 'implementation';
    private agentOnlyMode: boolean = false;

    private proposedChangesByLayer: Record<Layer, Map<string, ProposedChange>> = {
        blueprint: new Map(),
        architecture: new Map(),
        implementation: new Map(),
        dependencies: new Map()
    };

    // Semantic clustering storage (LLM-based)
    private semanticClusteringByLayer: Record<Layer, any> = {
        blueprint: null,
        architecture: null,
        implementation: null,
        dependencies: null
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
        const homeDir = os.homedir();
        return path.join(homeDir, '.codebase-visualizer');
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

                // Apply schema migrations if needed
                const currentSchemaVersion = sharedState.schemaVersion || 0;
                if (currentSchemaVersion < SCHEMA_VERSION) {
                    console.error(`[GraphStateManager] State needs schema migration (current: ${currentSchemaVersion}, target: ${SCHEMA_VERSION})`);
                    sharedState = this.migrateStateSchema(sharedState);
                    
                    // Write migrated state back to file
                    try {
                        const tempFile = stateFile + '.tmp';
                        fs.writeFileSync(tempFile, JSON.stringify(sharedState, null, 2), 'utf-8');
                        fs.renameSync(tempFile, stateFile);
                        console.error(`[GraphStateManager] ✓ Migrated state written to file`);
                    } catch (err) {
                        console.error(`[GraphStateManager] Warning: Failed to write migrated state: ${err instanceof Error ? err.message : String(err)}`);
                        // Continue with in-memory migrated state even if write fails
                    }
                }

                // Load graphs
                if (sharedState.graphs) {
                    this.graphs = sharedState.graphs;
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
                    const layers: Layer[] = ['blueprint', 'architecture', 'implementation', 'dependencies'];
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

    /**
     * Migrate state from old schema version to current version
     */
    private migrateStateSchema(state: any): any {
        const fromVersion = state.schemaVersion || 0;
        
        if (fromVersion === SCHEMA_VERSION) {
            return state; // Already at current version
        }
        
        console.error(`[GraphStateManager] [Schema Migration] Migrating state from schema v${fromVersion} to v${SCHEMA_VERSION}`);
        
        // Migration chain - apply migrations sequentially
        let migratedState = { ...state };
        
        // Migration from v0 (no schemaVersion) to v1
        if (fromVersion < 1) {
            migratedState = this.migrateV0ToV1(migratedState);
        }
        
        // Future migrations would go here
        
        migratedState.schemaVersion = SCHEMA_VERSION;
        console.error(`[GraphStateManager] [Schema Migration] ✓ Migration complete: v${fromVersion} -> v${SCHEMA_VERSION}`);
        
        return migratedState;
    }

    /**
     * Migrate from v0 (no schemaVersion field) to v1
     */
    private migrateV0ToV1(state: any): any {
        const migrated = { ...state };
        
        // Add schemaVersion field
        migrated.schemaVersion = 1;
        
        // Ensure all required fields exist with defaults
        if (!migrated.nodeHistory) {
            migrated.nodeHistory = {
                blueprint: {},
                architecture: {},
                implementation: {},
                dependencies: {}
            };
        }
        
        if (!migrated.deletedNodes) {
            migrated.deletedNodes = {
                blueprint: [],
                architecture: [],
                implementation: [],
                dependencies: []
            };
        }
        
        if (!migrated.proposedChanges) {
            migrated.proposedChanges = {
                blueprint: [],
                architecture: [],
                implementation: [],
                dependencies: []
            };
        }
        
        if (migrated.agentOnlyMode === undefined) {
            migrated.agentOnlyMode = false;
        }
        
        console.error(`[GraphStateManager] [Schema Migration] ✓ Migrated v0 -> v1: added schemaVersion and missing fields`);
        
        return migrated;
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
        const stateFile = this.getSharedStateFile();
        let releaseLock: (() => Promise<void>) | null = null;
        
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
                console.error(`[GraphStateManager] ✓ Lock acquired`);
            } catch (lockErr) {
                console.error(`[GraphStateManager] ⚠️  Failed to acquire lock, proceeding without lock: ${lockErr instanceof Error ? lockErr.message : String(lockErr)}`);
                // Proceed without lock in case of lock acquisition failure
            }
            
            // Read existing state to preserve extension-owned fields
            let existingState: any = null;
            if (fs.existsSync(stateFile)) {
                try {
                    const fileContent = fs.readFileSync(stateFile, 'utf-8');
                    existingState = JSON.parse(fileContent);
                } catch (err) {
                    console.error(`[GraphStateManager] Could not read existing state: ${err instanceof Error ? err.message : String(err)}`);
                    console.error(`[GraphStateManager] Will create new state file`);
                }
            }

            // Convert proposed changes from Map to Array
            const layers: Layer[] = ['blueprint', 'architecture', 'implementation', 'dependencies'];
            const proposedChangesArray: any = {};
            
            for (const layer of layers) {
                proposedChangesArray[layer] = Array.from(this.proposedChangesByLayer[layer].values());
            }

            // Increment version
            this.stateVersion += 1;

            // Preserve extension-owned properties when writing nodes
            const preservedGraphs: any = {};
            for (const layer of layers) {
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
            fs.writeFileSync(tempFile, JSON.stringify(sharedState, null, 2), 'utf-8');
            fs.renameSync(tempFile, stateFile);

            console.error(`[GraphStateManager] Synced state version ${this.stateVersion} (preserved extension properties)`);
            
            // Release lock
            if (releaseLock) {
                await releaseLock();
                console.error(`[GraphStateManager] ✓ Lock released`);
            }
        } catch (err) {
            // Ensure lock is released even on error
            if (releaseLock) {
                try {
                    await releaseLock();
                } catch (releaseErr) {
                    console.error(`[GraphStateManager] ⚠️  Failed to release lock: ${releaseErr instanceof Error ? releaseErr.message : String(releaseErr)}`);
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

    public getGraph(layer?: Layer): GraphData {
        const lyr = layer || this.currentLayer;
        const graphData = this.graphs[lyr];
        return this.filterAgentOnlyGraph(graphData);
    }

    public setGraph(graphData: GraphData, layer?: Layer): void {
        const lyr = layer || this.currentLayer;
        this.graphs[lyr] = graphData;
        this.syncToSharedState();
    }

    public addNode(node: GraphNode, layer?: Layer): void {
        // Validate node structure
        if (!node || !node.data || !node.data.id) {
            throw new Error('Invalid node: must have data.id');
        }
        
        const lyr = layer || this.currentLayer;
        const graph = this.graphs[lyr];
        
        // Check if node already exists
        if (graph.nodes.find(n => n.data.id === node.data.id)) {
            throw new Error(`Node with ID '${node.data.id}' already exists in layer '${lyr}'`);
        }
        
        // Mark as agent-added
        node.data.isAgentAdded = true;
        
        graph.nodes.push(node);
        this.syncToSharedState();
        
        console.error(`[GraphStateManager] Added node '${node.data.id}' to layer '${lyr}'`);
    }

    public removeNode(nodeId: string, layer?: Layer): void {
        const lyr = layer || this.currentLayer;
        const graph = this.graphs[lyr];
        
        const initialLength = graph.nodes.length;
        graph.nodes = graph.nodes.filter(n => n.data.id !== nodeId);
        
        if (graph.nodes.length === initialLength) {
            throw new Error(`Node with ID '${nodeId}' not found`);
        }
        
        // Also remove edges connected to this node
        graph.edges = graph.edges.filter(
            e => e.data.source !== nodeId && e.data.target !== nodeId
        );
        this.syncToSharedState();
    }

    public updateNode(nodeId: string, updates: Partial<GraphNode['data']>, layer?: Layer): void {
        // Validate inputs
        if (!nodeId || typeof nodeId !== 'string') {
            throw new Error('Node ID must be a non-empty string');
        }
        
        if (!updates || typeof updates !== 'object') {
            throw new Error('Updates must be an object');
        }
        
        const lyr = layer || this.currentLayer;
        const graph = this.graphs[lyr];
        
        const node = graph.nodes.find(n => n.data.id === nodeId);
        if (!node) {
            throw new Error(`Node with ID '${nodeId}' not found in layer '${lyr}' (total nodes: ${graph.nodes.length})`);
        }
        
        // Apply updates
        Object.assign(node.data, updates);
        node.data.modified = true;
        this.syncToSharedState();
        
        console.error(`[GraphStateManager] Updated node '${nodeId}' in layer '${lyr}' with ${Object.keys(updates).length} properties`);
    }

    public addEdge(edge: GraphEdge, layer?: Layer): void {
        // Validate edge structure
        if (!edge || !edge.data) {
            throw new Error('Invalid edge: must have data');
        }
        if (!edge.data.id || !edge.data.source || !edge.data.target) {
            throw new Error('Invalid edge: must have id, source, and target');
        }
        
        const lyr = layer || this.currentLayer;
        const graph = this.graphs[lyr];
        
        // Check if edge already exists
        if (graph.edges.find(e => e.data.id === edge.data.id)) {
            throw new Error(`Edge with ID '${edge.data.id}' already exists in layer '${lyr}'`);
        }
        
        // Validate that source and target nodes exist
        const sourceExists = graph.nodes.find(n => n.data.id === edge.data.source);
        const targetExists = graph.nodes.find(n => n.data.id === edge.data.target);
        
        if (!sourceExists) {
            throw new Error(`Source node '${edge.data.source}' does not exist (${graph.nodes.length} nodes in layer '${lyr}')`);
        }
        if (!targetExists) {
            throw new Error(`Target node '${edge.data.target}' does not exist (${graph.nodes.length} nodes in layer '${lyr}')`);
        }
        
        graph.edges.push(edge);
        this.syncToSharedState();
        
        console.error(`[GraphStateManager] Added edge '${edge.data.id}' (${edge.data.source} -> ${edge.data.target}) to layer '${lyr}'`);
    }

    public removeEdge(edgeId: string, layer?: Layer): void {
        const lyr = layer || this.currentLayer;
        const graph = this.graphs[lyr];
        
        const initialLength = graph.edges.length;
        graph.edges = graph.edges.filter(e => e.data.id !== edgeId);
        
        if (graph.edges.length === initialLength) {
            throw new Error(`Edge with ID '${edgeId}' not found`);
        }
        this.syncToSharedState();
    }

    public updateEdge(edgeId: string, updates: Partial<GraphEdge['data']>, layer?: Layer): void {
        // Validate inputs
        if (!edgeId || typeof edgeId !== 'string') {
            throw new Error('Edge ID must be a non-empty string');
        }
        
        if (!updates || typeof updates !== 'object') {
            throw new Error('Updates must be an object');
        }
        
        const lyr = layer || this.currentLayer;
        const graph = this.graphs[lyr];
        
        const edge = graph.edges.find(e => e.data.id === edgeId);
        if (!edge) {
            throw new Error(`Edge with ID '${edgeId}' not found in layer '${lyr}' (total edges: ${graph.edges.length})`);
        }
        
        // Apply updates
        Object.assign(edge.data, updates);
        this.syncToSharedState();
        
        console.error(`[GraphStateManager] Updated edge '${edgeId}' in layer '${lyr}' with ${Object.keys(updates).length} properties`);
    }

    // ============================================================================
    // PROPOSED CHANGES
    // ============================================================================

    public addProposedChange(nodeId: string, change: Partial<ProposedChange>, layer?: Layer): void {
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

    public listProposedChanges(layer?: Layer): ProposedChange[] {
        const lyr = layer || this.currentLayer;
        return Array.from(this.proposedChangesByLayer[lyr].values());
    }

    public clearProposedChange(nodeId: string, layer?: Layer): void {
        const lyr = layer || this.currentLayer;
        if (!this.proposedChangesByLayer[lyr].has(nodeId)) {
            throw new Error(`No proposed change found for node '${nodeId}'`);
        }
        this.proposedChangesByLayer[lyr].delete(nodeId);
        this.syncToSharedState();
    }

    public applyProposedChanges(layer?: Layer): { appliedCount: number; notFoundCount: number } {
        const lyr = layer || this.currentLayer;
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

    public saveSemanticClustering(clusteringResult: any, layer?: Layer): void {
        const lyr = layer || this.currentLayer;
        this.semanticClusteringByLayer[lyr] = clusteringResult;
        this.syncToSharedState();
    }

    public getSemanticClustering(layer?: Layer): any {
        const lyr = layer || this.currentLayer;
        return this.semanticClusteringByLayer[lyr] || null;
    }

    public clearSemanticClustering(layer?: Layer): void {
        const lyr = layer || this.currentLayer;
        this.semanticClusteringByLayer[lyr] = null;
        this.syncToSharedState();
    }
}

