/**
 * Test helper utilities
 */

import { GraphNode, GraphEdge } from '../../types';

/**
 * Create a mock graph node
 */
export function createMockNode(overrides: Partial<GraphNode['data']> = {}): GraphNode {
    const defaults: GraphNode['data'] = {
        id: `node-${Math.random().toString(36).substring(7)}`,
        label: 'Test Node',
        type: 'file',
        path: '/test/path',
        modified: false
    };

    return {
        data: { ...defaults, ...overrides }
    };
}

/**
 * Create a mock graph edge
 */
export function createMockEdge(overrides: Partial<GraphEdge['data']> = {}): GraphEdge {
    const defaults: GraphEdge['data'] = {
        id: `edge-${Math.random().toString(36).substring(7)}`,
        source: 'node-source',
        target: 'node-target',
        edgeType: 'calls'
    };

    return {
        data: { ...defaults, ...overrides }
    };
}

/**
 * Create multiple mock nodes
 */
export function createMockNodes(count: number, overrides: Partial<GraphNode['data']> = {}): GraphNode[] {
    return Array.from({ length: count }, (_, i) =>
        createMockNode({
            id: `node-${i}`,
            label: `Node ${i}`,
            ...overrides
        })
    );
}

/**
 * Create multiple mock edges
 */
export function createMockEdges(count: number, overrides: Partial<GraphEdge['data']> = {}): GraphEdge[] {
    return Array.from({ length: count }, (_, i) =>
        createMockEdge({
            id: `edge-${i}`,
            source: `node-${i}`,
            target: `node-${i + 1}`,
            ...overrides
        })
    );
}

/**
 * Create a hierarchical tree of nodes
 */
export function createMockHierarchy(options: {
    depth: number;
    childrenPerLevel: number;
}): GraphNode[] {
    const { depth, childrenPerLevel } = options;
    const nodes: GraphNode[] = [];
    let nodeCounter = 0;

    function createLevel(parentId: string | undefined, level: number): void {
        if (level >= depth) {return;}

        for (let i = 0; i < childrenPerLevel; i++) {
            const nodeId = `node-${nodeCounter++}`;
            const nodeType = level === 0 ? 'directory' :
                           level === 1 ? 'file' :
                           level === 2 ? 'class' : 'function';

            nodes.push(createMockNode({
                id: nodeId,
                label: `${nodeType} ${nodeId}`,
                type: nodeType,
                parent: parentId
            }));

            // Recursively create children
            createLevel(nodeId, level + 1);
        }
    }

    createLevel(undefined, 0);
    return nodes;
}

/**
 * Setup test workspace directory structure
 */
export function setupTestWorkspace(mockFs: any, workspacePath: string = '/test/workspace'): void {
    // Create workspace directory
    mockFs.mkdirSync(workspacePath, { recursive: true });

    // Create .cervyn-viz directory
    const cervynDir = `${workspacePath}/.cervyn-viz`;
    mockFs.mkdirSync(cervynDir, { recursive: true });

    // Create backups directory
    const backupsDir = `${cervynDir}/backups`;
    mockFs.mkdirSync(backupsDir, { recursive: true });
}

/**
 * Simulate external file write (like from MCP server)
 */
export function simulateExternalWrite(
    mockFs: any,
    filePath: string,
    content: string
): void {
    mockFs.simulateExternalWrite(filePath, content);
}

/**
 * Wait for file change event
 */
export function waitForFileChange(timeout: number = 1000): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Timeout waiting for file change'));
        }, timeout);

        // This would be called by the test when file change is detected
        (global as any).__fileChangeCallback = () => {
            clearTimeout(timer);
            resolve();
        };
    });
}

/**
 * Create a spy that tracks function calls
 */
export class FunctionSpy<T extends (...args: any[]) => any> {
    private calls: Array<{
        args: Parameters<T>;
        timestamp: number;
        result?: ReturnType<T>;
        error?: Error;
    }> = [];

    private implementation?: T;

    constructor(implementation?: T) {
        this.implementation = implementation;
    }

    // The spy function
    public fn: T = ((...args: any[]) => {
        const callRecord: {
            args: Parameters<T>;
            timestamp: number;
            result?: ReturnType<T>;
            error?: Error;
        } = {
            args: args as Parameters<T>,
            timestamp: Date.now()
        };

        try {
            if (this.implementation) {
                const result = this.implementation(...args);
                callRecord.result = result;
                this.calls.push(callRecord);
                return result;
            } else {
                this.calls.push(callRecord);
                return undefined;
            }
        } catch (error) {
            callRecord.error = error as Error;
            this.calls.push(callRecord);
            throw error;
        }
    }) as T;

    // Get call count
    public get callCount(): number {
        return this.calls.length;
    }

    // Get all calls
    public get allCalls() {
        return [...this.calls];
    }

    // Get nth call
    public getCall(index: number) {
        return this.calls[index];
    }

    // Check if called with specific args
    public calledWith(...args: any[]): boolean {
        return this.calls.some(call =>
            call.args.length === args.length &&
            call.args.every((arg, i) => arg === args[i])
        );
    }

    // Reset spy
    public reset(): void {
        this.calls = [];
    }
}

/**
 * Flush all pending promises and timers
 */
export async function flushPromises(): Promise<void> {
    return new Promise(resolve => setImmediate(resolve));
}

/**
 * Run with fake timers
 */
export function useFakeTimers() {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });
}

/**
 * Assert that a promise rejects with a specific error
 */
export async function expectToReject(
    promise: Promise<any>,
    errorMatcher?: string | RegExp | ((error: Error) => boolean)
): Promise<void> {
    try {
        await promise;
        throw new Error('Expected promise to reject, but it resolved');
    } catch (error) {
        if (errorMatcher) {
            if (typeof errorMatcher === 'string') {
                expect((error as Error).message).toContain(errorMatcher);
            } else if (errorMatcher instanceof RegExp) {
                expect((error as Error).message).toMatch(errorMatcher);
            } else {
                expect(errorMatcher(error as Error)).toBe(true);
            }
        }
    }
}
