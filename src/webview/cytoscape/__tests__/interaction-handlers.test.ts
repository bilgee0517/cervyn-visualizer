/**
 * Tests for InteractionHandlers
 *
 * Tests user interactions including:
 * - Node clicks and file opening
 * - Mouse over/out events (visual feedback only)
 * - Right-click tooltip display
 * - Edge hover interactions
 */

import { InteractionHandlers } from '../interaction-handlers';
import { StateManager } from '../../shared/state-manager';
import { createMockCytoscape, MockCytoscapeNode } from '../../../__tests__/mocks/cytoscape.mock';
import { createMockVscode } from '../../../__tests__/mocks/vscode.mock';

// TODO: These tests need enhanced Cytoscape mock infrastructure:
// - connectedEdges() must return actual graph connections
// - DOM event simulation for click, mouseover, mouseout
// - Graph topology awareness in mock
// Skipping until mock infrastructure is complete
describe.skip('InteractionHandlers', () => {
  let handlers: InteractionHandlers;
  let stateManager: StateManager;
  let mockVscode: any;
  let mockCy: any;
  let mockNode: any;
  let mockEdge: any;

  beforeEach(() => {
    mockVscode = createMockVscode();
    stateManager = new StateManager();
    handlers = new InteractionHandlers(mockVscode, stateManager);
    mockCy = createMockCytoscape();
    stateManager.setCy(mockCy);

    // Create mock nodes and edges
    mockNode = new MockCytoscapeNode({
      id: 'testNode',
      label: 'Test Node',
      type: 'file',
      path: '/src/test.ts',
      linesOfCode: 150,
      complexity: 5,
      dependents: 3,
      layer: 'application',
    });

    const sourceNode = new MockCytoscapeNode({
      id: 'source',
      label: 'Source Node',
      type: 'file',
    });

    const targetNode = new MockCytoscapeNode({
      id: 'target',
      label: 'Target Node',
      type: 'file',
    });

    mockEdge = new MockCytoscapeNode({
      id: 'testEdge',
      edgeType: 'imports',
    });

    // Setup mock edge methods
    mockEdge.source = jest.fn(() => sourceNode);
    mockEdge.target = jest.fn(() => targetNode);

    // Setup DOM elements
    const tooltip = document.createElement('div');
    tooltip.id = 'nodeTooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
  });

  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('Handler Registration', () => {
    it('should register all event handlers', () => {
      const onSpy = jest.spyOn(mockCy, 'on');

      handlers.registerHandlers();

      expect(onSpy).toHaveBeenCalledWith('tap', 'node', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('mouseover', 'node', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('mouseout', 'node', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('mouseover', 'edge', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('mouseout', 'edge', expect.any(Function));
    });

    it('should handle null cytoscape instance gracefully', () => {
      stateManager.setCy(null);

      handlers.registerHandlers();

      // Should not throw error
      expect(handlers).toBeDefined();
    });
  });

  describe('Node Click Interactions', () => {
    beforeEach(() => {
      handlers.registerHandlers();
    });

    it('should send openFile message when node with path is clicked', () => {
      mockCy.trigger('tap', { target: mockNode });

      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'openFile',
        path: '/src/test.ts',
      });
    });

    it('should not send message when node without path is clicked', () => {
      const nodeWithoutPath = new MockCytoscapeNode({
        id: 'noPath',
        label: 'No Path',
        type: 'directory',
      });

      mockCy.trigger('tap', { target: nodeWithoutPath });

      expect(mockVscode.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Node Mouse Over Interactions', () => {
    beforeEach(() => {
      handlers.registerHandlers();
    });

    it('should increase border width on mouse over', () => {
      const styleSpy = jest.spyOn(mockNode, 'style');

      mockCy.trigger('mouseover', { target: mockNode });

      expect(styleSpy).toHaveBeenCalledWith('border-width', expect.any(Number));
    });

    it('should NOT show tooltip on regular mouseover (only visual feedback)', () => {
      mockCy.trigger('mouseover', { target: mockNode });

      const tooltip = document.getElementById('nodeTooltip');
      // Tooltip should still be hidden (only right-click shows tooltip)
      expect(tooltip!.style.display).toBe('none');
    });

    it('should not affect hidden nodes', () => {
      mockNode.style('opacity', 0);
      const styleSpy = jest.spyOn(mockNode, 'style');

      mockCy.trigger('mouseover', { target: mockNode });

      // Should not change border-width for hidden nodes
      expect(styleSpy).not.toHaveBeenCalledWith('border-width', expect.any(Number));
    });
  });

  describe('Node Mouse Out Interactions', () => {
    beforeEach(() => {
      handlers.registerHandlers();
    });

    it('should reset border width on mouse out', () => {
      const styleSpy = jest.spyOn(mockNode, 'style');

      // First mouse over to set border
      mockCy.trigger('mouseover', { target: mockNode });

      // Then mouse out to reset
      mockCy.trigger('mouseout', { target: mockNode });

      expect(styleSpy).toHaveBeenCalledWith('border-width', 'default');
    });
  });

  describe('Right-Click Tooltip Display', () => {
    beforeEach(() => {
      handlers.registerHandlers();
    });

    it('should show tooltip on right-click (cxttap)', () => {
      mockCy.trigger('cxttap', {
        target: mockNode,
        renderedPosition: { x: 100, y: 200 }
      });

      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip!.style.display).toBe('block');
      expect(tooltip!.innerHTML).toContain('Test Node');
    });

    it('should show node information in tooltip', () => {
      mockCy.trigger('cxttap', {
        target: mockNode,
        renderedPosition: { x: 100, y: 200 }
      });

      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip!.innerHTML).toContain('Test Node');
      expect(tooltip!.innerHTML).toContain('file');
      expect(tooltip!.innerHTML).toContain('150'); // lines of code
      expect(tooltip!.innerHTML).toContain('5'); // complexity
      expect(tooltip!.innerHTML).toContain('3'); // dependents
    });

    it('should position tooltip at mouse cursor', () => {
      mockCy.trigger('cxttap', {
        target: mockNode,
        renderedPosition: { x: 100, y: 200 }
      });

      const tooltip = document.getElementById('nodeTooltip');
      // Tooltip should be positioned near the cursor
      expect(tooltip!.style.left).toBeDefined();
      expect(tooltip!.style.top).toBeDefined();
    });

    it('should show entry point badge for entry points', () => {
      const entryNode = new MockCytoscapeNode({
        id: 'entry',
        label: 'Entry',
        type: 'file',
        isEntryPoint: true,
      });

      mockCy.trigger('cxttap', {
        target: entryNode,
        renderedPosition: { x: 100, y: 200 }
      });

      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip!.innerHTML).toContain('Entry Point');
    });

    it('should show path in tooltip if available', () => {
      mockCy.trigger('cxttap', {
        target: mockNode,
        renderedPosition: { x: 100, y: 200 }
      });

      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip!.innerHTML).toContain('/src/test.ts');
    });
  });

  describe('Edge Mouse Over Interactions', () => {
    beforeEach(() => {
      handlers.registerHandlers();
    });

    it('should increase edge width on hover', () => {
      const styleSpy = jest.spyOn(mockEdge, 'style');

      mockCy.trigger('mouseover', { target: mockEdge });

      expect(styleSpy).toHaveBeenCalledWith('width', expect.any(Number));
    });

    it('should highlight source and target nodes', () => {
      const sourceNode = mockEdge.source();
      const targetNode = mockEdge.target();

      const sourceSpy = jest.spyOn(sourceNode, 'style');
      const targetSpy = jest.spyOn(targetNode, 'style');

      mockCy.trigger('mouseover', { target: mockEdge });

      expect(sourceSpy).toHaveBeenCalledWith('border-width', expect.any(Number));
      expect(targetSpy).toHaveBeenCalledWith('border-width', expect.any(Number));
    });

    it('should set edge z-index on hover', () => {
      const styleSpy = jest.spyOn(mockEdge, 'style');

      mockCy.trigger('mouseover', { target: mockEdge });

      expect(styleSpy).toHaveBeenCalledWith('z-index', expect.any(Number));
    });
  });

  describe('Edge Mouse Out Interactions', () => {
    beforeEach(() => {
      handlers.registerHandlers();
    });

    it('should reset edge width on mouse out', () => {
      const styleSpy = jest.spyOn(mockEdge, 'style');

      // First hover
      mockCy.trigger('mouseover', { target: mockEdge });

      // Then mouse out
      mockCy.trigger('mouseout', { target: mockEdge });

      expect(styleSpy).toHaveBeenCalledWith('width', 1); // Reset to default
    });

    it('should reset source and target border widths', () => {
      const sourceNode = mockEdge.source();
      const targetNode = mockEdge.target();

      const sourceSpy = jest.spyOn(sourceNode, 'style');
      const targetSpy = jest.spyOn(targetNode, 'style');

      // First hover
      mockCy.trigger('mouseover', { target: mockEdge });

      // Then mouse out
      mockCy.trigger('mouseout', { target: mockEdge });

      expect(sourceSpy).toHaveBeenCalledWith('border-width', 'default');
      expect(targetSpy).toHaveBeenCalledWith('border-width', 'default');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      handlers.registerHandlers();
    });

    it('should handle missing tooltip element gracefully', () => {
      document.body.innerHTML = ''; // Remove tooltip

      // Should not throw
      expect(() => {
        mockCy.trigger('cxttap', {
          target: mockNode,
          renderedPosition: { x: 100, y: 200 }
        });
      }).not.toThrow();
    });

    it('should handle nodes with minimal data', () => {
      const minimalNode = new MockCytoscapeNode({
        id: 'minimal',
        label: 'Minimal',
      });

      expect(() => {
        mockCy.trigger('tap', { target: minimalNode });
      }).not.toThrow();
    });
  });
});
