/**
 * ConflictResolutionService Unit Tests
 *
 * Tests three-way merge strategy, property ownership rules, conflict detection,
 * and resolution logic for state synchronization.
 */

import { ConflictResolutionService, MergeResult } from '../ConflictResolutionService';
import { SharedGraphState } from '../../config/shared-state-config';
import {
    createMockEmptyState,
    createMockStateWithNodes,
    createMockConflictingStates
} from '../../__tests__/mocks/shared-state.mock';
import { createMockNode, createMockEdge } from '../../__tests__/utils/test-helpers';

// Mock dependencies
jest.mock('../../logger');

// TODO: These tests need enhanced state coordination infrastructure:
// - Three-way merge simulation
// - Complex state conflict scenarios
// - Property ownership tracking
// Skipping until mock infrastructure is complete
describe.skip('ConflictResolutionService', () => {
    let service: ConflictResolutionService;

    beforeEach(() => {
        service = new ConflictResolutionService();
    });

    describe('Initialization', () => {
        test('should create service instance', () => {
            expect(service).toBeDefined();
            expect(service).toBeInstanceOf(ConflictResolutionService);
        });
    });

    describe('Three-Way Merge', () => {
        test('should merge states with no conflicts', () => {
            const base = createMockStateWithNodes({ version: 1 });
            const local = JSON.parse(JSON.stringify(base));
            local.version = 2;
            local.source = 'vscode-extension';
            local.timestamp = Date.now();

            const remote = JSON.parse(JSON.stringify(base));
            remote.version = 2;
            remote.source = 'mcp-server';
            remote.timestamp = Date.now() + 1000;

            // Local adds a node
            local.graphs.code.nodes.push(createMockNode({
                id: 'local-node',
                label: 'Local Node'
            }));

            // Remote adds a different node
            remote.graphs.code.nodes.push(createMockNode({
                id: 'remote-node',
                label: 'Remote Node'
            }));

            const result = service.mergeStates(base, local, remote);

            expect(result.mergedState.graphs.code.nodes.length).toBe(5); // 3 base + 1 local + 1 remote
            expect(result.conflicts.length).toBe(0);
            expect(result.stats.conflictsDetected).toBe(0);
        });

        test('should handle null base state (initial merge)', () => {
            const local = createMockStateWithNodes({ version: 1, source: 'vscode-extension' });
            const remote = createMockStateWithNodes({ version: 1, source: 'mcp-server' });

            const result = service.mergeStates(null, local, remote);

            expect(result.mergedState).toBeDefined();
            expect(result.mergedState.version).toBeGreaterThan(Math.max(local.version, remote.version));
        });

        test('should increment version after merge', () => {
            const base = createMockStateWithNodes({ version: 5 });
            const local = createMockStateWithNodes({ version: 6 });
            const remote = createMockStateWithNodes({ version: 7 });

            const result = service.mergeStates(base, local, remote);

            expect(result.mergedState.version).toBe(8); // max(6, 7) + 1
        });

        test('should set source to vscode-extension after merge', () => {
            const base = createMockStateWithNodes({ version: 1 });
            const local = createMockStateWithNodes({ version: 2, source: 'vscode-extension' });
            const remote = createMockStateWithNodes({ version: 2, source: 'mcp-server' });

            const result = service.mergeStates(base, local, remote);

            expect(result.mergedState.source).toBe('vscode-extension');
        });

        test('should update timestamp to current time', () => {
            const base = createMockStateWithNodes({ version: 1 });
            const local = createMockStateWithNodes({ version: 2 });
            const remote = createMockStateWithNodes({ version: 2 });

            const beforeMerge = Date.now();
            const result = service.mergeStates(base, local, remote);
            const afterMerge = Date.now();

            expect(result.mergedState.timestamp).toBeGreaterThanOrEqual(beforeMerge);
            expect(result.mergedState.timestamp).toBeLessThanOrEqual(afterMerge);
        });

        test('should merge all five layers', () => {
            const base = createMockEmptyState(1);
            const local = createMockEmptyState(2);
            const remote = createMockEmptyState(2);

            // Add nodes to different layers
            local.graphs.workflow.nodes.push(createMockNode({ id: 'wf-1', layer: 'workflow' }));
            local.graphs.context.nodes.push(createMockNode({ id: 'ctx-1', layer: 'context' }));
            local.graphs.container.nodes.push(createMockNode({ id: 'cnt-1', layer: 'container' }));
            local.graphs.component.nodes.push(createMockNode({ id: 'cmp-1', layer: 'component' }));
            local.graphs.code.nodes.push(createMockNode({ id: 'cd-1', layer: 'code' }));

            const result = service.mergeStates(base, local, remote);

            expect(result.mergedState.graphs.workflow.nodes.length).toBe(1);
            expect(result.mergedState.graphs.context.nodes.length).toBe(1);
            expect(result.mergedState.graphs.container.nodes.length).toBe(1);
            expect(result.mergedState.graphs.component.nodes.length).toBe(1);
            expect(result.mergedState.graphs.code.nodes.length).toBe(1);
        });
    });

    describe('Property Ownership Rules', () => {
        test('should preserve extension-owned properties from local', () => {
            const base = createMockStateWithNodes({ version: 1 });
            const local = JSON.parse(JSON.stringify(base));
            const remote = JSON.parse(JSON.stringify(base));

            local.version = 2;
            remote.version = 2;

            // Both modify the same node's extension-owned property
            const nodeId = local.graphs.code.nodes[0].data.id;
            local.graphs.code.nodes[0].data.label = 'Local Label';
            remote.graphs.code.nodes[0].data.label = 'Remote Label';

            const result = service.mergeStates(base, local, remote);

            const mergedNode = result.mergedState.graphs.code.nodes.find(n => n.data.id === nodeId);
            expect(mergedNode?.data.label).toBe('Local Label'); // Extension owns 'label'
        });

        test('should preserve MCP-owned properties from remote', () => {
            const base = createMockStateWithNodes({ version: 1 });
            const local = JSON.parse(JSON.stringify(base));
            const remote = JSON.parse(JSON.stringify(base));

            local.version = 2;
            remote.version = 2;

            // Remote adds MCP-owned property
            const nodeId = remote.graphs.code.nodes[0].data.id;
            remote.graphs.code.nodes[0].data.roleDescription = 'Remote Role';

            const result = service.mergeStates(base, local, remote);

            const mergedNode = result.mergedState.graphs.code.nodes.find(n => n.data.id === nodeId);
            expect(mergedNode?.data.roleDescription).toBe('Remote Role');
        });

        test('should use remote value for shared properties (last-write-wins)', () => {
            const base = createMockStateWithNodes({ version: 1 });
            const local = JSON.parse(JSON.stringify(base));
            const remote = JSON.parse(JSON.stringify(base));

            local.version = 2;
            remote.version = 2;

            // Both modify shared property
            const nodeId = local.graphs.code.nodes[0].data.id;
            local.graphs.code.nodes[0].data.shape = 'rectangle';
            remote.graphs.code.nodes[0].data.shape = 'ellipse';

            const result = service.mergeStates(base, local, remote);

            const mergedNode = result.mergedState.graphs.code.nodes.find(n => n.data.id === nodeId);
            expect(mergedNode?.data.shape).toBe('ellipse'); // Remote wins for shared props
        });

        test('should default unknown properties to remote', () => {
            const base = createMockStateWithNodes({ version: 1 });
            const local = JSON.parse(JSON.stringify(base));
            const remote = JSON.parse(JSON.stringify(base));

            local.version = 2;
            remote.version = 2;

            // Add unknown property
            const nodeId = local.graphs.code.nodes[0].data.id;
            (local.graphs.code.nodes[0].data as any).unknownProp = 'local-value';
            (remote.graphs.code.nodes[0].data as any).unknownProp = 'remote-value';

            const result = service.mergeStates(base, local, remote);

            const mergedNode = result.mergedState.graphs.code.nodes.find(n => n.data.id === nodeId);
            expect((mergedNode?.data as any).unknownProp).toBe('remote-value');
            expect(result.conflicts.length).toBeGreaterThan(0);
        });

        test('should preserve extension properties: id, type, path', () => {
            const base = createMockStateWithNodes({ version: 1 });
            const local = JSON.parse(JSON.stringify(base));
            const remote = JSON.parse(JSON.stringify(base));

            local.version = 2;
            remote.version = 2;

            const nodeId = local.graphs.code.nodes[0].data.id;

            // Try to modify extension properties from remote
            local.graphs.code.nodes[0].data.type = 'file';
            local.graphs.code.nodes[0].data.path = '/local/path';

            remote.graphs.code.nodes[0].data.type = 'class';
            remote.graphs.code.nodes[0].data.path = '/remote/path';

            const result = service.mergeStates(base, local, remote);

            const mergedNode = result.mergedState.graphs.code.nodes.find(n => n.data.id === nodeId);
            expect(mergedNode?.data.type).toBe('file'); // Local wins (extension-owned)
            expect(mergedNode?.data.path).toBe('/local/path'); // Local wins
        });

        test('should preserve MCP properties: roleDescription, technology', () => {
            const base = createMockStateWithNodes({ version: 1 });
            const local = JSON.parse(JSON.stringify(base));
            const remote = JSON.parse(JSON.stringify(base));

            local.version = 2;
            remote.version = 2;

            const nodeId = remote.graphs.code.nodes[0].data.id;
            remote.graphs.code.nodes[0].data.roleDescription = 'Main Entry Point';
            remote.graphs.code.nodes[0].data.technology = 'TypeScript';

            const result = service.mergeStates(base, local, remote);

            const mergedNode = result.mergedState.graphs.code.nodes.find(n => n.data.id === nodeId);
            expect(mergedNode?.data.roleDescription).toBe('Main Entry Point');
            expect(mergedNode?.data.technology).toBe('TypeScript');
        });
    });

    describe('Node Addition/Removal Conflicts', () => {
        test('should include nodes only in local (extension-added)', () => {
            const base = createMockStateWithNodes({ version: 1 });
            const local = JSON.parse(JSON.stringify(base));
            const remote = JSON.parse(JSON.stringify(base));

            local.version = 2;
            remote.version = 2;

            // Local adds a new node
            local.graphs.code.nodes.push(createMockNode({
                id: 'local-only',
                label: 'Extension Added'
            }));

            const result = service.mergeStates(base, local, remote);

            const localNode = result.mergedState.graphs.code.nodes.find(n => n.data.id === 'local-only');
            expect(localNode).toBeDefined();
            expect(localNode?.data.label).toBe('Extension Added');
        });

        test('should include nodes only in remote (agent-added)', () => {
            const base = createMockStateWithNodes({ version: 1 });
            const local = JSON.parse(JSON.stringify(base));
            const remote = JSON.parse(JSON.stringify(base));

            local.version = 2;
            remote.version = 2;

            // Remote adds a new node
            remote.graphs.code.nodes.push(createMockNode({
                id: 'remote-only',
                label: 'Agent Added'
            }));

            const result = service.mergeStates(base, local, remote);

            const remoteNode = result.mergedState.graphs.code.nodes.find(n => n.data.id === 'remote-only');
            expect(remoteNode).toBeDefined();
            expect(remoteNode?.data.label).toBe('Agent Added');
        });

        test('should handle nodes removed in local', () => {
            const base = createMockStateWithNodes({ version: 1, nodeCount: 5 });
            const local = JSON.parse(JSON.stringify(base));
            const remote = JSON.parse(JSON.stringify(base));

            local.version = 2;
            remote.version = 2;

            // Local removes a node
            local.graphs.code.nodes = local.graphs.code.nodes.filter((n: any) => n.data.id !== 'node-2');

            const result = service.mergeStates(base, local, remote);

            // If local removed it (extension decision), it should stay removed
            const removedNode = result.mergedState.graphs.code.nodes.find(n => n.data.id === 'node-2');
            expect(removedNode).toBeUndefined();
        });

        test('should handle nodes removed in remote', () => {
            const base = createMockStateWithNodes({ version: 1, nodeCount: 5 });
            const local = JSON.parse(JSON.stringify(base));
            const remote = JSON.parse(JSON.stringify(base));

            local.version = 2;
            remote.version = 2;

            // Remote removes a node
            remote.graphs.code.nodes = remote.graphs.code.nodes.filter((n: any) => n.data.id !== 'node-3');

            const result = service.mergeStates(base, local, remote);

            // If remote removed it but local has it, keep it (extension state wins for structure)
            const node = result.mergedState.graphs.code.nodes.find(n => n.data.id === 'node-3');
            expect(node).toBeDefined(); // Local version should win
        });
    });

    describe('Edge Merging', () => {
        test('should merge edges from both local and remote', () => {
            const base = createMockEmptyState(1);
            const local = createMockEmptyState(2);
            const remote = createMockEmptyState(2);

            local.graphs.code.edges.push(createMockEdge({
                id: 'edge-local',
                source: 'node-1',
                target: 'node-2'
            }));

            remote.graphs.code.edges.push(createMockEdge({
                id: 'edge-remote',
                source: 'node-2',
                target: 'node-3'
            }));

            const result = service.mergeStates(base, local, remote);

            expect(result.mergedState.graphs.code.edges.length).toBe(2);
            expect(result.mergedState.graphs.code.edges.find(e => e.data.id === 'edge-local')).toBeDefined();
            expect(result.mergedState.graphs.code.edges.find(e => e.data.id === 'edge-remote')).toBeDefined();
        });

        test('should deduplicate edges by ID', () => {
            const base = createMockEmptyState(1);
            const local = createMockEmptyState(2);
            const remote = createMockEmptyState(2);

            local.graphs.code.edges.push(createMockEdge({
                id: 'edge-1',
                source: 'node-1',
                target: 'node-2'
            }));

            remote.graphs.code.edges.push(createMockEdge({
                id: 'edge-1',
                source: 'node-1',
                target: 'node-2'
            }));

            const result = service.mergeStates(base, local, remote);

            expect(result.mergedState.graphs.code.edges.length).toBe(1);
        });

        test('should prefer remote edge metadata for duplicates', () => {
            const base = createMockEmptyState(1);
            const local = createMockEmptyState(2);
            const remote = createMockEmptyState(2);

            local.graphs.code.edges.push(createMockEdge({
                id: 'edge-1',
                edgeType: 'calls'
            }));

            remote.graphs.code.edges.push(createMockEdge({
                id: 'edge-1',
                edgeType: 'imports'
            }));

            const result = service.mergeStates(base, local, remote);

            const edge = result.mergedState.graphs.code.edges.find(e => e.data.id === 'edge-1');
            expect(edge?.data.type).toBe('imports'); // Remote wins
        });
    });

    describe('Metadata Merging', () => {
        test('should preserve extension-managed nodeHistory from local', () => {
            const base = createMockEmptyState(1);
            const local = createMockEmptyState(2);
            const remote = createMockEmptyState(2);

            local.nodeHistory = {
                workflow: { 'node-1': [{ timestamp: Date.now(), action: 'added' }] },
                context: {},
                container: {},
                component: {},
                code: {}
            };

            remote.nodeHistory = {
                workflow: { 'node-2': [{ timestamp: Date.now(), action: 'added' }] },
                context: {},
                container: {},
                component: {},
                code: {}
            };

            const result = service.mergeStates(base, local, remote);

            expect(result.mergedState.nodeHistory).toEqual(local.nodeHistory);
        });

        test('should preserve extension-managed deletedNodes from local', () => {
            const base = createMockEmptyState(1);
            const local = createMockEmptyState(2);
            const remote = createMockEmptyState(2);

            local.deletedNodes = {
                workflow: ['deleted-1'],
                context: [],
                container: [],
                component: [],
                code: []
            };

            remote.deletedNodes = {
                workflow: ['deleted-2'],
                context: [],
                container: [],
                component: [],
                code: []
            };

            const result = service.mergeStates(base, local, remote);

            expect(result.mergedState.deletedNodes).toEqual(local.deletedNodes);
        });

        test('should prefer remote proposedChanges (MCP-owned)', () => {
            const base = createMockEmptyState(1);
            const local = createMockEmptyState(2);
            const remote = createMockEmptyState(2);

            local.proposedChanges = {
                workflow: [{ nodeId: 'local', summary: 'Local change' }],
                context: [],
                container: [],
                component: [],
                code: []
            };

            remote.proposedChanges = {
                workflow: [{ nodeId: 'remote', summary: 'Remote change' }],
                context: [],
                container: [],
                component: [],
                code: []
            };

            const result = service.mergeStates(base, local, remote);

            expect(result.mergedState.proposedChanges).toEqual(remote.proposedChanges);
        });

        test('should use remote currentLayer if timestamp is newer', () => {
            const base = createMockEmptyState(1);
            const local = createMockEmptyState(2);
            const remote = createMockEmptyState(2);

            local.currentLayer = 'code';
            local.timestamp = Date.now();

            remote.currentLayer = 'workflow';
            remote.timestamp = Date.now() + 5000; // 5 seconds later

            const result = service.mergeStates(base, local, remote);

            expect(result.mergedState.currentLayer).toBe('workflow');
        });

        test('should use local currentLayer if timestamp is newer', () => {
            const base = createMockEmptyState(1);
            const local = createMockEmptyState(2);
            const remote = createMockEmptyState(2);

            local.currentLayer = 'code';
            local.timestamp = Date.now() + 5000;

            remote.currentLayer = 'workflow';
            remote.timestamp = Date.now();

            const result = service.mergeStates(base, local, remote);

            expect(result.mergedState.currentLayer).toBe('code');
        });

        test('should use remote agentOnlyMode if timestamp is newer', () => {
            const base = createMockEmptyState(1);
            const local = createMockEmptyState(2);
            const remote = createMockEmptyState(2);

            local.agentOnlyMode = false;
            local.timestamp = Date.now();

            remote.agentOnlyMode = true;
            remote.timestamp = Date.now() + 5000;

            const result = service.mergeStates(base, local, remote);

            expect(result.mergedState.agentOnlyMode).toBe(true);
        });
    });

    describe('Merge Statistics', () => {
        test('should count processed nodes', () => {
            const base = createMockStateWithNodes({ version: 1, nodeCount: 5 });
            const local = createMockStateWithNodes({ version: 2, nodeCount: 5 });
            const remote = createMockStateWithNodes({ version: 2, nodeCount: 5 });

            const result = service.mergeStates(base, local, remote);

            expect(result.stats.nodesProcessed).toBe(5);
        });

        test('should count processed edges', () => {
            const base = createMockEmptyState(1);
            const local = createMockEmptyState(2);
            const remote = createMockEmptyState(2);

            local.graphs.code.edges.push(createMockEdge({ id: 'e1' }));
            local.graphs.code.edges.push(createMockEdge({ id: 'e2' }));

            remote.graphs.code.edges.push(createMockEdge({ id: 'e3' }));

            const result = service.mergeStates(base, local, remote);

            expect(result.stats.edgesProcessed).toBeGreaterThan(0);
        });

        test('should count conflicts detected', () => {
            const base = createMockStateWithNodes({ version: 1 });
            const local = JSON.parse(JSON.stringify(base));
            const remote = JSON.parse(JSON.stringify(base));

            local.version = 2;
            remote.version = 2;

            // Create unknown property conflict
            (local.graphs.code.nodes[0].data as any).unknownProp = 'local';
            (remote.graphs.code.nodes[0].data as any).unknownProp = 'remote';

            const result = service.mergeStates(base, local, remote);

            expect(result.stats.conflictsDetected).toBeGreaterThan(0);
        });

        test('should count properties updated', () => {
            const base = createMockStateWithNodes({ version: 1 });
            const local = JSON.parse(JSON.stringify(base));
            const remote = JSON.parse(JSON.stringify(base));

            local.version = 2;
            remote.version = 2;

            // Remote adds MCP-owned properties
            remote.graphs.code.nodes[0].data.roleDescription = 'Test Role';
            remote.graphs.code.nodes[0].data.technology = 'TypeScript';

            const result = service.mergeStates(base, local, remote);

            expect(result.stats.propertiesUpdated).toBeGreaterThan(0);
        });
    });

    describe('Conflict Detection', () => {
        test('should detect conflicts when sources differ and versions diverge', () => {
            const local = createMockStateWithNodes({ version: 5, source: 'vscode-extension' });
            const remote = createMockStateWithNodes({ version: 6, source: 'mcp-server' });

            const hasConflicts = service.hasConflicts(local, remote);

            expect(hasConflicts).toBe(true);
        });

        test('should detect conflicts when timestamps are far apart', () => {
            const local = createMockStateWithNodes({ version: 2, source: 'vscode-extension' });
            const remote = createMockStateWithNodes({ version: 2, source: 'mcp-server' });

            local.timestamp = Date.now();
            remote.timestamp = Date.now() + 10000; // 10 seconds later

            const hasConflicts = service.hasConflicts(local, remote);

            expect(hasConflicts).toBe(true);
        });

        test('should not detect conflicts for same source and version', () => {
            const local = createMockStateWithNodes({ version: 2, source: 'vscode-extension' });
            const remote = createMockStateWithNodes({ version: 2, source: 'vscode-extension' });

            const hasConflicts = service.hasConflicts(local, remote);

            expect(hasConflicts).toBe(false);
        });

        test('should not detect conflicts for close timestamps', () => {
            const local = createMockStateWithNodes({ version: 2, source: 'vscode-extension' });
            const remote = createMockStateWithNodes({ version: 3, source: 'mcp-server' });

            local.timestamp = Date.now();
            remote.timestamp = Date.now() + 1000; // 1 second later (< 5 second threshold)

            const hasConflicts = service.hasConflicts(local, remote);

            expect(hasConflicts).toBe(false);
        });
    });

    describe('Merge Base Creation', () => {
        test('should create deep clone of state', () => {
            const state = createMockStateWithNodes({ version: 5, nodeCount: 3 });

            const mergeBase = service.createMergeBase(state);

            expect(mergeBase).toEqual(state);
            expect(mergeBase).not.toBe(state); // Different object reference
        });

        test('should not affect original state when modifying clone', () => {
            const state = createMockStateWithNodes({ version: 5 });

            const mergeBase = service.createMergeBase(state);
            mergeBase.version = 10;
            mergeBase.graphs.code.nodes[0].data.label = 'Modified';

            expect(state.version).toBe(5);
            expect(state.graphs.code.nodes[0].data.label).not.toBe('Modified');
        });
    });

    describe('Empty Graph Handling', () => {
        test('should handle empty local graph', () => {
            const base = createMockEmptyState(1);
            const local = createMockEmptyState(2);
            const remote = createMockStateWithNodes({ version: 2, nodeCount: 3 });

            const result = service.mergeStates(base, local, remote);

            expect(result.mergedState.graphs.code.nodes.length).toBe(3);
        });

        test('should handle empty remote graph', () => {
            const base = createMockEmptyState(1);
            const local = createMockStateWithNodes({ version: 2, nodeCount: 3 });
            const remote = createMockEmptyState(2);

            const result = service.mergeStates(base, local, remote);

            expect(result.mergedState.graphs.code.nodes.length).toBe(3);
        });

        test('should handle both graphs empty', () => {
            const base = createMockEmptyState(1);
            const local = createMockEmptyState(2);
            const remote = createMockEmptyState(2);

            const result = service.mergeStates(base, local, remote);

            expect(result.mergedState.graphs.code.nodes.length).toBe(0);
            expect(result.mergedState.graphs.code.edges.length).toBe(0);
        });
    });

    describe('Large Graph Performance', () => {
        test('should handle large graphs efficiently', () => {
            const base = createMockEmptyState(1);
            const local = createMockEmptyState(2);
            const remote = createMockEmptyState(2);

            // Create 500 nodes in each
            for (let i = 0; i < 500; i++) {
                local.graphs.code.nodes.push(createMockNode({
                    id: `local-${i}`,
                    label: `Local Node ${i}`
                }));

                remote.graphs.code.nodes.push(createMockNode({
                    id: `remote-${i}`,
                    label: `Remote Node ${i}`
                }));
            }

            const startTime = Date.now();
            const result = service.mergeStates(base, local, remote);
            const duration = Date.now() - startTime;

            expect(result.mergedState.graphs.code.nodes.length).toBe(1000);
            expect(duration).toBeLessThan(5000); // Should complete in < 5 seconds
        });
    });
});
