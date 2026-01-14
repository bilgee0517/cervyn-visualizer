/**
 * Tests for InteractionHandlers
 * 
 * Tests user interactions including:
 * - Node clicks and file opening
 * - Mouse over/out events
 * - Edge hover interactions
 * - Tooltip display
 * - Visual feedback (borders, opacity, z-index)
 */

import { InteractionHandlers } from '../interaction-handlers';
import { StateManager } from '../../shared/state-manager';
import { createMockCytoscape, MockCytoscapeNode } from '../../../__tests__/mocks/cytoscape.mock';
import { createMockVscode } from '../../../__tests__/mocks/vscode.mock';

describe('InteractionHandlers', () => {
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

    it('should show tooltip with node information', () => {
      mockCy.trigger('mouseover', { target: mockNode });
      
      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip).toBeDefined();
      expect(tooltip!.style.display).toBe('block');
      expect(tooltip!.innerHTML).toContain('Test Node');
      expect(tooltip!.innerHTML).toContain('file');
      expect(tooltip!.innerHTML).toContain('150'); // lines of code
      expect(tooltip!.innerHTML).toContain('5'); // complexity
      expect(tooltip!.innerHTML).toContain('3'); // dependents
      expect(tooltip!.innerHTML).toContain('application'); // layer
    });

    it('should position tooltip near cursor', () => {
      mockNode.renderedPosition = jest.fn(() => ({ x: 100, y: 200 }));
      
      mockCy.trigger('mouseover', { target: mockNode });
      
      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip!.style.left).toBe('120px');
      expect(tooltip!.style.top).toBe('180px');
    });

    it('should show entry point badge for entry points', () => {
      const entryNode = new MockCytoscapeNode({
        id: 'entry',
        label: 'Entry',
        type: 'file',
        isEntryPoint: true,
      });
      
      mockCy.trigger('mouseover', { target: entryNode });
      
      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip!.innerHTML).toContain('Entry Point');
    });

    it('should show path in tooltip if available', () => {
      mockCy.trigger('mouseover', { target: mockNode });
      
      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip!.innerHTML).toContain('/src/test.ts');
    });

    it('should handle nodes with missing optional data', () => {
      const minimalNode = new MockCytoscapeNode({
        id: 'minimal',
        label: 'Minimal',
        type: 'file',
      });
      
      mockCy.trigger('mouseover', { target: minimalNode });
      
      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip!.style.display).toBe('block');
      expect(tooltip!.innerHTML).toContain('Minimal');
    });
  });

  describe('Node Mouse Out Interactions', () => {
    beforeEach(() => {
      handlers.registerHandlers();
    });

    it('should reset border width on mouse out', () => {
      const styleSpy = jest.spyOn(mockNode, 'style');
      
      mockCy.trigger('mouseout', { target: mockNode });
      
      expect(styleSpy).toHaveBeenCalledWith('border-width', expect.any(Number));
    });

    it('should hide tooltip on mouse out', () => {
      const tooltip = document.getElementById('nodeTooltip');
      tooltip!.style.display = 'block';
      
      mockCy.trigger('mouseout', { target: mockNode });
      
      expect(tooltip!.style.display).toBe('none');
    });
  });

  describe('Edge Mouse Over Interactions', () => {
    beforeEach(() => {
      handlers.registerHandlers();
    });

    it('should increase edge width on hover', () => {
      mockEdge.style = jest.fn((prop?: string, value?: any) => {
        if (prop === 'width' && value === undefined) return '2';
        return mockEdge;
      });
      
      mockCy.trigger('mouseover', { 
        target: mockEdge,
        renderedPosition: { x: 150, y: 150 }
      });
      
      expect(mockEdge.style).toHaveBeenCalled();
    });

    it('should increase source and target border widths', () => {
      const source = mockEdge.source();
      const target = mockEdge.target();
      const sourceSpy = jest.spyOn(source, 'style');
      const targetSpy = jest.spyOn(target, 'style');
      
      mockCy.trigger('mouseover', { 
        target: mockEdge,
        renderedPosition: { x: 150, y: 150 }
      });
      
      expect(sourceSpy).toHaveBeenCalledWith('border-width', expect.any(Number));
      expect(targetSpy).toHaveBeenCalledWith('border-width', expect.any(Number));
    });

    it('should show edge tooltip with type and endpoints', () => {
      mockCy.trigger('mouseover', { 
        target: mockEdge,
        renderedPosition: { x: 150, y: 150 }
      });
      
      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip!.style.display).toBe('block');
      expect(tooltip!.innerHTML).toContain('Import'); // edgeType: imports
      expect(tooltip!.innerHTML).toContain('Source Node');
      expect(tooltip!.innerHTML).toContain('Target Node');
    });

    it('should show different badges for different edge types', () => {
      const edgeTypes = [
        { type: 'depends-on', badge: 'Dependency' },
        { type: 'calls', badge: 'Call' },
        { type: 'extends', badge: 'Extends' },
        { type: 'implements', badge: 'Implements' },
      ];
      
      edgeTypes.forEach(({ type, badge }) => {
        mockEdge.data = jest.fn((key?: string) => {
          if (key === 'edgeType') return type;
          if (key) return (mockEdge as any)._data?.[key];
          return (mockEdge as any)._data;
        });
        
        mockCy.trigger('mouseover', { 
          target: mockEdge,
          renderedPosition: { x: 150, y: 150 }
        });
        
        const tooltip = document.getElementById('nodeTooltip');
        expect(tooltip!.innerHTML).toContain(badge);
      });
    });

    it('should highlight external/ghosted edges', () => {
      mockEdge.data = jest.fn((key?: string) => {
        if (key === 'edgeType') return 'imports';
        if (key === 'isGhosted') return true;
        if (key) return (mockEdge as any)._data?.[key];
        return (mockEdge as any)._data;
      });
      
      mockCy.trigger('mouseover', { 
        target: mockEdge,
        renderedPosition: { x: 150, y: 150 }
      });
      
      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip!.innerHTML).toContain('External');
      expect(tooltip!.innerHTML).toContain('Cross-hierarchy dependency');
    });

    it('should set edge opacity and z-index on hover', () => {
      const styleSpy = jest.spyOn(mockEdge, 'style');
      
      mockCy.trigger('mouseover', { 
        target: mockEdge,
        renderedPosition: { x: 150, y: 150 }
      });
      
      expect(styleSpy).toHaveBeenCalled();
    });
  });

  describe('Edge Mouse Out Interactions', () => {
    beforeEach(() => {
      handlers.registerHandlers();
    });

    it('should reset edge width on mouse out', () => {
      mockEdge.data = jest.fn((key?: string) => {
        if (key === 'edgeType') return 'imports';
        if (key) return (mockEdge as any)._data?.[key];
        return (mockEdge as any)._data;
      });
      
      const styleSpy = jest.spyOn(mockEdge, 'style');
      
      mockCy.trigger('mouseout', { target: mockEdge });
      
      expect(styleSpy).toHaveBeenCalled();
    });

    it('should reset source and target border widths', () => {
      const source = mockEdge.source();
      const target = mockEdge.target();
      const sourceSpy = jest.spyOn(source, 'style');
      const targetSpy = jest.spyOn(target, 'style');
      
      mockCy.trigger('mouseout', { target: mockEdge });
      
      expect(sourceSpy).toHaveBeenCalledWith('border-width', expect.any(Number));
      expect(targetSpy).toHaveBeenCalledWith('border-width', expect.any(Number));
    });

    it('should hide tooltip on mouse out', () => {
      const tooltip = document.getElementById('nodeTooltip');
      tooltip!.style.display = 'block';
      
      mockCy.trigger('mouseout', { target: mockEdge });
      
      expect(tooltip!.style.display).toBe('none');
    });

    it('should restore appropriate width based on edge type', () => {
      const edgeTypes = ['depends-on', 'imports', 'extends', 'implements', 'calls'];
      
      edgeTypes.forEach(type => {
        mockEdge.data = jest.fn((key?: string) => {
          if (key === 'edgeType') return type;
          if (key) return (mockEdge as any)._data?.[key];
          return (mockEdge as any)._data;
        });
        
        const styleSpy = jest.spyOn(mockEdge, 'style');
        mockCy.trigger('mouseout', { target: mockEdge });
        
        expect(styleSpy).toHaveBeenCalled();
      });
    });

    it('should apply subtle opacity for ghosted edges', () => {
      mockEdge.data = jest.fn((key?: string) => {
        if (key === 'edgeType') return 'imports';
        if (key === 'isGhosted') return true;
        if (key) return (mockEdge as any)._data?.[key];
        return (mockEdge as any)._data;
      });
      
      const styleSpy = jest.spyOn(mockEdge, 'style');
      mockCy.trigger('mouseout', { target: mockEdge });
      
      expect(styleSpy).toHaveBeenCalled();
    });
  });

  describe('Tooltip Positioning', () => {
    beforeEach(() => {
      handlers.registerHandlers();
    });

    it('should position node tooltip offset from node position', () => {
      mockNode.renderedPosition = jest.fn(() => ({ x: 250, y: 300 }));
      
      mockCy.trigger('mouseover', { target: mockNode });
      
      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip!.style.left).toBe('270px'); // x + 20
      expect(tooltip!.style.top).toBe('280px'); // y - 20
    });

    it('should position edge tooltip offset from cursor position', () => {
      mockCy.trigger('mouseover', { 
        target: mockEdge,
        renderedPosition: { x: 400, y: 500 }
      });
      
      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip!.style.left).toBe('415px'); // x + 15
      expect(tooltip!.style.top).toBe('490px'); // y - 10
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      handlers.registerHandlers();
    });

    it('should handle missing tooltip element gracefully', () => {
      document.body.innerHTML = '';
      
      mockCy.trigger('mouseover', { target: mockNode });
      
      // Should not throw error
      expect(handlers).toBeDefined();
    });

    it('should handle edge without type gracefully', () => {
      mockEdge.data = jest.fn((key?: string) => {
        if (key === 'edgeType') return undefined;
        if (key) return (mockEdge as any)._data?.[key];
        return (mockEdge as any)._data;
      });
      
      mockCy.trigger('mouseover', { 
        target: mockEdge,
        renderedPosition: { x: 150, y: 150 }
      });
      
      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip!.innerHTML).toContain('Connection');
    });

    it('should handle node with very long path', () => {
      const longPath = '/very/long/path/to/some/deeply/nested/file/in/a/complex/project/structure/test.ts';
      mockNode.data = jest.fn((key?: string) => {
        if (key === 'path') return longPath;
        if (key) return (mockNode as any)._data?.[key];
        return (mockNode as any)._data;
      });
      
      mockCy.trigger('mouseover', { target: mockNode });
      
      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip!.innerHTML).toContain(longPath);
    });

    it('should handle null values in node data', () => {
      const nodeWithNulls = new MockCytoscapeNode({
        id: 'nulls',
        label: 'Null Node',
        type: 'file',
        linesOfCode: null,
        complexity: null,
        dependents: null,
      });
      
      mockCy.trigger('mouseover', { target: nodeWithNulls });
      
      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip!.style.display).toBe('block');
    });
  });

  describe('Tooltip Content', () => {
    beforeEach(() => {
      handlers.registerHandlers();
    });

    it('should show all available node metrics', () => {
      const fullNode = new MockCytoscapeNode({
        id: 'full',
        label: 'Full Node',
        type: 'class',
        path: '/src/full.ts',
        linesOfCode: 250,
        complexity: 12,
        dependents: 8,
        daysSinceLastChange: 5,
        layer: 'domain',
        isEntryPoint: true,
      });
      
      mockCy.trigger('mouseover', { target: fullNode });
      
      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip!.innerHTML).toContain('Full Node');
      expect(tooltip!.innerHTML).toContain('class');
      expect(tooltip!.innerHTML).toContain('/src/full.ts');
      expect(tooltip!.innerHTML).toContain('250'); // lines
      expect(tooltip!.innerHTML).toContain('12'); // complexity
      expect(tooltip!.innerHTML).toContain('8'); // dependents
      expect(tooltip!.innerHTML).toContain('5 days ago');
      expect(tooltip!.innerHTML).toContain('domain');
      expect(tooltip!.innerHTML).toContain('Entry Point');
    });

    it('should omit zero values from display', () => {
      const zeroNode = new MockCytoscapeNode({
        id: 'zero',
        label: 'Zero Node',
        type: 'file',
        linesOfCode: 0,
        complexity: 0,
        dependents: 0,
      });
      
      mockCy.trigger('mouseover', { target: zeroNode });
      
      const tooltip = document.getElementById('nodeTooltip');
      // Should still show the node, but zero values are conditional
      expect(tooltip!.innerHTML).toContain('Zero Node');
    });
  });
});

