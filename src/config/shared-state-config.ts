/**
 * Shared State Configuration
 * 
 * Defines the location and schema for shared state between MCP server and VS Code extension.
 * This enables real-time synchronization when AI agents modify the graph.
 */

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { log } from '../logger';

/**
 * Get the current workspace path
 */
export function getWorkspacePath(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return undefined;
    }
    return workspaceFolders[0].uri.fsPath;
}

/**
 * Get the shared state directory (cross-platform)
 * Stored in workspace's .codebase-visualizer directory for easy access
 * Falls back to home directory if no workspace is available
 */
export function getSharedStateDir(workspacePath?: string): string {
    // If workspace path provided, store in workspace/.codebase-visualizer
    if (workspacePath) {
        return path.join(workspacePath, '.codebase-visualizer');
    }
    
    // Fallback to home directory if no workspace
    const homeDir = os.homedir();
    return path.join(homeDir, '.codebase-visualizer');
}

/**
 * Get the shared state file path
 */
export function getSharedStateFile(workspacePath?: string): string {
    return path.join(getSharedStateDir(workspacePath), 'graph-state.json');
}

/**
 * Get the state lock file path (for preventing race conditions)
 */
export function getStateLockFile(workspacePath?: string): string {
    return path.join(getSharedStateDir(workspacePath), 'graph-state.lock');
}

/**
 * Get the state backup directory path
 */
export function getStateBackupDir(workspacePath?: string): string {
    return path.join(getSharedStateDir(workspacePath), 'backups');
}

/**
 * Current schema version for state file migrations
 * Increment this when making breaking changes to SharedGraphState structure
 * 
 * Version History:
 * - v1: Initial schema with blueprint/architecture/implementation/dependencies layers
 * - v2: Migrated to C4 Model layers (context/container/component/code)
 * - v3: Added workflow layer for feature tracking (workflow/context/container/component/code)
 */
export const SCHEMA_VERSION = 3;

/**
 * Shared state file schema
 */
export interface SharedGraphState {
    schemaVersion: number; // Schema version for migrations (incremented on breaking changes)
    version: number; // Incremented on every write for conflict detection
    timestamp: number; // Unix timestamp of last update
    source: 'mcp-server' | 'vscode-extension'; // Who made the last update
    currentLayer: 'workflow' | 'context' | 'container' | 'component' | 'code'; // 5-layer system
    agentOnlyMode: boolean;
    
    // Graph data per layer (5-layer system)
    graphs: {
        workflow: {
            nodes: any[];
            edges: any[];
        };
        context: {
            nodes: any[];
            edges: any[];
        };
        container: {
            nodes: any[];
            edges: any[];
        };
        component: {
            nodes: any[];
            edges: any[];
        };
        code: {
            nodes: any[];
            edges: any[];
        };
    };
    
    // Proposed changes per layer
    proposedChanges: {
        workflow: Array<{
            nodeId: string;
            name?: string;
            summary?: string;
            intention?: string;
            additionalInfo?: string;
            timestamp?: number;
        }>;
        context: Array<{
            nodeId: string;
            name?: string;
            summary?: string;
            intention?: string;
            additionalInfo?: string;
            timestamp?: number;
        }>;
        container: Array<{
            nodeId: string;
            name?: string;
            summary?: string;
            intention?: string;
            additionalInfo?: string;
            timestamp?: number;
        }>;
        component: Array<{
            nodeId: string;
            name?: string;
            summary?: string;
            intention?: string;
            additionalInfo?: string;
            timestamp?: number;
        }>;
        code: Array<{
            nodeId: string;
            name?: string;
            summary?: string;
            intention?: string;
            additionalInfo?: string;
            timestamp?: number;
        }>;
    };
    
    // Node history per layer (tracks changes over time)
    nodeHistory?: {
        workflow: Record<string, Array<{
            timestamp: number;
            action: 'added' | 'changed' | 'removed' | 'deleted' | 'edge-added' | 'edge-changed' | 'edge-removed';
            details?: string;
        }>>;
        context: Record<string, Array<{
            timestamp: number;
            action: 'added' | 'changed' | 'removed' | 'deleted' | 'edge-added' | 'edge-changed' | 'edge-removed';
            details?: string;
        }>>;
        container: Record<string, Array<{
            timestamp: number;
            action: 'added' | 'changed' | 'removed' | 'deleted' | 'edge-added' | 'edge-changed' | 'edge-removed';
            details?: string;
        }>>;
        component: Record<string, Array<{
            timestamp: number;
            action: 'added' | 'changed' | 'removed' | 'deleted' | 'edge-added' | 'edge-changed' | 'edge-removed';
            details?: string;
        }>>;
        code: Record<string, Array<{
            timestamp: number;
            action: 'added' | 'changed' | 'removed' | 'deleted' | 'edge-added' | 'edge-changed' | 'edge-removed';
            details?: string;
        }>>;
    };
    
    // Deleted node IDs per layer
    deletedNodes?: {
        workflow: string[];
        context: string[];
        container: string[];
        component: string[];
        code: string[];
    };
}

/**
 * Create an empty shared state
 */
export function createEmptySharedState(): SharedGraphState {
    return {
        schemaVersion: SCHEMA_VERSION,
        version: 1,
        timestamp: Date.now(),
        source: 'vscode-extension',
        currentLayer: 'code', // 5-layer system: code layer is the main auto-populated layer
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
        nodeHistory: {
            workflow: {},
            context: {},
            container: {},
            component: {},
            code: {}
        },
        deletedNodes: {
            workflow: [],
            context: [],
            container: [],
            component: [],
            code: []
        }
    };
}

/**
 * Migrate state from old schema version to current version
 * @param state The state to migrate
 * @returns Migrated state with current schema version
 */
export function migrateStateSchema(state: any): SharedGraphState {
    const fromVersion = state.schemaVersion || 0;
    
    if (fromVersion === SCHEMA_VERSION) {
        return state as SharedGraphState; // Already at current version
    }
    
    log(`[Schema Migration] Migrating state from schema v${fromVersion} to v${SCHEMA_VERSION}`);
    
    // Migration chain - apply migrations sequentially
    let migratedState = { ...state };
    
    // Migration from v0 (no schemaVersion) to v1
    if (fromVersion < 1) {
        migratedState = migrateV0ToV1(migratedState);
    }
    
    // Migration from v1 to v2 (C4 Model layer names)
    if (fromVersion < 2) {
        migratedState = migrateV1ToV2(migratedState);
    }
    
    // Migration from v2 to v3 (Add workflow layer)
    if (fromVersion < 3) {
        migratedState = migrateV2ToV3(migratedState);
    }
    
    migratedState.schemaVersion = SCHEMA_VERSION;
    log(`[Schema Migration] ✓ Migration complete: v${fromVersion} -> v${SCHEMA_VERSION}`);
    
    return migratedState as SharedGraphState;
}

/**
 * Migrate from v0 (no schemaVersion field) to v1
 * v1 adds: schemaVersion field, ensures all required fields exist
 */
function migrateV0ToV1(state: any): any {
    const migrated = { ...state };
    
    // Add schemaVersion field
    migrated.schemaVersion = 1;
    
    // Ensure all required fields exist with defaults (using old layer names, will be migrated in v1->v2)
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
    
    if (!migrated.agentOnlyMode) {
        migrated.agentOnlyMode = false;
    }
    
    log(`[Schema Migration] ✓ Migrated v0 -> v1: added schemaVersion and missing fields`);
    
    return migrated;
}

/**
 * Migrate from v1 to v2: Rename layers to C4 Model naming
 * v1: blueprint, architecture, implementation, dependencies
 * v2: context, container, component, code
 */
function migrateV1ToV2(state: any): any {
    const migrated = { ...state };
    
    // Layer name mapping: old -> new (C4 Model)
    const layerMap: Record<string, string> = {
        'blueprint': 'context',
        'architecture': 'container',
        'implementation': 'code',  // Main layer: detailed code structure
        'dependencies': 'component'
    };
    
    // Migrate currentLayer
    if (migrated.currentLayer && layerMap[migrated.currentLayer]) {
        migrated.currentLayer = layerMap[migrated.currentLayer];
    }
    
    // Migrate graphs object keys
    if (migrated.graphs) {
        const newGraphs: any = {};
        for (const [oldKey, value] of Object.entries(migrated.graphs)) {
            const newKey = layerMap[oldKey] || oldKey;
            newGraphs[newKey] = value;
        }
        migrated.graphs = newGraphs;
    }
    
    // Migrate proposedChanges object keys
    if (migrated.proposedChanges) {
        const newProposedChanges: any = {};
        for (const [oldKey, value] of Object.entries(migrated.proposedChanges)) {
            const newKey = layerMap[oldKey] || oldKey;
            newProposedChanges[newKey] = value;
        }
        migrated.proposedChanges = newProposedChanges;
    }
    
    // Migrate nodeHistory object keys
    if (migrated.nodeHistory) {
        const newNodeHistory: any = {};
        for (const [oldKey, value] of Object.entries(migrated.nodeHistory)) {
            const newKey = layerMap[oldKey] || oldKey;
            newNodeHistory[newKey] = value;
        }
        migrated.nodeHistory = newNodeHistory;
    }
    
    // Migrate deletedNodes object keys
    if (migrated.deletedNodes) {
        const newDeletedNodes: any = {};
        for (const [oldKey, value] of Object.entries(migrated.deletedNodes)) {
            const newKey = layerMap[oldKey] || oldKey;
            newDeletedNodes[newKey] = value;
        }
        migrated.deletedNodes = newDeletedNodes;
    }
    
    log(`[Schema Migration] ✓ Migrated v1 -> v2: renamed layers to C4 Model (blueprint→context, architecture→container, implementation→code, dependencies→component)`);
    
    return migrated;
}

/**
 * Migrate from v2 to v3: Add workflow layer
 * v2: context, container, component, code (4 layers)
 * v3: workflow, context, container, component, code (5 layers)
 */
function migrateV2ToV3(state: any): any {
    const migrated = { ...state };
    
    // Add workflow layer to graphs
    if (migrated.graphs) {
        migrated.graphs.workflow = { nodes: [], edges: [] };
    }
    
    // Add workflow layer to proposedChanges
    if (migrated.proposedChanges) {
        migrated.proposedChanges.workflow = [];
    }
    
    // Add workflow layer to nodeHistory
    if (migrated.nodeHistory) {
        migrated.nodeHistory.workflow = {};
    }
    
    // Add workflow layer to deletedNodes
    if (migrated.deletedNodes) {
        migrated.deletedNodes.workflow = [];
    }
    
    log(`[Schema Migration] ✓ Migrated v2 -> v3: added workflow layer for feature tracking`);
    
    return migrated;
}

// ============================================================================
// PROPERTY OWNERSHIP BOUNDARIES
// Defines which properties are owned by Extension vs MCP Server
// ============================================================================

/**
 * Properties owned by the VS Code Extension (derived from code analysis)
 * These represent the actual codebase structure and should NOT be modified by MCP
 */
export const EXTENSION_OWNED_PROPERTIES = [
    // Core identity
    'id',
    'label',
    'type',
    'path',
    'fileExtension',
    'language',
    
    // Hierarchy
    'parent',
    'isCompound',
    'groupType',
    'childCount',
    'children',
    'childNodes',
    
    // Code metrics (from analysis)
    'linesOfCode',
    'complexity',
    'testCoverage',
    'daysSinceLastChange',
    'layer',
    
    // Visual properties (calculated from code structure)
    'sizeMultiplier',
    'revealThreshold',
    
    // Categories (from code analysis)
    'category',
    'isEntryPoint',
    
    // Content hashing
    'chunkHash',
    'merkleRoot'
] as const;

/**
 * Properties owned by the MCP Server (AI agent enrichments)
 * These represent metadata and annotations that don't affect code structure
 */
export const MCP_OWNED_PROPERTIES = [
    // AI enrichments
    'roleDescription',
    'technology',
    'progressStatus',
    
    // Change tracking (from AI agents)
    'changeName',
    'changeSummary',
    'changeIntention',
    'changeAdditionalInfo',
    
    // Agent tracking
    'isAgentAdded',
    
    // Clustering (AI-based)
    'clusterId',
    'clusterColor'
] as const;

/**
 * Shared properties that can be modified by either system
 * Use with caution - prefer clear ownership
 */
export const SHARED_PROPERTIES = [
    'shape',
    'modified',
    'isCollapsed'
] as const;

// Type exports for TypeScript safety
export type ExtensionOwnedProperty = typeof EXTENSION_OWNED_PROPERTIES[number];
export type McpOwnedProperty = typeof MCP_OWNED_PROPERTIES[number];
export type SharedProperty = typeof SHARED_PROPERTIES[number];

/**
 * Check if a property is owned by the Extension
 */
export function isExtensionProperty(key: string): key is ExtensionOwnedProperty {
    return (EXTENSION_OWNED_PROPERTIES as readonly string[]).includes(key);
}

/**
 * Check if a property is owned by the MCP Server
 */
export function isMcpProperty(key: string): key is McpOwnedProperty {
    return (MCP_OWNED_PROPERTIES as readonly string[]).includes(key);
}

/**
 * Check if a property is shared between both systems
 */
export function isSharedProperty(key: string): key is SharedProperty {
    return (SHARED_PROPERTIES as readonly string[]).includes(key);
}

/**
 * Get the owner of a property
 * @returns 'extension' | 'mcp' | 'shared' | 'unknown'
 */
export function getPropertyOwner(key: string): 'extension' | 'mcp' | 'shared' | 'unknown' {
    if (isExtensionProperty(key)) return 'extension';
    if (isMcpProperty(key)) return 'mcp';
    if (isSharedProperty(key)) return 'shared';
    return 'unknown';
}


