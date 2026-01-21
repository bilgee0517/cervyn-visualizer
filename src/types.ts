export interface GraphNode {
    data: {
        id: string;
        label: string;
        type?: string; // Flexible type to support all layer node types (file, directory, class, function, feature, service, etc.)
        path?: string;
        category?: string;
        isEntryPoint?: boolean;
        fileExtension?: string;
        roleDescription?: string;
        technology?: string; // Technology/framework used (e.g., "React", "Express")
        progressStatus?: 'done' | 'in-progress' | 'not-started' | 'error';
        shape?: string;
        modified?: boolean;
        language?: string;
        // Compound node properties
        parent?: string; // ID of parent node for hierarchical nesting
        isCompound?: boolean; // True if this node contains other nodes
        isCollapsed?: boolean; // Track expansion state
        groupType?: 'folder' | 'logical' | 'namespace' | 'file'; // Type of grouping
        childCount?: number; // Number of direct children (for collapsed nodes)
        children?: string[]; // IDs of child nodes
        childNodes?: string[]; // IDs of child nodes (for clusters)
        // Visual representation properties
        sizeMultiplier?: number; // Size scaling factor (8.0 for directories, 2.5 for files, 1.5 for classes, 1.0 for functions)
        revealThreshold?: number; // Deprecated (was used for fractal zoom)
        // AI Agent properties
        isAgentAdded?: boolean; // True if node was added by an AI agent
        // Proposed change metadata (from AI agents or manual edits)
        changeName?: string; // Name/title of the proposed change
        changeSummary?: string; // Summary of what changed
        changeIntention?: string; // Why this change was made
        changeAdditionalInfo?: string; // Additional context/notes
        // Content hashing (for change detection)
        chunkHash?: string; // Hash of this node's content (if a chunk)
        merkleRoot?: string; // Merkle root of children (if a file/container)
        // Code metrics
        linesOfCode?: number;
        complexity?: number; // Cyclomatic complexity
        testCoverage?: number; // 0-100
        daysSinceLastChange?: number;
        layer?: string; // Architectural layer detection: 'frontend' | 'backend' | 'database' | 'utility' (NOT C4 visualization layer)
        // Clustering metadata
        clusterId?: number;
        clusterColor?: string;
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
        edgeType?: 'imports' | 'calls' | 'extends' | 'implements' | 'depends-on' | 'uses' | 
                   'depends-on-feature' | 'part-of' | 'primary-flow' | 'alternate-flow' | 'triggers' |
                   'authenticates-with' | 'sends-data-to' | 'receives-data-from' |
                   'publishes-to' | 'subscribes-to' | 'synchronizes-with' |
                   // Container layer runtime semantics
                   'http-request' | 'rpc-call' | 'db-query' | 'cache-read' | 'cache-write' |
                   'publish-event' | 'consume-event' | 'enqueue-job' | 'replicates-to' | 'syncs-with';
        description?: string; // Description of what this edge/relationship represents
    };
}

export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

// 5-Layer Visualization System
// Combines workflow layer (features) with C4 model (architecture)
// 
// LAYER GUIDE (from high-level → detailed):
// - workflow: User-facing features and capabilities (NEW)
// - context: Level 1 - External systems and boundaries (C4 model)
// - container: Level 2 - Applications and services (C4 model)
// - component: Level 3 - Modules and packages (C4 model)
// - code: Level 4 - Classes, functions, methods (FULLY AUTO-POPULATED) ✅
//
// Currently ONLY the Code layer is auto-populated with your deep code analysis
export type Layer = 'workflow' | 'context' | 'container' | 'component' | 'code';

export type LayoutType = 'fcose' | 'dagre' | 'concentric' | 'grid' | 'cose' | 'circle' | 'organic' | 'swimlane';

// Proposed change payload stored in-memory prior to application
export interface ProposedChange {
    name?: string; // Name/title of the change
    summary?: string; // What changed
    intention?: string; // Why this change was made
    additionalInfo?: string; // Additional context
    nodeId?: string; // Node ID this change applies to
    filePath?: string; // File path (alternative identifier)
    timestamp?: number; // When this change was proposed
}

// Node history event for tracking changes over time
export interface NodeHistoryEvent {
    timestamp: number;
    action: 'added' | 'changed' | 'removed' | 'deleted' | 'edge-added' | 'edge-changed' | 'edge-removed';
    details?: string; // Human-readable description
}

// Options for knowledge graph generation
export interface KnowledgeGraphOptions {
    layout?: LayoutType;
    currentDirectory?: string;
    agentOnly?: boolean; // Filter to show only agent-added nodes
    layer?: Layer;
}

