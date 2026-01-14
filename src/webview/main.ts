/**
 * Webview script for the codebase visualizer
 * Main entry point - coordinates all modules
 */

import { CytoscapeCore } from './cytoscape/cytoscape-core';
import { logMessage } from './shared/utils';

(function() {
    'use strict';

    const vscode = acquireVsCodeApi();
    let cytoscapeCore: CytoscapeCore;

    /**
     * Initialize the Cytoscape controller
     */
    function initialize() {
        logMessage(vscode, '[main.ts] Initializing CytoscapeCore...');
        cytoscapeCore = new CytoscapeCore(vscode);
        logMessage(vscode, '[main.ts] ✓ CytoscapeCore initialized');
    }

    /**
     * Handle messages from extension
     */
    window.addEventListener('message', event => {
        const message = event.data;
        logMessage(vscode, `[main.ts] Received message: ${message.type}`);
        
        switch (message.type) {
            case 'init': {
                try {
                    logMessage(vscode, '[main.ts] Received init config');
                    
                    // Set configuration
                    cytoscapeCore.setConfig(message.cytoscapeStyles, message.getLayoutConfig);
                    
                    // Initialize Cytoscape
                    logMessage(vscode, '[main.ts] Calling initCytoscape()...');
                    cytoscapeCore.initCytoscape();
                    logMessage(vscode, '[main.ts] ✓ initCytoscape() returned');
                    
                    // Signal ready
                    logMessage(vscode, '[main.ts] Sending ready signal...');
                    vscode.postMessage({ type: 'ready' });
                    logMessage(vscode, '[main.ts] ✓ Ready signal sent');
                } catch (error) {
                    logMessage(vscode, `[main.ts] ❌ ERROR in init handler: ${error}`);
                    vscode.postMessage({ type: 'error', message: `Failed to initialize: ${error}` });
                }
                break;
            }
                
            case 'updateGraph':
                logMessage(vscode, `[main.ts] updateGraph: ${message.graph?.nodes?.length || 0} nodes`);
                if (cytoscapeCore.isReady()) {
                    cytoscapeCore.updateGraph(message.graph, message.layout, message.activeFilePath, message.newlyAddedNodeIds);
                } else {
                    logMessage(vscode, '[main.ts] Config not ready, queuing graph update');
                    setTimeout(() => {
                        if (cytoscapeCore.isReady()) {
                            cytoscapeCore.updateGraph(message.graph, message.layout, message.activeFilePath, message.newlyAddedNodeIds);
                        }
                    }, 100);
                }
                break;
                
            case 'updateGraphIncremental':
                logMessage(vscode, `[main.ts] ========== updateGraphIncremental handler START ==========`);
                logMessage(vscode, `  - Added nodes: ${message.addedNodes?.length || 0}`);
                logMessage(vscode, `  - Added edges: ${message.addedEdges?.length || 0}`);
                logMessage(vscode, `  - Removed node IDs: ${message.removedNodeIds?.length || 0}`);
                logMessage(vscode, `  - Has full graph: ${!!message.fullGraph}`);
                logMessage(vscode, `  - cytoscapeCore exists: ${!!cytoscapeCore}`);
                logMessage(vscode, `  - cytoscapeCore.isReady(): ${cytoscapeCore?.isReady() || false}`);
                
                try {
                    if (cytoscapeCore && cytoscapeCore.isReady()) {
                        logMessage(vscode, '[main.ts] Calling cytoscapeCore.updateGraphIncremental...');
                        cytoscapeCore.updateGraphIncremental(
                            message.addedNodes || [],
                            message.addedEdges || [],
                            message.removedNodeIds || [],
                            message.fullGraph,
                            message.newlyAddedNodeIds
                        );
                        logMessage(vscode, '[main.ts] ✓ updateGraphIncremental call completed');
                    } else {
                        logMessage(vscode, '[main.ts] ⚠️  Config not ready, falling back to full update');
                        if (message.fullGraph) {
                            logMessage(vscode, '[main.ts] Scheduling full update fallback...');
                            setTimeout(() => {
                                try {
                                    if (cytoscapeCore && cytoscapeCore.isReady()) {
                                        logMessage(vscode, '[main.ts] Executing full update fallback...');
                                        cytoscapeCore.updateGraph(message.fullGraph, message.layout, message.activeFilePath);
                                        logMessage(vscode, '[main.ts] ✓ Full update fallback completed');
                                    } else {
                                        logMessage(vscode, '[main.ts] Still not ready after timeout');
                                    }
                                } catch (err) {
                                    logMessage(vscode, `[main.ts] ERROR in fallback update: ${err}`);
                                    if (err instanceof Error) {
                                        logMessage(vscode, `  - Stack: ${err.stack}`);
                                    }
                                }
                            }, 100);
                        } else {
                            logMessage(vscode, '[main.ts] ⚠️  No full graph provided for fallback');
                        }
                    }
                } catch (err) {
                    logMessage(vscode, `[main.ts] ❌ ERROR in updateGraphIncremental handler: ${err}`);
                    if (err instanceof Error) {
                        logMessage(vscode, `  - Message: ${err.message}`);
                        logMessage(vscode, `  - Stack: ${err.stack}`);
                    }
                    // Fallback to full update if available
                    if (message.fullGraph && cytoscapeCore) {
                        logMessage(vscode, '[main.ts] Attempting error fallback to full update...');
                        try {
                            cytoscapeCore.updateGraph(message.fullGraph, message.layout, message.activeFilePath);
                        } catch (fallbackErr) {
                            logMessage(vscode, `[main.ts] Fallback also failed: ${fallbackErr}`);
                        }
                    }
                }
                logMessage(vscode, `[main.ts] ========== updateGraphIncremental handler END ==========`);
                break;
                
            case 'updateNodeProperties':
                logMessage(vscode, `[main.ts] ========== updateNodeProperties handler START ==========`);
                logMessage(vscode, `  - Updates count: ${message.updates?.length || 0}`);
                logMessage(vscode, `  - Layer: ${message.layer || 'unknown'}`);
                logMessage(vscode, `  - cytoscapeCore exists: ${!!cytoscapeCore}`);
                logMessage(vscode, `  - cytoscapeCore.isReady(): ${cytoscapeCore?.isReady() || false}`);
                
                try {
                    if (cytoscapeCore && cytoscapeCore.isReady()) {
                        logMessage(vscode, '[main.ts] Calling cytoscapeCore.updateNodeProperties...');
                        cytoscapeCore.updateNodeProperties(message.updates || []);
                        logMessage(vscode, '[main.ts] ✓ updateNodeProperties call completed');
                    } else {
                        logMessage(vscode, '[main.ts] ⚠️  CytoscapeCore not ready, skipping property update');
                    }
                } catch (err) {
                    logMessage(vscode, `[main.ts] ❌ ERROR in updateNodeProperties handler: ${err}`);
                    if (err instanceof Error) {
                        logMessage(vscode, `  - Stack: ${err.stack}`);
                    }
                }
                logMessage(vscode, `[main.ts] ========== updateNodeProperties handler END ==========`);
                break;
                
            case 'updateEdgeProperties':
                logMessage(vscode, `[main.ts] ========== updateEdgeProperties handler START ==========`);
                logMessage(vscode, `  - Updates count: ${message.updates?.length || 0}`);
                logMessage(vscode, `  - Layer: ${message.layer || 'unknown'}`);
                logMessage(vscode, `  - cytoscapeCore exists: ${!!cytoscapeCore}`);
                logMessage(vscode, `  - cytoscapeCore.isReady(): ${cytoscapeCore?.isReady() || false}`);
                
                try {
                    if (cytoscapeCore && cytoscapeCore.isReady()) {
                        logMessage(vscode, '[main.ts] Calling cytoscapeCore.updateEdgeProperties...');
                        cytoscapeCore.updateEdgeProperties(message.updates || []);
                        logMessage(vscode, '[main.ts] ✓ updateEdgeProperties call completed');
                    } else {
                        logMessage(vscode, '[main.ts] ⚠️  CytoscapeCore not ready, skipping property update');
                    }
                } catch (err) {
                    logMessage(vscode, `[main.ts] ❌ ERROR in updateEdgeProperties handler: ${err}`);
                    if (err instanceof Error) {
                        logMessage(vscode, `  - Stack: ${err.stack}`);
                    }
                }
                logMessage(vscode, `[main.ts] ========== updateEdgeProperties handler END ==========`);
                break;
                
            case 'setLayout': {
                cytoscapeCore.setLayout(message.layout);
                break;
            }
            
            case 'focusOnNode': {
                const nodeId = message.nodeId;
                const options = message.options || {};
                if (nodeId && cytoscapeCore) {
                    const success = cytoscapeCore.focusOnNode(nodeId, options);
                    vscode.postMessage({ 
                        type: 'focusResult', 
                        success, 
                        nodeId 
                    });
                }
                break;
            }
            
            case 'searchNodes': {
                const query = message.query;
                const maxResults = message.maxResults || 20;
                if (query && cytoscapeCore) {
                    const results = cytoscapeCore.searchNodes(query, maxResults);
                    vscode.postMessage({ 
                        type: 'searchResults', 
                        results 
                    });
                }
                break;
            }
            
            case 'focusOnSearch': {
                const query = message.query;
                const options = message.options || {};
                if (query && cytoscapeCore) {
                    const success = cytoscapeCore.focusOnSearch(query, options);
                    vscode.postMessage({ 
                        type: 'focusResult', 
                        success, 
                        query 
                    });
                }
                break;
            }
            
            case 'addNode': {
                if (cytoscapeCore.isReady()) {
                    cytoscapeCore.addNode(message.nodeData);
                } else {
                    logMessage(vscode, '[main.ts] Not ready for addNode, ignoring');
                }
                break;
            }
            
            case 'removeNode': {
                if (cytoscapeCore.isReady()) {
                    cytoscapeCore.removeNode(message.nodeId);
                } else {
                    logMessage(vscode, '[main.ts] Not ready for removeNode, ignoring');
                }
                break;
            }
            
            case 'addNodesBatch': {
                if (cytoscapeCore.isReady()) {
                    cytoscapeCore.addNodesBatch(message.nodesData);
                } else {
                    logMessage(vscode, '[main.ts] Not ready for addNodesBatch, ignoring');
                }
                break;
            }
            
            case 'addEdge': {
                if (cytoscapeCore.isReady()) {
                    cytoscapeCore.addEdge(message.edgeData);
                } else {
                    logMessage(vscode, '[main.ts] Not ready for addEdge, ignoring');
                }
                break;
            }
        }
    });

    /**
     * Wait for Cytoscape library to load
     */
    function waitForCytoscape() {
        logMessage(vscode, `[main.ts] waitForCytoscape() called, cytoscape exists: ${typeof cytoscape !== 'undefined'}`);
        
        if (typeof cytoscape !== 'undefined') {
            logMessage(vscode, '[main.ts] ✓ Cytoscape library loaded, requesting config...');
            vscode.postMessage({ type: 'requestInit' });
            logMessage(vscode, '[main.ts] ✓ requestInit message sent');
        } else {
            logMessage(vscode, '[main.ts] Waiting for Cytoscape library...');
            setTimeout(waitForCytoscape, 100);
        }
    }

    /**
     * Initialize when DOM and libraries are ready
     */
    logMessage(vscode, `[main.ts] Script loaded, document.readyState: ${document.readyState}`);
    
    // Initialize the core first
    initialize();
    
    if (document.readyState === 'loading') {
        logMessage(vscode, '[main.ts] Waiting for DOMContentLoaded...');
        document.addEventListener('DOMContentLoaded', () => {
            logMessage(vscode, '[main.ts] DOM loaded, checking for Cytoscape...');
            waitForCytoscape();
        });
    } else {
        logMessage(vscode, '[main.ts] DOM already loaded, checking for Cytoscape...');
        waitForCytoscape();
    }
})();
