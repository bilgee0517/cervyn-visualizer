/**
 * Camera Manager Unit Tests
 *
 * Tests focusing, zooming, node searching, and camera positioning
 */

import { CameraManager, FocusOptions, NodeSearchResult } from '../camera-manager';
import { StateManager } from '../../shared/state-manager';
import { StyleManager, StyleLayer } from '../style-manager';
import { CONFIG } from '../../shared/types';

// Mock dependencies
jest.mock('../../shared/utils', () => ({
    logMessage: jest.fn()
}));

// Mock Cytoscape instance
function createMockCy() {
    const nodes = new Map<string, any>();
    const edges = new Map<string, any>();

    const createNode = (id: string, data: any = {}) => {
        const nodeData = {
            id,
            label: data.label || id,
            type: data.type || 'file',
            path: data.path,
            ...data
        };

        const node = {
            data: (key?: string) => key ? nodeData[key] : nodeData,
            id: () => id,
            position: () => data.position || { x: 100, y: 100 },
            boundingBox: () => ({
                x1: data.position?.x || 90,
                y1: data.position?.y || 90,
                x2: data.position?.x + 20 || 110,
                y2: data.position?.y + 20 || 110,
                w: 20,
                h: 20
            }),
            style: jest.fn((prop?: string) => {
                if (prop === 'opacity') {return data.opacity || 1;}
                if (typeof prop === 'object') {
                    Object.assign(nodeData, prop);
                }
                return undefined;
            }),
            parent: () => ({ length: 0 }),
            connectedEdges: () => ({
                length: 0,
                forEach: jest.fn(),
                addClass: jest.fn(),
                removeClass: jest.fn()
            }),
            addClass: jest.fn(),
            removeClass: jest.fn(),
            hasClass: jest.fn().mockReturnValue(false),
            length: 1
        };

        nodes.set(id, node);
        return node;
    };

    const cy = {
        getElementById: jest.fn((id: string) => {
            const node = nodes.get(id);
            return node ? [node] : [];
        }),
        nodes: jest.fn(() => ({
            forEach: (fn: Function) => {
                nodes.forEach(node => fn(node));
            },
            removeClass: jest.fn(),
            addClass: jest.fn(),
            length: nodes.size
        })),
        edges: jest.fn(() => ({
            removeClass: jest.fn(),
            addClass: jest.fn()
        })),
        collection: jest.fn(() => ({
            merge: jest.fn(function(node: any) {
                this.length = (this.length || 0) + (node.length || 0);
                return this;
            }),
            length: 0
        })),
        width: jest.fn().mockReturnValue(800),
        height: jest.fn().mockReturnValue(600),
        zoom: jest.fn(),
        pan: jest.fn(),
        animate: jest.fn(),
        fit: jest.fn(),
        style: jest.fn().mockReturnValue({
            update: jest.fn()
        })
    };

    return { cy, createNode, nodes };
}

describe('CameraManager', () => {
    let cameraManager: CameraManager;
    let mockVscode: any;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockStyleManager: jest.Mocked<StyleManager>;
    let mockCyData: any;

    beforeEach(() => {
        mockVscode = {
            postMessage: jest.fn()
        };

        mockCyData = createMockCy();

        mockStateManager = {
            getCy: jest.fn().mockReturnValue(mockCyData.cy)
        } as any;

        mockStyleManager = {
            clearLayer: jest.fn(),
            applyInteraction: jest.fn(),
            applyEdgeInteraction: jest.fn()
        } as any;

        cameraManager = new CameraManager(mockVscode, mockStateManager);
        cameraManager.setStyleManager(mockStyleManager);
    });

    describe('Initialization', () => {
        test('should initialize with StateManager', () => {
            expect(cameraManager).toBeDefined();
            expect(mockStateManager.getCy).not.toHaveBeenCalled();
        });

        test('should accept StyleManager injection', () => {
            const manager = new CameraManager(mockVscode, mockStateManager);
            manager.setStyleManager(mockStyleManager);

            // Verify StyleManager is used by clearing selection
            manager.clearSelection();
            expect(mockStyleManager.clearLayer).toHaveBeenCalledWith(StyleLayer.INTERACTION);
        });
    });

    describe('Clear Selection', () => {
        test('should use StyleManager to clear selection when available', () => {
            cameraManager.clearSelection();

            expect(mockStyleManager.clearLayer).toHaveBeenCalledWith(StyleLayer.INTERACTION);
        });

        test('should fall back to direct class removal when StyleManager unavailable', () => {
            const managerWithoutStyle = new CameraManager(mockVscode, mockStateManager);
            managerWithoutStyle.clearSelection();

            expect(mockCyData.cy.nodes).toHaveBeenCalled();
            expect(mockCyData.cy.edges).toHaveBeenCalled();
        });

        test('should handle null Cytoscape instance gracefully', () => {
            mockStateManager.getCy.mockReturnValue(null);
            const manager = new CameraManager(mockVscode, mockStateManager);

            expect(() => manager.clearSelection()).not.toThrow();
        });
    });

    describe('Focus on Node', () => {
        let testNode: any;

        beforeEach(() => {
            testNode = mockCyData.createNode('node-1', {
                label: 'Test Node',
                position: { x: 200, y: 200 }
            });
        });

        test('should focus on existing node with default options', () => {
            const result = cameraManager.focusOnNode('node-1');

            expect(result).toBe(true);
            expect(mockCyData.cy.getElementById).toHaveBeenCalledWith('node-1');
            expect(mockStyleManager.applyInteraction).toHaveBeenCalledWith(testNode, 'selected');
        });

        test('should return false for non-existent node', () => {
            const result = cameraManager.focusOnNode('non-existent');

            expect(result).toBe(false);
            expect(mockStyleManager.applyInteraction).not.toHaveBeenCalled();
        });

        test('should use custom zoom when provided', () => {
            const options: FocusOptions = {
                zoom: 1.5,
                padding: 100,
                duration: 1000,
                animate: true
            };

            const result = cameraManager.focusOnNode('node-1', options);

            expect(result).toBe(true);
            expect(mockCyData.cy.animate).toHaveBeenCalledWith(
                expect.objectContaining({
                    zoom: 1.5,
                    duration: 1000
                })
            );
        });

        test('should clamp zoom to valid range', () => {
            jest.clearAllMocks();

            // Test upper bound: 100 > MAX_ZOOM (10), should clamp to 10
            const tooHighZoom: FocusOptions = { zoom: 100, animate: false };
            cameraManager.focusOnNode('node-1', tooHighZoom);

            expect(mockCyData.cy.zoom).toHaveBeenLastCalledWith(CONFIG.MAX_ZOOM);

            jest.clearAllMocks();

            // Test lower bound: 0.0001 < MIN_ZOOM (0.001), should clamp to 0.001
            const tooLowZoom: FocusOptions = { zoom: 0.0001, animate: false };
            cameraManager.focusOnNode('node-1', tooLowZoom);

            expect(mockCyData.cy.zoom).toHaveBeenLastCalledWith(CONFIG.MIN_ZOOM);
        });

        test('should calculate auto zoom based on node size', () => {
            const result = cameraManager.focusOnNode('node-1', { animate: false });

            expect(result).toBe(true);
            expect(mockCyData.cy.zoom).toHaveBeenCalled();
            expect(mockCyData.cy.pan).toHaveBeenCalled();
        });

        test('should focus without animation when animate is false', () => {
            const options: FocusOptions = { animate: false, zoom: 1.0 };
            cameraManager.focusOnNode('node-1', options);

            expect(mockCyData.cy.animate).not.toHaveBeenCalled();
            expect(mockCyData.cy.zoom).toHaveBeenCalled();
            expect(mockCyData.cy.pan).toHaveBeenCalled();
        });

        test('should ensure node is visible before focusing', () => {
            const hiddenNode = mockCyData.createNode('hidden-node', {
                opacity: 0.1
            });

            cameraManager.focusOnNode('hidden-node');

            expect(hiddenNode.style).toHaveBeenCalledWith(
                expect.objectContaining({
                    opacity: 1,
                    'text-opacity': 1
                })
            );
        });

        test('should skip visibility check when ensureVisible is false', () => {
            const hiddenNode = mockCyData.createNode('hidden-node', {
                opacity: 0.1
            });

            cameraManager.focusOnNode('hidden-node', { ensureVisible: false });

            // Node should not be made visible
            expect(hiddenNode.style).not.toHaveBeenCalledWith(
                expect.objectContaining({ opacity: 1 })
            );
        });

        test('should handle errors during focus gracefully', () => {
            mockCyData.cy.animate.mockImplementation(() => {
                throw new Error('Animation failed');
            });

            const result = cameraManager.focusOnNode('node-1');

            expect(result).toBe(false);
        });
    });

    describe('Node Search', () => {
        beforeEach(() => {
            mockCyData.createNode('file-1', {
                label: 'UserService.ts',
                type: 'file',
                path: '/src/services/UserService.ts'
            });

            mockCyData.createNode('class-1', {
                label: 'UserController',
                type: 'class',
                path: '/src/controllers/UserController.ts'
            });

            mockCyData.createNode('function-1', {
                label: 'getUserById',
                type: 'function',
                path: '/src/utils/user-utils.ts'
            });
        });

        test('should find nodes by exact ID match', () => {
            const results = cameraManager.searchNodes('file-1');

            expect(results).toHaveLength(1);
            expect(results[0].nodeId).toBe('file-1');
            expect(results[0].matchScore).toBe(1000);
        });

        test('should find nodes by exact label match', () => {
            const results = cameraManager.searchNodes('UserController');

            expect(results).toHaveLength(1);
            expect(results[0].nodeId).toBe('class-1');
            expect(results[0].matchScore).toBe(900);
        });

        test('should find nodes by partial label match', () => {
            const results = cameraManager.searchNodes('User');

            expect(results.length).toBeGreaterThan(0);
            expect(results.some(r => r.nodeId === 'file-1')).toBe(true);
            expect(results.some(r => r.nodeId === 'class-1')).toBe(true);
        });

        test('should find nodes by path match', () => {
            const results = cameraManager.searchNodes('services');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].nodeId).toBe('file-1');
        });

        test('should rank results by match quality', () => {
            const results = cameraManager.searchNodes('user');

            // Exact label matches should rank higher than partial path matches
            expect(results[0].matchScore).toBeGreaterThan(results[results.length - 1].matchScore);
        });

        test('should limit results to max count', () => {
            // Add more nodes
            for (let i = 0; i < 30; i++) {
                mockCyData.createNode(`node-${i}`, {
                    label: `UserNode${i}`
                });
            }

            const results = cameraManager.searchNodes('User', 10);

            expect(results.length).toBeLessThanOrEqual(10);
        });

        test('should return empty array for empty query', () => {
            const results = cameraManager.searchNodes('');

            expect(results).toHaveLength(0);
        });

        test('should return empty array when Cytoscape is null', () => {
            mockStateManager.getCy.mockReturnValue(null);
            const manager = new CameraManager(mockVscode, mockStateManager);

            const results = manager.searchNodes('test');

            expect(results).toHaveLength(0);
        });

        test('should perform fuzzy word matching', () => {
            mockCyData.createNode('complex-1', {
                label: 'UserAuthenticationService'
            });

            const results = cameraManager.searchNodes('Auth Service');

            expect(results.some(r => r.nodeId === 'complex-1')).toBe(true);
        });
    });

    describe('Find Node by ID', () => {
        beforeEach(() => {
            mockCyData.createNode('test-node', {
                label: 'Test Node',
                type: 'class'
            });
        });

        test('should find node by exact ID', () => {
            const result = cameraManager.findNodeById('test-node');

            expect(result).not.toBeNull();
            expect(result?.nodeId).toBe('test-node');
            expect(result?.label).toBe('Test Node');
            expect(result?.matchScore).toBe(1000);
        });

        test('should return null for non-existent node', () => {
            const result = cameraManager.findNodeById('non-existent');

            expect(result).toBeNull();
        });

        test('should return null when Cytoscape is null', () => {
            mockStateManager.getCy.mockReturnValue(null);
            const manager = new CameraManager(mockVscode, mockStateManager);

            const result = manager.findNodeById('test-node');

            expect(result).toBeNull();
        });
    });

    describe('Focus on Search', () => {
        beforeEach(() => {
            mockCyData.createNode('node-1', { label: 'SearchTarget' });
            mockCyData.createNode('node-2', { label: 'OtherNode' });
        });

        test('should focus on first search result', () => {
            const result = cameraManager.focusOnSearch('SearchTarget');

            expect(result).toBe(true);
            expect(mockStyleManager.applyInteraction).toHaveBeenCalled();
        });

        test('should return false when no matches found', () => {
            const result = cameraManager.focusOnSearch('NonExistent');

            expect(result).toBe(false);
            expect(mockStyleManager.applyInteraction).not.toHaveBeenCalled();
        });

        test('should pass options to focusOnNode', () => {
            const options: FocusOptions = { zoom: 2.0, animate: false };

            cameraManager.focusOnSearch('SearchTarget', options);

            expect(mockCyData.cy.zoom).toHaveBeenCalledWith(2.0);
        });
    });

    describe('Fit Multiple Nodes', () => {
        beforeEach(() => {
            mockCyData.createNode('node-1', { label: 'Node 1' });
            mockCyData.createNode('node-2', { label: 'Node 2' });
            mockCyData.createNode('node-3', { label: 'Node 3' });
        });

        test('should fit multiple nodes in view with animation', () => {
            const result = cameraManager.fitNodes(['node-1', 'node-2', 'node-3']);

            expect(result).toBe(true);
            expect(mockCyData.cy.animate).toHaveBeenCalledWith(
                expect.objectContaining({
                    fit: expect.any(Object)
                })
            );
        });

        test('should fit nodes without animation when animate is false', () => {
            const result = cameraManager.fitNodes(['node-1', 'node-2'], { animate: false });

            expect(result).toBe(true);
            expect(mockCyData.cy.fit).toHaveBeenCalled();
            expect(mockCyData.cy.animate).not.toHaveBeenCalled();
        });

        test('should return false when no valid nodes found', () => {
            const result = cameraManager.fitNodes(['non-existent-1', 'non-existent-2']);

            expect(result).toBe(false);
        });

        test('should fit only valid nodes when some IDs are invalid', () => {
            const result = cameraManager.fitNodes(['node-1', 'non-existent', 'node-2']);

            expect(result).toBe(true);
        });

        test('should use custom padding when provided', () => {
            const options: FocusOptions = { padding: 200, animate: false };

            cameraManager.fitNodes(['node-1', 'node-2'], options);

            expect(mockCyData.cy.fit).toHaveBeenCalledWith(
                expect.any(Object),
                200
            );
        });

        test('should handle errors during fit gracefully', () => {
            mockCyData.cy.fit.mockImplementation(() => {
                throw new Error('Fit failed');
            });

            const result = cameraManager.fitNodes(['node-1'], { animate: false });

            expect(result).toBe(false);
        });

        test('should return false when Cytoscape is null', () => {
            mockStateManager.getCy.mockReturnValue(null);
            const manager = new CameraManager(mockVscode, mockStateManager);

            const result = manager.fitNodes(['node-1']);

            expect(result).toBe(false);
        });
    });

    describe('Edge Cases', () => {
        test('should handle viewport calculation with very small nodes', () => {
            const tinyNode = mockCyData.createNode('tiny', {
                position: { x: 100, y: 100 }
            });
            tinyNode.boundingBox = () => ({ x1: 99, y1: 99, x2: 101, y2: 101, w: 2, h: 2 });

            const result = cameraManager.focusOnNode('tiny', { animate: false });

            expect(result).toBe(true);
            expect(mockCyData.cy.zoom).toHaveBeenCalled();
        });

        test('should handle viewport calculation with very large nodes', () => {
            const largeNode = mockCyData.createNode('large', {
                position: { x: 500, y: 500 }
            });
            largeNode.boundingBox = () => ({ x1: 0, y1: 0, x2: 1000, y2: 1000, w: 1000, h: 1000 });

            const result = cameraManager.focusOnNode('large', { animate: false });

            expect(result).toBe(true);
            expect(mockCyData.cy.zoom).toHaveBeenCalled();
        });

        test('should handle concurrent focus operations', async () => {
            mockCyData.createNode('node-1');
            mockCyData.createNode('node-2');

            const promise1 = Promise.resolve(cameraManager.focusOnNode('node-1'));
            const promise2 = Promise.resolve(cameraManager.focusOnNode('node-2'));

            const [result1, result2] = await Promise.all([promise1, promise2]);

            expect(result1).toBe(true);
            expect(result2).toBe(true);
        });
    });
});
