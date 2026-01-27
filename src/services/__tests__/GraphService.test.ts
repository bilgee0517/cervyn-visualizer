/**
 * GraphService Unit Tests
 *
 * Tests multi-layer graph management, state sync, event emission,
 * proposed changes, conflict resolution, and file system reconciliation.
 */

// Mock vscode FIRST before any imports
jest.mock('vscode', () => ({
    EventEmitter: jest.fn().mockImplementation(() => ({
        event: jest.fn(),
        fire: jest.fn()
    }))
}));
jest.mock('../../logger');
jest.mock('fs');

// Create mock factories (without external variables)
jest.mock('../StateSyncService', () => ({
    StateSyncService: jest.fn().mockImplementation(() => ({
        readState: jest.fn(),
        writeState: jest.fn(),
        writeStateImmediate: jest.fn(),
        startWatching: jest.fn(),
        onStateChanged: jest.fn(),
        dispose: jest.fn(),
        getStateFilePath: jest.fn()
    }))
}));

jest.mock('../ConflictResolutionService', () => ({
    conflictResolutionService: {
        hasConflicts: jest.fn(),
        mergeStates: jest.fn(),
        createMergeBase: jest.fn()
    }
}));

// Now import for use in tests
import { GraphService } from '../GraphService';
import { GraphData, GraphNode, GraphEdge, Layer, ProposedChange } from '../../types';
import { SharedGraphState, createEmptySharedState, SCHEMA_VERSION } from '../../config/shared-state-config';
import { GraphStateError } from '../../errors';
import * as fs from 'fs';

// Get mock instances for test access
const mockContext = {
    globalState: {
        get: jest.fn(),
        update: jest.fn()
    }
} as any;

// Create a new StateSyncService to get the mocked instance
const { StateSyncService } = require('../StateSyncService');
const mockStateSyncServiceInstance = new StateSyncService();
const mockConflictResolutionService = require('../ConflictResolutionService').conflictResolutionService;

// Helper to get mock
const mockStateSyncService = mockStateSyncServiceInstance;

// Test helper functions
function createMockNode(id: string, type: string = 'file', path?: string): GraphNode {
    return {
        data: {
            id,
            type,
            label: id,
            path: path || `/test/${id}`,
            modified: false
        }
    };
}

function createMockEdge(id: string, source: string, target: string): GraphEdge {
    return {
        data: {
            id,
            source,
            target,
            label: 'depends'
        }
    };
}

function createMockGraphData(nodeCount: number = 3): GraphData {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (let i = 0; i < nodeCount; i++) {
        nodes.push(createMockNode(`node-${i}`));
    }

    for (let i = 0; i < nodeCount - 1; i++) {
        edges.push(createMockEdge(`edge-${i}`, `node-${i}`, `node-${i + 1}`));
    }

    return { nodes, edges };
}

// TODO: These tests need enhanced multi-service mock infrastructure:
// - StateSyncService integration
// - ConflictResolutionService coordination
// - Event-driven state changes
// - File system reconciliation
// Skipping until mock infrastructure is complete
describe.skip('GraphService', () => {
    let service: GraphService;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup default mock implementations
        mockContext.globalState.get.mockReturnValue(undefined);
        mockContext.globalState.update.mockResolvedValue(undefined);
        mockStateSyncService.readState.mockReturnValue(null);
        mockStateSyncService.writeState.mockReturnValue(undefined);
        mockStateSyncService.writeStateImmediate.mockReturnValue(undefined);
        mockStateSyncService.getStateFilePath.mockReturnValue('/test/.codebase-visualizer/graph-state.json');
        mockStateSyncService.onStateChanged.mockReturnValue(undefined);

        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.unlinkSync as jest.Mock).mockReturnValue(undefined);
    });

    afterEach(() => {
        if (service) {
            service.dispose();
        }
    });

    describe('Initialization', () => {
        test('should initialize with empty graphs when no state exists', () => {
            mockStateSyncService.readState.mockReturnValue(null);

            service = new GraphService(mockContext);

            const graph = service.getGraph('code');
            expect(graph.nodes).toHaveLength(0);
            expect(graph.edges).toHaveLength(0);
        });

        test('should load existing state from shared file', () => {
            const existingState: SharedGraphState = {
                ...createEmptySharedState(),
                graphs: {
                    workflow: { nodes: [], edges: [] },
                    context: { nodes: [], edges: [] },
                    container: { nodes: [], edges: [] },
                    component: { nodes: [], edges: [] },
                    code: createMockGraphData(5)
                }
            };

            mockStateSyncService.readState.mockReturnValue(existingState);

            service = new GraphService(mockContext);

            const graph = service.getGraph('code');
            expect(graph.nodes).toHaveLength(5);
            expect(graph.edges).toHaveLength(4);
        });

        test('should start watching for state changes', () => {
            service = new GraphService(mockContext);

            expect(mockStateSyncService.startWatching).toHaveBeenCalled();
            expect(mockStateSyncService.onStateChanged).toHaveBeenCalled();
        });

        test('should set default current layer to code', () => {
            service = new GraphService(mockContext);

            expect(service.getCurrentLayer()).toBe('code');
        });
    });

    describe('Layer Management', () => {
        beforeEach(() => {
            service = new GraphService(mockContext);
        });

        test('should set and get current layer', () => {
            service.setCurrentLayer('component');
            expect(service.getCurrentLayer()).toBe('component');

            service.setCurrentLayer('context');
            expect(service.getCurrentLayer()).toBe('context');
        });

        test('should get graph for specific layer', () => {
            const codeGraph = createMockGraphData(3);
            service.setGraph(codeGraph, 'code');

            const componentGraph = createMockGraphData(5);
            service.setGraph(componentGraph, 'component');

            expect(service.getGraph('code').nodes).toHaveLength(3);
            expect(service.getGraph('component').nodes).toHaveLength(5);
        });

        test('should get graph for current layer when no layer specified', () => {
            service.setCurrentLayer('component');
            const graph = createMockGraphData(4);
            service.setGraph(graph);

            expect(service.getGraph().nodes).toHaveLength(4);
        });
    });

    describe('Graph Operations', () => {
        beforeEach(() => {
            service = new GraphService(mockContext);
        });

        test('should set graph and sync to shared state', () => {
            const graph = createMockGraphData(3);

            service.setGraph(graph, 'code');

            expect(mockStateSyncService.writeState).toHaveBeenCalled();
            expect(service.getGraph('code')).toEqual(graph);
        });

        test('should clear specific layer', () => {
            service.setGraph(createMockGraphData(5), 'code');
            service.setGraph(createMockGraphData(3), 'component');

            service.clearGraph('code');

            expect(service.getGraph('code').nodes).toHaveLength(0);
            expect(service.getGraph('component').nodes).toHaveLength(3);
        });

        test('should clear all layers when no layer specified', () => {
            service.setGraph(createMockGraphData(5), 'code');
            service.setGraph(createMockGraphData(3), 'component');
            service.setGraph(createMockGraphData(2), 'context');

            service.clearGraph();

            expect(service.getGraph('code').nodes).toHaveLength(0);
            expect(service.getGraph('component').nodes).toHaveLength(0);
            expect(service.getGraph('context').nodes).toHaveLength(0);
        });
    });

    describe('Node Operations', () => {
        beforeEach(() => {
            service = new GraphService(mockContext);
            const graph = createMockGraphData(3);
            service.setGraph(graph, 'code');
        });

        test('should update node properties', () => {
            const updates = { label: 'Updated Node', modified: true };

            service.updateNode('node-0', updates, 'code');

            const graph = service.getGraph('code');
            const node = graph.nodes.find(n => n.data.id === 'node-0');

            expect(node?.data.label).toBe('Updated Node');
            expect(node?.data.modified).toBe(true);
            expect(mockStateSyncService.writeState).toHaveBeenCalled();
        });

        test('should throw error when updating non-existent node', () => {
            expect(() => {
                service.updateNode('non-existent', { label: 'Test' }, 'code');
            }).toThrow("Node with ID 'non-existent' not found in code layer");
        });

        test('should record node history on update', () => {
            service.updateNode('node-0', { label: 'Updated' }, 'code');

            const history = service.getNodeHistory('node-0', 'code');
            expect(history).toHaveLength(1);
            expect(history[0].action).toBe('changed');
            expect(history[0].details).toContain('Updated node properties');
        });
    });

    describe('Edge Operations', () => {
        beforeEach(() => {
            service = new GraphService(mockContext);
            const graph = createMockGraphData(3);
            service.setGraph(graph, 'code');
        });

        test('should update edge properties', () => {
            const updates = { label: 'imports' };

            service.updateEdge('edge-0', updates, 'code');

            const graph = service.getGraph('code');
            const edge = graph.edges.find(e => e.data.id === 'edge-0');

            expect(edge?.data.label).toBe('imports');
            expect(mockStateSyncService.writeState).toHaveBeenCalled();
        });

        test('should throw error when updating non-existent edge', () => {
            expect(() => {
                service.updateEdge('non-existent', { label: 'Test' }, 'code');
            }).toThrow("Edge with ID 'non-existent' not found in code layer");
        });
    });

    describe('Proposed Changes', () => {
        beforeEach(() => {
            service = new GraphService(mockContext);
            const graph = createMockGraphData(3);
            service.setGraph(graph, 'code');
        });

        test('should add proposed change for node', () => {
            const change: Partial<ProposedChange> = {
                name: 'Add logging',
                summary: 'Add debug logging',
                intention: 'Improve debugging'
            };

            service.addProposedChangeForNode('node-0', change, 'code');

            const retrieved = service.getProposedChange('node-0', 'code');
            expect(retrieved).toBeDefined();
            expect(retrieved?.name).toBe('Add logging');
            expect(retrieved?.nodeId).toBe('node-0');
        });

        test('should list all proposed changes for layer', () => {
            service.addProposedChangeForNode('node-0', { name: 'Change 1' }, 'code');
            service.addProposedChangeForNode('node-1', { name: 'Change 2' }, 'code');

            const changes = service.listProposedChanges('code');
            expect(changes).toHaveLength(2);
            expect(changes.map(c => c.name)).toContain('Change 1');
            expect(changes.map(c => c.name)).toContain('Change 2');
        });

        test('should clear specific proposed change', () => {
            service.addProposedChangeForNode('node-0', { name: 'Change 1' }, 'code');
            service.addProposedChangeForNode('node-1', { name: 'Change 2' }, 'code');

            service.clearProposedChangeForNode('node-0', 'code');

            expect(service.listProposedChanges('code')).toHaveLength(1);
            expect(service.getProposedChange('node-0', 'code')).toBeUndefined();
        });

        test('should clear all proposed changes for layer', () => {
            service.addProposedChangeForNode('node-0', { name: 'Change 1' }, 'code');
            service.addProposedChangeForNode('node-1', { name: 'Change 2' }, 'code');

            service.clearAllProposedChanges('code');

            expect(service.listProposedChanges('code')).toHaveLength(0);
        });

        test('should apply proposed changes to nodes', () => {
            service.addProposedChangeForNode('node-0', {
                name: 'Add feature',
                summary: 'New feature',
                intention: 'Enhance functionality'
            }, 'code');

            const result = service.applyProposedChanges('code');

            expect(result.appliedCount).toBe(1);
            expect(result.notFoundCount).toBe(0);

            const graph = service.getGraph('code');
            const node = graph.nodes.find(n => n.data.id === 'node-0');

            expect(node?.data.changeName).toBe('Add feature');
            expect(node?.data.changeSummary).toBe('New feature');
            expect(node?.data.modified).toBe(true);

            // Proposed changes should be cleared after application
            expect(service.listProposedChanges('code')).toHaveLength(0);
        });

        test('should track not found nodes when applying changes', () => {
            service.addProposedChangeForNode('non-existent', { name: 'Test' }, 'code');

            const result = service.applyProposedChanges('code');

            expect(result.appliedCount).toBe(0);
            expect(result.notFoundCount).toBe(1);
        });
    });

    describe('Node History', () => {
        beforeEach(() => {
            service = new GraphService(mockContext);
            const graph = createMockGraphData(3);
            service.setGraph(graph, 'code');
        });

        test('should return empty history for node without events', () => {
            const history = service.getNodeHistory('node-0', 'code');
            expect(history).toEqual([]);
        });

        test('should track history across multiple updates', () => {
            service.updateNode('node-0', { label: 'Update 1' }, 'code');
            service.updateNode('node-0', { label: 'Update 2' }, 'code');

            const history = service.getNodeHistory('node-0', 'code');
            expect(history).toHaveLength(2);
            expect(history[0].details).toContain('Update 1');
            expect(history[1].details).toContain('Update 2');
        });

        test('should clear node history', () => {
            service.updateNode('node-0', { label: 'Update' }, 'code');
            expect(service.getNodeHistory('node-0', 'code')).toHaveLength(1);

            service.clearNodeHistory('node-0', 'code');
            expect(service.getNodeHistory('node-0', 'code')).toHaveLength(0);
        });
    });

    describe('Deleted Node Tracking', () => {
        beforeEach(() => {
            service = new GraphService(mockContext);
            const graph = createMockGraphData(3);
            service.setGraph(graph, 'code');
        });

        test('should track deleted nodes when removing file nodes', () => {
            service.removeNodesForFile('/test/node-0', 'code');

            expect(service.isNodeDeleted('node-0', 'code')).toBe(true);
        });

        test('should remove nodes and edges for deleted file', () => {
            const initialNodes = service.getGraph('code').nodes.length;
            const initialEdges = service.getGraph('code').edges.length;

            service.removeNodesForFile('/test/node-0', 'code');

            const graph = service.getGraph('code');
            expect(graph.nodes.length).toBeLessThan(initialNodes);
            expect(graph.edges.length).toBeLessThan(initialEdges);
        });
    });

    describe('State Synchronization', () => {
        beforeEach(() => {
            service = new GraphService(mockContext);
        });

        test('should sync to shared state on graph changes', () => {
            const graph = createMockGraphData(3);
            service.setGraph(graph, 'code');

            expect(mockStateSyncService.writeState).toHaveBeenCalled();
            const callArg = mockStateSyncService.writeState.mock.calls[0][0];
            expect(callArg.graphs.code).toBeDefined();
        });

        test('should include all layers in sync', () => {
            service.setGraph(createMockGraphData(2), 'code');
            service.setGraph(createMockGraphData(3), 'component');

            const callArg = mockStateSyncService.writeState.mock.calls[1][0];
            expect(callArg.graphs.code.nodes).toHaveLength(2);
            expect(callArg.graphs.component.nodes).toHaveLength(3);
        });
    });

    describe('Clear All State', () => {
        beforeEach(() => {
            service = new GraphService(mockContext);
        });

        test('should clear all graphs and state', async () => {
            service.setGraph(createMockGraphData(5), 'code');
            service.setGraph(createMockGraphData(3), 'component');
            service.addProposedChangeForNode('node-0', { name: 'Test' }, 'code');

            await service.clearAllState();

            expect(service.getGraph('code').nodes).toHaveLength(0);
            expect(service.getGraph('component').nodes).toHaveLength(0);
            expect(service.listProposedChanges('code')).toHaveLength(0);
        });

        test('should delete and reinitialize state file', async () => {
            await service.clearAllState();

            expect(fs.unlinkSync).toHaveBeenCalled();
            expect(mockStateSyncService.writeStateImmediate).toHaveBeenCalledWith(
                expect.objectContaining({
                    schemaVersion: SCHEMA_VERSION
                })
            );
        });
    });

    describe('Migration from GlobalState', () => {
        test('should skip migration if already completed', () => {
            mockContext.globalState.get.mockReturnValue(true);

            service = new GraphService(mockContext);

            // Should not call writeStateImmediate if migration already done
            expect(mockStateSyncService.writeStateImmediate).not.toHaveBeenCalled();
        });

        test('should migrate graph data from globalState', () => {
            mockContext.globalState.get.mockImplementation((key: string) => {
                if (key === 'codebaseVisualizer.migratedToSharedFile') {
                    return false;
                }
                if (key === 'graphData') {
                    return {
                        code: createMockGraphData(5),
                        component: createMockGraphData(3),
                        context: { nodes: [], edges: [] },
                        container: { nodes: [], edges: [] },
                        workflow: { nodes: [], edges: [] }
                    };
                }
                return undefined;
            });

            service = new GraphService(mockContext);

            expect(mockStateSyncService.writeStateImmediate).toHaveBeenCalled();
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'codebaseVisualizer.migratedToSharedFile',
                true
            );
        });
    });

    describe('External State Changes', () => {
        let onStateChangedCallback: Function;

        beforeEach(() => {
            mockStateSyncService.onStateChanged.mockImplementation((callback: Function) => {
                onStateChangedCallback = callback;
            });

            service = new GraphService(mockContext);
        });

        test('should handle external MCP property updates', () => {
            const externalState: SharedGraphState = {
                ...createEmptySharedState(),
                source: 'mcp-server',
                version: 2,
                graphs: {
                    workflow: { nodes: [], edges: [] },
                    context: { nodes: [], edges: [] },
                    container: { nodes: [], edges: [] },
                    component: { nodes: [], edges: [] },
                    code: {
                        nodes: [
                            {
                                ...createMockNode('node-0'),
                                data: {
                                    ...createMockNode('node-0').data,
                                    complexity: 5,
                                    cluster: 'utils'
                                }
                            }
                        ],
                        edges: []
                    }
                }
            };

            // Set initial graph
            service.setGraph(createMockGraphData(3), 'code');

            // Simulate external change
            mockConflictResolutionService.hasConflicts.mockReturnValue(false);
            onStateChangedCallback(externalState);

            const graph = service.getGraph('code');
            const node = graph.nodes.find(n => n.data.id === 'node-0');
            expect(node?.data.complexity).toBe(5);
        });

        test('should handle conflicts with three-way merge', () => {
            const externalState: SharedGraphState = {
                ...createEmptySharedState(),
                source: 'mcp-server',
                version: 2,
                graphs: {
                    workflow: { nodes: [], edges: [] },
                    context: { nodes: [], edges: [] },
                    container: { nodes: [], edges: [] },
                    component: { nodes: [], edges: [] },
                    code: createMockGraphData(5)
                }
            };

            const mergedState: SharedGraphState = {
                ...externalState,
                version: 3
            };

            mockConflictResolutionService.hasConflicts.mockReturnValue(true);
            mockConflictResolutionService.mergeStates.mockReturnValue({
                mergedState,
                conflicts: [{ type: 'property', nodeId: 'node-0', property: 'label' }],
                stats: { nodesProcessed: 5, conflictsResolved: 1 }
            });
            mockConflictResolutionService.createMergeBase.mockReturnValue(mergedState);

            service.setGraph(createMockGraphData(3), 'code');
            onStateChangedCallback(externalState);

            expect(mockConflictResolutionService.mergeStates).toHaveBeenCalled();
        });
    });

    describe('File System Reconciliation', () => {
        beforeEach(() => {
            service = new GraphService(mockContext);
        });

        test('should remove orphaned nodes for non-existent files', async () => {
            const graph = createMockGraphData(3);
            service.setGraph(graph, 'code');

            // Mock one file as non-existent
            (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
                return path !== '/test/node-1';
            });

            await service.reconcileStateWithFilesystem();

            const resultGraph = service.getGraph('code');
            expect(resultGraph.nodes.some(n => n.data.id === 'node-1')).toBe(false);
            expect(service.isNodeDeleted('node-1', 'code')).toBe(true);
        });

        test('should preserve agent-added nodes during reconciliation', async () => {
            const agentNode = createMockNode('agent-node');
            agentNode.data.isAgentAdded = true;
            agentNode.data.path = '/non/existent/path';

            const graph: GraphData = {
                nodes: [agentNode],
                edges: []
            };

            service.setGraph(graph, 'code');

            (fs.existsSync as jest.Mock).mockReturnValue(false);

            await service.reconcileStateWithFilesystem();

            const resultGraph = service.getGraph('code');
            expect(resultGraph.nodes.some(n => n.data.id === 'agent-node')).toBe(true);
        });
    });

    describe('Disposal', () => {
        test('should dispose resources and clear timers', () => {
            service = new GraphService(mockContext);
            service.dispose();

            expect(mockStateSyncService.dispose).toHaveBeenCalled();
        });
    });
});
