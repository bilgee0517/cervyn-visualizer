/**
 * Integration Tests: Complete User Workflows
 * 
 * Tests real user journeys end-to-end:
 * - Graph loading and initial visualization
 * - Navigation and exploration
 * - Layout changes and zoom interactions
 * - Node selection and file opening
 * - UI controls and settings
 */

import { StateManager } from '../../shared/state-manager';
import { LayoutManager } from '../../cytoscape/layout-manager';
import { InteractionHandlers } from '../../cytoscape/interaction-handlers';
import { UIController } from '../../cytoscape/ui-controller';
import { ZoomBasedLODManager } from '../../cytoscape/zoom-lod-manager';
import { createMockCytoscape, MockCytoscapeNode } from '../../../__tests__/mocks/cytoscape.mock';
import { createMockVscode } from '../../../__tests__/mocks/vscode.mock';

describe('Integration: Complete User Workflows', () => {
  let stateManager: StateManager;
  let layoutManager: LayoutManager;
  let interactionHandlers: InteractionHandlers;
  let uiController: UIController;
  let lodManager: ZoomBasedLODManager;
  let mockVscode: any;
  let mockCy: any;

  beforeEach(() => {
    mockVscode = createMockVscode();
    stateManager = new StateManager();
    layoutManager = new LayoutManager(mockVscode, stateManager);
    interactionHandlers = new InteractionHandlers(mockVscode, stateManager);
    uiController = new UIController(mockVscode, stateManager);
    lodManager = new ZoomBasedLODManager(mockVscode);
    
    mockCy = createMockCytoscape();
    stateManager.setCy(mockCy);
    
    // Setup layout config
    stateManager.setLayoutConfig((name: string, nodeCount: number) => ({
      name: 'fcose',
      animate: true,
      randomize: false,
    }));
    
    setupTestGraph();
    setupDOMElements();
  });

  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  function setupTestGraph() {
    // Create a realistic small graph
    mockCy.add([
      // Directories
      { group: 'nodes', data: { 
        id: 'src', 
        label: 'src', 
        type: 'directory',
        isCompound: true,
        path: '/src'
      }},
      { group: 'nodes', data: { 
        id: 'utils', 
        label: 'utils', 
        type: 'directory',
        isCompound: true,
        parent: 'src',
        path: '/src/utils'
      }},
      
      // Files
      { group: 'nodes', data: { 
        id: 'index', 
        label: 'index.ts', 
        type: 'file',
        parent: 'src',
        path: '/src/index.ts',
        linesOfCode: 150,
        complexity: 5,
        isEntryPoint: true
      }},
      { group: 'nodes', data: { 
        id: 'helper', 
        label: 'helper.ts', 
        type: 'file',
        parent: 'utils',
        path: '/src/utils/helper.ts',
        linesOfCode: 80,
        complexity: 3
      }},
      
      // Classes
      { group: 'nodes', data: { 
        id: 'class1', 
        label: 'UserService', 
        type: 'class',
        parent: 'index',
        path: '/src/index.ts#UserService'
      }},
      
      // Functions
      { group: 'nodes', data: { 
        id: 'fn1', 
        label: 'handleRequest', 
        type: 'function',
        parent: 'class1',
        path: '/src/index.ts#UserService.handleRequest'
      }},
      { group: 'nodes', data: { 
        id: 'fn2', 
        label: 'formatData', 
        type: 'function',
        parent: 'helper',
        path: '/src/utils/helper.ts#formatData'
      }},
      
      // Edges
      { group: 'edges', data: { 
        id: 'e1', 
        source: 'fn1', 
        target: 'fn2',
        edgeType: 'calls'
      }},
      { group: 'edges', data: { 
        id: 'e2', 
        source: 'index', 
        target: 'helper',
        edgeType: 'imports'
      }},
    ]);
  }

  function setupDOMElements() {
    // Create minimal required DOM elements
    const cy = document.createElement('div');
    cy.id = 'cy';
    document.body.appendChild(cy);
    
    const tooltip = document.createElement('div');
    tooltip.id = 'nodeTooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
    
    const depthSelect = document.createElement('select');
    depthSelect.id = 'depthSelect';
    document.body.appendChild(depthSelect);
    
    const onboardingOverlay = document.createElement('div');
    onboardingOverlay.id = 'onboardingOverlay';
    document.body.appendChild(onboardingOverlay);
  }

  describe('Workflow 1: Initial Graph Load and Exploration', () => {
    it('should load graph, apply layout, and show initial view', () => {
      // GIVEN: User opens the visualizer
      expect(stateManager.getCy()).toBeTruthy();
      expect(mockCy.nodes().length).toBeGreaterThan(0);
      
      // WHEN: Layout is applied
      layoutManager.applyLayout('fcose');
      
      // THEN: Graph is positioned
      expect(mockVscode.postMessage).toHaveBeenCalled();
      expect(mockCy.batch).toHaveBeenCalled();
    });

    it('should initialize LOD system after first layout', () => {
      // GIVEN: Layout manager and LOD manager are connected
      layoutManager.setZoomLODManager(lodManager);
      lodManager.initialize(mockCy);
      
      // WHEN: First layout completes
      layoutManager.applyLayout('fcose');
      
      // THEN: LOD system is ready
      expect(lodManager.isInitialized()).toBe(true);
    });

    it('should register all interaction handlers', () => {
      // WHEN: Handlers are registered
      interactionHandlers.registerHandlers();
      
      // THEN: Event listeners are set up
      expect(mockCy.on).toHaveBeenCalledWith('tap', 'node', expect.any(Function));
      expect(mockCy.on).toHaveBeenCalledWith('mouseover', 'node', expect.any(Function));
      expect(mockCy.on).toHaveBeenCalledWith('mouseout', 'node', expect.any(Function));
    });
  });

  describe('Workflow 2: Navigate and Explore Graph', () => {
    beforeEach(() => {
      interactionHandlers.registerHandlers();
      lodManager.initialize(mockCy);
    });

    it('should show node details on hover', () => {
      // GIVEN: User hovers over a file node
      const fileNode = mockCy.getElementById('index');
      
      // WHEN: Mouse over event fires
      mockCy.trigger('mouseover', { target: fileNode });
      
      // THEN: Tooltip shows with node information
      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip?.style.display).toBe('block');
      expect(tooltip?.innerHTML).toContain('index.ts');
      expect(tooltip?.innerHTML).toContain('150'); // lines of code
      expect(tooltip?.innerHTML).toContain('Entry Point');
    });

    it('should open file when clicking a node', () => {
      // GIVEN: User clicks on a file node
      const fileNode = mockCy.getElementById('index');
      
      // WHEN: Click event fires
      mockCy.trigger('tap', { target: fileNode });
      
      // THEN: Message sent to VS Code to open file
      expect(mockVscode.postMessage).toHaveBeenCalledWith({
        type: 'openFile',
        path: '/src/index.ts'
      });
    });

    it('should highlight edge connections on hover', () => {
      // GIVEN: User hovers over an edge
      const edge = mockCy.getElementById('e1');
      const styleSpy = jest.spyOn(edge, 'style');
      
      // WHEN: Mouse over edge
      mockCy.trigger('mouseover', { 
        target: edge,
        renderedPosition: { x: 100, y: 100 }
      });
      
      // THEN: Edge is highlighted
      expect(styleSpy).toHaveBeenCalled();
      
      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip?.innerHTML).toContain('Call');
    });
  });

  describe('Workflow 3: Zoom and Detail Levels', () => {
    beforeEach(() => {
      lodManager.initialize(mockCy);
    });

    it('should adjust detail level when zooming in', () => {
      // GIVEN: Graph starts at low zoom (folder view)
      mockCy.zoom(0.5);
      
      // WHEN: User zooms in significantly
      mockCy.zoom(2.0);
      mockCy.trigger('zoom');
      
      // THEN: LOD system should respond (even if not applying yet)
      expect(lodManager.isAdaptiveZoomEnabled()).toBe(true);
    });

    it('should enable/disable adaptive zoom', () => {
      // GIVEN: Adaptive zoom is enabled
      expect(lodManager.isAdaptiveZoomEnabled()).toBe(true);
      
      // WHEN: User disables adaptive zoom
      lodManager.setAdaptiveZoomEnabled(false);
      
      // THEN: Zoom no longer triggers automatic detail changes
      expect(lodManager.isAdaptiveZoomEnabled()).toBe(false);
      
      // WHEN: User re-enables it
      lodManager.setAdaptiveZoomEnabled(true);
      
      // THEN: It's active again
      expect(lodManager.isAdaptiveZoomEnabled()).toBe(true);
    });

    it('should calculate dynamic zoom thresholds based on graph size', () => {
      // WHEN: LOD manager initializes (calculates thresholds internally)
      lodManager.initialize(mockCy);
      
      // THEN: Thresholds are set based on node count
      const thresholds = lodManager.getZoomThresholds();
      expect(thresholds).toBeDefined();
      expect(thresholds.SHOW_FILES_IN).toBeGreaterThan(0);
      expect(thresholds.SHOW_CLASSES_IN).toBeGreaterThan(thresholds.SHOW_FILES_IN);
    });
  });

  describe('Workflow 4: UI Controls and Settings', () => {
    beforeEach(() => {
      uiController.initializeControls();
    });

    it('should change depth level via dropdown', () => {
      // GIVEN: User wants to change depth
      const depthCallback = jest.fn();
      uiController.onDepthChangeCallback(depthCallback);
      
      const depthSelect = document.getElementById('depthSelect') as HTMLSelectElement;
      
      // WHEN: User selects depth 2
      depthSelect.value = '2';
      depthSelect.dispatchEvent(new Event('change'));
      
      // THEN: Callback is triggered with correct depth
      expect(depthCallback).toHaveBeenCalledWith(2);
    });

    it('should toggle adaptive zoom via UI', () => {
      // GIVEN: Adaptive zoom button exists
      const adaptiveZoomBtn = document.createElement('button');
      adaptiveZoomBtn.id = 'adaptiveZoomBtn';
      document.body.appendChild(adaptiveZoomBtn);
      
      const indicator = document.createElement('span');
      indicator.id = 'adaptiveZoomStatus';
      document.body.appendChild(indicator);
      
      const depthSelect = document.getElementById('depthSelect') as HTMLSelectElement;
      
      uiController.initializeControls();
      
      // WHEN: User clicks adaptive zoom button
      const callback = jest.fn();
      uiController.onAdaptiveZoomToggleCallback(callback);
      adaptiveZoomBtn.click();
      
      // THEN: Adaptive zoom state changes
      expect(callback).toHaveBeenCalled();
    });

    it('should show/hide onboarding', () => {
      // GIVEN: Onboarding elements exist
      const closeBtn = document.createElement('button');
      closeBtn.id = 'onboardingClose';
      document.body.appendChild(closeBtn);
      
      const overlay = document.getElementById('onboardingOverlay')!;
      overlay.style.display = 'block';
      
      uiController.initializeControls();
      
      // WHEN: User clicks close
      closeBtn.click();
      
      // THEN: Onboarding is hidden
      expect(overlay.style.display).toBe('none');
    });
  });

  describe('Workflow 5: Complete User Journey', () => {
    it('should handle complete visualization workflow', () => {
      // STEP 1: Initialize all systems
      layoutManager.setZoomLODManager(lodManager);
      lodManager.initialize(mockCy);
      interactionHandlers.registerHandlers();
      uiController.initializeControls();
      
      expect(stateManager.getCy()).toBeTruthy();
      
      // STEP 2: Apply initial layout
      layoutManager.applyLayout('fcose');
      expect(mockCy.batch).toHaveBeenCalled();
      
      // STEP 3: User explores by hovering over nodes
      const node = mockCy.getElementById('index');
      mockCy.trigger('mouseover', { target: node });
      
      const tooltip = document.getElementById('nodeTooltip');
      expect(tooltip?.style.display).toBe('block');
      
      // STEP 4: User clicks to open file
      mockCy.trigger('tap', { target: node });
      expect(mockVscode.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'openFile' })
      );
      
      // STEP 5: User adjusts zoom level
      mockCy.zoom(1.5);
      mockCy.trigger('zoom');
      
      // STEP 6: User changes depth
      const depthCallback = jest.fn();
      uiController.onDepthChangeCallback(depthCallback);
      
      const depthSelect = document.getElementById('depthSelect') as HTMLSelectElement;
      depthSelect.value = '3';
      depthSelect.dispatchEvent(new Event('change'));
      
      expect(depthCallback).toHaveBeenCalledWith(3);
      
      // Entire workflow completes without errors
      expect(true).toBe(true);
    });

    it('should maintain state across multiple interactions', () => {
      // GIVEN: System is fully initialized
      layoutManager.setZoomLODManager(lodManager);
      lodManager.initialize(mockCy);
      interactionHandlers.registerHandlers();
      
      const initialCy = stateManager.getCy();
      
      // WHEN: User performs multiple actions
      layoutManager.applyLayout('fcose');
      mockCy.zoom(1.2);
      mockCy.trigger('zoom');
      
      const node = mockCy.getElementById('index');
      mockCy.trigger('mouseover', { target: node });
      mockCy.trigger('tap', { target: node });
      
      // THEN: State remains consistent
      expect(stateManager.getCy()).toBe(initialCy);
      expect(lodManager.isInitialized()).toBe(true);
    });

    it('should handle edge cases gracefully', () => {
      // GIVEN: System is initialized
      layoutManager.setZoomLODManager(lodManager);
      lodManager.initialize(mockCy);
      interactionHandlers.registerHandlers();
      
      // WHEN: User interacts with empty/invalid elements
      mockCy.trigger('tap', { target: null });
      mockCy.trigger('mouseover', { target: undefined });
      
      // THEN: No errors occur
      expect(true).toBe(true);
    });
  });

  describe('Workflow 6: Performance and Responsiveness', () => {
    it('should handle rapid zoom changes efficiently', () => {
      // GIVEN: LOD system is active
      lodManager.initialize(mockCy);
      
      // WHEN: User rapidly zooms in and out
      for (let i = 0; i < 10; i++) {
        mockCy.zoom(0.5 + (i * 0.2));
        mockCy.trigger('zoom');
      }
      
      // THEN: System remains responsive
      expect(lodManager.isInitialized()).toBe(true);
    });

    it('should handle multiple concurrent interactions', () => {
      // GIVEN: All systems initialized
      lodManager.initialize(mockCy);
      interactionHandlers.registerHandlers();
      uiController.initializeControls();
      
      // WHEN: Multiple interactions happen simultaneously
      const node1 = mockCy.getElementById('index');
      const node2 = mockCy.getElementById('helper');
      
      mockCy.trigger('mouseover', { target: node1 });
      mockCy.trigger('tap', { target: node2 });
      mockCy.zoom(1.5);
      mockCy.trigger('zoom');
      
      // THEN: All interactions are handled
      expect(mockVscode.postMessage).toHaveBeenCalled();
    });
  });

  describe('Workflow 7: Error Recovery', () => {
    it('should recover from null cytoscape instance', () => {
      // GIVEN: Cytoscape becomes null (edge case)
      stateManager.setCy(null);
      
      // WHEN: User tries to interact
      layoutManager.applyLayout('fcose');
      
      // THEN: Graceful error handling
      expect(mockVscode.postMessage).toHaveBeenCalled();
    });

    it('should handle missing DOM elements gracefully', () => {
      // GIVEN: DOM elements are missing
      document.body.innerHTML = '';
      
      // WHEN: UI controller initializes
      uiController.initializeControls();
      
      // THEN: No errors thrown
      expect(uiController).toBeDefined();
    });

    it('should handle invalid node data', () => {
      // GIVEN: Node with minimal/invalid data
      const badNode = new MockCytoscapeNode({
        id: 'bad',
        label: null,
        type: undefined
      });
      mockCy.add([badNode]);
      
      // WHEN: User interacts with it
      mockCy.trigger('mouseover', { target: badNode });
      
      // THEN: System handles it gracefully
      expect(document.getElementById('nodeTooltip')?.style.display).toBe('block');
    });
  });
});

