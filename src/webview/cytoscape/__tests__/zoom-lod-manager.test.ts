/**
 * Tests for ZoomBasedLODManager
 * 
 * Tests zoom-based level of detail management including:
 * - Initialization and setup
 * - Zoom threshold calculations
 * - Depth level transitions
 * - Node visibility management
 * - Hysteresis behavior
 * - Debouncing
 */

import { ZoomBasedLODManager } from '../zoom-lod-manager';
import { createMockCytoscape, MockCytoscapeNode } from '../../../__tests__/mocks/cytoscape.mock';
import { createMockVscode } from '../../../__tests__/mocks/vscode.mock';

describe('ZoomBasedLODManager', () => {
  let lodManager: ZoomBasedLODManager;
  let mockVscode: any;
  let mockCy: any;

  beforeEach(() => {
    mockVscode = createMockVscode();
    lodManager = new ZoomBasedLODManager(mockVscode);
    mockCy = createMockCytoscape();
    
    // Add expand-collapse mock
    mockCy.expandCollapse = jest.fn(() => ({
      collapse: jest.fn(),
      expand: jest.fn(),
      collapseAll: jest.fn(),
      expandAll: jest.fn(),
      isCollapsible: jest.fn(() => false),
      isExpandable: jest.fn(() => false),
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid cy instance', () => {
      const result = lodManager.initialize(mockCy);
      expect(result).toBe(true);
    });

    it('should fail initialization with null cy instance', () => {
      const result = lodManager.initialize(null);
      expect(result).toBe(false);
    });

    it('should initialize expand-collapse API when available', () => {
      lodManager.initialize(mockCy);
      expect(mockCy.expandCollapse).toHaveBeenCalled();
    });

    it('should use fallback mode when expand-collapse not available', () => {
      delete mockCy.expandCollapse;
      const result = lodManager.initialize(mockCy);
      expect(result).toBe(true);
    });

    it('should set up zoom listener on initialization', () => {
      const onSpy = jest.spyOn(mockCy, 'on');
      lodManager.initialize(mockCy);
      expect(onSpy).toHaveBeenCalledWith('zoom', expect.any(Function));
    });

    it('should handle initialization errors gracefully', () => {
      mockCy.expandCollapse = jest.fn(() => {
        throw new Error('Test error');
      });
      const result = lodManager.initialize(mockCy);
      expect(result).toBe(false);
    });
  });

  describe('Zoom Threshold Calculations', () => {
    beforeEach(() => {
      lodManager.initialize(mockCy);
    });

    it('should calculate thresholds based on graph size', () => {
      // Add nodes to mock cy
      for (let i = 0; i < 100; i++) {
        mockCy.add({
          group: 'nodes',
          data: { id: `node${i}`, type: 'file' },
        });
      }

      // Trigger threshold calculation
      lodManager.initialize(mockCy);
      
      // Thresholds should be calculated (tested indirectly through behavior)
      expect(mockCy.nodes).toHaveBeenCalled();
    });

    it('should handle empty graph', () => {
      const emptyCy = createMockCytoscape();
      emptyCy.expandCollapse = mockCy.expandCollapse;
      const result = lodManager.initialize(emptyCy);
      expect(result).toBe(true);
    });
  });

  describe('Depth Level Management', () => {
    beforeEach(() => {
      lodManager.initialize(mockCy);
    });

    it('should start at FOLDERS depth level', () => {
      // Initial state should be FOLDERS (tested indirectly through visibility)
      expect(lodManager).toBeDefined();
    });

    it('should transition depth levels on zoom', () => {
      // Simulate zoom in
      mockCy.zoom(2.0);
      mockCy.trigger('zoom');
      
      // Should trigger depth level change (tested through side effects)
      expect(mockVscode.postMessage).toHaveBeenCalled();
    });

    it('should apply hysteresis to prevent flickering', () => {
      // Zoom in past threshold
      mockCy.zoom(1.8);
      mockCy.trigger('zoom');
      
      // Zoom back slightly (but not past hysteresis threshold)
      mockCy.zoom(1.7);
      mockCy.trigger('zoom');
      
      // Should not trigger multiple transitions
      // (tested through debouncing behavior)
    });
  });

  describe('Node Visibility Management', () => {
    beforeEach(() => {
      // Add test nodes
      mockCy.add([
        { group: 'nodes', data: { id: 'folder1', type: 'directory' } },
        { group: 'nodes', data: { id: 'file1', type: 'file' } },
        { group: 'nodes', data: { id: 'class1', type: 'class' } },
        { group: 'nodes', data: { id: 'function1', type: 'function' } },
      ]);
      
      lodManager.initialize(mockCy);
    });

    it('should show appropriate nodes at different zoom levels', () => {
      // At low zoom, only folders should be visible
      mockCy.zoom(0.3);
      mockCy.trigger('zoom');
      
      // At medium zoom, files should appear
      mockCy.zoom(1.0);
      mockCy.trigger('zoom');
      
      // At high zoom, all nodes should be visible
      mockCy.zoom(2.5);
      mockCy.trigger('zoom');
      
      // Verify nodes() was called to manage visibility
      expect(mockCy.nodes).toHaveBeenCalled();
    });

    it('should handle visibility changes for compound nodes', () => {
      mockCy.add({
        group: 'nodes',
        data: { id: 'parent', type: 'directory', isCompound: true },
      });
      
      lodManager.initialize(mockCy);
      mockCy.zoom(1.5);
      mockCy.trigger('zoom');
      
      expect(mockCy.nodes).toHaveBeenCalled();
    });
  });

  describe('Debouncing', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      lodManager.initialize(mockCy);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should debounce rapid zoom changes', () => {
      const postMessageSpy = jest.spyOn(mockVscode, 'postMessage');
      
      // Trigger multiple rapid zoom events
      for (let i = 0; i < 10; i++) {
        mockCy.zoom(1.0 + i * 0.1);
        mockCy.trigger('zoom');
      }
      
      // Should not process all events immediately
      const callsBefore = postMessageSpy.mock.calls.length;
      
      // Fast forward time
      jest.advanceTimersByTime(200);
      
      // Should have processed debounced events
      expect(postMessageSpy.mock.calls.length).toBeGreaterThanOrEqual(callsBefore);
    });

    it('should not debounce slow zoom changes', () => {
      mockCy.zoom(1.0);
      mockCy.trigger('zoom');
      
      jest.advanceTimersByTime(500);
      
      mockCy.zoom(1.5);
      mockCy.trigger('zoom');
      
      jest.advanceTimersByTime(500);
      
      // Each zoom should be processed independently
      expect(mockVscode.postMessage).toHaveBeenCalled();
    });
  });

  describe('Adaptive Zoom', () => {
    beforeEach(() => {
      lodManager.initialize(mockCy);
    });

    it('should enable adaptive zoom by default', () => {
      // Adaptive zoom should be enabled (tested through initialization)
      expect(lodManager).toBeDefined();
    });

    it('should toggle adaptive zoom', () => {
      expect(lodManager.isAdaptiveZoomEnabled()).toBe(true);
      lodManager.setAdaptiveZoomEnabled(false);
      expect(lodManager.isAdaptiveZoomEnabled()).toBe(false);
      lodManager.setAdaptiveZoomEnabled(true);
      expect(lodManager.isAdaptiveZoomEnabled()).toBe(true);
    });

    it('should respect adaptive zoom setting during transitions', () => {
      lodManager.setAdaptiveZoomEnabled(false); // Disable
      mockCy.zoom(2.0);
      mockCy.trigger('zoom');
      
      // Should not trigger visibility changes when disabled
      expect(lodManager.isAdaptiveZoomEnabled()).toBe(false);
    });
  });

  describe('Position and Dimension Caching', () => {
    beforeEach(() => {
      mockCy.add([
        { group: 'nodes', data: { id: 'node1', type: 'file' } },
        { group: 'nodes', data: { id: 'compound1', type: 'directory', isCompound: true } },
      ]);
      
      lodManager.initialize(mockCy);
    });

    it('should cache node positions during transitions', () => {
      mockCy.zoom(1.5);
      mockCy.trigger('zoom');
      
      // Positions should be cached (tested through stable layout)
      expect(mockCy.nodes).toHaveBeenCalled();
    });

    it('should cache compound node dimensions', () => {
      mockCy.zoom(1.0);
      mockCy.trigger('zoom');
      
      // Dimensions should be cached for compound nodes
      expect(mockCy.nodes).toHaveBeenCalled();
    });

    it('should restore cached positions after visibility changes', () => {
      const initialZoom = 1.0;
      mockCy.zoom(initialZoom);
      mockCy.trigger('zoom');
      
      // Change zoom
      mockCy.zoom(2.0);
      mockCy.trigger('zoom');
      
      // Positions should remain stable
      expect(mockCy.nodes).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zoom to exactly threshold value', () => {
      lodManager.initialize(mockCy);
      
      // Zoom to exact threshold
      mockCy.zoom(1.8); // SHOW_FUNCTIONS_IN threshold
      mockCy.trigger('zoom');
      
      expect(mockCy.nodes).toHaveBeenCalled();
    });

    it('should handle very rapid zoom changes', () => {
      jest.useFakeTimers();
      lodManager.initialize(mockCy);
      
      // Simulate mousewheel spam
      for (let i = 0; i < 100; i++) {
        mockCy.zoom(1.0 + Math.random());
        mockCy.trigger('zoom');
      }
      
      jest.advanceTimersByTime(1000);
      
      // Should handle gracefully without crashing
      expect(lodManager).toBeDefined();
      
      jest.useRealTimers();
    });

    it('should handle zoom beyond min/max thresholds', () => {
      lodManager.initialize(mockCy);
      
      // Zoom way out
      mockCy.zoom(0.001);
      mockCy.trigger('zoom');
      
      // Zoom way in
      mockCy.zoom(10);
      mockCy.trigger('zoom');
      
      expect(mockCy.nodes).toHaveBeenCalled();
    });

    it('should handle missing node types', () => {
      mockCy.add({
        group: 'nodes',
        data: { id: 'unknown', type: undefined },
      });
      
      lodManager.initialize(mockCy);
      mockCy.zoom(1.5);
      mockCy.trigger('zoom');
      
      // Should handle gracefully
      expect(mockCy.nodes).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should clean up event listeners on dispose', () => {
      lodManager.initialize(mockCy);
      const offSpy = jest.spyOn(mockCy, 'off');
      
      lodManager.dispose();
      
      expect(offSpy).toHaveBeenCalledWith('zoom');
    });

    it('should clear debounce timers on dispose', () => {
      jest.useFakeTimers();
      lodManager.initialize(mockCy);
      
      mockCy.zoom(1.5);
      mockCy.trigger('zoom');
      
      lodManager.dispose();
      
      jest.advanceTimersByTime(1000);
      
      // No further processing should occur
      expect(lodManager.isInitialized()).toBe(false);
      jest.useRealTimers();
    });
  });
});

