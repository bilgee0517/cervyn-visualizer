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
        }
    };
}


