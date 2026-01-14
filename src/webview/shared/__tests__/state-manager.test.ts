/**
 * Tests for StateManager
 * 
 * Tests centralized state management for the webview including:
 * - Cytoscape instance management
 * - Configuration state
 * - Expand level management
 * - UI state (onboarding)
 */

import { StateManager } from '../state-manager';
import { createMockCytoscape } from '../../../__tests__/mocks/cytoscape.mock';

describe('StateManager', () => {
  let stateManager: StateManager;
  let mockCy: any;

  beforeEach(() => {
    stateManager = new StateManager();
    mockCy = createMockCytoscape();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Cytoscape Instance Management', () => {
    it('should initialize with null cy instance', () => {
      expect(stateManager.getCy()).toBeNull();
    });

    it('should set and get cy instance', () => {
      stateManager.setCy(mockCy);
      expect(stateManager.getCy()).toBe(mockCy);
    });

    it('should allow cy instance to be replaced', () => {
      const mockCy2 = createMockCytoscape();
      stateManager.setCy(mockCy);
      stateManager.setCy(mockCy2);
      expect(stateManager.getCy()).toBe(mockCy2);
    });
  });

  describe('Configuration State', () => {
    it('should initialize with null cytoscape styles', () => {
      expect(stateManager.getCytoscapeStyles()).toBeNull();
    });

    it('should set and get cytoscape styles', () => {
      const mockStyles = [{ selector: 'node', style: { 'background-color': '#fff' } }];
      stateManager.setCytoscapeStyles(mockStyles);
      expect(stateManager.getCytoscapeStyles()).toBe(mockStyles);
    });

    it('should initialize with null layout config function', () => {
      expect(stateManager.getLayoutConfig()).toBeNull();
    });

    it('should set and get layout config function', () => {
      const mockLayoutFn = jest.fn((layoutName: string, nodeCount: number) => ({
        name: layoutName,
        animate: true,
      }));
      stateManager.setLayoutConfig(mockLayoutFn);
      expect(stateManager.getLayoutConfig()).toBe(mockLayoutFn);
    });

    it('should initialize as not ready', () => {
      expect(stateManager.isReady()).toBe(false);
    });

    it('should set and get config ready state', () => {
      stateManager.setConfigReady(true);
      expect(stateManager.isReady()).toBe(true);

      stateManager.setConfigReady(false);
      expect(stateManager.isReady()).toBe(false);
    });
  });

  describe('Expand Level Management', () => {
    it('should initialize with expand level 0', () => {
      expect(stateManager.getExpandLevel()).toBe(0);
    });

    it('should increment expand level', () => {
      stateManager.incrementExpandLevel();
      expect(stateManager.getExpandLevel()).toBe(1);

      stateManager.incrementExpandLevel();
      expect(stateManager.getExpandLevel()).toBe(2);
    });

    it('should cap expand level at 3', () => {
      stateManager.incrementExpandLevel();
      stateManager.incrementExpandLevel();
      stateManager.incrementExpandLevel();
      stateManager.incrementExpandLevel();
      stateManager.incrementExpandLevel();
      expect(stateManager.getExpandLevel()).toBe(3);
    });

    it('should reset expand level to 0', () => {
      stateManager.incrementExpandLevel();
      stateManager.incrementExpandLevel();
      expect(stateManager.getExpandLevel()).toBe(2);

      stateManager.resetExpandLevel();
      expect(stateManager.getExpandLevel()).toBe(0);
    });

    it('should handle multiple reset calls', () => {
      stateManager.incrementExpandLevel();
      stateManager.resetExpandLevel();
      stateManager.resetExpandLevel();
      expect(stateManager.getExpandLevel()).toBe(0);
    });
  });

  describe('UI State Management', () => {
    it('should initialize with hasSeenOnboarding as false', () => {
      expect(stateManager.hasUserSeenOnboarding()).toBe(false);
    });

    it('should set and get onboarding state', () => {
      stateManager.setHasSeenOnboarding(true);
      expect(stateManager.hasUserSeenOnboarding()).toBe(true);

      stateManager.setHasSeenOnboarding(false);
      expect(stateManager.hasUserSeenOnboarding()).toBe(false);
    });
  });

  describe('Integration Tests', () => {
    it('should maintain state across multiple operations', () => {
      // Set up complete state
      stateManager.setCy(mockCy);
      stateManager.setCytoscapeStyles([{ selector: 'node' }]);
      stateManager.setLayoutConfig(() => ({ name: 'fcose' }));
      stateManager.setConfigReady(true);
      stateManager.setHasSeenOnboarding(true);
      stateManager.incrementExpandLevel();

      // Verify all state is maintained
      expect(stateManager.getCy()).toBe(mockCy);
      expect(stateManager.getCytoscapeStyles()).toEqual([{ selector: 'node' }]);
      expect(stateManager.getLayoutConfig()).toBeDefined();
      expect(stateManager.isReady()).toBe(true);
      expect(stateManager.hasUserSeenOnboarding()).toBe(true);
      expect(stateManager.getExpandLevel()).toBe(1);
    });

    it('should allow partial state updates', () => {
      stateManager.setCy(mockCy);
      expect(stateManager.getCy()).toBe(mockCy);
      expect(stateManager.isReady()).toBe(false);

      stateManager.setConfigReady(true);
      expect(stateManager.getCy()).toBe(mockCy);
      expect(stateManager.isReady()).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle setting cy to null', () => {
      stateManager.setCy(mockCy);
      stateManager.setCy(null);
      expect(stateManager.getCy()).toBeNull();
    });

    it('should handle setting styles to empty array', () => {
      stateManager.setCytoscapeStyles([]);
      expect(stateManager.getCytoscapeStyles()).toEqual([]);
    });

    it('should handle rapid expand level changes', () => {
      for (let i = 0; i < 10; i++) {
        stateManager.incrementExpandLevel();
      }
      expect(stateManager.getExpandLevel()).toBe(3);

      stateManager.resetExpandLevel();
      expect(stateManager.getExpandLevel()).toBe(0);
    });
  });
});


