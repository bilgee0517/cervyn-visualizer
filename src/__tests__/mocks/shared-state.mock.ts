/**
 * Mock shared state utilities for testing
 */

import { SharedGraphState } from '../../config/shared-state-config';

// Type for layer names
type GraphLayer = 'workflow' | 'context' | 'container' | 'component' | 'code';

/**
 * Create a mock empty shared state
 */
export function createMockEmptyState(version: number = 1): SharedGraphState {
    return {
        version,
        timestamp: Date.now(),
        source: 'vscode-extension',
        schemaVersion: 3,
        currentLayer: 'code',
        agentOnlyMode: false,
        graphs: {
            workflow: { nodes: [], edges: [] },
            context: { nodes: [], edges: [] },
            container: { nodes: [], edges: [] },
            component: { nodes: [], edges: [] },
            code: { nodes: [], edges: [] }
        },
        proposedChanges: {
            workflow: [],
            context: [],
            container: [],
            component: [],
            code: []
        },
        deletedNodes: {
            workflow: [],
            context: [],
            container: [],
            component: [],
            code: []
        },
        nodeHistory: {
            workflow: {},
            context: {},
            container: {},
            component: {},
            code: {}
        }
    };
}

/**
 * Create a mock state with sample nodes
 */
export function createMockStateWithNodes(options: {
    version?: number;
    layer?: GraphLayer;
    nodeCount?: number;
    source?: string;
} = {}): SharedGraphState {
    const {
        version = 1,
        layer = 'code',
        nodeCount = 3,
        source = 'vscode-extension'
    } = options;

    const state = createMockEmptyState(version);
    state.source = (source === 'mcp-server' || source === 'vscode-extension') ? source : 'vscode-extension';

    // Add sample nodes to specified layer
    for (let i = 0; i < nodeCount; i++) {
        const layerGraph = state.graphs[layer];
        if (layerGraph) {
            layerGraph.nodes.push({
                id: `node-${i}`,
                label: `Node ${i}`,
                type: layer === 'code' ? 'file' : 'feature',
                layer,
                path: `/test/path-${i}`,
                metrics: {},
                hierarchy: { level: 0 },
                modified: Date.now()
            });
        }
    }

    // Add sample edges
    if (nodeCount > 1) {
        const layerGraph = state.graphs[layer];
        if (layerGraph) {
            layerGraph.edges.push({
                id: 'edge-0-1',
                source: 'node-0',
                target: 'node-1',
                type: 'calls',
                layer
            });
        }
    }

    return state;
}

/**
 * Create a mock state with property conflicts
 */
export function createMockConflictingStates(): {
    base: SharedGraphState;
    local: SharedGraphState;
    remote: SharedGraphState;
} {
    const base = createMockStateWithNodes({ version: 1, source: 'base' });

    // Local state: extension modified some properties
    const local = JSON.parse(JSON.stringify(base));
    local.version = 2;
    local.source = 'vscode-extension';
    local.timestamp = Date.now() + 1000;
    local.graphs.code.nodes[0].label = 'Modified Locally';
    local.graphs.code.nodes[0].metrics = { lines: 100 };

    // Remote state: MCP modified different properties
    const remote = JSON.parse(JSON.stringify(base));
    remote.version = 2;
    remote.source = 'mcp-server';
    remote.timestamp = Date.now() + 2000;
    local.graphs.code.nodes[0].roleDescription = 'Added by MCP';
    remote.graphs.code.nodes[0].technology = 'TypeScript';

    // Add conflict: both modified the same shared property
    local.graphs.code.nodes[0].shape = 'rectangle';
    remote.graphs.code.nodes[0].shape = 'ellipse';

    return { base, local, remote };
}

/**
 * Create a mock state with agent-added nodes
 */
export function createMockStateWithAgentNodes(): SharedGraphState {
    const state = createMockStateWithNodes({ nodeCount: 5 });

    // Mark some nodes as agent-added (metadata property doesn't exist in schema)
    // TODO: Add metadata tracking if needed in SharedGraphState interface
    // state.metadata.agentAddedNodeIds = ['node-3', 'node-4'];

    // Add agent-specific properties to those nodes
    const agentNode1 = state.graphs.code.nodes.find(n => n.id === 'node-3');
    if (agentNode1) {
        agentNode1.roleDescription = 'Agent-added description';
        agentNode1.technology = 'Python';
    }

    const agentNode2 = state.graphs.code.nodes.find(n => n.id === 'node-4');
    if (agentNode2) {
        agentNode2.roleDescription = 'Another agent node';
    }

    return state;
}

/**
 * Create a corrupted state (invalid JSON structure)
 */
export function createCorruptedStateJSON(): string {
    return '{ "version": 1, "graphs": { "code": { "nodes": [ invalid json }';
}

/**
 * Create a state with missing required fields
 */
export function createInvalidStateStructure(): any {
    return {
        version: 1,
        // Missing graphs field
        timestamp: Date.now(),
        source: 'test'
    };
}

/**
 * Create a state with old schema version
 */
export function createOldSchemaState(schemaVersion: number = 0): any {
    return {
        version: 1,
        timestamp: Date.now(),
        source: 'test',
        schemaVersion,
        graphs: {
            workflow: { nodes: [], edges: [] },
            context: { nodes: [], edges: [] },
            container: { nodes: [], edges: [] },
            component: { nodes: [], edges: [] },
            code: { nodes: [], edges: [] }
        }
        // Missing metadata, deletedNodes, history (added in later schema versions)
    };
}

/**
 * Create a large state for performance testing
 */
export function createLargeState(nodeCount: number = 500): SharedGraphState {
    const state = createMockEmptyState();

    // Add many nodes
    for (let i = 0; i < nodeCount; i++) {
        state.graphs.code.nodes.push({
            id: `node-${i}`,
            label: `Node ${i}`,
            type: i % 4 === 0 ? 'directory' : i % 4 === 1 ? 'file' : i % 4 === 2 ? 'class' : 'function',
            layer: 'code',
            path: `/test/path-${i}`,
            metrics: {
                lines: Math.floor(Math.random() * 1000),
                complexity: Math.floor(Math.random() * 20)
            },
            hierarchy: {
                level: Math.floor(i / 100),
                parent: i > 0 ? `node-${Math.floor(i / 10) * 10}` : undefined
            },
            modified: Date.now()
        });
    }

    // Add edges
    for (let i = 0; i < nodeCount - 1; i += 10) {
        state.graphs.code.edges.push({
            id: `edge-${i}`,
            source: `node-${i}`,
            target: `node-${i + 1}`,
            type: 'calls',
            layer: 'code'
        });
    }

    return state;
}

/**
 * Wait for a condition to be true (test utility)
 */
export function waitFor(
    condition: () => boolean,
    timeout: number = 1000,
    interval: number = 10
): Promise<void> {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const check = () => {
            if (condition()) {
                resolve();
            } else if (Date.now() - startTime > timeout) {
                reject(new Error(`Timeout waiting for condition after ${timeout}ms`));
            } else {
                setTimeout(check, interval);
            }
        };

        check();
    });
}

/**
 * Sleep for a specified duration (test utility)
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
