/**
 * Shared State Configuration
 * 
 * Defines the location and schema for shared state between MCP server and VS Code extension.
 * This enables real-time synchronization when AI agents modify the graph.
 */

import * as os from 'os';
import * as path from 'path';

/**
 * Get the shared state directory (cross-platform)
 * Stored in user's home directory for accessibility by both MCP server and extension
 */
export function getSharedStateDir(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.codebase-visualizer');
}

/**
 * Get the shared state file path
 */
export function getSharedStateFile(): string {
    return path.join(getSharedStateDir(), 'graph-state.json');
}

/**
 * Get the state lock file path (for preventing race conditions)
 */
export function getStateLockFile(): string {
    return path.join(getSharedStateDir(), 'graph-state.lock');
}

/**
 * Shared state file schema
 */
export interface SharedGraphState {
    version: number; // Incremented on every write for conflict detection
    timestamp: number; // Unix timestamp of last update
    source: 'mcp-server' | 'vscode-extension'; // Who made the last update
    currentLayer: 'blueprint' | 'architecture' | 'implementation' | 'dependencies';
    agentOnlyMode: boolean;
    
    // Graph data per layer
    graphs: {
        blueprint: {
            nodes: any[];
            edges: any[];
        };
        architecture: {
            nodes: any[];
            edges: any[];
        };
        implementation: {
            nodes: any[];
            edges: any[];
        };
        dependencies: {
            nodes: any[];
            edges: any[];
        };
    };
    
    // Proposed changes per layer
    proposedChanges: {
        blueprint: Array<{
            nodeId: string;
            name?: string;
            summary?: string;
            intention?: string;
            additionalInfo?: string;
            timestamp?: number;
        }>;
        architecture: Array<{
            nodeId: string;
            name?: string;
            summary?: string;
            intention?: string;
            additionalInfo?: string;
            timestamp?: number;
        }>;
        implementation: Array<{
            nodeId: string;
            name?: string;
            summary?: string;
            intention?: string;
            additionalInfo?: string;
            timestamp?: number;
        }>;
        dependencies: Array<{
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
        blueprint: Record<string, Array<{
            timestamp: number;
            action: 'added' | 'changed' | 'removed' | 'edge-added' | 'edge-changed' | 'edge-removed';
            details?: string;
        }>>;
        architecture: Record<string, Array<{
            timestamp: number;
            action: 'added' | 'changed' | 'removed' | 'edge-added' | 'edge-changed' | 'edge-removed';
            details?: string;
        }>>;
        implementation: Record<string, Array<{
            timestamp: number;
            action: 'added' | 'changed' | 'removed' | 'edge-added' | 'edge-changed' | 'edge-removed';
            details?: string;
        }>>;
        dependencies: Record<string, Array<{
            timestamp: number;
            action: 'added' | 'changed' | 'removed' | 'edge-added' | 'edge-changed' | 'edge-removed';
            details?: string;
        }>>;
    };
    
    // Deleted node IDs per layer
    deletedNodes?: {
        blueprint: string[];
        architecture: string[];
        implementation: string[];
        dependencies: string[];
    };
}

/**
 * Create an empty shared state
 */
export function createEmptySharedState(): SharedGraphState {
    return {
        version: 1,
        timestamp: Date.now(),
        source: 'vscode-extension',
        currentLayer: 'implementation',
        agentOnlyMode: false,
        graphs: {
            blueprint: { nodes: [], edges: [] },
            architecture: { nodes: [], edges: [] },
            implementation: { nodes: [], edges: [] },
            dependencies: { nodes: [], edges: [] }
        },
        proposedChanges: {
            blueprint: [],
            architecture: [],
            implementation: [],
            dependencies: []
        },
        nodeHistory: {
            blueprint: {},
            architecture: {},
            implementation: {},
            dependencies: {}
        },
        deletedNodes: {
            blueprint: [],
            architecture: [],
            implementation: [],
            dependencies: []
        }
    };
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


